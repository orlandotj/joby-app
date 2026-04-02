import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Camera } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { optimizeImageFile } from '@/lib/imageOptimize'
import { resizeImageClient } from '@/lib/imageResizeClient'
import { log } from '@/lib/logger'
import { createObjectUrlPreview, revokeObjectUrlIfNeeded } from '@/lib/filePreviewUrl'
import { normalizeImage, NormalizeImageError } from '@/services/imageNormalizeService'
import { getHeic2Any } from '@/lib/heicClientConvert'

const HEIC_PREVIEW_SUPPORT_KEY = 'joby.heic_preview_supported'

const getCachedHeicPreviewSupport = () => {
  try {
    const raw = localStorage.getItem(HEIC_PREVIEW_SUPPORT_KEY)
    if (raw === '1') return true
    if (raw === '0') return false
    return null
  } catch {
    return null
  }
}

const setCachedHeicPreviewSupport = (value) => {
  try {
    localStorage.setItem(HEIC_PREVIEW_SUPPORT_KEY, value ? '1' : '0')
  } catch {
    // ignore
  }
}

const probeHeicPreviewSupport = async (file) => {
  // Best-effort: try decoding without relying on <img> rendering.
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file)
      try {
        bmp?.close?.()
      } catch {
        // ignore
      }
      return true
    } catch {
      // ignore
    }
  }

  // Fallback to an <img> probe.
  const url = URL.createObjectURL(file)
  try {
    await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(true)
      img.onerror = () => reject(new Error('IMG_DECODE_FAILED'))
      img.src = url
    })
    return true
  } catch {
    return false
  } finally {
    URL.revokeObjectURL(url)
  }
}

const isHeicLikeFile = (file) => {
  const type = String(file?.type || '').toLowerCase().trim()
  if (
    type === 'image/heic' ||
    type === 'image/heif' ||
    type === 'image/heic-sequence' ||
    type === 'image/heif-sequence'
  ) {
    return true
  }

  const name = String(file?.name || '').toLowerCase()
  return name.endsWith('.heic') || name.endsWith('.heif')
}

const convertHeicToJpegFile = async (file) => {
  const heic2any = await getHeic2Any()
  const blobOrBlobs = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.92,
  })

  const blob = Array.isArray(blobOrBlobs) ? blobOrBlobs?.[0] : blobOrBlobs
  if (!blob || !(blob instanceof Blob) || !blob.size) {
    throw new Error('Falha ao converter HEIC para JPEG.')
  }

  const baseName = String(file?.name || 'image').replace(/\.[^/.]+$/, '')
  const outName = `${baseName || 'image'}-converted.jpg`
  return new File([blob], outName, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

const EditableAvatar = ({ initialAvatar, avatarSrc, onAvatarChange, userName }) => {
  const [avatarPreview, setAvatarPreview] = useState(initialAvatar)
  const [isSaving, setIsSaving] = useState(false)
  const [isConvertingHeic, setIsConvertingHeic] = useState(false)
  const [hasError, setHasError] = useState(false)
  const fileInputRef = useRef(null)
  const opIdRef = useRef(0)
  const lastPickedWasHeicRef = useRef(false)
  const { toast } = useToast()
  const { user, updateUser } = useAuth()

  const isStorageRef = useMemo(
    () => typeof avatarPreview === 'string' && avatarPreview.trim().startsWith('storage://'),
    [avatarPreview]
  )

  const effectiveSrc = useMemo(() => {
    if (isStorageRef) return avatarSrc
    return avatarPreview || avatarSrc
  }, [avatarPreview, avatarSrc, isStorageRef])

  const showLoading = !!avatarPreview && isStorageRef && !avatarSrc

  useEffect(() => {
    setHasError(false)
  }, [effectiveSrc])

  useEffect(() => {
    return () => {
      revokeObjectUrlIfNeeded(avatarPreview)
    }
  }, [avatarPreview])

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    const opId = ++opIdRef.current

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

    // Block empty file.
    if (!file.size || file.size <= 0) {
      toast({
        title: 'Arquivo inválido',
        description: 'O arquivo selecionado está vazio. Escolha outra imagem.',
        variant: 'destructive',
      })
      resetInput()
      return
    }

    // Block very large before doing anything else.
    const MAX_AVATAR_INPUT_BYTES = 10 * 1024 * 1024
    if (file.size > MAX_AVATAR_INPUT_BYTES) {
      toast({
        title: 'Arquivo muito grande!',
        description: 'Escolha uma imagem menor que 10MB. O JOBY otimiza automaticamente.',
        variant: 'destructive',
      })
      resetInput()
      return
    }

    // If the browser provides a MIME type and it's not an image, block early.
    const mime = String(file.type || '').toLowerCase()
    if (mime && !mime.startsWith('image/')) {
      toast({
        title: 'Tipo de arquivo inválido!',
        description: 'Por favor, escolha um arquivo de imagem.',
        variant: 'destructive',
      })
      resetInput()
      return
    }

    if (!user?.id) {
      toast({
        title: 'Login necessário',
        description: 'Faça login para trocar sua foto de perfil.',
        variant: 'destructive',
      })
      resetInput()
      return
    }

    const pickedIsHeic = isHeicLikeFile(file)
    lastPickedWasHeicRef.current = pickedIsHeic

    // Resize BEFORE HEIC flow and BEFORE optimize.
    // Best-effort: if resize fails (unsupported decode/canvas), continue with original file.
    let pickedFile = file
    try {
      pickedFile = await resizeImageClient(file, { maxDimension: 512 })
    } catch {
      pickedFile = file
    }

    // If user picked another file while resizing, stop.
    if (opIdRef.current !== opId) return

    const isHeic = isHeicLikeFile(pickedFile)

    // Preview ASAP as soon as the file is picked.
    // If we already know HEIC preview is not supported on this device, convert first.
    let inputFile = pickedFile
    let currentPreviewUrl = ''

    const cachedHeicPreviewSupport = isHeic ? getCachedHeicPreviewSupport() : null
    let effectiveHeicPreviewSupport = cachedHeicPreviewSupport
    let heicProbePromise = null

    // If support is unknown, run a fast probe first. If it quickly signals "unsupported",
    // convert BEFORE showing preview to avoid a broken image.
    if (isHeic && effectiveHeicPreviewSupport === null) {
      heicProbePromise = probeHeicPreviewSupport(pickedFile)

      try {
        const probeOrTimeout = await Promise.race([
          heicProbePromise,
          new Promise((resolve) => setTimeout(() => resolve('timeout'), 120)),
        ])

        if (probeOrTimeout === true || probeOrTimeout === false) {
          effectiveHeicPreviewSupport = probeOrTimeout
          setCachedHeicPreviewSupport(probeOrTimeout)
        }
      } catch {
        // ignore
      }

      if (opIdRef.current !== opId) return

      // If probe timed out, still cache the eventual result for future picks.
      if (effectiveHeicPreviewSupport === null && heicProbePromise) {
        heicProbePromise
          .then((supported) => setCachedHeicPreviewSupport(!!supported))
          .catch(() => {})
      }
    }

    if (isHeic && effectiveHeicPreviewSupport === false) {
      setIsConvertingHeic(true)
      try {
        inputFile = await convertHeicToJpegFile(pickedFile)

        // Show preview as soon as we have a renderable JPEG.
        try {
          currentPreviewUrl = createObjectUrlPreview(inputFile, avatarPreview)
          if (currentPreviewUrl) setAvatarPreview(currentPreviewUrl)
        } catch {
          currentPreviewUrl = ''
        }
      } catch {
        toast({
          title: 'Formato não suportado',
          description: 'Não foi possível converter HEIC neste dispositivo. Tente JPG/PNG/WEBP.',
          variant: 'destructive',
        })
        resetInput()
        return
      } finally {
        if (opIdRef.current === opId) setIsConvertingHeic(false)
      }
    } else {
      try {
        currentPreviewUrl = createObjectUrlPreview(pickedFile, avatarPreview)
        if (currentPreviewUrl) setAvatarPreview(currentPreviewUrl)
      } catch {
        currentPreviewUrl = ''
      }

      // If it's HEIC, convert in background (overlay) and then swap preview to converted JPEG.
      if (isHeic) {
        setIsConvertingHeic(true)

        try {
          inputFile = await convertHeicToJpegFile(pickedFile)
        } catch {
          toast({
            title: 'Formato não suportado',
            description: 'Não foi possível converter HEIC neste dispositivo. Tente JPG/PNG/WEBP.',
            variant: 'destructive',
          })
          resetInput()
          return
        } finally {
          if (opIdRef.current === opId) setIsConvertingHeic(false)
        }

        // If user picked another file while converting, stop.
        if (opIdRef.current !== opId) return

        // Swap preview to converted JPEG.
        try {
          const convertedPreviewUrl = createObjectUrlPreview(inputFile, currentPreviewUrl || avatarPreview)
          if (convertedPreviewUrl) {
            currentPreviewUrl = convertedPreviewUrl
            setAvatarPreview(convertedPreviewUrl)
          }
        } catch {
          // ignore
        }
      }
    }

    // If user picked another file while we were doing async work, stop.
    if (opIdRef.current !== opId) return

    let fileToUse = inputFile

    try {
      const { file: optimizedFile } = await optimizeImageFile(inputFile, { kind: 'avatar' })
      if (optimizedFile?.size && optimizedFile.size > 0) {
        fileToUse = optimizedFile
        // Update preview to optimized output (revoke previous blob preview).
        try {
          const optimizedPreviewUrl = createObjectUrlPreview(optimizedFile, currentPreviewUrl || avatarPreview)
          if (optimizedPreviewUrl) setAvatarPreview(optimizedPreviewUrl)
        } catch {
          // ignore
        }
      }
    } catch (err) {
      // If client-side optimization fails (unsupported type/GIF/decode/canvas), try server normalize.
      setIsSaving(true)
      try {
        const normalized = await normalizeImage({
          file: inputFile,
          context: 'profile_avatar',
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
            avatar: storageRef,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id)

        if (updateError) throw updateError

        await updateUser?.({ avatar: storageRef })
        onAvatarChange?.(storageRef)

        // Switch to storage ref so parent resolves a final URL.
        setAvatarPreview(storageRef)

        resetInput()
        return
      } catch (e) {
        const status = e instanceof NormalizeImageError ? e.status : 0
        const msg =
          status === 415
            ? 'Esse formato não pode ser convertido no servidor no momento. Tente JPG/PNG/WEBP.'
            : e?.message || 'Não foi possível converter a imagem no servidor.'

        try {
          if (import.meta.env.DEV) log.warn('UPLOAD', 'avatar_optimize_and_normalize_failed', { err, normalizeError: e })
        } catch {
          // ignore
        }

        toast({
          title: 'Formato não suportado',
          description: msg,
          variant: 'destructive',
        })

        resetInput()
        return
      } finally {
        setIsSaving(false)
      }
    }

    // Upload optimized (or original) file to Storage and persist on profiles.
    setIsSaving(true)
    try {
      const fileExt = (fileToUse.name.split('.').pop() || 'jpg')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
      const fileName = `avatars/${user.id}-${Date.now()}.${fileExt}`

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
          avatar: storageRef,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
      if (updateError) throw updateError

      await updateUser?.({ avatar: storageRef })
      onAvatarChange?.(storageRef)

      setAvatarPreview(storageRef)
    } catch (err) {
      log.error('PROFILE', 'Erro ao salvar avatar:', err)
      toast({
        title: 'Erro ao salvar foto',
        description: err?.message || 'Não foi possível salvar agora. Tente novamente.',
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
    <div className="relative group h-20 w-20 sm:h-24 sm:w-24">
      <div className="h-full w-full rounded-full border-4 border-background shadow-md overflow-hidden bg-primary flex items-center justify-center">
        {effectiveSrc && !hasError ? (
          <img
            src={effectiveSrc}
            alt={userName}
            className="h-full w-full object-cover"
            loading="eager"
            referrerPolicy="no-referrer"
            onError={() => {
              setHasError(true)
              // If a freshly-picked HEIC fails to render, mark preview unsupported so next time we convert before preview.
              if (lastPickedWasHeicRef.current && typeof effectiveSrc === 'string' && effectiveSrc.startsWith('blob:')) {
                setCachedHeicPreviewSupport(false)
              }
            }}
          />
        ) : (
          <span className="text-2xl font-bold text-primary-foreground">
            {userName?.charAt(0)?.toUpperCase() || 'U'}
          </span>
        )}

        {showLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="text-[11px] text-white/90">Carregando…</span>
          </div>
        )}

        {isConvertingHeic && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <span className="text-[11px] text-white/90">Convertendo HEIC…</span>
          </div>
        )}
      </div>
      <Button
        variant="outline"
        size="icon"
        className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-card text-card-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200 border-2 border-background hover:bg-accent"
        onClick={handleEditClick}
        disabled={isSaving || isConvertingHeic}
      >
        <Camera size={16} />
        <span className="sr-only">Editar foto de perfil</span>
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

export default EditableAvatar
