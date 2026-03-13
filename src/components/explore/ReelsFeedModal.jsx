import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Eye, MessageCircle, Play, Pause, Plus, Check, ThumbsUp, Volume2, VolumeX, Maximize, Loader2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { attemptPlayWithMuteFallback } from '@/lib/videoAudioPrefs'
import {
  ensureUserPlaybackUnlockedOnFirstGesture,
  registerVideo,
  requestExclusivePlayback,
  unregisterVideo,
} from '@/lib/videoPlaybackCoordinator'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
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
import { searchVideos } from '@/services/exploreSearchService'
import { useOverlayLock } from '@/hooks/useOverlayLock'
import { Z_FULLSCREEN_CONTENT, Z_FULLSCREEN_OVERLAY, Z_FULLSCREEN_UI } from '@/design/overlayZIndexTokens'

const uniqueById = (items) => {
  const seen = new Set()
  const out = []
  for (const it of items || []) {
    const key = String(it?.id ?? '')
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

const ReelSlide = ({
  video,
  author,
  active,
  muted,
  onToggleMuted,
  onRequestComments,
  onTap,
  playbackEnabled,
}) => {
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

  const playbackKey = useMemo(() => `reels:${String(video?.id ?? '')}`, [video?.id])

  const avatarSrc = useResolvedStorageUrl(author?.avatar || '')
  const displayName = useMemo(() => getProfileDisplayName(author), [author])
  const initial = useMemo(() => getProfileInitial(author), [author])

  const descriptionText = useMemo(() => {
    return String(video?.description || video?.title || '').trim()
  }, [video?.description, video?.title])

  const commentsCount = asInt(video?.comments_count ?? video?.comments ?? 0)
  const liveCommentsCount = video?.id ? commentsMeta.getCount('video', video.id) : null
  const commentsCountToShow = typeof liveCommentsCount === 'number' ? liveCommentsCount : commentsCount

  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [showSeekDot, setShowSeekDot] = useState(false)
  const seekDotTimeoutRef = useRef(null)
  const bufferingDelayTimeoutRef = useRef(null)
  const [likeBurstKey, setLikeBurstKey] = useState(0)
  const likeBurstTimeoutRef = useRef(null)
  const liked = video?.id ? likes.isLiked('video', video.id) : false
  const likeCount = video?.id ? likes.getCount('video', video.id) : null
  const baseLikeCount = asInt(video?.likes ?? video?.likes_count ?? 0)
  const likeCountToShow = typeof likeCount === 'number' ? likeCount : baseLikeCount
  const [viewCount, setViewCount] = useState(asInt(video?.views_count ?? video?.views ?? 0))

  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const lastExactCountSyncRef = useRef({ id: null, at: 0 })

  // Reset when swapping
  useEffect(() => {
    setIsPlaying(false)
    setIsBuffering(false)
    setShowControls(false)
    setProgress(0)
    setDuration(0)
    setCurrentTime(0)
    setShowSeekDot(false)
    setLikeBurstKey(0)
    setViewCount(asInt(video?.views_count ?? video?.views ?? 0))
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
    if (bufferingDelayTimeoutRef.current) {
      clearTimeout(bufferingDelayTimeoutRef.current)
      bufferingDelayTimeoutRef.current = null
    }
    if (seekDotTimeoutRef.current) {
      clearTimeout(seekDotTimeoutRef.current)
      seekDotTimeoutRef.current = null
    }
  }, [video?.id])

  const beginBuffering = useCallback(() => {
    if (bufferingDelayTimeoutRef.current) return
    bufferingDelayTimeoutRef.current = setTimeout(() => {
      bufferingDelayTimeoutRef.current = null
      setIsBuffering(true)
    }, 140)
  }, [])

  const endBuffering = useCallback(() => {
    if (bufferingDelayTimeoutRef.current) {
      clearTimeout(bufferingDelayTimeoutRef.current)
      bufferingDelayTimeoutRef.current = null
    }
    setIsBuffering(false)
  }, [])

  const beginSeekUi = useCallback(() => {
    setShowSeekDot(true)
    if (seekDotTimeoutRef.current) {
      clearTimeout(seekDotTimeoutRef.current)
      seekDotTimeoutRef.current = null
    }
  }, [])

  const endSeekUi = useCallback(() => {
    if (seekDotTimeoutRef.current) {
      clearTimeout(seekDotTimeoutRef.current)
      seekDotTimeoutRef.current = null
    }
    seekDotTimeoutRef.current = setTimeout(() => {
      setShowSeekDot(false)
      seekDotTimeoutRef.current = null
    }, 650)
  }, [])

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

  useEffect(() => {
    if (!video?.id) return
    void commentsMeta.hydrateForIds('video', [video.id])
  }, [commentsMeta, video?.id])

  // Reels: ensure comment count is exact (avoid showing stale comments_count)
  useEffect(() => {
    if (!active) return
    const id = video?.id
    if (!id) return

    const now = Date.now()
    const last = lastExactCountSyncRef.current
    if (last?.id === id && now - (Number(last?.at) || 0) < 15000) return
    lastExactCountSyncRef.current = { id, at: now }

    let cancelled = false
    ;(async () => {
      const { count: exact, error } = await commentApi.getTotalCommentsCount({ videoId: id })
      if (cancelled) return
      if (error) return

      const cur = commentsMeta.getCount('video', id)
      if (typeof cur === 'number' && cur === exact) return
      commentsMeta.setCount('video', id, exact)
    })()

    return () => {
      cancelled = true
    }
  }, [active, commentsMeta, video?.id])

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

  // Apply mute state
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.muted = !!muted
  }, [muted])

  // Only keep a src when the slide is active (reduces network + memory).
  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    if (!playbackEnabled) {
      try {
        el.pause?.()
        el.removeAttribute('src')
        el.load?.()
      } catch {
        // ignore
      }
      endBuffering()
      unregisterVideo(playbackKey)
      return
    }

    if (active) {
      // Pausa outros vídeos (feed/explore) imediatamente ao abrir o Reels.
      // Isso evita áudio vindo do fundo e garante exclusividade.
      requestExclusivePlayback(playbackKey)
      registerVideo(playbackKey, el)
      setIsBuffering(true)
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

    endBuffering()
    unregisterVideo(playbackKey)
  }, [active, playbackEnabled, videoSrc])

  // Auto play/pause on active
  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    if (!playbackEnabled) {
      if (!el.paused) el.pause()
      setIsPlaying(false)
      return
    }

    if (active) {
      ensureUserPlaybackUnlockedOnFirstGesture()
      requestExclusivePlayback(playbackKey)
      registerVideo(playbackKey, el)
      setIsBuffering(true)
      attemptPlayWithMuteFallback(el, { muted, allowFallback: false })
        .then((res) => {
          setIsPlaying(!!res?.ok)
        })
        .catch(() => setIsPlaying(false))
    } else {
      if (!el.paused) el.pause()
      setIsPlaying(false)
    }
  }, [active, muted, onToggleMuted, playbackEnabled, videoSrc])

  // Contar view somente após assistir de verdade (>=60% visível + 2.5s tocando)
  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    const maybeStartViewTimer = () => {
      const id = video?.id
      if (!active || !id) return
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
          active &&
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

    let observer
    try {
      observer = new IntersectionObserver(
        (entries) => {
          const ratio = Number(entries?.[0]?.intersectionRatio || 0)
          visibleEnoughRef.current = ratio >= 0.6
          maybeStartViewTimer()
        },
        { threshold: [0, 0.6, 1] }
      )
      observer.observe(el)
    } catch {
      // fallback: assume visible
      visibleEnoughRef.current = true
    }

    const onPlay = () => {
      setIsPlaying(true)
      maybeStartViewTimer()
    }
    const onPause = () => {
      setIsPlaying(false)
      maybeStartViewTimer()
    }
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)

    maybeStartViewTimer()

    return () => {
      if (observer) observer.disconnect()
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      if (viewTimerRef.current) {
        clearTimeout(viewTimerRef.current)
        viewTimerRef.current = null
      }
    }
  }, [active, video?.id])

  // Hydrate global like state when slide becomes active
  useEffect(() => {
    if (!active) return
    if (!video?.id) return
    void likes.hydrateForIds('video', [video.id])
  }, [active, likes, video?.id])

  // Load follow state
  useEffect(() => {
    if (!active) return
    if (!currentUser?.id) {
      setIsFollowing(false)
      return
    }
    if (!author?.id || currentUser.id === author.id) {
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
  }, [active, author?.id, currentUser?.id])

  const togglePlay = useCallback(() => {
    const el = videoRef.current
    if (!el) return

    if (el.paused || el.ended) {
      attemptPlayWithMuteFallback(el, { muted, allowFallback: false })
        .then((res) => {
          setIsPlaying(!!res?.ok)
        })
        .catch(() => setIsPlaying(false))
    } else {
      el.pause()
      setIsPlaying(false)
    }
  }, [muted, onToggleMuted])

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

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current)
        tapTimerRef.current = null
      }
    }
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

  const handleFollow = useCallback(
    async (e) => {
      e?.stopPropagation?.()
      if (followLoading) return

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

      if (isFollowing) return

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

  return (
    <div
      className="relative h-[100dvh] w-full overflow-hidden snap-start snap-always"
      onClick={(e) => {
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
            onTap?.()
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
          onTap?.()
        }, 240)
      }}
    >
      <video
        ref={videoRef}
        src={active && playbackEnabled ? (videoSrc || undefined) : undefined}
        poster={posterSrc || ''}
        className="h-full w-full object-cover"
        playsInline
        loop
        muted={muted}
        onPlay={() => {
          setIsPlaying(true)
          endBuffering()
          requestExclusivePlayback(playbackKey)
        }}
        onPause={() => {
          setIsPlaying(false)
        }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadStart={beginBuffering}
        onWaiting={beginBuffering}
        onStalled={beginBuffering}
        onLoadedData={endBuffering}
        onCanPlay={endBuffering}
        onPlaying={() => {
          endBuffering()
          setIsPlaying(true)
          requestExclusivePlayback(playbackKey)
        }}
        onError={endBuffering}
        preload="metadata"
      />

      <AnimatePresence>
        {isBuffering && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
          >
            <Loader2 size={28} className="animate-spin text-white/70 drop-shadow" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/30 pointer-events-none" />

      <AnimatePresence>
        {!isPlaying && !isBuffering && (
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

      <div
        className="reels-progress absolute bottom-0 left-3 right-3 z-50 pb-[calc(env(safe-area-inset-bottom)+4px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Slider
          value={[progress]}
          max={100}
          step={0.1}
          onValueChange={handleProgressChange}
          onValueCommit={endSeekUi}
          onPointerDown={(e) => {
            e.stopPropagation()
            beginSeekUi()
          }}
          onPointerUp={(e) => {
            e.stopPropagation()
            endSeekUi()
          }}
          onPointerCancel={(e) => {
            e.stopPropagation()
            endSeekUi()
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-full"
          trackClassName="h-[2px] rounded-none bg-white/30"
          rangeClassName="h-full bg-primary"
          thumbClassName={`h-2 w-2 border-0 bg-primary shadow-none transition-opacity ${
            showSeekDot ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>

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
              <div className="h-12 w-12 rounded-full border-2 border-white/80 overflow-hidden bg-primary flex items-center justify-center opacity-75 hover:opacity-100 transition-opacity">
                {avatarSrc ? (
                  <img src={avatarSrc} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-primary-foreground">{initial}</span>
                )}
              </div>
            </Link>
          ) : (
            <div className="h-12 w-12 rounded-full border-2 border-white/80 overflow-hidden bg-primary flex items-center justify-center opacity-75 hover:opacity-100 transition-opacity">
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
              disabled={followLoading}
              aria-label={isFollowing ? 'Seguindo' : 'Seguir'}
              className="absolute -bottom-1 -right-1"
            >
              {isFollowing ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white border-2 border-black/40 shadow opacity-75 hover:opacity-100 transition-opacity">
                  <Check size={14} strokeWidth={3} />
                </span>
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white border-2 border-black/40 shadow opacity-75 hover:opacity-100 transition-opacity">
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
          <div
            className={`p-2.5 rounded-full ${liked ? 'bg-primary/25' : 'bg-black/45'} backdrop-blur-sm opacity-75 hover:opacity-100 transition-opacity`}
          >
            <ThumbsUp size={20} className={liked ? 'text-primary fill-primary' : 'text-white'} />
          </div>
          <span className="text-[11px] font-semibold mt-1 drop-shadow-md">
            {formatCompactNumber(likeCountToShow)}
          </span>
        </button>

        <button
          onPointerDown={() => {
            if (!video?.id) return
            void prefetchComments({ contentId: video.id, contentType: 'video', sort: 'new', userId: currentUser?.id || null })
          }}
          onClick={(e) => {
            e.stopPropagation()
            onRequestComments?.(video)
          }}
          className="flex flex-col items-center text-white hover:scale-110 transition-transform"
          aria-label="Comentários"
        >
          <div className="p-2.5 rounded-full bg-black/45 backdrop-blur-sm opacity-75 hover:opacity-100 transition-opacity">
            <MessageCircle size={20} />
          </div>
          <span className="text-[11px] font-semibold mt-1 drop-shadow-md">
            {formatCompactNumber(commentsCountToShow)}
          </span>
        </button>

        <div className="flex flex-col items-center text-white" aria-label="Visualizações">
          <div className="p-2.5 rounded-full bg-black/45 backdrop-blur-sm opacity-75 hover:opacity-100 transition-opacity">
            <Eye size={20} />
          </div>
          <span className="text-[11px] font-semibold mt-1 drop-shadow-md">
            {formatCompactNumber(viewCount)}
          </span>
        </div>
      </div>

      {/* Bottom text: name + description */}
      <div className="absolute left-3 right-16 bottom-8 z-20">
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

      {/* Mute (top right for active slide only) */}
      {active && (
        <div className="absolute right-3 top-3 z-30">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full bg-black/35 hover:bg-black/55 text-white"
            onClick={(e) => {
              e.stopPropagation()
              onToggleMuted?.()
            }}
            aria-label={muted ? 'Ativar som' : 'Mutar'}
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </Button>
        </div>
      )}
    </div>
  )
}

export const ReelsFeedModal = ({
  open,
  onOpenChange,
  initialItems,
  initialIndex = 0,
  searchTerm = '',
  pageSize = 10,
}) => {
  useOverlayLock(!!open, { navMode: 'dim' })
  const { toast } = useToast()
  const { user: currentUser } = useAuth()
  const likes = useLikes()
  const commentsMeta = useCommentsMeta()

  const computeNormalizedInitialIndex = useCallback(() => {
    const raw = Array.isArray(initialItems) ? initialItems : []
    const normalized = uniqueById(raw)

    const requested = Math.max(0, Number(initialIndex) || 0)
    const requestedItem = raw?.[requested]
    const requestedId = requestedItem?.id

    if (!requestedId) {
      const maxIdx = Math.max(0, normalized.length - 1)
      return Math.max(0, Math.min(maxIdx, requested))
    }

    const idx = normalized.findIndex((it) => String(it?.id ?? '') === String(requestedId))
    if (idx >= 0) return idx
    const maxIdx = Math.max(0, normalized.length - 1)
    return Math.max(0, Math.min(maxIdx, requested))
  }, [initialIndex, initialItems])

  const [items, setItems] = useState(() => uniqueById(initialItems || []))
  const [activeIndex, setActiveIndex] = useState(() => computeNormalizedInitialIndex())
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextPage, setNextPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [muted, setMuted] = useState(false)
  const [playbackReady, setPlaybackReady] = useState(false)

  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentsTargetId, setCommentsTargetId] = useState(null)

  const containerRef = useRef(null)
  const lastLoadRef = useRef(0)
  const scrollRafRef = useRef(null)
  const initialIndexRef = useRef(0)
  const alignRafRef = useRef(null)

  const getSlideHeight = useCallback(() => {
    const el = containerRef.current
    const h = Number(el?.clientHeight || 0)
    if (Number.isFinite(h) && h > 0) return h
    const fallback = Number(window?.innerHeight || 0)
    return fallback > 0 ? fallback : 1
  }, [])

  const computeActiveIndex = useCallback(() => {
    const el = containerRef.current
    if (!el) return 0
    const h = getSlideHeight()
    const raw = Math.round(Number(el.scrollTop || 0) / Math.max(1, h))
    const maxIdx = Math.max(0, (items?.length || 1) - 1)
    return Math.max(0, Math.min(maxIdx, raw))
  }, [getSlideHeight, items])

  const authorsByVideoId = useMemo(() => {
    const map = {}
    for (const it of items) {
      map[String(it?.id)] = it?.user || it?.author || null
    }
    return map
  }, [items])

  useLayoutEffect(() => {
    if (!open) return

    const normalized = uniqueById(initialItems || [])
    const normalizedInitialIndex = computeNormalizedInitialIndex()
    initialIndexRef.current = normalizedInitialIndex
    setItems(normalized)
    setActiveIndex(normalizedInitialIndex)
    setLoadingMore(false)
    setNextPage(1)
    setHasMore(true)
    setMuted(false)
    setPlaybackReady(false)
    setCommentsOpen(false)
    setCommentsTargetId(null)

    // We intentionally don't force scroll here with a fallback height.
    // On first app load, container height can be 0/unstable and mandatory
    // snapping may land on the wrong slide for a frame.
  }, [computeNormalizedInitialIndex, getSlideHeight, initialItems, open])

  // Align scroll position once the container has a real height.
  useEffect(() => {
    if (!open) return
    if (playbackReady) return
    if (!items || items.length === 0) return

    let tries = 0

    const run = () => {
      tries += 1
      const el = containerRef.current
      if (!el) {
        if (tries < 10) alignRafRef.current = requestAnimationFrame(run)
        return
      }

      const h = Number(el.clientHeight || 0)
      if (!Number.isFinite(h) || h <= 0) {
        if (tries < 10) alignRafRef.current = requestAnimationFrame(run)
        return
      }

      const idx = Math.max(0, Math.min(items.length - 1, Number(initialIndexRef.current) || 0))
      const prevSnap = el.style.scrollSnapType

      try {
        // Disable snapping for one frame while we position.
        el.style.scrollSnapType = 'none'
        el.scrollTop = idx * h
      } catch {
        // ignore
      }

      // Restore snap on next frame, then enable playback.
      alignRafRef.current = requestAnimationFrame(() => {
        try {
          el.style.scrollSnapType = prevSnap || ''
        } catch {
          // ignore
        }
        setActiveIndex(idx)
        setPlaybackReady(true)
      })
    }

    alignRafRef.current = requestAnimationFrame(run)

    return () => {
      if (alignRafRef.current) {
        cancelAnimationFrame(alignRafRef.current)
        alignRafRef.current = null
      }
    }
  }, [items, open, playbackReady])

  useEffect(() => {
    if (!open) return
    const v = items?.[activeIndex]
    if (!v?.id) return
    void prefetchComments({ contentId: v.id, contentType: 'video', sort: 'new', userId: currentUser?.id || null })
  }, [activeIndex, currentUser?.id, items, open])

  // Hydrate likes for loaded items (batch, 1x per page of results)
  useEffect(() => {
    if (!open) return
    const ids = (items || []).map((v) => v?.id).filter(Boolean)
    if (!ids.length) return
    void likes.hydrateForIds('video', ids)
  }, [items, likes, open])

  // Prefetch current/next/prev to avoid showing "—" on swipe
  useEffect(() => {
    if (!open) return
    const current = items?.[activeIndex]?.id
    const prev = items?.[activeIndex - 1]?.id
    const next = items?.[activeIndex + 1]?.id
    const ids = [current, prev, next].filter(Boolean)
    if (!ids.length) return
    void likes.hydrateForIds('video', ids)
  }, [activeIndex, items, likes, open])

  const toggleMuted = useCallback((options) => {
    if (options?.forceMuted) {
      setMuted(true)
      return
    }

    setMuted((prev) => !prev)
  }, [])

  const loadMore = useCallback(async () => {
    if (!open) return
    if (loadingMore) return
    if (!hasMore) return

    const now = Date.now()
    if (now - lastLoadRef.current < 600) return
    lastLoadRef.current = now

    setLoadingMore(true)
    try {
      const res = await searchVideos(String(searchTerm || ''), { limit: pageSize, page: nextPage })
      const newItems = (res?.data || []).map((v) => ({ ...v, type: 'video' }))
      if (newItems.length === 0) {
        setHasMore(false)
        return
      }
      setItems((prev) => uniqueById([...(prev || []), ...newItems]))
      setNextPage((p) => p + 1)
    } catch (e) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar mais Reels.',
        variant: 'destructive',
      })
    } finally {
      setLoadingMore(false)
    }
  }, [hasMore, loadingMore, nextPage, open, pageSize, searchTerm, toast])

  const handleScroll = useCallback(() => {
    if (!playbackReady) return
    if (scrollRafRef.current) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      const idx = computeActiveIndex()
      setActiveIndex(idx)

      if (idx >= (items?.length || 0) - 3) {
        loadMore()
      }
    })
  }, [computeActiveIndex, items?.length, loadMore, playbackReady])

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
    }
  }, [])

  const handleOpenComments = useCallback((video) => {
    const id = video?.id
    if (!id) return
    setCommentsTargetId(id)
    setCommentsOpen(true)
  }, [])
  
  const handleCommentsCountChange = useCallback(
    (nextCount) => {
      if (!commentsTargetId) return
      if (typeof nextCount !== 'number') return
      commentsMeta.setCount('video', commentsTargetId, nextCount)
    },
    [commentsMeta, commentsTargetId]
  )

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
                  Visualizador de Reels com ações de curtir e comentar.
                </DialogPrimitive.Description>

                {/* Exit (fixed) */}
                <div className={`absolute left-3 top-3 ${Z_FULLSCREEN_UI}`}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full bg-black/35 hover:bg-black/55 text-white"
                    onClick={() => onOpenChange?.(false)}
                    aria-label="Sair"
                  >
                    <ArrowLeft size={20} />
                  </Button>
                </div>

                <div
                  ref={containerRef}
                  className="h-[100dvh] w-full overflow-y-scroll overscroll-none snap-y snap-mandatory scrollbar-hide touch-pan-y"
                  onScroll={handleScroll}
                >
                  {items.map((v, idx) => (
                    <ReelSlide
                      key={String(v.id)}
                      video={v}
                      author={authorsByVideoId[String(v.id)]}
                      active={idx === activeIndex}
                      muted={muted}
                      onToggleMuted={toggleMuted}
                      onRequestComments={handleOpenComments}
                      playbackEnabled={playbackReady}
                    />
                  ))}
                </div>

                {loadingMore && (
                  <div className="pointer-events-none absolute left-0 right-0 bottom-6 z-[10002] flex items-center justify-center">
                    <div className="rounded-full bg-black/55 px-3 py-2 text-xs text-white/90 backdrop-blur">
                      Carregando mais...
                    </div>
                  </div>
                )}

                <CommentsSheet
                  open={commentsOpen}
                  onOpenChange={setCommentsOpen}
                  contentId={commentsTargetId}
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
