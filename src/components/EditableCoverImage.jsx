import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Camera } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { optimizeImageFile } from '@/lib/imageOptimize'
import { formatFileSize } from '@/lib/mediaCompression'
import { log } from '@/lib/logger'
import { normalizeImage, NormalizeImageError } from '@/services/imageNormalizeService'
import { runHeicFlow, revokePreviewUrlIfNeeded } from '@/lib/heicClientConvert'
import { resizeImageClient } from '@/lib/imageResizeClient'

const EditableCoverImage = ({
  initialCoverImage,
  coverSrc,
  onCoverImageChange,
  userName,
}) => {
  const [coverPreview, setCoverPreview] = useState(initialCoverImage)
  const [isSaving, setIsSaving] = useState(false)
  const [isConvertingHeic, setIsConvertingHeic] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [coverOptimizeNote, setCoverOptimizeNote] = useState('')

  const fileInputRef = useRef(null)
  const coverSelectOpIdRef = useRef(0)

  const { toast } = useToast()
  const { user, updateUser } = useAuth()

  const isStorageRef =
    typeof coverPreview === 'string' && coverPreview.trim().startsWith('storage://')

  const effectiveSrc = isStorageRef ? coverSrc : coverPreview
  const showLoading = !!coverPreview && isStorageRef && !coverSrc

  useEffect(() => {
    setHasError(false)
  }, [effectiveSrc])

  useEffect(() => {
    return () => {
      revokePreviewUrlIfNeeded(coverPreview)
    }
  }, [coverPreview])

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]

    const resetInput = () => {
      try {
        if (fileInputRef.current) fileInputRef.current.value = ''
        else event.target.value = ''
      } catch {
        // ignore
      }
    }

    if (!file) {
      resetInput()
      return
    }

    setHasError(false)
    setCoverOptimizeNote('')

    if (!user?.id) {
      toast({
        title: 'Login necessário',
        description: 'Faça login para trocar a imagem de capa.',
        variant: 'destructive',
      })
      resetInput()
      return
    }

    // Extreme-only block.
    const MAX_IMAGE_INPUT_BYTES = 30 * 1024 * 1024
    if (file.size > MAX_IMAGE_INPUT_BYTES) {
      toast({
        title: 'Arquivo muito grande',
        description: 'Envie uma imagem de até 30MB para otimização automática.',
        variant: 'destructive',
      })
      resetInput()
      return
    }

    // Guard the whole pipeline (resize + HEIC flow) against rapid re-selections.
    const pipelineOpId = (Number(coverSelectOpIdRef.current) || 0) + 1
    coverSelectOpIdRef.current = pipelineOpId

    let resizedFile = file
    try {
      resizedFile = await resizeImageClient(file, { maxDimension: 2048 })
    } catch {
      // Best-effort: if resize fails, continue with the original file.
      resizedFile = file
    }

    if (coverSelectOpIdRef.current !== pipelineOpId) {
      resetInput()
      return
    }

    // HEIC client-first flow (preview immediately + background convert when possible).
    let inputFile = resizedFile
    try {
      const heicResult = await runHeicFlow(resizedFile, {
        opIdRef: coverSelectOpIdRef,
        previousPreviewUrl: coverPreview || '',
        setPreviewUrl: (url) => setCoverPreview(url || null),
        setIsConverting: setIsConvertingHeic,
      })

      // If user selected another file while converting, ignore.
      if (!heicResult) {
        resetInput()
        return
      }

      inputFile = heicResult.file
    } catch {
      toast({
        title: 'Formato não suportado',
        description: 'Não foi possível converter HEIC neste dispositivo. Tente JPG/PNG/WEBP.',
        variant: 'destructive',
      })
      resetInput()
      return
    }

    let fileToUse = inputFile
    try {
      const { file: optimizedFile, meta } = await optimizeImageFile(inputFile, { kind: 'photo' })
      if (optimizedFile?.size && optimizedFile.size > 0) {
        fileToUse = optimizedFile
        setCoverOptimizeNote(
          `Imagem otimizada: ${formatFileSize(meta.originalSize)} → ${formatFileSize(meta.newSize)}`
        )
      }
    } catch (err) {
      const isUnsupportedClient =
        err?.code === 'IMAGE_TYPE_NOT_ALLOWED' || err?.code === 'GIF_NOT_SUPPORTED'

      const errMsg = String(err?.message || '')
      const isCanvasOrDecode = /canvas|carregar imagem|toBlob|dimens(\u00f5|o)es/i.test(errMsg)

      if (isUnsupportedClient || isCanvasOrDecode) {
        setCoverOptimizeNote('Convertendo no servidor…')
        setIsSaving(true)
        try {
          const normalized = await normalizeImage({
            file: inputFile,
            context: 'profile_cover',
            target: 'webp',
          })
          const url = normalized?.result?.url
          if (!url || !String(url).startsWith('storage://')) {
            throw new Error('Resposta inválida do servidor ao normalizar imagem.')
          }

          const storageRef = String(url)

          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              cover_image: storageRef,
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id)

          if (updateError) throw updateError

          await updateUser?.({ coverImage: storageRef })
          onCoverImageChange?.(storageRef)

          setCoverPreview(storageRef)
          setCoverOptimizeNote('Imagem convertida no servidor')

          toast({
            title: 'Imagem de capa atualizada!',
            description: 'Sua imagem de capa foi salva com sucesso.',
            variant: 'success',
          })

          resetInput()
          return
        } catch (e) {
          const status = e instanceof NormalizeImageError ? e.status : 0
          const msg =
            status === 415
              ? 'Esse formato não pode ser convertido no servidor no momento. Tente JPG/PNG/WEBP.'
              : e?.message || 'Não foi possível converter a imagem no servidor.'

          toast({
            title: 'Formato não suportado',
            description: msg,
            variant: 'destructive',
          })

          setCoverOptimizeNote('')
          resetInput()
          return
        } finally {
          setIsSaving(false)
        }
      }

      try {
        if (import.meta.env.DEV) log.warn('UPLOAD', 'cover_image_optimize_failed', err)
      } catch {
        // ignore
      }

      toast({
        title: 'Aviso',
        description: 'Não foi possível otimizar a imagem. Enviando o arquivo original.',
        variant: 'default',
      })
    }

    setIsSaving(true)
    try {
      const fileExt = (fileToUse.name.split('.').pop() || 'jpg')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
      const fileName = `covers/${user.id}-${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, fileToUse, {
          upsert: true,
          contentType: fileToUse?.type || undefined,
        })
      if (uploadError) throw uploadError

      const storageRef = `storage://profile-photos/${fileName}`

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          cover_image: storageRef,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (updateError) throw updateError

      await updateUser?.({ coverImage: storageRef })
      onCoverImageChange?.(storageRef)

      toast({
        title: 'Imagem de capa atualizada!',
        description: 'Sua imagem de capa foi salva com sucesso.',
        variant: 'success',
      })
    } catch (err) {
      log.error('PROFILE', 'Erro ao salvar imagem de capa:', err)
      toast({
        title: 'Erro ao salvar capa',
        description: err?.message || 'Não foi possível salvar a imagem de capa. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
      resetInput()
    }
  }

  const handleEditClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="w-full h-full relative group">
      {effectiveSrc && !hasError ? (
        <img
          src={effectiveSrc}
          alt={`Imagem de capa do perfil de ${userName}`}
          className="w-full h-full object-cover mix-blend-overlay opacity-80 group-hover:opacity-60 transition-opacity"
          loading="eager"
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20" />
      )}

      {showLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <span className="text-xs text-white/90">Carregando imagem…</span>
        </div>
      )}

      {isConvertingHeic && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <span className="text-xs text-white/90">Convertendo HEIC…</span>
        </div>
      )}

      {coverOptimizeNote ? (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-black/40 text-white text-[11px]">
          {coverOptimizeNote}
        </div>
      ) : null}

      <Button
        variant="outline"
        size="sm"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 gap-1.5 bg-black/30 hover:bg-black/50 border-none text-white"
        onClick={handleEditClick}
        disabled={isSaving || isConvertingHeic}
      >
        <Camera size={16} />
        <span className="text-xs">{isSaving ? 'Salvando...' : 'Trocar Capa'}</span>
      </Button>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
    </div>
  )
}

export default EditableCoverImage
