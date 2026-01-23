import React, { useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Camera } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'

const EditableCoverImage = ({
  initialCoverImage,
  coverSrc,
  onCoverImageChange,
  userName,
}) => {
  const [coverPreview, setCoverPreview] = useState(initialCoverImage)
  const [isSaving, setIsSaving] = useState(false)
  const [hasError, setHasError] = useState(false)
  const fileInputRef = useRef(null)
  const { toast } = useToast()
  const { user, updateUser } = useAuth()

  const isStorageRef =
    typeof coverPreview === 'string' && coverPreview.trim().startsWith('storage://')

  const effectiveSrc = isStorageRef ? coverSrc : coverPreview
  const showLoading = !!coverPreview && isStorageRef && !coverSrc

  useEffect(() => {
    setHasError(false)
  }, [effectiveSrc])

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setHasError(false)

    if (!user?.id) {
      toast({
        title: 'Login necessário',
        description: 'Faça login para trocar a imagem de capa.',
        variant: 'destructive',
      })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
        // Max 5MB
        toast({
          title: 'Arquivo muito grande!',
          description: 'Por favor, escolha uma imagem menor que 5MB.',
          variant: 'destructive',
        })
        return
    }

    if (!file.type.startsWith('image/')) {
        toast({
          title: 'Tipo de arquivo inválido!',
          description:
            'Por favor, escolha um arquivo de imagem (JPEG, PNG, GIF).',
          variant: 'destructive',
        })
        return
    }

    // Preview imediato
    const reader = new FileReader()
    reader.onloadend = () => {
      setCoverPreview(reader.result)
    }
    reader.readAsDataURL(file)

    // Persistir (Storage + profiles)
    setIsSaving(true)
    try {
      const fileExt = (file.name.split('.').pop() || 'jpg')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
      const fileName = `covers/${user.id}-${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(fileName, file, { upsert: true })
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

      // Atualizar estado global/localStorage
      await updateUser?.({ coverImage: storageRef })

      onCoverImageChange?.(storageRef)

      toast({
        title: 'Imagem de capa atualizada!',
        description: 'Sua imagem de capa foi salva com sucesso.',
        variant: 'success',
      })
    } catch (err) {
      console.error('Erro ao salvar imagem de capa:', err)
      toast({
        title: 'Erro ao salvar capa',
        description:
          err?.message ||
          'Não foi possível salvar a imagem de capa. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
      // Permite selecionar o mesmo arquivo novamente
      if (fileInputRef.current) fileInputRef.current.value = ''
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
      <Button
        variant="outline"
        size="sm"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 gap-1.5 bg-black/30 hover:bg-black/50 border-none text-white"
        onClick={handleEditClick}
        disabled={isSaving}
      >
        <Camera size={16} />
        <span className="text-xs">{isSaving ? 'Salvando...' : 'Trocar Capa'}</span>
      </Button>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/png, image/jpeg, image/gif"
        className="hidden"
      />
    </div>
  )
}

export default EditableCoverImage
