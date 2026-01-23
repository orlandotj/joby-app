import React, { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Camera } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

const EditableAvatar = ({ initialAvatar, avatarSrc, onAvatarChange, userName }) => {
  const [avatarPreview, setAvatarPreview] = useState(initialAvatar)
  const fileInputRef = useRef(null)
  const { toast } = useToast()

  const handleFileChange = (event) => {
    const file = event.target.files[0]
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        // Max 2MB
        toast({
          title: 'Arquivo muito grande!',
          description: 'Por favor, escolha uma imagem menor que 2MB.',
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

      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result)
        onAvatarChange(reader.result) // Pass base64 to parent, or upload and pass URL
      }
      reader.readAsDataURL(file)
    }
  }

  const handleEditClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="relative group h-20 w-20 sm:h-24 sm:w-24">
      <div className="h-full w-full rounded-full border-4 border-background shadow-md overflow-hidden bg-primary flex items-center justify-center">
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={userName}
            className="h-full w-full object-cover"
            loading="eager"
          />
        ) : (
          <span className="text-2xl font-bold text-primary-foreground">
            {userName?.charAt(0)?.toUpperCase() || 'U'}
          </span>
        )}
      </div>
      <Button
        variant="outline"
        size="icon"
        className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-card text-card-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200 border-2 border-background hover:bg-accent"
        onClick={handleEditClick}
      >
        <Camera size={16} />
        <span className="sr-only">Editar foto de perfil</span>
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

export default EditableAvatar
