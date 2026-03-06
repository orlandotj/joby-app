import React, { useMemo, useRef, useState, useEffect, useLayoutEffect } from 'react'
import ReactDOM from 'react-dom'
import { motion } from 'framer-motion'
import {
  X,
  Clock,
  MapPin,
  FileText,
  BadgeCheck,
  Eye,
  Home,
  AlertCircle,
  Calendar,
  Star,
  MessageSquare,
  MousePointerClick,
  Megaphone,
  Percent,
  Truck,
  TrendingUp,
  Briefcase,
  Send,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Lock,
  Pin,
  Check,
  PenLine,
  Plus,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Camera,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/components/ui/use-toast'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { attemptPlayWithMuteFallback } from '@/lib/videoAudioPrefs'
import { ensureUserPlaybackUnlockedOnFirstGesture } from '@/lib/videoPlaybackCoordinator'
import { formatPriceUnit, normalizePriceUnit } from '@/lib/priceUnit'
import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabaseClient'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

const ServiceDetailsModal = ({
  isOpen,
  onClose,
  service,
  professional,
  onEditService,
  editingBooking,
  onRequestUpdated,
}) => {
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const editPrefillKeyRef = useRef('')
  const editAttachmentsPrefillKeyRef = useRef('')
  const editingBookingId = editingBooking?.id || null
  const [customSchedule, setCustomSchedule] = useState('')
  const [profileCardProfile, setProfileCardProfile] = useState(null)
  const requestMediaInputRef = useRef(null)
  const [requestMediaItems, setRequestMediaItems] = useState([])
  const [activeRequestMediaId, setActiveRequestMediaId] = useState(null)
  const [viewerPlaybackRate, setViewerPlaybackRate] = useState(1)
  const [viewerIsPlaying, setViewerIsPlaying] = useState(false)
  const [viewerIsMuted, setViewerIsMuted] = useState(false)
  const [viewerShowControls, setViewerShowControls] = useState(false)
  const [viewerProgress, setViewerProgress] = useState(0)
  const [viewerSeekOverlay, setViewerSeekOverlay] = useState(null)
  const [viewerCurrentTime, setViewerCurrentTime] = useState(0)
  const [viewerDuration, setViewerDuration] = useState(0)
  const viewerVideoRef = useRef(null)
  const viewerTouchRef = useRef({ x: 0, y: 0, active: false })
  const viewerTapTimerRef = useRef(null)
  const viewerTapCountRef = useRef(0)
  const viewerLastTapSideRef = useRef('right')
  const viewerLastTapCenterRef = useRef(false)
  const viewerSeekOverlayTimerRef = useRef(null)
  const viewerHideControlsTimeoutRef = useRef(null)
  const viewerSuppressTapRef = useRef(false)
  const viewerSuppressTapTimerRef = useRef(null)
  const viewerIsScrubbingRef = useRef(false)
  const viewerLastTimeUpdateUiRef = useRef(0)
  const viewerIsAndroidRef = useRef(false)
  const lastServiceDetailsKeyRef = useRef('')

  useEffect(() => {
    try {
      viewerIsAndroidRef.current = /Android/i.test(String(navigator?.userAgent || ''))
    } catch {
      viewerIsAndroidRef.current = false
    }
  }, [])

  const activeMediaItem = useMemo(() => {
    if (!activeRequestMediaId) return null
    return requestMediaItems.find((x) => x.id === activeRequestMediaId) || null
  }, [activeRequestMediaId, requestMediaItems])

  const activeMediaIndex = useMemo(() => {
    if (!activeMediaItem) return -1
    return requestMediaItems.findIndex((x) => x.id === activeMediaItem.id)
  }, [activeMediaItem, requestMediaItems])

  const goToMediaByIndex = (nextIndex) => {
    if (!Array.isArray(requestMediaItems) || requestMediaItems.length === 0) return
    const idx = Math.max(0, Math.min(requestMediaItems.length - 1, Number(nextIndex)))
    const next = requestMediaItems[idx]
    if (!next?.id) return
    setViewerPlaybackRate(1)
    setActiveRequestMediaId(next.id)
  }

  const goPrevMedia = () => {
    if (activeMediaIndex <= 0) return
    goToMediaByIndex(activeMediaIndex - 1)
  }

  const goNextMedia = () => {
    if (activeMediaIndex < 0) return
    if (activeMediaIndex >= requestMediaItems.length - 1) return
    goToMediaByIndex(activeMediaIndex + 1)
  }

  useEffect(() => {
    // When opening/closing or changing item, refresh comments if available.
    const serverMediaId = String(activeMediaItem?.serverMediaId || '').trim()
    setViewerIsPlaying(false)
    setViewerIsMuted(false)
    setViewerShowControls(false)
    setViewerProgress(0)
    setViewerSeekOverlay(null)
    setViewerCurrentTime(0)
    setViewerDuration(0)

    const el = viewerVideoRef.current
    if (el) {
      try {
        if (!el.paused) el.pause()
      } catch {
        // ignore
      }
      try {
        el.muted = false
      } catch {
        // ignore
      }
    }

    if (viewerHideControlsTimeoutRef.current) {
      window.clearTimeout(viewerHideControlsTimeoutRef.current)
      viewerHideControlsTimeoutRef.current = null
    }
    if (viewerSeekOverlayTimerRef.current) {
      window.clearTimeout(viewerSeekOverlayTimerRef.current)
      viewerSeekOverlayTimerRef.current = null
    }
    if (viewerTapTimerRef.current) {
      window.clearTimeout(viewerTapTimerRef.current)
      viewerTapTimerRef.current = null
    }
    void serverMediaId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMediaItem?.serverMediaId, activeRequestMediaId])

  // Explorer-like autoplay on open: best-effort, with sound.
  // useLayoutEffect aumenta a chance do autoplay com som funcionar.
  useLayoutEffect(() => {
    if (!activeRequestMediaId) return
    if (String(activeMediaItem?.kind || '') !== 'video') return

    ensureUserPlaybackUnlockedOnFirstGesture()

    let cancelled = false
    const tryPlay = async () => {
      const el = viewerVideoRef.current
      if (!el) return

      // Regra: nunca começar mutado. Tentamos sempre com som; se o navegador bloquear,
      // o vídeo permanece pausado até o usuário tocar.
      const desiredMuted = false
      try {
        el.muted = desiredMuted
        setViewerIsMuted(desiredMuted)
      } catch {
        // ignore
      }

      try {
        const res = await attemptPlayWithMuteFallback(el, { muted: desiredMuted, allowFallback: false })
        if (cancelled) return
        if (typeof res?.muted === 'boolean') setViewerIsMuted(res.muted)
      } catch {
        // ignore
      }
    }

    const onReady = () => {
      void tryPlay()
    }

    const el = viewerVideoRef.current
    try {
      el?.addEventListener?.('loadeddata', onReady)
      el?.addEventListener?.('canplay', onReady)
    } catch {
      // ignore
    }

    void tryPlay()

    return () => {
      cancelled = true
      try {
        el?.removeEventListener?.('loadeddata', onReady)
        el?.removeEventListener?.('canplay', onReady)
      } catch {
        // ignore
      }
    }
  }, [activeRequestMediaId, activeMediaItem?.kind])

  useEffect(() => {
    return () => {
      if (viewerTapTimerRef.current) window.clearTimeout(viewerTapTimerRef.current)
      if (viewerSeekOverlayTimerRef.current) window.clearTimeout(viewerSeekOverlayTimerRef.current)
      if (viewerHideControlsTimeoutRef.current) window.clearTimeout(viewerHideControlsTimeoutRef.current)
      if (viewerSuppressTapTimerRef.current) window.clearTimeout(viewerSuppressTapTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const video = viewerVideoRef.current
    if (!video) return
    try {
      video.playbackRate = viewerPlaybackRate
    } catch {
      // ignore
    }
  }, [viewerPlaybackRate])

  const viewerShowControlsWithAutoHide = (options) => {
    const delayMs = Math.max(500, Number(options?.delayMs) || 2500)
    const autoHide = options?.autoHide ?? true
    setViewerShowControls(true)

    if (viewerHideControlsTimeoutRef.current) {
      window.clearTimeout(viewerHideControlsTimeoutRef.current)
      viewerHideControlsTimeoutRef.current = null
    }

    if (!autoHide) return

    viewerHideControlsTimeoutRef.current = window.setTimeout(() => {
      setViewerShowControls(false)
      viewerHideControlsTimeoutRef.current = null
    }, delayMs)
  }

  const viewerTogglePlay = async () => {
    const el = viewerVideoRef.current
    if (!el) return

    if (!el.paused) {
      el.pause()
      return
    }

    try {
      const p = el.play()
      if (p && typeof p.then === 'function') await p
    } catch {
      // ignore
    }
  }

  const viewerSeekBy = (deltaSeconds) => {
    const el = viewerVideoRef.current
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return
    const next = Math.max(0, Math.min(el.duration, (el.currentTime || 0) + deltaSeconds))
    el.currentTime = next
  }

  const viewerShowSeekOverlay = (side, deltaSeconds) => {
    if (!deltaSeconds) return
    const abs = Math.abs(Math.round(deltaSeconds))
    const sign = deltaSeconds > 0 ? '+' : '-'
    setViewerSeekOverlay({ side: side === 'left' ? 'left' : 'right', text: `${sign}${abs}s` })
    if (viewerSeekOverlayTimerRef.current) window.clearTimeout(viewerSeekOverlayTimerRef.current)
    viewerSeekOverlayTimerRef.current = window.setTimeout(() => {
      setViewerSeekOverlay(null)
      viewerSeekOverlayTimerRef.current = null
    }, 450)
  }

  const viewerClearSuppressTapSoon = () => {
    if (viewerSuppressTapTimerRef.current) {
      window.clearTimeout(viewerSuppressTapTimerRef.current)
      viewerSuppressTapTimerRef.current = null
    }
    viewerSuppressTapTimerRef.current = window.setTimeout(() => {
      viewerSuppressTapRef.current = false
      viewerSuppressTapTimerRef.current = null
    }, 260)
  }

  const viewerHandleTapAt = ({ clientX, clientY }) => {
    if (viewerSuppressTapRef.current) return

    let centerTap = false
    try {
      const el = viewerVideoRef.current
      const rect = el?.getBoundingClientRect?.()
      const x = Number(clientX || 0)
      const y = Number(clientY || 0)
      if (rect && rect.width > 0) {
        const xr = (x - rect.left) / Math.max(1, rect.width)
        const yr = (y - rect.top) / Math.max(1, rect.height)
        centerTap = xr >= 0.35 && xr <= 0.65 && yr >= 0.35 && yr <= 0.65
        viewerLastTapSideRef.current = x < rect.left + rect.width / 2 ? 'left' : 'right'
      }
    } catch {
      // ignore
    }

    viewerLastTapCenterRef.current = centerTap
    viewerTapCountRef.current += 1

    const windowMs = 260
    if (viewerTapTimerRef.current) window.clearTimeout(viewerTapTimerRef.current)

    viewerTapTimerRef.current = window.setTimeout(async () => {
      const count = viewerTapCountRef.current
      viewerTapCountRef.current = 0
      viewerTapTimerRef.current = null

      if (count <= 1) {
        if (viewerLastTapCenterRef.current) {
          viewerShowControlsWithAutoHide({ delayMs: 2500, autoHide: true })
          await viewerTogglePlay()
          return
        }

        setViewerShowControls((prev) => {
          const next = !prev
          if (!next) {
            if (viewerHideControlsTimeoutRef.current) {
              window.clearTimeout(viewerHideControlsTimeoutRef.current)
              viewerHideControlsTimeoutRef.current = null
            }
            return false
          }
          viewerShowControlsWithAutoHide({ delayMs: 2500, autoHide: true })
          return true
        })
        return
      }

      const seconds = count * 5
      const side = viewerLastTapSideRef.current === 'left' ? 'left' : 'right'
      const delta = side === 'left' ? -seconds : seconds
      viewerShowControlsWithAutoHide({ delayMs: 2500, autoHide: true })
      viewerSeekBy(delta)
      viewerShowSeekOverlay(side, delta)
    }, windowMs)
  }

  const viewerFormatTime = (timeInSeconds) => {
    const t = Number(timeInSeconds || 0)
    const minutes = Math.floor(t / 60)
    const seconds = Math.floor(t % 60)
      .toString()
      .padStart(2, '0')
    return `${minutes}:${seconds}`
  }

  const inferMimeTypeFromName = (name) => {
    const n = String(name || '').trim().toLowerCase()
    if (!n) return null
    const ext = n.includes('.') ? n.split('.').pop() : ''
    if (!ext) return null

    const imageMap = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      heic: 'image/heic',
      heif: 'image/heif',
    }
    const videoMap = {
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      webm: 'video/webm',
      m4v: 'video/x-m4v',
      mkv: 'video/x-matroska',
    }

    if (imageMap[ext]) return imageMap[ext]
    if (videoMap[ext]) return videoMap[ext]
    return null
  }

  const revokeLocalObjectUrl = (maybeUrl) => {
    const url = String(maybeUrl || '')
    if (!url) return
    if (!url.startsWith('blob:')) return
    try {
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    }
  }

  const generateVideoThumbnailDataUrl = (file, options) => {
    const seekSeconds = Math.max(0, Number(options?.seekSeconds ?? 0.1))
    const maxSize = Math.max(64, Number(options?.maxSize ?? 240))
    const mime = String(options?.mime || 'image/jpeg')
    const quality = Math.min(0.95, Math.max(0.4, Number(options?.quality ?? 0.82)))

    return new Promise((resolve) => {
      let objectUrl = ''
      let settled = false
      let timeoutId = null

      const settle = (value) => {
        if (settled) return
        settled = true
        if (timeoutId) window.clearTimeout(timeoutId)
        timeoutId = null
        if (objectUrl) revokeLocalObjectUrl(objectUrl)
        objectUrl = ''
        resolve(value)
      }

      try {
        objectUrl = URL.createObjectURL(file)
      } catch {
        settle('')
        return
      }

      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      video.setAttribute('playsinline', '')
      video.setAttribute('webkit-playsinline', '')
      video.src = objectUrl

      const cleanupListeners = () => {
        video.onloadedmetadata = null
        video.onloadeddata = null
        video.onseeked = null
        video.onerror = null
      }

      const capture = () => {
        try {
          const w = Number(video.videoWidth) || 0
          const h = Number(video.videoHeight) || 0
          if (w <= 0 || h <= 0) {
            cleanupListeners()
            settle('')
            return
          }

          const scale = Math.min(1, maxSize / Math.max(w, h))
          const cw = Math.max(1, Math.round(w * scale))
          const ch = Math.max(1, Math.round(h * scale))
          const canvas = document.createElement('canvas')
          canvas.width = cw
          canvas.height = ch
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            cleanupListeners()
            settle('')
            return
          }
          ctx.drawImage(video, 0, 0, cw, ch)
          const dataUrl = canvas.toDataURL(mime, quality)
          cleanupListeners()
          settle(String(dataUrl || ''))
        } catch {
          cleanupListeners()
          settle('')
        }
      }

      video.onerror = () => {
        cleanupListeners()
        settle('')
      }

      video.onloadedmetadata = () => {
        try {
          const d = Number(video.duration)
          const target = Number.isFinite(d) && d > 0 ? Math.min(seekSeconds, Math.max(0, d - 0.05)) : seekSeconds
          if (Number.isFinite(target) && target > 0) {
            video.currentTime = target
            return
          }
        } catch {
          // ignore
        }
      }

      video.onloadeddata = () => {
        // If seek didn't happen (duration unknown), still attempt capture once a frame is available.
        try {
          if (!Number.isFinite(video.currentTime) || video.currentTime <= 0) {
            capture()
          }
        } catch {
          capture()
        }
      }

      video.onseeked = () => {
        capture()
      }

      timeoutId = window.setTimeout(() => {
        cleanupListeners()
        settle('')
      }, 6000)
    })
  }

  const makeLocalId = () => {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
      }
    } catch {
      // ignore
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  const removeRequestMediaItem = (id) => {
    setRequestMediaItems((prev) => {
      const removed = prev.find((x) => x.id === id)
      if (removed?.previewUrl) revokeLocalObjectUrl(removed.previewUrl)
      return prev.filter((x) => x.id !== id)
    })
  }

  const clearRequestMedia = () => {
    setRequestMediaItems((prev) => {
      for (const item of prev) {
        if (item?.previewUrl) revokeLocalObjectUrl(item.previewUrl)
      }
      return []
    })
  }

  useEffect(() => {
    return () => {
      clearRequestMedia()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addRequestMediaFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean)
    if (!files.length) return

    for (const file of files) {
      const size = Number(file?.size) || 0
      if (size <= 0) {
        toast({
          title: 'Arquivo inválido',
          description: 'Não foi possível ler o arquivo selecionado.',
          variant: 'destructive',
        })
        continue
      }

      const mimeRaw = String(file?.type || '').trim().toLowerCase()
      const inferredMime = !mimeRaw ? inferMimeTypeFromName(file?.name) : null
      const mime = mimeRaw || inferredMime || ''
      const isImage = mime.startsWith('image/')
      const isVideo = mime.startsWith('video/')
      if (!isImage && !isVideo) {
        toast({
          title: 'Formato não suportado',
          description: 'Envie apenas fotos ou vídeos.',
          variant: 'destructive',
        })
        continue
      }

      const maxBytes = isVideo ? 100 * 1024 * 1024 : 20 * 1024 * 1024
      if (size > maxBytes) {
        toast({
          title: 'Arquivo muito grande',
          description: isVideo ? 'Tamanho máximo: 100MB por vídeo.' : 'Tamanho máximo: 20MB por foto.',
          variant: 'destructive',
        })
        continue
      }

      const id = makeLocalId()

      // Alguns dispositivos retornam File.type vazio; normaliza para manter upload/validação coerentes.
      let normalizedFile = file
      if (!mimeRaw && inferredMime) {
        try {
          normalizedFile = new File([file], file?.name || `anexo-${id}`, {
            type: inferredMime,
            lastModified: Date.now(),
          })
        } catch {
          // ignore; fallback para o File original
          normalizedFile = file
        }
      }

      if (isVideo) {
        setRequestMediaItems((prev) => [
          ...prev,
          {
            id,
            kind: 'video',
            file: normalizedFile,
            previewUrl: '',
            caption: '',
            status: 'ready',
          },
        ])

        // Generate a local thumbnail frame without playback.
        const thumb = await generateVideoThumbnailDataUrl(normalizedFile, {
          seekSeconds: 0.1,
          maxSize: 240,
          mime: 'image/jpeg',
          quality: 0.82,
        })
        if (thumb) {
          setRequestMediaItems((prev) => prev.map((it) => (it.id === id ? { ...it, previewUrl: thumb } : it)))
        }
      } else {
        const previewUrl = URL.createObjectURL(normalizedFile)
        setRequestMediaItems((prev) => [
          ...prev,
          {
            id,
            kind: 'photo',
            file: normalizedFile,
            previewUrl,
            caption: '',
            status: 'ready',
          },
        ])
      }
    }
  }

  const formatBRL = (value) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return 'R$\u00A0--'
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(n)
  }
  const [selectedAvailableHour, setSelectedAvailableHour] = useState('')
  const [availabilityMonth, setAvailabilityMonth] = useState(() => new Date())
  const [selectedAvailabilityDayKey, setSelectedAvailabilityDayKey] = useState('')
  const [isAvailabilityCalendarOpen, setIsAvailabilityCalendarOpen] = useState(false)
  // Modo "Horários em aberto" (cliente escolhe dia + período igual ao editor do ServiceForm)
  const [openScheduleMonth, setOpenScheduleMonth] = useState(() => new Date())
  const [isOpenScheduleCalendarOpen, setIsOpenScheduleCalendarOpen] = useState(true)
  const [selectedWorkDay, setSelectedWorkDay] = useState(null)
  const [workDaysMap, setWorkDaysMap] = useState({})
  const [workDayChoice, setWorkDayChoice] = useState('slots')
  const [slotMorningEnabled, setSlotMorningEnabled] = useState(true)
  const [slotAfternoonEnabled, setSlotAfternoonEnabled] = useState(false)
  const [morningHours, setMorningHours] = useState(4)
  const [afternoonHours, setAfternoonHours] = useState(4)
  const [workDayCustomMorningStart, setWorkDayCustomMorningStart] = useState('00:00')
  const [workDayCustomMorningEnd, setWorkDayCustomMorningEnd] = useState('00:00')
  const [workDayCustomAfternoonStart, setWorkDayCustomAfternoonStart] = useState('00:00')
  const [workDayCustomAfternoonEnd, setWorkDayCustomAfternoonEnd] = useState('00:00')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serviceDetails, setServiceDetails] = useState(null)

  const getWorkerBaseUrlForAttachments = () => {
    const raw = String(
      import.meta.env.VITE_WORKER_API_URL || import.meta.env.VITE_CLOUDFLARE_WORKER_URL || ''
    )
      .trim()
      .replace(/\/+$/, '')

    if (!raw) return ''

    try {
      const currentHost = window.location.hostname
      const envHost = new URL(raw).hostname
      const isEnvLocal = envHost === '127.0.0.1' || envHost === 'localhost'
      const isCurrentLocal = currentHost === '127.0.0.1' || currentHost === 'localhost'
      if (isEnvLocal && !isCurrentLocal) return ''
    } catch {
      // ignore
    }

    return raw
  }

  const buildAttachmentsApiUrl = (path) => {
    const base = getWorkerBaseUrlForAttachments()
    const p = String(path || '').startsWith('/') ? String(path || '') : `/${path}`
    return base ? `${base}${p}` : p
  }

  const buildAttachmentsApiUrlCandidates = (path) => {
    const base = getWorkerBaseUrlForAttachments()
    const p = String(path || '').startsWith('/') ? String(path || '') : `/${path}`
    return base ? [`${base}${p}`] : [p]
  }

  const SERVICE_DETAILS_CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 horas

  const SIGNED_URL_CACHE_TTL_MS = 2 * 60 * 1000 // signed urls expiram rápido; cache curto
  const REQUEST_MEDIA_CACHE_TTL_MS = 10 * 60 * 1000

  const getSignedUrlCache = () => (globalThis.__JOBY_SIGNED_URL_CACHE_V1__ ||= new Map())
  const getRequestMediaCache = () => (globalThis.__JOBY_REQUEST_MEDIA_CACHE_V1__ ||= new Map())

  const readSignedUrlCache = (mediaId) => {
    const id = String(mediaId || '').trim()
    if (!id) return ''
    try {
      const m = getSignedUrlCache()
      const v = m.get(id)
      const url = String(v?.url || '').trim()
      const updatedAt = typeof v?.updatedAt === 'number' ? v.updatedAt : 0
      if (!url || !updatedAt) return ''
      if (Date.now() - updatedAt > SIGNED_URL_CACHE_TTL_MS) return ''
      return url
    } catch {
      return ''
    }
  }

  const writeSignedUrlCache = (mediaId, url) => {
    const id = String(mediaId || '').trim()
    const u = String(url || '').trim()
    if (!id || !u) return
    try {
      getSignedUrlCache().set(id, { url: u, updatedAt: Date.now() })
    } catch {
      // ignore
    }
  }

  const readRequestMediaCache = (requestId) => {
    const id = String(requestId || '').trim()
    if (!id) return []
    try {
      const m = getRequestMediaCache()
      const v = m.get(id)
      const updatedAt = typeof v?.updatedAt === 'number' ? v.updatedAt : 0
      const items = Array.isArray(v?.items) ? v.items : []
      if (!updatedAt || !items.length) return []
      if (Date.now() - updatedAt > REQUEST_MEDIA_CACHE_TTL_MS) return []
      // Só itens server-side; evita blob: (pode ter sido revogado ao fechar)
      return items
        .filter((it) => it && typeof it === 'object')
        .map((it) => ({
          ...it,
          file: null,
          previewUrl: String(it?.previewUrl || ''),
        }))
        .filter((it) => it.previewUrl ? !String(it.previewUrl).startsWith('blob:') : true)
    } catch {
      return []
    }
  }

  const writeRequestMediaCache = (requestId, items) => {
    const id = String(requestId || '').trim()
    if (!id) return
    const list = Array.isArray(items) ? items : []
    if (!list.length) return
    try {
      const safe = list
        .filter((it) => it && typeof it === 'object')
        .map((it) => ({
          id: String(it?.id || '').trim(),
          serverMediaId: String(it?.serverMediaId || '').trim(),
          kind: String(it?.kind || '').trim(),
          file: null,
          previewUrl: String(it?.previewUrl || ''),
          caption: String(it?.caption || ''),
          status: String(it?.status || ''),
        }))
        .filter((it) => it.serverMediaId && it.status === 'uploaded')
        .filter((it) => it.previewUrl ? !it.previewUrl.startsWith('blob:') : true)

      if (!safe.length) return
      getRequestMediaCache().set(id, { items: safe, updatedAt: Date.now() })
    } catch {
      // ignore
    }
  }

  const getServiceCacheKey = (serviceId) =>
    serviceId ? `joby:serviceDetails:v1:${serviceId}` : null

  const readServiceCache = (serviceId) => {
    const key = getServiceCacheKey(serviceId)
    if (!key) return null
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      const updatedAt = typeof parsed?.updatedAt === 'number' ? parsed.updatedAt : null
      const data = parsed?.data && typeof parsed.data === 'object' ? parsed.data : null
      if (!updatedAt || !data) return null
      if (Date.now() - updatedAt > SERVICE_DETAILS_CACHE_TTL_MS) return null
      return { updatedAt, data }
    } catch {
      return null
    }
  }

  const writeServiceCache = (serviceId, data) => {
    const key = getServiceCacheKey(serviceId)
    if (!key) return
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({ updatedAt: Date.now(), data: data || null })
      )
    } catch {
      // silencioso
    }
  }

  const prevWorkDayChoiceRef = useRef(workDayChoice)
  const lastValidCustomRangesRef = useRef(null)

  const serviceImageSrc = useResolvedStorageUrl(service?.image || '')
  const professionalAvatarSrc = useResolvedStorageUrl(
    professional?.avatar || ''
  )
  const profileCardAvatarSrc = useResolvedStorageUrl(
    profileCardProfile?.avatar || professional?.avatar || ''
  )
  const currentUserAvatarSrc = useResolvedStorageUrl(currentUser?.avatar || currentUser?.photoURL || '')

  // Buscar dados atualizados do perfil para o card (evita depender do payload do Explore/Profile)
  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      if (!isOpen) return
      if (!professional?.id) return
      if (professional?.isOwnProfile) {
        setProfileCardProfile(null)
        return
      }

      // Tenta com colunas novas primeiro; faz fallback se o schema ainda não tiver.
      const attempts = [
        'id, username, name, avatar, profession, is_verified, created_at, experience_start_year, joby_since_year',
        'id, username, name, avatar, profession, is_verified, created_at',
        'id, username, avatar, profession, is_verified, created_at, experience_start_year, joby_since_year',
        'id, username, avatar, profession, is_verified, created_at',
        'id, name, avatar, profession, is_verified, created_at, experience_start_year, joby_since_year',
        'id, name, avatar, profession, is_verified, created_at',
      ]

      let lastError = null
      for (const select of attempts) {
        const res = await supabase
          .from('profiles')
          .select(select)
          .eq('id', professional.id)
          .maybeSingle()

        if (!res.error) {
          if (!cancelled) setProfileCardProfile(res.data || null)
          return
        }

        lastError = res.error
        const msg = String(res.error?.message || res.error)
        const isMissingColumn =
          msg.toLowerCase().includes('column') && msg.toLowerCase().includes('does not exist')
        if (!isMissingColumn) break
      }

      if (import.meta.env.DEV && lastError) {
        log.warn('PROFILE', 'Falha ao carregar perfil para card', lastError)
      }
      if (!cancelled) setProfileCardProfile(null)
    }

    loadProfile()
    return () => {
      cancelled = true
    }
  }, [isOpen, professional?.id, professional?.isOwnProfile])

  // Travar scroll do fundo quando modal abrir
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const normalizeService = (raw) => {
    if (!raw || typeof raw !== 'object') return raw
    return {
      ...raw,
      // snake_case -> camelCase compat
      priceUnit: raw.priceUnit ?? raw.price_unit,
      workArea: raw.workArea ?? raw.work_area,
      availableHours: raw.availableHours ?? raw.available_hours,
      homeService: raw.homeService ?? raw.home_service,
      emergencyService: raw.emergencyService ?? raw.emergency_service,
      travelService: raw.travelService ?? raw.travel_service,
      overtimeService: raw.overtimeService ?? raw.overtime_service,
      homeServiceFee: raw.homeServiceFee ?? raw.home_service_fee,
      emergencyServiceFee: raw.emergencyServiceFee ?? raw.emergency_service_fee,
      travelFee: raw.travelFee ?? raw.travel_fee,
      overtimeFee: raw.overtimeFee ?? raw.overtime_fee,
    }
  }

  const normalizeObservationsText = (raw) => {
    const text = String(raw || '').trim()
    if (!text) return ''

    // Remove prefixos repetidos como:
    // "Observações: Observações: ..." / "Obs: Obs: ..." / variações sem acento.
    const cleaned = text.replace(
      /^(?:\s*(?:obs\.?|observa(?:ç|c)[^:]*)\s*:\s*)+/i,
      ''
    )

    return String(cleaned || '').trim()
  }

  // Ao abrir o modal, buscar detalhes completos do serviço (horários/taxas/descrição)
  useEffect(() => {
    let cancelled = false

    const resetLocalState = ({ keepDetails = false } = {}) => {
      setCustomSchedule('')
      clearRequestMedia()
      setSelectedAvailableHour('')
      setAvailabilityMonth(new Date())
      setSelectedAvailabilityDayKey('')
      // Mantém a aba fechada por padrão (abre apenas se o usuário tocar no cabeçalho)
      setIsAvailabilityCalendarOpen(false)
      setOpenScheduleMonth(new Date())
      setIsOpenScheduleCalendarOpen(true)
      setSelectedWorkDay(null)
      setWorkDaysMap({})
      setWorkDayChoice('slots')
      setSlotMorningEnabled(true)
      setSlotAfternoonEnabled(false)
      setMorningHours(4)
      setAfternoonHours(4)
      setWorkDayCustomMorningStart('00:00')
      setWorkDayCustomMorningEnd('00:00')
      setWorkDayCustomAfternoonStart('00:00')
      setWorkDayCustomAfternoonEnd('00:00')
      setIsSubmitting(false)
      if (!keepDetails) setServiceDetails(null)
    }

    const parseCustomScheduleFromNotes = (raw) => {
      const text = String(raw || '').trim()
      if (!text) return ''

      // Prefer o que o usuário digitou (linha "Observações:"), para não poluir
      // o textarea com texto automático de agenda/estimativas.
      const obs = text.match(
        /(?:^|\n)\s*(?:obs\.?|observa(?:ç|c)[^:]*)\s*:\s*(.+)\s*$/i
      )
      if (obs?.[1]) return normalizeObservationsText(obs[1])

      // Compat com versões antigas.
      const legacy = text.match(/(?:^|\n)\s*Detalhes\s*:\s*([\s\S]+)$/i)
      if (legacy?.[1]) return normalizeObservationsText(legacy[1])

      // Sem prefixo explícito: remove as linhas automáticas e mantém somente o que
      // parece texto livre do usuário (compat com versões antigas do app).
      const autoLine = /^(?:Hor[aá]rio\s+solicitado\s*:|Datas\s+selecionadas\s*:|In[ií]cio\s*:|Final\s*:|Data\s*:|Hor[aá]rio\s+por\s+dia\s*:|Total\s+estimado\s+de\s+horas\s*:|Dias\s+e\s+hor[aá]rios\s+definidos\s+pelo\s+profissional|Pacote\s*:)/i

      const lines = text
        .split('\n')
        .map((l) => String(l || '').trim())
        .filter(Boolean)

      const userLines = lines.filter((l) => !autoLine.test(l))
      if (userLines.length) return normalizeObservationsText(userLines.join('\n'))

      return ''
    }

    const toIsoDate = (raw) => {
      const t = String(raw || '').trim()
      const m = t.match(/(\d{4}-\d{2}-\d{2})/)
      return m?.[1] || ''
    }

    const extractEditInfoFromNotes = (rawNotes) => {
      const text = String(rawNotes || '').trim()
      if (!text) return { scheduledDate: '', scheduledTime: '', startIso: '', endIso: '' }

      const lines = text
        .split('\n')
        .map((l) => String(l || '').trim())
        .filter(Boolean)

      const pickAfterPrefix = (re) => {
        const line = lines.find((l) => re.test(l))
        if (!line) return ''
        return String(line.replace(re, '')).trim()
      }

      const horarioSolicitadoText = pickAfterPrefix(/^Hor[aá]rio solicitado\s*:\s*/i)
      const parsedHorarioSolicitado = horarioSolicitadoText
        ? parseSelectedAvailability(horarioSolicitadoText)
        : null

      const perDayTime = pickAfterPrefix(/^Hor[aá]rio por dia\s*:\s*/i)

      const dataBr = pickAfterPrefix(/^Data\s*:\s*/i)
      const inicioBr = pickAfterPrefix(/^In[ií]cio\s*:\s*/i)
      const finalBr = pickAfterPrefix(/^Final\s*:\s*/i)

      const startDt = inicioBr ? parseBRDate(inicioBr) : null
      const endDt = finalBr ? parseBRDate(finalBr) : null
      const dataDt = dataBr ? parseBRDate(dataBr) : null

      const startIso = startDt ? format(startDt, 'yyyy-MM-dd') : ''
      const endIso = endDt ? format(endDt, 'yyyy-MM-dd') : ''
      const dataIso = dataDt ? format(dataDt, 'yyyy-MM-dd') : ''

      const scheduledDate =
        String(parsedHorarioSolicitado?.scheduledDate || '').trim() || startIso || dataIso || ''

      const scheduledTime =
        String(parsedHorarioSolicitado?.scheduledTime || '').trim() || String(perDayTime || '').trim() || ''

      return { scheduledDate, scheduledTime, startIso, endIso }
    }

    const buildRangeKeysFromIso = (startIso, endIso) => {
      const start = startIso ? new Date(`${startIso}T00:00:00`) : null
      const end = endIso ? new Date(`${endIso}T00:00:00`) : null
      if (!start || !end) return []
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return []
      if (end < start) return []

      try {
        const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) })
        // Proteção contra ranges absurdos vindos de notas corrompidas.
        if (days.length > 120) return []
        return days.map((d) => format(startOfDay(d), 'yyyy-MM-dd'))
      } catch {
        return []
      }
    }

    const applyParsedChoiceToInputs = (parsed) => {
      const choice = parsed?.choice
      if (choice === 'slots') {
        const morning = parsed?.morning
        const afternoon = parsed?.afternoon
        setSlotMorningEnabled(typeof morning === 'boolean' ? morning : true)
        setSlotAfternoonEnabled(typeof afternoon === 'boolean' ? afternoon : false)

        const ranges = Array.isArray(parsed?.ranges) ? parsed.ranges : []
        for (const r of ranges) {
          const startMin = timeToMinutes(r.start)
          const endMin = timeToMinutes(r.end)
          if (startMin == null || endMin == null) continue
          const hours = clampHours((endMin - startMin) / 60)
          if (r.start === WORKDAY_RANGES.morningStart) setMorningHours(hours)
          if (r.end === WORKDAY_RANGES.afternoonEnd) setAfternoonHours(hours)
        }
      }

      if (choice === 'custom') {
        const ranges = Array.isArray(parsed?.ranges) ? parsed.ranges : []
        const byTime = ranges
          .map((r) => ({ start: r?.start, end: r?.end }))
          .filter((r) => timeToMinutes(r.start) != null && timeToMinutes(r.end) != null)
          .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))

        const morning = byTime[0]
        const afternoon = byTime[1]

        if (morning?.start && morning?.end) {
          setWorkDayCustomMorningStart(morning.start)
          setWorkDayCustomMorningEnd(morning.end)
        }
        if (afternoon?.start && afternoon?.end) {
          setWorkDayCustomAfternoonStart(afternoon.start)
          setWorkDayCustomAfternoonEnd(afternoon.end)
        }

        if (!morning) {
          setWorkDayCustomMorningStart(WORKDAY_RANGES.defaultCustomMorningStart)
          setWorkDayCustomMorningEnd(WORKDAY_RANGES.defaultCustomMorningEnd)
        }
        if (!afternoon) {
          setWorkDayCustomAfternoonStart(WORKDAY_RANGES.defaultCustomAfternoonStart)
          setWorkDayCustomAfternoonEnd(WORKDAY_RANGES.defaultCustomAfternoonEnd)
        }

        // Se o label existente só tem o 2º turno, garantimos que o 1º fique "unused".
        if (!morning && afternoon) {
          setWorkDayCustomMorningStart('00:00')
          setWorkDayCustomMorningEnd('00:00')
        }
      }
    }

    const applyEditPrefill = () => {
      if (!editingBookingId) return
      const serviceId = String(service?.id || '').trim()
      const rawScheduledDate =
        editingBooking?.scheduled_date || editingBooking?.scheduledDate || editingBooking?.scheduledDateTime
      const scheduledDateFromBooking = toIsoDate(rawScheduledDate)

      const scheduledTimeFromBooking = String(
        editingBooking?.scheduled_time || editingBooking?.scheduledTime || ''
      ).trim()

      const notes = String(editingBooking?.notes || '').trim()
      const fromNotes = extractEditInfoFromNotes(notes)

      // Se o booking chegar incompleto primeiro (cache) e completo depois (fetch),
      // precisamos permitir reaplicar o prefill.
      const sigDate = scheduledDateFromBooking || String(fromNotes?.scheduledDate || '').trim() || ''
      const sigTime =
        scheduledTimeFromBooking || String(fromNotes?.scheduledTime || '').trim() || ''
      const notesKey = notes ? `${notes.length}:${notes.slice(0, 24)}` : '0:'
      const key = `${editingBookingId}:${serviceId}:${sigDate}:${sigTime}:${notesKey}`
      if (editPrefillKeyRef.current === key) return
      editPrefillKeyRef.current = key

      const scheduledDate = scheduledDateFromBooking || String(fromNotes?.scheduledDate || '').trim()
      const scheduledTime = scheduledTimeFromBooking || String(fromNotes?.scheduledTime || '').trim()
      const startIso = String(fromNotes?.startIso || '').trim()
      const endIso = String(fromNotes?.endIso || '').trim()

      if (notes) setCustomSchedule(parseCustomScheduleFromNotes(notes))

      const isFixedByBooking =
        /^pacote\s*:/i.test(scheduledTime) ||
        /dias e hor[aá]rios definidos pelo profissional/i.test(notes)

      // Preenche calendário de disponibilidade (horários fixos / pacote)
      if (isFixedByBooking) {
        if (scheduledDate) {
          const dt = new Date(`${scheduledDate}T00:00:00`)
          if (Number.isFinite(dt.getTime())) {
            setAvailabilityMonth(dt)
            setSelectedAvailabilityDayKey(scheduledDate)
            setIsAvailabilityCalendarOpen(true)
          }
        }
        return
      }

      // Preenche calendário em aberto (seleção de dias + modo)
      const baseIso = scheduledDate || startIso
      if (baseIso) {
        const dt = new Date(`${baseIso}T00:00:00`)
        if (Number.isFinite(dt.getTime())) {
          setOpenScheduleMonth(dt)
          setSelectedWorkDay(dt)
          setIsOpenScheduleCalendarOpen(true)
        }
      }

      if (scheduledTime && baseIso) {
        const parsed = getChoiceFromLabel(scheduledTime)
        const choice = parsed?.choice || 'custom'
        const safeChoice = isMonthlyBilling && choice === 'full' ? 'slots' : choice

        setWorkDayChoice(safeChoice)
        applyParsedChoiceToInputs({ ...(parsed || {}), choice: safeChoice })

        const keys =
          (startIso && endIso ? buildRangeKeysFromIso(startIso, endIso) : []) ||
          []
        const targetKeys = keys.length ? keys : scheduledDate ? [scheduledDate] : [baseIso]

        const next = {}
        for (const k of targetKeys) {
          const iso = toIsoDate(k)
          if (!iso) continue
          next[iso] = { label: scheduledTime, mode: safeChoice }
        }
        syncWorkDays(next)
      }
    }

    const fetchDetails = async () => {
      const serviceId = service?.id
      if (!isOpen || !serviceId) {
        resetLocalState({ keepDetails: false })
        lastServiceDetailsKeyRef.current = ''
        // Se o modal fechar (ou o serviceId sumir por um momento), precisamos
        // permitir reaplicar o prefill ao reabrir; caso contrário a UI pode ficar
        // vazia porque os guards impedem o rehydrate do estado.
        editPrefillKeyRef.current = ''
        editAttachmentsPrefillKeyRef.current = ''
        return
      }

      // Evita resetar estado local (ex: Observações) em re-renders enquanto o modal
      // continua aberto para o MESMO serviço.
      const nextKey = String(serviceId)
      const shouldReset = lastServiceDetailsKeyRef.current !== nextKey
      lastServiceDetailsKeyRef.current = nextKey

      // Ao trocar de serviço (ou abrir), zera seleção/agenda para evitar “herdar” estado anterior.
      if (shouldReset) {
        resetLocalState({ keepDetails: true })
        applyEditPrefill()
      }

      // Base instantânea: props + cache (quando existir). Mantém o modal rápido e com horários corretos.
      const cached = readServiceCache(serviceId)
      const cachedNormalized = cached?.data ? normalizeService(cached.data) : null
      const propsNormalized = normalizeService(service)
      const mergedInstant = cachedNormalized
        ? normalizeService({ ...cachedNormalized, ...propsNormalized })
        : propsNormalized

      setServiceDetails(mergedInstant)

      try {
        const { data, error } = await supabase
          .from('services')
          .select('*')
          .eq('id', serviceId)
          .maybeSingle()

        if (cancelled) return
        if (error) throw error
        if (data) {
          setServiceDetails((prev) => {
            const next = normalizeService({ ...(prev || {}), ...data })
            writeServiceCache(serviceId, next)
            return next
          })
        }
      } catch (err) {
        // Silencioso (o modal continua com os dados que já tinha)
        if (!cancelled) {
          setServiceDetails(mergedInstant)
        }
      }
    }

    fetchDetails()
    return () => {
      cancelled = true
    }
  }, [isOpen, service?.id, editingBookingId])

  // Ao editar: carregar anexos já existentes (service_request_media) e exibir na UI.
  const loadRequestMediaFromServer = async ({ requestId, merge = true, isCancelled = null } = {}) => {
    const cancelledFn = typeof isCancelled === 'function' ? isCancelled : () => false
    if (!requestId) return
    if (!currentUser?.id) return

    // Prefill imediato a partir do cache em memória (evita “piscar” vazio ao voltar)
    try {
      const cached = readRequestMediaCache(requestId)
      if (cached.length) {
        setRequestMediaItems((prev) => {
          const prevList = Array.isArray(prev) ? prev : []
          const cachedById = new Map(
            cached
              .map((it) => [String(it?.serverMediaId || it?.id || '').trim(), it])
              .filter((x) => x[0])
          )

          const next = prevList.map((p) => {
            const sid = String(p?.serverMediaId || p?.id || '').trim()
            const c = sid ? cachedById.get(sid) : null
            if (!c) return p

            const nextPreview = String(p?.previewUrl || '').trim() || String(c?.previewUrl || '').trim()
            const nextCaption = String(p?.caption || '').trim() || String(c?.caption || '').trim()
            if (nextPreview === String(p?.previewUrl || '').trim() && nextCaption === String(p?.caption || '').trim()) {
              return p
            }
            return { ...p, previewUrl: nextPreview, caption: nextCaption }
          })

          const prevIds = new Set(next.map((it) => String(it?.serverMediaId || it?.id || '').trim()))
          for (const it of cached) {
            const sid = String(it?.serverMediaId || it?.id || '').trim()
            if (!sid) continue
            if (prevIds.has(sid)) continue
            next.push(it)
          }

          return next
        })
      }
    } catch {
      // ignore
    }

    const isMissingRelation = (err) => {
      const msg = String(err?.message || err || '').toLowerCase()
      return msg.includes('relation') && msg.includes('does not exist')
    }

    const isMissingColumnError = (err) => {
      const msg = String(err?.message || err || '').toLowerCase()
      const code = String(err?.code || '').toUpperCase()
      return (
        code === 'PGRST204' ||
        (msg.includes('could not find the') && msg.includes('column')) ||
        (msg.includes('column') && msg.includes('does not exist'))
      )
    }

    const fetchSignedUrl = async ({ mediaId, accessToken }) => {
      const candidates = buildAttachmentsApiUrlCandidates('/api/service-attachments/signed-url')
      for (const endpoint of candidates) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ mediaId }),
        })

        if (!response.ok) continue

        const text = await response.text()
        let json = null
        try {
          json = text ? JSON.parse(text) : null
        } catch {
          json = null
        }

        const signedUrl = String(json?.signedUrl || '').trim()
        if (signedUrl) return signedUrl
      }
      return ''
    }

    const fetchSignedUrlsBatch = async ({ mediaIds, accessToken }) => {
      const ids = Array.isArray(mediaIds)
        ? Array.from(new Set(mediaIds.map((v) => String(v || '').trim()).filter(Boolean)))
        : []
      if (!ids.length) return null

      const candidates = buildAttachmentsApiUrlCandidates('/api/service-attachments/signed-urls')
      for (const endpoint of candidates) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ mediaIds: ids }),
        })

        if (!response.ok) continue

        const text = await response.text()
        let json = null
        try {
          json = text ? JSON.parse(text) : null
        } catch {
          json = null
        }

        const map = json?.signedUrlsById && typeof json.signedUrlsById === 'object' ? json.signedUrlsById : null
        if (!map) return {}
        return map
      }

      return null
    }

    try {
      let rows = null
      let error = null

      // Preferred schema (caption exists)
      {
        const r = await supabase
          .from('service_request_media')
          .select('id, request_id, media_type, caption, created_at')
          .eq('request_id', requestId)
          .order('created_at', { ascending: true })
        rows = r.data
        error = r.error
      }

      // Fallback: caption column missing
      if (error && isMissingColumnError(error)) {
        const r = await supabase
          .from('service_request_media')
          .select('id, request_id, media_type, created_at')
          .eq('request_id', requestId)
          .order('created_at', { ascending: true })
        rows = r.data
        error = r.error
      }

      if (error) {
        if (isMissingRelation(error)) return
        throw error
      }

      if (cancelledFn()) return

      const list = Array.isArray(rows) ? rows : []
      const baseItems = list
        .map((row) => {
          const mediaId = String(row?.id || '').trim()
          if (!mediaId) return null
          const mediaType = String(row?.media_type || '').trim().toLowerCase()
          const isVideo = mediaType.includes('video')
          const cachedSignedUrl = readSignedUrlCache(mediaId)
          return {
            id: mediaId,
            serverMediaId: mediaId,
            kind: isVideo ? 'video' : 'photo',
            file: null,
            previewUrl: cachedSignedUrl,
            caption: String(row?.caption || '').trim(),
            status: 'uploaded',
          }
        })
        .filter(Boolean)

      if (!merge) {
        setRequestMediaItems(baseItems)
      } else {
        setRequestMediaItems((prev) => {
          const prevList = Array.isArray(prev) ? prev : []
          const baseById = new Map(
            baseItems
              .map((it) => [String(it?.serverMediaId || it?.id || '').trim(), it])
              .filter((x) => x[0])
          )

          const next = prevList.map((p) => {
            const sid = String(p?.serverMediaId || p?.id || '').trim()
            const b = sid ? baseById.get(sid) : null
            if (!b) return p
            const nextPreview = String(p?.previewUrl || '').trim() || String(b?.previewUrl || '').trim()
            const nextCaption = String(p?.caption || '').trim() || String(b?.caption || '').trim()
            if (nextPreview === String(p?.previewUrl || '').trim() && nextCaption === String(p?.caption || '').trim()) {
              return p
            }
            return { ...p, previewUrl: nextPreview, caption: nextCaption }
          })

          const existingIds = new Set(next.map((it) => String(it?.serverMediaId || it?.id || '').trim()))
          for (const it of baseItems) {
            const sid = String(it?.serverMediaId || it?.id || '').trim()
            if (!sid) continue
            if (existingIds.has(sid)) continue
            next.push(it)
          }

          return next
        })
      }

      if (!baseItems.length) return

      const {
        data: { session },
      } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) return

      const runWithConcurrency = async (items, worker, concurrency = 4) => {
        const list = Array.isArray(items) ? items : []
        const limit = Math.max(1, Math.min(8, Number(concurrency) || 4))
        let idx = 0
        const runners = new Array(Math.min(limit, list.length)).fill(0).map(async () => {
          while (idx < list.length) {
            const current = list[idx]
            idx += 1
            await worker(current)
          }
        })
        await Promise.allSettled(runners)
      }

      // Buscar signed-url para fotos e vídeos (preview) — em paralelo + cache.
      // Para vídeos, usaremos a URL no elemento <video> para exibir uma frame.
      const toSign = baseItems
        .filter((it) => !String(it?.previewUrl || '').trim())

      // Prefer batch: reduz roundtrips (1 request ao Worker)
      try {
        const batchMap = await fetchSignedUrlsBatch({
          mediaIds: toSign.map((it) => it?.serverMediaId).filter(Boolean),
          accessToken,
        })

        if (batchMap && typeof batchMap === 'object') {
          const entries = Object.entries(batchMap)
            .map(([k, v]) => [String(k || '').trim(), String(v || '').trim()])
            .filter(([k, v]) => k && v)

          if (entries.length) {
            for (const [mediaId, signedUrl] of entries) {
              writeSignedUrlCache(mediaId, signedUrl)
            }

            setRequestMediaItems((prev) => {
              const next = (prev || []).map((p) => {
                const sid = String(p?.serverMediaId || p?.id || '').trim()
                const signedUrl = sid ? String(batchMap?.[sid] || '').trim() : ''
                return signedUrl ? { ...p, previewUrl: signedUrl } : p
              })
              writeRequestMediaCache(requestId, next)
              return next
            })
          }
        }
      } catch {
        // ignore (fallback below)
      }

      // Fallback: endpoint unitário (compatibilidade)
      const toSignAfterBatch = baseItems.filter((it) => !String(readSignedUrlCache(it?.serverMediaId || '') || it?.previewUrl || '').trim())

      await runWithConcurrency(
        toSignAfterBatch,
        async (it) => {
          if (cancelledFn()) return
          try {
            const signedUrl = await fetchSignedUrl({ mediaId: it.serverMediaId, accessToken })
            if (!signedUrl) return
            writeSignedUrlCache(it.serverMediaId, signedUrl)
            setRequestMediaItems((prev) => {
              const next = (prev || []).map((p) =>
                String(p?.serverMediaId || p?.id || '').trim() === String(it.serverMediaId)
                  ? { ...p, previewUrl: signedUrl }
                  : p
              )
              // Atualiza cache por requestId com o estado mais recente.
              writeRequestMediaCache(requestId, next)
              return next
            })
          } catch {
            // ignore
          }
        },
        4
      )

      // Persistir no cache mesmo sem signed-url (lista base)
      try {
        writeRequestMediaCache(requestId, baseItems)
      } catch {
        // ignore
      }
    } catch {
      // silencioso (não bloqueia edição)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    if (!editingBookingId) return
    if (!currentUser?.id) return

    const key = `${editingBookingId}:${currentUser.id}`
    if (editAttachmentsPrefillKeyRef.current === key) return
    editAttachmentsPrefillKeyRef.current = key

    let cancelled = false
    void loadRequestMediaFromServer({
      requestId: editingBookingId,
      merge: true,
      isCancelled: () => cancelled,
    })
    return () => {
      cancelled = true
    }
  }, [isOpen, editingBookingId, currentUser?.id])

  const normalizedService = normalizeService(serviceDetails || service)

  const normalizedPriceUnit = normalizePriceUnit(
    normalizedService?.price_unit || normalizedService?.priceUnit || 'hora'
  )
  const isMonthlyBilling = normalizedPriceUnit === 'mes'

  const hasOpenSchedule =
    !normalizedService?.availableHours ||
    normalizedService.availableHours.length === 0

  const parseSelectedAvailability = (raw) => {
    const text = String(raw || '').trim()
    if (!text) return { scheduledDate: null, scheduledTime: null, scheduleText: '' }

    // Formato esperado: "dd/MM/yyyy • <label>" (ou variantes)
    const m = text.match(/^(\d{2}\/\d{2}\/\d{4})\s*[•\-]\s*(.+)$/)
    if (!m) {
      return { scheduledDate: null, scheduledTime: text, scheduleText: text }
    }

    const datePart = String(m[1]).trim()
    const label = String(m[2] || '').trim()

    const [dd, mm, yyyy] = datePart.split('/')
    const isoDate = yyyy && mm && dd ? `${yyyy}-${mm}-${dd}` : null

    return {
      scheduledDate: isoDate,
      scheduledTime: label || null,
      scheduleText: `${datePart} • ${label || ''}`.trim(),
    }
  }

  const parseHoursFromScheduleLabel = (label) => {
    const text = String(label || '').trim()
    if (!text) return null

    // Prefer explicit hours: "4h" / "3,5h" / "3.5h"
    const hm = text.match(/(\d+(?:[.,]\d+)?)\s*h\b/i)
    if (hm) {
      const n = Number(String(hm[1]).replace(',', '.'))
      if (Number.isFinite(n) && n > 0) return n
    }

    // Fallback: sum time ranges like "08:00-12:00" or "08:00–12:00"
    const rangesText = text.match(/\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}/g) || []
    if (!rangesText.length) return null

    const minutes = rangesText
      .map((range) => {
        const m = String(range).match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/)
        if (!m) return 0
        const startMin = timeToMinutes(m[1])
        const endMin = timeToMinutes(m[2])
        if (startMin == null || endMin == null) return 0
        return Math.max(0, endMin - startMin)
      })
      .reduce((a, b) => a + b, 0)

    if (!minutes) return null
    const hours = minutes / 60
    const rounded = Math.round(hours * 10) / 10
    return rounded > 0 ? rounded : null
  }

  const computeTotalPrice = ({ price, priceUnit, scheduledTime, days }) => {
    const base = Number(price)
    if (!Number.isFinite(base) || base <= 0) return null

    const unit = normalizePriceUnit(priceUnit || 'hora')

    if (unit === 'hora') {
      const hours = parseHoursFromScheduleLabel(scheduledTime)
      const perDay = Number.isFinite(hours) && hours > 0 ? hours : 1
      const d = Number(days)
      const daysQty = Number.isFinite(d) && d > 0 ? d : 1
      const qtyHours = perDay * daysQty
      const total = base * qtyHours
      return Math.round(total * 100) / 100
    }

    if (unit === 'dia') {
      const d = Number(days)
      const qty = Number.isFinite(d) && d > 0 ? d : 1
      const total = base * qty
      return Math.round(total * 100) / 100
    }

    // Para dia/mês/projeto/evento: hoje tratamos como valor fixo (1 unidade).
    return Math.round(base * 100) / 100
  }

  const formatAvailabilityForClient = (raw) => {
    const text = String(raw || '').trim()
    if (!text) return ''

    // Novo formato: "dd/MM/yyyy • <label>"
    const m = text.match(/^(\d{2}\/\d{2}\/\d{4})\s*[•\-]\s*(.+)$/)
    if (!m) return text

    const datePart = String(m[1]).trim()
    const label = String(m[2] || '').trim()
    if (!label) return datePart

    const lower = label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()

    if (lower.startsWith('dia inteiro')) return datePart

    const range = label.match(/^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})$/)
    if (range) return `${datePart} • ${range[1]}–${range[2]}`

    return `${datePart} • ${label}`
  }

  const parseBRDate = (s) => {
    const m = String(s || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (!m) return null
    const d = Number(m[1])
    const mo = Number(m[2])
    const y = Number(m[3])
    if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return null
    if (mo < 1 || mo > 12) return null
    if (d < 1 || d > 31) return null
    const dt = new Date(y, mo - 1, d)
    return Number.isFinite(dt.getTime()) ? startOfDay(dt) : null
  }

  // ===== Modo "Horários em aberto" (cópia do padrão do ServiceForm) =====
  const stripDiacritics = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

  const timeToMinutes = (t) => {
    const m = String(t || '').match(/^(\d{2}):(\d{2})$/)
    if (!m) return null
    const hh = Number(m[1])
    const mm = Number(m[2])
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
    if (hh < 0 || hh > 23) return null
    if (mm < 0 || mm > 59) return null
    return hh * 60 + mm
  }

  const minutesToTime = (minutes) => {
    const total = Number(minutes)
    if (!Number.isFinite(total)) return null
    if (total < 0 || total > 23 * 60 + 59) return null
    const hh = Math.floor(total / 60)
    const mm = total % 60
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }

  const isCompleteTime = (t) => /^\d{2}:\d{2}$/.test(String(t || ''))
  const isUnusedPeriod = (start, end) => String(start || '') === '00:00' && String(end || '') === '00:00'

  const timeToDigits4 = (t) => {
    const v = String(t || '')
    if (!/^\d{2}:\d{2}$/.test(v)) return '0000'
    return v.replace(':', '')
  }

  const digits4ToTime = (digits4) => {
    const d = String(digits4 || '').replace(/\D/g, '').padStart(4, '0').slice(0, 4)
    return `${d.slice(0, 2)}:${d.slice(2)}`
  }

  const isValidClockTime = (t) => {
    const m = String(t || '').match(/^(\d{2}):(\d{2})$/)
    if (!m) return false
    const hh = Number(m[1])
    const mm = Number(m[2])
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false
    if (hh < 0 || hh > 23) return false
    if (mm < 0 || mm > 59) return false
    return true
  }

  const isTimeInRange = (time, minTime, maxTime) => {
    const v = timeToMinutes(time)
    const minV = timeToMinutes(minTime)
    const maxV = timeToMinutes(maxTime)
    if (v == null || minV == null || maxV == null) return false
    return v >= minV && v <= maxV
  }

  const isValidPeriodRange = ({ start, end, minTime, maxTime, allowUnused00 = false }) => {
    const s = String(start || '')
    const e = String(end || '')

    if (allowUnused00 && isUnusedPeriod(s, e)) return { valid: true, unused: true }
    if (!isCompleteTime(s) || !isCompleteTime(e)) return { valid: false, unused: false }

    if (!isTimeInRange(s, minTime, maxTime)) return { valid: false, unused: false }
    if (!isTimeInRange(e, minTime, maxTime)) return { valid: false, unused: false }

    const sm = timeToMinutes(s)
    const em = timeToMinutes(e)
    if (sm == null || em == null) return { valid: false, unused: false }
    if (em <= sm) return { valid: false, unused: false }
    return { valid: true, unused: false }
  }

  const formatHoursShort = (minutes) => {
    const total = Number(minutes)
    if (!Number.isFinite(total) || total <= 0) return ''
    if (total % 60 === 0) return `${total / 60}h`
    const dec = (total / 60).toFixed(1).replace(/\.0$/, '').replace('.', ',')
    return `${dec}h`
  }

  // Pedido: ao entrar no modo personalizado, iniciar zerado (00:00–00:00)
  useEffect(() => {
    const prev = prevWorkDayChoiceRef.current
    prevWorkDayChoiceRef.current = workDayChoice

    if (workDayChoice === 'custom' && prev !== 'custom') {
      setWorkDayCustomMorningStart('00:00')
      setWorkDayCustomMorningEnd('00:00')
      setWorkDayCustomAfternoonStart('00:00')
      setWorkDayCustomAfternoonEnd('00:00')
    }
  }, [workDayChoice])

  const TimeRangeInput = ({
    startValue,
    endValue,
    onStartChange,
    onEndChange,
    disabled,
    ariaLabelStart,
    ariaLabelEnd,
    startMin,
    startMax,
    endMin,
    endMax,
    invalid,
  }) => {
    const TimeDigitsInput = ({
      value,
      onChange,
      onComplete,
      ariaLabel,
      minTime,
      maxTime,
      mustBeAfter,
      mustBeBefore,
      inputRefExternal,
    }) => {
      const bufferDigitsRef = useRef(timeToDigits4(isCompleteTime(value) ? value : '00:00'))
      const typedCountRef = useRef(0)
      const lastRawDigitsRef = useRef('')
      const inputRef = useRef(null)
      const sessionIdRef = useRef(0)
      const suppressNextBeforeInputRef = useRef(false)

      const [flash, setFlash] = useState(false)
      const flashTimerRef = useRef(null)

      const [bufferDigits, setBufferDigits] = useState(bufferDigitsRef.current)

      useEffect(() => {
        if (!isCompleteTime(value)) return
        const next = timeToDigits4(value)
        if (next === bufferDigitsRef.current) return
        if ((typedCountRef.current || 0) > 0) return
        bufferDigitsRef.current = next
        setBufferDigits(next)
        lastRawDigitsRef.current = next
      }, [value])

      const clampToRange = (t) => {
        const v = timeToMinutes(t)
        const minV = timeToMinutes(minTime)
        const maxV = timeToMinutes(maxTime)
        if (v == null || minV == null || maxV == null) return t
        if (v < minV) return minutesToTime(minV) || t
        if (v > maxV) return minutesToTime(maxV) || t
        return t
      }

      const violatesRelationalRules = (t) => {
        if (t === '00:00') return false
        const v = timeToMinutes(t)
        if (v == null) return true

        if (mustBeAfter && isCompleteTime(mustBeAfter) && mustBeAfter !== '00:00') {
          const other = timeToMinutes(mustBeAfter)
          if (other != null && v <= other) return true
        }
        if (mustBeBefore && isCompleteTime(mustBeBefore) && mustBeBefore !== '00:00') {
          const other = timeToMinutes(mustBeBefore)
          if (other != null && v >= other) return true
        }
        return false
      }

      const resolveFinalTime = (candidate) => {
        const t = isCompleteTime(candidate) ? candidate : '00:00'

        if (t === '00:00') return { ok: true, time: '00:00' }

        if (!isValidClockTime(t)) return { ok: false, time: '00:00' }

        const clamped = isTimeInRange(t, minTime, maxTime) ? t : clampToRange(t)
        if (!isTimeInRange(clamped, minTime, maxTime)) return { ok: false, time: '00:00' }

        if (violatesRelationalRules(clamped)) return { ok: false, time: '00:00' }

        return { ok: true, time: clamped }
      }

      const commitIfNeeded = (finalAttempt, { triggerComplete = false } = {}) => {
        if (!finalAttempt) return
        const rawDigits = String(bufferDigitsRef.current || '').padStart(4, '0').slice(-4)
        const candidate = digits4ToTime(rawDigits)
        const resolved = resolveFinalTime(candidate)

        const finalDigits = timeToDigits4(resolved.time)
        bufferDigitsRef.current = finalDigits
        setBufferDigits(finalDigits)
        typedCountRef.current = 0
        lastRawDigitsRef.current = ''

        onChange(resolved.time)

        if (triggerComplete && resolved?.ok && resolved.time !== '00:00' && typeof onComplete === 'function') {
          try {
            onComplete()
          } catch {
            // ignore
          }
        }
      }

      const appendDigit = (digit, { finalAttempt = false } = {}) => {
        const d = String(digit)
        if (!/^\d$/.test(d)) return
        const prev = String(bufferDigitsRef.current || '')
        const next = (prev + d).slice(0, 4)
        bufferDigitsRef.current = next
        setBufferDigits(next)

        try {
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
          setFlash(true)
          flashTimerRef.current = setTimeout(() => setFlash(false), 120)
        } catch {
          // ignore
        }

        commitIfNeeded(finalAttempt, { triggerComplete: finalAttempt })
      }

      const allowControlKey = (e) => {
        const k = e.key
        if (k === 'Tab' || k === 'Enter' || k === 'Escape') return true
        if (k.startsWith('Arrow')) return true
        if (k === 'Home' || k === 'End') return true
        return false
      }

      const rollBackspace = () => {
        const prev = String(bufferDigitsRef.current || '')
        const next = prev.slice(0, Math.max(0, prev.length - 1))
        bufferDigitsRef.current = next
        setBufferDigits(next)
        typedCountRef.current = Math.max(0, Math.min(4, (typedCountRef.current || 0) - 1))
      }

      const beginNewEntrySession = () => {
        sessionIdRef.current += 1
        bufferDigitsRef.current = ''
        typedCountRef.current = 0
        lastRawDigitsRef.current = ''
        setBufferDigits('')
      }

      const handlePointerDown = () => {
        if (disabled) return
        beginNewEntrySession()
        setTimeout(() => {
          try {
            moveCaretToEnd(inputRef.current)
          } catch {
            // ignore
          }
        }, 0)
      }

      const moveCaretToEnd = (el) => {
        try {
          const len = el.value.length
          el.setSelectionRange(len, len)
        } catch {
          // ignore
        }
      }

      return (
        <input
          ref={(el) => {
            inputRef.current = el
            if (typeof inputRefExternal === 'function') inputRefExternal(el)
            else if (inputRefExternal && typeof inputRefExternal === 'object') {
              inputRefExternal.current = el
            }
          }}
          type="text"
          inputMode="numeric"
          pattern="\d{2}:\d{2}"
          placeholder="HH:MM"
          value={digits4ToTime(String(bufferDigits || '').padStart(4, '0').slice(-4))}
          onBeforeInput={(e) => {
            if (disabled) return
            const data = e.data
            if (!data || typeof data !== 'string') return
            if (!/^\d$/.test(data)) return

            if (suppressNextBeforeInputRef.current) {
              suppressNextBeforeInputRef.current = false
              e.preventDefault()
              return
            }

            e.preventDefault()
            const nextCount = Math.min(4, (typedCountRef.current || 0) + 1)
            typedCountRef.current = nextCount
            appendDigit(data, { finalAttempt: nextCount >= 4 })
          }}
          onPointerDown={handlePointerDown}
          onKeyDown={(e) => {
            if (allowControlKey(e)) return
            if (e.key === 'Backspace') {
              e.preventDefault()
              rollBackspace()
              return
            }
            if (e.key === 'Delete') {
              e.preventDefault()
              return
            }
            if (/^\d$/.test(e.key)) {
              e.preventDefault()
              suppressNextBeforeInputRef.current = true
              const nextCount = Math.min(4, (typedCountRef.current || 0) + 1)
              typedCountRef.current = nextCount
              appendDigit(e.key, { finalAttempt: nextCount >= 4 })
              return
            }
            e.preventDefault()
          }}
          onPaste={(e) => {
            e.preventDefault()
            const text = e.clipboardData?.getData('text') || ''
            const digits = text.replace(/\D/g, '')
            if (!digits) return
            for (const ch of digits) {
              const nextCount = Math.min(4, (typedCountRef.current || 0) + 1)
              typedCountRef.current = nextCount
              appendDigit(ch, { finalAttempt: nextCount >= 4 })
            }
          }}
          onChange={(e) => {
            const raw = String(e.target.value || '')
            const digits = raw.replace(/\D/g, '').slice(-4)
            if (!digits) {
              lastRawDigitsRef.current = ''
              bufferDigitsRef.current = ''
              typedCountRef.current = 0
              setBufferDigits('')
              return
            }
            if (digits.length < (typedCountRef.current || 0)) {
              const times = Math.min(4, (typedCountRef.current || 0) - digits.length)
              for (let i = 0; i < times; i++) rollBackspace()
              lastRawDigitsRef.current = digits
              return
            }
            lastRawDigitsRef.current = digits
          }}
          onFocus={(e) => {
            beginNewEntrySession()
            moveCaretToEnd(e.currentTarget)
          }}
          onClick={(e) => moveCaretToEnd(e.currentTarget)}
          onSelect={(e) => moveCaretToEnd(e.currentTarget)}
          onBlur={() => {
            if ((typedCountRef.current || 0) > 0) {
              commitIfNeeded(true, { triggerComplete: false })
            }
            try {
              if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
              flashTimerRef.current = null
              setFlash(false)
            } catch {
              // ignore
            }
          }}
          disabled={disabled}
          aria-label={ariaLabel}
          className={
            'flex h-10 w-full bg-transparent px-3 py-2 text-sm outline-none ' +
            (flash ? 'ring-1 ring-primary/35 rounded-sm ' : '') +
            'disabled:cursor-not-allowed disabled:opacity-50'
          }
        />
      )
    }

    const startInputRef = useRef(null)
    const endInputRef = useRef(null)

    const focusEndInput = () => {
      if (disabled) return
      const el = endInputRef.current
      if (!el || typeof el.focus !== 'function') return

      const tryFocus = () => {
        try {
          el.focus()
          try {
            const len = el.value?.length || 0
            el.setSelectionRange(len, len)
          } catch {
            // ignore
          }
        } catch {
          // ignore
        }
      }

      tryFocus()
      try {
        requestAnimationFrame(() => tryFocus())
      } catch {
        // ignore
      }
      setTimeout(() => tryFocus(), 25)
    }

    return (
      <div
        className={
          'flex items-center rounded-md border bg-background ring-offset-background focus-within:ring-2 focus-within:ring-offset-2 ' +
          (invalid ? 'border-destructive focus-within:ring-destructive' : 'border-input focus-within:ring-ring')
        }
      >
        <TimeDigitsInput
          value={startValue}
          onChange={onStartChange}
          disabled={disabled}
          ariaLabel={ariaLabelStart}
          minTime={startMin}
          maxTime={startMax}
          mustBeBefore={endValue}
          inputRefExternal={startInputRef}
          onComplete={() => {
            focusEndInput()
          }}
        />
        <span className="px-1 text-sm text-muted-foreground">-</span>
        <TimeDigitsInput
          value={endValue}
          onChange={onEndChange}
          disabled={disabled}
          ariaLabel={ariaLabelEnd}
          minTime={endMin}
          maxTime={endMax}
          mustBeAfter={startValue}
          inputRefExternal={endInputRef}
        />
      </div>
    )
  }

  const syncWorkDays = (nextMap) => {
    setWorkDaysMap(nextMap)
  }

  const WORKDAY_RANGES = {
    morningStart: '08:00',
    afternoonEnd: '18:00',
    defaultCustomMorningStart: '07:00',
    defaultCustomMorningEnd: '12:00',
    defaultCustomAfternoonStart: '13:00',
    defaultCustomAfternoonEnd: '18:00',
  }

  const workDayPresets = [
    { key: 'full', label: 'Dia inteiro (sem horário)' },
    { key: 'morning', label: 'Manhã' },
    { key: 'afternoon', label: 'Tarde' },
    { key: 'custom', label: 'Personalizado' },
  ]

  const getWorkDayKey = (dt) => (dt ? format(startOfDay(dt), 'yyyy-MM-dd') : '')

  const parseTimeRangeLabel = (label) => {
    const m = String(label || '').trim().match(/^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})$/)
    if (!m) return null
    return { start: m[1], end: m[2] }
  }

  const getChoiceFromLabel = (label) => {
    const raw = String(label || '').trim()
    if (!raw) return null
    if (stripDiacritics(raw).toLowerCase().startsWith('dia inteiro')) return { choice: 'full' }

    const rangesText = raw.match(/\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}/g) || []
    const ranges = rangesText.map(parseTimeRangeLabel).filter(Boolean)

    if (!ranges.length) return { choice: 'custom' }

    if (ranges.length === 1) {
      const range = ranges[0]
      if (range.start === WORKDAY_RANGES.morningStart) {
        return { choice: 'slots', morning: true, afternoon: false, ranges }
      }
      if (range.end === WORKDAY_RANGES.afternoonEnd) {
        return { choice: 'slots', morning: false, afternoon: true, ranges }
      }
      return { choice: 'custom', ranges }
    }

    const hasMorning = ranges.some((r) => r.start === WORKDAY_RANGES.morningStart)
    const hasAfternoon = ranges.some((r) => r.end === WORKDAY_RANGES.afternoonEnd)
    if (hasMorning || hasAfternoon) {
      return { choice: 'slots', morning: hasMorning, afternoon: hasAfternoon, ranges }
    }

    return { choice: 'custom', ranges }
  }

  const clampHours = (v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return 4
    return Math.max(1, Math.min(6, Math.round(n)))
  }

  const buildMorningRange = (hours) => {
    const startMin = timeToMinutes(WORKDAY_RANGES.morningStart)
    if (startMin == null) return null
    const endMin = startMin + clampHours(hours) * 60
    const end = minutesToTime(endMin)
    if (!end) return null
    return { start: WORKDAY_RANGES.morningStart, end }
  }

  const buildAfternoonRange = (hours) => {
    const endMin = timeToMinutes(WORKDAY_RANGES.afternoonEnd)
    if (endMin == null) return null
    const startMin = endMin - clampHours(hours) * 60
    const start = minutesToTime(startMin)
    if (!start) return null
    return { start, end: WORKDAY_RANGES.afternoonEnd }
  }

  const getSlotsLabel = () => {
    const useMorning = !!slotMorningEnabled
    const useAfternoon = !!slotAfternoonEnabled
    if (!useMorning && !useAfternoon) return null

    const parts = []
    if (useMorning) {
      const r = buildMorningRange(morningHours)
      if (!r) return null
      parts.push(`${r.start}–${r.end}`)
    }
    if (useAfternoon) {
      const r = buildAfternoonRange(afternoonHours)
      if (!r) return null
      parts.push(`${r.start}–${r.end}`)
    }
    return parts.join(' e ')
  }

  const getLabelForChoice = ({ choice, start, end, ranges }) => {
    if (choice === 'full') return 'Dia inteiro'
    if (choice === 'slots') return getSlotsLabel()

    const customRanges = Array.isArray(ranges) ? ranges : start && end ? [{ start, end }] : []
    if (customRanges.length) {
      const valid = customRanges
        .map((r) => ({ start: r?.start, end: r?.end }))
        .filter((r) => {
          const startMin = timeToMinutes(r.start)
          const endMin = timeToMinutes(r.end)
          return startMin != null && endMin != null && endMin > startMin
        })

      if (!valid.length) return null
      return valid.map((r) => `${r.start}–${r.end}`).join(' e ')
    }

    const startMin = timeToMinutes(start)
    const endMin = timeToMinutes(end)
    if (startMin == null || endMin == null || endMin <= startMin) return null
    return `${start}–${end}`
  }

  const getSelectedDayKeys = () => Object.keys(workDaysMap || {}).filter(Boolean).sort()

  const applyChoiceToAllSelectedDays = (choice) => {
    const selectedKey = getWorkDayKey(selectedWorkDay)
    if (!selectedKey) return
    const effectiveChoice = isMonthlyBilling && choice === 'full' ? 'slots' : choice
    if (effectiveChoice === 'custom') return

    const label = getLabelForChoice({ choice: effectiveChoice })
    if (!label) return

    const next = { ...(workDaysMap || {}) }
    const entry = next[selectedKey]
    next[selectedKey] = { ...(entry || {}), label, mode: effectiveChoice }
    syncWorkDays(next)
  }

  // No modo personalizado, ao selecionar "Personalizado" marcamos o dia como personalizado
  // mesmo antes de preencher horários (badge deve mostrar "1 turno").
  useEffect(() => {
    if (workDayChoice !== 'custom') return
    if (!selectedWorkDay) return
    const key = getWorkDayKey(selectedWorkDay)
    if (!key) return

    const prev = workDaysMap?.[key]
    if (prev?.mode === 'custom') return
    const next = { ...(workDaysMap || {}), [key]: { ...(prev || {}), mode: 'custom', label: prev?.label || '' } }
    syncWorkDays(next)
  }, [workDayChoice, selectedWorkDay, workDaysMap])

  // Se o serviço for mensal, garantimos horário definido (sem "Dia inteiro") automaticamente.
  useEffect(() => {
    if (!isMonthlyBilling) return
    const keys = Object.keys(workDaysMap || {})
    if (!keys.length) return

    let changed = false
    const next = { ...(workDaysMap || {}) }
    for (const key of keys) {
      const entry = next[key]
      if (!entry?.label) continue
      if (stripDiacritics(entry.label).toLowerCase().startsWith('dia inteiro')) {
        const r = buildMorningRange(morningHours)
        next[key] = {
          ...(entry || {}),
          label: r
            ? `${r.start}–${r.end}`
            : `${WORKDAY_RANGES.morningStart}–${WORKDAY_RANGES.afternoonEnd}`,
          mode: 'slots',
        }
        changed = true
      }
    }

    if (changed) syncWorkDays(next)
  }, [isMonthlyBilling, workDaysMap, morningHours])

  // Quando estiver em Manhã/Tarde (slots), qualquer ajuste aplica somente ao dia selecionado.
  useEffect(() => {
    if (workDayChoice !== 'slots') return
    if (!selectedWorkDay) return
    const selectedKey = getWorkDayKey(selectedWorkDay)
    if (!selectedKey) return

    const label = getSlotsLabel()
    if (!label) return

    const currentEntry = workDaysMap?.[selectedKey]
    if ((currentEntry?.label || '') === label && currentEntry?.mode === 'slots') return

    const next = { ...(workDaysMap || {}) }
    next[selectedKey] = { ...(currentEntry || {}), label, mode: 'slots' }
    syncWorkDays(next)
  }, [workDayChoice, selectedWorkDay, slotMorningEnabled, slotAfternoonEnabled, morningHours, afternoonHours])

  // No modo personalizado, qualquer ajuste salva automaticamente no dia selecionado.
  useEffect(() => {
    if (workDayChoice !== 'custom') return
    if (!selectedWorkDay) return

    const key = getWorkDayKey(selectedWorkDay)
    if (!key) return

    const morning = isValidPeriodRange({
      start: workDayCustomMorningStart,
      end: workDayCustomMorningEnd,
      minTime: '00:00',
      maxTime: '12:59',
      allowUnused00: true,
    })

    const afternoon = isValidPeriodRange({
      start: workDayCustomAfternoonStart,
      end: workDayCustomAfternoonEnd,
      minTime: '13:00',
      maxTime: '23:59',
      allowUnused00: true,
    })

    const hasInvalid = (!morning.valid && !morning.unused) || (!afternoon.valid && !afternoon.unused)
    if (hasInvalid) return

    const ranges = []
    if (morning.valid && !morning.unused) {
      ranges.push({ start: workDayCustomMorningStart, end: workDayCustomMorningEnd })
    }
    if (afternoon.valid && !afternoon.unused) {
      ranges.push({ start: workDayCustomAfternoonStart, end: workDayCustomAfternoonEnd })
    }
    if (!ranges.length) return

    // Memoriza o último personalizado válido para propagar ao clicar em outros dias.
    lastValidCustomRangesRef.current = ranges

    const label = getLabelForChoice({ choice: 'custom', ranges })
    if (!label) return

    if ((workDaysMap?.[key]?.label || '') === label) return
    const prevEntry = workDaysMap?.[key]
    const next = { ...(workDaysMap || {}), [key]: { ...(prevEntry || {}), label, mode: 'custom' } }
    syncWorkDays(next)
  }, [
    workDayChoice,
    selectedWorkDay,
    workDayCustomMorningStart,
    workDayCustomMorningEnd,
    workDayCustomAfternoonStart,
    workDayCustomAfternoonEnd,
    workDaysMap,
  ])

  const getWorkDayBadge = (dt) => {
    const key = getWorkDayKey(dt)
    if (!key) return null
    const entry = workDaysMap?.[key]
    if (!entry) return null

    const mode = entry?.mode

    // Personalizado: sempre mostrar 1/2 turnos, mesmo sem horário.
    if (mode === 'custom') {
      const raw = String(entry.label || '').trim()
      const rangesText = raw.match(/\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}/g) || []
      const ranges = rangesText.map(parseTimeRangeLabel).filter(Boolean)

      const morningConfigured = ranges.some((r) => isTimeInRange(r.start, '00:00', '12:59'))
      const afternoonConfigured = ranges.some((r) => isTimeInRange(r.start, '13:00', '23:59'))

      // Regra: sem horários ainda -> 1 turno
      // Só 2º turno configurado -> 2 turnos
      // Ambos configurados -> 2 turnos
      const title = afternoonConfigured ? '2 turnos' : '1 turno'

      const minutes = ranges
        .map((r) => {
          const startMin = timeToMinutes(r.start)
          const endMin = timeToMinutes(r.end)
          if (startMin == null || endMin == null) return 0
          return Math.max(0, endMin - startMin)
        })
        .reduce((a, b) => a + b, 0)

      const hours = minutes ? formatHoursShort(minutes) : ''
      return { hours, title }
    }

    const raw = String(entry.label || '').trim()
    if (!raw) return null

    const lower = stripDiacritics(raw).toLowerCase()
    if (lower.startsWith('dia inteiro')) return { hours: '', title: 'Dia inteiro' }

    const rangesText = raw.match(/\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}/g) || []
    if (rangesText.length > 1) {
      const ranges = rangesText.map(parseTimeRangeLabel).filter(Boolean)
      const hasMorning = ranges.some((r) => r.start === WORKDAY_RANGES.morningStart)
      const hasAfternoon = ranges.some((r) => r.end === WORKDAY_RANGES.afternoonEnd)
      const minutes = ranges
        .map((r) => {
          const startMin = timeToMinutes(r.start)
          const endMin = timeToMinutes(r.end)
          if (startMin == null || endMin == null) return 0
          return Math.max(0, endMin - startMin)
        })
        .reduce((a, b) => a + b, 0)

      const hours = minutes ? formatHoursShort(minutes) : ''

      if (hasMorning && hasAfternoon) return { hours, title: 'Manhã', subtitle: '+ Tarde' }
      return { hours, title: raw }
    }

    const range = parseTimeRangeLabel(raw)
    if (!range) return { hours: '', title: raw }

    const startMin = timeToMinutes(range.start)
    const endMin = timeToMinutes(range.end)
    const minutes = startMin != null && endMin != null ? endMin - startMin : null
    const hours = minutes != null ? formatHoursShort(minutes) : ''

    if (range.start === WORKDAY_RANGES.morningStart) return { hours, title: 'Manhã' }
    if (range.end === WORKDAY_RANGES.afternoonEnd) return { hours, title: 'Tarde' }

    return { hours, title: raw }
  }

  const selectWorkDay = (dt) => {
    const d = startOfDay(dt)
    const key = getWorkDayKey(d)
    if (!key) return

    // Segundo toque no mesmo dia selecionado: remove disponibilidade.
    if (selectedWorkDay && isSameDay(d, selectedWorkDay)) {
      const next = { ...(workDaysMap || {}) }
      delete next[key]
      syncWorkDays(next)
      setSelectedWorkDay(null)
      return
    }

    // Primeiro toque: seleciona (e garante que o dia fique marcado como disponível).
    setSelectedWorkDay(d)

    const entry = workDaysMap?.[key]
    const entryMode = entry?.mode
    const parsed = getChoiceFromLabel(entry?.label)

    // Se o usuário está em Personalizado e clicou em um dia vazio,
    // aplica/propaga o estado personalizado (mesma UX do editor).
    if (!entry) {
      const defaultChoice = workDayChoice || (isMonthlyBilling ? 'slots' : 'full')
      const safeChoice = isMonthlyBilling && defaultChoice === 'full' ? 'slots' : defaultChoice

      const wantsCustom = safeChoice === 'custom'
      const customLabel = wantsCustom
        ? getLabelForChoice({
            choice: 'custom',
            ranges: [
              { start: workDayCustomMorningStart, end: workDayCustomMorningEnd },
              { start: workDayCustomAfternoonStart, end: workDayCustomAfternoonEnd },
            ],
          })
        : null

      const fallbackCustomLabel =
        wantsCustom && Array.isArray(lastValidCustomRangesRef.current)
          ? getLabelForChoice({ choice: 'custom', ranges: lastValidCustomRangesRef.current })
          : null

      const defaultLabel = wantsCustom
        ? customLabel || fallbackCustomLabel || ''
        : getLabelForChoice({ choice: safeChoice })

      const next = { ...(workDaysMap || {}), [key]: { label: defaultLabel } }
      if (safeChoice === 'custom') {
        next[key] = { ...(next[key] || {}), mode: 'custom' }
      } else if (safeChoice === 'slots') {
        next[key] = { ...(next[key] || {}), mode: 'slots' }
      } else if (safeChoice === 'full') {
        next[key] = { ...(next[key] || {}), mode: 'full' }
      }
      syncWorkDays(next)
      setWorkDayChoice(safeChoice)
      if (safeChoice === 'slots') {
        if (!slotMorningEnabled && !slotAfternoonEnabled) {
          setSlotMorningEnabled(true)
        }
      }
      if (safeChoice === 'custom') {
        setWorkDayCustomMorningStart(
          workDayCustomMorningStart || WORKDAY_RANGES.defaultCustomMorningStart
        )
        setWorkDayCustomMorningEnd(
          workDayCustomMorningEnd || WORKDAY_RANGES.defaultCustomMorningEnd
        )
        setWorkDayCustomAfternoonStart(
          workDayCustomAfternoonStart || WORKDAY_RANGES.defaultCustomAfternoonStart
        )
        setWorkDayCustomAfternoonEnd(
          workDayCustomAfternoonEnd || WORKDAY_RANGES.defaultCustomAfternoonEnd
        )
      }
      return
    }

    // Se este dia já foi marcado como personalizado, respeita isso.
    const forcedCustom = entryMode === 'custom'
    const choice = forcedCustom ? 'custom' : parsed?.choice || 'custom'
    const safeChoice = isMonthlyBilling && choice === 'full' ? 'slots' : choice
    setWorkDayChoice(safeChoice)
    if (safeChoice === 'slots') {
      const morning = parsed?.morning
      const afternoon = parsed?.afternoon
      setSlotMorningEnabled(typeof morning === 'boolean' ? morning : true)
      setSlotAfternoonEnabled(typeof afternoon === 'boolean' ? afternoon : false)

      const ranges = Array.isArray(parsed?.ranges) ? parsed.ranges : []
      for (const r of ranges) {
        const startMin = timeToMinutes(r.start)
        const endMin = timeToMinutes(r.end)
        if (startMin == null || endMin == null) continue
        const hours = clampHours((endMin - startMin) / 60)
        if (r.start === WORKDAY_RANGES.morningStart) setMorningHours(hours)
        if (r.end === WORKDAY_RANGES.afternoonEnd) setAfternoonHours(hours)
      }
    }
    if (safeChoice === 'custom') {
      const ranges = Array.isArray(parsed?.ranges) ? parsed.ranges : []
      const byTime = ranges
        .map((r) => ({ start: r?.start, end: r?.end }))
        .filter((r) => timeToMinutes(r.start) != null && timeToMinutes(r.end) != null)
        .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))

      const morning = byTime[0]
      const afternoon = byTime[1]

      if (morning?.start && morning?.end) {
        setWorkDayCustomMorningStart(morning.start)
        setWorkDayCustomMorningEnd(morning.end)
      }
      if (afternoon?.start && afternoon?.end) {
        setWorkDayCustomAfternoonStart(afternoon.start)
        setWorkDayCustomAfternoonEnd(afternoon.end)
      }

      if (!morning) {
        setWorkDayCustomMorningStart(
          workDayCustomMorningStart || WORKDAY_RANGES.defaultCustomMorningStart
        )
        setWorkDayCustomMorningEnd(
          workDayCustomMorningEnd || WORKDAY_RANGES.defaultCustomMorningEnd
        )
      }
      if (!afternoon) {
        setWorkDayCustomAfternoonStart(
          workDayCustomAfternoonStart || WORKDAY_RANGES.defaultCustomAfternoonStart
        )
        setWorkDayCustomAfternoonEnd(
          workDayCustomAfternoonEnd || WORKDAY_RANGES.defaultCustomAfternoonEnd
        )
      }

      // Se o label existente só tem o 2º turno, garantimos que o 1º fique "unused".
      if (!morning && afternoon) {
        setWorkDayCustomMorningStart('00:00')
        setWorkDayCustomMorningEnd('00:00')
      }
    }
  }

  const buildOpenScheduleSelection = () => {
    if (!selectedWorkDay) return null
    const key = getWorkDayKey(selectedWorkDay)
    if (!key) return null
    const entry = workDaysMap?.[key]
    const label = String(entry?.label || '').trim()
    if (!label) return null

    const dt = new Date(`${key}T00:00:00`)
    if (!Number.isFinite(dt.getTime())) return null
    const br = format(dt, 'dd/MM/yyyy', { locale: ptBR })
    return {
      scheduledDate: key,
      scheduledTime: label,
      scheduleText: `${br} • ${label}`,
    }
  }

  const normalizeRange = (r) => String(r || '').replace(/\s*[-–]\s*/g, '–').trim()

  const extractSlotsFromLabel = (rawLabel) => {
    const label = String(rawLabel || '').trim()
    if (!label) return []

    const ranges = label.match(/\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}/g) || []
    const normalized = ranges.map(normalizeRange).filter(Boolean)
    if (normalized.length) return normalized

    return [label]
  }

  const availabilityIndex = useMemo(() => {
    const items = Array.isArray(normalizedService?.availableHours)
      ? normalizedService.availableHours
      : []

    const byKey = {}
    let hasAny = false

    for (const raw of items) {
      const text = String(raw || '').trim()
      if (!text) continue
      const m = text.match(/^(\d{2}\/\d{2}\/\d{4})\s*[•\-]\s*(.+)$/)
      if (!m) continue
      const dt = parseBRDate(m[1])
      if (!dt) continue

      const key = format(dt, 'yyyy-MM-dd')
      const label = String(m[2] || '').trim()
      const slots = extractSlotsFromLabel(label)

      if (!byKey[key]) {
        byKey[key] = {
          date: dt,
          br: format(dt, 'dd/MM/yyyy', { locale: ptBR }),
          labels: [],
          slots: [],
        }
      }

      if (label && !byKey[key].labels.includes(label)) byKey[key].labels.push(label)
      for (const s of slots) {
        if (!byKey[key].slots.includes(s)) byKey[key].slots.push(s)
      }

      hasAny = true
    }

    return {
      hasAny,
      byKey,
      keys: Object.keys(byKey).sort(),
    }
  }, [normalizedService?.availableHours])

  const selectedAvailability = selectedAvailabilityDayKey
    ? availabilityIndex.byKey?.[selectedAvailabilityDayKey] || null
    : null

  const getFixedSchedulePeriodOptions = (entry) => {
    if (!entry) return []

    const labels = Array.isArray(entry.labels) ? entry.labels : []
    const lowerLabels = labels.map((l) => stripDiacritics(String(l || '')).toLowerCase())

    const hasExplicitMorning = lowerLabels.some((l) => l.includes('manha'))
    const hasExplicitAfternoon = lowerLabels.some((l) => l.includes('tarde'))
    const isFullDay = lowerLabels.some((l) => l.startsWith('dia inteiro'))

    let sawAnyRange = false
    let hasExactMorning = false
    let hasExactAfternoon = false
    let morningRangeText = ''
    let afternoonRangeText = ''
    const customRanges = []

    for (const rawLabel of labels) {
      const raw = String(rawLabel || '').trim()
      if (!raw) continue
      const rangesText = raw.match(/\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}/g) || []
      if (!rangesText.length) continue
      sawAnyRange = true

      for (const rt of rangesText) {
        const rangeText = normalizeRange(rt)
        const range = parseTimeRangeLabel(rangeText)
        if (!range) continue
        const startMin = timeToMinutes(range.start)
        const endMin = timeToMinutes(range.end)
        if (startMin == null || endMin == null) continue
        const minutes = Math.max(0, endMin - startMin)
        if (!minutes) continue

        // Apenas o padrão do editor define Manhã/Tarde.
        if (range.start === WORKDAY_RANGES.morningStart) {
          hasExactMorning = true
          if (!morningRangeText) morningRangeText = rangeText
          continue
        }
        if (range.end === WORKDAY_RANGES.afternoonEnd) {
          hasExactAfternoon = true
          if (!afternoonRangeText) afternoonRangeText = rangeText
          continue
        }

        // Qualquer outro range é considerado "personalizado" e vira Turno.
        customRanges.push({ start: range.start, end: range.end, minutes, rangeText })
      }
    }

    // Se vier sem ranges (ex.: "Manhã" ou "Tarde"), mantém como Manhã/Tarde sem horário.
    // (Não temos como inferir o range nesse caso.)

    const options = []
    const hasMorning = hasExactMorning || hasExplicitMorning || isFullDay
    const hasAfternoon = hasExactAfternoon || hasExplicitAfternoon || isFullDay

    // Se existir qualquer range personalizado, mostramos Turnos (e não Manhã/Tarde).
    const shouldUseTurns = sawAnyRange && customRanges.length > 0
    if (shouldUseTurns) {
      const uniq = new Map()
      for (const r of customRanges) {
        const k = r.rangeText || `${r.start}–${r.end}`
        if (!uniq.has(k)) uniq.set(k, r)
      }
      const ranges = Array.from(uniq.values()).sort((a, b) => {
        const am = timeToMinutes(a.start)
        const bm = timeToMinutes(b.start)
        return (am ?? 0) - (bm ?? 0)
      })

      const limited = ranges.slice(0, 2)
      limited.forEach((r, idx) => {
        const t = `${idx + 1} Turno`
        const rangeText = r.rangeText || `${r.start}–${r.end}`
        options.push({
          key: `shift-${idx + 1}`,
          title: t,
          detail: rangeText,
          // Para turno personalizado, o valor selecionado deve ser o horário preferido do profissional.
          value: rangeText,
          // display é o que aparece no chip.
          display: t,
        })
      })

      return options
    }

    if (hasMorning) {
      options.push({
        key: 'morning',
        title: 'Manhã',
        detail: morningRangeText || '',
        value: morningRangeText || 'Manhã',
        display: 'Manhã',
      })
    }
    if (hasAfternoon) {
      options.push({
        key: 'afternoon',
        title: 'Tarde',
        detail: afternoonRangeText || '',
        value: afternoonRangeText || 'Tarde',
        display: 'Tarde',
      })
    }

    return options
  }

  const fixedSchedulePeriodOptions = useMemo(() => {
    if (!selectedAvailability) return []
    return getFixedSchedulePeriodOptions(selectedAvailability)
  }, [selectedAvailability])

  const getAvailabilityBadge = (dayKey) => {
    const entry = availabilityIndex?.byKey?.[dayKey]
    if (!entry) return null

    const parseHoursFromText = (text) => {
      const m = String(text || '').match(/(\d+(?:[.,]\d+)?)\s*h\b/i)
      if (!m) return ''
      const n = Number(String(m[1]).replace(',', '.'))
      if (!Number.isFinite(n)) return ''
      const rounded = Math.round(n * 10) / 10
      return (rounded % 1 === 0 ? `${Math.trunc(rounded)}h` : `${rounded}h`).replace('.', ',')
    }

    const parseBadgeFromLabel = (rawLabel) => {
      const raw = String(rawLabel || '').trim()
      if (!raw) return null

      const lower = stripDiacritics(raw).toLowerCase()
      if (lower.startsWith('dia inteiro')) return { hours: '', title: 'Dia inteiro' }

      const hoursFromText = parseHoursFromText(raw)
      if (hoursFromText) {
        const title = raw
          .replace(/\(\s*\d+(?:[.,]\d+)?\s*h\s*\)/gi, '')
          .replace(/\b\d+(?:[.,]\d+)?\s*h\b/gi, '')
          .replace(/[()]/g, '')
          .trim()
        return { hours: hoursFromText, title: title || 'Horário' }
      }

      const rangesText = raw.match(/\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}/g) || []
      if (rangesText.length) {
        const ranges = rangesText.map(parseTimeRangeLabel).filter(Boolean)
        const hasMorning = ranges.some((r) => r.start === WORKDAY_RANGES.morningStart)
        const hasAfternoon = ranges.some((r) => r.end === WORKDAY_RANGES.afternoonEnd)
        const minutes = ranges
          .map((r) => {
            const startMin = timeToMinutes(r.start)
            const endMin = timeToMinutes(r.end)
            if (startMin == null || endMin == null) return 0
            return Math.max(0, endMin - startMin)
          })
          .reduce((a, b) => a + b, 0)
        const hours = minutes ? formatHoursShort(minutes) : ''

        if (rangesText.length > 1 && hasMorning && hasAfternoon) {
          return { hours, title: 'Manhã', subtitle: '+ Tarde' }
        }
        const first = ranges[0]
        if (first?.start === WORKDAY_RANGES.morningStart) return { hours, title: 'Manhã' }
        if (first?.end === WORKDAY_RANGES.afternoonEnd) return { hours, title: 'Tarde' }

        // Personalizado: exibir turnos e (quando possível) a carga horária.
        const turnosCount = rangesText.length
        const turnosLabel = `${turnosCount} turno${turnosCount === 1 ? '' : 's'}`
        return { hours, title: turnosLabel }
      }

      return { hours: '', title: raw }
    }

    // Preferir um label único; se houver vários, ainda tentamos pelo primeiro.
    const label = Array.isArray(entry.labels) && entry.labels.length ? entry.labels[0] : ''
    return parseBadgeFromLabel(label)
  }

  const fixedDaySummary = useMemo(() => {
    if (!selectedAvailabilityDayKey || !selectedAvailability) return null

    const badge = getAvailabilityBadge(selectedAvailabilityDayKey)
    const isTurno = !!badge && /\bturno\b/i.test(String(badge?.title || ''))

    if (isTurno) {
      const labels = Array.isArray(selectedAvailability?.labels)
        ? selectedAvailability.labels
        : []

      const uniq = new Map()
      for (const rawLabel of labels) {
        const raw = String(rawLabel || '').trim()
        if (!raw) continue
        const rangesText = raw.match(/\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}/g) || []
        for (const rt of rangesText) {
          const rangeText = normalizeRange(rt)
          const parsed = parseTimeRangeLabel(rangeText)
          if (!parsed) continue
          const startMin = timeToMinutes(parsed.start)
          const endMin = timeToMinutes(parsed.end)
          if (startMin == null || endMin == null || endMin <= startMin) continue
          if (!uniq.has(rangeText)) uniq.set(rangeText, { startMin, rangeText })
        }
      }

      const ranges = Array.from(uniq.values())
        .sort((a, b) => (a.startMin ?? 0) - (b.startMin ?? 0))
        .map((r) => r.rangeText)

      return {
        mode: 'custom',
        label: 'Horário personalizado',
        chips: ranges.length ? ranges : ['Horário personalizado'],
      }
    }

    const labels = Array.isArray(selectedAvailability?.labels)
      ? selectedAvailability.labels
      : []

    const parseExplicitHours = (raw, needle) => {
      const text = stripDiacritics(String(raw || '')).toLowerCase()
      if (!text.includes(needle)) return null
      // Prefer formats like "(5h)" or "5h" near the keyword.
      const re = new RegExp(`${needle}[^\d]*(\d+(?:[.,]\d+)?)\s*h`, 'i')
      const m = String(raw || '').match(re)
      if (!m) return null
      const n = Number(String(m[1]).replace(',', '.'))
      return Number.isFinite(n) && n > 0 ? n : null
    }

    const extractRanges = () => {
      const ranges = []
      for (const rawLabel of labels) {
        const raw = String(rawLabel || '').trim()
        if (!raw) continue
        const rangesText = raw.match(/\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}/g) || []
        for (const rt of rangesText) {
          const rangeText = normalizeRange(rt)
          const parsed = parseTimeRangeLabel(rangeText)
          if (!parsed) continue
          const startMin = timeToMinutes(parsed.start)
          const endMin = timeToMinutes(parsed.end)
          if (startMin == null || endMin == null || endMin <= startMin) continue
          ranges.push({ start: parsed.start, end: parsed.end, startMin, endMin, minutes: endMin - startMin })
        }
      }
      return ranges
    }

    const lowerAll = stripDiacritics(labels.join(' ')).toLowerCase()
    const isAllDay = lowerAll.includes('dia inteiro')

    const ranges = extractRanges()
    const morningRange = ranges.find((r) => r.start === WORKDAY_RANGES.morningStart) || null
    const afternoonRange = ranges.find((r) => r.end === WORKDAY_RANGES.afternoonEnd) || null
    const totalFromRangesMinutes = ranges.reduce((acc, r) => acc + (r.minutes || 0), 0)

    const badgeHoursText = String(badge?.hours || '').trim()

    const morningHoursNum =
      morningRange?.minutes ? morningRange.minutes / 60 : labels.map((l) => parseExplicitHours(l, 'manha')).find((v) => v != null) ?? null
    const afternoonHoursNum =
      afternoonRange?.minutes ? afternoonRange.minutes / 60 : labels.map((l) => parseExplicitHours(l, 'tarde')).find((v) => v != null) ?? null
    const allDayHoursNum = labels.map((l) => parseExplicitHours(l, 'dia inteiro')).find((v) => v != null) ?? null

    const toHoursText = (h) => {
      const n = Number(h)
      if (!Number.isFinite(n) || n <= 0) return ''
      const minutes = Math.round(n * 60)
      return formatHoursShort(minutes)
    }

    const chips = []

    if (isAllDay) {
      const hoursText = allDayHoursNum != null ? toHoursText(allDayHoursNum) : ''
      chips.push(hoursText ? `Dia inteiro — ${hoursText}` : 'Dia inteiro')
    } else {
      const hasMorning = morningHoursNum != null && morningHoursNum > 0
      const hasAfternoon = afternoonHoursNum != null && afternoonHoursNum > 0

      if (hasMorning) chips.push(`Manhã — ${toHoursText(morningHoursNum)}`)
      if (hasAfternoon) chips.push(`Tarde — ${toHoursText(afternoonHoursNum)}`)

      if (hasMorning && hasAfternoon) {
        const totalHours = morningHoursNum + afternoonHoursNum
        const totalText = toHoursText(totalHours)
        if (totalText) chips.push(`Total — ${totalText}`)
      } else if (!chips.length && badgeHoursText) {
        // Fallback: if we only know total, at least show it.
        chips.push(`Total — ${badgeHoursText}`)
      } else if (!chips.length && totalFromRangesMinutes > 0) {
        chips.push(`Total — ${formatHoursShort(totalFromRangesMinutes)}`)
      }
    }

    return {
      mode: 'period',
      label: 'Carga horária por período',
      chips: chips.length ? chips : ['Carga horária por período'],
    }
  }, [selectedAvailabilityDayKey, selectedAvailability, availabilityIndex])

  const availabilitySummary = useMemo(() => {
    const keys = Array.isArray(availabilityIndex?.keys) ? availabilityIndex.keys : []
    const totalDays = keys.length
    const daysText = totalDays
      ? `Contrate por ${totalDays} dia${totalDays === 1 ? '' : 's'}`
      : 'Selecione um dia'

    const allDatesShort = keys
      .map((k) => availabilityIndex?.byKey?.[k]?.date)
      .filter(Boolean)
      .map((dt) => {
        try {
          return format(dt, 'dd/MM', { locale: ptBR })
        } catch {
          return null
        }
      })
      .filter(Boolean)

    return {
      totalDays,
      daysText,
      allDatesShort,
    }
  }, [availabilityIndex])

  const fixedSchedulePackage = useMemo(() => {
    const keys = Array.isArray(availabilityIndex?.keys) ? availabilityIndex.keys : []
    if (!keys.length) return null

    const totalDays = keys.length
    const firstKey = keys[0]

    const lines = []
    for (const key of keys) {
      const entry = availabilityIndex?.byKey?.[key]
      const br = entry?.br
      const labels = Array.isArray(entry?.labels) ? entry.labels : []
      if (!br) continue
      if (labels.length) {
        for (const label of labels) {
          const t = String(label || '').trim()
          if (!t) continue
          lines.push(`${br} • ${t}`)
        }
      } else {
        lines.push(`${br}`)
      }
    }

    const plural = totalDays === 1 ? '' : 's'
    const scheduledTime = `Pacote: ${totalDays} dia${plural}`

    return {
      totalDays,
      scheduledDate: firstKey,
      scheduledTime,
      scheduleText: scheduledTime,
      detailsText: lines.join('\n'),
    }
  }, [availabilityIndex])

  const openScheduleSummary = useMemo(() => {
    const keys = Object.keys(workDaysMap || {}).filter(Boolean).sort()
    const totalDays = keys.length
    const daysText = totalDays
      ? `Disponível em ${totalDays} dia${totalDays === 1 ? '' : 's'}`
      : 'Selecione um dia'

    const allDatesShort = keys
      .map((k) => {
        const dt = new Date(`${k}T00:00:00`)
        if (!Number.isFinite(dt.getTime())) return null
        try {
          return format(dt, 'dd/MM', { locale: ptBR })
        } catch {
          return null
        }
      })
      .filter(Boolean)

    return { totalDays, daysText, allDatesShort }
  }, [workDaysMap])

  const contractEstimate = useMemo(() => {
    const unit = normalizedPriceUnit
    const basePrice = Number(normalizedService?.price)
    if (!Number.isFinite(basePrice) || basePrice <= 0) return null

    const hasFixedSchedule =
      !!normalizedService?.availableHours &&
      Array.isArray(normalizedService.availableHours) &&
      normalizedService.availableHours.length > 0

    const isHourly = unit === 'hora'
    const isDaily = unit === 'dia'
    const isMonthly = unit === 'mes'

    const FULL_DAY_ESTIMATE_HOURS = 8

    const normalizePct = (v) => {
      const n = Number(v)
      if (!Number.isFinite(n) || n <= 0) return 0
      return n
    }

    const inferHoursFromLabel = (label, mode) => {
      const raw = String(label || '').trim()
      if (!raw) return null

      const lower = stripDiacritics(raw).toLowerCase()
      if (lower.startsWith('dia inteiro') || mode === 'full') return FULL_DAY_ESTIMATE_HOURS

      const h = parseHoursFromScheduleLabel(raw)
      if (Number.isFinite(h) && h > 0) return h
      return null
    }

    const formatKeyShort = (key) => {
      const dt = new Date(`${key}T00:00:00`)
      if (!Number.isFinite(dt.getTime())) return null
      try {
        return format(dt, 'dd/MM', { locale: ptBR })
      } catch {
        return null
      }
    }

    const summarizeDayKeys = (keys) => {
      const safeKeys = Array.isArray(keys) ? keys.filter(Boolean).sort() : []
      if (!safeKeys.length) return ''
      const parts = safeKeys
        .map((k) => formatKeyShort(k))
        .filter(Boolean)
      const head = parts.slice(0, 4).join(', ')
      const tail = parts.length > 4 ? ', ...' : ''
      return `${head}${tail}`
    }

    let selectedDays = 0
    let totalHours = 0
    let scheduleLine = ''
    let hasMissingHours = false

    if (hasFixedSchedule) {
      const keys = Array.isArray(availabilityIndex?.keys) ? availabilityIndex.keys : []
      selectedDays = keys.length
      scheduleLine = selectedDays
        ? `Contrate por ${selectedDays} dia${selectedDays === 1 ? '' : 's'} (${summarizeDayKeys(keys)})`
        : 'Nenhuma disponibilidade cadastrada'

      if (isHourly) {
        for (const key of keys) {
          const entry = availabilityIndex?.byKey?.[key]
          const labels = Array.isArray(entry?.labels) ? entry.labels : []
          for (const label of labels) {
            const h = inferHoursFromLabel(label, null)
            if (h == null) {
              hasMissingHours = true
              continue
            }
            totalHours += h
          }
        }

        if (selectedDays && totalHours <= 0) {
          hasMissingHours = true
          totalHours = selectedDays
        }
      }
    } else if (hasOpenSchedule) {
      const keys = Object.keys(workDaysMap || {}).filter(Boolean).sort()
      selectedDays = keys.length
      scheduleLine = selectedDays
        ? `Datas selecionadas: ${selectedDays} dia${selectedDays === 1 ? '' : 's'} (${summarizeDayKeys(keys)})`
        : 'Selecione um dia no calendário para montar a estimativa'

      if (isHourly) {
        for (const key of keys) {
          const entry = workDaysMap?.[key]
          const label = String(entry?.label || '').trim()
          const mode = entry?.mode
          const h = inferHoursFromLabel(label, mode)
          if (h == null) {
            hasMissingHours = true
            continue
          }
          totalHours += h
        }

        if (selectedDays && totalHours <= 0) {
          // Fallback: se houver dias mas não há horas inferíveis, assume 1h/dia.
          totalHours = selectedDays
        }
      }
    }

    const qtyValue = isHourly ? totalHours : isDaily ? selectedDays : 1
    const qtyText =
      isHourly
        ? `${Math.round(qtyValue * 10) / 10}h`
        : isDaily
          ? `${qtyValue} dia${qtyValue === 1 ? '' : 's'}`
          : '1'

    const subtotalRaw = basePrice * qtyValue
    const subtotal = Math.round(subtotalRaw * 100) / 100

    const fees = []
    const addFee = ({ enabled, pctRaw, label, tone = 'text-green-600' }) => {
      if (!enabled) return
      const pct = normalizePct(pctRaw)
      if (!pct) return
      const amount = Math.round(subtotal * (pct / 100) * 100) / 100
      fees.push({ label, pct, amount, tone })
    }

    addFee({
      enabled: !!normalizedService?.homeService,
      pctRaw: normalizedService?.homeServiceFee,
      label: 'Atendimento a domicílio',
      tone: 'text-blue-600',
    })
    addFee({
      enabled: !!normalizedService?.emergencyService,
      pctRaw: normalizedService?.emergencyServiceFee,
      label: 'Taxa de emergência',
      tone: 'text-red-600',
    })
    addFee({
      enabled: true,
      pctRaw: normalizedService?.travelFee,
      label: 'Taxa de deslocamento',
      tone: 'text-green-600',
    })

    const feesTotal = fees.reduce((acc, f) => acc + (Number(f.amount) || 0), 0)
    const total = Math.round((subtotal + feesTotal) * 100) / 100

    const baseLine = isHourly
      ? `${formatBRL(basePrice)} / hora × ${qtyText}`
      : isDaily
        ? `${formatBRL(basePrice)} / dia × ${qtyText}`
        : `${formatBRL(basePrice)} / ${formatPriceUnit(unit)}`

    const noteParts = []
    if (hasMissingHours && isHourly) {
      noteParts.push('Alguns horários ainda não têm duração definida; a estimativa pode mudar.')
    }
    if (isMonthly) {
      noteParts.push('Serviços mensais são cobrados como valor fixo (a agenda não altera o total).')
    }

    const extra = normalizeObservationsText(customSchedule)
    const extraShort = extra.length > 140 ? `${extra.slice(0, 140).trim()}…` : extra

    return {
      unit,
      basePrice,
      isHourly,
      isDaily,
      isMonthly,
      selectedDays,
      totalHours,
      qtyText,
      scheduleLine,
      baseLine,
      subtotal,
      fees,
      total,
      note: noteParts.join(' '),
      observations: extraShort,
    }
  }, [
    normalizedService,
    normalizedPriceUnit,
    hasOpenSchedule,
    selectedAvailableHour,
    workDaysMap,
    customSchedule,
  ])

  // IMPORTANTE: só retornar depois que TODOS os hooks rodarem (Rules of Hooks).
  if (!isOpen || !normalizedService) return null

  const coverLocationText = String(normalizedService?.workArea || '').trim()
  const ratingNum = Number(professional?.rating)
  const ratingText = Number.isFinite(ratingNum) && ratingNum > 0
    ? ratingNum.toFixed(1).replace('.', ',')
    : ''
  const servicesCountNum = Number(
    service?.bookings_count ??
      service?.bookingsCount ??
      normalizedService?.bookings_count ??
      normalizedService?.bookingsCount
  )
  const servicesCountText = Number.isFinite(servicesCountNum) && servicesCountNum > 0
    ? `${servicesCountNum} serviços`
    : ''

  const renderServiceRequestDetails = () => (
    <div>
      <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
        <PenLine size={18} className="text-foreground" />
        Detalhes do serviço
      </h3>

      <div className="rounded-2xl border border-border/50 bg-card p-4 shadow-md">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center">
                  <Camera size={18} className="text-orange-500" />
                </div>
                <div className="text-sm font-medium text-foreground">
                  Fotos e vídeos
                </div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Mostre o local, o problema ou referência do serviço
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              className="gap-2 shrink-0 joby-gradient text-white shadow-sm hover:opacity-95 rounded-xl h-9 px-4"
              onClick={() => requestMediaInputRef.current?.click()}
            >
              <Plus size={16} />
              Adicionar
            </Button>
          </div>

          <div className="mt-4 flex gap-3 overflow-x-auto pb-2 pr-1">
            {requestMediaItems.map((item) => {
              const kind = item?.kind
              const preview = String(item?.previewUrl || '')
              const isVideo = kind === 'video'
              const status = String(item?.status || '').trim()
              const isUploading = status === 'uploading'
              const isError = status === 'error'
              return (
                <div
                  key={item.id}
                  className="relative w-24 h-16 rounded-2xl overflow-hidden border border-border/50 bg-muted/20 flex-shrink-0 shadow-sm"
                >
                  {preview ? (
                    isVideo ? (
                      <video
                        src={preview}
                        className="w-full h-full object-cover"
                        playsInline
                        muted
                        preload="metadata"
                        controls={false}
                        disablePictureInPicture
                        draggable={false}
                        onLoadedMetadata={(e) => {
                          try {
                            const v = e?.currentTarget
                            if (!v) return
                            // Força uma frame inicial (sem autoplay) para evitar thumb branca.
                            const d = Number(v.duration)
                            const target = Number.isFinite(d) && d > 0 ? Math.min(0.12, Math.max(0, d - 0.05)) : 0.12
                            if (Number.isFinite(target) && target > 0) v.currentTime = target
                          } catch {
                            // ignore
                          }
                        }}
                      />
                    ) : (
                      <img
                        src={preview}
                        alt="Foto"
                        className="w-full h-full object-cover"
                        loading="eager"
                        draggable={false}
                      />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {isVideo ? <Play size={18} className="text-muted-foreground" /> : null}
                    </div>
                  )}

                  {isVideo ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-9 h-9 rounded-full bg-black/25 border border-white/80 flex items-center justify-center">
                        <Play size={16} className="text-white" />
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeRequestMediaItem(item.id)
                    }}
                    className="absolute top-1 right-1 w-7 h-7 rounded-full bg-background/90 text-orange-500 border border-border/60 flex items-center justify-center"
                    aria-label="Remover anexo"
                  >
                    <X size={14} />
                  </button>

                  {isUploading ? (
                    <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                      <span className="text-[10px] font-medium text-white animate-pulse">Enviando…</span>
                    </div>
                  ) : null}

                  {isError ? (
                    <div className="absolute inset-0 bg-destructive/55 flex items-center justify-center">
                      <span className="text-[10px] font-medium text-white">Falhou</span>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          {activeMediaItem ? (
            (() => {
              const active = activeMediaItem
              const kind = active?.kind
              const isVideo = kind === 'video'
              const src = String(active?.previewUrl || '')
              const caption = String(active?.caption || '')
              const serverMediaId = String(active?.serverMediaId || '').trim()
              const displayName = String(currentUser?.name || currentUser?.username || 'Você').trim()
              const professionText = String(currentUser?.profession || currentUser?.role || '').trim()
              const canUseComments = !!serverMediaId

              return (
              <div
                className="fixed inset-0 z-[10050] bg-black/70 flex items-center justify-center p-4"
                onClick={() => setActiveRequestMediaId(null)}
              >
                <div
                  className="w-full max-w-lg rounded-2xl bg-card border border-border/60 overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* MEDIA (top) */}
                  <div
                    className="relative bg-black w-full h-[60vh] overflow-hidden"
                    onTouchStart={(e) => {
                      const t = e.touches?.[0]
                      if (!t) return
                      viewerTouchRef.current = { x: t.clientX, y: t.clientY, active: true }
                    }}
                    onTouchEnd={(e) => {
                      if (!viewerTouchRef.current?.active) return
                      const start = viewerTouchRef.current
                      viewerTouchRef.current = { x: 0, y: 0, active: false }
                      const t = e.changedTouches?.[0]
                      if (!t) return
                      const dx = t.clientX - start.x
                      const dy = t.clientY - start.y
                      const isHorizontalSwipe = Math.abs(dx) >= 45 && Math.abs(dx) >= Math.abs(dy)

                      if (isHorizontalSwipe) {
                        viewerSuppressTapRef.current = true
                        viewerClearSuppressTapSoon()
                        if (dx > 0) goPrevMedia()
                        else goNextMedia()
                        return
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                    }}
                  >
                    {src ? (
                      <img
                        src={src}
                        alt={isVideo ? 'Vídeo' : 'Foto'}
                        className="absolute inset-0 h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">
                        {isVideo ? 'Vídeo' : 'Foto'}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveRequestMediaId(null)
                      }}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => e.stopPropagation()}
                      className="absolute top-3 left-3 z-20 h-9 w-9 rounded-full bg-black/55 text-white flex items-center justify-center"
                      aria-label="Voltar"
                    >
                      <ChevronLeft size={18} />
                    </button>

                    {null}

                    {activeMediaIndex > 0 ? (
                      <button
                        type="button"
                        onClick={goPrevMedia}
                        className="absolute left-0 top-14 bottom-0 z-10 w-12 bg-gradient-to-r from-black/35 to-transparent text-white flex items-center justify-start pl-2"
                        aria-label="Anterior"
                      >
                        <ChevronLeft size={18} />
                      </button>
                    ) : null}

                    {activeMediaIndex >= 0 && activeMediaIndex < requestMediaItems.length - 1 ? (
                      <button
                        type="button"
                        onClick={goNextMedia}
                        className="absolute right-0 top-14 bottom-0 z-10 w-12 bg-gradient-to-l from-black/35 to-transparent text-white flex items-center justify-end pr-2"
                        aria-label="Próximo"
                      >
                        <ChevronRight size={18} />
                      </button>
                    ) : null}
                  </div>

                  {/* BELOW (profile + caption + comments) */}
                  <div className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={currentUserAvatarSrc || undefined} />
                        <AvatarFallback>{String(displayName || 'V').slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">{displayName}</div>
                        {professionText ? (
                          <div className="text-xs text-muted-foreground truncate">{professionText}</div>
                        ) : (
                          <div className="text-xs text-muted-foreground truncate">Anexo da solicitação</div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3">
                      <Textarea
                        value={caption}
                        onChange={(e) => {
                          const next = String(e.target.value || '').slice(0, 200)
                          setRequestMediaItems((prev) =>
                            prev.map((it) => (it.id === active.id ? { ...it, caption: next } : it))
                          )
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        placeholder="Descrição (opcional)"
                        className="min-h-[56px] text-sm leading-5"
                      />
                      <div className="mt-1 text-[11px] text-muted-foreground">Máx. 200 caracteres.</div>
                    </div>

                    <div className="mt-4">
                      <div className="text-sm font-semibold text-foreground">Comentários</div>

                      {!canUseComments ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Envie a solicitação para habilitar comentários com o profissional.
                        </div>
                      ) : (
                        <>
                          <div className="mt-3 max-h-56 overflow-y-auto space-y-2">
                            {viewerCommentsLoading ? (
                              <div className="text-xs text-muted-foreground">Carregando comentários…</div>
                            ) : viewerComments.length === 0 ? (
                              <div className="text-xs text-muted-foreground">Sem comentários ainda.</div>
                            ) : (
                              viewerComments.map((c) => {
                                const mine = String(c?.sender_id || '') === String(currentUser?.id || '')
                                return (
                                  <div
                                    key={c.id}
                                    className={cn(
                                      'px-3 py-2 rounded-xl text-sm whitespace-pre-line',
                                      mine
                                        ? 'bg-primary text-primary-foreground ml-auto'
                                        : 'bg-muted/40 text-foreground mr-auto'
                                    )}
                                    style={{ maxWidth: '85%' }}
                                  >
                                    {String(c?.message || '')}
                                  </div>
                                )
                              })
                            )}
                          </div>

                          <div className="mt-3 flex items-end gap-2">
                            <textarea
                              value={viewerCommentDraft}
                              onChange={(e) => setViewerCommentDraft(e.target.value)}
                              placeholder="Escreva uma dúvida…"
                              className="flex-1 min-h-[44px] max-h-24 rounded-xl border border-border/50 bg-background px-3 py-2 text-sm outline-none"
                            />
                            <Button
                              type="button"
                              size="sm"
                              className="joby-gradient text-white"
                              onClick={sendViewerComment}
                            >
                              Enviar
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              )
            })()
          ) : null}

          <input
            ref={requestMediaInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              // IMPORTANT (mobile): snapshot files BEFORE clearing the input.
              const picked = Array.from(e.target.files || []).filter(Boolean)
              e.target.value = ''
              await addRequestMediaFiles(picked)
            }}
          />
        </div>

        <div className="mt-4">
          <Textarea
            value={customSchedule}
            onChange={(e) => setCustomSchedule(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            placeholder="Observações (opcional)"
            className="min-h-[72px] text-sm leading-5 rounded-2xl px-4 py-3"
          />
        </div>
      </div>
    </div>
  )

  const handleRequestService = () => {
    if (!currentUser) {
      toast({
        title: 'Login Necessário',
        description: 'Você precisa estar logado para solicitar serviços.',
        variant: 'destructive',
      })
      navigate('/login')
      return
    }

    if (!professional?.id) {
      toast({
        title: 'Profissional inválido',
        description: 'Não foi possível identificar o profissional deste serviço.',
        variant: 'destructive',
      })
      return
    }

    if (!normalizedService?.id) {
      toast({
        title: 'Serviço inválido',
        description: 'Não foi possível identificar este serviço.',
        variant: 'destructive',
      })
      return
    }

    // Validação de agenda
    const hasFixedSchedule =
      !!normalizedService.availableHours &&
      Array.isArray(normalizedService.availableHours) &&
      normalizedService.availableHours.length > 0

    if (hasFixedSchedule && !availabilityIndex?.hasAny) {
      toast({
        title: 'Sem disponibilidade',
        description: 'O profissional ainda não cadastrou dias no calendário.',
        variant: 'destructive',
      })
      return
    }

    const openSelection = !hasFixedSchedule && hasOpenSchedule ? buildOpenScheduleSelection() : null

    if (!hasFixedSchedule && hasOpenSchedule && !openSelection && !customSchedule.trim()) {
      toast({
        title: 'Horário Necessário',
        description:
          'Selecione um dia no calendário e defina o período, ou descreva o horário desejado.',
        variant: 'destructive',
      })
      return
    }

    const submit = async () => {
      if (isSubmitting) return
      setIsSubmitting(true)

      const timeout = (ms, label) =>
        new Promise((_, reject) => {
          const safeLabel = String(label || 'operação').trim() || 'operação'
          setTimeout(() => {
            reject(
              new Error(
                `Tempo esgotado ao ${safeLabel}. Verifique sua internet e as configurações (Supabase/Worker) e tente novamente.`
              )
            )
          }, ms)
        })

      const withTimeout = (promise, ms, label) => Promise.race([promise, timeout(ms, label)])

      try {
        const fixed = hasFixedSchedule ? fixedSchedulePackage : null
        const open = !hasFixedSchedule && hasOpenSchedule ? buildOpenScheduleSelection() : null

        const scheduleText = hasFixedSchedule
          ? fixed?.scheduleText
          : open?.scheduleText || String(customSchedule || '').trim()

        const scheduledDate = hasFixedSchedule ? fixed?.scheduledDate : open?.scheduledDate || null
        const scheduledTime = hasFixedSchedule ? fixed?.scheduledTime : open?.scheduledTime || null

        const selectedDayKeys = !hasFixedSchedule && hasOpenSchedule
          ? Object.keys(workDaysMap || {}).filter(Boolean).sort()
          : []

        const totalDays = hasFixedSchedule
          ? Number(fixed?.totalDays || 0) || 1
          : selectedDayKeys.length || 1

        const isOpenScheduleSelection = !hasFixedSchedule && hasOpenSchedule

        const openScheduleDayKeys = (() => {
          if (!isOpenScheduleSelection) return []
          const keys = Array.isArray(selectedDayKeys) ? selectedDayKeys.filter(Boolean) : []
          if (keys.length) return keys
          const fallbackKey = String(open?.scheduledDate || '').trim()
          return fallbackKey ? [fallbackKey] : []
        })()

        const openScheduleUniqueLabels = (() => {
          if (!isOpenScheduleSelection) return []
          const uniq = new Set()
          for (const key of openScheduleDayKeys) {
            const label = String(workDaysMap?.[key]?.label || '').trim()
            if (label) uniq.add(label)
          }
          return Array.from(uniq)
        })()

        const openSchedulePerDayLabel =
          openScheduleUniqueLabels.length === 1 ? openScheduleUniqueLabels[0] : null

        const isoToBR = (iso) => {
          const raw = String(iso || '').trim()
          const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
          if (!m) return ''
          return `${m[3]}/${m[2]}/${m[1]}`
        }

        const startIso =
          (selectedDayKeys.length ? selectedDayKeys[0] : null) ||
          String(scheduledDate || '').slice(0, 10) ||
          null

        const endIso =
          (selectedDayKeys.length ? selectedDayKeys[selectedDayKeys.length - 1] : null) ||
          startIso ||
          null

        const isInterval = Boolean(totalDays > 1 && startIso)
        const effectiveScheduledDate = isInterval ? startIso : scheduledDate

        // Para período (multi-dias): só persistir scheduled_time se for consistente por dia.
        // Caso contrário, deixar null e manter detalhes completos em notes.
        const effectiveScheduledTime = (() => {
          if (!isInterval) return scheduledTime
          if (isOpenScheduleSelection) return openSchedulePerDayLabel
          return scheduledTime
        })()

        // Regra JOBY: sempre persistir duração em dias quando sabemos o período.
        // Para dia único, preferimos duration=1 quando houver data.
        const effectiveDurationDays = isInterval
          ? totalDays
          : effectiveScheduledDate
            ? 1
            : null

        const perDayHours = parseHoursFromScheduleLabel(scheduledTime)
        const totalHours =
          normalizedPriceUnit === 'hora' && perDayHours
            ? Math.round(Number(perDayHours) * Number(totalDays) * 10) / 10
            : null

        const extra = normalizeObservationsText(customSchedule)
        const fixedDetails = hasFixedSchedule ? String(fixed?.detailsText || '').trim() : ''
        const notesParts = []
        if (hasFixedSchedule) {
          const fixedDays = Number(fixed?.totalDays || 0) || totalDays
          notesParts.push(
            `Dias e horários definidos pelo profissional (${fixedDays} dia${fixedDays === 1 ? '' : 's'}):`
          )
          if (fixedDetails) notesParts.push(fixedDetails)
        } else if (scheduleText) {
          notesParts.push(`Horário solicitado: ${scheduleText}`)
        }

        if (totalDays > 1) {
          notesParts.push(`Datas selecionadas: ${totalDays} dias`)
          const startBr = isoToBR(startIso)
          const endBr = isoToBR(endIso)
          if (startBr) notesParts.push(`Início: ${startBr}`)
          if (endBr) notesParts.push(`Final: ${endBr}`)
        } else if (startIso) {
          const startBr = isoToBR(startIso)
          if (startBr) notesParts.push(`Data: ${startBr}`)
        }

        if (scheduledTime) notesParts.push(`Horário por dia: ${scheduledTime}`)
        if (normalizedPriceUnit === 'hora' && totalHours) notesParts.push(`Total estimado de horas: ${String(totalHours).replace('.', ',')}h`)
        if (extra) notesParts.push(`Observações: ${extra}`)

        const notes = notesParts.map((x) => String(x || '').trim()).filter(Boolean).join('\n') || null

        const payload = {
          professional_id: professional.id,
          client_id: currentUser.id,
          service_id: normalizedService.id,
          status: 'pending',
          scheduled_date: effectiveScheduledDate,
          scheduled_time: effectiveScheduledTime,
          duration: effectiveDurationDays,
          notes,
        }

        if (import.meta.env.DEV) {
          const agendaMode = hasFixedSchedule
            ? 'fixed'
            : hasOpenSchedule
              ? isInterval
                ? 'open:interval'
                : open
                  ? 'open:selected-day'
                  : String(customSchedule || '').trim()
                    ? 'open:custom-text'
                    : 'open:missing-selection'
              : 'unknown'

          log.debug('BOOKING', 'bookings.insert schedule debug', {
            agendaMode,
            hasFixedSchedule,
            hasOpenSchedule,
            fixed,
            open,
            scheduleText,
            scheduledDate,
            scheduledTime,
            selectedDayKeysCount: selectedDayKeys.length,
            openScheduleDayKeys,
            totalDays,
            startIso,
            endIso,
            isInterval,
            openScheduleUniqueLabels,
            openSchedulePerDayLabel,
            payload,
          })
        }

        const computedTotal = computeTotalPrice({
          price: normalizedService?.price,
          priceUnit: normalizedService?.price_unit || normalizedService?.priceUnit,
          scheduledTime,
          days: totalDays,
        })

        const optionalFieldsFull = {
          ...(computedTotal != null ? { total_price: computedTotal } : null),
          // NOTE: some production schemas don't have selected_days/total_days/total_hours.
          // We keep those details inside notes for cross-schema compatibility.
        }

        const isMissingColumnError = (err) => {
          const msg = String(err?.message || err || '').toLowerCase()
          const code = String(err?.code || '').toUpperCase()
          return (
            code === 'PGRST204' ||
            (msg.includes('could not find the') && msg.includes('column')) ||
            (msg.includes('column') && msg.includes('does not exist'))
          )
        }

        const isPermissionDeniedError = (err) => {
          const msg = String(err?.message || err || '').toLowerCase()
          const code = String(err?.code || '').toUpperCase()
          const status = Number(err?.status || err?.statusCode || 0)
          return (
            code === '42501' ||
            status === 403 ||
            msg.includes('permission denied') ||
            msg.includes('insufficient privilege') ||
            msg.includes('forbidden')
          )
        }

        const pickMissingColumnName = (err) => {
          const msg = String(err?.message || err || '')
          const m = msg.match(/Could not find the '([^']+)' column/i)
          if (m?.[1]) return String(m[1]).trim()
          const m2 = msg.match(/column\s+"([^"]+)"/i)
          if (m2?.[1]) return String(m2[1]).trim()
          const m3 = msg.match(/column\s+'([^']+)'/i)
          if (m3?.[1]) return String(m3[1]).trim()
          return ''
        }

        // Cache unsupported optional columns per runtime so we don't keep triggering PGRST204.
        // (module-level variable to survive re-renders)
        // eslint-disable-next-line no-underscore-dangle
        const unsupportedCols = (globalThis.__JOBY_UNSUPPORTED_BOOKINGS_COLS__ ||= new Set())

        const filterUnsupported = (obj) => {
          const next = { ...(obj || {}) }
          for (const k of Object.keys(next)) {
            if (unsupportedCols.has(k)) delete next[k]
          }
          return next
        }

        const updateOptionalFieldsBestEffort = async (bookingId) => {
          const baseOptional = filterUnsupported(optionalFieldsFull)
          if (!bookingId || !Object.keys(baseOptional).length) return

          // Try updating in decreasing payloads, learning missing columns as we go.
          const variants = [
            baseOptional,
            (() => {
              const { selected_days: _sd, ...rest } = baseOptional
              return rest
            })(),
            (() => {
              const { total_days: _td, total_hours: _th, ...rest } = baseOptional
              return rest
            })(),
            (() => {
              const { total_price: _tp, ...rest } = baseOptional
              return rest
            })(),
          ].filter((v) => v && Object.keys(v).length)

          for (const v of variants) {
            const clean = { ...(v || {}) }
            Object.keys(clean).forEach((k) => clean[k] === undefined && delete clean[k])
            const res = await supabase
              .from('bookings')
              .update(clean)
              .eq('id', bookingId)
              .eq('client_id', currentUser.id)

            if (!res.error) return

            if (isMissingColumnError(res.error)) {
              const missing = pickMissingColumnName(res.error)
              if (missing) unsupportedCols.add(missing)
              continue
            }

            if (isPermissionDeniedError(res.error)) {
              // Best-effort: don't block the request.
              return
            }

            return
          }
        }

        if (editingBookingId) {
          const currentStatus = String(editingBooking?.status || editingBooking?.booking?.status || 'pending')
            .toLowerCase()
          if (currentStatus !== 'pending') {
            throw new Error('Você só pode editar solicitações pendentes.')
          }

          const updatePayload = {
            professional_id: payload.professional_id,
            service_id: payload.service_id,
            scheduled_date: payload.scheduled_date,
            scheduled_time: payload.scheduled_time,
            duration: payload.duration,
            notes: payload.notes,
            status: 'pending',
          }

          const res = await withTimeout(
            supabase
              .from('bookings')
              .update(updatePayload)
              .eq('id', editingBookingId)
              .eq('client_id', currentUser.id)
              .select('id')
              .single(),
            15000,
            'salvar a solicitação'
          )

          if (res.error) throw res.error

          // Optional fields are best-effort (schema/permission may not support them).
          try {
            await updateOptionalFieldsBestEffort(editingBookingId)
          } catch {
            // ignore
          }

          // Se o usuário adicionou novos anexos durante a edição, faça upload agora.
          // (Itens já existentes não têm `file` e são ignorados.)
          const uploadable = (requestMediaItems || []).filter((it) => !!it?.file)
          const failedUploads = []
          let didSkipMediaDueToMissingTables = false

          if (uploadable.length > 0) {
            let canUploadMedia = true
            try {
              // IMPORTANT: não faz INSERT/UPSERT aqui, porque muitos schemas têm RLS
              // que bloqueia inserção pelo cliente (erro 42501). Se a linha já existir,
              // atualizamos; se não existir ou for bloqueado, ainda tentamos enviar anexos via Worker.
              const updateRes = await supabase
                .from('service_requests')
                .update({
                  professional_id: professional.id,
                  status: 'pending',
                  notes: payload.notes,
                })
                .eq('id', editingBookingId)
                .eq('client_id', currentUser.id)
                .select('id')

              if (updateRes.error) {
                const msg = String(updateRes.error?.message || updateRes.error)
                const missing =
                  msg.toLowerCase().includes('relation') && msg.toLowerCase().includes('does not exist')
                if (missing) {
                  canUploadMedia = false
                  didSkipMediaDueToMissingTables = true
                } else if (isPermissionDeniedError(updateRes.error)) {
                  // Best-effort: uploads ainda podem funcionar via Worker (service_role).
                } else {
                  throw updateRes.error
                }
              } else {
                // Mesmo que 0 linhas sejam atualizadas (linha não existe ainda), uploads podem
                // funcionar: o Worker faz backfill de service_requests a partir de bookings.
              }
            } catch (e) {
              const msg = String(e?.message || e)
              const missing = msg.toLowerCase().includes('relation') && msg.toLowerCase().includes('does not exist')
              if (missing) {
                canUploadMedia = false
                didSkipMediaDueToMissingTables = true
              } else {
                // ignore: uploads ainda podem funcionar via Worker.
                if (import.meta.env.DEV) log.warn('REQUESTS', 'Falha ao atualizar service_requests (edição)', e)
              }
            }

            if (canUploadMedia) {
              const {
                data: { session },
              } = await withTimeout(supabase.auth.getSession(), 8000, 'validar sua sessão')
              const accessToken = session?.access_token
              if (!accessToken) {
                throw new Error('Sessão inválida. Faça login novamente para enviar anexos.')
              }

              setRequestMediaItems((prev) =>
                (prev || []).map((it) => (it?.file ? { ...it, status: 'uploading' } : it))
              )

              for (const item of uploadable) {
                try {
                  setRequestMediaItems((prev) =>
                    (prev || []).map((it) => (it.id === item.id ? { ...it, status: 'uploading' } : it))
                  )

                  const formData = new FormData()
                  formData.append('requestId', editingBookingId)
                  formData.append('file', item.file)
                  if (item?.caption) formData.append('caption', String(item.caption))

                  const uploadUrlCandidates = buildAttachmentsApiUrlCandidates('/api/service-attachments/upload')

                  const controller = new AbortController()
                  const abortId = setTimeout(() => controller.abort(), 60000)

                  let response = null
                  let text = ''
                  let json = null
                  let lastStatus = null
                  let usedUrl = ''
                  try {
                    for (const candidateUrl of uploadUrlCandidates) {
                      usedUrl = candidateUrl
                      response = await fetch(candidateUrl, {
                        method: 'POST',
                        headers: {
                          Authorization: `Bearer ${accessToken}`,
                        },
                        body: formData,
                        signal: controller.signal,
                      })

                      lastStatus = response.status
                      text = await response.text()
                      json = null
                      try {
                        json = text ? JSON.parse(text) : null
                      } catch {
                        // ignore
                      }

                      if (!response.ok && response.status === 404) continue
                      break
                    }
                  } finally {
                    clearTimeout(abortId)
                  }

                  if (!response?.ok) {
                    const msg =
                      (json && (json.message || json.error)) ||
                      `Erro ${lastStatus || response?.status || ''}${response?.statusText ? `: ${response.statusText}` : ''}`

                    if (lastStatus === 404) {
                      throw new Error(
                        `${msg}. Endpoint não encontrado: ${usedUrl}. Verifique VITE_WORKER_API_URL (ou VITE_CLOUDFLARE_WORKER_URL) e o deploy do Worker.`
                      )
                    }

                    throw new Error(msg)
                  }

                  setRequestMediaItems((prev) =>
                    (prev || []).map((it) =>
                      it.id === item.id
                        ? { ...it, status: 'uploaded', serverMediaId: json?.media?.id || it.serverMediaId }
                        : it
                    )
                  )
                } catch (e) {
                  failedUploads.push(e)
                  setRequestMediaItems((prev) =>
                    (prev || []).map((it) => (it.id === item.id ? { ...it, status: 'error' } : it))
                  )
                  if (import.meta.env.DEV) log.warn('UPLOAD', 'Falha ao enviar anexo (edição)', e)
                }
              }

              // Recarrega a lista a partir do servidor (garante que vídeos/fotos recém-enviados
              // apareçam imediatamente, sem depender do estado local do upload).
              try {
                await loadRequestMediaFromServer({ requestId: editingBookingId, merge: false })
              } catch {
                // ignore
              }
            }
          }

          toast({
            title: 'Solicitação atualizada!',
            description:
              didSkipMediaDueToMissingTables
                ? 'As informações foram salvas. Para anexos funcionarem, execute o SQL de service_requests/service_request_media no Supabase.'
                : failedUploads.length
                ? 'As informações foram salvas, mas alguns anexos falharam ao enviar.'
                : 'As informações foram salvas com sucesso.',
            variant: 'success',
          })

          // Atualiza lista da tela por trás (WorkRequests etc.)
          if (typeof onRequestUpdated === 'function') {
            try {
              await onRequestUpdated({ bookingId: editingBookingId })
            } catch {
              // ignore
            }
          }

          // Se houve upload de anexos, manter o modal aberto para o usuário
          // ver imediatamente os arquivos recarregados (sem precisar reabrir).
          const didUploadAnyMedia =
            uploadable.length > 0 && !didSkipMediaDueToMissingTables && failedUploads.length === 0
          if (!didUploadAnyMedia) {
            onClose()
          }
          return
        }

        // Insert ONLY core columns first so schema variations don't break the request.
        // Optional columns (totals/days/hours) are applied after insert (best-effort).
        const inserted = await withTimeout(
          supabase.from('bookings').insert([payload]).select('id').single(),
          15000,
          'enviar a solicitação'
        )

        if (import.meta.env.DEV) {
          log.debug('BOOKING', 'bookings.insert response (primary)', {
            data: inserted?.data,
            error: inserted?.error,
          })
        }

        if (inserted.error) {
          // Fallback: some old schemas might not have `notes` or schedule columns.
          const minimal = {
            professional_id: payload.professional_id,
            client_id: payload.client_id,
            service_id: payload.service_id,
            status: payload.status,
          }

          const inserted2 = await withTimeout(
            supabase.from('bookings').insert([minimal]).select('id').single(),
            15000,
            'enviar a solicitação'
          )

          if (import.meta.env.DEV) {
            log.debug('BOOKING', 'bookings.insert response (fallback minimal)', {
              data: inserted2?.data,
              error: inserted2?.error,
            })
          }

          if (inserted2.error) throw inserted2.error

          try {
            await updateOptionalFieldsBestEffort(inserted2.data?.id)
          } catch {
            // ignore
          }

          // overwrite inserted for next steps
          // eslint-disable-next-line no-param-reassign
          inserted.data = inserted2.data
        } else {
          try {
            await updateOptionalFieldsBestEffort(inserted.data?.id)
          } catch {
            // ignore
          }
        }

        if (import.meta.env.DEV) {
          try {
            const insertedId = inserted?.data?.id
            if (insertedId) {
              const check = await supabase
                .from('bookings')
                .select('id, scheduled_date, scheduled_time, duration, notes, created_at')
                .eq('id', insertedId)
                .maybeSingle()
              log.debug('BOOKING', 'bookings.insert row after insert', {
                data: check?.data,
                error: check?.error,
              })
            }
          } catch (e) {
            log.warn('BOOKING', 'bookings.insert row check failed', e)
          }
        }

        const bookingId = inserted?.data?.id

        const failedUploads = []
        let didSkipMediaDueToMissingTables = false

        if (bookingId && requestMediaItems.length > 0) {
          // Mirror record in service_requests so the designated professional can see media while pending.
          // This does NOT change the existing bookings flow; it only enables attachments feature.
          let serviceRequestReady = true

          try {
            const res = await withTimeout(
              supabase
                .from('service_requests')
                .insert([
                  {
                    id: bookingId,
                    client_id: currentUser.id,
                    professional_id: professional.id,
                    status: 'pending',
                    notes,
                  },
                ])
                .select('id')
                .single(),
              15000,
              'preparar o envio de anexos'
            )

            if (res.error) {
              const msg = String(res.error?.message || res.error)
              const isMissingRelation =
                msg.toLowerCase().includes('relation') && msg.toLowerCase().includes('does not exist')
              if (isMissingRelation) {
                serviceRequestReady = false
                didSkipMediaDueToMissingTables = true
              } else {
                throw res.error
              }
            }
          } catch (e) {
            // If service_requests is not present, do not break the request flow.
            serviceRequestReady = false
            didSkipMediaDueToMissingTables = true
            if (import.meta.env.DEV) log.warn('REQUESTS', 'Falha ao criar service_requests', e)
          }

          if (serviceRequestReady) {
            const {
              data: { session },
            } = await withTimeout(supabase.auth.getSession(), 8000, 'validar sua sessão')
            const accessToken = session?.access_token
            if (!accessToken) {
              throw new Error('Sessão inválida. Faça login novamente para enviar anexos.')
            }

            setRequestMediaItems((prev) =>
              prev.map((it) => (it?.file ? { ...it, status: 'uploading' } : it))
            )

            for (const item of requestMediaItems) {
              try {
                const file = item.file

                setRequestMediaItems((prev) =>
                  prev.map((it) => (it.id === item.id ? { ...it, status: 'uploading' } : it))
                )

                const formData = new FormData()
                formData.append('requestId', bookingId)
                formData.append('file', file)
                if (item?.caption) formData.append('caption', String(item.caption))

                const uploadUrlCandidates = buildAttachmentsApiUrlCandidates('/api/service-attachments/upload')

                const controller = new AbortController()
                const abortId = setTimeout(() => controller.abort(), 60000)

                let response = null
                let text = ''
                let json = null
                let lastStatus = null
                let usedUrl = ''
                try {
                  for (const candidateUrl of uploadUrlCandidates) {
                    usedUrl = candidateUrl
                    response = await fetch(candidateUrl, {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${accessToken}`,
                      },
                      body: formData,
                      signal: controller.signal,
                    })

                    lastStatus = response.status
                    text = await response.text()
                    json = null
                    try {
                      json = text ? JSON.parse(text) : null
                    } catch {
                      // ignore
                    }

                    // Retry on 404 only when we have a fallback candidate
                    if (!response.ok && response.status === 404) {
                      continue
                    }
                    break
                  }
                } catch (e) {
                  const msg = String(e?.message || e || '')
                  const isAbort = msg.toLowerCase().includes('abort')
                  if (isAbort) {
                    throw new Error(
                      `Tempo esgotado ao enviar anexo. Verifique VITE_WORKER_API_URL (ou VITE_CLOUDFLARE_WORKER_URL) e tente novamente.`
                    )
                  }
                  throw e
                } finally {
                  clearTimeout(abortId)
                }

                if (!response?.ok) {
                  const msg =
                    (json && (json.message || json.error)) ||
                    `Erro ${lastStatus || response?.status || ''}${response?.statusText ? `: ${response.statusText}` : ''}`

                  if (lastStatus === 404) {
                    throw new Error(
                      `${msg}. Endpoint não encontrado: ${usedUrl}. Verifique VITE_WORKER_API_URL (ou VITE_CLOUDFLARE_WORKER_URL) e o deploy do Worker.`
                    )
                  }

                  throw new Error(msg)
                }

                setRequestMediaItems((prev) =>
                  prev.map((it) =>
                    it.id === item.id
                      ? { ...it, status: 'uploaded', serverMediaId: json?.media?.id || it.serverMediaId }
                      : it
                  )
                )
              } catch (e) {
                failedUploads.push(e)
                setRequestMediaItems((prev) =>
                  prev.map((it) => (it.id === item.id ? { ...it, status: 'error' } : it))
                )
                if (import.meta.env.DEV) log.warn('UPLOAD', 'Falha ao enviar anexo da solicitação', e)
              }
            }
          }
        }

        toast({
          title: 'Solicitação enviada!',
          description:
            didSkipMediaDueToMissingTables
              ? 'Solicitação enviada. Para anexos funcionarem, execute o SQL de service_requests/service_request_media no Supabase.'
              : failedUploads.length > 0
              ? 'O profissional receberá sua solicitação. Alguns anexos falharam ao enviar.'
              : 'O profissional receberá sua solicitação em instantes.',
          variant: 'success',
        })

        onClose()
        navigate('/service-confirmation', {
          state: {
            service: normalizedService,
            professional,
            schedule: scheduleText,
            bookingId: inserted?.data?.id,
          },
        })
      } catch (err) {
        log.error('REQUESTS', 'Erro ao criar solicitação', err)
        toast({
          title: 'Erro ao enviar solicitação',
          description: String(err?.message || 'Não foi possível enviar sua solicitação agora.'),
          variant: 'destructive',
        })
      } finally {
        setIsSubmitting(false)
      }
    }

    submit()
  }

  const handleMessageClick = () => {
    if (!currentUser) {
      toast({
        title: 'Login Necessário',
        description: 'Você precisa estar logado para enviar mensagens.',
        variant: 'destructive',
      })
      navigate('/login')
      return
    }
    onClose()
    navigate('/messages', {
      state: {
        startConversationWith: {
          id: professional?.id,
          name: professional?.name,
          avatar: professional?.avatar,
          profession: professional?.profession,
        },
      },
    })
  }

  const handleViewProfileClick = () => {
    if (!professional?.id) return
    onClose()
    navigate(`/profile/${professional.id}`)
  }

  const modalContent = (
    // 1️⃣ OVERLAY - Trava o fundo e centraliza tudo
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm"
      style={{
        display: 'grid',
        placeItems: 'center',
        padding: '16px',
        overflow: 'hidden',
      }}
      onClick={onClose}
    >
      {/* 2️⃣ CONTAINER DO MODAL - O "quadrado" */}
      <div
        className="w-full max-w-md bg-card rounded-2xl shadow-xl overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Fixo */}
        {professional?.isOwnProfile ? (
          <div className="px-4 pt-4 pb-3 bg-gradient-to-b from-orange-500/10 to-transparent">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 p-2 bg-primary/10 rounded-lg shrink-0">
                  <FileText size={18} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-bold text-foreground">
                    Resumo do meu anúncio
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Resumo do seu anúncio de serviço e previsão de ganhos.
                  </div>
                </div>
              </div>

              <button
                onClick={onClose}
                className="flex-shrink-0 p-2 hover:bg-muted rounded-full transition-colors"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        ) : (
          <div className="border-b border-border">
            {/* Imagem de Capa (se houver) */}
            {serviceImageSrc && (
              <div className="relative w-full h-40 overflow-hidden">
                <img
                  src={serviceImageSrc}
                  alt={service.title}
                  className="w-full h-full object-cover"
                />

                {(coverLocationText || ratingText || servicesCountText) ? (
                  <>
                    <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />
                    <div className="absolute bottom-2 left-2 text-white drop-shadow-sm">
                      {(ratingText || servicesCountText) ? (
                        <div className="flex items-center gap-1 text-xs font-semibold">
                          {ratingText ? (
                            <span className="inline-flex items-center gap-1">
                              <Star size={12} className="fill-yellow-400 text-yellow-400" />
                              {ratingText}
                            </span>
                          ) : null}
                          {servicesCountText ? (
                            <span className="opacity-95">{ratingText ? '• ' : ''}{servicesCountText}</span>
                          ) : null}
                        </div>
                      ) : null}

                      {coverLocationText ? (
                        <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                          <MapPin
                            size={16}
                            strokeWidth={3}
                            className="shrink-0 text-white"
                          />
                          <span className="line-clamp-1 text-white/90">{coverLocationText}</span>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            )}

            {/* Informações do Serviço */}
            <div className="p-4">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-foreground mb-1">
                    {service.title}
                  </h2>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-orange-500">
                      {formatBRL(normalizedService.price)}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      / {formatPriceUnit(normalizedService.price_unit || normalizedService.priceUnit)}
                    </span>
                  </div>
                </div>

                {/* Botão Fechar */}
                <button
                  onClick={onClose}
                  className="flex-shrink-0 p-2 hover:bg-muted rounded-full transition-colors"
                  aria-label="Fechar"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3️⃣ CONTEÚDO COM SCROLL - Só essa parte rola */}
        <div
          className={(professional?.isOwnProfile ? 'p-5 ' : 'p-4 ') + 'overflow-y-auto space-y-4 flex-1 min-h-0 pb-8'}
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        >
          {/* Perfil (no lugar certo, no topo do modal) */}
          {!professional?.isOwnProfile && professional?.id ? (
            (() => {
              const p = profileCardProfile || professional
              const username = String(p?.username || '').trim()
              const displayName = username ? `@${username}` : String(p?.name || 'Profissional').trim()

              const experienceStartYearRaw =
                p?.experience_start_year ??
                p?.experienceStartYear ??
                null
              const expStartYear = Number(experienceStartYearRaw)
              const nowYear = new Date().getFullYear()
              const isPlausibleStartYear =
                Number.isFinite(expStartYear) && expStartYear >= 1900 && expStartYear <= nowYear
              const yearsExpRaw = isPlausibleStartYear ? nowYear - expStartYear : null
              const yearsExp =
                Number.isFinite(yearsExpRaw) && yearsExpRaw >= 1 && yearsExpRaw <= 80 ? yearsExpRaw : null

              const jobySinceYearRaw =
                p?.joby_since_year ??
                p?.jobySinceYear ??
                (p?.created_at ? new Date(p.created_at).getFullYear() : null)
              const jobyYear = Number(jobySinceYearRaw)

              const profession = String(p?.profession || 'Profissional').trim()
              const expText =
                yearsExp != null
                  ? `${yearsExp} ${yearsExp === 1 ? 'ano' : 'anos'} de experiência`
                  : ''

              return (
                <div className="rounded-xl border border-border/50 bg-card p-3 flex items-center gap-3 shadow-md">
                  <Avatar className="h-11 w-11">
                    <AvatarImage src={profileCardAvatarSrc} alt={displayName} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {displayName.replace('@', '').charAt(0)?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 min-w-0">
                      <div className="font-semibold text-foreground truncate">{displayName}</div>
                      {!!p?.is_verified && (
                        <BadgeCheck size={16} className="text-blue-500 shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {profession}{expText ? ` • ${expText}` : ''}
                    </div>
                    {Number.isFinite(jobyYear) ? (
                      <div className="text-[11px] text-muted-foreground truncate">
                        No JOBY desde {jobyYear}
                      </div>
                    ) : null}
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    onClick={handleViewProfileClick}
                    className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    Ver perfil
                  </Button>
                </div>
              )
            })()
          ) : null}

          {professional?.isOwnProfile ? (
            (() => {
              const totalDays = availabilitySummary?.totalDays || 0
              const dates = Array.isArray(availabilitySummary?.allDatesShort)
                ? availabilitySummary.allDatesShort
                : []
              const datesText = dates.length
                ? `${dates.slice(0, 4).join(', ')}${dates.length > 4 ? ', ...' : ''}`
                : ''

              const rawViews =
                service?.views ??
                service?.views_count ??
                service?.viewsCount ??
                service?.view_count ??
                null
              const rawClicks =
                service?.clicks ??
                service?.clicks_count ??
                service?.clicksCount ??
                service?.click_count ??
                null

              const viewsCount = Number(rawViews)
              const clicksCount = Number(rawClicks)
              const safeViews = Number.isFinite(viewsCount) && viewsCount >= 0 ? viewsCount : 0
              const safeClicks = Number.isFinite(clicksCount) && clicksCount >= 0 ? clicksCount : 0
              const formatMetric = (value) => {
                try {
                  return Number(value).toLocaleString('pt-BR')
                } catch {
                  return String(value)
                }
              }

              const totalHours = Number(contractEstimate?.totalHours)
              const hasHours = Number.isFinite(totalHours) && totalHours > 0
              const totalHoursRounded = hasHours ? Math.round(totalHours * 10) / 10 : 0
              const hoursLabel = hasHours
                ? `${totalHoursRounded} ${totalHoursRounded === 1 ? 'hora' : 'horas'}`
                : '—'

              const basePrice = Number(contractEstimate?.basePrice)
              const hasBasePrice = Number.isFinite(basePrice) && basePrice > 0
              const calcLine = hasHours && hasBasePrice
                ? `(${formatBRL(basePrice)} x ${totalHoursRounded} h)`
                : ''

              const displayName = String(service?.title || '').trim() || 'Meu serviço'
              const workArea = String(normalizedService?.workArea || '').trim()
              const thumbSrc = String(serviceImageSrc || '').trim() || String(professionalAvatarSrc || '').trim()

              const handleEditClick = () => {
                if (typeof onEditService === 'function') {
                  onEditService(service)
                  return
                }
                toast({
                  title: 'Não foi possível editar agora',
                  description: 'A edição deste anúncio não está disponível nesta tela.',
                  variant: 'destructive',
                })
              }

              const handleBoostClick = () => {
                toast({
                  title: 'Impulsionar (em breve)',
                  description: 'Estamos finalizando essa função para você.',
                })
              }

              return (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-start gap-4">
                      <div className="h-16 w-16 rounded-full overflow-hidden border border-border/50 bg-muted/20 shrink-0">
                        {thumbSrc ? (
                          <img
                            src={thumbSrc}
                            alt={displayName}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            draggable={false}
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-primary font-bold">
                            {String(displayName || 'M').charAt(0)?.toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-xl font-bold text-foreground truncate">
                          {displayName}
                        </div>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="text-2xl font-bold text-orange-500">
                            {formatBRL(normalizedService.price)}
                          </span>
                          <span className="text-muted-foreground text-sm">
                            / {formatPriceUnit(normalizedService.price_unit || normalizedService.priceUnit)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {workArea ? (
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <MapPin size={16} className="text-orange-500 shrink-0" />
                        <span className="truncate">{workArea}</span>
                      </div>
                    ) : null}

                    <div className="h-px bg-border/60" />

                    {(() => {
                      const canToggleCalendar = Boolean(totalDays)

                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              if (!canToggleCalendar) return
                              setIsAvailabilityCalendarOpen((v) => !v)
                            }}
                            className={
                              'w-full flex items-start justify-between gap-3 text-left ' +
                              (canToggleCalendar ? 'cursor-pointer' : 'cursor-default')
                            }
                            aria-expanded={canToggleCalendar ? isAvailabilityCalendarOpen : undefined}
                            disabled={!canToggleCalendar}
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <Calendar size={18} className="text-muted-foreground mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-base font-bold text-foreground">
                                  {totalDays
                                    ? `Agenda feita para ${totalDays} dia${totalDays === 1 ? '' : 's'}`
                                    : 'Agenda não cadastrada'}
                                </div>
                                {datesText ? (
                                  <div className="text-sm text-muted-foreground">
                                    ({datesText})
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            {canToggleCalendar ? (
                              <span className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border/40 bg-background/30">
                                {isAvailabilityCalendarOpen ? (
                                  <ChevronUp size={18} className="text-muted-foreground" />
                                ) : (
                                  <ChevronDown size={18} className="text-muted-foreground" />
                                )}
                              </span>
                            ) : null}
                          </button>

                          {canToggleCalendar && isAvailabilityCalendarOpen ? (
                            <div className="mt-3 rounded-xl border border-border/50 bg-card p-3 shadow-md">
                              <div className="flex items-center justify-between py-1 px-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    setAvailabilityMonth(subMonths(availabilityMonth, 1))
                                  }}
                                  aria-label="Mês anterior"
                                >
                                  <ChevronLeft className="h-5 w-5" />
                                </Button>

                                <span className="text-sm font-semibold">
                                  {format(availabilityMonth, 'MMMM yyyy', { locale: ptBR })}
                                </span>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    setAvailabilityMonth(addMonths(availabilityMonth, 1))
                                  }}
                                  aria-label="Próximo mês"
                                >
                                  <ChevronRight className="h-5 w-5" />
                                </Button>
                              </div>

                              <div className="grid grid-cols-7 gap-1 mb-2 mt-2">
                                {Array.from({ length: 7 }).map((_, i) => {
                                  const startDate = startOfWeek(availabilityMonth, { locale: ptBR })
                                  const label = format(addDays(startDate, i), 'EE', { locale: ptBR })
                                    .charAt(0)
                                    .toUpperCase()
                                  return (
                                    <div
                                      key={i}
                                      className="text-center text-xs font-medium text-muted-foreground"
                                    >
                                      {label}
                                    </div>
                                  )
                                })}
                              </div>

                              <div className="grid grid-cols-7 gap-1">
                                {(() => {
                                  const monthStart = startOfMonth(availabilityMonth)
                                  const monthEnd = endOfMonth(monthStart)
                                  const calendarStartDate = startOfWeek(monthStart, { locale: ptBR })
                                  const calendarEndDate = endOfWeek(monthEnd, { locale: ptBR })
                                  const daysInCalendar = eachDayOfInterval({
                                    start: calendarStartDate,
                                    end: calendarEndDate,
                                  })

                                  const today = startOfDay(new Date())

                                  return daysInCalendar.map((day) => {
                                    const d = startOfDay(day)
                                    const isOutsideMonth = !isSameMonth(day, monthStart)
                                    const isPast = isBefore(d, today)
                                    const key = format(d, 'yyyy-MM-dd')
                                    const isAvailable = !!availabilityIndex.byKey?.[key]
                                    const badge = isAvailable ? getAvailabilityBadge(key) : null
                                    const isDisabled = isOutsideMonth || isPast || !isAvailable

                                    return (
                                      <div
                                        key={day.toISOString()}
                                        className={
                                          'h-12 w-12 rounded-xl border border-transparent flex flex-col items-center justify-center gap-0.5 text-xs ' +
                                          (isOutsideMonth ? 'invisible ' : '') +
                                          (isDisabled ? 'opacity-40 ' : '') +
                                          (isAvailable ? 'border-primary/20 bg-primary/5 ' : 'bg-card ')
                                        }
                                        aria-label={format(day, 'dd/MM/yyyy', { locale: ptBR })}
                                      >
                                        <div className="leading-none text-black dark:text-foreground">{format(day, 'd')}</div>
                                        {badge ? (
                                          <div className="rounded-md px-1.5 py-0.5 leading-none text-[10px] bg-primary/10 text-foreground">
                                            <div className="text-[9px] font-semibold leading-tight">
                                              {badge.hours || badge.title}
                                            </div>
                                            {badge.hours ? (
                                              <div className="text-[8px] font-semibold leading-tight opacity-80">
                                                {[badge.title, badge.subtitle].filter(Boolean).join(' ')}
                                              </div>
                                            ) : badge.subtitle ? (
                                              <div className="text-[8px] font-semibold leading-tight opacity-80">{badge.subtitle}</div>
                                            ) : null}
                                          </div>
                                        ) : isAvailable ? (
                                          <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                                        ) : null}
                                      </div>
                                    )
                                  })
                                })()}
                              </div>

                              <p className="mt-3 text-xs text-muted-foreground">
                                Visualização somente leitura. Não é possível editar nesta tela.
                              </p>
                            </div>
                          ) : null}
                        </>
                      )
                    })()}
                  </div>

                  <div className="rounded-2xl border border-border/50 bg-gradient-to-r from-orange-500/5 to-primary/5 p-4 shadow-md">
                    <div className="text-lg font-bold text-foreground">
                      Resumo estimado
                    </div>

                    <div className="mt-4 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Total de horas agendadas:</span>
                        <span className="font-semibold text-foreground">{hoursLabel}</span>
                      </div>

                      <div className="my-4 h-px bg-border/60" />

                      <div className="flex items-start justify-between gap-3">
                        <div className="text-muted-foreground">Total estimado:</div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-orange-500">
                            {formatBRL(contractEstimate?.total)}
                          </div>
                          {calcLine ? (
                            <div className="text-muted-foreground text-sm">{calcLine}</div>
                          ) : null}
                        </div>
                      </div>

                      <div className="my-4 h-px bg-border/60" />

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Total de atendimentos:</span>
                        <span className="font-semibold text-foreground">
                          {totalDays || '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-xs text-muted-foreground">
                    <div className="inline-flex items-center gap-1.5">
                      <Eye size={14} className="text-muted-foreground" />
                      <span>Visualizações:</span>
                      <span className="font-semibold text-foreground">
                        {formatMetric(safeViews)}
                      </span>
                    </div>

                    <div className="inline-flex items-center gap-1.5">
                      <MousePointerClick size={14} className="text-muted-foreground" />
                      <span>Cliques:</span>
                      <span className="font-semibold text-foreground">
                        {formatMetric(safeClicks)}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 rounded-lg h-10 text-sm font-medium hover:shadow-md transition-all duration-200"
                      onClick={handleEditClick}
                    >
                      <PenLine size={14} className="mr-2 text-muted-foreground" />
                      Editar
                    </Button>

                    <Button
                      type="button"
                      className="flex-1 rounded-lg h-10 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-blue-500 hover:opacity-90 hover:shadow-md transition-all duration-200"
                      onClick={handleBoostClick}
                    >
                      <Megaphone size={14} className="mr-2" />
                      Impulsionar
                    </Button>
                  </div>
                </div>
              )
            })()
          ) : (
            <>

          {/* Descrição */}
          {normalizedService.description && (
            <div>
              <h3 className="font-semibold text-foreground mb-2">
                Sobre o Serviço
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {normalizedService.description}
              </p>
            </div>
          )}

          {/* Informações Principais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Duração */}
            {normalizedService.duration && (
              <Card className="bg-muted/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Clock size={20} className="text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground mb-1">
                        Duração Estimada
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {normalizedService.duration}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Horários Disponíveis */}
          {normalizedService.availableHours && normalizedService.availableHours.length > 0 ? (
            <div>
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Calendar size={18} />
                Horários Disponíveis
              </h3>

              <div className="space-y-3">
                  {/* Resumo recolhível (igual ao editor) */}
                  <button
                    type="button"
                    onClick={() => setIsAvailabilityCalendarOpen((v) => !v)}
                    className="w-full rounded-xl border border-border/50 bg-card p-4 text-left shadow-md hover:border-primary/40 hover:bg-accent/30 transition-colors"
                    aria-expanded={isAvailabilityCalendarOpen}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-0.5 p-2 bg-primary/10 rounded-lg shrink-0">
                          <Calendar size={16} className="text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">
                            {availabilitySummary.daysText}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Pacote fechado: todos os dias serão trabalhados
                          </div>
                        </div>
                      </div>

                      <span className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border/40 bg-background/30">
                        {isAvailabilityCalendarOpen ? (
                          <ChevronUp size={18} className="text-muted-foreground" />
                        ) : (
                          <ChevronDown size={18} className="text-muted-foreground" />
                        )}
                      </span>
                    </div>

                    {availabilitySummary.allDatesShort?.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {availabilitySummary.allDatesShort.slice(0, 6).map((d) => (
                          <span
                            key={d}
                            className="inline-flex items-center rounded-lg border border-border/35 bg-transparent px-2 py-0.5 text-xs font-semibold text-muted-foreground whitespace-nowrap leading-none"
                          >
                            {d}
                          </span>
                        ))}
                        {availabilitySummary.allDatesShort.length > 6 ? (
                          <span className="inline-flex items-center rounded-lg border border-border/35 bg-transparent px-2 py-0.5 text-xs font-semibold text-muted-foreground leading-none">
                            ...
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </button>

                  {isAvailabilityCalendarOpen ? (
                    <>
                      {/* Calendário mensal (dias disponíveis marcados) */}
                      <div className="mt-1 rounded-xl border border-border/50 bg-card p-3 shadow-md">
                    <div className="flex items-center justify-between py-1 px-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setAvailabilityMonth(subMonths(availabilityMonth, 1))}
                        aria-label="Mês anterior"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      <span className="text-sm font-semibold">
                        {format(availabilityMonth, 'MMMM yyyy', { locale: ptBR })}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setAvailabilityMonth(addMonths(availabilityMonth, 1))}
                        aria-label="Próximo mês"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-2 mt-2">
                      {Array.from({ length: 7 }).map((_, i) => {
                        const startDate = startOfWeek(availabilityMonth, { locale: ptBR })
                        const label = format(addDays(startDate, i), 'EE', { locale: ptBR })
                          .charAt(0)
                          .toUpperCase()
                        return (
                          <div
                            key={i}
                            className="text-center text-xs font-medium text-muted-foreground"
                          >
                            {label}
                          </div>
                        )
                      })}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                      {(() => {
                        const monthStart = startOfMonth(availabilityMonth)
                        const monthEnd = endOfMonth(monthStart)
                        const calendarStartDate = startOfWeek(monthStart, { locale: ptBR })
                        const calendarEndDate = endOfWeek(monthEnd, { locale: ptBR })
                        const daysInCalendar = eachDayOfInterval({
                          start: calendarStartDate,
                          end: calendarEndDate,
                        })

                        const today = startOfDay(new Date())

                        return daysInCalendar.map((day) => {
                          const d = startOfDay(day)
                          const isOutsideMonth = !isSameMonth(day, monthStart)
                          const isPast = isBefore(d, today)
                          const key = format(d, 'yyyy-MM-dd')
                          const isAvailable = !!availabilityIndex.byKey?.[key]
                          const badge = isAvailable ? getAvailabilityBadge(key) : null
                          const isDisabled = isOutsideMonth || isPast || !isAvailable
                          const isSelected =
                            selectedAvailabilityDayKey &&
                            isSameDay(d, selectedAvailability?.date)

                          return (
                            <button
                              key={day.toISOString()}
                              type="button"
                              className={
                                'h-12 w-12 rounded-xl border border-transparent flex flex-col items-center justify-center gap-0.5 text-xs transition-colors ' +
                                (isOutsideMonth ? 'invisible ' : '') +
                                (isDisabled
                                  ? 'opacity-40 cursor-not-allowed '
                                  : 'hover:bg-accent ') +
                                (isSelected
                                  ? 'bg-primary text-primary-foreground '
                                  : 'bg-card ') +
                                (isAvailable && !isSelected
                                  ? 'border-primary/20 bg-primary/5 '
                                  : '')
                              }
                              onClick={() => {
                                if (isDisabled) return
                                setSelectedAvailabilityDayKey(key)
                                setSelectedAvailableHour('')
                              }}
                              disabled={isDisabled}
                              aria-label={format(day, 'dd/MM/yyyy', { locale: ptBR })}
                            >
                              <div
                                className={
                                  'leading-none ' +
                                  (isSelected
                                    ? 'text-black dark:text-primary-foreground'
                                    : 'text-black dark:text-foreground')
                                }
                              >
                                {format(day, 'd')}
                              </div>
                              {badge ? (
                                <div
                                  className={
                                    'rounded-md px-1.5 py-0.5 leading-none text-[10px] ' +
                                    (isSelected
                                      ? 'bg-primary-foreground text-primary shadow-sm'
                                      : 'bg-primary/10 text-foreground')
                                  }
                                >
                                  <div className="text-[9px] font-semibold leading-tight">{badge.title}</div>
                                  {badge.subtitle ? (
                                    <div className="text-[8px] font-semibold leading-tight opacity-80">
                                      {badge.subtitle}
                                    </div>
                                  ) : null}
                                </div>
                              ) : isAvailable ? (
                                <div
                                  className={
                                    'h-1.5 w-1.5 rounded-full ' +
                                    (isSelected ? 'bg-primary-foreground' : 'bg-orange-500')
                                  }
                                />
                              ) : null}
                            </button>
                          )
                        })
                      })()}
                    </div>
                  </div>

                      {/* Horários do dia selecionado */}
                      <div className="rounded-xl border border-border/50 bg-card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-semibold text-foreground">
                            {selectedAvailability?.date
                              ? (() => {
                                  const weekday = format(selectedAvailability.date, 'EEEE', { locale: ptBR })
                                  const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1)
                                  return `${format(selectedAvailability.date, "d 'de' MMMM", { locale: ptBR })} (${weekdayCap})`
                                })()
                              : 'Selecione um dia no calendário'}
                          </div>

                          {selectedAvailability?.date ? (
                            <Badge
                              variant="secondary"
                              className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-full border border-border/30 bg-muted/20"
                            >
                              <Lock size={13} className="text-muted-foreground/70" />
                              Carga horária por período
                            </Badge>
                          ) : null}
                        </div>

                        <div className="mt-3">
                          {selectedAvailability?.date ? (
                            <>
                              {Array.isArray(fixedDaySummary?.chips) && fixedDaySummary.chips.length ? (
                                <div className="flex flex-wrap gap-2">
                                  {fixedDaySummary.chips.map((label) => (
                                    <Badge
                                      key={label}
                                      variant="secondary"
                                      className="px-4 py-2 rounded-full select-none text-sm font-semibold bg-muted/25 text-foreground border border-transparent"
                                    >
                                      {label}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">Sem horários detalhados para este dia.</p>
                              )}

                              <div className="mt-4 flex items-start gap-2">
                                <Pin size={14} className="text-muted-foreground/70 shrink-0 mt-0.5" />
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                  Agenda definida pelo profissional. Você contrata o pacote completo de dias.
                                </p>
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {availabilityIndex.hasAny
                                ? 'Selecione um dia disponível acima para ver os horários.'
                                : 'Nenhuma disponibilidade cadastrada.'}
                            </p>
                          )}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
            </div>
          ) : (
            <div>
              <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <Calendar size={18} className="text-primary" />
                {professional?.isOwnProfile
                  ? 'Horários em Aberto'
                  : 'Quando você precisa do serviço?'}
              </h3>
              {professional?.isOwnProfile ? (
                <p className="text-sm text-muted-foreground">
                  Você não definiu horários fixos. Os clientes poderão solicitar
                  horários personalizados.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-3">
                    O profissional não definiu datas fixas. Selecione um dia no calendário e ajuste o período (igual ao editor de disponibilidade), ou descreva abaixo.
                  </p>

                  <div className="space-y-3">
                    {/* Resumo recolhível (calendário em aberto) */}
                    <button
                      type="button"
                      onClick={() => setIsOpenScheduleCalendarOpen((v) => !v)}
                      className="w-full rounded-xl border border-border/50 bg-card p-4 text-left hover:border-primary/40 hover:bg-accent/30 transition-colors"
                      aria-expanded={isOpenScheduleCalendarOpen}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="mt-0.5 p-2 bg-primary/10 rounded-lg shrink-0">
                            <Calendar size={16} className="text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-foreground">
                              {openScheduleSummary.daysText}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {selectedWorkDay
                                ? `Selecionado: ${format(selectedWorkDay, 'dd/MM/yyyy', { locale: ptBR })}`
                                : 'Toque para ver datas e horários disponível'}
                            </div>
                          </div>
                        </div>

                        <span className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border/40 bg-background/30">
                          {isOpenScheduleCalendarOpen ? (
                            <ChevronUp size={18} className="text-muted-foreground" />
                          ) : (
                            <ChevronDown size={18} className="text-muted-foreground" />
                          )}
                        </span>
                      </div>

                      {openScheduleSummary.allDatesShort?.length ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {openScheduleSummary.allDatesShort.slice(0, 6).map((d) => (
                            <span
                              key={d}
                              className="inline-flex items-center rounded-lg border border-border/35 bg-transparent px-2 py-0.5 text-xs font-semibold text-muted-foreground whitespace-nowrap leading-none"
                            >
                              {d}
                            </span>
                          ))}
                          {openScheduleSummary.allDatesShort.length > 6 ? (
                            <span className="inline-flex items-center rounded-lg border border-border/35 bg-transparent px-2 py-0.5 text-xs font-semibold text-muted-foreground leading-none">
                              ...
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </button>

                    {isOpenScheduleCalendarOpen ? (
                      <>
                    {/* Calendário (mesmo layout do editor) */}
                    <div className="mt-4 rounded-xl border border-border/50 bg-card p-3">
                      <div className="flex items-center justify-between py-1 px-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setOpenScheduleMonth(subMonths(openScheduleMonth, 1))}
                          aria-label="Mês anterior"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <span className="text-sm font-semibold">
                          {format(openScheduleMonth, 'MMMM yyyy', { locale: ptBR })}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setOpenScheduleMonth(addMonths(openScheduleMonth, 1))}
                          aria-label="Próximo mês"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-7 gap-1 mb-2 mt-2">
                        {Array.from({ length: 7 }).map((_, i) => {
                          const startDate = startOfWeek(openScheduleMonth, { locale: ptBR })
                          const label = format(addDays(startDate, i), 'EE', { locale: ptBR })
                            .charAt(0)
                            .toUpperCase()
                          return (
                            <div key={i} className="text-center text-xs font-medium text-muted-foreground">
                              {label}
                            </div>
                          )
                        })}
                      </div>

                      <div className="grid grid-cols-7 gap-1">
                        {(() => {
                          const monthStart = startOfMonth(openScheduleMonth)
                          const monthEnd = endOfMonth(monthStart)
                          const calendarStartDate = startOfWeek(monthStart, { locale: ptBR })
                          const calendarEndDate = endOfWeek(monthEnd, { locale: ptBR })
                          const daysInCalendar = eachDayOfInterval({
                            start: calendarStartDate,
                            end: calendarEndDate,
                          })
                          const today = startOfDay(new Date())

                          return daysInCalendar.map((day) => {
                            const d = startOfDay(day)
                            const isOutsideMonth = !isSameMonth(day, monthStart)
                            const isPast = isBefore(d, today)
                            const isDisabled = isOutsideMonth || isPast
                            const isSelected = selectedWorkDay && isSameDay(d, selectedWorkDay)
                            const badge = getWorkDayBadge(d)

                            return (
                              <button
                                key={day.toISOString()}
                                type="button"
                                className={
                                  'h-12 w-12 rounded-xl border border-transparent flex flex-col items-center justify-center gap-0.5 text-xs transition-colors ' +
                                  (isOutsideMonth ? 'invisible ' : '') +
                                  (isDisabled ? 'opacity-40 cursor-not-allowed ' : 'hover:bg-accent ') +
                                  (isSelected ? 'bg-primary text-primary-foreground ' : 'bg-card ') +
                                  (badge && !isSelected ? 'border-primary/20 bg-primary/5 ' : '')
                                }
                                onClick={() => !isDisabled && selectWorkDay(day)}
                                disabled={isDisabled}
                                aria-label={format(day, 'dd/MM/yyyy', { locale: ptBR })}
                              >
                                <div
                                  className={
                                    'leading-none ' +
                                    (isSelected
                                      ? 'text-foreground dark:text-primary-foreground'
                                      : 'text-foreground')
                                  }
                                >
                                  {format(day, 'd')}
                                </div>
                                {badge ? (
                                  <div
                                    className={
                                      'rounded-md px-1.5 py-0.5 leading-none text-[10px] ' +
                                      (isSelected
                                        ? 'bg-primary-foreground text-primary shadow-sm'
                                        : 'bg-primary/10 text-foreground')
                                    }
                                  >
                                    <div className="text-[9px] font-semibold leading-tight">{badge.title}</div>
                                    {badge.subtitle ? (
                                      <div className="text-[8px] font-semibold leading-tight opacity-80">
                                        {badge.subtitle}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </button>
                            )
                          })
                        })()}
                      </div>
                    </div>

                    {/* Configurar dia selecionado (mesmo layout do editor) */}
                    <div className="mt-4 rounded-xl border border-border/50 bg-card p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">Configurar dia selecionado</div>
                          <div className="text-xs text-muted-foreground">
                            {selectedWorkDay
                              ? format(selectedWorkDay, 'EEEE, dd/MM/yyyy', { locale: ptBR })
                              : 'Selecione um dia no calendário para definir como você estará disponível.'}
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            syncWorkDays({})
                            setSelectedWorkDay(null)
                          }}
                          disabled={!getSelectedDayKeys().length}
                        >
                          Limpar
                        </Button>
                      </div>

                      <div className="mt-3 space-y-2">
                        {workDayPresets.map((p) => {
                          const isFull = p.key === 'full'
                          const isCustom = p.key === 'custom'
                          const isMorning = p.key === 'morning'
                          const isAfternoon = p.key === 'afternoon'

                          const selected =
                            (isFull && workDayChoice === 'full') ||
                            (isCustom && workDayChoice === 'custom') ||
                            (isMorning && workDayChoice === 'slots' && slotMorningEnabled) ||
                            (isAfternoon && workDayChoice === 'slots' && slotAfternoonEnabled)

                          const disabled = isMonthlyBilling && p.key === 'full'
                          const showInlineHours = isMorning || isAfternoon
                          const hoursValue = isMorning ? morningHours : afternoonHours
                          const setHoursValue = isMorning ? setMorningHours : setAfternoonHours
                          const slotEnabled = isMorning
                            ? slotMorningEnabled
                            : isAfternoon
                              ? slotAfternoonEnabled
                              : false

                          return (
                            <div
                              key={p.key}
                              role="button"
                              tabIndex={disabled || !selectedWorkDay ? -1 : 0}
                              onClick={() => {
                                if (!selectedWorkDay) return
                                if (disabled) return
                                if (isFull) {
                                  setWorkDayChoice('full')
                                  applyChoiceToAllSelectedDays('full')
                                  return
                                }
                                if (isCustom) {
                                  setWorkDayChoice('custom')
                                  return
                                }

                                setWorkDayChoice('slots')
                                if (isMorning) {
                                  setSlotMorningEnabled((prev) => {
                                    const next = !prev
                                    if (!next && !slotAfternoonEnabled) return prev
                                    return next
                                  })
                                }
                                if (isAfternoon) {
                                  setSlotAfternoonEnabled((prev) => {
                                    const next = !prev
                                    if (!next && !slotMorningEnabled) return prev
                                    return next
                                  })
                                }
                              }}
                              onKeyDown={(e) => {
                                if (disabled || !selectedWorkDay) return
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  e.currentTarget.click()
                                }
                              }}
                              className={
                                'w-full flex items-center gap-3 rounded-2xl px-4 py-3 border transition-all text-left select-none backdrop-blur-sm ' +
                                (selected
                                  ? 'bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-transparent dark:from-orange-500/20 dark:via-amber-500/10 dark:to-slate-900/20 border-orange-400/60 shadow-[0_14px_40px_-18px_rgba(249,115,22,0.55)]'
                                  : 'bg-gradient-to-r from-muted/10 to-card dark:from-white/5 dark:to-card border-border/50 hover:border-orange-400/30 hover:shadow-[0_10px_28px_-18px_rgba(249,115,22,0.35)]') +
                                (disabled || !selectedWorkDay
                                  ? ' opacity-50 cursor-not-allowed hover:shadow-none hover:border-border/50'
                                  : '')
                              }
                              aria-pressed={selected}
                              aria-disabled={disabled}
                            >
                              <span
                                className={
                                  'h-9 w-9 rounded-full border flex items-center justify-center shrink-0 shadow-sm ' +
                                  (selected
                                    ? 'border-orange-400/60 bg-gradient-to-br from-orange-400 to-amber-500 text-white shadow-[0_10px_24px_-14px_rgba(249,115,22,0.9)]'
                                    : 'border-border/60 bg-muted/20 text-muted-foreground')
                                }
                                aria-hidden="true"
                              >
                                {selected ? <Check size={16} /> : null}
                              </span>
                              <span className="flex-1 min-w-0 flex items-center justify-between gap-3">
                                <span
                                  className={(selected ? 'font-semibold ' : 'font-medium ') + 'text-[15px] sm:text-base text-foreground'}
                                >
                                  {showInlineHours ? `${p.label} (${hoursValue}h)` : p.label}
                                </span>

                                {showInlineHours ? (
                                  <span
                                    className={
                                      'shrink-0 flex items-center gap-1 rounded-xl border border-border/40 bg-background/30 px-1.5 py-1 shadow-sm ' +
                                      (workDayChoice === 'slots' && slotEnabled ? '' : 'opacity-60')
                                    }
                                  >
                                    <button
                                      type="button"
                                      disabled={!selectedWorkDay || disabled}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (!selectedWorkDay || disabled) return
                                        setWorkDayChoice('slots')
                                        if (isMorning) setSlotMorningEnabled(true)
                                        if (isAfternoon) setSlotAfternoonEnabled(true)
                                        setHoursValue((h) => {
                                          const current = Number(h || 1)
                                          const next = current + 1
                                          return next > 6 ? 1 : next
                                        })
                                      }}
                                      className={
                                        'h-8 w-8 rounded-lg bg-transparent hover:bg-muted/30 flex items-center justify-center transition-colors ' +
                                        (!selectedWorkDay || disabled
                                          ? 'opacity-50 cursor-not-allowed hover:bg-transparent'
                                          : '')
                                      }
                                      aria-label={
                                        isMorning ? 'Aumentar horas da manhã' : 'Aumentar horas da tarde'
                                      }
                                    >
                                      <ChevronUp size={14} />
                                    </button>
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          )
                        })}
                      </div>

                      {workDayChoice === 'custom' ? (
                        <div className="mt-3 rounded-xl border border-border/50 bg-muted/10 p-3">
                          <div className="text-sm font-semibold text-foreground mb-2">Horário de trabalho</div>
                          {(() => {
                            const morning = isValidPeriodRange({
                              start: workDayCustomMorningStart,
                              end: workDayCustomMorningEnd,
                              minTime: '00:00',
                              maxTime: '12:59',
                              allowUnused00: true,
                            })
                            const afternoon = isValidPeriodRange({
                              start: workDayCustomAfternoonStart,
                              end: workDayCustomAfternoonEnd,
                              minTime: '13:00',
                              maxTime: '23:59',
                              allowUnused00: true,
                            })

                            const morningInvalid = !morning.valid && !morning.unused
                            const afternoonInvalid = !afternoon.valid && !afternoon.unused

                            return (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <div className="text-xs text-muted-foreground mb-1">1 turno: 00:00–12:59</div>
                                  <TimeRangeInput
                                    startValue={workDayCustomMorningStart}
                                    endValue={workDayCustomMorningEnd}
                                    onStartChange={setWorkDayCustomMorningStart}
                                    onEndChange={setWorkDayCustomMorningEnd}
                                    disabled={!selectedWorkDay}
                                    ariaLabelStart="Horário manhã início"
                                    ariaLabelEnd="Horário manhã fim"
                                    startMin="00:00"
                                    startMax="12:59"
                                    endMin="00:00"
                                    endMax="12:59"
                                    invalid={!!selectedWorkDay && morningInvalid}
                                  />
                                </div>

                                <div>
                                  <div className="text-xs text-muted-foreground mb-1">2 turno: 13:00–23:59</div>
                                  <TimeRangeInput
                                    startValue={workDayCustomAfternoonStart}
                                    endValue={workDayCustomAfternoonEnd}
                                    onStartChange={setWorkDayCustomAfternoonStart}
                                    onEndChange={setWorkDayCustomAfternoonEnd}
                                    disabled={!selectedWorkDay}
                                    ariaLabelStart="Horário tarde início"
                                    ariaLabelEnd="Horário tarde fim"
                                    startMin="13:00"
                                    startMax="23:59"
                                    endMin="13:00"
                                    endMax="23:59"
                                    invalid={!!selectedWorkDay && afternoonInvalid}
                                  />
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      ) : null}
                    </div>
                      </>
                    ) : null}

                  </div>
                </>
              )}
            </div>
          )}

          {!professional?.isOwnProfile ? (
            <div className="pt-1">
              {renderServiceRequestDetails()}
            </div>
          ) : null}

          {/* Tipos de Atendimento e Taxas */}
          {professional?.isOwnProfile &&
            (normalizedService.homeService ||
              normalizedService.emergencyService ||
              normalizedService.travelFee) && (
            <div>
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp size={18} className="text-primary" />
                Tipos de Atendimento e Taxas
              </h3>
              <div className="space-y-3">
                {/* Atendimento a Domicílio */}
                {normalizedService.homeService && (
                  <Card className="bg-gradient-to-r from-blue-500/10 to-primary/10 border-primary/30">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/20 rounded-lg">
                          <Home size={20} className="text-primary" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-foreground mb-1">
                            Atendimento a Domicílio
                          </h4>
                          <p className="text-sm text-muted-foreground mb-2">
                            Profissional se desloca até o local do cliente
                          </p>
                          {normalizedService.homeServiceFee && (
                            <div className="flex items-center gap-2 text-sm">
                              <Percent size={16} className="text-primary" />
                              <span className="font-semibold text-primary">
                                +{normalizedService.homeServiceFee}% sobre o valor base
                              </span>
                            </div>
                          )}
                        </div>
                        <Badge className="bg-primary text-primary-foreground">
                          Disponível
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Atendimento de Emergência */}
                {normalizedService.emergencyService && (
                  <Card className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border-red-500/30">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-red-500/20 rounded-lg">
                          <AlertCircle size={20} className="text-red-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-foreground mb-1">
                            Atendimento de Emergência
                          </h4>
                          <p className="text-sm text-muted-foreground mb-2">
                            Disponibilidade para urgências 24 horas
                          </p>
                          {normalizedService.emergencyServiceFee && (
                            <div className="flex items-center gap-2 text-sm">
                              <Percent size={16} className="text-red-600" />
                              <span className="font-semibold text-red-600">
                                +{normalizedService.emergencyServiceFee}% taxa de
                                emergência
                              </span>
                            </div>
                          )}
                        </div>
                        <Badge className="bg-red-600 text-white">
                          Urgência
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Taxa de Deslocamento */}
                {normalizedService.travelFee && (
                  <Card className="bg-gradient-to-r from-green-500/10 to-teal-500/10 border-green-500/30">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-green-500/20 rounded-lg">
                          <Truck size={20} className="text-green-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-foreground mb-1">
                            Taxa de Deslocamento
                          </h4>
                          <p className="text-sm text-muted-foreground mb-2">
                            Cobrada para cobrir custos de transporte
                          </p>
                          <div className="flex items-center gap-2 text-sm">
                            <Percent size={16} className="text-green-600" />
                            <span className="font-semibold text-green-600">
                              +{normalizedService.travelFee}% taxa de deslocamento
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* Resumo do contratado (estimativa profissional) */}
          <Card className="bg-gradient-to-r from-orange-500/5 to-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h4 className="font-semibold text-foreground flex items-center gap-2">
                    <FileText size={18} className="text-primary" />
                    Resumo do contratado
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Valor estimado com base na agenda selecionada e nas taxas do serviço.
                  </p>
                </div>
                <Badge className="bg-primary/10 text-primary border border-primary/20">Estimativa</Badge>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Serviço:</span>
                  <span className="font-semibold text-right line-clamp-1">{service.title}</span>
                </div>

                <div className="flex justify-between items-start py-1">
                  <span className="text-muted-foreground">Agenda:</span>
                  <span className="font-semibold text-right max-w-[65%]">
                    {contractEstimate?.scheduleLine || 'Selecione uma agenda para ver a estimativa'}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-t border-border/50">
                  <span className="text-muted-foreground">Tipo de cobrança:</span>
                  <span className="font-semibold">{formatPriceUnit(contractEstimate?.unit || normalizedPriceUnit, { prefix: true })}</span>
                </div>

                {contractEstimate?.isHourly ? (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground">Cálculo base:</span>
                    <span className="font-semibold">{contractEstimate.baseLine}</span>
                  </div>
                ) : contractEstimate?.isDaily ? (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground">Cálculo base:</span>
                    <span className="font-semibold">{contractEstimate.baseLine}</span>
                  </div>
                ) : (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-muted-foreground">Valor base:</span>
                    <span className="font-semibold">{formatBRL(normalizedService.price)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center py-1 border-t border-border/50">
                  <span className="text-muted-foreground">Subtotal estimado:</span>
                  <span className="font-semibold">{formatBRL(contractEstimate?.subtotal)}</span>
                </div>

                {Array.isArray(contractEstimate?.fees) && contractEstimate.fees.length ? (
                  <div className="space-y-2">
                    {contractEstimate.fees.map((f) => (
                      <div
                        key={f.label}
                        className="flex justify-between items-center py-1 border-t border-border/50"
                      >
                        <span className="text-muted-foreground">
                          {f.label} (+{f.pct}%):
                        </span>
                        <span className={`font-semibold ${f.tone}`}>{formatBRL(f.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="flex justify-between items-center pt-3 mt-2 border-t border-border/60">
                  <span className="font-semibold text-foreground">Total estimado:</span>
                  <span className="text-lg font-bold text-orange-500">
                    {formatBRL(contractEstimate?.total)}
                  </span>
                </div>

                {contractEstimate?.note ? (
                  <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                    {contractEstimate.note}
                  </p>
                ) : null}

                {contractEstimate?.observations ? (
                  <div className="pt-2">
                    <div className="text-xs text-muted-foreground">Observações:</div>
                    <div className="text-sm text-foreground leading-relaxed">
                      {contractEstimate.observations}
                    </div>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Botões de Ação */}
          {!professional?.isOwnProfile && (
            <div className="flex gap-3 pt-4 border-t border-border">
              <Button
                onClick={handleRequestService}
                disabled={isSubmitting}
                className="flex-1 joby-gradient text-primary-foreground"
              >
                <Briefcase size={18} className="mr-2" />
                {isSubmitting
                  ? (editingBookingId ? 'Salvando...' : 'Enviando...')
                  : (editingBookingId ? 'Salvar alterações' : 'Confirmar solicitação')}
              </Button>
              <Button
                onClick={handleMessageClick}
                variant="outline"
                className="flex-1"
              >
                <Send size={18} className="mr-2" />
                Mensagem
              </Button>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  )

  // Renderizar usando Portal diretamente no body
  return ReactDOM.createPortal(modalContent, document.body)
}

export default ServiceDetailsModal
