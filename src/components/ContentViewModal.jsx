import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import {
  ThumbsUp,
  MessageCircle,
  Share2,
  Eye,
  Send,
  Play,
  Pause,
  Volume2,
  VolumeX,
  ArrowLeft,
  Maximize,
  MoreVertical,
  Trash2,
  Edit,
  Flag,
  Download,
  Video as VideoIcon,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/use-toast'
import { Link } from 'react-router-dom'
import { CommentsSheet } from '@/components/comments/CommentsSheet'
import {
  likeVideo,
  unlikeVideo,
  likePhoto,
  unlikePhoto,
  checkVideoLike,
  checkPhotoLike,
  getVideoLikesCount,
  getPhotoLikesCount,
} from '@/services/commentService'
import { incrementVideoView, incrementPhotoView } from '@/services/viewService'
import { asInt, formatCompactNumber } from '@/lib/numberFormat'

const ContentViewModal = ({ isOpen, onClose, content, user, onDelete, onEdit }) => {
  // Passar provider para resolver URL corretamente (R2 ou Supabase)
  const contentSrc = useResolvedStorageUrl(content?.url, { 
    provider: content?.provider 
  })
  const userAvatarSrc = useResolvedStorageUrl(user?.avatar || '')
  const { user: currentUser } = useAuth()
  const currentUserAvatarSrc = useResolvedStorageUrl(currentUser?.avatar || '')
  const { toast } = useToast()
  const videoRef = useRef(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [liked, setLiked] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [likeCount, setLikeCount] = useState(
    asInt(content?.likes_count ?? content?.likes ?? 0)
  )
  const [viewCount, setViewCount] = useState(
    asInt(content?.views_count ?? content?.views ?? 0)
  )
  const [commentsOpen, setCommentsOpen] = useState(false)
  const viewedOnceRef = useRef(false)

  const isVideo = content?.type === 'video' || content?.video_type

  // Carregar status de like quando abrir o modal
  useEffect(() => {
    if (isOpen && content) {
      loadInitialData()
    }
  }, [isOpen, content, isVideo])

  const loadInitialData = async () => {
    if (!content) return

    // Verificar like + sincronizar contagem real
    if (isVideo) {
      const [{ liked: isLiked }, { count }] = await Promise.all([
        checkVideoLike(content.id),
        getVideoLikesCount(content.id),
      ])
      setLiked(!!isLiked)
      if (typeof count === 'number') setLikeCount(count)
    } else {
      const [{ liked: isLiked }, { count }] = await Promise.all([
        checkPhotoLike(content.id),
        getPhotoLikesCount(content.id),
      ])
      setLiked(!!isLiked)
      if (typeof count === 'number') setLikeCount(count)
    }

    // Incrementar view uma vez ao abrir o modal
    if (!viewedOnceRef.current) {
      viewedOnceRef.current = true
      if (isVideo) {
        const { views } = await incrementVideoView(content.id)
        if (typeof views === 'number') setViewCount(views)
      } else {
        const { views } = await incrementPhotoView(content.id)
        if (typeof views === 'number') setViewCount(views)
      }
    }
  }

  useEffect(() => {
    // Se trocar o conteúdo dentro do mesmo modal, resetar o flag
    viewedOnceRef.current = false
    setLikeCount(asInt(content?.likes_count ?? content?.likes ?? 0))
    setViewCount(asInt(content?.views_count ?? content?.views ?? 0))
  }, [content?.id])

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play()
        setIsPlaying(true)
      } else {
        videoRef.current.pause()
        setIsPlaying(false)
      }
    }
  }

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted
      setIsMuted(videoRef.current.muted)
    }
  }

  const toggleLike = async () => {
    if (!content) return

    if (!currentUser) {
      toast({
        title: 'Login necessário',
        description: 'Você precisa estar logado para curtir.',
        variant: 'destructive',
      })
      return
    }

    const nextLiked = !liked
    setLiked(nextLiked)
    setLikeCount((prev) => Math.max(0, prev + (nextLiked ? 1 : -1)))

    try {
      if (isVideo) {
        if (nextLiked) {
          const { error } = await likeVideo(content.id)
          if (error) throw error
        } else {
          const { error } = await unlikeVideo(content.id)
          if (error) throw error
        }
        const { count } = await getVideoLikesCount(content.id)
        if (typeof count === 'number') setLikeCount(count)
      } else {
        if (nextLiked) {
          const { error } = await likePhoto(content.id)
          if (error) throw error
        } else {
          const { error } = await unlikePhoto(content.id)
          if (error) throw error
        }
        const { count } = await getPhotoLikesCount(content.id)
        if (typeof count === 'number') setLikeCount(count)
      }
    } catch (error) {
      setLiked((prev) => !prev)
      setLikeCount((prev) => Math.max(0, prev + (nextLiked ? -1 : 1)))
      toast({
        title: 'Erro ao curtir',
        description: error?.message || 'Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
      const currentProgress =
        (videoRef.current.currentTime / videoRef.current.duration) * 100
      setProgress(currentProgress || 0)
    }
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
    }
  }

  const handleProgressChange = (value) => {
    if (videoRef.current) {
      const newTime = (value[0] / 100) * videoRef.current.duration
      videoRef.current.currentTime = newTime
      setProgress(value[0])
    }
  }

  const formatTime = (timeInSeconds) => {
    const minutes = Math.floor(timeInSeconds / 60)
    const seconds = Math.floor(timeInSeconds % 60)
      .toString()
      .padStart(2, '0')
    return `${minutes}:${seconds}`
  }

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen()
      }
    }
  }

  const openComments = () => setCommentsOpen(true)

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    toast({
      title: 'Link copiado!',
      description: 'O link foi copiado para sua área de transferência.',
    })
  }

  if (!content) return null

  const contentType = isVideo ? 'video' : 'photo'

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] z-[9999] max-w-6xl w-full p-0 gap-0 overflow-hidden bg-card rounded-2xl border-2 border-border shadow-lg"
          style={{ maxHeight: '95vh', height: '95vh' }}
        >
          <DialogPrimitive.Title className="sr-only">
            {isVideo
              ? `Vídeo: ${content?.title || 'conteúdo'}`
              : `Foto: ${content?.caption || 'conteúdo'}`}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Modal de visualização de conteúdo com curtidas e comentários.
          </DialogPrimitive.Description>
          <div className="flex flex-col md:grid md:grid-cols-[1fr_400px] h-full w-full">
            {/* Área de conteúdo (foto/vídeo) */}
            <div className="relative bg-background flex items-center justify-center h-[40vh] md:h-full flex-shrink-0 rounded-l-2xl overflow-hidden">
              {/* Botão Voltar */}
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="absolute top-4 left-4 z-10 hover:bg-muted"
              >
                <ArrowLeft size={24} />
              </Button>

              {/* Menu de Opções - Três Pontinhos */}
              <div className="absolute top-4 right-4 z-10">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hover:bg-muted"
                    >
                      <MoreVertical size={24} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {currentUser?.id === user?.id ? (
                      // Opções para próprio perfil
                      <>
                        <DropdownMenuItem
                          onClick={() => {
                            if (onEdit) return onEdit({ ...content, type: isVideo ? 'video' : 'photo' })
                            toast({
                              title: 'Editar conteúdo',
                              description: 'Ação de edição não configurada.',
                            })
                          }}
                        >
                          <Edit size={16} className="mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            toast({
                              title: 'Download',
                              description: 'Download iniciado.',
                            })
                            // Aqui adicionar lógica de download
                          }}
                        >
                          <Download size={16} className="mr-2" />
                          Baixar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => {
                            if (
                              confirm(
                                'Tem certeza que deseja excluir este conteúdo?'
                              )
                            ) {
                              if (onDelete) return onDelete({ ...content, type: isVideo ? 'video' : 'photo' })
                              toast({
                                title: 'Excluir conteúdo',
                                description: 'Ação de exclusão não configurada.',
                                variant: 'destructive',
                              })
                            }
                          }}
                        >
                          <Trash2 size={16} className="mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </>
                    ) : (
                      // Opções para perfil de outra pessoa
                      <>
                        <DropdownMenuItem
                          onClick={() => {
                            handleShare()
                          }}
                        >
                          <Share2 size={16} className="mr-2" />
                          Compartilhar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            toast({
                              title: 'Download',
                              description: 'Download iniciado.',
                            })
                          }}
                        >
                          <Download size={16} className="mr-2" />
                          Baixar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => {
                            toast({
                              title: 'Denunciado',
                              description:
                                'Recebemos sua denúncia e iremos analisar.',
                              variant: 'success',
                            })
                          }}
                        >
                          <Flag size={16} className="mr-2" />
                          Denunciar
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {isVideo ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  {!contentSrc ? (
                    // Placeholder quando URL não pôde ser resolvida
                    <div className="w-full h-full flex items-center justify-center bg-muted/50 border-2 border-dashed border-muted-foreground/30 rounded-lg p-8">
                      <div className="text-center">
                        <VideoIcon className="mx-auto h-16 w-16 text-muted-foreground/50 mb-4" />
                        <p className="text-sm text-muted-foreground font-medium">Vídeo não disponível</p>
                        <p className="text-xs text-muted-foreground/70 mt-2">
                          Verifique a configuração do Worker
                        </p>
                      </div>
                    </div>
                  ) : (
                    <video
                      ref={videoRef}
                      src={contentSrc}
                      className="max-w-full max-h-full object-contain rounded-lg"
                      loop
                      muted={isMuted}
                      onClick={togglePlay}
                      playsInline
                      autoPlay
                      onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                  />
                  )}

                  {/* Controles de vídeo completos */}
                  {contentSrc && (
                  <div
                    className={`absolute bottom-4 left-4 right-4 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 transition-opacity duration-300 ${
                      !isPlaying
                        ? 'opacity-100'
                        : 'opacity-0 pointer-events-none'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          togglePlay()
                        }}
                        className="text-white hover:text-primary transition-colors"
                      >
                        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                      </button>

                      <span className="text-white text-xs font-mono min-w-[40px]">
                        {formatTime(currentTime)}
                      </span>

                      <Slider
                        value={[progress]}
                        max={100}
                        step={0.1}
                        onValueChange={handleProgressChange}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1"
                      />

                      <span className="text-white text-xs font-mono min-w-[40px]">
                        {formatTime(duration)}
                      </span>

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleMute()
                        }}
                        className="text-white hover:text-primary transition-colors"
                      >
                        {isMuted ? (
                          <VolumeX size={20} />
                        ) : (
                          <Volume2 size={20} />
                        )}
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleFullscreen()
                        }}
                        className="text-white hover:text-primary transition-colors"
                      >
                        <Maximize size={20} />
                      </button>
                    </div>
                  </div>
                  )}
                </div>
              ) : (
                <img
                  src={contentSrc}
                  alt={content.caption || content.title}
                  className="max-w-full max-h-full object-contain"
                />
              )}
            </div>

            {/* Painel lateral - Informações e Comentários */}
            <div className="flex flex-col bg-background flex-1 min-h-0 overflow-hidden">
              {/* Header com info do usuário */}
              <div className="p-4 border-b border-border flex-shrink-0">
                <Link
                  to={`/profile/${user?.id}`}
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={userAvatarSrc} alt={user?.name} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {user?.name?.charAt(0)?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold text-sm">{user?.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {user?.profession}
                    </p>
                  </div>
                </Link>
              </div>

              {/* Título/Caption */}
              <div className="p-4 border-b border-border flex-shrink-0">
                <p className="text-sm">
                  {content.caption || content.title || content.description}
                </p>
              </div>

              {/* Stats - Curtidas e Visualizações */}
              <div className="px-4 py-3 border-b border-border flex items-center gap-4 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={toggleLike}
                >
                  <ThumbsUp
                    size={20}
                    className={liked ? 'fill-primary text-primary' : ''}
                  />
                  <span className="font-semibold">{formatCompactNumber(likeCount)}</span>
                </Button>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Eye size={18} />
                  <span className="text-sm font-medium">{formatCompactNumber(viewCount)}</span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={openComments}
                >
                  <MessageCircle size={18} />
                  <span className="text-sm font-medium">Comentários</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 ml-auto"
                  onClick={handleShare}
                >
                  <Share2 size={18} />
                </Button>
              </div>

              {/* Espaço reservado: comentários agora abrem em bottom sheet */}
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                <div className="text-center text-muted-foreground py-10">
                  <MessageCircle size={34} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Abra os comentários para interagir</p>
                  <p className="text-xs">Toque em “Comentários” acima</p>
                </div>
              </div>
            </div>
          </div>

          <CommentsSheet
            open={commentsOpen}
            onOpenChange={setCommentsOpen}
            contentId={content.id}
            contentType={contentType}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  )
}

export default ContentViewModal
