import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  MessageCircle,
  Share2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  MoreVertical,
  Maximize,
  Info,
  Flag,
  Eye,
  ThumbsUp,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { getProfileDisplayName, getProfileInitial } from '@/lib/profileDisplay'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/use-toast'
import { CommentsSheet } from '@/components/comments/CommentsSheet'
import { useAuth } from '@/contexts/AuthContext'
import {
  likeVideo,
  unlikeVideo,
  checkVideoLike,
  getVideoLikesCount,
} from '@/services/commentService'
import { incrementVideoView } from '@/services/viewService'
import { asInt, formatCompactNumber } from '@/lib/numberFormat'

const VideoCard = ({ video, user }) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showControls, setShowControls] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const videoRef = useRef(null)
  const cardRef = useRef(null)
  const { toast } = useToast()
  const { user: currentUser } = useAuth()
  const viewedOnceRef = useRef(false)

  const videoSrc = useResolvedStorageUrl(video?.url)
  const posterSrc = useResolvedStorageUrl(video?.thumbnail || '')
  const avatarSrc = useResolvedStorageUrl(user?.avatar || '')
  const displayName = getProfileDisplayName(user)
  const initial = getProfileInitial(user)

  const [viewCount, setViewCount] = useState(
    asInt(video?.views_count ?? video?.views ?? 0)
  )

  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(
    asInt(video?.likes_count ?? video?.likes ?? 0)
  )

  const commentsCount = asInt(video?.comments_count ?? video?.comments ?? 0)

  const formatTime = (timeInSeconds) => {
    const minutes = Math.floor(timeInSeconds / 60)
    const seconds = Math.floor(timeInSeconds % 60)
      .toString()
      .padStart(2, '0')
    return `${minutes}:${seconds}`
  }

  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.paused || videoRef.current.ended) {
        videoRef.current
          .play()
          .catch((error) => console.error('Error playing video:', error))
        setIsPlaying(true)
        if (!viewedOnceRef.current) {
          viewedOnceRef.current = true
          ;(async () => {
            const { views } = await incrementVideoView(video.id)
            if (typeof views === 'number') setViewCount(views)
            else setViewCount((prev) => prev + 1)
          })()
        }
      } else {
        videoRef.current.pause()
        setIsPlaying(false)
      }
    }
  }, [video?.id])

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted
      setIsMuted(videoRef.current.muted)
    }
  }, [])

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const currentProgress =
        (videoRef.current.currentTime / videoRef.current.duration) * 100
      setProgress(currentProgress)
    }
  }, [])

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
    }
  }, [])

  const handleProgressChange = useCallback((value) => {
    if (videoRef.current) {
      const newTime = (value[0] / 100) * videoRef.current.duration
      videoRef.current.currentTime = newTime
      setProgress(value[0])
    }
  }, [])

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href + `video/${video.id}`) // Placeholder URL
    toast({
      title: 'Link Copiado!',
      description:
        'O link do vídeo foi copiado para sua área de transferência.',
    })
  }

  const handleCommentClick = () => {
    setCommentsOpen(true)
  }

  const toggleLike = async (e) => {
    e.stopPropagation()
    if (!currentUser) {
      toast({
        title: 'Entre na sua conta',
        description: 'Você precisa estar logado para curtir.',
        variant: 'destructive',
      })
      return
    }

    const nextLiked = !liked
    setLiked(nextLiked)
    setLikeCount((prev) => Math.max(0, prev + (nextLiked ? 1 : -1)))

    try {
      if (nextLiked) {
        const { error } = await likeVideo(video.id)
        if (error) throw error
      } else {
        const { error } = await unlikeVideo(video.id)
        if (error) throw error
      }

      // Sincroniza com a fonte da verdade (COUNT na tabela de likes)
      const { count } = await getVideoLikesCount(video.id)
      if (typeof count === 'number') setLikeCount(count)
    } catch (error) {
      // rollback UI
      setLiked((prev) => !prev)
      setLikeCount((prev) => Math.max(0, prev + (nextLiked ? -1 : 1)))
      toast({
        title: 'Erro ao curtir',
        description: error?.message || 'Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  // Carregar status inicial (liked + contagem real) quando o card monta
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ liked: isLiked }, { count }] = await Promise.all([
        checkVideoLike(video.id),
        getVideoLikesCount(video.id),
      ])
      if (cancelled) return
      setLiked(!!isLiked)
      if (typeof count === 'number') setLikeCount(count)
    })()
    return () => {
      cancelled = true
    }
  }, [video?.id])

  useEffect(() => {
    const currentVideoRef = videoRef.current
    if (!currentVideoRef) return

    const options = {
      root: null,
      rootMargin: '0px',
      threshold: 0.6,
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (currentVideoRef.paused) {
            currentVideoRef
              .play()
              .catch((error) => console.error('Autoplay failed:', error))
            setIsPlaying(true)
            if (!viewedOnceRef.current) {
              viewedOnceRef.current = true
              ;(async () => {
                const { views } = await incrementVideoView(video.id)
                if (typeof views === 'number') setViewCount(views)
                else setViewCount((prev) => prev + 1)
              })()
            }
          }
        } else {
          if (!currentVideoRef.paused) {
            currentVideoRef.pause()
            setIsPlaying(false)
          }
        }
      })
    }, options)

    observer.observe(currentVideoRef)

    return () => {
      if (currentVideoRef) {
        observer.unobserve(currentVideoRef)
        if (!currentVideoRef.paused) {
          currentVideoRef.pause()
        }
      }
    }
  }, [videoSrc])

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="relative mb-3 rounded-xl overflow-hidden bg-card shadow-lg border border-border/50"
      style={{ willChange: 'opacity', transform: 'translateZ(0)' }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <div
        className="video-container aspect-[9/16] cursor-pointer"
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          loop
          muted={isMuted}
          playsInline
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          className="w-full h-full object-cover"
          preload="metadata"
          poster={posterSrc || ''}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10 pointer-events-none"></div>

        <AnimatePresence>
          {!isPlaying && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <Play size={56} className="text-white/70 drop-shadow-lg" />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="video-controls absolute bottom-2 left-2 right-2 flex items-center space-x-2 z-10 p-2 bg-black/40 backdrop-blur-sm rounded-lg"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  togglePlay()
                }}
                className="text-white p-1.5 hover:bg-white/20 rounded-full"
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>

              <span className="text-white text-xs font-mono">
                {formatTime(videoRef.current?.currentTime || 0)}
              </span>
              <Slider
                value={[progress]}
                max={100}
                step={0.1}
                onValueChange={handleProgressChange}
                onClick={(e) => e.stopPropagation()}
                className="w-full flex-1 mx-1"
              />
              <span className="text-white text-xs font-mono">
                {formatTime(duration)}
              </span>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleMute()
                }}
                className="text-white p-1.5 hover:bg-white/20 rounded-full"
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (videoRef.current) videoRef.current.requestFullscreen()
                }}
                className="text-white p-1.5 hover:bg-white/20 rounded-full"
              >
                <Maximize size={18} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute top-3 right-3 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full bg-black/30 hover:bg-black/50 text-white"
              >
                <MoreVertical size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  toast({
                    title: 'Salvo!',
                    description: 'Vídeo salvo nos seus favoritos.',
                  })
                }}
              >
                <Info size={16} className="mr-2" /> Salvar Vídeo
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  toast({
                    title: 'Denunciado',
                    description:
                      'Obrigado por nos ajudar a manter a comunidade segura.',
                    variant: 'destructive',
                  })
                }}
              >
                <Flag size={16} className="mr-2" /> Denunciar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Views and Comments Icons - Bottom Right on Video */}
        <div className="absolute bottom-14 right-3 z-10 flex flex-col items-center space-y-3">
          <button
            onClick={toggleLike}
            className="flex flex-col items-center text-white hover:scale-110 transition-transform"
          >
            <div
              className={`p-2 rounded-full ${
                liked ? 'bg-primary/20' : 'bg-black/40'
              } backdrop-blur-sm`}
            >
              <ThumbsUp
                size={19}
                className={liked ? 'text-primary fill-primary' : 'text-white'}
              />
            </div>
            <span className="text-[11px] font-semibold mt-0.5 drop-shadow-md">
              {formatCompactNumber(likeCount)}
            </span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleCommentClick()
            }}
            className="flex flex-col items-center text-white hover:scale-110 transition-transform"
          >
            <div className="p-2 rounded-full bg-black/40 backdrop-blur-sm">
              <MessageCircle size={19} />
            </div>
            <span className="text-[11px] font-semibold mt-0.5 drop-shadow-md">
              {formatCompactNumber(commentsCount)}
            </span>
          </button>
          <div className="flex flex-col items-center text-white">
            <div className="p-2 rounded-full bg-black/40 backdrop-blur-sm">
              <Eye size={19} />
            </div>
            <span className="text-[11px] font-semibold mt-0.5 drop-shadow-md">
              {formatCompactNumber(viewCount)}
            </span>
          </div>
        </div>
      </div>

      <CommentsSheet
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
        contentId={video?.id}
        contentType="video"
      />

      <div className="p-3">
        <div className="flex items-start justify-between mb-2">
          <Link
            to={`/profile/${user.id}`}
            className="flex items-center space-x-2.5 group mr-2 min-w-0"
          >
            <div className="h-9 w-9 rounded-full border-2 border-primary group-hover:scale-105 transition-transform overflow-hidden bg-primary flex items-center justify-center flex-shrink-0">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={displayName}
                  className="h-full w-full object-cover"
                  loading="eager"
                />
              ) : (
                <span className="text-xs font-bold text-primary-foreground">
                  {initial}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm group-hover:text-primary transition-colors truncate">
                {displayName}
              </h3>
              <p className="text-xs text-muted-foreground truncate">
                {user.profession}
              </p>
            </div>
          </Link>
        </div>
        <h4 className="font-medium text-sm text-foreground mb-1 line-clamp-1">
          {video.title || video.description.substring(0, 50) + '...'}
        </h4>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2.5 leading-relaxed">
          {video.description}
        </p>
        <div className="flex items-center justify-end text-muted-foreground">
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleShare()
            }}
            className="hover:text-primary transition-colors flex items-center gap-1.5 text-xs"
          >
            <Share2 size={14} />
            <span>Compartilhar</span>
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export default VideoCard
