import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs } from '@/components/ui/tabs'
import { SwipeTabsList } from '@/components/SwipeTabs'
import { useSwipeTabs } from '@/hooks/useSwipeTabs'
import { TabTransition } from '@/components/TabTransition'
import JobyPageHeader from '@/components/JobyPageHeader'
import { tabsPillList, tabsPillTrigger } from '@/design/tabTokens'
import { useAuth } from '@/contexts/AuthContext'
import { supabase, safeGetSession } from '@/lib/supabaseClient'
import { formatPriceUnit } from '@/lib/priceUnit'
import { cn } from '@/lib/utils'
import { resolveStorageUrl, useResolvedStorageUrl } from '@/lib/storageUrl'
import { log } from '@/lib/logger'
import { useToast } from '@/components/ui/use-toast'
import { useOverlayLock } from '@/hooks/useOverlayLock'
import ServiceDetailsModal from '@/components/ServiceDetailsModal'
import { markNotificationsReadByType } from '@/services/notificationService'
import ErrorState from '@/components/ui/ErrorState'
import EmptyState from '@/components/ui/EmptyState'
import PageSkeleton from '@/components/ui/PageSkeleton'
import PullToRefresh from '@/components/ui/PullToRefresh'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {
  Briefcase,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  X,
  AlertTriangle,
  CheckCircle2,
  Ban,
  Hourglass,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  MapPin,
  Send,
  Star,
  Timer,
  BadgeCheck,
  ShieldCheck,
  Wallet,
  Download,
  Flag,
  Gauge,
  FileText,
  Calculator,
  Info,
  Lock,
} from 'lucide-react'

const WorkRequests = () => {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const { requestId: routeRequestId } = useParams()
  const { toast } = useToast()

  const realtimeEnabled =
    String(import.meta?.env?.VITE_ENABLE_SUPABASE_REALTIME).toLowerCase().trim() === 'true'
  const [resetTick, setResetTick] = useState(0)
  const realtimeResetKey = realtimeEnabled ? resetTick : 0
  const [activeTab, setActiveTab] = useState('recebidos')
  const [activeStatus, setActiveStatus] = useState('all')
  const [requestsRecebidos, setRequestsRecebidos] = useState([])
  const [requestsEnviados, setRequestsEnviados] = useState([])
  const [requestMediaByRequestId, setRequestMediaByRequestId] = useState({})
  const [signedUrlByMediaId, setSignedUrlByMediaId] = useState({})
  const [signedUrlFailedByMediaId, setSignedUrlFailedByMediaId] = useState({})
  const [mediaSignedUrlsRerunTick, setMediaSignedUrlsRerunTick] = useState(0)
  const [activeMediaViewer, setActiveMediaViewer] = useState(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editBooking, setEditBooking] = useState(null)
  const [editService, setEditService] = useState(null)
  const [editProfessional, setEditProfessional] = useState(null)
  const [viewerPlaybackRate, setViewerPlaybackRate] = useState(1)
  const [viewerOptionsMenuOpen, setViewerOptionsMenuOpen] = useState(false)
  const [viewerOptionsMenuPage, setViewerOptionsMenuPage] = useState('main')
  const [loading, setLoading] = useState(true)
  const [loadingRecebidos, setLoadingRecebidos] = useState(false)
  const [loadingEnviados, setLoadingEnviados] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [openMenuRequestId, setOpenMenuRequestId] = useState(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null)
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState(null)
  const [expandedDetailsById, setExpandedDetailsById] = useState({})
  const [openInlineDetailsRequestId, setOpenInlineDetailsRequestId] = useState(null)
  const [resolvedAvatarUrlByUserId, setResolvedAvatarUrlByUserId] = useState({})
  const [workSessionsByBookingId, setWorkSessionsByBookingId] = useState({})
  const [arrivalConfirmedAtByBookingId, setArrivalConfirmedAtByBookingId] = useState({})

  const requestsTrace = (bookingId = null) => {
    const bid = String(bookingId || '').trim() || null
    return {
      traceId: bid ? `requests:${bid}` : null,
      userId: user?.id || null,
      bookingId: bid,
    }
  }

  useEffect(() => {
    if (import.meta.env.DEV) log.debug('REQUESTS', 'mount', { ...requestsTrace(null) })
    return () => {
      if (import.meta.env.DEV) log.debug('REQUESTS', 'unmount', { ...requestsTrace(null) })
    }
  }, [])

  useEffect(() => {
    const handler = () => setResetTick((v) => v + 1)
    window.addEventListener('supabase:reset', handler)
    return () => {
      window.removeEventListener('supabase:reset', handler)
    }
  }, [])

  useEffect(() => {
    // When opening the route-based details modal, close any inline expanded card.
    if (String(routeRequestId || '').trim()) setOpenInlineDetailsRequestId(null)
  }, [routeRequestId])

  useEffect(() => {
    if (!openMenuRequestId) return

    const handlePointerDown = (event) => {
      try {
        const target = event?.target
        const menuRoot = target?.closest?.('[data-request-menu-root]')
        const menuId = menuRoot?.getAttribute?.('data-request-menu-root')
        if (menuId && String(menuId) === String(openMenuRequestId)) return
      } catch {
        // ignore
      }

      setOpenMenuRequestId(null)
    }

    document.addEventListener('mousedown', handlePointerDown, true)
    document.addEventListener('touchstart', handlePointerDown, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true)
      document.removeEventListener('touchstart', handlePointerDown, true)
    }
  }, [openMenuRequestId])

  const latestRecebidosRef = useRef([])
  const latestEnviadosRef = useRef([])
  const loadRequestsInFlightRef = useRef(false)
  const loadRequestsPendingRef = useRef(false)
  const lastAutoRefreshAtRef = useRef(0)
  const workSessionsUnavailableRef = useRef(false)
  const workSessionsFetchInFlightRef = useRef({})
  const arrivalConfirmedFetchInFlightRef = useRef({})
  const serviceMediaTablesReadyRef = useRef(true)
  const signedUrlByMediaIdRef = useRef({})
  const signedUrlFailedByMediaIdRef = useRef({})
  const attachmentsSignedUrlUnavailableRef = useRef(false)
  const attachmentsSignedUrlWarnedRef = useRef(false)
  const mediaSignedUrlsInFlightRef = useRef(false)
  const mediaSignedUrlsPendingRerunRef = useRef(false)
  const mediaSignedUrlsLastRequestedKeyRef = useRef('')
  const mediaSignedUrlsProcessingKeyRef = useRef('')
  const viewerVideoRef = useRef(null)

  useEffect(() => {
    setViewerOptionsMenuOpen(false)
    setViewerOptionsMenuPage('main')
  }, [activeMediaViewer?.mediaId])

  const SIGNED_URL_CACHE_TTL_MS = 2 * 60 * 1000
  const getSignedUrlCache = () => (globalThis.__JOBY_SIGNED_URL_CACHE_V1__ ||= new Map())
  const readSignedUrlCache = (mediaId) => {
    const id = String(mediaId || '').trim()
    if (!id) return ''
    try {
      const v = getSignedUrlCache().get(id)
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

  useEffect(() => {
    latestRecebidosRef.current = requestsRecebidos
  }, [requestsRecebidos])

  useEffect(() => {
    latestEnviadosRef.current = requestsEnviados
  }, [requestsEnviados])

  useEffect(() => {
    signedUrlByMediaIdRef.current = signedUrlByMediaId || {}
  }, [signedUrlByMediaId])

  useEffect(() => {
    signedUrlFailedByMediaIdRef.current = signedUrlFailedByMediaId || {}
  }, [signedUrlFailedByMediaId])

  const closeMediaViewer = () => {
    try {
      const el = viewerVideoRef.current
      if (el && !el.paused) el.pause()
    } catch {
      // ignore
    }
    setActiveMediaViewer(null)
    setViewerPlaybackRate(1)
  }

  const toFriendlyErrorMessagePtBR = (raw) => {
    const msg = String(raw || '').trim()
    const lower = msg.toLowerCase()
    if (!lower) return ''
    if (lower.includes('timeout') || lower.includes('time out')) {
      return 'Sem conexão ou servidor lento. Tente novamente.'
    }
    return msg
  }

  useEffect(() => {
    const isVideo = String(activeMediaViewer?.mediaType || '').toLowerCase() === 'video'
    if (!isVideo) return
    const el = viewerVideoRef.current
    if (!el) return
    try {
      el.playbackRate = viewerPlaybackRate
    } catch {
      // ignore
    }
  }, [viewerPlaybackRate, activeMediaViewer?.mediaId, activeMediaViewer?.mediaType])

  const toggleViewerPlayback = () => {
    const el = viewerVideoRef.current
    if (!el) return
    try {
      if (el.paused) {
        const p = el.play()
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            // ignore AbortError / autoplay races
          })
        }
      }
      else el.pause()
    } catch {
      // ignore
    }
  }

  const handleViewerVideoPointerUp = (e) => {
    // Pausar/retomar ao tocar no meio do vídeo (padrão do app), sem conflitar com os controles nativos.
    if (String(activeMediaViewer?.mediaType || '').toLowerCase() !== 'video') return

    const el = viewerVideoRef.current
    if (!el) return

    const rect = el.getBoundingClientRect?.()
    if (!rect) return

    const clientX = Number(e?.clientX ?? e?.nativeEvent?.clientX ?? NaN)
    const clientY = Number(e?.clientY ?? e?.nativeEvent?.clientY ?? NaN)
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return

    const x = clientX - rect.left
    const y = clientY - rect.top

    // Evitar togglar quando o usuário está interagindo com a barra de controles (área inferior)
    const controlsSafeZone = 72 // px
    const isOnControlsArea = rect.height - y <= controlsSafeZone
    if (isOnControlsArea) return

    // Considera como "meio" uma janela central para evitar toques acidentais nas bordas.
    const inCenterX = x >= rect.width * 0.2 && x <= rect.width * 0.8
    const inCenterY = y >= rect.height * 0.2 && y <= rect.height * 0.8
    if (!inCenterX || !inCenterY) return

    toggleViewerPlayback()
  }

  const startViewerDownload = ({ url, mediaId, mediaType }) => {
    const u = String(url || '').trim()
    if (!u) return

    const id = String(mediaId || '').trim() || 'anexo'
    const type = String(mediaType || '').toLowerCase() === 'video' ? 'video' : 'foto'
    let ext = type === 'video' ? 'mp4' : 'jpg'

    try {
      const pathname = new URL(u).pathname
      const last = String(pathname || '').split('/').pop() || ''
      const dot = last.lastIndexOf('.')
      const parsedExt = dot !== -1 ? last.slice(dot + 1) : ''
      const safeExt = String(parsedExt || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      if (safeExt) ext = safeExt
    } catch {
      // ignore
    }

    try {
      const a = document.createElement('a')
      a.href = u
      a.target = '_blank'
      a.rel = 'noreferrer'
      a.download = `${type}-${id}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      toast({
        title: 'Download',
        description: 'Download iniciado.',
      })
    } catch {
      // ignore
    }
  }

  const setViewerSpeed = (rate) => {
    const next = Number(rate)
    if (!Number.isFinite(next) || next <= 0) return
    setViewerPlaybackRate(next)
    try {
      const el = viewerVideoRef.current
      if (el) el.playbackRate = next
    } catch {
      // ignore
    }
  }

  const formatBRL = (value) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return 'R$ --'
    const hasCents = Math.abs(n % 1) > 0.00001
    const out = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0,
    }).format(n)
    return out.replace(/\u00A0/g, ' ')
  }

  const extractIsoDateOnly = (raw) => {
    if (!raw) return ''
    try {
      if (raw instanceof Date) {
        if (Number.isNaN(raw.getTime())) return ''
        const y = raw.getFullYear()
        const m = String(raw.getMonth() + 1).padStart(2, '0')
        const d = String(raw.getDate()).padStart(2, '0')
        return `${y}-${m}-${d}`
      }
      const s = String(raw || '').trim()
      const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
      return m?.[1] || ''
    } catch {
      return ''
    }
  }

  const formatIsoDateBR = (iso) => {
    const s = String(iso || '').trim()
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!m) return '-'
    return `${m[3]}/${m[2]}/${m[1]}`
  }

  const formatDatePt = (raw) => {
    if (!raw) return '-'
    try {
      const iso = extractIsoDateOnly(raw)
      if (iso) return formatIsoDateBR(iso)
      if (raw instanceof Date) {
        const d = raw
        if (Number.isNaN(d.getTime())) return '-'
        const dd = String(d.getDate()).padStart(2, '0')
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const yy = String(d.getFullYear())
        return `${dd}/${mm}/${yy}`
      }
      return '-'
    } catch {
      return '-'
    }
  }

  const formatDayMonthPt = (raw) => {
    if (!raw) return ''
    try {
      const iso = extractIsoDateOnly(raw)
      if (iso) {
        const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        return m ? `${m[3]}/${m[2]}` : ''
      }
      if (raw instanceof Date) {
        const d = raw
        if (Number.isNaN(d.getTime())) return ''
        const dd = String(d.getDate()).padStart(2, '0')
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        return `${dd}/${mm}`
      }
      return ''
    } catch {
      return ''
    }
  }

  const getSelectedDatesFromBooking = (booking) => {
    const b = booking || {}
    const candidates = [
      b.selected_dates,
      b.selectedDates,
      b.selected_days,
      b.selectedDays,
      b.days_selected,
      b.daysSelected,
      b.dates_selected,
      b.datesSelected,
      b.work_dates,
      b.workDates,
      b.work_days,
      b.workDays,
      b.schedule_dates,
      b.scheduleDates,
      b.schedule_days,
      b.scheduleDays,
      b.agenda_dates,
      b.agendaDates,
      b.agenda_days,
      b.agendaDays,
      b.days,
      b.dates,
    ]
    for (const c of candidates) {
      if (!Array.isArray(c) || !c.length) continue
      const dates = c
        .map((x) => {
          if (typeof x === 'string' || x instanceof Date) return toValidDate(x)
          if (x && typeof x === 'object') return toValidDate(x.date || x.day || x.value)
          return null
        })
        .filter(Boolean)
      if (dates.length) return dates
    }
    return []
  }

  const buildScheduleLineFromBooking = ({ booking, unitKey, daysCount, monthsCount, hoursTotal }) => {
    const b = booking || {}

    if (unitKey === 'month') {
      const m = Number(monthsCount)
      if (Number.isFinite(m) && m > 0) {
        return `Contrate por ${m} ${m === 1 ? 'mês' : 'meses'}`
      }
      return 'Contrate por mês'
    }

    if (unitKey === 'hour') {
      if (hoursTotal) return `Contrate por ${formatHoursPt(hoursTotal)}`
      return 'Contrate por hora'
    }

    if (unitKey === 'event') {
      return 'Contrate por evento'
    }

    const d = Number(daysCount)
    const selected = getSelectedDatesFromBooking(b)
    if (Number.isFinite(d) && d > 0 && selected.length) {
      const shown = selected.slice(0, 4).map((dt) => formatDayMonthPt(dt)).filter(Boolean)
      const suffix = selected.length > shown.length ? ', ...' : ''
      const datesText = shown.length ? ` (${shown.join(', ')}${suffix})` : ''
      return `Contrate por ${d} dia${d === 1 ? '' : 's'}${datesText}`
    }

    if (Number.isFinite(d) && d > 0) {
      return `Contrate por ${d} dia${d === 1 ? '' : 's'}`
    }

    const start = toValidDate(b.start_date || b.startDate || b.scheduled_date || b.scheduledDate)
    const end = toValidDate(b.end_date || b.endDate)
    if (start && end) return `${formatDatePt(start)} - ${formatDatePt(end)}`
    if (start) return formatDatePt(start)
    return 'Selecione uma agenda para ver a estimativa'
  }

  const parseAllBRDatesFromText = (text) => {
    const t = String(text || '')
    if (!t) return []
    const matches = t.match(/\b(\d{2}\/\d{2}\/\d{4})\b/g) || []
    const out = []
    for (const s of matches) {
      const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
      if (!m) continue
      const d = Number(m[1])
      const mo = Number(m[2])
      const y = Number(m[3])
      if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) continue
      const dt = new Date(y, mo - 1, d)
      if (!Number.isNaN(dt.getTime())) out.push(dt)
    }
    return out
  }

  const addDays = (date, days) => {
    const d = toValidDate(date)
    const n = Number(days)
    if (!d || !Number.isFinite(n)) return null
    const out = new Date(d)
    out.setDate(out.getDate() + n)
    return Number.isNaN(out.getTime()) ? null : out
  }

  const computeEndDate = (booking, daysCount) => {
    const b = booking || {}

    // 1) Explicit end date from DB
    const explicit =
      toValidDate(b.end_date || b.endDate) ||
      toValidDate(b.end_at || b.endAt) ||
      toValidDate(b.ends_at || b.endsAt)
    if (explicit) return explicit

    // 2) Selected days array (pick max)
    const candidates = [
      b.selected_dates,
      b.selectedDates,
      b.selected_days,
      b.selectedDays,
      b.days_selected,
      b.daysSelected,
      b.dates_selected,
      b.datesSelected,
      b.work_dates,
      b.workDates,
      b.work_days,
      b.workDays,
      b.schedule_dates,
      b.scheduleDates,
      b.schedule_days,
      b.scheduleDays,
      b.agenda_dates,
      b.agendaDates,
      b.agenda_days,
      b.agendaDays,
      b.days,
      b.dates,
    ]
    for (const c of candidates) {
      if (!Array.isArray(c) || !c.length) continue
      const dates = c
        .map((x) => {
          if (typeof x === 'string' || x instanceof Date) return toValidDate(x)
          if (x && typeof x === 'object') return toValidDate(x.date || x.day || x.value)
          return null
        })
        .filter(Boolean)
      if (!dates.length) continue
      dates.sort((a, b2) => a.getTime() - b2.getTime())
      return dates[dates.length - 1]
    }

    // 3) Start date + duration days
    const start =
      toValidDate(b.start_date || b.startDate) ||
      toValidDate(b.scheduled_date || b.scheduledDate)
    if (start && Number.isFinite(daysCount) && daysCount > 0) {
      return addDays(start, Number(daysCount) - 1)
    }

    // 4) Parse last BR date from notes (often lists each day)
    const parsed = parseAllBRDatesFromText(b.notes)
    if (parsed.length) {
      parsed.sort((a, b2) => a.getTime() - b2.getTime())
      return parsed[parsed.length - 1]
    }

    return null
  }

  const pickNumber = (...values) => {
    for (const v of values) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) return n
    }
    return null
  }

  const toValidDate = (raw) => {
    if (!raw) return null
    try {
      if (raw instanceof Date) {
        if (Number.isNaN(raw.getTime())) return null
        return raw
      }

      // Treat schedule-like timestamps as date-only to avoid timezone shifting the day.
      const iso = extractIsoDateOnly(raw)
      if (iso) {
        const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (m) {
          const y = Number(m[1])
          const mo = Number(m[2])
          const d = Number(m[3])
          const dt = new Date(y, mo - 1, d)
          return Number.isNaN(dt.getTime()) ? null : dt
        }
      }

      const d = new Date(raw)
      if (Number.isNaN(d.getTime())) return null
      return d
    } catch {
      return null
    }
  }

  const daysBetweenInclusive = (startRaw, endRaw) => {
    const s = toValidDate(startRaw)
    const e = toValidDate(endRaw)
    if (!s || !e) return null
    const startUtc = Date.UTC(s.getFullYear(), s.getMonth(), s.getDate())
    const endUtc = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate())
    const diff = Math.floor((endUtc - startUtc) / 86400000) + 1
    if (!Number.isFinite(diff) || diff < 1) return null
    if (diff > 3660) return null
    return diff
  }

  const parseDurationFromText = (text) => {
    const t = String(text || '').trim()
    if (!t) return null
    // Examples: "(10 dias)", "10 dias", "(2 meses)", "2 mês"
    const m = t.match(/\b(\d{1,4})\s*(dias?|meses?|m[eê]s)\b/i)
    if (!m) return null
    const count = Number(m[1])
    if (!Number.isFinite(count) || count <= 0) return null
    const unitRaw = String(m[2] || '').toLowerCase()
    const isMonth = unitRaw.startsWith('mes') || unitRaw.startsWith('mês') || unitRaw.startsWith('mê')
    return { count, unit: isMonth ? 'month' : 'day' }
  }

  const stripPaymentLines = (text) => {
    const t = String(text || '')
    if (!t) return ''
    return t
      .split(/\r?\n/)
      .filter((line) => !/^\s*pagamento\s*:\s*/i.test(line))
      .join('\n')
      .trim()
  }

  const looksLikeScheduleText = (text) => {
    const t = String(text || '').toLowerCase()
    if (!t) return false
    // Dates / time ranges / common schedule phrases
    if (/\b\d{2}\/\d{2}\/\d{4}\b/.test(t)) return true
    if (/\b\d{1,2}:\d{2}\s*(?:[-–]|a\s*s|às|as|a|at[eé]|ate)\s*\d{1,2}:\d{2}\b/.test(t)) return true
    if (t.includes('dias e horarios') || t.includes('dias e horários')) return true
    return false
  }

  const stripScheduleLines = (text) => {
    const t = String(text || '')
    if (!t) return ''
    const lines = t.split(/\r?\n/)
    const kept = []
    for (const line of lines) {
      const s = String(line || '').trim()
      if (!s) continue
      const low = s.toLowerCase()
      if (/\b\d{2}\/\d{2}\/\d{4}\b/.test(low)) continue
      if (/\b\d{1,2}:\d{2}\s*(?:[-–]|a\s*s|às|as|a|at[eé]|ate)\s*\d{1,2}:\d{2}\b/i.test(s)) continue
      if (/^\s*(dias\s*e\s*hor[aá]rios?)\s*:?\s*$/i.test(s)) continue
      kept.push(s)
    }
    return kept.join('\n').trim()
  }

  const extractClientDescription = (booking) => {
    const b = booking || {}
    const notesRaw = stripPaymentLines(b.notes)
    if (notesRaw) {
      const mObs = notesRaw.match(/\b(?:observa(?:ç|c)[\p{L}]*(?:\s+[\p{L}]+)*|obs)\s*:\s*([\s\S]+)$/iu)
      const pickedObs = String(mObs?.[1] || '').trim()
      if (pickedObs) return pickedObs

      const mDet = notesRaw.match(/\b(?:detalhes?|descri(?:c|ç)[\p{L}]*(?:\s+[\p{L}]+)*)\s*:\s*([\s\S]+)$/iu)
      const pickedDet = String(mDet?.[1] || '').trim()
      if (pickedDet) return pickedDet

      // If notes include schedule + description without tags, strip schedule-like lines.
      if (looksLikeScheduleText(notesRaw)) {
        const stripped = stripScheduleLines(notesRaw)
        if (stripped) return stripped
      }
    }

    // Prefer explicit client fields next (schemas may have dedicated columns).
    const candidates = [
      b.job_description,
      b.jobDescription,
      b.client_description,
      b.clientDescription,
      b.request_description,
      b.requestDescription,
      b.service_request_description,
      b.serviceRequestDescription,
      b.client_notes,
      b.clientNotes,
      b.client_message,
      b.clientMessage,
      b.observations,
      b.observacao,
      b.observacoes,
      b.obs,
    ]
    for (const c of candidates) {
      const s = String(c || '').trim()
      if (s) return s
    }

    // De-prioritize generic fields that frequently contain non-description values.
    for (const c of [b.description, b.message]) {
      const s = String(c || '').trim()
      if (!s) continue
      if (looksLikeScheduleText(s)) continue
      return s
    }

    // Fallback: use notes only if they don't look like schedule text.
    if (!notesRaw) return ''
    if (looksLikeScheduleText(notesRaw)) return ''
    return notesRaw
  }

  const isMissingColumnError = (error, columnName) => {
    const msgRaw = String(error?.message || error || '')
    const msg = msgRaw.toLowerCase()
    const col = String(columnName || '').trim().toLowerCase()

    if (String(error?.code || '') === '42703') return true
    if (msg.includes('column') && msg.includes('does not exist')) return true
    if (col && msg.includes(`column "${col}"`)) return true
    if (col && msg.includes(`column '${col}'`)) return true
    return false
  }

  const isPermissionDeniedError = (error) => {
    const code = String(error?.code || '')
    const status = Number(error?.status || error?.statusCode || 0)
    const msg = String(error?.message || error || '').toLowerCase()
    return code === '42501' || status === 403 || msg.includes('permission denied') || msg.includes('insufficient privilege')
  }

  const safeMediaSrc = (value) => {
    const s = String(value || '').trim()
    if (!s) return ''
    if (s.startsWith('storage://')) return ''
    return s
  }

  const resolveAvatarsForProfiles = async (profiles) => {
    const list = Array.isArray(profiles) ? profiles : []
    if (!list.length) return

    const tasks = []
    for (const p of list) {
      const id = String(p?.id || '').trim()
      if (!id) continue
      if (resolvedAvatarUrlByUserId?.[id]) continue
      const raw = String(p?.avatar || '').trim()
      if (!raw) continue
      tasks.push({ id, raw })
    }
    if (!tasks.length) return

    try {
      const results = await Promise.all(
        tasks.map(async (t) => {
          const url = await resolveStorageUrl(t.raw, {
            expiresIn: 3600,
            preferPublic: true,
            debugLabel: 'workRequests:avatar',
          })
          return { id: t.id, url }
        })
      )

      setResolvedAvatarUrlByUserId((prev) => {
        const next = { ...(prev || {}) }
        for (const r of results) {
          if (r?.id && r?.url) next[r.id] = r.url
        }
        return next
      })
    } catch {
      // silencioso
    }
  }

  const getBookingDaysCount = (booking) => {
    const b = booking || {}
    const arrayCandidates = [
      b.selected_dates,
      b.selectedDates,
      b.selected_days,
      b.selectedDays,
      b.days_selected,
      b.daysSelected,
      b.dates_selected,
      b.datesSelected,
      b.work_dates,
      b.workDates,
      b.work_days,
      b.workDays,
      b.schedule_dates,
      b.scheduleDates,
      b.schedule_days,
      b.scheduleDays,
      b.agenda_dates,
      b.agendaDates,
      b.agenda_days,
      b.agendaDays,
      b.days,
      b.dates,
    ]
    for (const c of arrayCandidates) {
      if (Array.isArray(c) && c.length) return c.length
    }

    const byField =
      pickNumber(
        b.total_days,
        b.totalDays,
        b.days_count,
        b.daysCount,
        b.duration_days,
        b.durationDays
      ) || null
    if (byField) return byField

    const byRange = daysBetweenInclusive(
      b.start_date || b.startDate || b.scheduled_date || b.scheduledDate,
      b.end_date || b.endDate
    )
    if (byRange) return byRange

    const parsed = parseDurationFromText(b.notes)
    if (parsed?.unit === 'day') return parsed.count

    return null
  }

  const getBookingMonthsCount = (booking) => {
    const b = booking || {}
    const arrayCandidates = [b.selected_months, b.selectedMonths, b.months, b.month_list, b.monthList]
    for (const c of arrayCandidates) {
      if (Array.isArray(c) && c.length) return c.length
    }

    const byField =
      pickNumber(
        b.total_months,
        b.totalMonths,
        b.months_count,
        b.monthsCount,
        b.duration_months,
        b.durationMonths
      ) || null
    if (byField) return byField

    const parsed = parseDurationFromText(b.notes)
    if (parsed?.unit === 'month') return parsed.count

    return null
  }

  const isMonthlyPriceUnit = (rawUnit) => {
    const u = String(rawUnit || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
    return u === 'mes' || u === 'mês' || u === 'month' || u.includes('mes') || u.includes('month')
  }

  const normalizePriceUnitKey = (rawUnit) => {
    const u = String(rawUnit || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')

    if (!u) return ''
    if (u === 'hora' || u === 'hour' || u.includes('hora') || u.includes('hour')) return 'hour'
    if (u === 'dia' || u === 'day' || u.includes('dia') || u.includes('day')) return 'day'
    if (isMonthlyPriceUnit(u)) return 'month'
    if (u === 'evento' || u === 'event' || u.includes('evento') || u.includes('event')) return 'event'
    return ''
  }

  const timeToMinutesHHMM = (hhmm) => {
    const raw = String(hhmm || '').trim().toLowerCase()
    if (!raw) return null

    // Supports: 08:30, 8:30, 8h, 8h30, 08h30
    const m = raw.match(/^(\d{1,2})(?::|h)(\d{2})?$/)
    if (!m) return null
    const h = Number(m[1])
    const mi = m[2] == null ? 0 : Number(m[2])
    if (!Number.isFinite(h) || !Number.isFinite(mi)) return null
    if (h < 0 || h > 23 || mi < 0 || mi > 59) return null
    return h * 60 + mi
  }

  const sumMinutesFromTimeRanges = (text) => {
    const t = String(text || '')
    if (!t) return 0

    // Supports: 08:00 - 18:00 | 08:00 às 18:00 | 08:00 as 18:00 | 08:00 até 18:00 | 8h30 às 12h
    const re = /\b(\d{1,2}(?::\d{2}|h\d{0,2}))\s*(?:[-–]|a\s*s|às|as|a|at[eé]|ate)\s*(\d{1,2}(?::\d{2}|h\d{0,2}))\b/gi
    const matches = Array.from(t.matchAll(re))
    if (!matches.length) return 0
    let minutes = 0
    for (const m of matches) {
      const s = timeToMinutesHHMM(m[1])
      const e = timeToMinutesHHMM(m[2])
      if (s == null || e == null) continue
      if (e >= s) minutes += e - s
      else minutes += 24 * 60 - s + e
    }
    return minutes
  }

  const parseLocaleNumber = (value) => {
    const raw = String(value ?? '').trim()
    if (!raw) return null
    const cleaned = raw
      .replace(/\s+/g, '')
      .replace(/\.(?=\d{3}(?:\D|$))/g, '')
      .replace(',', '.')
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }

  const extractExplicitTotalHoursFromText = (text) => {
    const t = String(text || '')
    if (!t) return null

    const patterns = [
      /\btotal\s*(?:estimad[ao]\s*)?(?:de\s*)?horas?\s*[:=-]\s*(\d+(?:[\.,]\d+)?)\s*(?:h|horas?)?\b/i,
      /\bhoras?\s*(?:totais|no\s*total)\s*[:=-]?\s*(\d+(?:[\.,]\d+)?)\b/i,
      /\btotal\s*[:=-]\s*(\d+(?:[\.,]\d+)?)\s*h\b/i,
      /\b(\d+(?:[\.,]\d+)?)\s*h\s*(?:totais|no\s*total)\b/i,
    ]
    for (const re of patterns) {
      const m = t.match(re)
      const n = parseLocaleNumber(m?.[1])
      if (n != null && n > 0) return n
    }
    return null
  }

  const extractPerDayHoursFromText = (text) => {
    const t = String(text || '')
    if (!t) return null
    const m = t.match(/\b(\d+(?:[\.,]\d+)?)\s*(?:h|horas?)\s*(?:por|p\/?)\s*dia\b/i)
    const n = parseLocaleNumber(m?.[1])
    if (n != null && n > 0) return n
    return null
  }

  const roundHours = (hours) => {
    const h = Number(hours)
    if (!Number.isFinite(h) || h <= 0) return null
    const rounded = Math.round(h * 10) / 10
    if (!Number.isFinite(rounded) || rounded <= 0) return null
    return rounded
  }

  const formatHoursPt = (hours) => {
    const h = Number(hours)
    if (!Number.isFinite(h) || h <= 0) return ''
    const isInt = Math.abs(h - Math.round(h)) < 0.00001
    if (isInt) return `${Math.round(h)}h`
    return `${String(h).replace('.', ',')}h`
  }

  const getTotalHoursFromBooking = (booking, daysCount) => {
    const b = booking || {}

    const byField =
      pickNumber(
        b.total_hours,
        b.totalHours,
        b.hours_total,
        b.hoursTotal,
        b.estimated_hours,
        b.estimatedHours,
        b.duration_hours,
        b.durationHours
      ) || null
    if (byField) return roundHours(byField)

    // Notes may include explicit totals, e.g. "Total estimado de horas: 220h".
    const explicitTotal = extractExplicitTotalHoursFromText(b.notes)
    if (explicitTotal) return roundHours(explicitTotal)

    // Notes may include per-day hours, e.g. "8h por dia".
    const perDayFromNotes = extractPerDayHoursFromText(b.notes)
    if (perDayFromNotes && Number.isFinite(Number(daysCount)) && Number(daysCount) > 0) {
      return roundHours(Number(perDayFromNotes) * Number(daysCount))
    }

    // Notes often list each day with ranges; sum all occurrences.
    const notesMinutes = sumMinutesFromTimeRanges(b.notes)
    if (notesMinutes > 0) return roundHours(notesMinutes / 60)

    // scheduled_time can be per-day; multiply by days.
    const perDayMinutes = sumMinutesFromTimeRanges(b.scheduled_time || b.scheduledTime)
    if (perDayMinutes > 0 && Number.isFinite(daysCount) && daysCount > 0) {
      return roundHours((perDayMinutes / 60) * daysCount)
    }

    return null
  }

  const computeTotalFromUnit = ({ unitKey, basePrice, daysCount, monthsCount, hoursTotal }) => {
    const price = Number(basePrice)
    if (!Number.isFinite(price) || price <= 0) return null

    if (unitKey === 'hour') {
      const h = Number(hoursTotal)
      if (!Number.isFinite(h) || h <= 0) return null
      return Math.round(price * h * 100) / 100
    }

    if (unitKey === 'day') {
      const d = Number(daysCount)
      const qty = Number.isFinite(d) && d > 0 ? d : 1
      return Math.round(price * qty * 100) / 100
    }

    if (unitKey === 'month') {
      const m = Number(monthsCount)
      const qty = Number.isFinite(m) && m > 0 ? m : 1
      return Math.round(price * qty * 100) / 100
    }

    // event / fixed
    return Math.round(price * 100) / 100
  }

  const pickBookingTotalCandidate = (booking) => {
    const b = booking || {}
    const n = Number(
      b.total_price ??
        b.totalPrice ??
        b.total_value ??
        b.totalValue ??
        b.amount_total ??
        b.amountTotal
    )
    return Number.isFinite(n) && n > 0 ? n : null
  }

  const pickBookingAccumulatedCandidate = (booking) => {
    const b = booking || {}
    const n = Number(
      b.total_amount ??
        b.totalAmount ??
        b.worked_amount ??
        b.workedAmount ??
        b.earned_amount ??
        b.earnedAmount
    )
    return Number.isFinite(n) && n > 0 ? n : null
  }

  const formatKmPt = (km) => {
    const n = Number(km)
    if (!Number.isFinite(n) || n <= 0) return ''
    return `${String(n).replace('.', ',')} km`
  }

  const buildLocationLine = (booking) => {
    const b = booking || {}
    const place =
      String(b.work_area || b.workArea || b.city || b.location || b.location_name || '').trim() ||
      ''
    const km = pickNumber(b.distance_km, b.distanceKm, b.distance)
    const kmText = formatKmPt(km)
    if (!place && !kmText) return ''
    if (place && kmText) return `${place} · ${kmText}`
    return place || kmText
  }

  const getViewerMediaList = () => {
    const requestId = String(activeMediaViewer?.requestId || '').trim()
    if (!requestId) return []
    const list = requestMediaByRequestId?.[requestId]
    return Array.isArray(list) ? list : []
  }

  const getViewerIndex = () => {
    const list = getViewerMediaList()
    const activeId = String(activeMediaViewer?.mediaId || '').trim()
    if (!activeId) return -1
    return list.findIndex((x) => String(x?.id || '') === activeId)
  }

  const goViewerToIndex = (idx) => {
    const list = getViewerMediaList()
    if (list.length === 0) return
    const nextIndex = Math.max(0, Math.min(list.length - 1, Number(idx)))
    const next = list[nextIndex]
    if (!next?.id) return
    setViewerPlaybackRate(1)
    setActiveMediaViewer((prev) =>
      prev
        ? {
            ...prev,
            mediaId: next.id,
            mediaType: next.mediaType,
            caption: next.caption || '',
          }
        : prev
    )
  }

  const goViewerPrev = () => {
    const idx = getViewerIndex()
    if (idx <= 0) return
    goViewerToIndex(idx - 1)
  }

  const goViewerNext = () => {
    const idx = getViewerIndex()
    const list = getViewerMediaList()
    if (idx < 0) return
    if (idx >= list.length - 1) return
    goViewerToIndex(idx + 1)
  }

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

  const cacheKey = useMemo(() => {
    const userId = user?.id
    return userId ? `joby:workRequests:v1:${userId}` : null
  }, [user?.id])

  const readCache = () => {
    if (!cacheKey) return null
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(cacheKey)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return null
      const recebidos = Array.isArray(parsed?.recebidos) ? parsed.recebidos : []
      const enviados = Array.isArray(parsed?.enviados) ? parsed.enviados : []
      const updatedAt = typeof parsed?.updatedAt === 'number' ? parsed.updatedAt : null
      return { recebidos, enviados, updatedAt }
    } catch (_e) {
      return null
    }
  }

  const writeCache = ({ recebidos, enviados }) => {
    if (!cacheKey) return
    if (typeof window === 'undefined') return
    try {
      const payload = {
        recebidos: Array.isArray(recebidos) ? recebidos : [],
        enviados: Array.isArray(enviados) ? enviados : [],
        updatedAt: Date.now(),
      }
      window.localStorage.setItem(cacheKey, JSON.stringify(payload))
      setCacheUpdatedAt(payload.updatedAt)
    } catch (_e) {
      // silencioso
    }
  }

  const handleTabChange = (nextTab) => {
    setActiveTab(nextTab)
    setActiveStatus('all')
  }

  const TAB_ORDER = ['recebidos', 'enviados']
  const swipeTabs = useSwipeTabs({
    tabs: TAB_ORDER,
    value: activeTab,
    onValueChange: handleTabChange,
  })

  // Scroll para o topo ao montar o componente
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    if (user?.id) {
      const cached = readCache()
      if (cached) {
        setRequestsRecebidos(cached.recebidos)
        setRequestsEnviados(cached.enviados)
        setCacheUpdatedAt(cached.updatedAt)
        setLoading(false)
      }
      loadRequests()

      // Estilo apps grandes: ao abrir a tela de Solicitações,
      // considera as notificações de solicitação como lidas.
      ;(async () => {
        try {
          await markNotificationsReadByType({ userId: user.id, type: 'work_request' })
        } catch (_e) {
          // silencioso
        }
      })()
    } else if (!authLoading) {
      setLoading(false)
    }
  }, [user?.id, authLoading])

  const loadRequests = async () => {
    if (!user?.id) {
      setLoadError('Sessão expirada. Faça login novamente.')
      setRequestsRecebidos([])
      setRequestsEnviados([])
      setLoading(false)
      setLoadingRecebidos(false)
      setLoadingEnviados(false)
      return
    }

    if (loadRequestsInFlightRef.current) return
    loadRequestsInFlightRef.current = true
    const userId = user.id
    setLoading(true)
    setLoadError(null)
    setLoadingRecebidos(true)
    setLoadingEnviados(true)
    try {
      const loadRecebidos = async () => {
        const selectVariants = [
          `
            *,
            client:client_id(id, username, name, avatar, rating, is_verified, created_at, joby_since_year),
            service:service_id(title, price, price_unit)
          `,
          `
            *,
            client:client_id(id, username, name, avatar, rating, is_verified, created_at),
            service:service_id(title, price, price_unit)
          `,
          `
            *,
            client:client_id(id, username, name, avatar, created_at),
            service:service_id(title, price, price_unit)
          `,
          `
            *,
            client:client_id(id, name, avatar),
            service:service_id(title, price, price_unit)
          `,
        ]

        let lastError = null
        let recebidas = null
        for (const sel of selectVariants) {
          const res = await supabase
            .from('bookings')
            .select(sel)
            .eq('professional_id', userId)
            .order('created_at', { ascending: false })
          if (!res?.error) {
            recebidas = res?.data || []
            lastError = null

            if (import.meta.env.DEV) {
              const priorityRequestId = String(routeRequestId || '').trim()
              if (priorityRequestId) {
                const match =
                  (recebidas || []).find(
                    (b) => String(b?.id || '').trim() === priorityRequestId
                  ) || null
                log.debug('REQUESTS', 'db_received_route_match', {
                  ...requestsTrace(priorityRequestId),
                  match,
                })
              } else {
                log.debug(
                  'REQUESTS',
                  'REQUESTS RECEBIDAS DO BANCO (count)',
                  { ...requestsTrace(null), count: Array.isArray(recebidas) ? recebidas.length : 0 }
                )
              }
            }

            break
          }
          lastError = res.error
          if (!isMissingColumnError(res.error) && !isPermissionDeniedError(res.error)) break
        }

        if (lastError) throw lastError

        const formattedRecebidas =
          recebidas?.map((booking) => ({
            id: booking.id,
            booking,
            title: booking.service?.title || 'Serviço',
            clientName: booking.client?.username ? `@${booking.client.username}` : booking.client?.name,
            status: booking.status,
            statusLabel: getStatusLabel(booking.status),
            type: formatPriceUnit(booking.service?.price_unit || 'hora', { prefix: true }),
            date: booking.scheduled_date ? formatDatePt(booking.scheduled_date) : '-',
            value: booking.total_price || 0,
          })) || []

        // Resolve avatars for embedded profiles (non-blocking)
        resolveAvatarsForProfiles(recebidas?.map((b) => b?.client).filter(Boolean))

        setRequestsRecebidos(formattedRecebidas)
        writeCache({
          recebidos: formattedRecebidas,
          enviados: latestEnviadosRef.current,
        })
        return formattedRecebidas
      }

      const loadEnviados = async () => {
        const selectVariants = [
          `
            *,
            professional:professional_id(id, username, name, avatar, profession, rating, is_verified, created_at, joby_since_year),
            service:service_id(title, price, price_unit)
          `,
          `
            *,
            professional:professional_id(id, username, name, avatar, profession, rating, is_verified, created_at),
            service:service_id(title, price, price_unit)
          `,
          `
            *,
            professional:professional_id(id, username, name, avatar, profession, created_at),
            service:service_id(title, price, price_unit)
          `,
          `
            *,
            professional:professional_id(id, name, profession, avatar),
            service:service_id(title, price, price_unit)
          `,
        ]

        let lastError = null
        let enviadas = null
        for (const sel of selectVariants) {
          const res = await supabase
            .from('bookings')
            .select(sel)
            .eq('client_id', userId)
            .order('created_at', { ascending: false })
          if (!res?.error) {
            enviadas = res?.data || []
            lastError = null

            if (import.meta.env.DEV) {
              const priorityRequestId = String(routeRequestId || '').trim()
              if (priorityRequestId) {
                const match =
                  (enviadas || []).find(
                    (b) => String(b?.id || '').trim() === priorityRequestId
                  ) || null
                log.debug('REQUESTS', 'db_sent_route_match', {
                  ...requestsTrace(priorityRequestId),
                  match,
                })
              } else {
                log.debug(
                  'REQUESTS',
                  'REQUESTS ENVIADAS DO BANCO (count)',
                  { ...requestsTrace(null), count: Array.isArray(enviadas) ? enviadas.length : 0 }
                )
              }
            }

            break
          }
          lastError = res.error
          if (!isMissingColumnError(res.error) && !isPermissionDeniedError(res.error)) break
        }

        if (lastError) throw lastError

        const formattedEnviadas =
          enviadas?.map((booking) => ({
            id: booking.id,
            booking,
            title: booking.service?.title || 'Serviço',
            clientName: booking.professional?.username
              ? `@${booking.professional.username}`
              : booking.professional?.name,
            status: booking.status,
            statusLabel: getStatusLabel(booking.status),
            type: formatPriceUnit(booking.service?.price_unit || 'hora', { prefix: true }),
            date: booking.scheduled_date ? formatDatePt(booking.scheduled_date) : '-',
            value: booking.total_price || 0,
          })) || []

        // Resolve avatars for embedded profiles (non-blocking)
        resolveAvatarsForProfiles(enviadas?.map((b) => b?.professional).filter(Boolean))

        setRequestsEnviados(formattedEnviadas)
        writeCache({
          recebidos: latestRecebidosRef.current,
          enviados: formattedEnviadas,
        })
        return formattedEnviadas
      }

      const recebidosPromise = loadRecebidos().catch((error) => {
        log.error('REQUESTS', 'load_received_failed', { ...requestsTrace(null), error })
        setRequestsRecebidos([])
        setLoadError((prev) =>
          prev ||
          (import.meta.env.DEV
            ? String(error?.message || error)
            : 'Não foi possível carregar suas solicitações agora.')
        )
      }).finally(() => {
        setLoadingRecebidos(false)
      })

      const enviadosPromise = loadEnviados().catch((error) => {
        log.error('REQUESTS', 'load_sent_failed', { ...requestsTrace(null), error })
        setRequestsEnviados([])
        setLoadError((prev) =>
          prev ||
          (import.meta.env.DEV
            ? String(error?.message || error)
            : 'Não foi possível carregar suas solicitações agora.')
        )
      }).finally(() => {
        setLoadingEnviados(false)
      })

      await Promise.allSettled([recebidosPromise, enviadosPromise])
    } catch (error) {
      log.error('REQUESTS', 'load_requests_failed', { ...requestsTrace(null), error })
      setLoadError(
        import.meta.env.DEV
          ? String(error?.message || error)
          : 'Não foi possível carregar suas solicitações agora.'
      )
      setRequestsRecebidos([])
      setRequestsEnviados([])
    } finally {
      setLoading(false)
      setLoadingRecebidos(false)
      setLoadingEnviados(false)
      loadRequestsInFlightRef.current = false

      if (loadRequestsPendingRef.current) {
        loadRequestsPendingRef.current = false
        try {
          if (typeof queueMicrotask === 'function') {
            queueMicrotask(() => loadRequests())
          } else {
            Promise.resolve().then(() => loadRequests())
          }
        } catch {
          // ignore
        }
      }
    }
  }

  useEffect(() => {
    if (!user?.id) return

    const client = supabase
    const enableRealtime =
      String(import.meta?.env?.VITE_ENABLE_SUPABASE_REALTIME).toLowerCase().trim() === 'true'

    const shouldTrigger = () => {
      const now = Date.now()
      if (now - (lastAutoRefreshAtRef.current || 0) < 1000) return false
      lastAutoRefreshAtRef.current = now
      return true
    }

    const triggerRefresh = () => {
      if (loadRequestsInFlightRef.current) {
        loadRequestsPendingRef.current = true
        return
      }
      if (!shouldTrigger()) return
      loadRequests()
    }

    let channelProfessional = null
    let channelClient = null
    let intervalId = null

    if (enableRealtime) {
      const userId = String(user.id)

      channelProfessional = client
        .channel(`work-requests:bookings:professional:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookings',
            filter: `professional_id=eq.${userId}`,
          },
          () => triggerRefresh()
        )
        .subscribe()

      channelClient = client
        .channel(`work-requests:bookings:client:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookings',
            filter: `client_id=eq.${userId}`,
          },
          () => triggerRefresh()
        )
        .subscribe()
    } else {
      const onFocus = () => triggerRefresh()
      const onVisibility = () => {
        if (document.visibilityState === 'visible') triggerRefresh()
      }

      window.addEventListener('focus', onFocus)
      document.addEventListener('visibilitychange', onVisibility)
      intervalId = window.setInterval(() => triggerRefresh(), 30_000)

      return () => {
        try {
          window.removeEventListener('focus', onFocus)
          document.removeEventListener('visibilitychange', onVisibility)
          if (intervalId) window.clearInterval(intervalId)
        } catch {
          // ignore
        }
      }
    }

    return () => {
      try {
        if (channelProfessional) {
          try {
            channelProfessional.unsubscribe?.()
          } catch {
            // ignore
          }
          client.removeChannel(channelProfessional)
        }
        if (channelClient) {
          try {
            channelClient.unsubscribe?.()
          } catch {
            // ignore
          }
          client.removeChannel(channelClient)
        }
        if (intervalId) window.clearInterval(intervalId)
      } catch {
        // ignore
      }
    }
  }, [user?.id, realtimeResetKey])

  const getStatusLabel = (status) => {
    const labels = {
      pending: 'Pendente',
      accepted: 'Aceita',
      rejected: 'Recusada',
      completed: 'Concluída',
      cancelled: 'Cancelada',
      archived: 'Arquivada',
    }
    return labels[status] || status
  }

  const updateBookingStatus = async ({ bookingId, nextStatus }) => {
    if (!user?.id) return
    if (!bookingId || !nextStatus) return
    if (updatingId) return

    setUpdatingId(bookingId)
    try {
      let query = supabase
        .from('bookings')
        .update({ status: nextStatus })
        .eq('id', bookingId)

      // Proteção client-side: só atualiza booking que pertence ao usuário
      if (activeTab === 'recebidos') query = query.eq('professional_id', user.id)
      if (activeTab === 'enviados') query = query.eq('client_id', user.id)

      const { data, error } = await query.select('id, status')
      if (error) throw error

      // Se nenhuma linha foi atualizada (ex.: filtros extras não bateram ou RLS), trate como erro.
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Não foi possível atualizar esta solicitação agora.')
      }

      // Atualiza imediatamente a UI para refletir a mudança no filtro/contagem.
      const updated = data[0]
      const updatedStatus = String(updated?.status || nextStatus)
      const updateLocal = (prev) =>
        (prev || []).map((r) =>
          String(r?.id) === String(bookingId)
            ? {
                ...r,
                status: updatedStatus,
                statusLabel: getStatusLabel(updatedStatus),
                booking: {
                  ...(r?.booking || {}),
                  status: updatedStatus,
                },
              }
            : r
        )
      setRequestsRecebidos(updateLocal)
      setRequestsEnviados(updateLocal)

      toast({
        title: 'Atualizado!',
        description: `Status alterado para: ${getStatusLabel(nextStatus)}.`,
        variant: 'success',
      })

      await loadRequests()
    } catch (e) {
      log.error('REQUESTS', 'update_status_failed', { ...requestsTrace(updatingId), error: e })
      toast({
        title: 'Erro',
        description: String(e?.message || 'Não foi possível atualizar agora.'),
        variant: 'destructive',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  const openEditRequest = async (request) => {
    const bookingBase = request?.booking || null
    if (!bookingBase) return

    const bookingId = bookingBase?.id
    const professionalBase = bookingBase?.professional || null
    const serviceBase = bookingBase?.service || null
    const serviceId = bookingBase?.service_id || bookingBase?.serviceId || serviceBase?.id

    const professionalId =
      professionalBase?.id || bookingBase?.professional_id || bookingBase?.professionalId

    if (!professionalId || !serviceId || !bookingId) {
      toast({
        title: 'Não foi possível editar',
        description: 'Dados do profissional, serviço ou solicitação estão incompletos.',
        variant: 'destructive',
      })
      return
    }

    // IMPORTANTE: após reload, a lista pode vir do cache (localStorage) com booking incompleto.
    // Buscamos o booking atualizado antes de abrir o modal para garantir prefill.
    let booking = bookingBase
    try {
      const res = await supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .eq('client_id', user?.id)
        .maybeSingle()

      if (res?.data && !res?.error) {
        booking = { ...(bookingBase || {}), ...(res.data || {}) }
      }
    } catch {
      // silencioso (cai no booking do cache)
    }

    const professional = booking?.professional || professionalBase || { id: professionalId }
    const service = booking?.service || serviceBase || { id: serviceId }

    setEditBooking(booking)
    setEditProfessional({ ...(professional || {}), isOwnProfile: false })
    setEditService({ id: serviceId, ...(service || {}) })
    setEditModalOpen(true)
  }



  const removeRequestFromLocalState = (bookingId) => {
    const id = String(bookingId || '').trim()
    if (!id) return

    setRequestsRecebidos((prev) => (prev || []).filter((r) => String(r?.id) !== id))
    setRequestsEnviados((prev) => (prev || []).filter((r) => String(r?.id) !== id))
    setRequestMediaByRequestId((prev) => {
      const next = { ...(prev || {}) }
      delete next[id]
      return next
    })
    setExpandedDetailsById((prev) => {
      const next = { ...(prev || {}) }
      delete next[id]
      return next
    })
  }

  const deleteRequestChatMessages = async (bookingId) => {
    const id = String(bookingId || '').trim()
    if (!id) return

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('request_id', id)

    if (error && !isMissingColumnError(error, 'request_id')) throw error
  }

  const deleteRejectedBooking = async (bookingId) => {
    if (!user?.id) return
    const id = String(bookingId || '').trim()
    if (!id) return
    if (deletingId || updatingId) return

    setOpenMenuRequestId(null)
    removeRequestFromLocalState(id)
    setDeletingId(id)
    try {
      await deleteRequestChatMessages(id)

      let query = supabase
        .from('bookings')
        .delete()
        .eq('id', id)
        .eq('status', 'rejected')

      // Proteção client-side: só deleta booking que pertence ao usuário
      if (activeTab === 'recebidos') query = query.eq('professional_id', user.id)
      if (activeTab === 'enviados') query = query.eq('client_id', user.id)

      const { error } = await query
      if (error) throw error

      toast({
        title: 'Apagado',
        description: 'A solicitação recusada foi apagada (e o chat também).',
        variant: 'success',
      })
    } catch (e) {
      log.error('REQUESTS', 'delete_refused_failed', { ...requestsTrace(deletingId), error: e })
      toast({
        title: 'Erro',
        description: String(e?.message || 'Não foi possível apagar agora.'),
        variant: 'destructive',
      })
      await loadRequests()
    } finally {
      setDeletingId(null)
    }
  }

  const deleteBooking = async ({ bookingId, expectedStatus } = {}) => {
    if (!user?.id) return
    const id = String(bookingId || '').trim()
    if (!id) return
    const status = String(expectedStatus || '').trim()
    if (!status) return
    if (deletingId || updatingId) return

    setOpenMenuRequestId(null)
    removeRequestFromLocalState(id)
    setDeletingId(id)
    try {
      await deleteRequestChatMessages(id)

      let query = supabase
        .from('bookings')
        .delete()
        .eq('id', id)
        .eq('status', status)

      // Proteção client-side: só deleta booking que pertence ao usuário
      if (activeTab === 'recebidos') query = query.eq('professional_id', user.id)
      if (activeTab === 'enviados') query = query.eq('client_id', user.id)

      const { error } = await query
      if (error) throw error

      toast({
        title: 'Apagado',
        description: 'A solicitação foi apagada (e o chat também).',
        variant: 'success',
      })
    } catch (e) {
      log.error('REQUESTS', 'delete_request_failed', { ...requestsTrace(id), error: e })
      toast({
        title: 'Erro',
        description: String(e?.message || 'Não foi possível apagar agora.'),
        variant: 'destructive',
      })
      await loadRequests()
    } finally {
      setDeletingId(null)
    }
  }

  const getStatusStyle = (status) => {
    switch (status) {
      case 'pending':
        return { badge: 'bg-blue-500/10 text-blue-600', Icon: Hourglass }
      case 'accepted':
        return { badge: 'bg-orange-500/10 text-orange-600', Icon: CheckCircle }
      case 'completed':
        return { badge: 'bg-green-500/10 text-green-600', Icon: CheckCircle2 }
      case 'rejected':
        return { badge: 'bg-red-500/10 text-red-600', Icon: XCircle }
      case 'cancelled':
        return { badge: 'bg-gray-500/10 text-gray-600', Icon: Ban }
      case 'archived':
        return { badge: 'bg-muted/40 text-muted-foreground', Icon: Clock }
      default:
        return { badge: 'bg-muted/40 text-muted-foreground', Icon: AlertTriangle }
    }
  }

  const statusCards = [
    {
      id: 'pending',
      label: 'Pendentes',
      count: 3,
      icon: Hourglass,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      id: 'rejected',
      label: 'Recusadas',
      count: 2,
      icon: XCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
    },
    {
      id: 'accepted',
      label: 'Aceitas',
      count: 1,
      icon: CheckCircle,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
    {
      id: 'completed',
      label: 'Concluídas',
      count: 10,
      icon: CheckCircle2,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      id: 'archived',
      label: 'Arquivadas',
      count: 0,
      icon: Clock,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted/40',
    },
    {
      id: 'cancelled',
      label: 'Canceladas',
      count: 0,
      icon: Ban,
      color: 'text-gray-500',
      bgColor: 'bg-gray-500/10',
    },
  ]

  const isArchivedStatus = (status) => {
    const s = String(status || '').toLowerCase()
    return s === 'archived' || s === 'finalized' || s === 'finalised'
  }

  const isCancelledStatus = (status) => {
    const s = String(status || '').toLowerCase()
    return s === 'cancelled' || s === 'canceled'
  }

  // Função para contar solicitações por status
  const getStatusCount = (status) => {
    const requests =
      activeTab === 'recebidos' ? requestsRecebidos : requestsEnviados

    if (status === 'archived') {
      return requests.filter((req) => isArchivedStatus(req.status)).length
    }

    if (status === 'cancelled') {
      return requests.filter((req) => isCancelledStatus(req.status)).length
    }

    return requests.filter((req) => req.status === status).length
  }

  // Atualizar contagens dinamicamente
  const statusCardsWithCounts = statusCards.map((card) => ({
    ...card,
    count: getStatusCount(card.id),
  }))

  // Função para filtrar solicitações
  const getFilteredRequests = () => {
    const requests =
      activeTab === 'recebidos' ? requestsRecebidos : requestsEnviados

    // Por padrão, não misturar arquivadas/canceladas no feed principal.
    if (activeStatus === 'all') {
      return requests.filter((req) => !isArchivedStatus(req.status) && !isCancelledStatus(req.status))
    }

    // Compat: permite que "Arquivadas" capture variações comuns de status.
    if (activeStatus === 'archived') {
      return requests.filter((req) => isArchivedStatus(req.status))
    }

    // Compat: permite que "Canceladas" capture variações comuns de status.
    if (activeStatus === 'cancelled') {
      return requests.filter((req) => isCancelledStatus(req.status))
    }

    return requests.filter((req) => req.status === activeStatus)
  }

  // Função para lidar com clique no card de status
  const handleStatusClick = (statusId) => {
    if (activeStatus === statusId) {
      // Se já está ativo, desativa (mostra todos)
      setActiveStatus('all')
    } else {
      // Ativa o filtro e marca como visualizado
      setActiveStatus(statusId)
    }
  }

  const filteredRequests = getFilteredRequests()
  const isActiveTabLoading =
    activeTab === 'recebidos' ? loadingRecebidos : loadingEnviados
  const activeRequests =
    activeTab === 'recebidos' ? requestsRecebidos : requestsEnviados
  const hasActiveData = activeRequests.length > 0
  const cacheLabel = cacheUpdatedAt
    ? `Última atualização: ${new Date(cacheUpdatedAt).toLocaleString('pt-BR')}`
    : null

  const isDetailsRoute = !!String(routeRequestId || '').trim()
  const detailsRequest = useMemo(() => {
    const id = String(routeRequestId || '').trim()
    if (!id) return null
    const inRecebidos = Array.isArray(requestsRecebidos)
      ? requestsRecebidos.find((r) => String(r?.id || '') === id) || null
      : null
    if (inRecebidos) return { tab: 'recebidos', request: inRecebidos }
    const inEnviados = Array.isArray(requestsEnviados)
      ? requestsEnviados.find((r) => String(r?.id || '') === id) || null
      : null
    if (inEnviados) return { tab: 'enviados', request: inEnviados }
    return null
  }, [routeRequestId, requestsRecebidos, requestsEnviados])

  useOverlayLock(isDetailsRoute || !!activeMediaViewer?.mediaId)

  useEffect(() => {
    if (!isDetailsRoute) return
    if (!detailsRequest?.tab) return
    if (activeTab !== detailsRequest.tab) {
      setActiveTab(detailsRequest.tab)
      setActiveStatus('all')
    }
  }, [isDetailsRoute, detailsRequest?.tab])

  useEffect(() => {
    const bookingId = String(
      detailsRequest?.request?.booking?.id || detailsRequest?.request?.id || ''
    ).trim()
    if (!bookingId) return

    if (workSessionsUnavailableRef.current) return
    if (workSessionsByBookingId?.[bookingId]) return
    if (workSessionsFetchInFlightRef.current?.[bookingId]) return

    workSessionsFetchInFlightRef.current = {
      ...(workSessionsFetchInFlightRef.current || {}),
      [bookingId]: true,
    }

    const isPermissionDeniedErrorLike = (error) => {
      const code = String(error?.code || '')
      const msg = String(error?.message || error || '').toLowerCase()
      if (code === '42501') return true // insufficient_privilege / RLS
      if (code === '401' || code === '403') return true
      return (
        msg.includes('row-level security') ||
        msg.includes('rls') ||
        msg.includes('permission denied') ||
        msg.includes('not allowed')
      )
    }

    const isTableMissingErrorLike = (error) => {
      const code = String(error?.code || '')
      const msg = String(error?.message || error || '').toLowerCase()
      if (code === '42p01') return true // undefined_table
      return msg.includes('does not exist') && msg.includes('work_sessions')
    }

    const isMissingColumnErrorLike = (error) => {
      const code = String(error?.code || '')
      const msg = String(error?.message || error || '').toLowerCase()
      if (code === '42703' || code === 'PGRST204') return true
      return msg.includes('column') && msg.includes('does not exist')
    }

    let cancelled = false

    ;(async () => {
      try {
        const today = new Date()
        const day = today.getDay() // 0=Sun
        const diff = (day + 6) % 7
        const weekStart = new Date(today)
        weekStart.setHours(0, 0, 0, 0)
        weekStart.setDate(weekStart.getDate() - diff)

        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekEnd.getDate() + 5) // Mon..Fri

        const selectVariants = [
          'id, booking_id, started_at, status',
          'id, booking_id, started_at',
        ]

        let rows = null
        let lastError = null
        for (const sel of selectVariants) {
          const res = await supabase
            .from('work_sessions')
            .select(sel)
            .eq('booking_id', bookingId)
            .gte('started_at', weekStart.toISOString())
            .lt('started_at', weekEnd.toISOString())
          if (!res?.error) {
            rows = Array.isArray(res?.data) ? res.data : []
            lastError = null
            break
          }
          lastError = res.error
          if (isTableMissingErrorLike(res.error) || isPermissionDeniedErrorLike(res.error)) break
          if (!isMissingColumnErrorLike(res.error)) break
        }

        if (cancelled) return

        if (lastError) {
          if (isTableMissingErrorLike(lastError) || isPermissionDeniedErrorLike(lastError)) {
            workSessionsUnavailableRef.current = true
            return
          }
          // Silencioso: não bloqueia a tela; apenas não teremos evidência por work_sessions.
          return
        }

        setWorkSessionsByBookingId((prev) => ({
          ...(prev || {}),
          [bookingId]: rows || [],
        }))
      } finally {
        try {
          const next = { ...(workSessionsFetchInFlightRef.current || {}) }
          delete next[bookingId]
          workSessionsFetchInFlightRef.current = next
        } catch {
          // ignore
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [detailsRequest?.request?.id])

  useEffect(() => {
    if (!user?.id) return

    const bookingId = String(
      detailsRequest?.request?.booking?.id || detailsRequest?.request?.id || ''
    ).trim()
    if (!bookingId) return

    if (arrivalConfirmedAtByBookingId?.[bookingId]) return
    if (arrivalConfirmedFetchInFlightRef.current?.[bookingId]) return

    arrivalConfirmedFetchInFlightRef.current = {
      ...(arrivalConfirmedFetchInFlightRef.current || {}),
      [bookingId]: true,
    }

    let cancelled = false

    ;(async () => {
      try {
        const bookingIdStr = bookingId
        const bookingIdNum = Number(bookingIdStr)
        const bookingIdVariants = [bookingIdStr]
        if (Number.isFinite(bookingIdNum)) bookingIdVariants.push(bookingIdNum)

        const selectCols = 'id,data,created_at,type'

        const tryFetch = async (bookingIdValue) => {
          // Prefer audit notification sent to the professional when the client confirms.
          const res1 = await supabase
            .from('notifications')
            .select(selectCols)
            .eq('user_id', user.id)
            .contains('data', { kind: 'work_timer_start_confirmed', booking_id: bookingIdValue })
            .order('created_at', { ascending: false })
            .limit(1)

          if (!res1?.error && Array.isArray(res1?.data) && res1.data.length > 0) {
            const n = res1.data[0]
            const confirmedAt = n?.data?.confirmed_at || n?.created_at || null
            return confirmedAt ? String(confirmedAt) : null
          }

          // Fallback: any notification for this booking with confirmed_at in data.
          const res2 = await supabase
            .from('notifications')
            .select(selectCols)
            .eq('user_id', user.id)
            .eq('type', 'work_request')
            .contains('data', { booking_id: bookingIdValue })
            .order('created_at', { ascending: false })
            .limit(10)

          if (!res2?.error && Array.isArray(res2?.data) && res2.data.length > 0) {
            const withConfirmed = res2.data.find((x) => x?.data?.confirmed_at)
            const n = withConfirmed || res2.data[0]
            const confirmedAt = n?.data?.confirmed_at || null
            return confirmedAt ? String(confirmedAt) : null
          }

          return null
        }

        let confirmedAtIso = null
        for (const v of bookingIdVariants) {
          confirmedAtIso = await tryFetch(v)
          if (confirmedAtIso) break
        }

        if (cancelled) return
        if (!confirmedAtIso) return

        setArrivalConfirmedAtByBookingId((prev) => ({
          ...(prev || {}),
          [bookingId]: confirmedAtIso,
        }))
      } catch {
        // ignore (best-effort)
      } finally {
        try {
          const next = { ...(arrivalConfirmedFetchInFlightRef.current || {}) }
          delete next[bookingId]
          arrivalConfirmedFetchInFlightRef.current = next
        } catch {
          // ignore
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [detailsRequest?.request?.id, user?.id])

  const filteredRequestsForMedia = isDetailsRoute
    ? [
        ...filteredRequests,
        ...(detailsRequest?.request ? [detailsRequest.request] : []),
      ].filter((x, idx, arr) => {
        const id = String(x?.id || '').trim()
        if (!id) return false
        return arr.findIndex((y) => String(y?.id || '').trim() === id) === idx
      })
    : filteredRequests

  useEffect(() => {
    if (!user?.id) return
    if (!serviceMediaTablesReadyRef.current) return

    const requestIds = filteredRequestsForMedia.map((r) => r?.id).filter(Boolean)
    if (requestIds.length === 0) return

    const requestedKey = `${activeTab}|${activeStatus}|${requestIds.join('|')}`
    mediaSignedUrlsLastRequestedKeyRef.current = requestedKey

    if (mediaSignedUrlsInFlightRef.current) {
      mediaSignedUrlsPendingRerunRef.current = true
      return
    }

    let cancelled = false

    const run = async () => {
      try {
        mediaSignedUrlsInFlightRef.current = true
        mediaSignedUrlsProcessingKeyRef.current = requestedKey
        mediaSignedUrlsPendingRerunRef.current = false

        let data = null
        let error = null

        // Preferred schema (caption exists)
        {
          const r = await supabase
            .from('service_request_media')
            .select('id, request_id, media_type, caption, created_at')
            .in('request_id', requestIds)
            .order('created_at', { ascending: true })
          data = r.data
          error = r.error
        }

        // Fallback: caption column missing
        if (error && isMissingColumnError(error)) {
          const r = await supabase
            .from('service_request_media')
            .select('id, request_id, media_type, created_at')
            .in('request_id', requestIds)
            .order('created_at', { ascending: true })
          data = r.data
          error = r.error
        }

        if (error) throw error
        if (cancelled) return

        const rows = Array.isArray(data) ? data : []

        // Prefill instantâneo: se já tivermos signed-url em cache, injeta no state.
        try {
          const prefill = {}
          for (const r of rows) {
            const id = String(r?.id || '').trim()
            if (!id) continue
            if (signedUrlByMediaIdRef.current?.[id]) continue
            if (signedUrlFailedByMediaIdRef.current?.[id]) continue
            const cached = readSignedUrlCache(id)
            if (cached) prefill[id] = cached
          }
          if (Object.keys(prefill).length) {
            setSignedUrlByMediaId((prev) => ({ ...(prev || {}), ...prefill }))
          }
        } catch {
          // ignore
        }

        const grouped = {}
        for (const row of rows) {
          const reqId = String(row?.request_id || '').trim()
          const mediaId = String(row?.id || '').trim()
          if (!reqId || !mediaId) continue
          if (!grouped[reqId]) grouped[reqId] = []
          grouped[reqId].push({
            id: mediaId,
            requestId: reqId,
            mediaType: String(row?.media_type || '').trim() || 'image',
            caption: String(row?.caption || '').trim(),
            createdAt: row?.created_at || null,
          })
        }

        setRequestMediaByRequestId((prev) => ({ ...prev, ...grouped }))

        // GATING: só busca access_token (safeGetSession) se realmente existir mídia sem signed-url.
        const missingNeedSigning = rows
          .map((r) => String(r?.id || '').trim())
          .filter(Boolean)
          .filter((id) => !signedUrlByMediaIdRef.current?.[id])
          .filter((id) => !signedUrlFailedByMediaIdRef.current?.[id])
          .filter((id) => !readSignedUrlCache(id))

        if (!missingNeedSigning.length) return

        // Se o endpoint já foi detectado como indisponível, falha tudo que ainda falta (sem chamar auth).
        if (attachmentsSignedUrlUnavailableRef.current && missingNeedSigning.length) {
          setSignedUrlFailedByMediaId((prev) => {
            const next = { ...(prev || {}) }
            for (const id of missingNeedSigning) next[id] = true
            return next
          })
          return
        }

        let session = null
        try {
          const { data } = await safeGetSession(8000)
          session = data?.session || null
        } catch {
          return
        }

        const accessToken = session?.access_token || null
        if (!accessToken) return

        const missing = Array.from(new Set(missingNeedSigning))

        // Prioriza a solicitação aberta nos detalhes, para as 3 thumbs aparecerem rápido.
        const priorityRequestId = String(routeRequestId || '').trim()
        const priorityIds = priorityRequestId && grouped?.[priorityRequestId]
          ? grouped[priorityRequestId].map((m) => String(m?.id || '').trim()).filter(Boolean)
          : []

        const missingPrioritized = [
          ...priorityIds.filter((id) => missing.includes(id)),
          ...missing.filter((id) => !priorityIds.includes(id)),
        ]

        const candidatesBatch = buildAttachmentsApiUrlCandidates('/api/service-attachments/signed-urls')
        const fetchSignedUrlsBatch = async (mediaIds) => {
          const ids = Array.isArray(mediaIds)
            ? Array.from(new Set(mediaIds.map((v) => String(v || '').trim()).filter(Boolean)))
            : []
          if (!ids.length) return { map: {}, unavailable: false }

          let had404 = false
          for (const endpoint of candidatesBatch) {
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ mediaIds: ids }),
            })

            const text = await response.text()
            let json = null
            try {
              json = text ? JSON.parse(text) : null
            } catch {
              // ignore
            }

            if (!response.ok) {
              if (response.status === 404) had404 = true
              continue
            }

            const map =
              json?.signedUrlsById && typeof json.signedUrlsById === 'object' ? json.signedUrlsById : {}
            return { map, unavailable: false }
          }

          return { map: {}, unavailable: had404 }
        }

        const chunk = (arr, size) => {
          const out = []
          const list = Array.isArray(arr) ? arr : []
          const n = Math.max(1, Number(size) || 50)
          for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
          return out
        }

        // Prefer batch: reduz muito a latência (menos roundtrips)
        let batchUnavailable = false
        const missingChunks = chunk(missingPrioritized, 50)
        for (const ids of missingChunks) {
          if (cancelled) return
          // Evita chamar batch se tudo já estiver em cache/state
          const stillMissing = ids
            .filter((id) => !signedUrlByMediaIdRef.current?.[id])
            .filter((id) => !signedUrlFailedByMediaIdRef.current?.[id])
            .filter((id) => !readSignedUrlCache(id))
          if (!stillMissing.length) continue

          try {
            const { map, unavailable } = await fetchSignedUrlsBatch(stillMissing)
            if (unavailable) {
              batchUnavailable = true
              break
            }

            const entries = Object.entries(map || {})
              .map(([k, v]) => [String(k || '').trim(), String(v || '').trim()])
              .filter(([k, v]) => k && v)
            if (!entries.length) continue

            for (const [mediaId, signedUrl] of entries) {
              writeSignedUrlCache(mediaId, signedUrl)
            }

            setSignedUrlByMediaId((prev) => {
              const next = { ...(prev || {}) }
              for (const [mediaId, signedUrl] of entries) next[mediaId] = signedUrl
              return next
            })
          } catch {
            // ignore (fallback below)
          }
        }

        const candidates = buildAttachmentsApiUrlCandidates('/api/service-attachments/signed-url')

        const missingAfterBatch = batchUnavailable
          ? missingPrioritized
          : missingPrioritized
              .filter((id) => !signedUrlByMediaIdRef.current?.[id])
              .filter((id) => !readSignedUrlCache(id))

        await runWithConcurrency(
          missingAfterBatch,
          async (mediaId) => {
            if (cancelled) return
            // Cache hit? evita roundtrip.
            const cached = readSignedUrlCache(mediaId)
            if (cached) {
              setSignedUrlByMediaId((prev) => ({ ...(prev || {}), [mediaId]: cached }))
              return
            }

            try {
              let signedUrl = ''
              let had404 = false

              for (const signedUrlEndpoint of candidates) {
                const response = await fetch(signedUrlEndpoint, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                  },
                  body: JSON.stringify({ mediaId }),
                })

                const text = await response.text()
                let json = null
                try {
                  json = text ? JSON.parse(text) : null
                } catch {
                  // ignore
                }

                if (!response.ok) {
                  if (response.status === 404) had404 = true
                  if (response.status === 404 && import.meta.env.DEV) {
                    if (!attachmentsSignedUrlWarnedRef.current) {
                      attachmentsSignedUrlWarnedRef.current = true
                      log.warn('UPLOAD', 'Signed-url endpoint não encontrado (Worker)', {
                        url: signedUrlEndpoint,
                        status: response.status,
                        body: text?.slice?.(0, 200),
                      })
                    }
                  }
                  continue
                }

                signedUrl = String(json?.signedUrl || '').trim()
                if (signedUrl) break
              }

              if (!signedUrl) {
                if (had404) {
                  attachmentsSignedUrlUnavailableRef.current = true
                  setSignedUrlFailedByMediaId((prev) => ({ ...(prev || {}), [mediaId]: true }))
                }
                return
              }

              writeSignedUrlCache(mediaId, signedUrl)
              setSignedUrlByMediaId((prev) => ({ ...(prev || {}), [mediaId]: signedUrl }))
            } catch {
              // ignore
            }
          },
          5
        )
      } catch (e) {
        const msg = String(e?.message || e)
        const isMissingRelation =
          msg.toLowerCase().includes('relation') && msg.toLowerCase().includes('does not exist')
        if (isMissingRelation) {
          serviceMediaTablesReadyRef.current = false
          return
        }
      } finally {
        // Finalização confiável: nunca deixa inFlight preso.
        mediaSignedUrlsInFlightRef.current = false

        if (cancelled) {
          mediaSignedUrlsPendingRerunRef.current = false
          return
        }

        const lastKey = String(mediaSignedUrlsLastRequestedKeyRef.current || '')
        const processingKey = String(mediaSignedUrlsProcessingKeyRef.current || '')
        const shouldRerun =
          Boolean(mediaSignedUrlsPendingRerunRef.current) && Boolean(lastKey) && lastKey !== processingKey

        mediaSignedUrlsPendingRerunRef.current = false
        if (shouldRerun) setMediaSignedUrlsRerunTick((v) => v + 1)
      }
    }

    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    user?.id,
    activeTab,
    activeStatus,
    mediaSignedUrlsRerunTick,
    filteredRequestsForMedia.map((r) => r?.id).filter(Boolean).join('|'),
  ])

  const activeViewerAvatarRaw = String(activeMediaViewer?.counterparty?.avatar || '').trim()
  const activeViewerAvatar = useResolvedStorageUrl(activeViewerAvatarRaw, {
    expiresIn: 3600,
    preferPublic: true,
    debugLabel: 'workRequests:viewerAvatar',
  })

  // Importante: não faça early-return antes de declarar todos os hooks.
  // Caso o authLoading mude, isso causa "Rendered fewer hooks than expected".
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-150px)]">
        <motion.div
          animate={{ rotate: 360, scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
          className="w-12 h-12 rounded-full joby-gradient"
        />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-150px)] px-4">
        <Card className="p-6 max-w-md w-full text-center">
          <p className="text-muted-foreground mb-4">
            Você precisa estar logado para ver seus serviços.
          </p>
          <Button onClick={() => navigate('/login')} className="w-full">
            Ir para Login
          </Button>
        </Card>
      </div>
    )
  }

  const mediaViewerOverlay = activeMediaViewer?.mediaId ? (
    <div
      className="fixed inset-0 z-[10050] bg-black/70 flex items-center justify-center p-4"
      onClick={closeMediaViewer}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-card border border-border/60 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MEDIA (top) */}
        <div className="relative bg-black">
          {(() => {
            const url = signedUrlByMediaId?.[activeMediaViewer.mediaId]
            const isVideo = String(activeMediaViewer.mediaType || '').toLowerCase() === 'video'
            if (!url) {
              if (signedUrlFailedByMediaId?.[activeMediaViewer.mediaId]) {
                return (
                  <div className="w-full h-[45vh] flex items-center justify-center text-white/80 text-sm">
                    Anexo indisponível
                  </div>
                )
              }
              return (
                <div className="w-full h-[45vh] flex items-center justify-center text-white/80 text-sm">
                  Carregando…
                </div>
              )
            }

            return isVideo ? (
              <video
                src={url}
                ref={viewerVideoRef}
                className="w-full max-h-[55vh] object-contain"
                playsInline
                preload="metadata"
                controls
                controlsList="nodownload noplaybackrate noremoteplayback"
                disablePictureInPicture
                disableRemotePlayback
                autoPlay
                onPointerUp={handleViewerVideoPointerUp}
                onLoadedMetadata={() => {
                  try {
                    const el = viewerVideoRef.current
                    if (el) el.playbackRate = viewerPlaybackRate
                  } catch {
                    // ignore
                  }
                }}
              />
            ) : (
              <img src={url} alt="Anexo" className="w-full max-h-[55vh] object-contain" />
            )
          })()}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              closeMediaViewer()
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            className="absolute top-3 left-3 h-9 w-9 rounded-full bg-black/55 text-white flex items-center justify-center"
            aria-label="Fechar"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="absolute top-3 right-3">
            {(() => {
              const url = signedUrlByMediaId?.[activeMediaViewer.mediaId]
              const isVideo = String(activeMediaViewer?.mediaType || '').toLowerCase() === 'video'
              const canInteract = !!String(url || '').trim()

              return (
                <DropdownMenu
                  open={viewerOptionsMenuOpen}
                  onOpenChange={(open) => {
                    setViewerOptionsMenuOpen(open)
                    if (!open) setViewerOptionsMenuPage('main')
                  }}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full bg-black/55 hover:bg-black/65 text-white"
                      onClick={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => e.stopPropagation()}
                      aria-label="Mais opções"
                      disabled={!canInteract}
                    >
                      <MoreVertical size={18} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {isVideo && viewerOptionsMenuPage === 'speed' ? (
                      <>
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setViewerOptionsMenuPage('main')
                          }}
                          onTouchStart={(e) => e.stopPropagation()}
                          onTouchEnd={(e) => e.stopPropagation()}
                        >
                          <ChevronLeft size={16} className="mr-2" />
                          Voltar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioGroup
                          value={String(viewerPlaybackRate)}
                          onValueChange={(v) => {
                            const next = Number(v)
                            setViewerSpeed(next)
                          }}
                        >
                          <DropdownMenuRadioItem value="0.5">0.5</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="0.75">0.75</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="1">Normal</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="1.25">1.25</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="1.5">1.5</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            startViewerDownload({
                              url,
                              mediaId: activeMediaViewer?.mediaId,
                              mediaType: activeMediaViewer?.mediaType,
                            })
                          }}
                          disabled={!canInteract}
                        >
                          <Download size={16} className="mr-2" />
                          Baixar
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={(e) => {
                            e.stopPropagation()
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

                        {isVideo ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setViewerOptionsMenuPage('speed')
                              }}
                              onTouchStart={(e) => e.stopPropagation()}
                              onTouchEnd={(e) => e.stopPropagation()}
                            >
                              <Gauge size={16} className="mr-2" />
                              Velocidade da reprodução
                              <ChevronRight size={16} className="ml-auto opacity-70" />
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            })()}
          </div>
        </div>

        {/* BELOW (profile + caption) */}
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-full overflow-hidden bg-muted/40 border border-border/40 shrink-0">
              {activeViewerAvatar ? (
                <img
                  src={activeViewerAvatar}
                  alt="Perfil"
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">
                {String(activeMediaViewer?.counterparty?.name || 'Perfil')}
              </div>
              {String(activeMediaViewer?.caption || '').trim() ? (
                <div className="mt-0.5 text-sm text-foreground/90 whitespace-pre-line">
                  {String(activeMediaViewer.caption)}
                </div>
              ) : (
                <div className="mt-0.5 text-xs text-muted-foreground">Sem descrição.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full touch-pan-y"
      {...swipeTabs.containerProps}
    >
      <JobyPageHeader
        icon={<FileText size={23} className="text-primary-foreground" />}
        title="Solicitações"
        subtitle="Acompanhe solicitações de serviços no JOBY"
      >
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <SwipeTabsList
            tabs={[
              { value: 'recebidos', label: 'Recebidos' },
              { value: 'enviados', label: 'Enviados' },
            ]}
            listClassName={tabsPillList}
            triggerClassName={tabsPillTrigger}
            onTabClick={() => setActiveStatus('all')}
          />
        </Tabs>
      </JobyPageHeader>

      <TabTransition value={activeTab} order={TAB_ORDER}>
        <>
          {/* Filtros de Status (padrão Joby) */}
          <div className="mb-6">
            <div className="grid grid-cols-2 gap-2">
              {statusCardsWithCounts.map((status) => {
                const IconComponent = status.icon
                const isActive = activeStatus === status.id

                return (
                  <button
                    key={status.id}
                    type="button"
                    onClick={() => handleStatusClick(status.id)}
                    className={cn(
                      'w-full rounded-full border px-3 py-2 transition-all active:scale-[0.99]',
                      'flex items-center justify-between gap-2',
                      'bg-background/40 backdrop-blur-sm',
                      isActive
                        ? 'joby-gradient text-white border-transparent shadow-md'
                        : 'border-border/50 hover:bg-background/60'
                    )}
                    aria-pressed={isActive}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          'h-7 w-7 rounded-full flex items-center justify-center shrink-0',
                          isActive ? 'bg-white/15' : status.bgColor
                        )}
                      >
                        <IconComponent
                          className={cn(
                            'h-4 w-4',
                            isActive ? 'text-white' : status.color
                          )}
                        />
                      </span>
                      <span
                        className={cn(
                          'text-sm font-medium truncate',
                          isActive ? 'text-white' : 'text-foreground'
                        )}
                      >
                        {status.label}
                      </span>
                    </span>

                    <span
                      className={cn(
                        'h-6 min-w-6 px-2 rounded-full text-xs font-semibold',
                        'flex items-center justify-center shrink-0',
                        isActive
                          ? 'bg-white/15 text-white'
                          : 'bg-muted/40 text-muted-foreground border border-border/40',
                        status.count === 0 ? 'opacity-60' : 'opacity-100'
                      )}
                    >
                      {status.count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Lista de Solicitações */}
          <PullToRefresh onRefresh={loadRequests} threshold={70} spinnerText="Atualizando…" className="space-y-3 mb-8">
            {loadError ? (
              <ErrorState
                title="Erro ao carregar solicitações"
                message={toFriendlyErrorMessagePtBR(loadError)}
                onRetry={() => loadRequests()}
              />
            ) : isActiveTabLoading && !hasActiveData ? (
              <PageSkeleton title="Carregando solicitações…" />
            ) : filteredRequests.length === 0 ? (
              <EmptyState
                title="Nenhuma solicitação"
                message={
                  (activeStatus === 'all'
                    ? 'Nenhuma solicitação encontrada.'
                    : `Nenhuma solicitação ${statusCardsWithCounts
                        .find((s) => s.id === activeStatus)
                        ?.label.toLowerCase()} encontrada.`) +
                  (cacheLabel ? `\n\n${cacheLabel}` : '')
                }
              />
            ) : (
              filteredRequests.map((request) => {
                const { badge: statusColor, Icon: StatusIcon } = getStatusStyle(request.status)

                const scheduledTime = request?.booking?.scheduled_time
                const notes = String(request?.booking?.notes || '').trim()
                const canRespond = activeTab === 'recebidos' && request.status === 'pending'
                const canCancel = activeTab === 'enviados' && request.status === 'pending'
                const canEdit = activeTab === 'enviados' && request.status === 'pending'
                const isUpdating = updatingId === request.id
                const mediaItems = requestMediaByRequestId?.[request.id] || []
                const isInlineOpen = String(openInlineDetailsRequestId || '') === String(request.id)

                const booking = request?.booking || {}
                const counterpartyProfile = booking?.client || booking?.professional || null
                const counterpartyId = String(counterpartyProfile?.id || '').trim()
                const counterpartyAvatarRaw = String(counterpartyProfile?.avatar || '').trim()
                const counterpartyAvatar =
                  (counterpartyId && resolvedAvatarUrlByUserId?.[counterpartyId]) ||
                  safeMediaSrc(counterpartyAvatarRaw) ||
                  ''
                const jobySinceYearRaw =
                  counterpartyProfile?.joby_since_year ??
                  counterpartyProfile?.jobySinceYear ??
                  (counterpartyProfile?.created_at
                    ? new Date(counterpartyProfile.created_at).getFullYear()
                    : null)
                const jobyYear = Number(jobySinceYearRaw)
                const priceUnitRaw = booking?.service?.price_unit || booking?.service?.priceUnit || ''
                const unitKey = normalizePriceUnitKey(priceUnitRaw)
                const daysCount = getBookingDaysCount(booking)
                const monthsCount = getBookingMonthsCount(booking)
                const hoursTotal = unitKey === 'hour' ? getTotalHoursFromBooking(booking, daysCount) : null

                const durationText =
                  unitKey === 'event'
                    ? 'Evento'
                    : unitKey === 'month'
                      ? monthsCount
                        ? `${monthsCount} ${monthsCount === 1 ? 'mês' : 'meses'}`
                        : null
                      : daysCount
                        ? `${daysCount} dia${daysCount === 1 ? '' : 's'}`
                        : null

                const net = pickNumber(
                  booking.net_amount,
                  booking.netAmount,
                  booking.professional_net_amount,
                  booking.professionalNetAmount,
                  booking.payout_amount,
                  booking.payoutAmount
                )
                const unit = formatPriceUnit(priceUnitRaw || 'hora', {
                  prefix: true,
                })
                const basePrice = pickNumber(
                  booking?.service?.price,
                  booking?.service?.base_price,
                  booking?.service?.basePrice
                )

                const computedTotal = computeTotalFromUnit({
                  unitKey,
                  basePrice,
                  daysCount,
                  monthsCount,
                  hoursTotal,
                })

                const totalCandidate = pickBookingTotalCandidate(booking)

                // Prefer computed totals when the stored value looks like unit price.
                let totalToReceive = totalCandidate
                if (computedTotal && basePrice) {
                  const base = Number(basePrice)
                  const cand = Number(totalCandidate)
                  const computed = Number(computedTotal)

                  const durationQty =
                    unitKey === 'hour'
                      ? Number(hoursTotal || 0)
                      : unitKey === 'month'
                        ? Number(monthsCount || 0)
                        : unitKey === 'event'
                          ? 1
                          : Number(daysCount || 0)

                  const hasMultiQty = Number.isFinite(durationQty) && durationQty > 1
                  const candLooksUnit =
                    Number.isFinite(cand) &&
                    Number.isFinite(base) &&
                    (Math.abs(cand - base) / Math.max(1, base) < 0.06) &&
                    (hasMultiQty || unitKey === 'hour')

                  if (!totalCandidate) {
                    totalToReceive = computed
                  } else if (candLooksUnit && computed > cand * 1.1) {
                    totalToReceive = computed
                  }
                }
                if (!totalToReceive && computedTotal) totalToReceive = computedTotal

                const accumulatedCandidate = pickBookingAccumulatedCandidate(booking)
                const workedSeconds = pickNumber(
                  booking?.worked_seconds,
                  booking?.workedSeconds,
                  booking?.worked_time_seconds,
                  booking?.workedTimeSeconds
                )
                const hasWorkSignal =
                  (Number.isFinite(Number(workedSeconds)) && Number(workedSeconds) > 0) ||
                  !!(
                    booking?.started_at ||
                    booking?.startedAt ||
                    booking?.work_started_at ||
                    booking?.workStartedAt ||
                    booking?.ended_at ||
                    booking?.endedAt ||
                    booking?.work_ended_at ||
                    booking?.workEndedAt
                  )
                const totalAccumulated = hasWorkSignal ? accumulatedCandidate : null
                const startDate =
                  booking.start_date || booking.startDate || booking.scheduled_date || booking.scheduledDate
                const endDate = computeEndDate(booking, daysCount)

                const locationLine = buildLocationLine(booking)
                const detailsTextRaw = extractClientDescription(booking)
                const hasDetails = !!detailsTextRaw
                const detailsText = hasDetails ? detailsTextRaw : 'Sem detalhes'
                const isExpanded = !!expandedDetailsById?.[request.id]

                const contractsCountRaw = Number(
                  counterpartyProfile?.contracts_count ??
                    counterpartyProfile?.contractsCount ??
                    counterpartyProfile?.bookings_count ??
                    counterpartyProfile?.bookingsCount ??
                    counterpartyProfile?.hires_count ??
                    counterpartyProfile?.hiresCount ??
                    booking?.client_contracts_count ??
                    booking?.clientContractsCount ??
                    booking?.professional_contracts_count ??
                    booking?.professionalContractsCount ??
                    0
                )
                const contractsCount =
                  Number.isFinite(contractsCountRaw) && contractsCountRaw >= 0
                    ? Math.floor(contractsCountRaw)
                    : 0
                const contractsLabel = `${contractsCount} contrata${contractsCount === 1 ? 'ção' : 'ções'}`

                const isPaymentReserved =
                  booking?.payment_status === 'reserved' || booking?.paymentStatus === 'reserved'

                const canCancelAccepted = request.status === 'accepted' && !isUpdating
                const canArchive = request.status !== 'accepted' && request.status !== 'archived' && !isUpdating
                const canDelete = request.status !== 'accepted' && !isUpdating
                const hasMenuActions = canCancelAccepted || canArchive || canDelete

                return (
                  <Card
                    key={request.id}
                    className="relative p-4 border-border/60 hover:shadow-md transition-all rounded-2xl"
                  >
                    <div
                      className="absolute top-3 right-3 z-20"
                      data-request-menu-root={String(request.id)}
                    >
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            if (!hasMenuActions) return
                            setOpenMenuRequestId((prev) =>
                              String(prev) === String(request.id) ? null : request.id
                            )
                          }}
                          disabled={!hasMenuActions || deletingId === request.id || isUpdating}
                          className={cn(
                            'h-8 w-8 rounded-full flex items-center justify-center',
                            'bg-background/70 backdrop-blur border border-border/50',
                            'hover:bg-background/90 active:scale-[0.99]',
                            (!hasMenuActions || isUpdating) ? 'opacity-60' : '',
                            deletingId === request.id ? 'opacity-60 pointer-events-none' : ''
                          )}
                          aria-label="Opções"
                        >
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </button>

                        {hasMenuActions && String(openMenuRequestId || '') === String(request.id) ? (
                          <div className="absolute right-0 mt-1 w-32 rounded-xl border border-border bg-background shadow-md overflow-hidden">
                            {canCancelAccepted ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuRequestId(null)
                                  updateBookingStatus({ bookingId: request.id, nextStatus: 'cancelled' })
                                }}
                                disabled={isUpdating}
                                className={cn(
                                  'w-full px-3 py-2 text-left text-sm',
                                  'hover:bg-muted/40',
                                  'text-destructive font-medium'
                                )}
                              >
                                Cancelar
                              </button>
                            ) : null}

                            {!canCancelAccepted && canArchive ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuRequestId(null)
                                  updateBookingStatus({ bookingId: request.id, nextStatus: 'archived' })
                                }}
                                disabled={isUpdating}
                                className={cn(
                                  'w-full px-3 py-2 text-left text-sm',
                                  'hover:bg-muted/40',
                                  'text-foreground font-medium'
                                )}
                              >
                                Arquivar
                              </button>
                            ) : null}

                            {!canCancelAccepted && canDelete ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuRequestId(null)
                                  setDeleteConfirmTarget({ id: request.id, status: request.status })
                                  setDeleteConfirmOpen(true)
                                }}
                                disabled={deletingId === request.id}
                                className={cn(
                                  'w-full px-3 py-2 text-left text-sm',
                                  'hover:bg-muted/40',
                                  'text-destructive font-medium'
                                )}
                              >
                                Apagar
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Linha do serviço / pacote */}
                    <div className="text-sm font-semibold text-foreground">
                      <span className="font-bold">{request.title}</span>
                      {durationText ? (
                        <span className="text-muted-foreground"> {'•'} {durationText}</span>
                      ) : null}
                      {unitKey === 'hour' && hoursTotal ? (
                        <span className="text-muted-foreground"> {'•'} {formatHoursPt(hoursTotal)}</span>
                      ) : null}
                      {totalToReceive || totalAccumulated ? (
                        <span className="text-muted-foreground"> {'•'} </span>
                      ) : null}
                      {totalToReceive ? (
                        <>
                          <span className="font-bold">{formatBRL(totalToReceive)}</span>
                          <span className="ml-1 text-[11px] font-semibold text-muted-foreground">estimado</span>
                        </>
                      ) : null}
                      {totalToReceive && totalAccumulated ? (
                        <span className="text-muted-foreground"> {'|'} </span>
                      ) : null}
                      {totalAccumulated ? (
                        <>
                          <span className="font-bold">{formatBRL(totalAccumulated)}</span>
                          <span className="ml-1 text-[11px] font-semibold text-muted-foreground">acumulado</span>
                        </>
                      ) : null}
                      {net && Number.isFinite(net) ? (
                        <span className="ml-1 text-blue-600 font-semibold">
                          ({formatBRL(net)} líquido)
                        </span>
                      ) : null}
                    </div>

                    {locationLine ? (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 text-orange-500" />
                        <span className="truncate">{locationLine}</span>
                      </div>
                    ) : null}

                    {/* Campo (Perfil -> Regras) */}
                    <div className="mt-3 rounded-xl border border-border/50 bg-background/30 p-3">
                      {/* Perfil */}
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="h-10 w-10 rounded-full overflow-hidden border border-border/50 bg-muted/20 shrink-0">
                            {counterpartyAvatar ? (
                              <img
                                src={counterpartyAvatar}
                                alt={request.clientName || 'Cliente'}
                                className="h-full w-full object-cover"
                                loading="eager"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-muted-foreground font-semibold">
                                {String(request.clientName || 'C')
                                  .replace(/^@+/, '')
                                  .trim()
                                  .slice(0, 1)
                                  .toUpperCase()}
                              </div>
                            )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-foreground whitespace-normal break-words leading-tight">
                                {request.clientName || 'Cliente'}
                              </div>

                              {Number.isFinite(jobyYear) ? (
                                <div className="mt-0.5 text-[11px] text-muted-foreground whitespace-normal break-words leading-tight">
                                  No JOBY desde {jobyYear}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 self-start mt-0.5">
                            <Badge
                              variant="secondary"
                              className={cn(
                                `${statusColor} hover:opacity-80 flex items-center gap-1 px-2 py-0.5 text-xs`
                              )}
                            >
                              <StatusIcon className="w-3 h-3" />
                              {request.statusLabel}
                            </Badge>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Briefcase className="h-3.5 w-3.5 text-orange-500" />
                            <span>{activeTab === 'recebidos' ? 'Cliente:' : 'Profissional:'}</span>
                            <span className="font-semibold text-foreground">{contractsLabel}</span>
                          </span>

                          {counterpartyProfile?.is_verified || counterpartyProfile?.isVerified ? (
                            <span className="inline-flex items-center gap-1">
                              <span aria-hidden>•</span>
                              <span className="font-semibold text-blue-600">Verificado</span>
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>
                            Pagamento:{' '}
                            {isPaymentReserved ? (
                              <span className="font-semibold text-foreground">saldo reservado</span>
                            ) : (
                              <span className="font-semibold text-foreground">sem saldo reservado</span>
                            )}
                          </span>
                          {isPaymentReserved ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {/* Detalhes */}
                      <div className="mt-3 rounded-xl border border-border/40 bg-muted/25 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-foreground">Detalhes</div>
                          {canRespond && request.status !== 'pending' ? (
                            <Button
                              variant="outline"
                              className="h-8 px-3 rounded-lg text-xs"
                              disabled={isUpdating}
                              onClick={() => updateBookingStatus({ bookingId: request.id, nextStatus: 'rejected' })}
                            >
                              Recusar
                            </Button>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          <p className={cn(!isExpanded && hasDetails ? 'line-clamp-2' : '')}>{detailsText}</p>
                          {hasDetails && detailsText.length > 120 ? (
                            <button
                              type="button"
                              className="mt-1 text-xs font-semibold text-primary"
                              onClick={() =>
                                setExpandedDetailsById((prev) => ({
                                  ...prev,
                                  [request.id]: !prev?.[request.id],
                                }))
                              }
                            >
                              {isExpanded ? 'ver menos' : 'ver mais >'}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {/* Anexos: mostrar somente ao abrir "Ver detalhes" */}

                      {isInlineOpen ? (
                        mediaItems.length > 0 ? (
                          <div className="mt-3">
                            <div className="text-xs font-semibold text-foreground">Anexos</div>
                            <div className="mt-2 flex items-center gap-2">
                              {mediaItems.slice(0, 3).map((media) => {
                                const url = signedUrlByMediaId?.[media.id]
                                const isVideo = String(media.mediaType || '').toLowerCase() === 'video'
                                const displayName =
                                  String(counterpartyProfile?.name || '').trim() ||
                                  (activeTab === 'recebidos' ? 'Cliente' : 'Profissional')
                                const avatar = counterpartyAvatar || null

                                return (
                                  <div
                                    key={media.id}
                                    className="h-20 w-20 rounded-lg bg-muted/40 border border-border/40 overflow-hidden shrink-0 flex items-center justify-center"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() =>
                                      setActiveMediaViewer({
                                        mediaId: media.id,
                                        requestId: request.id,
                                        mediaType: media.mediaType,
                                        caption: media.caption || '',
                                        counterparty: {
                                          name: displayName,
                                          avatar,
                                        },
                                      })
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        setActiveMediaViewer({
                                          mediaId: media.id,
                                          requestId: request.id,
                                          mediaType: media.mediaType,
                                          caption: media.caption || '',
                                          counterparty: {
                                            name: displayName,
                                            avatar,
                                          },
                                        })
                                      }
                                    }}
                                  >
                                    {url ? (
                                      isVideo ? (
                                        <video
                                          src={url}
                                          className="h-full w-full object-cover"
                                          playsInline
                                          preload="metadata"
                                        />
                                      ) : (
                                        <img
                                          src={url}
                                          alt="Anexo"
                                          className="h-full w-full object-cover"
                                          loading="lazy"
                                        />
                                      )
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground">Carregando…</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : null
                      ) : null}

                      {(() => {
                        // Ações da lista: sempre manter "Ver detalhes".
                        // Editar/Cancelar ficam na tela de detalhes.
                        if (activeTab === 'enviados' || canRespond || request.status === 'accepted') {
                          return (
                            <div className="mt-3 flex items-center gap-2">
                              <Button
                                className="w-full h-10 rounded-lg joby-gradient text-white"
                                disabled={false}
                                onClick={() => {
                                  // Abrir o modal/overlay correto de detalhes (rota), em vez de apenas expandir/fechar o card.
                                  setOpenInlineDetailsRequestId(null)
                                  navigate(`/work-requests/${request.id}`)
                                }}
                              >
                                Ver detalhes
                              </Button>
                            </div>
                          )
                        }

                        return null
                      })()}

                      <div className="mt-3">
                        <button
                          type="button"
                          className="w-full text-center text-xs font-semibold text-primary"
                          onClick={() => {
                            // Sem navegação obrigatória aqui; mantém padrão visual.
                          }}
                        >
                          Veja as regras do serviço {'>'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Início: {formatDatePt(startDate)}</span>
                      <span>Fim: {formatDatePt(endDate)}</span>
                    </div>
                  </Card>
                )
              })
            )}
          </PullToRefresh>

          {/* Dicas para Profissionais */}
          <Card className="p-6 bg-muted/50">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold mb-3 text-foreground">
                  Dicas para Profissionais:
                </h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>
                      Responda às solicitações em até 24 horas para manter boa
                      reputação
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>
                      Seja claro sobre disponibilidade e condições de trabalho
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        </>
      </TabTransition>

      {isDetailsRoute ? (
        <div
          className="fixed inset-0 z-[10020] bg-black/40 backdrop-blur-sm grid place-items-center p-4 overflow-hidden"
          onClick={() => navigate('/work-requests')}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card border border-border/60 overflow-hidden shadow-xl"
            style={{ maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const detail = detailsRequest?.request || null
              const booking = detail?.booking || null
              const isStillLoading = loading || loadingRecebidos || loadingEnviados

              if (!detail) {
                return (
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Detalhes</div>
                      <button
                        type="button"
                        className="h-9 w-9 rounded-full hover:bg-muted/40 flex items-center justify-center"
                        onClick={() => navigate('/work-requests')}
                        aria-label="Fechar"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="mt-4">
                      {isStillLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="w-10 h-10 rounded-full joby-gradient animate-pulse" />
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">Solicitação não encontrada.</div>
                      )}
                    </div>
                  </div>
                )
              }

              const counterpartyProfile =
                detailsRequest?.tab === 'recebidos' ? booking?.client : booking?.professional
              const counterpartyAvatar =
                (counterpartyProfile?.id &&
                  resolvedAvatarUrlByUserId?.[String(counterpartyProfile.id)]) ||
                safeMediaSrc(counterpartyProfile?.avatar) ||
                null

              const displayName =
                String(counterpartyProfile?.name || '').trim() ||
                (detailsRequest?.tab === 'recebidos' ? 'Cliente' : 'Profissional')
              const username = String(counterpartyProfile?.username || '').trim()
              const usernameLabel = username ? `@${username}` : ''

              const ratingRaw = counterpartyProfile?.rating
              let ratingAvg = 0
              let ratingCount = null
              if (typeof ratingRaw === 'number') ratingAvg = ratingRaw
              else if (typeof ratingRaw === 'string') ratingAvg = Number(ratingRaw)
              else if (ratingRaw && typeof ratingRaw === 'object') {
                ratingAvg = Number(ratingRaw?.avg ?? ratingRaw?.average ?? ratingRaw?.value ?? 0)
                ratingCount =
                  pickNumber(
                    ratingRaw?.count,
                    ratingRaw?.total,
                    ratingRaw?.ratings_count,
                    ratingRaw?.ratingsCount
                  ) || null
              }
              if (!Number.isFinite(ratingAvg) || ratingAvg < 0) ratingAvg = 0
              if (!ratingCount) {
                ratingCount =
                  pickNumber(
                    counterpartyProfile?.rating_count,
                    counterpartyProfile?.ratingCount,
                    counterpartyProfile?.ratings_count,
                    counterpartyProfile?.ratingsCount,
                    counterpartyProfile?.reviews_count,
                    counterpartyProfile?.reviewsCount
                  ) || null
              }
              const ratingShown = Number.isFinite(ratingAvg) && ratingAvg > 0
              const ratingRoundedStars = ratingShown ? Math.max(0, Math.min(5, Math.round(ratingAvg))) : 0

              const statusLabel = detail?.statusLabel || getStatusLabel(detail?.status)
              const { badge: statusColor, Icon: StatusIcon } = getStatusStyle(detail?.status)

              const startDate =
                booking?.start_date ||
                booking?.startDate ||
                booking?.scheduled_date ||
                booking?.scheduledDate
              const unitRaw = booking?.service?.price_unit || booking?.service?.priceUnit || ''
              const unitKey = normalizePriceUnitKey(unitRaw)
              const daysCount = getBookingDaysCount(booking)
              const monthsCount = getBookingMonthsCount(booking)
              const hoursTotal = unitKey === 'hour' ? getTotalHoursFromBooking(booking, daysCount) : null
              const endDate = computeEndDate(booking, daysCount)
              const locationLine = buildLocationLine(booking)
              const addressLineRaw =
                String(booking?.work_area || booking?.workArea || booking?.city || booking?.location || '').trim() ||
                (locationLine ? String(locationLine).split('·')[0].trim() : '')
              const scheduledTimeRaw = String(booking?.scheduled_time || booking?.scheduledTime || '').trim()
              const selectedDates = getSelectedDatesFromBooking(booking)
              const serviceDateRaw =
                booking?.scheduled_date || booking?.scheduledDate || booking?.start_date || booking?.startDate || selectedDates?.[0] || null
              const durationHours = roundHours(sumMinutesFromTimeRanges(scheduledTimeRaw) / 60)
              const durationLabel = durationHours
                ? `${String(durationHours).replace('.', ',')} hora${durationHours === 1 ? '' : 's'}`
                : '-'
              const detailsTextRaw = extractClientDescription(booking)
              const aboutText = detailsTextRaw ? detailsTextRaw : ''

              const selectedSortedForSummary = Array.isArray(selectedDates) ? [...selectedDates].filter(Boolean) : []
              selectedSortedForSummary.sort((a, b) => {
                const da = toValidDate(a)
                const db = toValidDate(b)
                if (!da && !db) return 0
                if (!da) return 1
                if (!db) return -1
                return da.getTime() - db.getTime()
              })

              const startDateSummary =
                toValidDate(startDate) ||
                toValidDate(serviceDateRaw) ||
                (selectedSortedForSummary.length ? toValidDate(selectedSortedForSummary[0]) : null)

              const endDateSummary =
                toValidDate(endDate) ||
                (selectedSortedForSummary.length
                  ? toValidDate(selectedSortedForSummary[selectedSortedForSummary.length - 1])
                  : null) ||
                startDateSummary

              const totalDaysSummaryRaw =
                (Number.isFinite(Number(daysCount)) && Number(daysCount) > 0 ? Number(daysCount) : null) ||
                (startDateSummary && endDateSummary ? daysBetweenInclusive(startDateSummary, endDateSummary) : null) ||
                (selectedSortedForSummary.length ? selectedSortedForSummary.length : null)

              const totalHoursSummaryRaw =
                totalDaysSummaryRaw && durationHours
                  ? Math.round(Number(totalDaysSummaryRaw) * Number(durationHours) * 10) / 10
                  : null

              const totalHoursSummary =
                (Number.isFinite(Number(hoursTotal)) && Number(hoursTotal) > 0 ? Number(hoursTotal) : null) ||
                totalHoursSummaryRaw

              const totalDaysSummary = totalDaysSummaryRaw

              const totalDurationLabel = (() => {
                const d = Number(totalDaysSummary)
                const h = Number(totalHoursSummary)
                const hasDays = Number.isFinite(d) && d > 0
                const hasHours = Number.isFinite(h) && h > 0
                if (hasDays && hasHours) return `${d} dia${d === 1 ? '' : 's'} • ${formatHoursPt(h)}`
                if (hasDays) return `${d} dia${d === 1 ? '' : 's'}`
                if (hasHours) return formatHoursPt(h)
                return '-'
              })()

              const paymentReserved =
                booking?.payment_status === 'reserved' || booking?.paymentStatus === 'reserved'
              const totalCandidate = pickBookingTotalCandidate(booking)
              const net = pickNumber(
                booking?.net_amount,
                booking?.netAmount,
                booking?.net_total,
                booking?.netTotal,
                booking?.total_net,
                booking?.totalNet,
                booking?.professional_net_amount,
                booking?.professionalNetAmount,
                booking?.payout_amount,
                booking?.payoutAmount
              )

              const mediaItems = requestMediaByRequestId?.[detail.id] || []

              const basePrice = pickNumber(
                  booking?.service?.price,
                  booking?.service?.base_price,
                  booking?.service?.basePrice
                )

                const computedSubtotal = computeTotalFromUnit({
                  unitKey,
                  basePrice,
                  daysCount,
                  monthsCount,
                  hoursTotal,
                })

                const scheduleLine = buildScheduleLineFromBooking({
                  booking,
                  unitKey,
                  daysCount,
                  monthsCount,
                  hoursTotal,
                })

                const totalCandidateSafe = pickBookingTotalCandidate(booking)

                let subtotal = computedSubtotal
                if (!subtotal) subtotal = basePrice

                // Fees (best-effort; only if booking has pct fields)
                const homePct = pickNumber(
                  booking?.home_service_fee,
                  booking?.homeServiceFee,
                  booking?.home_service_pct,
                  booking?.homeServicePct,
                  booking?.home_service_percent,
                  booking?.homeServicePercent
                )
                const travelPct = pickNumber(
                  booking?.travel_fee,
                  booking?.travelFee,
                  booking?.travel_fee_pct,
                  booking?.travelFeePct,
                  booking?.travel_fee_percent,
                  booking?.travelFeePercent
                )
                const emergencyPct = pickNumber(
                  booking?.emergency_fee,
                  booking?.emergencyFee,
                  booking?.emergency_fee_pct,
                  booking?.emergencyFeePct,
                  booking?.emergency_fee_percent,
                  booking?.emergencyFeePercent
                )

                const subtotalNumber = Number(subtotal)
                const fees = []
                if (Number.isFinite(subtotalNumber) && subtotalNumber > 0) {
                  if (homePct) {
                    fees.push({
                      label: 'Atendimento a domicílio',
                      pct: Number(homePct),
                      tone: 'text-blue-600',
                      amount: Math.round(subtotalNumber * (Number(homePct) / 100) * 100) / 100,
                    })
                  }
                  if (travelPct) {
                    fees.push({
                      label: 'Taxa de deslocamento',
                      pct: Number(travelPct),
                      tone: 'text-green-600',
                      amount: Math.round(subtotalNumber * (Number(travelPct) / 100) * 100) / 100,
                    })
                  }
                  if (emergencyPct) {
                    fees.push({
                      label: 'Atendimento de emergência',
                      pct: Number(emergencyPct),
                      tone: 'text-red-600',
                      amount: Math.round(subtotalNumber * (Number(emergencyPct) / 100) * 100) / 100,
                    })
                  }
                }

                const feesTotal = fees.reduce((acc, f) => acc + (Number(f?.amount) || 0), 0)
                const computedTotalWithFees =
                  Number.isFinite(subtotalNumber) && subtotalNumber > 0
                    ? Math.round((subtotalNumber + feesTotal) * 100) / 100
                    : null

                // Prefer stored total only if it doesn't look like unit price.
                let totalEstimated = totalCandidateSafe
                if (computedTotalWithFees && basePrice) {
                  const base = Number(basePrice)
                  const cand = Number(totalCandidateSafe)
                  const computed = Number(computedTotalWithFees)

                  const durationQty =
                    unitKey === 'hour'
                      ? Number(hoursTotal || 0)
                      : unitKey === 'month'
                        ? Number(monthsCount || 0)
                        : unitKey === 'event'
                          ? 1
                          : Number(daysCount || 0)

                  const hasMultiQty = Number.isFinite(durationQty) && durationQty > 1
                  const candLooksUnit =
                    Number.isFinite(cand) &&
                    Number.isFinite(base) &&
                    (Math.abs(cand - base) / Math.max(1, base) < 0.06) &&
                    (hasMultiQty || unitKey === 'hour')

                  const candLooksOneDayHourly = (() => {
                    if (unitKey !== 'hour') return false
                    const perDay = Number(durationHours)
                    const totalH = Number(hoursTotal)
                    if (!Number.isFinite(base) || base <= 0) return false
                    if (!Number.isFinite(perDay) || perDay <= 0) return false
                    if (!Number.isFinite(totalH) || totalH <= perDay) return false
                    if (!Number.isFinite(cand) || cand <= 0) return false
                    const oneDayTotal = base * perDay
                    return Math.abs(cand - oneDayTotal) / Math.max(1, oneDayTotal) < 0.08
                  })()

                  if (!totalCandidateSafe) {
                    totalEstimated = computed
                  } else if (candLooksUnit && computed > cand * 1.1) {
                    totalEstimated = computed
                  } else if (candLooksOneDayHourly && computed > cand * 1.1) {
                    totalEstimated = computed
                  }
                }
                if (!totalEstimated && computedTotalWithFees) totalEstimated = computedTotalWithFees

                const canRespond = detailsRequest?.tab === 'recebidos' && detail?.status === 'pending'
                const canCancel = detailsRequest?.tab === 'enviados' && detail?.status === 'pending'
                const canEdit = detailsRequest?.tab === 'enviados' && detail?.status === 'pending'
                const otherUserId = String(counterpartyProfile?.id || '').trim()

              const totalValue =
                totalEstimated ||
                totalCandidateSafe ||
                pickNumber(booking?.total_price, booking?.totalPrice, booking?.total_value, booking?.totalValue) ||
                basePrice ||
                null

              const accumulatedValueCandidate = pickBookingAccumulatedCandidate(booking)
              const accumulatedHasWorkSignal =
                (() => {
                  const candidates = [
                    booking?.worked_seconds,
                    booking?.workedSeconds,
                    booking?.worked_minutes_total,
                    booking?.workedMinutesTotal,
                    booking?.worked_minutes,
                    booking?.workedMinutes,
                  ]
                  for (const v of candidates) {
                    const n = Number(v)
                    if (Number.isFinite(n) && n > 0) return true
                  }
                  return false
                })() ||
                !!(
                  booking?.started_at ||
                  booking?.startedAt ||
                  booking?.work_started_at ||
                  booking?.workStartedAt ||
                  booking?.ended_at ||
                  booking?.endedAt ||
                  booking?.work_ended_at ||
                  booking?.workEndedAt
                )
              const accumulatedValue = accumulatedHasWorkSignal ? accumulatedValueCandidate : null

              const appFeeExplicit =
                pickNumber(
                  booking?.app_fee,
                  booking?.appFee,
                  booking?.platform_fee,
                  booking?.platformFee,
                  booking?.fee_amount,
                  booking?.feeAmount
                ) || null

              const netValue = Number.isFinite(Number(net)) && Number(net) > 0 ? Number(net) : totalValue
              const appFeeComputed =
                totalValue && netValue && Number.isFinite(Number(totalValue)) && Number.isFinite(Number(netValue))
                  ? Math.max(0, Math.round((Number(totalValue) - Number(netValue)) * 100) / 100)
                  : null

              const appFee = appFeeExplicit ?? appFeeComputed

              const billingModelRaw = String(
                booking?.billing_model ||
                  booking?.billingModel ||
                  booking?.pricing_model ||
                  booking?.pricingModel ||
                  booking?.charge_model ||
                  booking?.chargeModel ||
                  ''
              )
                .trim()
                .toLowerCase()

              const billingModelFromUnit =
                unitKey === 'hour'
                  ? 'hourly'
                  : unitKey === 'day'
                    ? 'daily'
                    : unitKey === 'month'
                      ? 'monthly'
                      : unitKey === 'event'
                        ? 'event'
                        : 'project'

              const billingModel =
                billingModelRaw === 'hourly' ||
                billingModelRaw === 'daily' ||
                billingModelRaw === 'monthly' ||
                billingModelRaw === 'event' ||
                billingModelRaw === 'project'
                  ? billingModelRaw
                  : billingModelFromUnit

              const billingLabel =
                billingModel === 'hourly'
                  ? 'Por hora'
                  : billingModel === 'daily'
                    ? 'Diária'
                    : billingModel === 'monthly'
                      ? 'Mensal'
                      : billingModel === 'event'
                        ? 'Evento'
                        : 'Projeto (valor fechado)'

              const weeklyHours =
                pickNumber(
                  booking?.weekly_hours,
                  booking?.weeklyHours,
                  booking?.workload_weekly,
                  booking?.workloadWeekly,
                  booking?.carga_semanal,
                  booking?.cargaSemanal,
                  booking?.carga_semanal_horas,
                  booking?.cargaSemanalHoras
                ) || null

              const includedMonthlyHours =
                pickNumber(
                  booking?.included_hours_per_month,
                  booking?.includedHoursPerMonth,
                  booking?.monthly_included_hours,
                  booking?.monthlyIncludedHours,
                  booking?.hours_included,
                  booking?.hoursIncluded,
                  booking?.included_hours,
                  booking?.includedHours
                ) || null

              const monthlyNoLimit = Boolean(
                booking?.monthly_no_limit ||
                  booking?.monthlyNoLimit ||
                  booking?.no_hour_limit ||
                  booking?.noHourLimit ||
                  booking?.unlimited_hours ||
                  booking?.unlimitedHours
              )

              const serviceTitle = String(booking?.service?.title || detail?.title || '').trim()

              const openInMaps = () => {
                const q = String(addressLineRaw || locationLine || '').trim()
                if (!q) return
                const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
                try {
                  window.open(url, '_blank', 'noopener,noreferrer')
                } catch {
                  window.location.href = url
                }
              }

              const shareRoute = async () => {
                const q = String(addressLineRaw || locationLine || '').trim()
                if (!q) return
                const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
                const title = `Rota: ${displayName || 'Cliente'}`
                const text = q

                try {
                  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
                    await navigator.share({ title, text, url })
                    return
                  }
                } catch {
                  // ignore: fallback abaixo
                }

                try {
                  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(url)
                    toast({
                      title: 'Link copiado',
                      description: 'A rota foi copiada para a área de transferência.',
                      variant: 'success',
                    })
                    return
                  }
                } catch {
                  // ignore
                }

                try {
                  window.prompt('Copie o link da rota:', url)
                } catch {
                  // ignore
                }
              }

              const normalizeStatusKey = (raw) =>
                String(raw || '')
                  .trim()
                  .toLowerCase()

              const statusKey = normalizeStatusKey(detail?.status)
              const showAcceptedDetailsLayout =
                (detailsRequest?.tab === 'recebidos' || detailsRequest?.tab === 'enviados') && statusKey === 'accepted'
              const viewerRoleLabel = detailsRequest?.tab === 'recebidos' ? 'Profissional' : 'Cliente'
              const counterpartyRoleLabel = detailsRequest?.tab === 'recebidos' ? 'Cliente' : 'Prestador'
              const isInProgress =
                statusKey === 'active' ||
                statusKey === 'in_progress' ||
                statusKey === 'ongoing' ||
                statusKey === 'started' ||
                statusKey === 'confirmed' ||
                statusKey === 'accepted'

              const statusInlineLabel = isInProgress
                ? 'Em andamento'
                : statusKey === 'pending'
                  ? 'Aguardando confirmação'
                  : statusLabel

              const pickNonNegative = (...values) => {
                for (const v of values) {
                  const n = Number(v)
                  if (Number.isFinite(n) && n >= 0) return n
                }
                return null
              }

              const totalDaysSafe = Number.isFinite(Number(daysCount)) && Number(daysCount) > 0 ? Number(daysCount) : null

              const startDateSafe =
                toValidDate(
                  booking?.start_date ||
                    booking?.startDate ||
                    booking?.scheduled_date ||
                    booking?.scheduledDate ||
                    (selectedDates?.length ? selectedDates[0] : null)
                ) || null

              const today = new Date()

              const completedDaysFromFields = pickNonNegative(
                booking?.days_completed,
                booking?.daysCompleted,
                booking?.completed_days,
                booking?.completedDays,
                booking?.days_done,
                booking?.daysDone,
                booking?.work_days_completed,
                booking?.workDaysCompleted
              )

              const completedDaysDerived =
                isInProgress && startDateSafe && totalDaysSafe
                  ? Math.max(0, Math.min(totalDaysSafe, (daysBetweenInclusive(startDateSafe, today) || 0)))
                  : 0

              const completedDays =
                completedDaysFromFields != null
                  ? Math.max(0, Math.min(totalDaysSafe || completedDaysFromFields, Math.floor(completedDaysFromFields)))
                  : completedDaysDerived

              const dailyHours = durationHours || null
              const totalHoursComputed =
                totalDaysSafe && dailyHours ? Math.round(Number(totalDaysSafe) * Number(dailyHours) * 10) / 10 : null

              const totalHoursSafe =
                pickNonNegative(
                  booking?.total_hours,
                  booking?.totalHours,
                  booking?.hours_total,
                  booking?.hoursTotal,
                  booking?.estimated_hours,
                  booking?.estimatedHours,
                  booking?.duration_hours,
                  booking?.durationHours
                ) ||
                (typeof hoursTotal === 'number' ? hoursTotal : null) ||
                totalHoursComputed

              const hoursDoneFromFields = pickNonNegative(
                booking?.hours_done,
                booking?.hoursDone,
                booking?.worked_hours,
                booking?.workedHours,
                booking?.hours_worked,
                booking?.hoursWorked,
                booking?.hours_completed,
                booking?.hoursCompleted
              )

              const hoursDoneDerived =
                completedDays && dailyHours
                  ? Math.round(Number(completedDays) * Number(dailyHours) * 10) / 10
                  : null

              const hoursDoneSafe = hoursDoneFromFields != null ? hoursDoneFromFields : hoursDoneDerived

              const hoursRemainingSafe =
                totalHoursSafe != null && hoursDoneSafe != null
                  ? Math.max(0, Math.round((Number(totalHoursSafe) - Number(hoursDoneSafe)) * 10) / 10)
                  : null

              const progressPct =
                totalDaysSafe && totalDaysSafe > 0
                  ? Math.max(0, Math.min(100, (Number(completedDays) / Number(totalDaysSafe)) * 100))
                  : 0

              const formatHoursAsHMSpaced = (hours) => {
                const h = Number(hours)
                if (!Number.isFinite(h) || h < 0) return '—'
                const totalMinutes = Math.max(0, Math.round(h * 60))
                const hh = Math.floor(totalMinutes / 60)
                const mm = totalMinutes % 60
                return `${hh}h ${String(mm).padStart(2, '0')}m`
              }

              const selectedSorted = Array.isArray(selectedDates) ? [...selectedDates].filter(Boolean) : []
              selectedSorted.sort((a, b) => {
                const da = toValidDate(a)
                const db = toValidDate(b)
                if (!da && !db) return 0
                if (!da) return 1
                if (!db) return -1
                return da.getTime() - db.getTime()
              })

              const startOfDayKey = (d) => {
                const dt = toValidDate(d)
                if (!dt) return ''
                return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
              }

              const todayKey = startOfDayKey(today)
              const isTodaySelected = selectedSorted.some((d) => startOfDayKey(d) === todayKey)
              const nextSelected = selectedSorted
                .map((d) => toValidDate(d))
                .filter(Boolean)
                .find((d) => startOfDayKey(d) > todayKey)

              const weekDayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']
              const getWeekStartMonday = (d) => {
                const dt = toValidDate(d)
                if (!dt) return null
                const day = dt.getDay() // 0=Sun
                const diff = (day + 6) % 7 // days since Monday
                const out = new Date(dt)
                out.setHours(0, 0, 0, 0)
                out.setDate(out.getDate() - diff)
                return out
              }

              const weekStart = getWeekStartMonday(today)
              const bookingIdForWeek = String(booking?.id || detail?.id || '').trim()
              const sessionsForWeek = bookingIdForWeek ? (workSessionsByBookingId?.[bookingIdForWeek] || []) : []

              const startOfDay = (d) => {
                const dt = toValidDate(d)
                if (!dt) return null
                const out = new Date(dt)
                out.setHours(0, 0, 0, 0)
                return out
              }

              const isSameDay = (a, b) => {
                const da = startOfDay(a)
                const db = startOfDay(b)
                if (!da || !db) return false
                return da.getTime() === db.getTime()
              }

              const isEligibleForAbsence = (() => {
                const k = String(statusKey || '').trim().toLowerCase()
                return [
                  'accepted',
                  'active',
                  'in_progress',
                  'ongoing',
                  'started',
                  'confirmed',
                  'completed',
                ].includes(k)
              })()

              const getWorkedSecondsFromBooking = () => {
                const candidates = [
                  booking?.worked_seconds,
                  booking?.workedSeconds,
                  booking?.worked_time_seconds,
                  booking?.workedTimeSeconds,
                ]
                for (const v of candidates) {
                  const n = Number(v)
                  if (Number.isFinite(n) && n >= 0) return n
                }
                return 0
              }

              const didWorkOnDay = (dayDate) => {
                const dayStart = startOfDay(dayDate)
                if (!dayStart) return false
                const dayEnd = new Date(dayStart)
                dayEnd.setDate(dayEnd.getDate() + 1)

                const workedSeconds = getWorkedSecondsFromBooking()
                const isToday = isSameDay(dayStart, today)

                // Today: allow worked_seconds > 0 even if started_at is missing.
                if (isToday && workedSeconds > 0) return true

                // Prefer work_sessions: any session started within the day.
                if (Array.isArray(sessionsForWeek) && sessionsForWeek.length) {
                  for (const s of sessionsForWeek) {
                    const st = toValidDate(s?.started_at)
                    if (!st) continue
                    if (st >= dayStart && st < dayEnd) return true
                  }
                }

                // Fallback (bookings mirror)
                const startedAt =
                  toValidDate(
                    booking?.work_started_at ||
                      booking?.workStartedAt ||
                      booking?.started_at ||
                      booking?.startedAt ||
                      null
                  ) || null

                if (!startedAt) return false
                if (startedAt < dayStart || startedAt >= dayEnd) return false

                // Past days require real work recorded.
                if (isToday) return true
                return workedSeconds > 0
              }

              const isInProgressToday = (() => {
                // Prefer work_sessions: any active session (running OR paused)
                if (Array.isArray(sessionsForWeek) && sessionsForWeek.length) {
                  for (const s of sessionsForWeek) {
                    const status = String(s?.status || '').trim().toLowerCase()
                    if (status === 'running' || status === 'paused') return true
                  }
                }

                // Fallback (bookings mirror): running OR paused counts as in progress
                const endedAt =
                  toValidDate(
                    booking?.work_ended_at || booking?.workEndedAt || booking?.ended_at || booking?.endedAt || null
                  ) || null
                if (endedAt) return false

                const startedAt =
                  toValidDate(
                    booking?.work_started_at || booking?.workStartedAt || booking?.started_at || booking?.startedAt || null
                  ) || null
                const pausedAt =
                  toValidDate(
                    booking?.work_paused_at || booking?.workPausedAt || booking?.paused_at || booking?.pausedAt || null
                  ) || null

                if (startedAt && isSameDay(startedAt, today)) return true
                if (pausedAt && isSameDay(pausedAt, today)) return true
                return false
              })()

              const weekCells = weekStart
                ? Array.from({ length: 5 }).map((_, idx) => {
                    const dt = new Date(weekStart)
                    dt.setDate(dt.getDate() + idx)
                    const key = startOfDayKey(dt)
                    const isToday = key && key === todayKey
                    const isFuture = key && key > todayKey

                    let status = 'future'
                    if (!isFuture) {
                      if (isToday) {
                        if (isInProgressToday) status = 'in_progress'
                        else if (didWorkOnDay(dt)) status = 'done'
                        else status = 'empty'
                      } else {
                        if (didWorkOnDay(dt)) status = 'done'
                        else status = isEligibleForAbsence ? 'missed' : 'empty'
                      }
                    }

                    return {
                      label: weekDayLabels[idx],
                      key,
                      status,
                    }
                  })
                : []

              const formatTimeHHMM = (raw) => {
                if (!raw) return '—'
                const s = String(raw).trim()
                const pure = s.match(/^(\d{1,2}):(\d{2})$/)
                if (pure) return `${String(pure[1]).padStart(2, '0')}:${pure[2]}`
                const looksLikeHasTime = /[T\s]\d{2}:\d{2}/.test(s)
                const dt = looksLikeHasTime ? toValidDate(new Date(s)) : toValidDate(raw)
                if (!dt) return '—'
                return dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              }

              const pickTimeLike = (...values) => {
                for (const v of values) {
                  if (v == null) continue
                  const s = String(v).trim()
                  if (!s) continue
                  return s
                }
                return null
              }

              const parseHHMMToMinutes = (hhmm) => {
                const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/)
                if (!m) return null
                const h = Number(m[1])
                const mm = Number(m[2])
                if (!Number.isFinite(h) || !Number.isFinite(mm)) return null
                return h * 60 + mm
              }

              const fmtHMFromMinutes = (minutes) => {
                const total = Number(minutes)
                if (!Number.isFinite(total) || total < 0) return '—'
                const h = Math.floor(total / 60)
                const m = Math.floor(total % 60)
                return `${h}h${String(m).padStart(2, '0')}`
              }

              const bookingIdForConfirm = String(
                booking?.id || booking?.booking_id || booking?.bookingId || detailsRequest?.request?.id || ''
              ).trim()

              const confirmedArrivalRaw = pickTimeLike(
                bookingIdForConfirm ? arrivalConfirmedAtByBookingId?.[bookingIdForConfirm] : null,
                booking?.arrival_confirmed_at,
                booking?.arrivalConfirmedAt,
                booking?.presence_confirmed_at,
                booking?.presenceConfirmedAt,
                booking?.checkin_confirmed_at,
                booking?.checkinConfirmedAt,
                booking?.confirmed_arrival_at,
                booking?.confirmedArrivalAt,
                booking?.client_confirmed_arrival_at,
                booking?.clientConfirmedArrivalAt,
                booking?.client_confirmed_presence_at,
                booking?.clientConfirmedPresenceAt
              )

              const startRaw = pickTimeLike(
                booking?.started_at,
                booking?.startedAt,
                booking?.work_started_at,
                booking?.workStartedAt,
                booking?.start_time,
                booking?.startTime
              )

              const pauseRaw = pickTimeLike(
                booking?.pause_time,
                booking?.pauseTime,
                booking?.paused_at,
                booking?.pausedAt,
                booking?.break_time,
                booking?.breakTime,
                booking?.break_started_at,
                booking?.breakStartedAt
              )

              const endRaw = pickTimeLike(
                booking?.end_time,
                booking?.endTime,
                booking?.ended_at,
                booking?.endedAt,
                booking?.check_out_time,
                booking?.checkOutTime,
                booking?.checkout_at,
                booking?.checkoutAt
              )

              const arrivalLabel = formatTimeHHMM(confirmedArrivalRaw)
              const startLabel = formatTimeHHMM(startRaw)
              const pauseLabel = formatTimeHHMM(pauseRaw)
              const endLabel = formatTimeHHMM(endRaw)

              const workedSecondsRaw = pickNonNegative(
                booking?.worked_seconds,
                booking?.workedSeconds,
                booking?.worked_time_seconds,
                booking?.workedTimeSeconds
              )

              const workedMinutesRaw = pickNonNegative(
                booking?.worked_minutes,
                booking?.workedMinutes,
                booking?.worked_minutes_total,
                booking?.workedMinutesTotal
              )

              const workedHoursRaw = pickNonNegative(
                booking?.worked_hours,
                booking?.workedHours
              )

              const workedMinutes =
                workedMinutesRaw != null
                  ? Number(workedMinutesRaw)
                  : workedSecondsRaw != null
                    ? Math.floor(Number(workedSecondsRaw) / 60)
                    : workedHoursRaw != null
                      ? Math.round(Number(workedHoursRaw) * 60)
                      : null

              const scheduledStartHHMM = (() => {
                const s = String(scheduledTimeRaw || '').trim()
                if (!s) return null
                const m = s.match(/(\d{1,2}:\d{2})\s*[-–]/)
                return m?.[1] ? m[1] : null
              })()

              const delayMinutes = (() => {
                const a = parseHHMMToMinutes(formatTimeHHMM(startRaw))
                const s = parseHHMMToMinutes(scheduledStartHHMM)
                if (a == null || s == null) return null
                return Math.max(0, a - s)
              })()

              const expectedMinutes = dailyHours != null ? Math.round(Number(dailyHours) * 60) : null
              const remainingMinutes =
                expectedMinutes != null && workedMinutes != null
                  ? Math.max(0, expectedMinutes - workedMinutes)
                  : null

              const paidAmount =
                pickNonNegative(
                  booking?.paid_amount,
                  booking?.paidAmount,
                  booking?.amount_paid,
                  booking?.amountPaid,
                  booking?.paid_total,
                  booking?.paidTotal,
                  booking?.paid_value,
                  booking?.paidValue,
                  booking?.already_paid_amount,
                  booking?.alreadyPaidAmount
                ) || 0

              const nextPaymentDate =
                toValidDate(
                  booking?.next_payment_date ||
                    booking?.nextPaymentDate ||
                    booking?.next_payment_at ||
                    booking?.nextPaymentAt ||
                    booking?.upcoming_payment_date ||
                    booking?.upcomingPaymentDate ||
                    booking?.next_charge_date ||
                    booking?.nextChargeDate ||
                    null
                ) || null

              const nextPaymentLabel = (() => {
                if (!nextPaymentDate) return '—'
                const nextKey = startOfDayKey(nextPaymentDate)
                const tomorrow = new Date(today)
                tomorrow.setDate(tomorrow.getDate() + 1)
                const tomorrowKey = startOfDayKey(tomorrow)
                if (nextKey && nextKey === todayKey) return `Hoje (${formatDayMonthPt(nextPaymentDate)})`
                if (nextKey && nextKey === tomorrowKey) return `Amanhã (${formatDayMonthPt(nextPaymentDate)})`
                return formatDayMonthPt(nextPaymentDate)
              })()

              return (
                <div className="h-[90vh] max-h-[90vh] flex flex-col overflow-hidden">
                  <div className="shrink-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70 border-b border-border/60 px-4 pt-4 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="text-base font-semibold text-foreground">Detalhes da solicitação</div>
                      <button
                        type="button"
                        className="h-9 w-9 rounded-full hover:bg-muted/40 flex items-center justify-center"
                        onClick={() => navigate('/work-requests')}
                        aria-label="Fechar"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  {showAcceptedDetailsLayout ? (
                    <>
                      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-4 pb-24">
                        <Card className="p-4 rounded-2xl border-border/60 shadow-md">
                          <div className="mb-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
                            <div className="text-xs text-muted-foreground">
                              Você é:{' '}
                              <span className="font-semibold text-foreground">{viewerRoleLabel}</span> neste serviço
                            </div>
                          </div>

                          <div className="flex items-start gap-3">
                            <div className="h-12 w-12 rounded-full overflow-hidden bg-muted/40 border border-border/40 shrink-0 flex items-center justify-center">
                              {counterpartyAvatar ? (
                                <img src={counterpartyAvatar} alt={displayName} className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-sm font-bold text-muted-foreground">
                                  {String(displayName || 'P').slice(0, 1).toUpperCase()}
                                </span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="text-base font-semibold text-foreground whitespace-normal break-words leading-snug">
                                {counterpartyRoleLabel}: {displayName}
                              </div>
                              {usernameLabel ? (
                                <div className="text-xs text-muted-foreground whitespace-normal break-words">
                                  {usernameLabel}
                                </div>
                              ) : null}

                              <div className={cn('mt-2 flex items-center gap-2 text-sm', isInProgress ? 'text-green-600' : 'text-muted-foreground')}>
                                {isInProgress ? (
                                  <CheckCircle2 className="h-4 w-4" />
                                ) : statusKey === 'pending' ? (
                                  <Hourglass className="h-4 w-4" />
                                ) : (
                                  <BadgeCheck className="h-4 w-4" />
                                )}
                                <span className={cn('font-semibold', isInProgress ? 'text-green-600' : 'text-muted-foreground')}>
                                  {statusInlineLabel}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              size="sm"
                              className="h-10 rounded-md text-xs font-semibold px-3 joby-gradient text-white"
                              onClick={() => {
                                if (!otherUserId) return
                                navigate(`/profile/${otherUserId}`)
                              }}
                              disabled={!otherUserId}
                            >
                              Ver perfil
                            </Button>

                            <Button
                              onClick={() => {
                                if (!otherUserId) return
                                navigate('/messages', {
                                  state: {
                                    startConversationWith: { id: otherUserId },
                                    serviceChat: {
                                      requestId: String(detail?.id || '').trim(),
                                      tab: detailsRequest?.tab || '',
                                    },
                                  },
                                })
                              }}
                              variant="outline"
                              size="sm"
                              className="h-10 rounded-md text-xs px-3"
                              disabled={!otherUserId}
                            >
                              <Send size={14} className="mr-2" />
                              Mensagem
                            </Button>
                          </div>
                        </Card>

                        <Card className="mt-4 p-4 rounded-2xl border-border/60 shadow-md">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-semibold text-foreground">Progresso do serviço</div>
                            <div className="text-2xl font-semibold text-foreground">
                              {Number.isFinite(Number(progressPct)) ? `${Math.round(Number(progressPct))}%` : '0%'}
                            </div>
                          </div>

                          <div className="mt-3 h-2 rounded-full bg-muted/60 overflow-hidden">
                            <div className="h-full joby-gradient rounded-full" style={{ width: `${progressPct}%` }} />
                          </div>

                          <div className="mt-4 rounded-2xl border border-border/60 bg-card/60 p-3">
                            <div className="grid grid-cols-3 divide-x divide-border/60 text-center">
                              <div className="px-2">
                                <div className="text-xl font-semibold text-foreground">
                                  {totalDaysSafe ? `${completedDays || 0} / ${totalDaysSafe}` : '-'}
                                </div>
                                <div className="text-xs text-muted-foreground">Dias concluídos</div>
                              </div>

                              <div className="px-2">
                                <div className="text-xl font-semibold text-foreground">
                                  {hoursDoneSafe != null ? formatHoursAsHMSpaced(hoursDoneSafe) : '—'}
                                </div>
                                <div className="text-xs text-muted-foreground">Horas feitas</div>
                              </div>

                              <div className="px-2">
                                <div className="text-xl font-semibold text-foreground">
                                  {hoursRemainingSafe != null ? formatHoursPt(hoursRemainingSafe) : '—'}
                                </div>
                                <div className="text-xs text-muted-foreground">Restante</div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 border-t border-border/40 pt-3 text-center text-sm text-muted-foreground">
                            Fim previsto:{' '}
                            <span className="font-semibold text-foreground">
                              {endDate ? formatDatePt(endDate) : '-'}
                            </span>
                          </div>
                        </Card>

                        <Card id="work-request-schedule" className="mt-4 p-4 rounded-2xl border-border/60 shadow-md">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-foreground">Hoje ({formatDayMonthPt(today)})</div>

                              <div className="mt-2 flex items-center gap-2 text-sm">
                                <div className="text-foreground font-semibold">
                                  {isTodaySelected && scheduledTimeRaw ? scheduledTimeRaw : scheduledTimeRaw ? scheduledTimeRaw : '-'}
                                </div>
                                {dailyHours ? (
                                  <div className="text-muted-foreground">• {formatHoursPt(dailyHours)} (previsto)</div>
                                ) : null}
                              </div>

                              <div
                                className={cn(
                                  'mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold',
                                  isInProgress ? 'bg-green-600/15 text-green-600' : 'bg-muted/40 text-muted-foreground'
                                )}
                              >
                                {isInProgress ? (
                                  <CheckCircle className="h-4 w-4" />
                                ) : statusKey === 'pending' ? (
                                  <Hourglass className="h-4 w-4" />
                                ) : (
                                  <Clock className="h-4 w-4" />
                                )}
                                <span>
                                  {statusKey === 'pending'
                                    ? 'Aguardando confirmação'
                                    : isInProgress
                                      ? 'Em andamento'
                                      : statusInlineLabel}
                                </span>
                              </div>

                              {weekCells.length ? (
                                <div className="mt-4">
                                  <div className="grid grid-cols-5 gap-2">
                                    {weekCells.map((c) => {
                                      const isToday = c.key === todayKey

                                      const cardClass = cn(
                                        'rounded-xl border p-2 flex flex-col items-center justify-center',
                                        'bg-card/60 border-border/60',
                                        isToday ? 'border-orange-500/60 bg-orange-500/10' : ''
                                      )

                                      const circleClass = cn(
                                        'mt-2 h-10 w-10 rounded-full flex items-center justify-center border',
                                        c.status === 'done'
                                          ? 'bg-green-600/10 border-green-600/30 text-green-600'
                                          : c.status === 'missed'
                                            ? 'bg-destructive/10 border-destructive/30 text-destructive'
                                            : c.status === 'in_progress'
                                              ? 'bg-orange-500/10 border-orange-500/30 text-orange-500'
                                              : 'bg-muted/30 border-border/60 text-muted-foreground'
                                      )

                                      return (
                                        <div key={c.key} className={cardClass}>
                                          <div className="text-[11px] font-semibold text-muted-foreground">
                                            {c.label}
                                          </div>
                                          <div className={circleClass}>
                                            {c.status === 'done' ? (
                                              <CheckCircle className="h-4 w-4" />
                                            ) : c.status === 'missed' ? (
                                              <XCircle className="h-4 w-4" />
                                            ) : c.status === 'in_progress' ? (
                                              <Hourglass className="h-4 w-4" />
                                            ) : (
                                              <span className="text-base leading-none">—</span>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              ) : null}

                              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-muted-foreground">Início</div>
                                  <div className="font-semibold text-foreground">{startLabel}</div>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-muted-foreground">Confirmado</div>
                                  <div className="font-semibold text-foreground">{arrivalLabel}</div>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-muted-foreground">Pausa</div>
                                  <div className="font-semibold text-foreground">{pauseLabel}</div>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-muted-foreground">Saída</div>
                                  <div className="font-semibold text-foreground">{endLabel}</div>
                                </div>
                              </div>

                              <div className="mt-4 rounded-xl border border-border/60 bg-muted/20 p-3">
                                <div className="text-sm font-semibold text-foreground">Rendimento do dia</div>

                                <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                                  <div className="text-muted-foreground">
                                    Horas registradas:{' '}
                                    <span className="font-semibold text-foreground">
                                      {workedMinutes != null ? fmtHMFromMinutes(workedMinutes) : '—'}
                                    </span>
                                  </div>
                                  <div className="text-muted-foreground text-right">
                                    Atraso:{' '}
                                    <span className="font-semibold text-foreground">
                                      {delayMinutes != null ? `${delayMinutes} min` : '—'}
                                    </span>
                                  </div>
                                </div>

                                <div className="mt-2 text-sm text-muted-foreground">
                                  Restante do turno:{' '}
                                  <span className="font-semibold text-foreground">
                                    {remainingMinutes != null ? fmtHMFromMinutes(remainingMinutes) : '—'}
                                  </span>
                                </div>
                              </div>
                          </div>
                        </Card>

                        <Card className="mt-4 p-4 rounded-2xl border-border/60 shadow-md">
                          {(() => {
                            const pctSafe = Math.max(
                              0,
                              Math.min(100, Number.isFinite(Number(progressPct)) ? Number(progressPct) : 0)
                            )
                            const size = 116
                            const stroke = 10
                            const radius = (size - stroke) / 2
                            const circumference = 2 * Math.PI * radius
                            const dashOffset = circumference - (pctSafe / 100) * circumference

                            return (
                              <>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-3 min-w-0">
                                    <div className="mt-0.5 h-10 w-10 rounded-xl border border-border/60 bg-muted/20 flex items-center justify-center shrink-0">
                                      <Wallet className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-base font-semibold text-foreground leading-tight">
                                        Pagamento
                                      </div>
                                      <div className="text-xs text-muted-foreground">Status do serviço</div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/20 px-3 py-2 text-xs font-semibold text-foreground">
                                      <span className="h-2 w-2 rounded-full bg-primary" />
                                      <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                                      <span className="whitespace-nowrap">
                                        {paymentReserved ? 'Aguardando confirmação' : 'A confirmar'}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      className="h-9 w-9 rounded-full border border-border/60 bg-muted/20 inline-flex items-center justify-center"
                                      aria-label="Informações sobre pagamento"
                                    >
                                      <Info className="h-4 w-4 text-muted-foreground" />
                                    </button>
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                                  <div className="space-y-4">
                                    <div>
                                      <div className="text-xs font-semibold tracking-widest text-muted-foreground uppercase inline-flex items-center gap-2">
                                        Valor estimado
                                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border/60">
                                          <Info className="h-3 w-3 text-muted-foreground" />
                                        </span>
                                      </div>
                                      <div className="mt-1 text-2xl font-semibold text-foreground">
                                        {totalValue ? formatBRL(totalValue) : 'R$ --'}
                                      </div>
                                    </div>

                                    <div className="flex gap-3">
                                      <div className="w-1.5 rounded-full bg-primary/70" />
                                      <div className="min-w-0">
                                        <div className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                                          Valor acumulado
                                        </div>
                                        <div className="mt-1 text-3xl font-semibold text-foreground">
                                          {accumulatedValue ? formatBRL(accumulatedValue) : 'R$ --'}
                                        </div>
                                        {realtimeEnabled ? (
                                          <div className="mt-2 inline-flex items-center gap-2 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                            Atualizado em tempo real
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="justify-self-center md:justify-self-end">
                                    <div className="relative h-[116px] w-[116px]">
                                      <svg
                                        width={size}
                                        height={size}
                                        className="h-full w-full -rotate-90"
                                        viewBox={`0 0 ${size} ${size}`}
                                      >
                                        <circle
                                          cx={size / 2}
                                          cy={size / 2}
                                          r={radius}
                                          fill="transparent"
                                          stroke="currentColor"
                                          strokeWidth={stroke}
                                          className="text-muted-foreground/20"
                                        />
                                        <circle
                                          cx={size / 2}
                                          cy={size / 2}
                                          r={radius}
                                          fill="transparent"
                                          stroke="currentColor"
                                          strokeWidth={stroke}
                                          strokeDasharray={circumference}
                                          strokeDashoffset={dashOffset}
                                          strokeLinecap="round"
                                          className="text-primary"
                                        />
                                      </svg>

                                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                        <div className="text-3xl font-semibold text-foreground leading-none">
                                          {Math.round(pctSafe)}%
                                        </div>
                                        <div className="mt-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                                          Concluído
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-5 rounded-2xl border border-border/60 bg-muted/20 p-3">
                                  <div className="grid gap-3 md:grid-cols-2 md:items-center">
                                    <div className="flex items-center gap-3">
                                      <div className="h-11 w-11 rounded-full border border-border/60 bg-background/50 flex items-center justify-center shrink-0">
                                        <Wallet className="h-5 w-5 text-muted-foreground" />
                                      </div>
                                      <div className="min-w-0">
                                        <div className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                                          Já pago
                                        </div>
                                        <div className="text-xl font-semibold text-foreground">{formatBRL(paidAmount)}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {paidAmount ? 'Pagamento realizado' : 'Nenhum pagamento realizado'}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="hidden md:block h-10 w-px bg-border/60 mx-auto" />

                                    <button
                                      type="button"
                                      className="flex items-center justify-between gap-3 w-full text-left bg-transparent p-0"
                                      onClick={() => navigate('/wallet')}
                                      aria-label="Ir para pagamentos"
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className="h-11 w-11 rounded-full border border-border/60 bg-background/50 flex items-center justify-center shrink-0">
                                          <Timer className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <div className="min-w-0">
                                          <div className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                                            Próximo pagamento
                                          </div>
                                          <div className="text-sm font-semibold text-foreground uppercase truncate">
                                            {nextPaymentLabel || '—'}
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            O valor será liberado automaticamente
                                          </div>
                                        </div>
                                      </div>
                                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                    </button>
                                  </div>
                                </div>

                                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                                  <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <div className="truncate">Liberação após confirmação do cliente.</div>
                                </div>
                              </>
                            )
                          })()}
                        </Card>

                        <Card className="mt-4 p-4 rounded-2xl border-border/60 shadow-md">
                          <div className="text-sm font-semibold text-foreground">Local</div>
                          {locationLine ? (
                            <div className="mt-2 text-sm text-muted-foreground">{locationLine}</div>
                          ) : null}
                          <div className="mt-2 flex items-start gap-2 text-sm">
                            <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="text-muted-foreground min-w-0">
                              {addressLineRaw ? (
                                <span className="break-words">{addressLineRaw}</span>
                              ) : (
                                <span>Local não informado</span>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              className="h-10 rounded-md joby-gradient text-white"
                              onClick={openInMaps}
                              disabled={!String(addressLineRaw || locationLine || '').trim()}
                            >
                              Abrir rota
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-10 rounded-md"
                              onClick={shareRoute}
                              disabled={!String(addressLineRaw || locationLine || '').trim()}
                            >
                              Compartilhar
                            </Button>
                          </div>
                        </Card>

                        {mediaItems.length > 0 ? (
                          <div className="mt-4">
                            <div className="text-sm font-semibold text-foreground">Anexos</div>
                            <div className="mt-3 flex items-center gap-2">
                              {mediaItems.slice(0, 3).map((media) => {
                                const url = signedUrlByMediaId?.[media.id]
                                const isVideo = String(media.mediaType || '').toLowerCase() === 'video'
                                return (
                                  <div
                                    key={media.id}
                                    className="h-20 w-20 rounded-lg bg-muted/40 border border-border/40 overflow-hidden shrink-0 flex items-center justify-center"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() =>
                                      setActiveMediaViewer({
                                        mediaId: media.id,
                                        requestId: detail.id,
                                        mediaType: media.mediaType,
                                        caption: media.caption || '',
                                        counterparty: {
                                          name: displayName,
                                          avatar: counterpartyAvatar,
                                        },
                                      })
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        setActiveMediaViewer({
                                          mediaId: media.id,
                                          requestId: detail.id,
                                          mediaType: media.mediaType,
                                          caption: media.caption || '',
                                          counterparty: {
                                            name: displayName,
                                            avatar: counterpartyAvatar,
                                          },
                                        })
                                      }
                                    }}
                                  >
                                    {url ? (
                                      isVideo ? (
                                        <video
                                          src={url}
                                          className="h-full w-full object-cover"
                                          playsInline
                                          preload="metadata"
                                        />
                                      ) : (
                                        <img src={url} alt="Foto" className="h-full w-full object-cover" loading="eager" />
                                      )
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground">Carregando…</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}

                        {canRespond ? (
                          <div className="mt-6 space-y-3">
                            <Button
                              onClick={() => updateBookingStatus({ bookingId: detail.id, nextStatus: 'accepted' })}
                              disabled={updatingId === detail.id}
                              className="w-full h-11 rounded-xl joby-gradient text-primary-foreground"
                            >
                              Aceitar solicitação
                            </Button>
                            <Button
                              variant="outline"
                              className="w-full h-11 rounded-xl"
                              disabled={updatingId === detail.id}
                              onClick={() => updateBookingStatus({ bookingId: detail.id, nextStatus: 'rejected' })}
                            >
                              Recusar
                            </Button>
                          </div>
                        ) : null}

                        <div className="h-3" />
                      </div>

                      <div className="shrink-0 border-t border-border/60 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70 px-4 py-3">
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            className="h-10 rounded-xl"
                            onClick={() => {
                              if (!otherUserId) return
                              navigate('/messages', {
                                state: {
                                  startConversationWith: { id: otherUserId },
                                  serviceChat: {
                                    requestId: String(detail?.id || '').trim(),
                                    tab: detailsRequest?.tab || '',
                                  },
                                },
                              })
                            }}
                            disabled={!otherUserId}
                          >
                            Conversar
                          </Button>
                          <Button
                            className="h-10 rounded-xl joby-gradient text-primary-foreground"
                            onClick={() => {
                              const initialTab = detailsRequest?.tab === 'recebidos' ? 'mine' : 'staff'
                              navigate(`/work-timer/${detail.id}`, {
                                state: {
                                  initialTab,
                                  fromRequestDetails: true,
                                },
                              })
                            }}
                          >
                            Ver serviço
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pt-4 pb-4">
                      <Card className="p-4 rounded-2xl border-border/60 shadow-md">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            <div className="h-10 w-10 rounded-full overflow-hidden bg-muted/40 border border-border/40 shrink-0 flex items-center justify-center">
                              {counterpartyAvatar ? (
                                <img src={counterpartyAvatar} alt={displayName} className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-xs font-bold text-muted-foreground">
                                  {String(displayName || 'P').slice(0, 1).toUpperCase()}
                                </span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-foreground whitespace-normal break-words leading-snug">
                                {displayName}
                              </div>
                              {usernameLabel ? (
                                <div className="text-xs text-muted-foreground whitespace-normal break-words">
                                  {usernameLabel}
                                </div>
                              ) : null}

                              {ratingShown ? (
                                <div className="mt-1 flex items-center gap-2">
                                  <div className="inline-flex items-center">
                                    {Array.from({ length: 5 }).map((_, idx) => {
                                      const filled = idx < ratingRoundedStars
                                      return (
                                        <Star
                                          key={idx}
                                          className={cn(
                                            'h-4 w-4',
                                            filled ? 'text-orange-500' : 'text-muted-foreground/30'
                                          )}
                                          fill={filled ? 'currentColor' : 'none'}
                                        />
                                      )
                                    })}
                                  </div>
                                  <div className="text-xs font-semibold text-foreground">
                                    {Math.round(ratingAvg * 10) / 10}
                                  </div>
                                  {ratingCount ? (
                                    <div className="text-xs text-muted-foreground">
                                      {ratingCount} ({ratingCount})
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="shrink-0">
                            <Badge
                              variant="secondary"
                              className={cn(
                                statusColor,
                                'inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full'
                              )}
                            >
                              <StatusIcon className="w-2.5 h-2.5" />
                              {statusLabel}
                            </Badge>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant="default"
                            size="sm"
                            className="h-9 rounded-md text-xs font-semibold px-3 shadow-sm hover:shadow-md transition"
                            onClick={() => {
                              if (!otherUserId) return
                              navigate(`/profile/${otherUserId}`)
                            }}
                            disabled={!otherUserId}
                          >
                            Ver perfil
                          </Button>

                          <Button
                            onClick={() => {
                              if (!otherUserId) return
                              navigate('/messages', {
                                state: {
                                  startConversationWith: { id: otherUserId },
                                  serviceChat: {
                                    requestId: String(detail?.id || '').trim(),
                                    tab: detailsRequest?.tab || '',
                                  },
                                },
                              })
                            }}
                            variant="outline"
                            size="sm"
                            className="h-9 rounded-md text-xs px-3 shadow-sm hover:shadow-md transition"
                            disabled={!otherUserId}
                          >
                            <Send size={14} className="mr-2" />
                            Mensagem
                          </Button>
                        </div>
                      </Card>

                      <div className="mt-4 space-y-3 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>Início:</span>
                          <span className="font-semibold text-foreground">{formatDatePt(startDateSummary || serviceDateRaw)}</span>
                        </div>

                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>Final:</span>
                          <span className="font-semibold text-foreground">{formatDatePt(endDateSummary || startDateSummary || serviceDateRaw)}</span>
                        </div>

                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>Horário solicitado:</span>
                          <span className="font-semibold text-foreground">
                            {scheduledTimeRaw ? scheduledTimeRaw : '-'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Timer className="h-4 w-4" />
                          <span>Duração total:</span>
                          <span className="font-semibold text-foreground">{totalDurationLabel}</span>
                        </div>
                      </div>

                      <Card className="mt-4 p-4 rounded-2xl border-border/60 shadow-md">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-2 min-w-0">
                            <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                            <div className="text-sm text-foreground min-w-0">
                              {addressLineRaw ? (
                                <span className="break-words">{addressLineRaw}</span>
                              ) : (
                                <span className="text-muted-foreground">Local não informado</span>
                              )}
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-full shrink-0"
                            onClick={openInMaps}
                            disabled={!String(addressLineRaw || locationLine || '').trim()}
                          >
                            Abrir no mapa
                          </Button>
                        </div>
                      </Card>

                      <div className="mt-6">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span>Descrição do cliente</span>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground whitespace-pre-line">
                          {aboutText || 'Sem descrição.'}
                        </div>

                        {(() => {
                          const itemsWithUrl = (mediaItems || [])
                            .map((media) => ({
                              media,
                              url: signedUrlByMediaId?.[media.id],
                              isVideo: String(media?.mediaType || '').toLowerCase() === 'video',
                            }))
                            .filter((x) => Boolean(x.url))

                          if (!itemsWithUrl.length) return null

                          return (
                            <div className="mt-3 flex items-center gap-2">
                              {itemsWithUrl.slice(0, 3).map(({ media, url, isVideo }) => (
                                <div
                                  key={media.id}
                                  className="h-20 w-20 rounded-lg bg-muted/40 border border-border/40 overflow-hidden shrink-0 flex items-center justify-center"
                                  role="button"
                                  tabIndex={0}
                                  onClick={() =>
                                    setActiveMediaViewer({
                                      mediaId: media.id,
                                      requestId: detail.id,
                                      mediaType: media.mediaType,
                                      caption: media.caption || '',
                                      counterparty: {
                                        name: displayName,
                                        avatar: counterpartyAvatar,
                                      },
                                    })
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      setActiveMediaViewer({
                                        mediaId: media.id,
                                        requestId: detail.id,
                                        mediaType: media.mediaType,
                                        caption: media.caption || '',
                                        counterparty: {
                                          name: displayName,
                                          avatar: counterpartyAvatar,
                                        },
                                      })
                                    }
                                  }}
                                >
                                  {isVideo ? (
                                    <video
                                      src={url}
                                      className="h-full w-full object-cover"
                                      playsInline
                                      preload="metadata"
                                    />
                                  ) : (
                                    <img
                                      src={url}
                                      alt="Anexo"
                                      className="h-full w-full object-cover"
                                      loading="eager"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                      </div>

                      <div className="mt-6">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Calculator className="h-4 w-4 text-muted-foreground" />
                          <span>Valores do serviço</span>
                        </div>
                        <Card className="mt-2 p-4 rounded-2xl border-border/60 shadow-md">
                          {(() => {
                            const Row = ({ label, value }) => (
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="text-muted-foreground">{label}</div>
                                <div className="min-w-0 text-right text-foreground">{value}</div>
                              </div>
                            )

                              const durationDaysRaw =
                                pickNumber(
                                  booking?.duration,
                                  booking?.duration_days,
                                  booking?.durationDays,
                                  booking?.total_days,
                                  booking?.totalDays
                                ) ||
                                (Number.isFinite(Number(daysCount)) && Number(daysCount) > 0
                                  ? Number(daysCount)
                                  : null) ||
                                (Number.isFinite(Number(totalDaysSummary)) && Number(totalDaysSummary) > 0
                                  ? Number(totalDaysSummary)
                                  : null)

                              const durationDays =
                                durationDaysRaw && Number.isFinite(Number(durationDaysRaw)) && Number(durationDaysRaw) > 0
                                  ? Number(durationDaysRaw)
                                  : null

                              const hoursPerDay = durationHours
                              const totalHours =
                                hoursPerDay && durationDays
                                  ? roundHours(Number(hoursPerDay) * Number(durationDays))
                                  : null

                              const dailyPrice =
                                basePrice && Number.isFinite(Number(basePrice)) && Number(basePrice) > 0
                                  ? Number(basePrice)
                                  : null

                              const totalContratado =
                                durationDays && dailyPrice
                                  ? Math.round(Number(durationDays) * Number(dailyPrice) * 100) / 100
                                  : null

                              const daysLabel = durationDays
                                ? `${durationDays} dia${durationDays === 1 ? '' : 's'}`
                                : '-'

                            return (
                              <div className="space-y-2">
                                <Row label="Horas por dia:" value={hoursPerDay ? formatHoursPt(hoursPerDay) : '-'} />
                                <Row label="Duração:" value={daysLabel} />
                                <Row
                                  label="Total de horas:"
                                  value={
                                    hoursPerDay && durationDays && totalHours ? (
                                      <div className="text-right leading-5 min-w-0">
                                        <span className="text-muted-foreground break-words">
                                          {formatHoursPt(hoursPerDay)} × {daysLabel}
                                        </span>
                                        <span className="font-semibold text-foreground whitespace-nowrap">
                                          {' '}
                                          = {formatHoursPt(totalHours)}
                                        </span>
                                      </div>
                                    ) : (
                                      '-'
                                    )
                                  }
                                />
                                <Row
                                  label="Total estimado:"
                                  value={
                                    durationDays && dailyPrice && totalContratado != null ? (
                                      <div className="text-right leading-5 min-w-0">
                                        <span className="text-muted-foreground break-words">
                                          {daysLabel} × {formatBRL(dailyPrice)}
                                        </span>
                                        <span className="font-semibold text-foreground whitespace-nowrap">
                                          {' '}
                                          = {formatBRL(totalContratado)}
                                        </span>
                                      </div>
                                    ) : (
                                      '-'
                                    )
                                  }
                                />
                              </div>
                            )
                          })()}
                        </Card>
                      </div>

                      <div className="mt-5 space-y-2 text-xs text-muted-foreground">
                        <div className="flex items-start gap-2">
                          <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-semibold text-foreground">Hora extra:</span> Só cobra se passar do horário
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-semibold text-foreground">Cancelamento:</span> Se cancelar em cima da hora pode ter penalidade
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Wallet className="h-4 w-4 mt-0.5 shrink-0" />
                          <div>
                            <span className="font-semibold text-foreground">Pagamento:</span> Cliente só paga quando você aceitar
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 space-y-3">
                        {canRespond ? (
                          <>
                            <Button
                              onClick={() => updateBookingStatus({ bookingId: detail.id, nextStatus: 'accepted' })}
                              disabled={updatingId === detail.id}
                              className="w-full h-11 rounded-xl joby-gradient text-primary-foreground"
                            >
                              Aceitar solicitação
                            </Button>
                            <Button
                              variant="outline"
                              className="w-full h-11 rounded-xl"
                              disabled={updatingId === detail.id}
                              onClick={() => updateBookingStatus({ bookingId: detail.id, nextStatus: 'rejected' })}
                            >
                              Recusar
                            </Button>
                          </>
                        ) : canCancel ? (
                          <>
                            <Button
                              onClick={() => {
                                if (!canEdit) return
                                // Fecha a tela de detalhes antes de abrir o editor.
                                navigate('/work-requests')
                                openEditRequest(detail)
                              }}
                              disabled={updatingId === detail.id}
                              className="w-full h-11 rounded-xl joby-gradient text-primary-foreground"
                            >
                              Editar solicitação
                            </Button>
                            <Button
                              onClick={() => updateBookingStatus({ bookingId: detail.id, nextStatus: 'cancelled' })}
                              disabled={updatingId === detail.id}
                              variant="outline"
                              className="w-full h-11 rounded-xl"
                            >
                              Cancelar solicitação
                            </Button>
                          </>
                        ) : null}
                      </div>

                      <div className="h-3" />
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      ) : null}

      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open)
          if (!open) setDeleteConfirmTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar solicitação?</AlertDialogTitle>
            <AlertDialogDescription>
              <div>
                Isso remove a solicitação e apaga a conversa associada. Essa ação não pode ser desfeita.
              </div>
              <div className="mt-3 flex items-start gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <span>Atenção: todas as mensagens desse chat serão apagadas.</span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingId || updatingId)}>
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={Boolean(!deleteConfirmTarget?.id || deletingId || updatingId)}
              onClick={() => {
                const target = deleteConfirmTarget
                if (!target?.id) return
                if (target.status === 'rejected') {
                  deleteRejectedBooking(target.id)
                } else {
                  deleteBooking({ bookingId: target.id, expectedStatus: target.status })
                }
              }}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ServiceDetailsModal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false)
          setEditBooking(null)
          setEditService(null)
          setEditProfessional(null)
        }}
        service={editService}
        professional={editProfessional}
        editingBooking={editBooking}
        onRequestUpdated={async () => {
          await loadRequests()
        }}
      />

      {mediaViewerOverlay}
    </motion.div>
  )
}

export default WorkRequests
