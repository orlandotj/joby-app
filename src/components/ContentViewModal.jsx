import React, { useMemo, useState, useRef, useEffect, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { buildR2VideoPlaybackUrl, useResolvedStorageUrl } from '@/lib/storageUrl'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import {
  ThumbsUp,
  MessageCircle,
  Share2,
  Eye,
  Send,
  Loader2,
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
import { useLikes } from '@/contexts/LikesContext'
import { useCommentsMeta } from '@/contexts/CommentsMetaContext'
import { prefetchComments } from '@/hooks/useComments'
import { useToast } from '@/components/ui/use-toast'
import { Link } from 'react-router-dom'
import { CommentsSheet } from '@/components/comments/CommentsSheet'
import { attemptPlayWithMuteFallback } from '@/lib/videoAudioPrefs'
import { ensureUserPlaybackUnlockedOnFirstGesture } from '@/lib/videoPlaybackCoordinator'
import { shareContent } from '@/lib/shareContent'
import {
  hasSessionViewedVideo,
  hasSessionViewedPhoto,
  incrementVideoView,
  incrementPhotoView,
  markSessionViewedVideo,
  markSessionViewedPhoto,
} from '@/services/viewService'
import { asInt, formatCompactNumber } from '@/lib/numberFormat'
import { Z_FULLSCREEN_CONTENT, Z_FULLSCREEN_OVERLAY } from '@/design/overlayZIndexTokens'

const ContentViewModal = ({
  isOpen,
  onClose,
  content,
  user,
  onDelete,
  onEdit,
  onRequestNext,
  onRequestPrev,
}) => {
  // Passar provider para resolver URL corretamente (R2 ou Supabase)
  const contentSrc = useResolvedStorageUrl(content?.url, { 
    provider: content?.provider 
  })
  const posterSrc = useResolvedStorageUrl(content?.thumbnail_url || content?.thumbnail || '', {
    provider: content?.provider,
  })
  const videoPlaybackSrc = useMemo(
    () => buildR2VideoPlaybackUrl(content?.url),
    [content?.url]
  )
  const videoDisplaySrc = isOpen && (content?.type === 'video' || content?.video_type) ? videoPlaybackSrc : ''
  const userAvatarSrc = useResolvedStorageUrl(user?.avatar || '')
  const { user: currentUser } = useAuth()
  const likes = useLikes()
  const commentsMeta = useCommentsMeta()
  const currentUserAvatarSrc = useResolvedStorageUrl(currentUser?.avatar || '')
  const { toast } = useToast()
  const videoRef = useRef(null)
  const tapTimerRef = useRef(null)
  const tapCountRef = useRef(0)
  const lastTapSideRef = useRef('right')
  const lastTapCenterRef = useRef(false)
  const seekOverlayTimerRef = useRef(null)
  const hideControlsTimeoutRef = useRef(null)
  const swipePointerIdRef = useRef(null)
  const swipeStartXRef = useRef(0)
  const swipeStartYRef = useRef(0)
  const swipeDxRef = useRef(0)
  const swipeDyRef = useRef(0)
  const swipeIsHorizontalRef = useRef(false)
  const suppressTapRef = useRef(false)
  const suppressTapTimerRef = useRef(null)
  const outsidePressRef = useRef(false)
  const suppressNextClickRef = useRef(false)
  const suppressNextClickTimeoutRef = useRef(null)
  const isScrubbingRef = useRef(false)
  const lastUiTickRef = useRef(0)
  const videoAspectCacheRef = useRef(new Map())

  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoAspect, setVideoAspect] = useState(9 / 16)
  const [imageAspect, setImageAspect] = useState(1)
  const [viewCount, setViewCount] = useState(
    asInt(content?.views_count ?? content?.views ?? 0)
  )
  const [commentsCount, setCommentsCount] = useState(
    asInt(content?.comments_count ?? content?.comments ?? 0)
  )
  const [commentsOpen, setCommentsOpen] = useState(false)
  const viewedOnceRef = useRef(false)
  const viewTimerRef = useRef(null)
  const viewCountedRef = useRef(false)
  const visibleEnoughRef = useRef(true)
  const [seekOverlay, setSeekOverlay] = useState(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteConfirmPayload, setDeleteConfirmPayload] = useState(null)

  const isVideo = content?.type === 'video' || content?.video_type
  const contentLikeType = isVideo ? 'video' : 'photo'
  const contentCommentsType = isVideo ? 'video' : 'photo'
  const liked = content?.id ? likes.isLiked(contentLikeType, content.id) : false
  const likeCount = content?.id ? likes.getCount(contentLikeType, content.id) : null
  const liveCommentsCount = content?.id ? commentsMeta.getCount(contentCommentsType, content.id) : null
  const commentsCountToShow = typeof liveCommentsCount === 'number' ? liveCommentsCount : commentsCount

  const clampAspect = (ar) => {
    const n = Number(ar)
    if (!Number.isFinite(n) || n <= 0) return 9 / 16
    return Math.min(2.2, Math.max(0.45, n))
  }

  // Autoplay de vídeo ao abrir (preview de publicações)
  // useLayoutEffect aumenta a chance do autoplay com som funcionar,
  // pois roda no mesmo "turn" do clique que abriu o modal.
  useLayoutEffect(() => {
    if (!isOpen || !isVideo) return

    // Reset básico ao abrir/trocar de conteúdo
    setIsPlaying(false)
    setIsBuffering(true)
    setProgress(0)
    setCurrentTime(0)

    const el = videoRef.current
    if (!el) return

    ensureUserPlaybackUnlockedOnFirstGesture()

    let cancelled = false

    // Tentamos tocar com som; se o navegador bloquear, fazemos fallback para muted.
    // Importante: em alguns navegadores mobile o timing do mount/canplay varia,
    // então tentamos agora e também quando o vídeo estiver pronto.
    const desiredMuted = false

    const attempt = async () => {
      if (cancelled) return
      try {
        el.autoplay = true
      } catch {
        // ignore
      }

      try {
        const res = await attemptPlayWithMuteFallback(el, { muted: desiredMuted, allowFallback: false })
        if (cancelled) return
        if (typeof res?.muted === 'boolean') setIsMuted(res.muted)
        if (typeof res?.ok === 'boolean') setIsPlaying(res.ok)
      } catch {
        // ignore
      }
    }

    const onReady = () => {
      void attempt()
    }

    try {
      el.addEventListener('loadeddata', onReady)
      el.addEventListener('canplay', onReady)
    } catch {
      // ignore
    }

    void attempt()

    return () => {
      cancelled = true
      try {
        el.removeEventListener('loadeddata', onReady)
        el.removeEventListener('canplay', onReady)
      } catch {
        // ignore
      }
    }
  }, [isOpen, isVideo, videoDisplaySrc, content?.id])

  // Hidratar likes globais (meus likes + contagem real) ao abrir/trocar conteúdo
  useEffect(() => {
    if (!isOpen) return
    if (!content?.id) return
    void likes.hydrateForIds(contentLikeType, [content.id])
  }, [content?.id, contentLikeType, isOpen, likes])

  // Hidratar comments_count global (para refletir sem abrir os comentários)
  useEffect(() => {
    if (!isOpen) return
    if (!content?.id) return
    void commentsMeta.hydrateForIds(contentCommentsType, [content.id])
  }, [commentsMeta, content?.id, contentCommentsType, isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (!content?.id) return
    void prefetchComments({ contentId: content.id, contentType: contentCommentsType, sort: 'new', userId: currentUser?.id || null })
  }, [content?.id, contentCommentsType, currentUser?.id, isOpen])

  // Pausar vídeo ao fechar
  useEffect(() => {
    if (isOpen) return
    const el = videoRef.current
    if (el) {
      try {
        if (!el.paused) el.pause()
        el.removeAttribute('src')
        el.load?.()
      } catch {
        // ignore
      }
    }
    setIsPlaying(false)
    setIsBuffering(false)
    setShowControls(false)
    if (hideControlsTimeoutRef.current) {
      window.clearTimeout(hideControlsTimeoutRef.current)
      hideControlsTimeoutRef.current = null
    }
  }, [isOpen])

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current)
      if (seekOverlayTimerRef.current) window.clearTimeout(seekOverlayTimerRef.current)
      if (hideControlsTimeoutRef.current) window.clearTimeout(hideControlsTimeoutRef.current)
      if (suppressTapTimerRef.current) window.clearTimeout(suppressTapTimerRef.current)
    }
  }, [])

  const clearSuppressTapSoon = () => {
    if (suppressTapTimerRef.current) {
      window.clearTimeout(suppressTapTimerRef.current)
      suppressTapTimerRef.current = null
    }
    suppressTapTimerRef.current = window.setTimeout(() => {
      suppressTapRef.current = false
      suppressTapTimerRef.current = null
    }, 260)
  }

  const handleSwipeNavigate = (direction) => {
    // direction: 'next' | 'prev'
    const el = videoRef.current
    try {
      if (el && !el.paused) el.pause()
    } catch {
      // ignore
    }

    if (direction === 'next') onRequestNext?.()
    else onRequestPrev?.()
  }

  const handleSwipePointerDown = (e) => {
    if (!isOpen) return
    if (!onRequestNext && !onRequestPrev) return
    if (isScrubbingRef.current) return

    // Não iniciar swipe em controles/links/botões
    const target = e?.target
    if (target?.closest?.('button,a,input,textarea,[role="button"],[data-no-swipe="true"]')) return

    if (typeof e?.button === 'number' && e.button !== 0) return
    if (e?.pointerType === 'mouse' && e?.buttons === 0) return

    swipePointerIdRef.current = e.pointerId
    swipeStartXRef.current = Number(e.clientX || 0)
    swipeStartYRef.current = Number(e.clientY || 0)
    swipeDxRef.current = 0
    swipeDyRef.current = 0
    swipeIsHorizontalRef.current = false
  }

  const handleSwipePointerMove = (e) => {
    if (swipePointerIdRef.current == null) return
    if (e.pointerId !== swipePointerIdRef.current) return
    if (isScrubbingRef.current) return

    const dx = Number(e.clientX || 0) - swipeStartXRef.current
    const dy = Number(e.clientY || 0) - swipeStartYRef.current
    swipeDxRef.current = dx
    swipeDyRef.current = dy

    if (!swipeIsHorizontalRef.current) {
      const adx = Math.abs(dx)
      const ady = Math.abs(dy)
      if (adx < 12 && ady < 12) return

      // trava eixo para horizontal se o gesto for claramente horizontal
      if (adx > ady * 1.2) {
        swipeIsHorizontalRef.current = true
        suppressTapRef.current = true
        clearSuppressTapSoon()
      } else {
        // gesto vertical: não é navegação
        swipePointerIdRef.current = null
        swipeIsHorizontalRef.current = false
        return
      }
    }

    if (swipeIsHorizontalRef.current) {
      e.preventDefault()
    }
  }

  const handleSwipePointerEnd = () => {
    if (swipePointerIdRef.current == null) return

    const dx = swipeDxRef.current
    const dy = swipeDyRef.current
    const adx = Math.abs(dx)
    const ady = Math.abs(dy)
    const isHorizontal = swipeIsHorizontalRef.current && adx > ady * 1.2

    swipePointerIdRef.current = null
    swipeIsHorizontalRef.current = false

    if (!isHorizontal) return
    if (adx < 70) return

    suppressTapRef.current = true
    clearSuppressTapSoon()

    if (dx < 0) {
      if (onRequestNext) handleSwipeNavigate('next')
      return
    }

    if (onRequestPrev) handleSwipeNavigate('prev')
  }

  const showControlsWithAutoHide = (options) => {
    const delayMs = Math.max(500, Number(options?.delayMs) || 2500)
    const autoHide = options?.autoHide ?? true

    setShowControls(true)

    if (hideControlsTimeoutRef.current) {
      window.clearTimeout(hideControlsTimeoutRef.current)
      hideControlsTimeoutRef.current = null
    }

    if (!autoHide) return

    hideControlsTimeoutRef.current = window.setTimeout(() => {
      setShowControls(false)
      hideControlsTimeoutRef.current = null
    }, delayMs)
  }

  // Views de vídeo (credível): >=60% visível + 2.5s tocando + 1x por sessão
  useEffect(() => {
    if (!isOpen || !isVideo) return
    const id = content?.id
    const el = videoRef.current
    if (!id || !el) return

    viewCountedRef.current = hasSessionViewedVideo(id)
    visibleEnoughRef.current = true
    if (viewTimerRef.current) {
      clearTimeout(viewTimerRef.current)
      viewTimerRef.current = null
    }

    const maybeStartViewTimer = () => {
      if (!isOpen) return
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
          isOpen &&
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
      visibleEnoughRef.current = true
    }

    const onPlay = () => maybeStartViewTimer()
    const onPause = () => maybeStartViewTimer()
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
  }, [isOpen, isVideo, content?.id])

  // Views de foto (credível): modal aberto + 2.5s visível + 1x por sessão
  useEffect(() => {
    if (!isOpen || isVideo) return
    const id = content?.id
    if (!id) return

    // Evita contar duas vezes no mesmo modal/troca
    if (viewTimerRef.current) {
      clearTimeout(viewTimerRef.current)
      viewTimerRef.current = null
    }

    if (viewedOnceRef.current) return
    if (hasSessionViewedPhoto(id)) {
      viewedOnceRef.current = true
      return
    }

    viewTimerRef.current = setTimeout(async () => {
      viewTimerRef.current = null
      if (!isOpen) return
      if (content?.id !== id) return
      if (content?.type === 'video' || content?.video_type) return
      if (viewedOnceRef.current) return
      if (hasSessionViewedPhoto(id)) {
        viewedOnceRef.current = true
        return
      }

      viewedOnceRef.current = true
      markSessionViewedPhoto(id)
      try {
        const { views } = await incrementPhotoView(id)
        if (typeof views === 'number') setViewCount(views)
        else setViewCount((prev) => prev + 1)
      } catch {
        setViewCount((prev) => prev + 1)
      }
    }, 2500)

    return () => {
      if (viewTimerRef.current) {
        clearTimeout(viewTimerRef.current)
        viewTimerRef.current = null
      }
    }
  }, [isOpen, isVideo, content?.id])

  useEffect(() => {
    // Se trocar o conteúdo dentro do mesmo modal, resetar o flag
    viewedOnceRef.current = false
    setViewCount(asInt(content?.views_count ?? content?.views ?? 0))
    setCommentsCount(asInt(content?.comments_count ?? content?.comments ?? 0))
    setImageAspect(1)
    setDuration(0)
    setCurrentTime(0)
    setProgress(0)

    // Evita "bugada" ao alternar formatos (ex: quadrado -> reels):
    // usa cache instantâneo se existir; senão cai para padrão até carregar metadata/poster.
    const key = String(content?.id || '')
    const cached = key ? videoAspectCacheRef.current.get(key) : null
    setVideoAspect(clampAspect(cached ?? 9 / 16))
  }, [content?.id])

  // Antes do vídeo carregar metadata, tente inferir o formato pelo poster (thumbnail)
  // para abrir "instantaneamente" no tamanho correto.
  useEffect(() => {
    if (!isOpen || !isVideo) return
    if (!posterSrc) return
    const key = String(content?.id || '')
    if (key && videoAspectCacheRef.current.has(key)) return

    let cancelled = false
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      if (cancelled) return
      const w = Number(img.naturalWidth || 0)
      const h = Number(img.naturalHeight || 0)
      if (w > 0 && h > 0) {
        const ar = clampAspect(w / h)
        setVideoAspect(ar)
        if (key) videoAspectCacheRef.current.set(key, ar)
      }
    }
    img.src = posterSrc

    return () => {
      cancelled = true
    }
  }, [isOpen, isVideo, posterSrc, content?.id])

  const handleImageLoaded = (e) => {
    const img = e?.currentTarget
    const w = Number(img?.naturalWidth || 0)
    const h = Number(img?.naturalHeight || 0)
    if (w > 0 && h > 0) {
      const ar = w / h
      const clamped = Math.min(2.2, Math.max(0.45, ar))
      setImageAspect(clamped)
    }
  }

  const togglePlay = async () => {
    const el = videoRef.current
    if (!el) return

    if (!el.paused) {
      el.pause()
      return
    }

    try {
      const p = el.play()
      if (p && typeof p.then === 'function') await p
    } catch {
      // Em clique/toque do usuário, normalmente o play com som é permitido.
      // Se ainda falhar, mantemos pausado sem auto-mutar.
    }
  }

  const seekBy = (deltaSeconds) => {
    const el = videoRef.current
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return
    const next = Math.max(0, Math.min(el.duration, (el.currentTime || 0) + deltaSeconds))
    el.currentTime = next
  }

  const showSeekOverlay = (side, deltaSeconds) => {
    if (!deltaSeconds) return
    const abs = Math.abs(Math.round(deltaSeconds))
    const sign = deltaSeconds > 0 ? '+' : '-'

    setSeekOverlay({ side: side === 'left' ? 'left' : 'right', text: `${sign}${abs}s` })

    if (seekOverlayTimerRef.current) window.clearTimeout(seekOverlayTimerRef.current)
    seekOverlayTimerRef.current = window.setTimeout(() => {
      setSeekOverlay(null)
      seekOverlayTimerRef.current = null
    }, 450)
  }

  const handleVideoTap = (e) => {
    // Mantém o gesto dentro do modal e evita fechar por "clique fora"
    e.stopPropagation()

    if (suppressTapRef.current) return

    let centerTap = false

    try {
      const el = videoRef.current
      const rect = el?.getBoundingClientRect?.()
      const x = Number(e?.clientX || 0)
      const y = Number(e?.clientY || 0)
      if (rect && rect.width > 0) {
        const xr = (x - rect.left) / Math.max(1, rect.width)
        const yr = (y - rect.top) / Math.max(1, rect.height)
        centerTap = xr >= 0.35 && xr <= 0.65 && yr >= 0.35 && yr <= 0.65
        lastTapSideRef.current = x < rect.left + rect.width / 2 ? 'left' : 'right'
      }
    } catch {
      // ignore
    }

    lastTapCenterRef.current = centerTap

    tapCountRef.current += 1

    // Janela curta para agrupar múltiplos toques/cliques
    const windowMs = 260
    if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current)

    tapTimerRef.current = window.setTimeout(async () => {
      const count = tapCountRef.current
      tapCountRef.current = 0
      tapTimerRef.current = null

      if (count <= 1) {
        if (lastTapCenterRef.current) {
          showControlsWithAutoHide({ delayMs: 2500, autoHide: true })
          await togglePlay()
          return
        }

        setShowControls((prev) => {
          const next = !prev
          if (!next) {
            if (hideControlsTimeoutRef.current) {
              window.clearTimeout(hideControlsTimeoutRef.current)
              hideControlsTimeoutRef.current = null
            }
            return false
          }
          showControlsWithAutoHide({ delayMs: 2500, autoHide: true })
          return true
        })
        return
      }

      // 2+ toques rápidos: avançar (direita) ou voltar (esquerda)
      // Ex: 2 toques = 10s, 3 = 15s, ...
      const seconds = count * 5
      const side = lastTapSideRef.current === 'left' ? 'left' : 'right'
      const delta = side === 'left' ? -seconds : seconds

      showControlsWithAutoHide({ delayMs: 2500, autoHide: true })
      seekBy(delta)
      showSeekOverlay(side, delta)
    }, windowMs)
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

    try {
      const res = await likes.toggleLike(contentLikeType, content.id)
      if (res?.error) throw res.error
    } catch (error) {
      toast({
        title: 'Erro ao curtir',
        description: error?.message || 'Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  const handleTimeUpdate = () => {
    const el = videoRef.current
    if (!el) return
    if (isScrubbingRef.current) return

    // Evita re-render excessivo (especialmente caro com blur/sombras)
    const now = performance?.now ? performance.now() : Date.now()
    if (now - lastUiTickRef.current < 120) return
    lastUiTickRef.current = now

    const t = Number(el.currentTime || 0)
    const d = Number(el.duration || 0)
    setCurrentTime(t)
    setProgress(d > 0 ? (t / d) * 100 : 0)
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)

      const vw = Number(videoRef.current.videoWidth || 0)
      const vh = Number(videoRef.current.videoHeight || 0)
      if (vw > 0 && vh > 0) {
        const ar = clampAspect(vw / vh)
        setVideoAspect(ar)
        const key = String(content?.id || '')
        if (key) videoAspectCacheRef.current.set(key, ar)
      }
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

  const closeModal = () => {
    onClose?.(false)
  }

  // Touch events can be passive by default on some browsers, so calling
  // preventDefault() inside React onTouchStart/onTouchEnd may log:
  // "Unable to preventDefault inside passive event listener invocation."
  // When closing on touchend, a delayed synthetic click can hit the page behind.
  // We suppress exactly the next click (capture phase) to prevent that.
  useEffect(() => {
    const onClickCapture = (e) => {
      if (!suppressNextClickRef.current) return
      suppressNextClickRef.current = false

      if (suppressNextClickTimeoutRef.current) {
        window.clearTimeout(suppressNextClickTimeoutRef.current)
        suppressNextClickTimeoutRef.current = null
      }

      e.preventDefault()
      e.stopPropagation()
    }

    document.addEventListener('click', onClickCapture, true)
    return () => {
      document.removeEventListener('click', onClickCapture, true)
      if (suppressNextClickTimeoutRef.current) {
        window.clearTimeout(suppressNextClickTimeoutRef.current)
        suppressNextClickTimeoutRef.current = null
      }
    }
  }, [])

  const handleShare = async () => {
    const url = (() => {
      try {
        return String(window.location.href || '').trim()
      } catch {
        return ''
      }
    })()

    const rawTitle = isVideo ? content?.title : content?.caption
    const title = String(rawTitle || '').trim()
    const text = title ? '' : isVideo ? 'Vídeo no JOBY' : 'Foto no JOBY'

    try {
      const res = await shareContent({ title, text, url })

      if (res?.method === 'clipboard') {
        toast({
          title: 'Link copiado!',
          description: 'O link foi copiado para sua área de transferência.',
        })
      }

      if (res?.method === 'prompt') {
        toast({
          title: 'Copie o link',
          description: 'Use o link exibido para copiar manualmente.',
        })
      }
    } catch {
      toast({
        title: 'Falha ao compartilhar',
        description: 'Não foi possível compartilhar este conteúdo no momento.',
        variant: 'destructive',
      })
    }
  }

  if (!content) return null

  const contentType = isVideo ? 'video' : 'photo'

  return (
    <Dialog open={isOpen} onOpenChange={onClose} navMode="dim">
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={`fixed inset-0 ${Z_FULLSCREEN_OVERLAY} bg-black/45 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0`} />
        <DialogPrimitive.Content
          className={`fixed inset-0 ${Z_FULLSCREEN_CONTENT} p-0 outline-none`}
        >
          <DialogPrimitive.Title className="sr-only">
            {isVideo
              ? `Vídeo: ${content?.title || 'conteúdo'}`
              : `Foto: ${content?.caption || 'conteúdo'}`}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Modal de visualização de conteúdo com curtidas e comentários.
          </DialogPrimitive.Description>
          {isVideo ? (
            <div
              className="relative h-[100dvh] w-[100dvw] flex items-center justify-center p-3 sm:p-6"
              onTouchStart={(e) => {
                // Em mobile, o navegador pode gerar um "click" atrasado após o touchend.
                // Se fecharmos no pointerup/touchend sem prevenir, esse click pode cair no conteúdo por trás.
                if (e.target !== e.currentTarget) return
                e.stopPropagation()
                outsidePressRef.current = true
              }}
              onTouchEnd={(e) => {
                if (!outsidePressRef.current) return
                outsidePressRef.current = false
                if (e.target !== e.currentTarget) return
                e.stopPropagation()
                suppressNextClickRef.current = true
                if (suppressNextClickTimeoutRef.current) {
                  window.clearTimeout(suppressNextClickTimeoutRef.current)
                }
                suppressNextClickTimeoutRef.current = window.setTimeout(() => {
                  suppressNextClickRef.current = false
                  suppressNextClickTimeoutRef.current = null
                }, 450)
                closeModal()
              }}
              onClick={(e) => {
                // Desktop (ou navegadores sem touch): fecha no click consumindo o evento.
                if (e.target !== e.currentTarget) return
                e.preventDefault()
                e.stopPropagation()
                closeModal()
              }}
            >
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                className="relative w-auto max-w-[92vw] max-h-[92vh] rounded-3xl overflow-hidden border border-white/10 bg-black/25 shadow-2xl backdrop-blur-xl flex flex-col"
              >
                <div
                  className="relative mx-auto overflow-hidden"
                  onPointerDown={handleSwipePointerDown}
                  onPointerMove={handleSwipePointerMove}
                  onPointerUp={handleSwipePointerEnd}
                  onPointerCancel={handleSwipePointerEnd}
                  style={{
                    // Preencher melhor em diferentes telas (evita card pequeno demais)
                    height: videoAspect > 1.05 ? 'clamp(280px, 50vh, 520px)' : 'clamp(380px, 68vh, 720px)',
                    aspectRatio: String(videoAspect),
                    maxWidth: '92vw',
                    touchAction: onRequestNext || onRequestPrev ? 'pan-y' : undefined,
                  }}
                >
                  {/* Content layer */}
                  <div className="relative z-10 h-full w-full">
                    {/* Top bar: back + menu */}
                    <div className="absolute left-3 right-3 top-3 sm:left-4 sm:right-4 sm:top-4 z-20 flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="h-10 w-10 rounded-full bg-black/35 hover:bg-black/45 text-white backdrop-blur-md"
                      >
                        <ArrowLeft size={20} />
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 rounded-full bg-black/35 hover:bg-black/45 text-white backdrop-blur-md"
                          >
                            <MoreVertical size={20} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {currentUser?.id === user?.id ? (
                            <>
                              <DropdownMenuItem
                                onClick={() => {
                                  if (onEdit) return onEdit({ ...content, type: 'video' })
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
                                }}
                              >
                                <Download size={16} className="mr-2" />
                                Baixar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  setDeleteConfirmPayload({ ...content, type: 'video' })
                                  setDeleteConfirmOpen(true)
                                }}
                              >
                                <Trash2 size={16} className="mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <>
                              <DropdownMenuItem onClick={handleShare}>
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
                                    description: 'Recebemos sua denúncia e iremos analisar.',
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

                    <div className="h-full w-full rounded-t-2xl overflow-hidden bg-transparent">
                      {!videoDisplaySrc ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="text-center px-6">
                            <VideoIcon className="mx-auto h-14 w-14 text-white/40 mb-3" />
                            <p className="text-sm text-white/80 font-medium">Vídeo não disponível</p>
                            <p className="text-xs text-white/60 mt-2">Verifique a configuração do Worker</p>
                          </div>
                        </div>
                      ) : (
                        <div className="relative h-full w-full">
                          <video
                            key={String(content?.id || videoDisplaySrc || '')}
                            ref={videoRef}
                            src={videoDisplaySrc}
                            poster={posterSrc || undefined}
                            className="h-full w-full object-cover"
                            preload="metadata"
                            loop
                            autoPlay
                            muted={isMuted}
                            onClick={handleVideoTap}
                            playsInline
                            onLoadStart={() => setIsBuffering(true)}
                            onWaiting={() => setIsBuffering(true)}
                            onStalled={() => setIsBuffering(true)}
                            onLoadedData={() => setIsBuffering(false)}
                            onCanPlay={() => setIsBuffering(false)}
                            onPlay={() => {
                              setIsBuffering(false)
                              setIsPlaying(true)
                              if (showControls) {
                                showControlsWithAutoHide({ delayMs: 2500, autoHide: true })
                              }
                            }}
                            onPause={() => {
                              setIsPlaying(false)
                            }}
                            onError={() => setIsBuffering(false)}
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={handleLoadedMetadata}
                          />

                          {/* Skip/rewind feedback */}
                          <AnimatePresence>
                            {seekOverlay && (
                              <motion.div
                                key={`${seekOverlay.side}:${seekOverlay.text}`}
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                transition={{ duration: 0.12 }}
                                className={
                                  seekOverlay.side === 'left'
                                    ? 'pointer-events-none absolute top-1/2 left-6 -translate-y-1/2'
                                    : 'pointer-events-none absolute top-1/2 right-6 -translate-y-1/2'
                                }
                              >
                                <div className="rounded-full bg-black/55 backdrop-blur-md border border-white/10 px-4 py-2 shadow-xl">
                                  <span className="text-white text-sm font-semibold">{seekOverlay.text}</span>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Play indicator (Joby padrão: indicador visual, toque é pelo gesto no centro) */}
                          <AnimatePresence>
                            {isBuffering && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                              >
                                <Loader2 size={34} className="animate-spin text-white/70 drop-shadow" />
                              </motion.div>
                            )}
                          </AnimatePresence>

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

                          {/* Bottom controls, with extra spacing from edges */}
                          <AnimatePresence>
                            {showControls && (
                              <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 8 }}
                                transition={{ duration: 0.14 }}
                                className="absolute bottom-4 left-4 right-4"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="bg-black/60 backdrop-blur-sm rounded-2xl px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        showControlsWithAutoHide({ delayMs: 2500, autoHide: true })
                                        togglePlay()
                                      }}
                                      className="text-white hover:text-primary transition-colors"
                                      aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
                                    >
                                      {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                                    </button>
                                    <span className="text-white text-xs font-mono min-w-[34px] text-right">
                                      {formatTime(currentTime)}
                                    </span>
                                    <Slider
                                      value={[progress]}
                                      max={100}
                                      step={0.1}
                                      onValueChange={handleProgressChange}
                                      onPointerDown={(e) => {
                                        e.stopPropagation()
                                        isScrubbingRef.current = true
                                        setShowControls(true)
                                        if (hideControlsTimeoutRef.current) {
                                          window.clearTimeout(hideControlsTimeoutRef.current)
                                          hideControlsTimeoutRef.current = null
                                        }
                                      }}
                                      onPointerUp={(e) => {
                                        e.stopPropagation()
                                        isScrubbingRef.current = false
                                        showControlsWithAutoHide({ delayMs: 2500, autoHide: true })
                                      }}
                                      onPointerCancel={(e) => {
                                        e.stopPropagation()
                                        isScrubbingRef.current = false
                                        showControlsWithAutoHide({ delayMs: 2500, autoHide: true })
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="flex-1 min-w-0"
                                    />
                                    <span className="text-white text-xs font-mono min-w-[34px]">
                                      {formatTime(duration)}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        showControlsWithAutoHide({ delayMs: 2500, autoHide: true })
                                        toggleMute()
                                      }}
                                      className="text-white hover:text-primary transition-colors"
                                      aria-label={isMuted ? 'Ativar som' : 'Silenciar'}
                                    >
                                      {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        showControlsWithAutoHide({ delayMs: 2500, autoHide: true })
                                        toggleFullscreen()
                                      }}
                                      className="text-white hover:text-primary transition-colors"
                                      aria-label="Tela cheia"
                                    >
                                      <Maximize size={20} />
                                    </button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-background/85 backdrop-blur-md px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/profile/${user?.id}`}
                      className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={userAvatarSrc} alt={user?.name} />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {user?.name?.charAt(0)?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{user?.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{user?.profession}</div>
                      </div>
                    </Link>

                    <div className="ml-auto flex items-center gap-1">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleLike}
                            className="h-9 w-9 rounded-full bg-transparent hover:bg-transparent active:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                          >
                            <ThumbsUp size={18} className={liked ? 'text-primary fill-primary' : ''} />
                          </Button>
                          <span className="-mt-1 text-[11px] font-semibold leading-none text-muted-foreground">
                            {typeof likeCount === 'number' ? formatCompactNumber(likeCount) : '—'}
                          </span>
                        </div>

                        <div className="flex flex-col items-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onPointerDown={() => {
                              if (!content?.id) return
                              void prefetchComments({ contentId: content.id, contentType: contentCommentsType, sort: 'new', userId: currentUser?.id || null })
                            }}
                            onClick={openComments}
                            className="h-9 w-9 rounded-full bg-transparent hover:bg-foreground/10 active:bg-foreground/15 focus-visible:ring-0 focus-visible:ring-offset-0"
                          >
                            <MessageCircle size={18} />
                          </Button>
                          <span className="-mt-1 text-[11px] font-semibold leading-none text-muted-foreground">
                            {formatCompactNumber(commentsCountToShow)}
                          </span>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleShare}
                          className="h-9 w-9 rounded-full bg-transparent hover:bg-foreground/10 active:bg-foreground/15 focus-visible:ring-0 focus-visible:ring-offset-0"
                        >
                          <Share2 size={18} />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <Eye size={14} />
                      {formatCompactNumber(viewCount)} views
                    </span>
                  </div>

                  {(content.caption || content.title || content.description) && (
                    <p className="mt-2 text-sm text-foreground/90 line-clamp-2">
                      {content.caption || content.title || content.description}
                    </p>
                  )}
                </div>
              </motion.div>
            </div>
          ) : (
            <div
              className="relative h-[100dvh] w-[100dvw] flex items-center justify-center p-3 sm:p-6"
              onTouchStart={(e) => {
                if (e.target !== e.currentTarget) return
                e.stopPropagation()
                outsidePressRef.current = true
              }}
              onTouchEnd={(e) => {
                if (!outsidePressRef.current) return
                outsidePressRef.current = false
                if (e.target !== e.currentTarget) return
                e.stopPropagation()
                suppressNextClickRef.current = true
                if (suppressNextClickTimeoutRef.current) {
                  window.clearTimeout(suppressNextClickTimeoutRef.current)
                }
                suppressNextClickTimeoutRef.current = window.setTimeout(() => {
                  suppressNextClickRef.current = false
                  suppressNextClickTimeoutRef.current = null
                }, 450)
                closeModal()
              }}
              onClick={(e) => {
                if (e.target !== e.currentTarget) return
                e.preventDefault()
                e.stopPropagation()
                closeModal()
              }}
            >
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                className="relative w-auto max-w-[92vw] max-h-[92vh] rounded-3xl overflow-hidden border border-white/10 bg-black/25 shadow-2xl backdrop-blur-xl flex flex-col"
              >
                <div
                  className="relative mx-auto overflow-hidden"
                  onPointerDown={handleSwipePointerDown}
                  onPointerMove={handleSwipePointerMove}
                  onPointerUp={handleSwipePointerEnd}
                  onPointerCancel={handleSwipePointerEnd}
                  style={{
                    height: imageAspect > 1.05 ? 'clamp(280px, 50vh, 520px)' : 'clamp(380px, 68vh, 720px)',
                    aspectRatio: String(imageAspect),
                    maxWidth: '92vw',
                    touchAction: onRequestNext || onRequestPrev ? 'pan-y' : undefined,
                  }}
                >
                  <div className="relative z-10 h-full w-full">
                    {/* Top bar: back + menu */}
                    <div className="absolute left-3 right-3 top-3 sm:left-4 sm:right-4 sm:top-4 z-20 flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="h-10 w-10 rounded-full bg-black/35 hover:bg-black/45 text-white backdrop-blur-md"
                      >
                        <ArrowLeft size={20} />
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 rounded-full bg-black/35 hover:bg-black/45 text-white backdrop-blur-md"
                          >
                            <MoreVertical size={20} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {currentUser?.id === user?.id ? (
                            <>
                              <DropdownMenuItem
                                onClick={() => {
                                  if (onEdit) return onEdit({ ...content, type: 'photo' })
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
                                }}
                              >
                                <Download size={16} className="mr-2" />
                                Baixar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  setDeleteConfirmPayload({ ...content, type: 'photo' })
                                  setDeleteConfirmOpen(true)
                                }}
                              >
                                <Trash2 size={16} className="mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <>
                              <DropdownMenuItem onClick={handleShare}>
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
                                    description: 'Recebemos sua denúncia e iremos analisar.',
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

                    <div className="h-full w-full rounded-t-2xl overflow-hidden bg-transparent">
                      {!contentSrc ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="text-center px-6">
                            <p className="text-sm text-white/80 font-medium">Imagem não disponível</p>
                          </div>
                        </div>
                      ) : (
                        <img
                          src={contentSrc}
                          alt={content.caption || content.title}
                          className="h-full w-full object-cover"
                          onLoad={handleImageLoaded}
                          draggable={false}
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-background/85 backdrop-blur-md px-4 py-4">
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/profile/${user?.id}`}
                      className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={userAvatarSrc} alt={user?.name} />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {user?.name?.charAt(0)?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{user?.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{user?.profession}</div>
                      </div>
                    </Link>

                    <div className="ml-auto flex items-center gap-1">
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleLike}
                            className="h-9 w-9 rounded-full bg-transparent hover:bg-transparent active:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                          >
                            <ThumbsUp size={18} className={liked ? 'text-primary fill-primary' : ''} />
                          </Button>
                          <span className="-mt-1 text-[11px] font-semibold leading-none text-muted-foreground">
                            {typeof likeCount === 'number' ? formatCompactNumber(likeCount) : '—'}
                          </span>
                        </div>

                        <div className="flex flex-col items-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={openComments}
                            className="h-9 w-9 rounded-full bg-transparent hover:bg-foreground/10 active:bg-foreground/15 focus-visible:ring-0 focus-visible:ring-offset-0"
                          >
                            <MessageCircle size={18} />
                          </Button>
                          <span className="-mt-1 text-[11px] font-semibold leading-none text-muted-foreground">
                            {formatCompactNumber(commentsCountToShow)}
                          </span>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleShare}
                          className="h-9 w-9 rounded-full bg-transparent hover:bg-foreground/10 active:bg-foreground/15 focus-visible:ring-0 focus-visible:ring-offset-0"
                        >
                          <Share2 size={18} />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <Eye size={14} />
                      {formatCompactNumber(viewCount)} views
                    </span>
                  </div>

                  {(content.caption || content.title || content.description) && (
                    <p className="mt-2 text-sm text-foreground/90 line-clamp-2">
                      {content.caption || content.title || content.description}
                    </p>
                  )}
                </div>
              </motion.div>
            </div>
          )}

          <CommentsSheet
            open={commentsOpen}
            onOpenChange={setCommentsOpen}
            contentId={content.id}
            contentType={contentType}
            onCountChange={(nextCount) => {
              setCommentsCount(nextCount)
              if (content?.id && typeof nextCount === 'number') {
                commentsMeta.setCount(contentCommentsType, content.id, nextCount)
              }
            }}
          />

          <AlertDialog
            open={deleteConfirmOpen}
            onOpenChange={(open) => {
              setDeleteConfirmOpen(open)
              if (!open) setDeleteConfirmPayload(null)
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir conteúdo?</AlertDialogTitle>
                <AlertDialogDescription>
                  Essa ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    const payload = deleteConfirmPayload
                    setDeleteConfirmOpen(false)
                    setDeleteConfirmPayload(null)
                    if (!payload) return
                    if (onDelete) return onDelete(payload)
                    toast({
                      title: 'Excluir conteúdo',
                      description: 'Ação de exclusão não configurada.',
                      variant: 'destructive',
                    })
                  }}
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  )
}

export default ContentViewModal
