import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, Eye, MessageCircle, Play, Pause, Plus, ThumbsUp, Volume2, VolumeX, Maximize } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { useLikes } from '@/contexts/LikesContext'
import { useCommentsMeta } from '@/contexts/CommentsMetaContext'
import { buildR2VideoPlaybackUrl, useResolvedStorageUrl } from '@/lib/storageUrl'
import { getProfileDisplayName, getProfileInitial } from '@/lib/profileDisplay'
import { asInt, formatCompactNumber } from '@/lib/numberFormat'
import { commentApi } from '@/lib/commentApi'
import { CommentsSheet } from '@/components/comments/CommentsSheet'
import { prefetchComments } from '@/hooks/useComments'
import { hasSessionViewedVideo, incrementVideoView, markSessionViewedVideo } from '@/services/viewService'

import { attemptPlayWithMuteFallback } from '@/lib/videoAudioPrefs'
import { useOverlayLock } from '@/hooks/useOverlayLock'
import { Z_FULLSCREEN_CONTENT, Z_FULLSCREEN_OVERLAY } from '@/design/overlayZIndexTokens'

export const ReelViewerModal = ({ open, onOpenChange, video, author }) => {
  useOverlayLock(!!open, { navMode: 'dim' })
  const { toast } = useToast()
  const { user: currentUser } = useAuth()
  const likes = useLikes()
  const commentsMeta = useCommentsMeta()
  const navigate = useNavigate()

  const videoRef = useRef(null)
  const viewTimerRef = useRef(null)
  const viewCountedRef = useRef(false)
  const visibleEnoughRef = useRef(true)
  const tapTimerRef = useRef(null)
  const hideControlsTimeoutRef = useRef(null)

  const videoSrc = useMemo(() => buildR2VideoPlaybackUrl(video?.url), [video?.url])
  const posterSrc = useResolvedStorageUrl(video?.thumbnail_url || video?.thumbnail || '', { provider: video?.provider })

  const avatarSrc = useResolvedStorageUrl(author?.avatar || '')
  const displayName = useMemo(() => getProfileDisplayName(author), [author])
  const initial = useMemo(() => getProfileInitial(author), [author])

  const descriptionText = useMemo(() => {
    return String(video?.description || video?.title || '').trim()
  }, [video?.description, video?.title])

  const [commentsCount, setCommentsCount] = useState(asInt(video?.comments_count ?? video?.comments ?? 0))

  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [likeBurstKey, setLikeBurstKey] = useState(0)
  const likeBurstTimeoutRef = useRef(null)
  const liked = video?.id ? likes.isLiked('video', video.id) : false
  const likeCount = video?.id ? likes.getCount('video', video.id) : null
  const [viewCount, setViewCount] = useState(asInt(video?.views_count ?? video?.views ?? 0))
  const [commentsOpen, setCommentsOpen] = useState(false)

  const handleCommentsCountChange = useCallback(
    (nextCount) => {
      if (!video?.id) return
      if (typeof nextCount !== 'number') return
      setCommentsCount(nextCount)
      commentsMeta.setCount('video', video.id, nextCount)
    },
    [commentsMeta, video?.id]
  )

  useEffect(() => {
    if (!open) return
    if (!video?.id) return
    void prefetchComments({ contentId: video.id, contentType: 'video', sort: 'new', userId: currentUser?.id || null })
  }, [currentUser?.id, open, video?.id])

  // Only keep src while modal is open.
  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    if (open) {
      if (videoSrc) {
        const cur = el.getAttribute('src') || ''
        if (cur !== videoSrc) {
          el.setAttribute('src', videoSrc)
          try {
            el.load?.()
          } catch {
            // ignore
          }
        }
      }
      return
    }

    try {
      el.pause?.()
      el.removeAttribute('src')
      el.load?.()
    } catch {
      // ignore
    }
  }, [open, videoSrc])

  // Reels: ensure comment count is exact (avoid showing stale comments_count)
  useEffect(() => {
    if (!open) return
    const id = video?.id
    if (!id) return

    let cancelled = false
    ;(async () => {
      const { count: exact, error } = await commentApi.getTotalCommentsCount({ videoId: id })
      if (cancelled) return
      if (error) return
      setCommentsCount(exact)
      commentsMeta.setCount('video', id, exact)
    })()

    return () => {
      cancelled = true
    }
  }, [commentsMeta, open, video?.id])

  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)

  // Reset when swapping videos
  useEffect(() => {
    setIsPlaying(false)
    setIsMuted(false)
    setShowControls(false)
    setProgress(0)
    setDuration(0)
    setCurrentTime(0)
    setLikeBurstKey(0)
    setViewCount(asInt(video?.views_count ?? video?.views ?? 0))
    setCommentsCount(asInt(video?.comments_count ?? video?.comments ?? 0))
    viewCountedRef.current = hasSessionViewedVideo(video?.id)
    visibleEnoughRef.current = true
    if (viewTimerRef.current) {
      clearTimeout(viewTimerRef.current)
      viewTimerRef.current = null
    }
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current)
      tapTimerRef.current = null
    }
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current)
      hideControlsTimeoutRef.current = null
    }
    if (likeBurstTimeoutRef.current) {
      clearTimeout(likeBurstTimeoutRef.current)
      likeBurstTimeoutRef.current = null
    }
  }, [video?.id])

  useEffect(() => {
    if (!video?.id) return
    void commentsMeta.hydrateForIds('video', [video.id])
  }, [commentsMeta, video?.id])

  const liveCommentsCount = video?.id ? commentsMeta.getCount('video', video.id) : null
  const commentsCountToShow = typeof liveCommentsCount === 'number' ? liveCommentsCount : commentsCount

  useEffect(() => {
    if (!likeBurstKey) return
    if (likeBurstTimeoutRef.current) {
      clearTimeout(likeBurstTimeoutRef.current)
      likeBurstTimeoutRef.current = null
    }
    likeBurstTimeoutRef.current = setTimeout(() => {
      setLikeBurstKey(0)
      likeBurstTimeoutRef.current = null
    }, 520)
  }, [likeBurstKey])

  const formatTime = useCallback((timeInSeconds) => {
    const safe = Math.max(0, Number(timeInSeconds) || 0)
    const minutes = Math.floor(safe / 60)
    const seconds = Math.floor(safe % 60)
      .toString()
      .padStart(2, '0')
    return `${minutes}:${seconds}`
  }, [])

  const showControlsWithAutoHide = useCallback((options) => {
    const delayMs = Math.max(500, Number(options?.delayMs) || 2500)
    setShowControls(true)

    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current)
      hideControlsTimeoutRef.current = null
    }

    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false)
      hideControlsTimeoutRef.current = null
    }, delayMs)
  }, [])

  const handleTimeUpdate = useCallback(() => {
    const el = videoRef.current
    if (!el || !el.duration) return
    const ratio = el.currentTime / el.duration
    setProgress(Math.max(0, Math.min(100, ratio * 100)))
    setCurrentTime(el.currentTime)
  }, [])

  const handleLoadedMetadata = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    setDuration(Number(el.duration) || 0)
  }, [])

  const handleProgressChange = useCallback((value) => {
    const el = videoRef.current
    if (!el || !el.duration) return
    const pct = Number(value?.[0] ?? 0)
    const newTime = (pct / 100) * el.duration
    el.currentTime = newTime
    setProgress(pct)
    setCurrentTime(newTime)
  }, [])

  // Hydrate global like state when open / video changes
  useEffect(() => {
    if (!open || !video?.id) return
    void likes.hydrateForIds('video', [video.id])
  }, [likes, open, video?.id])

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

  // Visibilidade (>= 60%) + timer de "assistiu de verdade" (2.5s tocando)
  useEffect(() => {
    if (!open) return
    const el = videoRef.current
    if (!el) return

    const maybeStartViewTimer = () => {
      const id = video?.id
      if (!open || !id) return
      if (viewCountedRef.current) return
      if (hasSessionViewedVideo(id)) {
        viewCountedRef.current = true
        return
      }

      const canCount =
        visibleEnoughRef.current &&
        !el.paused &&
        !el.ended &&
        el.readyState >= 2

      if (!canCount) {
        if (viewTimerRef.current) {
          clearTimeout(viewTimerRef.current)
          viewTimerRef.current = null
        }
        return
      }

      if (viewTimerRef.current) return

      viewTimerRef.current = setTimeout(async () => {
        viewTimerRef.current = null
        const stillCanCount =
          open &&
          visibleEnoughRef.current &&
          !el.paused &&
          !el.ended &&
          el.readyState >= 2

        if (!stillCanCount) return
        if (viewCountedRef.current) return
        if (hasSessionViewedVideo(id)) {
          viewCountedRef.current = true
          return
        }

        viewCountedRef.current = true
        markSessionViewedVideo(id)
        try {
          const { views } = await incrementVideoView(id)
          if (typeof views === 'number') setViewCount(views)
          else setViewCount((prev) => prev + 1)
        } catch {
          setViewCount((prev) => prev + 1)
        }
      }, 2500)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const ratio = Number(entries?.[0]?.intersectionRatio || 0)
        visibleEnoughRef.current = ratio >= 0.6
        maybeStartViewTimer()
      },
      { threshold: [0, 0.6, 1] }
    )

    observer.observe(el)

    const onPlay = () => maybeStartViewTimer()
    const onPause = () => maybeStartViewTimer()
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)

    // Tenta iniciar imediatamente caso já esteja tocando
    maybeStartViewTimer()

    return () => {
      observer.disconnect()
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      if (viewTimerRef.current) {
        clearTimeout(viewTimerRef.current)
        viewTimerRef.current = null
      }
    }
  }, [open, video?.id])

  // Auto-play when open
  useEffect(() => {
    if (!open) return
    const el = videoRef.current
    if (!el) return

    attemptPlayWithMuteFallback(el, { muted: isMuted, allowFallback: false })
      .then((res) => {
        setIsPlaying(!!res?.ok)
      })
      .catch(() => setIsPlaying(false))
  }, [open, videoSrc, isMuted])

  useEffect(() => {
    if (open) return
    setShowControls(false)
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current)
      hideControlsTimeoutRef.current = null
    }
  }, [open])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    return () => {
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
    }
  }, [])

  const togglePlay = useCallback(() => {
    const el = videoRef.current
    if (!el) return

    if (el.paused || el.ended) {
      attemptPlayWithMuteFallback(el, { muted: isMuted, allowFallback: false })
        .then((res) => setIsPlaying(!!res?.ok))
        .catch(() => setIsPlaying(false))
    } else {
      el.pause()
      setIsPlaying(false)
    }
  }, [isMuted])

  const isCenterTap = useCallback((evt) => {
    try {
      const el = evt?.currentTarget
      if (!el?.getBoundingClientRect) return false
      const rect = el.getBoundingClientRect()
      const x = (evt?.clientX - rect.left) / Math.max(1, rect.width)
      const y = (evt?.clientY - rect.top) / Math.max(1, rect.height)
      return x >= 0.35 && x <= 0.65 && y >= 0.35 && y <= 0.65
    } catch {
      return false
    }
  }, [])

  const toggleMute = useCallback((e) => {
    e?.stopPropagation?.()
    const el = videoRef.current
    if (!el) return
    const next = !el.muted
    el.muted = next
    setIsMuted(next)
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

      try {
        const res = await likes.toggleLike('video', video.id)
        if (res?.error) throw res.error
      } catch (error) {
        toast({
          title: 'Erro ao curtir',
          description: error?.message || 'Tente novamente.',
          variant: 'destructive',
        })
      }
    },
    [currentUser, likes, toast, video?.id]
  )

  const handleTap = useCallback(
    (e) => {
      const center = isCenterTap(e)

      // Duplo toque: curtir
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current)
        tapTimerRef.current = null

        // Instagram-like: duplo-toque só CURTE (não descurte) e só anima se realmente vai curtir.
        if (!currentUser) {
          toggleLike(e)
          return
        }
        if (liked) return

        setLikeBurstKey(Date.now())
        toggleLike(e)
        return
      }

      // Toque único: aguarda para não conflitar com duplo-toque
      tapTimerRef.current = setTimeout(() => {
        tapTimerRef.current = null
        if (center) {
          showControlsWithAutoHide({ delayMs: 2500 })
          togglePlay()
          return
        }

        setShowControls((prev) => {
          const next = !prev
          if (!next) {
            if (hideControlsTimeoutRef.current) {
              clearTimeout(hideControlsTimeoutRef.current)
              hideControlsTimeoutRef.current = null
            }
            return false
          }
          showControlsWithAutoHide({ delayMs: 2500 })
          return true
        })
      }, 240)
    },
    [isCenterTap, showControlsWithAutoHide, toggleLike, togglePlay]
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
                className={`fixed inset-0 ${Z_FULLSCREEN_OVERLAY} bg-black`}
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={`fixed inset-0 ${Z_FULLSCREEN_CONTENT} h-[100dvh] w-full overflow-hidden bg-black`}
              >
                <DialogPrimitive.Title className="sr-only">Reels</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  Visualizador de Reel com ações de curtir e comentar.
                </DialogPrimitive.Description>

                <div className="relative h-full w-full" onClick={handleTap}>
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    poster={posterSrc || ''}
                    className="h-full w-full object-cover"
                    playsInline
                    loop
                    muted={isMuted}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    preload="metadata"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/30 pointer-events-none" />

                  <AnimatePresence>
                    {!!likeBurstKey && (
                      <motion.div
                        key={likeBurstKey}
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.05 }}
                        transition={{ duration: 0.28 }}
                        className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                      >
                        <div className="relative">
                          {/* Partículas */}
                          {Array.from({ length: 10 }).map((_, i) => {
                            const angle = (i / 10) * Math.PI * 2
                            const dx = Math.cos(angle) * 44
                            const dy = Math.sin(angle) * 44
                            return (
                              <motion.span
                                // eslint-disable-next-line react/no-array-index-key
                                key={i}
                                initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
                                animate={{ opacity: [0, 1, 0], x: dx, y: dy, scale: [0.6, 1.15, 0.9] }}
                                transition={{ duration: 0.48, ease: 'easeOut', times: [0, 0.25, 1] }}
                                className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-300"
                                style={{ boxShadow: '0 0 12px rgba(249,115,22,0.65)' }}
                              />
                            )
                          })}

                          {/* Ícone central + glow */}
                          <motion.div
                            initial={{ boxShadow: '0 0 0px rgba(249,115,22,0)', scale: 0.9, opacity: 0 }}
                            animate={{ boxShadow: '0 0 34px rgba(249,115,22,0.75)', scale: 1, opacity: 1 }}
                            exit={{ boxShadow: '0 0 0px rgba(249,115,22,0)', scale: 0.98, opacity: 0 }}
                            transition={{ duration: 0.22, ease: 'easeOut' }}
                            className="relative flex h-12 w-12 items-center justify-center rounded-full bg-orange-500"
                          >
                            <ThumbsUp size={28} className="text-white fill-white drop-shadow" />
                          </motion.div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

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

                  <AnimatePresence>
                    {showControls && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="video-controls absolute bottom-3 left-3 right-3 flex items-center space-x-2 z-30 p-2 bg-black/40 backdrop-blur-sm rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            togglePlay()
                            showControlsWithAutoHide({ delayMs: 2500 })
                          }}
                          className="text-white p-1.5 hover:bg-white/20 rounded-full"
                          aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
                        >
                          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                        </button>

                        <span className="text-white text-xs font-mono">{formatTime(currentTime)}</span>
                        <Slider
                          value={[progress]}
                          max={100}
                          step={0.1}
                          onValueChange={handleProgressChange}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full flex-1 mx-1"
                        />
                        <span className="text-white text-xs font-mono">{formatTime(duration)}</span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleMute(e)
                            showControlsWithAutoHide({ delayMs: 2500 })
                          }}
                          className="text-white p-1.5 hover:bg-white/20 rounded-full"
                          aria-label={isMuted ? 'Ativar som' : 'Mutar'}
                        >
                          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const el = videoRef.current
                            if (el?.requestFullscreen) el.requestFullscreen()
                            showControlsWithAutoHide({ delayMs: 2500 })
                          }}
                          className="text-white p-1.5 hover:bg-white/20 rounded-full"
                          aria-label="Tela cheia"
                        >
                          <Maximize size={18} />
                        </button>
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
                        {typeof likeCount === 'number' ? formatCompactNumber(likeCount) : '—'}
                      </span>
                    </button>

                    <button
                      onPointerDown={() => {
                        if (!video?.id) return
                        void prefetchComments({ contentId: video.id, contentType: 'video', sort: 'new', userId: currentUser?.id || null })
                      }}
                      onClick={openComments}
                      className="flex flex-col items-center text-white hover:scale-110 transition-transform"
                      aria-label="Comentários"
                    >
                      <div className="p-2.5 rounded-full bg-black/45 backdrop-blur-sm">
                        <MessageCircle size={20} />
                      </div>
                      <span className="text-[11px] font-semibold mt-1 drop-shadow-md">
                        {formatCompactNumber(commentsCountToShow)}
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
                  onCountChange={handleCommentsCountChange}
                />
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}
