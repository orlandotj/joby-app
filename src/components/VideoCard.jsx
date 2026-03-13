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
  Loader2,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { buildR2VideoPlaybackUrl, useResolvedStorageUrl } from '@/lib/storageUrl'
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
import { useCommentsMeta } from '@/contexts/CommentsMetaContext'
import { CommentsSheet } from '@/components/comments/CommentsSheet'
import { prefetchComments } from '@/hooks/useComments'
import { usePrefetchCommentsOnVisible } from '@/hooks/usePrefetchCommentsOnVisible'
import { useAuth } from '@/contexts/AuthContext'
import { useLikes } from '@/contexts/LikesContext'
import { hasSessionViewedVideo, incrementVideoView, markSessionViewedVideo } from '@/services/viewService'
import { asInt, formatCompactNumber } from '@/lib/numberFormat'
import { attemptPlayWithMuteFallback, getInitialMuted } from '@/lib/videoAudioPrefs'
import { log } from '@/lib/logger'
import {
  clearActiveVideoKey,
  ensureUserPlaybackUnlockedOnFirstGesture,
  markUserPlaybackUnlocked,
  registerVideo,
  requestExclusivePlayback,
  unregisterVideo,
} from '@/lib/videoPlaybackCoordinator'

const VideoCard = ({ video, user, onLikeChange, isFirst = false }) => {
  const likes = useLikes()
  const commentsMeta = useCommentsMeta()
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(() => getInitialMuted({ defaultMuted: false }))
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showControls, setShowControls] = useState(false)
  const [likeBurstKey, setLikeBurstKey] = useState(0)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false)
  const [videoSrc, setVideoSrc] = useState('')
  const videoRef = useRef(null)
  const cardRef = useRef(null)
  const hideControlsTimeoutRef = useRef(null)
  const likeBurstTimeoutRef = useRef(null)
  const viewTimerRef = useRef(null)
  const bufferingDelayTimeoutRef = useRef(null)
  const playIntentRef = useRef(false)
  const playRequestIdRef = useRef(0)
  const isVisibleEnoughRef = useRef(false)
  const viewCountedRef = useRef(false)
  const tapTimerRef = useRef(null)
  const { toast } = useToast()
  const { user: currentUser } = useAuth()

  // Ensure we capture the first user gesture to unlock audio.
  useEffect(() => {
    ensureUserPlaybackUnlockedOnFirstGesture()
  }, [])

  const firstPosterLoggedRef = useRef(false)
  const firstVideoLoadLoggedRef = useRef(false)

  const perfEnabled =
    import.meta.env?.DEV === true &&
    typeof window !== 'undefined' &&
    window.__JOBY_PERF_VIDEO === true
  const perfMarksRef = useRef({ srcAt: 0 })

  const perfLog = useCallback(
    (event, payload) => {
      if (!perfEnabled) return
      const id = video?.id ?? ''
      const key = video?.url ?? ''
      const t = payload?.t
      const dt = payload?.dt
      // Examples:
      // [perf][video] id=123 key=videos/u/abc.mp4 event=set_src t=1234
      // [perf][video] id=123 key=videos/u/abc.mp4 event=canplay dt=56
      let line = `[perf][video] id=${id} key=${key} event=${event}`
      if (typeof t !== 'undefined') line += ` t=${t}`
      if (typeof dt !== 'undefined') line += ` dt=${dt}`
      log.debug('PERF', line)
    },
    [perfEnabled, video?.id, video?.url]
  )

  const liked = likes.isLiked('video', video?.id)
  const likeCount = likes.getCount('video', video?.id)

  const posterSrc = useResolvedStorageUrl(video?.thumbnail_url || video?.thumbnail || '')
  const avatarSrc = useResolvedStorageUrl(user?.avatar || '')
  const displayName = getProfileDisplayName(user)
  const initial = getProfileInitial(user)

  const safeDescription = String(video?.description ?? '')

  usePrefetchCommentsOnVisible({
    targetRef: cardRef,
    contentId: video?.id,
    contentType: 'video',
    sort: 'new',
    enabled: true,
  })

  // Perf: log first card poster readiness.
  useEffect(() => {
    if (!perfEnabled) return
    if (!isFirst) return
    if (firstPosterLoggedRef.current) return
    if (!posterSrc) return
    firstPosterLoggedRef.current = true
    log.debug('PERF', 'first card poster ready', { id: video?.id, t: performance.now() })
  }, [isFirst, perfEnabled, posterSrc, video?.id])

  const unloadVideo = useCallback(() => {
    const el = videoRef.current
    playRequestIdRef.current += 1
    if (el) {
      try {
        el.pause()
      } catch {
        // ignore
      }
      try {
        el.removeAttribute('src')
        el.load()
      } catch {
        // ignore
      }
    }

    playIntentRef.current = false
    setIsPlaying(false)
    setIsBuffering(false)
    clearActiveVideoKey(video?.id)
    setVideoSrc('')
    setShouldLoadVideo(false)
  }, [video?.id])

  // Lazy-load video only when near the viewport.
  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries?.[0]
        if (entry?.isIntersecting) {
          setShouldLoadVideo(true)
        }
      },
      { root: null, rootMargin: '1200px 0px', threshold: 0.01 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [video?.id])

  // Unload video when far from the viewport to keep RAM/scroll smooth.
  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries?.[0]
        if (!entry?.isIntersecting) {
          unloadVideo()
        }
      },
      { root: null, rootMargin: '1500px 0px', threshold: 0 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [unloadVideo, video?.id])

  // Only build/attach the Worker R2 playback URL when the card is near.
  useEffect(() => {
    if (!shouldLoadVideo) {
      setVideoSrc('')
      return
    }

    const next = buildR2VideoPlaybackUrl(video?.url)
    setVideoSrc(next)
  }, [shouldLoadVideo, video?.url])

  // Perf: measure time from setting src -> loadedmetadata/loadeddata/canplay/playing
  useEffect(() => {
    if (!shouldLoadVideo) return
    if (!videoSrc) return
    const t = Math.round(performance.now())
    perfMarksRef.current.srcAt = t
    perfLog('set_src', { t })
  }, [perfLog, shouldLoadVideo, videoSrc])

  // Perf: log when the first card starts loading video (shouldLoadVideo -> true).
  useEffect(() => {
    if (!perfEnabled) return
    if (!isFirst) return
    if (!shouldLoadVideo) return
    if (firstVideoLoadLoggedRef.current) return
    firstVideoLoadLoggedRef.current = true
    log.debug('PERF', 'first video start loading', { id: video?.id, t: performance.now() })
  }, [isFirst, perfEnabled, shouldLoadVideo, video?.id])

  const isCoarsePointer = useCallback(() => {
    if (typeof window === 'undefined') return false
    return Boolean(window.matchMedia?.('(pointer: coarse)')?.matches)
  }, [])

  const showControlsWithAutoHide = useCallback(
    (options) => {
      const shouldAutoHide = options?.autoHide ?? isCoarsePointer()
      const delayMs = Math.max(500, Number(options?.delayMs) || 2500)

      setShowControls(true)

      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current)
        hideControlsTimeoutRef.current = null
      }

      if (!shouldAutoHide) return

      hideControlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false)
        hideControlsTimeoutRef.current = null
      }, delayMs)
    },
    [isCoarsePointer]
  )

  const [viewCount, setViewCount] = useState(
    asInt(video?.views_count ?? video?.views ?? 0)
  )

  useEffect(() => {
    viewCountedRef.current = hasSessionViewedVideo(video?.id)
    isVisibleEnoughRef.current = false
    setLikeBurstKey(0)
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current)
      tapTimerRef.current = null
    }
    if (viewTimerRef.current) {
      clearTimeout(viewTimerRef.current)
      viewTimerRef.current = null
    }
    if (likeBurstTimeoutRef.current) {
      clearTimeout(likeBurstTimeoutRef.current)
      likeBurstTimeoutRef.current = null
    }
    if (bufferingDelayTimeoutRef.current) {
      clearTimeout(bufferingDelayTimeoutRef.current)
      bufferingDelayTimeoutRef.current = null
    }
    setIsBuffering(false)
  }, [video?.id])

  const beginBuffering = useCallback(
    (ev) => {
      const el = ev?.currentTarget || videoRef.current
      const hasPoster = Boolean(posterSrc)

      // On initial app open, avoid showing a loader while the video is paused
      // and a poster is available. Show the poster + play icon instead.
      const playbackActive =
        Boolean(playIntentRef.current) ||
        Boolean(isPlaying) ||
        (el ? !el.paused : false)

      if (!playbackActive && hasPoster) return

      if (bufferingDelayTimeoutRef.current) return
      bufferingDelayTimeoutRef.current = setTimeout(() => {
        bufferingDelayTimeoutRef.current = null
        setIsBuffering(true)
      }, 140)
    },
    [posterSrc, isPlaying]
  )

  const endBuffering = useCallback(() => {
    if (bufferingDelayTimeoutRef.current) {
      clearTimeout(bufferingDelayTimeoutRef.current)
      bufferingDelayTimeoutRef.current = null
    }
    setIsBuffering(false)
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

  const [commentsCount, setCommentsCount] = useState(null)

  useEffect(() => {
    // Reset on item change. Counts will be hydrated in batch from the Feed.
    setCommentsCount(null)
  }, [video?.id])

  const liveCommentsCount = video?.id ? commentsMeta.getCount('video', video.id) : null
  const commentsCountToShow =
    typeof liveCommentsCount === 'number'
      ? liveCommentsCount
      : typeof commentsCount === 'number'
        ? commentsCount
        : null

  const formatTime = (timeInSeconds) => {
    const minutes = Math.floor(timeInSeconds / 60)
    const seconds = Math.floor(timeInSeconds % 60)
      .toString()
      .padStart(2, '0')
    return `${minutes}:${seconds}`
  }

  const togglePlay = useCallback(() => {
    const el = videoRef.current

    // Poster-first: if the video isn't mounted yet, request lazy load and autoplay intent.
    if (!el) {
      playIntentRef.current = true
      setShouldLoadVideo(true)
      return
    }

    if (el.paused || el.ended) {
      playIntentRef.current = true
      const reqId = (playRequestIdRef.current += 1)
      attemptPlayWithMuteFallback(el, { muted: isMuted, allowFallback: false })
        .then((res) => {
          if (reqId !== playRequestIdRef.current) return
          setIsPlaying(!!res?.ok)
          if (res?.ok) {
            markUserPlaybackUnlocked()
            requestExclusivePlayback(video?.id)
          }
        })
        .catch((error) => {
          const name = String(error?.name || '')
          const msg = String(error?.message || '')
          const low = `${name} ${msg}`.toLowerCase()
          const isAbort = name === 'AbortError' || low.includes('aborterror') || low.includes('interrupted')
          if (!isAbort) log.error('VIDEO', 'Error playing video', error)
          setIsPlaying(false)
        })
    } else {
      playIntentRef.current = false
      playRequestIdRef.current += 1
      el.pause()
      setIsPlaying(false)
      clearActiveVideoKey(video?.id)
    }
  }, [isMuted, video?.id])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (!videoSrc) return
    if (!playIntentRef.current) return
    if (!el.paused && !el.ended) return

    const reqId = (playRequestIdRef.current += 1)
    attemptPlayWithMuteFallback(el, { muted: isMuted, allowFallback: false })
      .then((res) => {
        if (reqId !== playRequestIdRef.current) return
        setIsPlaying(!!res?.ok)
        if (res?.ok) {
          markUserPlaybackUnlocked()
          requestExclusivePlayback(video?.id)
        }
      })
      .catch(() => {
        setIsPlaying(false)
      })
  }, [isMuted, video?.id, videoSrc])

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      const next = !videoRef.current.muted
      videoRef.current.muted = next
      setIsMuted(next)
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

    if (!perfEnabled) return
    const now = performance.now()
    const dt = perfMarksRef.current.srcAt ? Math.round(now - perfMarksRef.current.srcAt) : null
    perfLog('loadedmetadata', { dt })
  }, [perfEnabled, perfLog])

  const handleLoadedData = useCallback(
    (e) => {
      if (perfEnabled) {
        const now = performance.now()
        const dt = perfMarksRef.current.srcAt
          ? Math.round(now - perfMarksRef.current.srcAt)
          : null
        perfLog('loadeddata', { dt })
      }
      endBuffering(e)
    },
    [endBuffering, perfEnabled, perfLog]
  )

  const handleCanPlay = useCallback(
    (e) => {
      if (perfEnabled) {
        const now = performance.now()
        const dt = perfMarksRef.current.srcAt
          ? Math.round(now - perfMarksRef.current.srcAt)
          : null
        perfLog('canplay', { dt })
      }
      endBuffering(e)
    },
    [endBuffering, perfEnabled, perfLog]
  )

  const handlePlaying = useCallback(
    (e) => {
      if (perfEnabled) {
        const now = performance.now()
        const dt = perfMarksRef.current.srcAt
          ? Math.round(now - perfMarksRef.current.srcAt)
          : null
        perfLog('playing', { dt })
      }
      endBuffering(e)
    },
    [endBuffering, perfEnabled, perfLog]
  )

  const handleProgressChange = useCallback((value) => {
    if (videoRef.current) {
      const newTime = (value[0] / 100) * videoRef.current.duration
      videoRef.current.currentTime = newTime
      setProgress(value[0])
    }
  }, [])

  const handleShare = async () => {
    const id = video?.id
    if (!id) return

    const url = new URL(`/video/${id}`, window.location.origin).toString()

    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('Clipboard API indisponível')
      }
      await navigator.clipboard.writeText(url)
      toast({
        title: 'Link copiado!',
        description: 'O link do vídeo foi copiado para sua área de transferência.',
      })
    } catch (error) {
      // Fallback: exibe o link para cópia manual
      try {
        window.prompt('Copie o link do vídeo:', url)
      } catch {
        // ignore
      }
      toast({
        title: 'Copie o link',
        description: 'Não foi possível copiar automaticamente. Use o link exibido para copiar manualmente.',
      })
    }
  }

  const handleCommentClick = () => {
    setCommentsOpen(true)
  }

  const likeDebug = useCallback(
    (stage, payload) => {
      if (typeof window === 'undefined') return
      if (!window.__JOBY_LIKE_DEBUG) return
      const callNo = (window.__likeCalls = (window.__likeCalls || 0) + 1)
      const ts = new Date().toISOString()
      log.debug('LIKES', `LIKE_DEBUG[Feed/VideoCard][${callNo}][${ts}] ${stage}`, payload)
      return callNo
    },
    []
  )

  const handleToggleLike = useCallback(
    async (e) => {
      e?.stopPropagation?.()

      if (import.meta.env.DEV) {
        log.debug('LIKES', 'LIKE CLICK', { videoId: video?.id, userId: currentUser?.id })
      }

      const before = {
        videoId: video?.id,
        liked,
        likeCount,
        source: e?.type || 'programmatic',
      }
      const debugCallNo = likeDebug('ENTER toggleLike', before)
      if (!currentUser) {
        likeDebug('BLOCK not logged', { ...before, debugCallNo })
        toast({
          title: 'Entre na sua conta',
          description: 'Você precisa estar logado para curtir.',
          variant: 'destructive',
        })
        return
      }

      try {
        const res = await likes.toggleLike('video', video.id)
        likeDebug('STORE toggleLike done', { debugCallNo, videoId: video?.id, ok: !res?.error, error: res?.error })
        if (res?.error) throw res.error
      } catch (error) {
        likeDebug('ROLLBACK error', {
          debugCallNo,
          videoId: video?.id,
          error: error?.message || error,
        })
        toast({
          title: 'Erro ao curtir',
          description: error?.message || 'Tente novamente.',
          variant: 'destructive',
        })
      }
    },
    [currentUser, liked, likeCount, likeDebug, likes, toast, video?.id]
  )

  const isCenterTap = useCallback((evt) => {
    try {
      const el = evt?.currentTarget
      if (!el?.getBoundingClientRect) return false
      const rect = el.getBoundingClientRect()
      const x = (evt?.clientX - rect.left) / Math.max(1, rect.width)
      const y = (evt?.clientY - rect.top) / Math.max(1, rect.height)

      // Zona central "instagram-like" para play/pause.
      return x >= 0.35 && x <= 0.65 && y >= 0.35 && y <= 0.65
    } catch {
      return false
    }
  }, [])

  const handleTap = useCallback((evt) => {
    // Instagram-like:
    // - 1 toque: mostra/oculta controles
    // - duplo toque (opcional): curtir
    // - toque no centro: play/pause

    const center = isCenterTap(evt)

    // Duplo-toque: curtir (não pode pausar)
    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current)
      tapTimerRef.current = null

      // Instagram-like: duplo-toque só CURTE (não descurte) e só anima se realmente vai curtir.
      if (!currentUser) {
        handleToggleLike()
        return
      }
      if (liked) return

      setLikeBurstKey(Date.now())
      handleToggleLike()
      return
    }

    // Toque único: aguarda um pouco para não conflitar com duplo-toque
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null

      if (center) {
        showControlsWithAutoHide({ autoHide: true, delayMs: 2500 })
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

        showControlsWithAutoHide({ autoHide: true, delayMs: 2500 })
        return true
      })
    }, 240)
  }, [currentUser, liked, handleToggleLike, isCenterTap, showControlsWithAutoHide, togglePlay])

  useEffect(() => {
    const currentVideoRef = videoRef.current
    if (!currentVideoRef) return
    if (!videoSrc) return

    const playbackKey = String(video?.id ?? '')
    if (playbackKey) registerVideo(playbackKey, currentVideoRef)

    const options = {
      root: null,
      rootMargin: '0px',
      threshold: [0, 0.3, 0.6, 1],
    }

    const maybeStartViewTimer = () => {
      const id = video?.id
      const el = currentVideoRef
      if (!id) return
      if (viewCountedRef.current) return
      if (hasSessionViewedVideo(id)) {
        viewCountedRef.current = true
        return
      }

      const canCount =
        isVisibleEnoughRef.current &&
        el &&
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
          isVisibleEnoughRef.current &&
          el &&
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

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const ratio = Number(entry?.intersectionRatio || 0)

        // Histerese: play quando entrou bem, pausa quando saiu bem.
        if (ratio >= 0.6) {
          isVisibleEnoughRef.current = true
          // Autoplay sempre que bem visível (com fallback pra muted quando necessário).
          if (currentVideoRef.paused) {
            playIntentRef.current = true
            const reqId = (playRequestIdRef.current += 1)
            attemptPlayWithMuteFallback(currentVideoRef, { muted: isMuted, allowFallback: false })
              .then((res) => {
                if (reqId !== playRequestIdRef.current) return
                setIsPlaying(!!res?.ok)
                if (res?.ok) {
                  requestExclusivePlayback(playbackKey)
                  maybeStartViewTimer()
                }
              })
              .catch((error) => {
                const name = String(error?.name || '')
                const msg = String(error?.message || '')
                const low = `${name} ${msg}`.toLowerCase()
                const isAbort =
                  name === 'AbortError' || low.includes('aborterror') || low.includes('interrupted')
                if (!isAbort) log.error('VIDEO', 'Autoplay failed', error)
                setIsPlaying(false)
              })
          } else if (!currentVideoRef.paused) {
            maybeStartViewTimer()
          }
        } else {
          if (ratio < 0.3) {
            isVisibleEnoughRef.current = false
            if (!currentVideoRef.paused) {
              playRequestIdRef.current += 1
              currentVideoRef.pause()
              setIsPlaying(false)
            }
            clearActiveVideoKey(playbackKey)
          }
          // saiu do estado ">=60%" => cancela timer
          if (ratio < 0.6) {
            isVisibleEnoughRef.current = false
            maybeStartViewTimer()
          }
        }
      })
    }, options)

    observer.observe(currentVideoRef)

    const handlePlayEvt = () => {
      playIntentRef.current = true
      setIsPlaying(true)
      requestExclusivePlayback(playbackKey)
      maybeStartViewTimer()
    }
    const handlePauseEvt = () => {
      playIntentRef.current = false
      playRequestIdRef.current += 1
      setIsPlaying(false)
      maybeStartViewTimer()
      clearActiveVideoKey(playbackKey)
    }
    currentVideoRef.addEventListener('play', handlePlayEvt)
    currentVideoRef.addEventListener('pause', handlePauseEvt)

    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current)
        hideControlsTimeoutRef.current = null
      }
      if (viewTimerRef.current) {
        clearTimeout(viewTimerRef.current)
        viewTimerRef.current = null
      }
      if (currentVideoRef) {
        observer.unobserve(currentVideoRef)
        currentVideoRef.removeEventListener('play', handlePlayEvt)
        currentVideoRef.removeEventListener('pause', handlePauseEvt)
        if (playbackKey) unregisterVideo(playbackKey)
        if (!currentVideoRef.paused) {
          playRequestIdRef.current += 1
          currentVideoRef.pause()
        }
      }
    }
  }, [video?.id, videoSrc, isMuted])

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="relative mb-3 rounded-xl overflow-hidden bg-card shadow-lg border border-border/50"
      style={{
        willChange: 'opacity',
        transform: 'translateZ(0)',
        // Chrome mobile performance: avoid rendering work for offscreen cards.
        contentVisibility: 'auto',
        containIntrinsicSize: '1px 900px',
      }}
      onMouseEnter={() => {
        if (hideControlsTimeoutRef.current) {
          clearTimeout(hideControlsTimeoutRef.current)
          hideControlsTimeoutRef.current = null
        }
        setShowControls(true)
      }}
      onMouseLeave={() => {
        setShowControls(false)
      }}
    >
      <div
        className="video-container aspect-[9/16] cursor-pointer relative"
        onClick={handleTap}
      >
        {posterSrc ? (
          <img
            src={posterSrc}
            alt={video?.title || 'Vídeo'}
            className="absolute inset-0 w-full h-full object-cover"
            loading={isFirst ? 'eager' : 'lazy'}
            fetchpriority={isFirst ? 'high' : 'auto'}
            decoding="async"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 bg-muted" aria-hidden="true" />
        )}

        {shouldLoadVideo && videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            loop
            muted={isMuted}
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onLoadStart={beginBuffering}
            onWaiting={beginBuffering}
            onStalled={beginBuffering}
            onLoadedData={handleLoadedData}
            onCanPlay={handleCanPlay}
            onPlaying={handlePlaying}
            onError={endBuffering}
            className="absolute inset-0 w-full h-full object-cover"
            preload="metadata"
            poster={posterSrc || ''}
          />
        ) : null}

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
                {Array.from({ length: 10 }).map((_, i) => {
                  const angle = (i / 10) * Math.PI * 2
                  const dx = Math.cos(angle) * 44
                  const dy = Math.sin(angle) * 44
                  return (
                    <motion.span
                      key={`p${i}`}
                      initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
                      animate={{ opacity: [0, 1, 0], x: dx, y: dy, scale: [0.6, 1.15, 0.9] }}
                      transition={{ duration: 0.48, ease: 'easeOut', times: [0, 0.25, 1] }}
                      className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-300"
                      style={{ boxShadow: '0 0 12px rgba(249,115,22,0.65)' }}
                    />
                  )
                })}

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

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10 pointer-events-none"></div>

        <AnimatePresence>
          {!isPlaying && !isBuffering && (
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
            onClick={handleToggleLike}
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
              {typeof likeCount === 'number' ? formatCompactNumber(likeCount) : '—'}
            </span>
          </button>
          <button
            onPointerDown={() => {
              if (!video?.id) return
              void prefetchComments({ contentId: video.id, contentType: 'video', sort: 'new', userId: currentUser?.id || null })
            }}
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
              {typeof commentsCountToShow === 'number' ? formatCompactNumber(commentsCountToShow) : '—'}
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
        onCountChange={setCommentsCount}
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
          {video?.title ||
            (safeDescription
              ? `${safeDescription.slice(0, 50)}${safeDescription.length > 50 ? '...' : ''}`
              : 'Sem título')}
        </h4>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2.5 leading-relaxed">
          {safeDescription}
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

export default React.memo(VideoCard)
