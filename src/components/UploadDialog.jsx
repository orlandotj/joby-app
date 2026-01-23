import React, { useState, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  UploadCloud,
  Image as ImageIcon,
  Video as VideoIcon,
  Loader2,
  FileCheck,
} from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabaseClient'
import { compressImage, formatFileSize } from '@/lib/mediaCompression'
import { uploadVideoToCloudflare } from '@/services/cloudflareService'

const UploadDialog = ({ isOpen, setIsOpen, uploadType, onUploadComplete }) => {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const fileInputRef = useRef(null)
  const { toast } = useToast()

  const resetForm = useCallback(() => {
    setFile(null)
    setPreview(null)
    setTitle('')
    setDescription('')
    setTags('')
    setUploadProgress(0)
    setUploadSuccess(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleClose = () => {
    if (isUploading) return
    resetForm()
    setIsOpen(false)
  }

  const getAcceptedFileTypes = () => {
    if (uploadType === 'photo') return 'image/jpeg, image/png, image/gif'
    if (uploadType === 'short-video' || uploadType === 'long-video')
      return 'video/mp4, video/quicktime, video/x-msvideo, video/x-flv, video/webm'
    return ''
  }

  const getMaxSize = () => {
    if (uploadType === 'photo') return 5 * 1024 * 1024
    if (uploadType === 'short-video') return 50 * 1024 * 1024
    if (uploadType === 'long-video') return 200 * 1024 * 1024
    return 0
  }

  const checkVideoDuration = (file) => {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'

      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src)
        resolve(Math.round(video.duration))
      }

      video.onerror = () => {
        resolve(null)
      }

      video.src = URL.createObjectURL(file)
    })
  }

  const handleFileChange = async (event) => {
    const selectedFile = event.target.files[0]
    if (!selectedFile) return

    const maxSize = getMaxSize()

    if (selectedFile.size > maxSize) {
      toast({
        title: 'Arquivo muito grande!',
        description: `O tamanho máximo para ${
          uploadType === 'photo'
            ? 'fotos é 5MB'
            : uploadType === 'short-video'
            ? 'vídeos curtos é 50MB'
            : 'vídeos longos é 200MB'
        }.`,
        variant: 'destructive',
      })
      return
    }

    // Comprimir imagem se for foto
    let fileToUse = selectedFile
    if (uploadType === 'photo') {
      try {
        const originalSize = formatFileSize(selectedFile.size)
        toast({
          title: 'Comprimindo imagem...',
          description: `Tamanho original: ${originalSize}`,
        })

        fileToUse = await compressImage(selectedFile, {
          maxWidth: 1920,
          maxHeight: 1920,
          quality: 0.85,
          maxSizeMB: 2,
        })

        const compressedSize = formatFileSize(fileToUse.size)
        const savedPercent = Math.round(
          (1 - fileToUse.size / selectedFile.size) * 100
        )

        if (savedPercent > 10) {
          toast({
            title: 'Imagem comprimida!',
            description: `${originalSize} → ${compressedSize} (economizou ${savedPercent}%)`,
          })
        }
      } catch (error) {
        console.error('Erro ao comprimir:', error)
        toast({
          title: 'Aviso',
          description: 'Não foi possível comprimir a imagem, usando original',
          variant: 'default',
        })
      }
    }

    // Sugestão de duração para vídeo (não bloqueia)
    if (uploadType === 'short-video' || uploadType === 'long-video') {
      const duration = await checkVideoDuration(selectedFile)
      if (duration) {
        const minutes = Math.floor(duration / 60)
        const seconds = duration % 60
        const durationText =
          minutes > 0 ? `${minutes}min ${seconds}s` : `${seconds}s`

        if (uploadType === 'short-video') {
          if (duration <= 60) {
            toast({
              title: '✅ Perfeito para Shorts!',
              description: `Duração: ${durationText}`,
            })
          } else {
            toast({
              title: '💡 Dica',
              description: `Vídeo com ${durationText}. Recomendamos até 60s para Shorts, mas você pode continuar.`,
              variant: 'default',
            })
          }
        } else {
          if (duration > 60) {
            toast({
              title: '✅ Formato Ideal!',
              description: `Duração: ${durationText}`,
            })
          } else {
            toast({
              title: '💡 Dica',
              description: `Vídeo com ${durationText}. Para vídeos curtos, considere usar "Vídeo Curto" para melhor alcance.`,
              variant: 'default',
            })
          }
        }
      }
    }

    setFile(fileToUse)
    const reader = new FileReader()
    reader.onloadend = () => setPreview(reader.result)
    reader.readAsDataURL(fileToUse)
  }

  const handleSubmit = async () => {
    if (!file) {
      toast({
        title: 'Nenhum arquivo selecionado!',
        description: 'Por favor, escolha um arquivo para enviar.',
        variant: 'destructive',
      })
      return
    }

    if (!title.trim()) {
      toast({
        title: 'Título obrigatório!',
        description: 'Por favor, adicione um título.',
        variant: 'destructive',
      })
      return
    }

    setIsUploading(true)
    setUploadProgress(10)

    try {
      console.log('Iniciando upload...', { uploadType, fileSize: file.size })

      const {
        data: { user },
      } = await supabase.auth.getUser()

      console.log('Usuário obtido:', user?.id)

      if (!user) throw new Error('Usuário não autenticado')

      setUploadProgress(25)

      const isPhoto = uploadType === 'photo'

      // =========================
      // FOTOS (Supabase Storage)
      // =========================
      if (isPhoto) {
        const bucket = 'photos'
        const fileExt = file.name.split('.').pop()
        const fileName = `${user.id}/${Date.now()}.${fileExt}`

        setUploadProgress(40)

        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) {
          console.error('Erro no upload:', uploadError)
          throw new Error(`Erro no upload: ${uploadError.message}`)
        }

        setUploadProgress(70)

        const storageRef = `storage://${bucket}/${fileName}`

        setUploadProgress(85)

        const { data: insertData, error: insertError } = await supabase
          .from('photos')
          .insert([
            {
              user_id: user.id,
              caption: title.trim(),
              url: storageRef,
              is_public: true,
            },
          ])
          .select()
          .single()

        if (insertError) {
          console.error('Erro ao inserir no banco:', insertError)
          throw new Error(
            `Erro ao salvar: ${
              insertError.message || insertError.hint || 'Erro desconhecido'
            }`
          )
        }

        setUploadProgress(100)
        setIsUploading(false)
        setUploadSuccess(true)

        toast({
          title: 'Upload Concluído!',
          description: `${title} foi enviado com sucesso.`,
        })

        onUploadComplete?.({
          ...insertData,
          type: uploadType,
          url: storageRef,
          title,
          description,
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        })

        setTimeout(handleClose, 1500)
        return
      }

      // =========================
      // VÍDEOS (Cloudflare Worker + R2)
      // =========================
      setUploadProgress(30)
      console.log('Iniciando upload de vídeo para Cloudflare R2...')

      const result = await uploadVideoToCloudflare({
        videoFile: file,
        userId: user.id,
        title: title.trim(),
        description: description.trim() || '',
        videoType: uploadType === 'short-video' ? 'short' : 'long',
        onProgress: (percent) => {
          const mappedProgress = 30 + percent * 0.6 // 30% -> 90%
          setUploadProgress(Math.round(mappedProgress))
        },
      })

      console.log('Upload concluído:', result)

      // ✅ aceitar os dois formatos: {ok:true} ou {success:true}
      const isOk = result?.ok === true || result?.success === true
      if (!isOk) {
        throw new Error(result?.error || result?.message || 'Erro ao fazer upload do vídeo')
      }

      setUploadProgress(95)

      // Worker já inseriu no Supabase — pegar o row retornado
      const insertedRow = Array.isArray(result?.inserted) ? result.inserted[0] : null

      // URL que vamos salvar/usar no app para vídeos:
      // ✅ NUNCA storage:// para vídeo
      // ✅ Melhor: r2Key (o player resolve via Worker)
      const videoUrlKey = result?.r2Key || insertedRow?.url || ''

      setUploadProgress(100)
      setIsUploading(false)
      setUploadSuccess(true)

      toast({
        title: 'Upload Concluído!',
        description: `${title} foi enviado com sucesso.`,
      })

      onUploadComplete?.({
        ...(insertedRow || {}),
        type: uploadType,
        // 👇 isso é o que deve ir pra tabela / UI
        url: videoUrlKey,
        provider: insertedRow?.provider || 'cloudflare_r2',
        // opcional: útil pro debug/preview local
        playbackUrl: result?.playbackUrl || insertedRow?.playback_url || null,
        title,
        description,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      })

      setTimeout(handleClose, 1500)
    } catch (error) {
      console.error('Erro no upload:', error)
      setIsUploading(false)
      setUploadProgress(0)
      toast({
        title: 'Erro no upload',
        description: error.message || 'Não foi possível fazer o upload. Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  const dialogTitle =
    uploadType === 'photo'
      ? 'Postar Nova Foto'
      : uploadType === 'short-video'
      ? 'Postar Vídeo Curto'
      : 'Postar Vídeo Longo'

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            Compartilhe seu trabalho com a comunidade. Preencha os detalhes abaixo.
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {uploadSuccess ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center py-10 text-center"
            >
              <FileCheck className="h-16 w-16 text-green-500 mb-4" />
              <h3 className="text-xl font-semibold text-foreground">
                Upload Concluído!
              </h3>
              <p className="text-muted-foreground mt-1">{title} foi enviado.</p>
              <Button onClick={handleClose} className="mt-6">
                Fechar
              </Button>
            </motion.div>
          ) : isUploading ? (
            <motion.div
              key="uploading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center py-10 text-center"
            >
              <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
              <h3 className="text-xl font-semibold text-foreground">Enviando...</h3>
              <p className="text-muted-foreground mt-1">{uploadProgress}%</p>
              <div className="w-full bg-muted rounded-full h-2.5 mt-3">
                <motion.div
                  className="bg-primary h-2.5 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="grid gap-4 py-4">
                {!preview && (
                  <div
                    className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed border-muted-foreground/50 rounded-md cursor-pointer hover:border-primary transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="space-y-1 text-center">
                      {uploadType === 'photo' ? (
                        <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                      ) : (
                        <VideoIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                      )}
                      <div className="flex text-sm text-muted-foreground">
                        <Label
                          htmlFor="file-upload"
                          className="relative cursor-pointer rounded-md font-medium text-primary hover:text-primary/80 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
                        >
                          <span>Clique para enviar</span>
                        </Label>
                        <p className="pl-1">ou arraste e solte</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {uploadType === 'photo'
                          ? 'PNG, JPG, GIF até 5MB'
                          : 'MP4, MOV, etc. até ' +
                            (uploadType === 'short-video' ? '50MB' : '200MB')}
                      </p>
                    </div>
                    <Input
                      id="file-upload"
                      name="file-upload"
                      type="file"
                      className="sr-only"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept={getAcceptedFileTypes()}
                    />
                  </div>
                )}

                {preview && (
                  <div className="mt-2 text-center">
                    {uploadType === 'photo' ? (
                      <img
                        src={preview}
                        alt="Prévia da foto"
                        className="max-h-48 w-auto mx-auto rounded-md border shadow-sm"
                      />
                    ) : (
                      <video
                        src={preview}
                        controls
                        className="max-h-48 w-auto mx-auto rounded-md border shadow-sm"
                      >
                        <source src={preview} type={file?.type} />
                        Seu navegador não suporta a tag de vídeo.
                      </video>
                    )}
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => {
                        setPreview(null)
                        setFile(null)
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                      className="mt-2 text-destructive"
                    >
                      Remover arquivo
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="title" className="text-right">
                    Título
                  </Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="col-span-3"
                    placeholder="Ex: Pintura de Fachada Moderna"
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="description" className="text-right">
                    Descrição
                  </Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="col-span-3"
                    placeholder="Detalhes do serviço, técnicas usadas, etc. (opcional)"
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="tags" className="text-right">
                    Tags
                  </Label>
                  <Input
                    id="tags"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="col-span-3"
                    placeholder="Ex: #pintura, #reforma, #eletricista (separadas por vírgula)"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleClose}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={!file || !title.trim()}>
                  <UploadCloud size={16} className="mr-2" />
                  Postar
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}

export default UploadDialog
