import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, Eye, MessageCircle, Play, Plus, ThumbsUp, Volume2, VolumeX } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { getProfileDisplayName, getProfileInitial } from '@/lib/profileDisplay'
import { asInt, formatCompactNumber } from '@/lib/numberFormat'
import { CommentsSheet } from '@/components/comments/CommentsSheet'
import { checkVideoLike, getVideoLikesCount, likeVideo, unlikeVideo } from '@/services/commentService'
import { incrementVideoView } from '@/services/viewService'

export const ReelViewerModal = ({ open, onOpenChange, video, author }) => {
  const { toast } = useToast()
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()

  const videoRef = useRef(null)
  const viewedOnceRef = useRef(false)

  const videoSrc = useResolvedStorageUrl(video?.url, { provider: video?.provider })
  const posterSrc = useResolvedStorageUrl(video?.thumbnail || '', { provider: video?.provider })

  const avatarSrc = useResolvedStorageUrl(author?.avatar || '')
  const displayName = useMemo(() => getProfileDisplayName(author), [author])
  const initial = useMemo(() => getProfileInitial(author), [author])

  const descriptionText = useMemo(() => {
    return String(video?.description || video?.title || '').trim()
  }, [video?.description, video?.title])

  const commentsCount = asInt(video?.comments_count ?? video?.comments ?? 0)

  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(asInt(video?.likes_count ?? video?.likes ?? 0))
  const [viewCount, setViewCount] = useState(asInt(video?.views_count ?? video?.views ?? 0))
  const [commentsOpen, setCommentsOpen] = useState(false)

  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)

  // Reset when swapping videos
  useEffect(() => {
    viewedOnceRef.current = false
    setIsPlaying(false)
    setIsMuted(true)
    setLiked(false)
    setLikeCount(asInt(video?.likes_count ?? video?.likes ?? 0))
    setViewCount(asInt(video?.views_count ?? video?.views ?? 0))
  }, [video?.id])

  // Load like state + sync count when open
  useEffect(() => {
    if (!open || !video?.id) return

    let cancelled = false
    ;(async () => {
      try {
        const [{ liked: isLiked }, { count }] = await Promise.all([
          checkVideoLike(video.id),
          getVideoLikesCount(video.id),
        ])
        if (cancelled) return
        setLiked(!!isLiked)
        if (typeof count === 'number') setLikeCount(count)
      } catch {
        // ignore
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, video?.id])

  // Load follow state when open
  useEffect(() => {
    if (!open) return
    if (!currentUser?.id) {
      setIsFollowing(false)
      return
    }
    if (!author?.id) {
      setIsFollowing(false)
      return
    }
    if (currentUser.id === author.id) {
      setIsFollowing(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const { supabase } = await import('@/lib/supabaseClient')
        const { data } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', currentUser.id)
          .eq('following_id', author.id)
          .maybeSingle()
        if (cancelled) return
        setIsFollowing(!!data)
      } catch {
        if (cancelled) return
        setIsFollowing(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, author?.id, currentUser?.id])

  // Increment view once when opening
  useEffect(() => {
    if (!open || !video?.id) return
    if (viewedOnceRef.current) return
    viewedOnceRef.current = true

    ;(async () => {
      try {
        const { views } = await incrementVideoView(video.id)
        if (typeof views === 'number') setViewCount(views)
        else setViewCount((prev) => prev + 1)
      } catch {
        setViewCount((prev) => prev + 1)
      }
    })()
  }, [open, video?.id])

  // Auto-play when open
  useEffect(() => {
    if (!open) return
    const el = videoRef.current
    if (!el) return

    // Keep muted to allow autoplay on mobile
    el.muted = true
    setIsMuted(true)

    el.play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false))
  }, [open, videoSrc])

  const togglePlay = useCallback(() => {
    const el = videoRef.current
    if (!el) return

    if (el.paused || el.ended) {
      el.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
    } else {
      el.pause()
      setIsPlaying(false)
    }
  }, [])

  const toggleMute = useCallback((e) => {
    e?.stopPropagation?.()
    const el = videoRef.current
    if (!el) return
    el.muted = !el.muted
    setIsMuted(el.muted)
  }, [])

  const toggleLike = useCallback(
    async (e) => {
      e?.stopPropagation?.()
      if (!video?.id) return

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
        if (nextLiked) {
          const { error } = await likeVideo(video.id)
          if (error) throw error
        } else {
          const { error } = await unlikeVideo(video.id)
          if (error) throw error
        }

        const { count } = await getVideoLikesCount(video.id)
        if (typeof count === 'number') setLikeCount(count)
      } catch (error) {
        // rollback
        setLiked((prev) => !prev)
        setLikeCount((prev) => Math.max(0, prev + (nextLiked ? -1 : 1)))
        toast({
          title: 'Erro ao curtir',
          description: error?.message || 'Tente novamente.',
          variant: 'destructive',
        })
      }
    },
    [currentUser, liked, toast, video?.id]
  )

  const openComments = useCallback(
    (e) => {
      e?.stopPropagation?.()
      setCommentsOpen(true)
    },
    []
  )

  const handleFollow = useCallback(
    async (e) => {
      e?.stopPropagation?.()
      if (followLoading) return
      if (isFollowing) return

      if (!author?.id) return

      if (!currentUser?.id) {
        toast({
          title: 'Login necessário',
          description: 'Você precisa estar logado para seguir.',
          variant: 'destructive',
        })
        navigate('/login')
        return
      }

      if (currentUser.id === author.id) return

      setFollowLoading(true)
      try {
        const { supabase } = await import('@/lib/supabaseClient')
        const { error } = await supabase.from('follows').insert([
          {
            follower_id: currentUser.id,
            following_id: author.id,
          },
        ])
        if (error) throw error

        setIsFollowing(true)
        toast({
          title: 'Seguindo!',
          description: 'Agora você está seguindo este perfil.',
        })
      } catch (error) {
        toast({
          title: 'Erro',
          description: error?.message || 'Não foi possível seguir. Tente novamente.',
          variant: 'destructive',
        })
      } finally {
        setFollowLoading(false)
      }
    },
    [author?.id, currentUser?.id, followLoading, isFollowing, navigate, toast]
  )

  if (!video) return null

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] bg-black"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[10000] h-[100dvh] w-full overflow-hidden bg-black"
              >
                <DialogPrimitive.Title className="sr-only">Reels</DialogPrimitive.Title>

                <div className="relative h-full w-full" onClick={togglePlay}>
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    poster={posterSrc || ''}
                    className="h-full w-full object-cover"
                    playsInline
                    loop
                    muted={isMuted}
                    preload="metadata"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/30 pointer-events-none" />

                  {/* Exit */}
                  <div className="absolute left-3 top-3 z-20">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-full bg-black/35 hover:bg-black/55 text-white"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenChange?.(false)
                      }}
                      aria-label="Sair"
                    >
                      <ArrowLeft size={20} />
                    </Button>
                  </div>

                  {/* Mute */}
                  <div className="absolute right-3 top-3 z-20">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-full bg-black/35 hover:bg-black/55 text-white"
                      onClick={toggleMute}
                      aria-label={isMuted ? 'Ativar som' : 'Mutar'}
                    >
                      {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </Button>
                  </div>

                  {/* Play indicator */}
                  <AnimatePresence>
                    {!isPlaying && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.6 }}
                        className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                      >
                        <Play size={64} className="text-white/75 drop-shadow-lg" />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Actions (right) */}
                  <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-4">
                    {/* Profile ABOVE like (no name here) */}
                    <div className="relative">
                      {author?.id ? (
                        <Link
                          to={`/profile/${author.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="block"
                          aria-label="Abrir perfil"
                        >
                          <div className="h-12 w-12 rounded-full border-2 border-white/80 overflow-hidden bg-primary flex items-center justify-center">
                            {avatarSrc ? (
                              <img src={avatarSrc} alt={displayName} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-sm font-bold text-primary-foreground">{initial}</span>
                            )}
                          </div>
                        </Link>
                      ) : (
                        <div className="h-12 w-12 rounded-full border-2 border-white/80 overflow-hidden bg-primary flex items-center justify-center">
                          {avatarSrc ? (
                            <img src={avatarSrc} alt={displayName} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-sm font-bold text-primary-foreground">{initial}</span>
                          )}
                        </div>
                      )}

                      {/* Follow no canto do perfil (como na foto) */}
                      {author?.id && currentUser?.id !== author.id && (
                        <button
                          type="button"
                          onClick={handleFollow}
                          disabled={followLoading || isFollowing}
                          aria-label={isFollowing ? 'Seguindo' : 'Seguir'}
                          className="absolute -bottom-1 -right-1"
                        >
                          {isFollowing ? (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white border-2 border-black/40 shadow">
                              <Check size={14} strokeWidth={3} />
                            </span>
                          ) : (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white border-2 border-black/40 shadow">
                              <Plus size={14} strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      )}
                    </div>

                    <button
                      onClick={toggleLike}
                      className="flex flex-col items-center text-white hover:scale-110 transition-transform"
                      aria-label="Curtir"
                    >
                      <div className={`p-2.5 rounded-full ${liked ? 'bg-primary/25' : 'bg-black/45'} backdrop-blur-sm`}>
                        <ThumbsUp size={20} className={liked ? 'text-primary fill-primary' : 'text-white'} />
                      </div>
                      <span className="text-[11px] font-semibold mt-1 drop-shadow-md">
                        {formatCompactNumber(likeCount)}
                      </span>
                    </button>

                    <button
                      onClick={openComments}
                      className="flex flex-col items-center text-white hover:scale-110 transition-transform"
                      aria-label="Comentários"
                    >
                      <div className="p-2.5 rounded-full bg-black/45 backdrop-blur-sm">
                        <MessageCircle size={20} />
                      </div>
                      <span className="text-[11px] font-semibold mt-1 drop-shadow-md">
                        {formatCompactNumber(commentsCount)}
                      </span>
                    </button>

                    <div className="flex flex-col items-center text-white" aria-label="Visualizações">
                      <div className="p-2.5 rounded-full bg-black/45 backdrop-blur-sm">
                        <Eye size={20} />
                      </div>
                      <span className="text-[11px] font-semibold mt-1 drop-shadow-md">
                        {formatCompactNumber(viewCount)}
                      </span>
                    </div>
                  </div>

                  {/* Bottom text: name + description */}
                  <div className="absolute left-3 right-16 bottom-4 z-20">
                    <div className="text-white drop-shadow-lg">
                      <p className="text-[13px] font-semibold leading-tight">{displayName}</p>
                      {author?.profession ? (
                        <p className="text-[12px] text-white/80 leading-tight mt-0.5">{author.profession}</p>
                      ) : null}
                      {descriptionText ? (
                        <p className="text-[13px] mt-2 leading-snug line-clamp-3">{descriptionText}</p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <CommentsSheet
                  open={commentsOpen}
                  onOpenChange={setCommentsOpen}
                  contentId={video?.id}
                  contentType="video"
                />
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}
