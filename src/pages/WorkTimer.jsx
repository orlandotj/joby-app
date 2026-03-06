import React, { useRef, useState, useEffect, useId } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/components/ui/use-toast'
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
  Play,
  Pause,
  CheckCircle2,
  MoreVertical,
  Clock,
  Hourglass,
  Lock,
  StopCircle,
  Users,
  AlertTriangle,
  MessageSquare,
  Briefcase,
  CalendarDays,
  MapPin,
  ChevronRight,
  Wallet,
  Eye,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { log } from '@/lib/logger'
import { createNotification } from '@/services/notificationService'
import {
  computeElapsedSecondsFromSession,
  computeLiveAmountFromSession,
  finishWorkSession,
  fetchWorkSessionEventsForSession,
  fetchWorkSessionEventsForSessions,
  fetchActiveWorkSessionForBooking,
  fetchWorkSessionsForBooking,
  fetchLatestWorkSessionsForBookings,
  pauseWorkSession,
  resumeWorkSession,
  startWorkSession,
  subscribeToWorkSessionByBooking,
} from '@/services/workSessionService'
import WorkDetailsModal from '@/components/WorkDetailsModal'

const formatCurrency = (value) => {
  const n = Number(value)
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(n) ? n : 0)
}

const isUuid = (value) => {
  const s = String(value || '').trim()
  if (!s) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

const isBlockedWorkStatus = (raw) => {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return false
  if (s === 'pending' || s.includes('pendente')) return true
  if (s.includes('cancel') || s.includes('archiv')) return true
  return false
}

const isFinalizedWorkStatus = (raw) => {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return false
  if (s === 'completed' || s.includes('complet')) return true
  if (s.includes('conclu') || s.includes('finaliz') || s.includes('finalized')) return true
  if (s.includes('done') || s.includes('finished')) return true
  return false
}

const isAcceptedWorkStatus = (raw) => {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return false

  // Bookings/requests in this app typically use: pending / accepted / completed.
  if (isBlockedWorkStatus(s)) return false

  // Allow states like "Aguardando início" (waiting to start).
  if (s.includes('aguard') && (s.includes('inici') || s.includes('inicio'))) return true

  // Allow accepted or already running.
  if (s === 'accepted' || s.includes('accept') || s.includes('aceit')) return true
  if (s.includes('in_progress') || s.includes('andamento') || s.includes('em andamento')) return true
  if (s.includes('confirm')) return true

  // Also treat completed services as valid/accepted for history/calendar.
  if (s === 'completed' || s.includes('complet')) return true
  if (s.includes('conclu') || s.includes('finaliz') || s.includes('finalized')) return true
  if (s.includes('done') || s.includes('finished')) return true

  return false
}

const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0')
  const m = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

const formatHoursMinutesShort = (seconds) => {
  const totalMinutes = Math.max(0, Math.floor((Number(seconds) || 0) / 60))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h <= 0) return `${m}min`
  if (m <= 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

const formatHoursMinutesLong = (seconds) => {
  const totalMinutes = Math.max(0, Math.floor((Number(seconds) || 0) / 60))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h <= 0) return `${m}min`
  if (m <= 0) return `${h}h`
  return `${h}h ${m}min`
}

const formatMinutesSecondsLong = (seconds) => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const m = Math.floor(s / 60)
  const ss = s % 60
  if (m <= 0) return `${ss} s`
  return `${m} min ${ss} s`
}

const formatHoursColonMinutes = (seconds) => {
  const totalMinutes = Math.max(0, Math.floor((Number(seconds) || 0) / 60))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

const pickFirstNonEmptyString = (...candidates) => {
  for (const c of candidates) {
    const s = c == null ? '' : String(c).trim()
    if (s) return s
  }
  return ''
}

const clamp01 = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

const polarToCartesian = (cx, cy, r, angleDeg) => {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(a),
    y: cy + r * Math.sin(a),
  }
}

// Angles in degrees with 0 at 12 o'clock, increasing clockwise.
const describeArc = (cx, cy, r, startAngle, endAngle) => {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const arcSweep = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${arcSweep} 0 ${end.x} ${end.y}`
}

const buildAddressQueryFromBooking = (booking) => {
  const b = booking || {}
  const addr = b?.address || b?.endereco || null
  const line1 = pickFirstNonEmptyString(
    b?.address_line,
    b?.addressLine,
    b?.address_line1,
    b?.addressLine1,
    addr?.line,
    addr?.line1,
    addr?.street
  )
  const number = pickFirstNonEmptyString(
    b?.address_number,
    b?.addressNumber,
    addr?.number
  )
  const neighborhood = pickFirstNonEmptyString(
    b?.address_neighborhood,
    b?.addressNeighborhood,
    b?.bairro,
    b?.neighborhood,
    addr?.neighborhood,
    addr?.bairro
  )
  const city = pickFirstNonEmptyString(
    b?.address_city,
    b?.addressCity,
    b?.city,
    addr?.city
  )
  const state = pickFirstNonEmptyString(
    b?.address_state,
    b?.addressState,
    b?.state,
    addr?.state,
    addr?.uf
  )

  const parts = [
    [line1, number].filter(Boolean).join(', '),
    neighborhood,
    [city, state].filter(Boolean).join(' - '),
  ].filter(Boolean)
  return parts.join(', ')
}

const minutesToHHMM = (minutes) => {
  const m = Number(minutes)
  if (!Number.isFinite(m)) return ''
  const h = Math.floor(m / 60)
  const mm = Math.floor(m % 60)
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

const formatTodayScheduleLine = (scheduledTimeRaw) => {
  const t =
    typeof scheduledTimeRaw === 'string'
      ? scheduledTimeRaw
      : JSON.stringify(scheduledTimeRaw || '')
  const re =
    /\b(\d{1,2}(?::\d{2}|h\d{0,2}))\s*(?:[-–]|a\s*s|às|as|a|at[eé]|ate)\s*(\d{1,2}(?::\d{2}|h\d{0,2}))\b/i
  const m = String(t || '').match(re)
  if (!m) return ''
  const s = timeToMinutesHHMM(m[1])
  const e = timeToMinutesHHMM(m[2])
  if (s == null || e == null) {
    return String(m[0] || '').replace(/\s*-\s*/g, '—').replace(/\s*–\s*/g, '—')
  }
  return `${minutesToHHMM(s)}—${minutesToHHMM(e)}`
}

const getScheduleStartMinutesFromRaw = (scheduledTimeRaw) => {
  const t =
    typeof scheduledTimeRaw === 'string'
      ? scheduledTimeRaw
      : JSON.stringify(scheduledTimeRaw || '')
  const re =
    /\b(\d{1,2}(?::\d{2}|h\d{0,2}))\s*(?:[-–]|a\s*s|às|as|a|at[eé]|ate)\s*(\d{1,2}(?::\d{2}|h\d{0,2}))\b/i
  const m = String(t || '').match(re)
  if (!m) return null
  return timeToMinutesHHMM(m[1])
}

const monthLabelPtBr = (d) => {
  try {
    const fmt = new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
      year: 'numeric',
    })
    const raw = fmt.format(d)
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : ''
  } catch {
    return ''
  }
}

const dayKey = (date) => {
  const dt = new Date(date)
  dt.setHours(0, 0, 0, 0)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate()
  ).padStart(2, '0')}`
}

const buildAgendaDaysGrid = (monthStartDate) => {
  const year = monthStartDate.getFullYear()
  const month = monthStartDate.getMonth()
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const daysInMonth = last.getDate()

  // pt-BR: semana começa no Domingo (D)
  const startOffset = first.getDay() // 0=Sun

  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

const EMPTY_AGENDA = {
  plannedHoursTotal: 0,
  doneHoursTotal: 0,
  plannedDaysTotal: 0,
  doneDaysTotal: 0,
  entries: [],
  byDay: {},
  plannedByDay: {},
}

const toValidDate = (raw) => {
  if (!raw) return null
  try {
    if (raw instanceof Date) {
      if (Number.isNaN(raw.getTime())) return null
      return raw
    }

    // Important: date-only strings like "2026-02-25" are parsed as UTC by JS,
    // which shifts the day for many timezones (e.g. Brazil). Treat as local date.
    if (typeof raw === 'string') {
      const s = raw.trim()
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (m) {
        const y = Number(m[1])
        const mo = Number(m[2])
        const da = Number(m[3])
        if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(da)) {
          const dLocal = new Date(y, mo - 1, da)
          if (!Number.isNaN(dLocal.getTime())) return dLocal
        }
      }
    }

    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return null
    return d
  } catch {
    return null
  }
}

const pickNonNegative = (...values) => {
  for (const v of values) {
    const n = Number(v)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return null
}

const getDisplayName = (profile) => {
  const p = profile || {}
  if (p?.username) return `@${p.username}`
  if (p?.name) return p.name
  return ''
}

const timeToMinutesHHMM = (hhmm) => {
  const raw = String(hhmm || '').trim().toLowerCase()
  if (!raw) return null
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

const parseTimeRangesFromRaw = (scheduledTimeRaw) => {
  const t =
    typeof scheduledTimeRaw === 'string'
      ? scheduledTimeRaw
      : JSON.stringify(scheduledTimeRaw || '')
  const re = /\b(\d{1,2}(?::\d{2}|h\d{0,2}))\s*(?:[-–]|a\s*s|às|as|a|at[eé]|ate)\s*(\d{1,2}(?::\d{2}|h\d{0,2}))\b/gi
  const matches = Array.from(String(t || '').matchAll(re))
  const ranges = []
  for (const m of matches) {
    const s = timeToMinutesHHMM(m[1])
    const e = timeToMinutesHHMM(m[2])
    if (s == null || e == null) continue
    ranges.push({ startMin: s, endMin: e })
  }
  return ranges
}

const clampDate = (d, min, max) => {
  const t = d.getTime()
  return new Date(Math.max(min.getTime(), Math.min(max.getTime(), t)))
}

const intersectSeconds = (aStart, aEnd, bStart, bEnd) => {
  const s = Math.max(aStart.getTime(), bStart.getTime())
  const e = Math.min(aEnd.getTime(), bEnd.getTime())
  return Math.max(0, Math.floor((e - s) / 1000))
}

const buildDaySegments = ({ date, scheduledTimeRaw }) => {
  const ranges = parseTimeRangesFromRaw(scheduledTimeRaw)
  const base = new Date(date)
  base.setHours(0, 0, 0, 0)

  const noon = new Date(base)
  noon.setHours(12, 0, 0, 0)
  const endOfDay = new Date(base)
  endOfDay.setDate(endOfDay.getDate() + 1)

  const makeWindow = (startMin, endMin) => {
    const s = new Date(base)
    s.setMinutes(startMin)
    s.setSeconds(0, 0)
    const e = new Date(base)
    e.setMinutes(endMin)
    e.setSeconds(0, 0)
    if (endMin < startMin) e.setDate(e.getDate() + 1)
    return { start: s, end: e }
  }

  const plannedSecondsInWindow = (windowStart, windowEnd) => {
    let secs = 0
    for (const r of ranges) {
      const w = makeWindow(r.startMin, r.endMin)
      secs += intersectSeconds(w.start, w.end, windowStart, windowEnd)
    }
    return secs
  }

  const morningPlanned = plannedSecondsInWindow(base, noon)
  const afternoonPlanned = plannedSecondsInWindow(noon, endOfDay)

  return {
    base,
    noon,
    endOfDay,
    morning: { label: 'Manhã', windowStart: base, windowEnd: noon, plannedSeconds: morningPlanned },
    afternoon: { label: 'Tarde', windowStart: noon, windowEnd: endOfDay, plannedSeconds: afternoonPlanned },
  }
}

const computeWorkedSecondsInWindow = ({ sessions = [], openSession = null, windowStart, windowEnd }) => {
  const normalized = []
  for (const s of sessions || []) {
    const st = toValidDate(s?.start)
    const en = toValidDate(s?.end)
    if (!st || !en) continue
    normalized.push({ start: st, end: en })
  }
  if (openSession?.start && openSession?.end) {
    const st = toValidDate(openSession.start)
    const en = toValidDate(openSession.end)
    if (st && en) normalized.push({ start: st, end: en })
  }

  let secs = 0
  for (const s of normalized) {
    const start = clampDate(s.start, windowStart, windowEnd)
    const end = clampDate(s.end, windowStart, windowEnd)
    secs += intersectSeconds(start, end, windowStart, windowEnd)
  }
  return secs
}

const buildWorkedSegmentsFromDb = (
  { sessions = [], eventsBySessionId = {}, now = new Date(), pauseOverride = null } = {}
) => {
  const segs = []
  const nowDate = now instanceof Date ? now : new Date(now)
  const pauseOverrideDate = toValidDate(pauseOverride)
  const effectiveNowForRunning =
    pauseOverrideDate && pauseOverrideDate.getTime() <= nowDate.getTime() ? pauseOverrideDate : nowDate

  for (const row of Array.isArray(sessions) ? sessions : []) {
    const sid = String(row?.id || '').trim()
    const events = sid && eventsBySessionId ? eventsBySessionId[sid] : null
    const eventsList = Array.isArray(events) ? events : []

    if (eventsList.length) {
      let working = false
      let currentStart = null

      for (const ev of eventsList) {
        const t = toValidDate(ev?.occurred_at || ev?.occurredAt || ev?.created_at || ev?.createdAt)
        if (!t) continue
        const type = String(ev?.event_type || ev?.eventType || '').trim().toLowerCase()

        if (type === 'start' || type === 'resume') {
          if (!working) {
            working = true
            currentStart = t
          }
          continue
        }

        if (type === 'pause' || type === 'finish') {
          if (working && currentStart && t.getTime() > currentStart.getTime()) {
            segs.push({ start: currentStart.toISOString(), end: t.toISOString() })
          }
          working = false
          currentStart = null
        }
      }

      if (working && currentStart) {
        const status = String(row?.status || '').trim().toLowerCase()
        const endRaw =
          status === 'finished'
            ? row?.finished_at
            : status === 'paused'
              ? row?.paused_at
              : effectiveNowForRunning
        const end = toValidDate(endRaw)
        if (end && end.getTime() > currentStart.getTime()) {
          segs.push({ start: currentStart.toISOString(), end: end.toISOString() })
        }
      }

      continue
    }

    const st = toValidDate(row?.started_at)
    if (!st) continue
    const status = String(row?.status || '').trim().toLowerCase()
    const endRaw =
      status === 'finished'
        ? row?.finished_at
        : status === 'paused'
          ? row?.paused_at
          : status === 'running'
            ? effectiveNowForRunning
            : row?.finished_at || row?.paused_at || null
    const en = toValidDate(endRaw)
    if (!en) continue
    if (en.getTime() <= st.getTime()) continue
    segs.push({ start: st.toISOString(), end: en.toISOString() })
  }

  segs.sort((a, b) => {
    const at = toValidDate(a?.start)?.getTime() || 0
    const bt = toValidDate(b?.start)?.getTime() || 0
    if (at !== bt) return at - bt
    return String(a?.end || '').localeCompare(String(b?.end || ''))
  })

  return segs
}

const describeSegment = ({ plannedSeconds, workedSeconds, segmentEnd, now }) => {
  if (!plannedSeconds) return { status: 'none', label: '—' }
  if (workedSeconds > 0) return { status: 'worked', label: `Trabalhou ${formatHoursMinutesShort(workedSeconds)}` }
  const missed = now.getTime() > segmentEnd.getTime()
  return missed ? { status: 'missed', label: 'Faltou' } : { status: 'scheduled', label: 'Agendado' }
}

const getSelectedDatesFromBooking = (booking) => {
  const b = booking || {}

  const parseScheduleDate = (value) => {
    if (!value) return null
    if (value instanceof Date) return toValidDate(value)

    if (typeof value === 'string') {
      const s = value.trim()
      if (!s) return null

      // Prefer extracting the day portion and treat it as local date.
      const isoDay = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (isoDay) {
        const y = Number(isoDay[1])
        const mo = Number(isoDay[2])
        const da = Number(isoDay[3])
        if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(da)) {
          const dLocal = new Date(y, mo - 1, da)
          if (!Number.isNaN(dLocal.getTime())) return dLocal
        }
      }

      // Support common pt-BR formats like 25/02/2026 or 25-02-2026
      const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
      if (br) {
        const da = Number(br[1])
        const mo = Number(br[2])
        const y = Number(br[3])
        if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(da)) {
          const dLocal = new Date(y, mo - 1, da)
          if (!Number.isNaN(dLocal.getTime())) return dLocal
        }
      }

      return toValidDate(s)
    }

    if (value && typeof value === 'object') {
      return parseScheduleDate(value.date || value.day || value.value)
    }

    return toValidDate(value)
  }

  const normalizeToArray = (value) => {
    if (!value) return null
    if (Array.isArray(value)) return value

    if (typeof value === 'string') {
      const s = value.trim()
      if (!s) return null
      try {
        const parsed = JSON.parse(s)
        if (Array.isArray(parsed)) return parsed
        if (parsed && typeof parsed === 'object') {
          const inner =
            parsed.dates || parsed.days || parsed.selected_dates || parsed.selectedDates || parsed.values || null
          if (Array.isArray(inner)) return inner
        }
      } catch {
        return null
      }
      return null
    }

    if (value && typeof value === 'object') {
      const inner = value.dates || value.days || value.values || value.selected_dates || value.selectedDates || null
      if (Array.isArray(inner)) return inner
    }

    return null
  }

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

    // Nested (when booking is fetched with related request)
    b?.service_request?.selected_dates,
    b?.service_request?.selectedDates,
    b?.service_request?.selected_days,
    b?.service_request?.selectedDays,
    b?.service_request?.days_selected,
    b?.service_request?.daysSelected,
    b?.service_request?.dates_selected,
    b?.service_request?.datesSelected,
    b?.service_request?.work_dates,
    b?.service_request?.workDates,
    b?.service_request?.work_days,
    b?.service_request?.workDays,
    b?.service_request?.schedule_dates,
    b?.service_request?.scheduleDates,
    b?.service_request?.schedule_days,
    b?.service_request?.scheduleDays,
    b?.service_request?.agenda_dates,
    b?.service_request?.agendaDates,
    b?.service_request?.agenda_days,
    b?.service_request?.agendaDays,
    b?.service_request?.days,
    b?.service_request?.dates,
    b?.serviceRequest?.selected_dates,
    b?.serviceRequest?.selectedDates,
    b?.serviceRequest?.selected_days,
    b?.serviceRequest?.selectedDays,
    b?.serviceRequest?.days_selected,
    b?.serviceRequest?.daysSelected,
    b?.serviceRequest?.dates_selected,
    b?.serviceRequest?.datesSelected,
    b?.serviceRequest?.work_dates,
    b?.serviceRequest?.workDates,
    b?.serviceRequest?.work_days,
    b?.serviceRequest?.workDays,
    b?.serviceRequest?.schedule_dates,
    b?.serviceRequest?.scheduleDates,
    b?.serviceRequest?.schedule_days,
    b?.serviceRequest?.scheduleDays,
    b?.serviceRequest?.agenda_dates,
    b?.serviceRequest?.agendaDates,
    b?.serviceRequest?.agenda_days,
    b?.serviceRequest?.agendaDays,
    b?.serviceRequest?.days,
    b?.serviceRequest?.dates,
  ]
  for (const c of candidates) {
    const arr = normalizeToArray(c)
    if (!Array.isArray(arr) || !arr.length) continue
    const dates = arr
      .map((x) => {
        return parseScheduleDate(x)
      })
      .filter(Boolean)
    if (dates.length) return dates
  }

  const start = parseScheduleDate(
    b.start_date ||
      b.startDate ||
      b.scheduled_date ||
      b.scheduledDate ||
      b?.service_request?.start_date ||
      b?.service_request?.startDate ||
      b?.service_request?.scheduled_date ||
      b?.service_request?.scheduledDate ||
      b?.service_request?.date ||
      b?.serviceRequest?.start_date ||
      b?.serviceRequest?.startDate ||
      b?.serviceRequest?.scheduled_date ||
      b?.serviceRequest?.scheduledDate ||
      b?.serviceRequest?.date
  )
  const end = parseScheduleDate(
    b.end_date ||
      b.endDate ||
      b.scheduled_end_date ||
      b.scheduledEndDate ||
      b?.service_request?.end_date ||
      b?.service_request?.endDate ||
      b?.service_request?.scheduled_end_date ||
      b?.service_request?.scheduledEndDate ||
      b?.serviceRequest?.end_date ||
      b?.serviceRequest?.endDate ||
      b?.serviceRequest?.scheduled_end_date ||
      b?.serviceRequest?.scheduledEndDate
  )

  // If we have a start/end range, build the day list (inclusive).
  if (start && end) {
    const s0 = new Date(start)
    const e0 = new Date(end)
    s0.setHours(0, 0, 0, 0)
    e0.setHours(0, 0, 0, 0)
    const diffDays = Math.round((e0.getTime() - s0.getTime()) / (24 * 60 * 60 * 1000))
    if (Number.isFinite(diffDays) && diffDays >= 0 && diffDays <= 366) {
      const out = []
      for (let i = 0; i <= diffDays; i++) {
        const d = new Date(s0)
        d.setDate(d.getDate() + i)
        out.push(d)
      }
      if (out.length) return out
    }
  }

  const primitiveOrNull = (v) => {
    if (v == null) return null
    if (Array.isArray(v)) return null
    if (typeof v === 'object') return null
    return v
  }

  // Fallback: start date + number of days
  const daysCount =
    pickNonNegative(
      primitiveOrNull(b?.days_count),
      primitiveOrNull(b?.daysCount),
      primitiveOrNull(b?.total_days),
      primitiveOrNull(b?.totalDays),
      primitiveOrNull(b?.duration_days),
      primitiveOrNull(b?.durationDays),
      primitiveOrNull(b?.dias),
      primitiveOrNull(b?.qtd_dias),
      primitiveOrNull(b?.quantidade_dias),
      primitiveOrNull(b?.selected_days_count),
      primitiveOrNull(b?.selectedDaysCount),
      // Sometimes these fields store the count (not an array)
      primitiveOrNull(b?.selected_days),
      primitiveOrNull(b?.selectedDays),
      primitiveOrNull(b?.days_selected),
      primitiveOrNull(b?.daysSelected),
      primitiveOrNull(b?.days),
      // Nested request
      primitiveOrNull(b?.service_request?.duration_days),
      primitiveOrNull(b?.service_request?.durationDays),
      primitiveOrNull(b?.service_request?.total_days),
      primitiveOrNull(b?.service_request?.totalDays),
      primitiveOrNull(b?.service_request?.dias),
      primitiveOrNull(b?.service_request?.qtd_dias),
      primitiveOrNull(b?.service_request?.quantidade_dias),
      primitiveOrNull(b?.service_request?.selected_days),
      primitiveOrNull(b?.service_request?.selectedDays),
      primitiveOrNull(b?.service_request?.days),
      primitiveOrNull(b?.serviceRequest?.duration_days),
      primitiveOrNull(b?.serviceRequest?.durationDays),
      primitiveOrNull(b?.serviceRequest?.total_days),
      primitiveOrNull(b?.serviceRequest?.totalDays),
      primitiveOrNull(b?.serviceRequest?.dias),
      primitiveOrNull(b?.serviceRequest?.qtd_dias),
      primitiveOrNull(b?.serviceRequest?.quantidade_dias),
      primitiveOrNull(b?.serviceRequest?.selected_days),
      primitiveOrNull(b?.serviceRequest?.selectedDays),
      primitiveOrNull(b?.serviceRequest?.days)
    ) ?? null
  if (start && daysCount != null) {
    const n = Math.floor(Number(daysCount))
    if (Number.isFinite(n) && n > 0 && n <= 366) {
      const s0 = new Date(start)
      s0.setHours(0, 0, 0, 0)
      const out = []
      for (let i = 0; i < n; i++) {
        const d = new Date(s0)
        d.setDate(d.getDate() + i)
        out.push(d)
      }
      if (out.length) return out
    }
  }

  return start ? [start] : []
}

const formatAgendaLabelPt = (date) => {
  try {
    const d = date instanceof Date ? date : new Date(date)
    if (Number.isNaN(d.getTime())) return ''
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(d)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${weekday}, ${dd}/${mm}`
  } catch {
    return ''
  }
}

const computeAgendaFromBooking = ({
  booking,
  elapsedTimeSeconds = 0,
  isActive = false,
  isPaused = false,
  startTime = null,
  sessions = [],
} = {}) => {
  if (!booking) return EMPTY_AGENDA

  const buildWorkedSecondsByDay = ({ sessions = [], openSession = null } = {}) => {
    const map = {}
    const normalized = []

    for (const s of Array.isArray(sessions) ? sessions : []) {
      const st = toValidDate(s?.start)
      const en = toValidDate(s?.end)
      if (!st || !en) continue
      if (en.getTime() <= st.getTime()) continue
      normalized.push({ start: st, end: en })
    }
    if (openSession?.start && openSession?.end) {
      const st = toValidDate(openSession.start)
      const en = toValidDate(openSession.end)
      if (st && en && en.getTime() > st.getTime()) normalized.push({ start: st, end: en })
    }

    for (const seg of normalized) {
      let cur = new Date(seg.start)
      const end = new Date(seg.end)
      while (cur.getTime() < end.getTime()) {
        const nextMidnight = new Date(cur)
        nextMidnight.setHours(24, 0, 0, 0)
        const chunkEnd = nextMidnight.getTime() < end.getTime() ? nextMidnight : end
        const secs = Math.max(0, Math.floor((chunkEnd.getTime() - cur.getTime()) / 1000))
        if (secs > 0) {
          const k = dayKey(cur)
          map[k] = (map[k] || 0) + secs
        }
        cur = chunkEnd
      }
    }

    return map
  }

  const openSessionForAgenda =
    isActive && !isPaused && startTime
      ? { start: startTime instanceof Date ? startTime.toISOString() : startTime, end: new Date().toISOString() }
      : null
  const workedSecondsByDay = buildWorkedSecondsByDay({ sessions, openSession: openSessionForAgenda })

  const selectedDates = getSelectedDatesFromBooking(booking)
  const plannedByDay = {}
  for (const dt of Array.isArray(selectedDates) ? selectedDates : []) {
    try {
      plannedByDay[dayKey(dt)] = true
    } catch {
      // ignore
    }
  }
  const scheduledTimeRaw = booking?.scheduled_time || booking?.scheduledTime
  const scheduledTimeText = typeof scheduledTimeRaw === 'string' ? scheduledTimeRaw : JSON.stringify(scheduledTimeRaw || '')
  const perDayMinutes = sumMinutesFromTimeRanges(scheduledTimeText)
  const perDayHours = perDayMinutes > 0 ? Math.round((perDayMinutes / 60) * 10) / 10 : 0
  const plannedDaysTotal = selectedDates.length
  const plannedHoursTotal = perDayHours > 0 ? Math.round(perDayHours * plannedDaysTotal * 10) / 10 : 0

  const workedHoursFromDb =
    pickNonNegative(
      booking?.worked_hours,
      booking?.workedHours,
      booking?.hours_worked,
      booking?.hoursWorked
    ) ??
    (pickNonNegative(
      booking?.worked_minutes,
      booking?.workedMinutes,
      booking?.worked_minutes_total,
      booking?.workedMinutesTotal
    ) != null
      ? (pickNonNegative(
          booking?.worked_minutes,
          booking?.workedMinutes,
          booking?.worked_minutes_total,
          booking?.workedMinutesTotal
        ) || 0) / 60
      : null) ??
    (pickNonNegative(
      booking?.worked_seconds,
      booking?.workedSeconds,
      booking?.seconds_worked,
      booking?.secondsWorked
    ) != null
      ? (pickNonNegative(
          booking?.worked_seconds,
          booking?.workedSeconds,
          booking?.seconds_worked,
          booking?.secondsWorked
        ) || 0) / 3600
      : null)

  const liveHours = Math.round(((Number(elapsedTimeSeconds) || 0) / 3600) * 10) / 10
  const doneHoursTotal = Math.max(
    0,
    Math.round(((workedHoursFromDb ?? 0) > liveHours ? workedHoursFromDb ?? 0 : liveHours) * 10) / 10
  )

  const hasAnyRecordedWork =
    (workedHoursFromDb ?? 0) > 0 ||
    (Number(elapsedTimeSeconds) || 0) > 0 ||
    (Array.isArray(sessions) && sessions.length > 0) ||
    (!!startTime && isActive && !isPaused)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const entries = selectedDates
    .slice()
    .sort((a, b) => b.getTime() - a.getTime())
    .map((dt) => {
      const d0 = new Date(dt)
      d0.setHours(0, 0, 0, 0)
      const isToday = d0.getTime() === today.getTime()
      const isPast = d0.getTime() < today.getTime()

      const openSession =
        isActive && !isPaused && startTime
          ? { start: startTime instanceof Date ? startTime.toISOString() : startTime, end: new Date().toISOString() }
          : null

      const seg = buildDaySegments({ date: d0, scheduledTimeRaw })
      const workedMorning = computeWorkedSecondsInWindow({
        sessions,
        openSession,
        windowStart: seg.morning.windowStart,
        windowEnd: seg.morning.windowEnd,
      })
      const workedAfternoon = computeWorkedSecondsInWindow({
        sessions,
        openSession,
        windowStart: seg.afternoon.windowStart,
        windowEnd: seg.afternoon.windowEnd,
      })
      const workedDay = workedMorning + workedAfternoon
      const plannedDay = (seg.morning.plannedSeconds || 0) + (seg.afternoon.plannedSeconds || 0)

      const hasWorkThisDay = workedDay > 0

      let status = 'scheduled'
      if (isToday) {
        if (isActive || isPaused) status = 'in_progress'
        else if (hasWorkThisDay) status = 'finalized'
        else status = 'in_progress'
      }
      else if (isPast) {
        status = hasWorkThisDay ? 'finalized' : 'missed'
      }

      const hoursText = perDayHours > 0 ? `${String(perDayHours).replace('.', ',')}h` : ''
      const timeText = String(scheduledTimeText || '').trim()

      let statusLabel = 'Agendado'
      if (status === 'in_progress') statusLabel = hoursText ? `Em andamento -${hoursText}` : 'Em andamento'
      if (status === 'finalized') statusLabel = hoursText ? `Finalizado -${hoursText}` : 'Finalizado'
      if (status === 'missed') statusLabel = 'Falta'

      return {
        key: dayKey(d0),
        label: formatAgendaLabelPt(d0),
        title:
          status === 'missed'
            ? 'Falta'
            : status === 'finalized'
              ? 'Feito'
              : status === 'in_progress'
                ? 'Feito'
                : 'Agendado',
        time: timeText,
        hours: hoursText,
        status,
        statusLabel,
        plannedSeconds: plannedDay,
        workedSeconds: workedDay,
        workedMorningSeconds: workedMorning,
        workedAfternoonSeconds: workedAfternoon,
      }
    })

  const byDay = {}
  for (const it of entries) {
    byDay[it.key] = { status: it.status }
  }

  // Ensure days with recorded work are colored even if schedule days weren't detected.
  // Today stays orange when active/paused.
  const todayKey = dayKey(new Date())
  for (const [k, secs] of Object.entries(workedSecondsByDay || {})) {
    if (!secs || secs <= 0) continue
    if (k === todayKey && (isActive || isPaused)) {
      byDay[k] = { status: 'in_progress' }
    } else {
      byDay[k] = { status: 'finalized' }
    }
  }

  const doneDaysTotal = entries.filter((e) => e.status === 'finalized' || e.status === 'in_progress').length

  return {
    plannedHoursTotal,
    doneHoursTotal,
    plannedDaysTotal,
    doneDaysTotal,
    entries,
    byDay,
    plannedByDay,
  }
}

const normalizeUnitKey = (rawUnit) => {
  const u = String(rawUnit || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
  if (!u) return ''
  if (u === 'hora' || u === 'hour' || u.includes('hora') || u.includes('hour')) return 'hour'
  if (u === 'dia' || u === 'day' || u.includes('dia') || u.includes('day')) return 'day'
  if (u === 'mes' || u === 'mês' || u === 'month' || u.includes('mes') || u.includes('month')) return 'month'
  if (u === 'evento' || u === 'event' || u.includes('evento') || u.includes('event')) return 'event'
  return ''
}

const isMissingColumn = (err, column) => {
  const code = String(err?.code || '')
  if (code !== '42703' && code !== 'PGRST204') return false
  const msg = String(err?.message || '').toLowerCase()
  const col = String(column || '').toLowerCase()
  // 42703: column "x" of relation "..." does not exist
  // PGRST204: Could not find the 'x' column of '...' in the schema cache
  if (!msg.includes('column')) return false
  if (code === '42703' && !msg.includes('does not exist')) return false
  if (code === 'PGRST204' && !msg.includes('could not find')) return false
  return col ? msg.includes(col) : true
}

const isMissingRelationship = (err) => {
  const code = String(err?.code || '')
  const msg = String(err?.message || '').toLowerCase()
  if (code === 'PGRST200') return true
  if (msg.includes('could not find') && msg.includes('relationship')) return true
  // PostgREST may phrase it like "Searched for a foreign key relationship... but no matches were found."
  const details = String(err?.details || '').toLowerCase()
  if (details.includes('foreign key relationship') && details.includes('no matches were found')) return true
  return false
}

const extractMissingColumnName = (err) => {
  const code = String(err?.code || '')
  if (code !== '42703' && code !== 'PGRST204') return ''

  const msg = String(err?.message || '')
  // Examples:
  // - column "worked_seconds" of relation "bookings" does not exist
  // - Could not find the 'worked_seconds' column of 'bookings' in the schema cache
  const m1 = msg.match(/column\s+"([a-zA-Z0-9_]+)"\s+of\s+relation\s+"[a-zA-Z0-9_]+"\s+does\s+not\s+exist/i)
  if (m1?.[1]) return String(m1[1])
  const m2 = msg.match(/could\s+not\s+find\s+the\s+'([a-zA-Z0-9_]+)'\s+column/i)
  if (m2?.[1]) return String(m2[1])
  return ''
}

const WorkTimer = () => {
  const { jobId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()

  const gradientInstanceId = useId()
  const gradientInstanceIdSafe = String(gradientInstanceId || 'joby').replace(/[:]/g, '')
  const jobyWorkArcGradientId = `jobyWorkArc-${gradientInstanceIdSafe}`

  const [activeTab, setActiveTab] = useState('mine')

  useEffect(() => {
    const desired = location?.state?.initialTab
    if (desired === 'mine' || desired === 'staff') setActiveTab(desired)
  }, [location?.state?.initialTab])

  const [agendaMonth, setAgendaMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const [jobDetails, setJobDetails] = useState(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [isActive, setIsActive] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [startTime, setStartTime] = useState(null)
  const [pauseBuffer, setPauseBuffer] = useState(0)
  const [lastPauseTime, setLastPauseTime] = useState(null)
  const [totalPauses, setTotalPauses] = useState(0)
  const [pauseHistory, setPauseHistory] = useState([])

  // Novas variáveis para controle de pagamento
  const [paymentType, setPaymentType] = useState('hourly') // hourly, daily, event
  const [paymentRate, setPaymentRate] = useState(0)
  const [totalValue, setTotalValue] = useState(0)

  const [bookingRaw, setBookingRaw] = useState(null)
  const [agenda, setAgenda] = useState(EMPTY_AGENDA)

  const [staffBookings, setStaffBookings] = useState([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffFallbackProfile, setStaffFallbackProfile] = useState(null)

  const [staffFilter, setStaffFilter] = useState('all')

  const [workSessions, setWorkSessions] = useState([])
  const [liveWorkSession, setLiveWorkSession] = useState(null)
  const [workSessionsUnavailable, setWorkSessionsUnavailable] = useState(false)
  const [workSessionEvents, setWorkSessionEvents] = useState([])
  const [workSessionEventsUnavailable, setWorkSessionEventsUnavailable] = useState(false)
  const [staffWorkSessionsByBookingId, setStaffWorkSessionsByBookingId] = useState({})
  const [staffSessionsNowMs, setStaffSessionsNowMs] = useState(() => Date.now())

  // Hydration contract (reload consistency): block persistence/localStorage until a deterministic
  // source-of-truth decision is possible (session vs booking vs local fallback).
  const [hydrationReady, setHydrationReady] = useState(false)
  const hydrationReadyRef = useRef(false)
  const sessionFetchAttemptedRef = useRef(false)
  const [sessionLoading, setSessionLoading] = useState(false)
  const lastElapsedRef = useRef(0)
  const lastSnapshotWriteAtRef = useRef(0)
  const baseDerivedForTodayRef = useRef({ bookingId: '', dayKey: '', sessionId: '' })
  const lastPersistedSecondsRef = useRef(0)

  const readTimerSnapshot = (bookingId) => {
    try {
      const bid = String(bookingId || '').trim()
      if (!bid) return null
      const raw = localStorage.getItem(`joby_timer_snapshot_${bid}`)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      const elapsed = Math.max(0, Math.floor(Number(parsed?.elapsed) || 0))
      const savedAt = Math.max(0, Math.floor(Number(parsed?.savedAt) || 0))
      const status = String(parsed?.status || '')
      if (!savedAt) return null
      return { elapsed, savedAt, status }
    } catch {
      return null
    }
  }

  const applyMonotonicElapsed = ({
    bookingId,
    nextElapsed,
    status,
    nowMs = Date.now(),
  }) => {
    const candidate = Math.max(0, Math.floor(Number(nextElapsed) || 0))
    const bid = String(bookingId || '').trim()

    // Snapshot floor to avoid regressions on reload.
    let snapElapsedNow = 0
    try {
      const snap = readTimerSnapshot(bid)
      const maxAgeMs = 8 * 60 * 60 * 1000
      if (snap?.savedAt && nowMs - snap.savedAt <= maxAgeMs) {
        const deltaSec =
          String(snap?.status || '').trim().toLowerCase() === 'running'
            ? Math.max(0, Math.floor((nowMs - snap.savedAt) / 1000))
            : 0
        snapElapsedNow = Math.max(0, Math.floor(Number(snap.elapsed) || 0)) + deltaSec
      }
    } catch {
      // ignore
    }

    const finalElapsed = Math.max(candidate, snapElapsedNow, Math.max(0, Math.floor(Number(lastElapsedRef.current) || 0)))
    lastElapsedRef.current = finalElapsed
    setElapsedTime(finalElapsed)

    // Best-effort snapshot write (throttled to ~1s).
    try {
      if (bid) {
        const lastAt = Math.max(0, Math.floor(Number(lastSnapshotWriteAtRef.current) || 0))
        if (!lastAt || nowMs - lastAt >= 900) {
          lastSnapshotWriteAtRef.current = nowMs
          localStorage.setItem(
            `joby_timer_snapshot_${bid}`,
            JSON.stringify({ elapsed: finalElapsed, savedAt: nowMs, status: String(status || '') })
          )
        }
      }
    } catch {
      // ignore
    }

    return finalElapsed
  }

  const agendaCardRef = useRef(null)
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false)
  const [finishServiceConfirmOpen, setFinishServiceConfirmOpen] = useState(false)
  const [cancelServiceConfirmOpen, setCancelServiceConfirmOpen] = useState(false)
  const [serviceActionBusy, setServiceActionBusy] = useState(false)
  const skipRestartConfirmRef = useRef(false)

  const baseWorkedSecondsRef = useRef(0)
  const basePausedSecondsRef = useRef(0)
  const baseMetaRef = useRef({ bookingId: '', dayKey: '' })

  const todayKey = (() => {
    const now = new Date()
    return now.toISOString().slice(0, 10)
  })()

  const readPausedAtFromBooking = (b) => {
    try {
      const raw =
        b?.work_paused_at ||
        b?.workPausedAt ||
        b?.paused_at ||
        b?.pausedAt ||
        null
      return raw ? toValidDate(raw) : null
    } catch {
      return null
    }
  }

  const isPaymentReadyForPersist = () => {
    const pt = String(paymentType || '').trim() || 'hourly'
    if (pt === 'hourly') return Number(paymentRate) > 0
    if (pt === 'daily') return Number(paymentRate) > 0
    if (pt === 'event') return Number(totalValue) > 0
    return false
  }

  const computeHydrateDecision = ({ now = new Date() } = {}) => {
    const sessionId = liveWorkSession?.id || null
    const sessionStatus = String(liveWorkSession?.status || '')
    const bookingPausedAt = readPausedAtFromBooking(bookingRaw)
    const bookingPauseEvidence = !!bookingPausedAt
    const sessionUsable = !!sessionId && !workSessionsUnavailable
    const sessionShouldDrive = sessionUsable && (sessionStatus === 'running' || sessionStatus === 'paused')

    // IMPORTANT: when we have a usable work_session, it is the authority.
    // Booking/local "pause evidence" is only used when there is no valid session.
    const pauseEvidence = sessionShouldDrive ? sessionStatus === 'paused' : bookingPauseEvidence

    const effectiveStatus = (() => {
      if (sessionUsable && sessionStatus === 'finished') return 'finished'
      if (sessionShouldDrive && sessionStatus === 'running') return 'running'
      if (sessionShouldDrive && sessionStatus === 'paused') return 'paused'

      // No usable session: bookings-only model.
      const endedAtRaw =
        bookingRaw?.ended_at ||
        bookingRaw?.endedAt ||
        bookingRaw?.work_ended_at ||
        bookingRaw?.workEndedAt ||
        bookingRaw?.finished_at ||
        bookingRaw?.finishedAt ||
        bookingRaw?.completed_at ||
        bookingRaw?.completedAt ||
        bookingRaw?.stopped_at ||
        bookingRaw?.stoppedAt ||
        null
      const endedAt = endedAtRaw ? toValidDate(endedAtRaw) : null
      if (endedAt) return 'finished'

      const workStartedAtRaw =
        bookingRaw?.work_started_at ||
        bookingRaw?.workStartedAt ||
        bookingRaw?.started_at ||
        bookingRaw?.startedAt ||
        null
      const workStartedAt = workStartedAtRaw ? toValidDate(workStartedAtRaw) : null
      if (workStartedAt && !bookingPauseEvidence) return 'running'
      return bookingPauseEvidence ? 'paused' : 'idle'
    })()

    const source = (() => {
      if (sessionShouldDrive) return 'session'
      if (bookingRaw?.id) return 'booking'
      return workSessionsUnavailable ? 'local' : 'idle'
    })()

    const workedBase = readWorkedSecondsFromBooking(bookingRaw)
    const pausedBase = readPausedSecondsFromBooking(bookingRaw)

    const sessionSeconds = sessionShouldDrive
      ? Math.max(0, Math.floor(Number(computeElapsedSecondsFromSession(liveWorkSession, now)) || 0))
      : 0

    return {
      source,
      effectiveStatus,
      pauseEvidence,
      pauseEvidenceFrom: sessionShouldDrive
        ? sessionStatus === 'paused'
          ? 'session'
          : null
        : bookingPauseEvidence
          ? 'booking'
          : null,
      bookingPausedAt,
      workedBase,
      pausedBase,
      sessionSeconds,
      sessionStatus,
      sessionId,
    }
  }

  const finalizedTodayStorageKey = (() => {
    const bid = bookingRaw?.id || jobId
    if (!bid) return ''
    return `joby_finalized_${String(bid)}_${todayKey}`
  })()

  const hasFinalizedToday = (() => {
    const isSameDay = (d) => {
      if (!d) return false
      try {
        return d.toISOString().slice(0, 10) === todayKey
      } catch {
        return false
      }
    }

    // 1) Prefer event log when available.
    try {
      const events = Array.isArray(workSessionEvents) ? workSessionEvents : []
      for (const e of events) {
        const type = String(e?.event_type || '').trim().toLowerCase()
        if (type !== 'finish') continue
        const at = toValidDate(e?.occurred_at || e?.created_at)
        if (at && isSameDay(at)) return true
      }
    } catch {
      // ignore
    }

    // 2) Fallback: booking ended_at/work_ended_at.
    try {
      const endedAtRaw =
        bookingRaw?.ended_at ||
        bookingRaw?.endedAt ||
        bookingRaw?.work_ended_at ||
        bookingRaw?.workEndedAt ||
        bookingRaw?.completed_at ||
        bookingRaw?.completedAt ||
        bookingRaw?.stopped_at ||
        bookingRaw?.stoppedAt ||
        null
      const endedAt = endedAtRaw ? toValidDate(endedAtRaw) : null
      if (endedAt && isSameDay(endedAt)) return true
    } catch {
      // ignore
    }

    // 3) Best-effort local marker.
    try {
      if (finalizedTodayStorageKey && localStorage.getItem(finalizedTodayStorageKey)) return true
    } catch {
      // ignore
    }

    return false
  })()

  const isSameDayKey = (d, dayKey) => {
    if (!d || !dayKey) return false
    try {
      return d.toISOString().slice(0, 10) === String(dayKey)
    } catch {
      return false
    }
  }

  const readWorkedSecondsFromBooking = (b) => {
    try {
      const raw =
        b?.worked_seconds ??
        b?.workedSeconds ??
        b?.seconds_worked ??
        b?.secondsWorked ??
        null
      const n = Number(raw)
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
    } catch {
      return 0
    }
  }

  const readPausedSecondsFromBooking = (b) => {
    try {
      const raw = b?.total_paused_seconds ?? b?.totalPausedSeconds ?? null
      const n = Number(raw)
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
    } catch {
      return 0
    }
  }

  const readWorkedSecondsFromLocalTimerState = (id) => {
    try {
      const key = `timerState_${String(id || '').trim()}`
      if (!id) return 0
      const raw = localStorage.getItem(key)
      if (!raw) return 0
      const parsed = JSON.parse(raw)
      const n = Number(parsed?.elapsedTime)
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
    } catch {
      return 0
    }
  }

  const computeSessionPausedSeconds = (session, now = new Date()) => {
    const s = session || {}
    const base = Math.max(0, Math.floor(Number(s?.total_paused_seconds) || 0))
    const status = String(s?.status || '')
    if (status !== 'paused') return base
    try {
      const pausedAt = s?.paused_at ? new Date(s.paused_at) : null
      if (!pausedAt || Number.isNaN(pausedAt.getTime())) return base
      const extra = Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 1000))
      return base + extra
    } catch {
      return base
    }
  }

  const getBaseSecondsForToday = () => {
    const bookingId = String(bookingRaw?.id || jobId || '').trim()
    const dayKey = todayKey

    // If base meta doesn't match current context, don't reuse.
    if (baseMetaRef.current?.bookingId !== bookingId || baseMetaRef.current?.dayKey !== dayKey) {
      return { worked: 0, paused: 0 }
    }

    return {
      worked: Math.max(0, Math.floor(Number(baseWorkedSecondsRef.current) || 0)),
      paused: Math.max(0, Math.floor(Number(basePausedSecondsRef.current) || 0)),
    }
  }

  const setBaseSecondsForToday = ({ worked = 0, paused = 0 } = {}) => {
    const bookingId = String(bookingRaw?.id || jobId || '').trim()
    baseWorkedSecondsRef.current = Math.max(0, Math.floor(Number(worked) || 0))
    basePausedSecondsRef.current = Math.max(0, Math.floor(Number(paused) || 0))
    baseMetaRef.current = { bookingId, dayKey: todayKey }
  }

  const scrollToAgendaCard = () => {
    try {
      agendaCardRef?.current?.scrollIntoView({ block: 'start' })
    } catch {
      // ignore
    }
  }
  const [liveSessionNowMs, setLiveSessionNowMs] = useState(() => Date.now())
  const [pauseNowMs, setPauseNowMs] = useState(() => Date.now())
  const [selectedDay, setSelectedDay] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  })

  const [clientStartNotif, setClientStartNotif] = useState(null)
  const [clientStartNotifLoading, setClientStartNotifLoading] = useState(false)

  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [selectedShiftId, setSelectedShiftId] = useState(null)

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const [acceptedServicesCount, setAcceptedServicesCount] = useState(0)

  const progressSyncInFlightRef = useRef(false)
  const lastProgressSyncAtRef = useRef(0)

  const staffBookingIdsKey = (Array.isArray(staffBookings) ? staffBookings : [])
    .map((b) => String(b?.id || '').trim())
    .filter(Boolean)
    .join('|')

  const bookingIdForWorkSession = String(bookingRaw?.id || jobId || '').trim()
  const bookingPauseKey = String(
    bookingRaw?.work_paused_at || bookingRaw?.workPausedAt || bookingRaw?.paused_at || bookingRaw?.pausedAt || ''
  ).trim()

  const timerTrace = (sessionIdOverride = null) => {
    const bookingId = bookingIdForWorkSession || null
    const sessionId = String(
      sessionIdOverride ?? liveWorkSession?.id ?? ''
    ).trim() || null
    const traceId = bookingId ? `timer:${bookingId}:${sessionId || 'none'}` : null
    return {
      traceId,
      userId: user?.id || null,
      bookingId,
      sessionId,
    }
  }

  useEffect(() => {
    // When switching jobs, close the modal and reset selection.
    setIsDetailsOpen(false)
    setSelectedShiftId(null)

    // Reset day base when switching booking.
    baseWorkedSecondsRef.current = 0
    basePausedSecondsRef.current = 0
    baseMetaRef.current = { bookingId: '', dayKey: '' }

    setLiveWorkSession(null)
    setWorkSessionsUnavailable(false)
    setWorkSessionEvents([])
    setWorkSessionEventsUnavailable(false)

    hydrationReadyRef.current = false
    setHydrationReady(false)
    sessionFetchAttemptedRef.current = false
    lastElapsedRef.current = 0
    lastSnapshotWriteAtRef.current = 0
    baseDerivedForTodayRef.current = { bookingId: '', dayKey: '', sessionId: '' }
    lastPersistedSecondsRef.current = 0
  }, [jobId])

  useEffect(() => {
    // Reset base when the calendar day changes.
    if (baseMetaRef.current?.dayKey && baseMetaRef.current.dayKey !== todayKey) {
      baseWorkedSecondsRef.current = 0
      basePausedSecondsRef.current = 0
      baseMetaRef.current = { bookingId: '', dayKey: '' }
    }
  }, [todayKey])

  useEffect(() => {
    // Reset base after finishing the whole service.
    const raw = bookingRaw?.status || jobDetails?.status
    if (isFinalizedWorkStatus(raw)) {
      baseWorkedSecondsRef.current = 0
      basePausedSecondsRef.current = 0
      baseMetaRef.current = { bookingId: '', dayKey: '' }
    }
  }, [bookingRaw?.status, jobDetails?.status])

  useEffect(() => {
    // Fetch persisted pause/resume events so the arcs can preserve exact positions across refresh.
    if (!liveWorkSession?.id) {
      setWorkSessionEvents([])
      return
    }
    if (workSessionsUnavailable) return
    if (workSessionEventsUnavailable) return

    let cancelled = false

    ;(async () => {
      try {
        const res = await fetchWorkSessionEventsForSession(liveWorkSession.id)
        if (cancelled) return
        if (res?.unavailable) {
          setWorkSessionEventsUnavailable(true)
          setWorkSessionEvents([])
          return
        }
        if (res?.error) return
        setWorkSessionEvents(Array.isArray(res?.data) ? res.data : [])
      } catch {
        // ignore
      }
    })()

    return () => {
      cancelled = true
    }
  }, [liveWorkSession?.id, workSessionsUnavailable, workSessionEventsUnavailable])

  useEffect(() => {
    // Persisted history (cross-device): build worked segments from work_sessions (+ events when available).
    if (!isUuid(bookingIdForWorkSession)) return
    if (workSessionsUnavailable) return

    let cancelled = false

    ;(async () => {
      try {
        const sessionsRes = await fetchWorkSessionsForBooking(bookingIdForWorkSession)
        if (cancelled) return

        if (sessionsRes?.unavailable) {
          setWorkSessionsUnavailable(true)
          return
        }

        if (sessionsRes?.error) return
        const sessionRows = Array.isArray(sessionsRes?.data) ? sessionsRes.data : []

        const ids = sessionRows
          .map((s) => String(s?.id || '').trim())
          .filter(Boolean)

        let eventsBySessionId = {}
        if (ids.length && !workSessionEventsUnavailable) {
          const evRes = await fetchWorkSessionEventsForSessions(ids)
          if (cancelled) return
          if (evRes?.unavailable) {
            setWorkSessionEventsUnavailable(true)
            eventsBySessionId = {}
          } else if (!evRes?.error) {
            eventsBySessionId = evRes?.data || {}
          }
        }

        const segs = buildWorkedSegmentsFromDb({
          sessions: sessionRows,
          eventsBySessionId,
          now: new Date(),
          pauseOverride: readPausedAtFromBooking(bookingRaw),
        })
        setWorkSessions(segs)
      } catch {
        // ignore
      }
    })()

    return () => {
      cancelled = true
    }
  }, [bookingIdForWorkSession, bookingPauseKey, workSessionsUnavailable, workSessionEventsUnavailable])

  useEffect(() => {
    // Realtime: keep event list updated when other devices pause/resume.
    if (!liveWorkSession?.id) return
    if (workSessionsUnavailable) return
    if (workSessionEventsUnavailable) return

    const sessionId = String(liveWorkSession.id)
    const channel = supabase
      .channel(`work-session-events:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'work_session_events',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload?.new || null
          if (!row?.id) return
          setWorkSessionEvents((prev) => {
            const list = Array.isArray(prev) ? prev : []
            if (list.some((x) => String(x?.id) === String(row.id))) return list
            const next = [...list, row]
            next.sort((a, b) => {
              const at = toValidDate(a?.occurred_at || a?.created_at)?.getTime() || 0
              const bt = toValidDate(b?.occurred_at || b?.created_at)?.getTime() || 0
              if (at !== bt) return at - bt
              return String(a?.id || '').localeCompare(String(b?.id || ''))
            })
            return next
          })
        }
      )
      .subscribe()

    return () => {
      try {
        supabase.removeChannel(channel)
      } catch {
        // ignore
      }
    }
  }, [liveWorkSession?.id, workSessionsUnavailable, workSessionEventsUnavailable])

  useEffect(() => {
    // Staff (client/hiring) tab: load and subscribe work_sessions for all listed bookings.
    if (!user?.id) {
      setStaffWorkSessionsByBookingId({})
      return
    }

    if (workSessionsUnavailable) return

    const ids = (Array.isArray(staffBookings) ? staffBookings : [])
      .map((b) => String(b?.id || '').trim())
      .filter(Boolean)

    if (!ids.length) {
      setStaffWorkSessionsByBookingId({})
      return
    }

    const idsSet = new Set(ids)
    let cancelled = false
    const subs = []

    ;(async () => {
      try {
        const res = await fetchLatestWorkSessionsForBookings(ids)
        if (cancelled) return
        if (res?.unavailable) {
          setWorkSessionsUnavailable(true)
          setStaffWorkSessionsByBookingId({})
          return
        }
        if (res?.error) return
        const next = res?.data || {}
        // Keep only sessions for current list
        const filtered = {}
        for (const [bid, row] of Object.entries(next)) {
          if (idsSet.has(String(bid))) filtered[bid] = row
        }
        setStaffWorkSessionsByBookingId(filtered)
      } catch {
        // ignore
      }
    })()

    for (const bookingId of ids) {
      const sub = subscribeToWorkSessionByBooking({
        bookingId,
        onChange: (next) => {
          if (!next?.id) return
          const bid = String(next?.booking_id || '').trim()
          if (!bid || !idsSet.has(bid)) return
          setStaffWorkSessionsByBookingId((prev) => ({ ...prev, [bid]: next }))
        },
      })
      subs.push(sub)
    }

    return () => {
      cancelled = true
      for (const sub of subs) {
        try {
          sub?.unsubscribe?.()
        } catch {
          // ignore
        }
      }
    }
  }, [user?.id, workSessionsUnavailable, staffBookingIdsKey])

  useEffect(() => {
    // Staff tab ticking: keep times updating when any listed session is running.
    if (workSessionsUnavailable) return
    const sessions = Object.values(staffWorkSessionsByBookingId || {})
    const hasRunning = sessions.some((s) => String(s?.status || '') === 'running')
    if (!hasRunning) return
    const interval = setInterval(() => setStaffSessionsNowMs(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [workSessionsUnavailable, staffWorkSessionsByBookingId])

  useEffect(() => {
    // Client: load active work session for this booking (if the table exists).
    if (!isUuid(bookingIdForWorkSession)) {
      setLiveWorkSession(null)
      sessionFetchAttemptedRef.current = true
      setSessionLoading(false)
      return
    }

    if (workSessionsUnavailable) return

    // Mark attempt immediately (before await) so booking_hydrate can reliably wait/skip.
    sessionFetchAttemptedRef.current = true
    setSessionLoading(true)

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetchActiveWorkSessionForBooking(bookingIdForWorkSession)
        if (cancelled) return
        if (res?.unavailable) {
          setWorkSessionsUnavailable(true)
          setLiveWorkSession(null)
          return
        }
        if (res?.error) {
          log.warn('TIMER', 'fetch_active_work_session_failed', { ...timerTrace(null), error: res.error })
          return
        }

        const row = res?.data || null
        setLiveWorkSession(row)

        if (!row) {
          try {
            if (import.meta.env.DEV) {
              log.debug('TIMER', 'no active work_session (running/paused) for booking; using bookings fallback', {
                ...timerTrace(null),
              })
            }
          } catch {
            // ignore
          }
        }

        // Fallback: if no session row is readable, use booking progress fields to avoid resetting to 0.
        if (!row && bookingRaw) {
          const b = bookingRaw || {}
          const workedSecondsRaw =
            b?.worked_seconds ?? b?.workedSeconds ?? b?.seconds_worked ?? b?.secondsWorked ?? null
          const workedMinutesRaw =
            b?.worked_minutes_total ?? b?.workedMinutesTotal ?? b?.worked_minutes ?? b?.workedMinutes ?? null
          const workedHoursRaw =
            b?.worked_hours ?? b?.workedHours ?? b?.hours_worked ?? b?.hoursWorked ?? null

          const nextSeconds = (() => {
            const s = Number(workedSecondsRaw)
            if (Number.isFinite(s) && s >= 0) return Math.floor(s)
            const m = Number(workedMinutesRaw)
            if (Number.isFinite(m) && m >= 0) return Math.floor(m * 60)
            const h = Number(workedHoursRaw)
            if (Number.isFinite(h) && h >= 0) return Math.floor(h * 3600)
            return 0
          })()

          if (nextSeconds > 0) {
            setElapsedTime((prev) => Math.max(Number(prev) || 0, nextSeconds))
          }

          const pausedAtRaw = b?.paused_at || b?.pausedAt || b?.work_paused_at || b?.workPausedAt || null
          if (pausedAtRaw) {
            const d = new Date(pausedAtRaw)
            if (!Number.isNaN(d.getTime())) {
              setIsPaused(true)
              setLastPauseTime(d)
            }
          }
        }
      } catch {
        // ignore
      } finally {
        if (isMountedRef.current) setSessionLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [bookingIdForWorkSession, workSessionsUnavailable])

  useEffect(() => {
    // Client/other devices: subscribe to session events (start/pause/resume/finish).
    if (!isUuid(bookingIdForWorkSession)) return
    if (workSessionsUnavailable) return

    const sub = subscribeToWorkSessionByBooking({
      bookingId: bookingIdForWorkSession,
      onChange: (next) => {
        setLiveWorkSession(next || null)
      },
    })

    return () => {
      try {
        sub?.unsubscribe?.()
      } catch {
        // ignore
      }
    }
  }, [bookingIdForWorkSession, workSessionsUnavailable])

  useEffect(() => {
    // Local ticking for live session: UI updates every second without DB writes.
    const decision = computeHydrateDecision({ now: new Date() })
    const status = String(decision?.effectiveStatus || '')
    if (status !== 'running') return

    try {
      if (import.meta.env.DEV) {
        log.debug('TIMER', 'TickSource', {
          source: 'session',
          effectiveStatus: decision?.effectiveStatus,
          sessionStatus: decision?.sessionStatus,
          pauseEvidence: decision?.pauseEvidence,
          pauseEvidenceFrom: decision?.pauseEvidenceFrom,
          ...timerTrace(liveWorkSession?.id || null),
        })
      }
    } catch {
      // ignore
    }
    const interval = setInterval(() => setLiveSessionNowMs(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [liveWorkSession?.id, liveWorkSession?.status])

  useEffect(() => {
    // Source of truth: when we have a DB work_session, rehydrate timer state from it.
    // This prevents the timer from resetting to 00:00:00 on refresh when localStorage is empty/stale.
    if (!liveWorkSession?.id) return
    if (workSessionsUnavailable) return

    const now = new Date(Date.now())
    const decision = computeHydrateDecision({ now })

    // Unlock hydration once booking exists and the session fetch was attempted.
    if (!hydrationReadyRef.current) {
      const hasBooking = !!bookingRaw?.id
      const okToUnlock = hasBooking && (sessionFetchAttemptedRef.current || workSessionsUnavailable)
      if (okToUnlock) {
        hydrationReadyRef.current = true
        setHydrationReady(true)
      }
    }

    try {
      if (import.meta.env.DEV) {
        log.debug('TIMER', 'HydrateDecision', {
          where: 'session_hydrate',
          hydrationReady: hydrationReadyRef.current,
          source: decision?.source,
          effectiveStatus: decision?.effectiveStatus,
          sessionStatus: decision?.sessionStatus,
          pauseEvidence: decision?.pauseEvidence,
          pauseEvidenceFrom: decision?.pauseEvidenceFrom,
          bookingWorked: decision?.workedBase,
          baseRef: getBaseSecondsForToday(),
          sessionSeconds: decision?.sessionSeconds,
          ...timerTrace(liveWorkSession?.id || null),
        })
      }
    } catch {
      // ignore
    }

    const status = String(decision?.effectiveStatus || '')

    // Guard: during the first hydration pass, baseWorked may still be 0.
    // Never apply an elapsedTime that would make the UI go backwards/reset.
    // If booking already has worked_seconds, use it as a temporary floor.
    const isSessionSource = String(decision?.source || '') === 'session'
    const isHydrationReady = !!hydrationReadyRef.current
    if (isSessionSource && !isHydrationReady) {
      const bookingWorked = Math.max(0, Math.floor(Number(decision?.workedBase) || 0))

      if (bookingWorked > 0) {
        const bid = bookingRaw?.id || jobId
        const applied = applyMonotonicElapsed({
          bookingId: bid,
          nextElapsed: bookingWorked,
          status,
          nowMs: Date.now(),
        })
        setPauseBuffer((prev) => Math.max(Math.floor(Number(prev) || 0), applied))
      }

      // Keep pause/running flags aligned to session status, but avoid changing totals.
      if (status === 'finished') {
        setIsActive(false)
        setIsPaused(false)
        setStartTime(null)
        setLastPauseTime(null)
      } else if (status === 'paused') {
        setIsActive(true)
        setIsPaused(true)
        setStartTime(null)
        try {
          const pausedAtSession = liveWorkSession?.paused_at ? toValidDate(liveWorkSession.paused_at) : null
          setLastPauseTime(pausedAtSession || decision?.bookingPausedAt || null)
        } catch {
          setLastPauseTime(decision?.bookingPausedAt || null)
        }
      } else if (status === 'running') {
        setIsActive(true)
        setIsPaused(false)
        setLastPauseTime(null)
        try {
          const startedAt = liveWorkSession?.started_at ? new Date(liveWorkSession.started_at) : null
          if (startedAt && !Number.isNaN(startedAt.getTime())) setStartTime(startedAt)
        } catch {
          // ignore
        }
      }
      return
    }

    if (status === 'finished') {
      setIsActive(false)
      setIsPaused(false)
      setStartTime(null)
      setLastPauseTime(null)
    } else if (status === 'paused') {
      // PAUSE always wins: never tick.
      // If the DB session is paused, session drives the frozen total (base + sessionSeconds).
      // If we are paused only because booking indicates pause (race), freeze at booking's accumulated base.
      const bookingWorked = Math.max(0, Math.floor(Number(decision?.workedBase) || 0))
      const pausedFromSession = String(decision?.pauseEvidenceFrom || '') === 'session'
      const sessionSeconds = Math.max(0, Math.floor(Number(decision?.sessionSeconds) || 0))

      let workedFrozen = bookingWorked
      if (pausedFromSession) {
        let baseWorked = getBaseSecondsForToday().worked
        const currentBookingId = String(bookingRaw?.id || jobId || '').trim()
        const key = {
          bookingId: currentBookingId,
          dayKey: todayKey,
          sessionId: String(decision?.sessionId || ''),
        }
        const alreadyDerived =
          baseDerivedForTodayRef.current?.bookingId === key.bookingId &&
          baseDerivedForTodayRef.current?.dayKey === key.dayKey &&
          baseDerivedForTodayRef.current?.sessionId === key.sessionId

        if (!alreadyDerived && baseWorked <= 0 && bookingWorked > 0) {
          const derived = Math.max(0, bookingWorked - sessionSeconds)
          if (derived > 0) {
            setBaseSecondsForToday({ worked: derived, paused: getBaseSecondsForToday().paused })
            baseWorked = derived
          }
          baseDerivedForTodayRef.current = key
        }

        workedFrozen = baseWorked + sessionSeconds
      }

      workedFrozen = Math.max(0, Math.floor(Number(workedFrozen) || 0))
      const bid = bookingRaw?.id || jobId
      const applied = applyMonotonicElapsed({ bookingId: bid, nextElapsed: workedFrozen, status: 'paused', nowMs: Date.now() })
      setIsActive(true)
      setIsPaused(true)
      setStartTime(null)
      setPauseBuffer(applied)
      try {
        const pausedAtSession = liveWorkSession?.paused_at ? toValidDate(liveWorkSession.paused_at) : null
        setLastPauseTime(pausedAtSession || decision?.bookingPausedAt || null)
      } catch {
        setLastPauseTime(decision?.bookingPausedAt || null)
      }
      try {
        if (import.meta.env.DEV) {
          log.debug('TIMER', 'HydrateSession', { status: 'paused', workedFrozen, ...timerTrace(liveWorkSession?.id || null) })
        }
      } catch {
        // ignore
      }
    } else if (status === 'running') {
      // Running: session drives time; base adds prior sessions of the same day.
      const nowTick = new Date(liveSessionNowMs)
      const sessionSeconds = Math.max(0, Math.floor(Number(decision?.sessionSeconds) || 0))
      const bookingWorked = Math.max(0, Math.floor(Number(decision?.workedBase) || 0))

      // Base reconstruction after reload (same-day continue): base ≈ booking.worked_seconds - sessionSeconds.
      let baseWorked = getBaseSecondsForToday().worked
      const currentBookingId = String(bookingRaw?.id || jobId || '').trim()
      const key = {
        bookingId: currentBookingId,
        dayKey: todayKey,
        sessionId: String(decision?.sessionId || ''),
      }
      const alreadyDerived =
        baseDerivedForTodayRef.current?.bookingId === key.bookingId &&
        baseDerivedForTodayRef.current?.dayKey === key.dayKey &&
        baseDerivedForTodayRef.current?.sessionId === key.sessionId

      if (!alreadyDerived && baseWorked <= 0 && bookingWorked > 0) {
        const derived = Math.max(0, bookingWorked - sessionSeconds)
        if (derived > 0) {
          setBaseSecondsForToday({ worked: derived, paused: getBaseSecondsForToday().paused })
          baseWorked = derived
        }
        baseDerivedForTodayRef.current = key
      }

      const nextElapsed = baseWorked + sessionSeconds
      const bid = bookingRaw?.id || jobId
      applyMonotonicElapsed({ bookingId: bid, nextElapsed, status: 'running', nowMs: Date.now() })
      setIsActive(true)
      setIsPaused(false)

      try {
        const startedAt = liveWorkSession?.started_at ? new Date(liveWorkSession.started_at) : null
        if (startedAt && !Number.isNaN(startedAt.getTime())) setStartTime(startedAt)
      } catch {
        // ignore
      }

      setLastPauseTime(null)

      try {
        if (import.meta.env.DEV) {
          log.debug('TIMER', 'HydrateSession', {
            status: 'running',
            baseWorked,
            sessionSeconds,
            nextElapsed,
            now: nowTick.toISOString(),
            ...timerTrace(liveWorkSession?.id || null),
          })
        }
      } catch {
        // ignore
      }
    }

    // Keep auxiliary fields aligned for persistence/UI.
    try {
      const pausedAt = liveWorkSession?.paused_at ? new Date(liveWorkSession.paused_at) : null
      if (pausedAt && !Number.isNaN(pausedAt.getTime())) setLastPauseTime(pausedAt)
    } catch {
      // ignore
    }

    // Rehydrate payment mode from DB session when present.
    const pt = String(liveWorkSession?.payment_type || '').trim()
    if (pt) {
      setPaymentType(pt)
      if (pt === 'hourly') {
        const rate = Number(liveWorkSession?.rate_per_hour)
        if (Number.isFinite(rate) && rate >= 0) setPaymentRate(rate)
        setTotalValue(0)
      } else if (pt === 'daily') {
        const fixed = Number(liveWorkSession?.fixed_amount)
        if (Number.isFinite(fixed) && fixed >= 0) setPaymentRate(fixed)
        setTotalValue(0)
      } else if (pt === 'event') {
        const fixed = Number(liveWorkSession?.fixed_amount)
        setPaymentRate(0)
        setTotalValue(Number.isFinite(fixed) && fixed >= 0 ? fixed : 0)
      }
    }
  }, [
    liveWorkSession?.id,
    liveWorkSession?.status,
    liveWorkSession?.started_at,
    liveWorkSession?.paused_at,
    liveWorkSession?.finished_at,
    liveWorkSession?.total_paused_seconds,
    liveWorkSession?.payment_type,
    liveWorkSession?.fixed_amount,
    liveWorkSession?.rate_per_hour,
    liveSessionNowMs,
    workSessionsUnavailable,
  ])

  useEffect(() => {
    // Bookings-only hydration (minimal model): reconstruct state after refresh.
    // Uses: work_started_at, work_paused_at, worked_seconds, total_paused_seconds.
    if (!bookingRaw?.id) return
    if (sessionLoading) return
    // If sessions are available, wait for the session fetch attempt before falling back to booking hydration.
    // This prevents a flash/regression where booking_hydrate runs first, then session_hydrate corrects it.
    if (!workSessionsUnavailable && !sessionFetchAttemptedRef.current) return

    // Never let bookings override an active session.
    const liveStatus = String(liveWorkSession?.status || '').trim().toLowerCase()
    if (!workSessionsUnavailable && liveWorkSession?.id && (liveStatus === 'running' || liveStatus === 'paused')) return
    if (liveWorkSession?.id && !workSessionsUnavailable) return

    if (!hydrationReadyRef.current) {
      const okToUnlock = sessionFetchAttemptedRef.current || workSessionsUnavailable
      if (okToUnlock) {
        hydrationReadyRef.current = true
        setHydrationReady(true)
      }
    }

    const b = bookingRaw || {}
    const workedBase = Math.max(0, Math.floor(Number(b?.worked_seconds) || 0))

    try {
      if (import.meta.env.DEV) {
        log.debug('TIMER', 'HydrateDecision', {
          where: 'booking_hydrate',
          hydrationReady: hydrationReadyRef.current,
          workedBase,
          pausedAt: readPausedAtFromBooking(b)?.toISOString?.() || null,
          workStartedAt: b?.work_started_at || b?.started_at || null,
          workPausedAt: b?.work_paused_at || b?.paused_at || null,
          endedAt: b?.ended_at || b?.work_ended_at || null,
          ...timerTrace(null),
        })
      }
    } catch {
      // ignore
    }

    const endedAtRaw =
      b?.ended_at ||
      b?.endedAt ||
      b?.work_ended_at ||
      b?.workEndedAt ||
      b?.finished_at ||
      b?.finishedAt ||
      b?.completed_at ||
      b?.completedAt ||
      b?.stopped_at ||
      b?.stoppedAt ||
      null

    const endedAt = endedAtRaw ? toValidDate(endedAtRaw) : null
    if (endedAt) {
      setIsActive(false)
      setIsPaused(false)
      setStartTime(null)
      const bid = bookingRaw?.id || jobId
      const applied = applyMonotonicElapsed({ bookingId: bid, nextElapsed: workedBase, status: 'finished', nowMs: Date.now() })
      setPauseBuffer(applied)
      setLastPauseTime(null)
      // After a finalize, keep showing the day's total (do not reset UI to 0).
      try {
        if (import.meta.env.DEV) log.debug('TIMER', 'HydrateBooking', { status: 'finished', workedBase, ...timerTrace(null) })
      } catch {
        // ignore
      }
      return
    }

    const workStartedAtRaw = b?.work_started_at || b?.workStartedAt || b?.started_at || b?.startedAt || null
    const workPausedAtRaw = b?.work_paused_at || b?.workPausedAt || b?.paused_at || b?.pausedAt || null
    const workStartedAt = workStartedAtRaw ? toValidDate(workStartedAtRaw) : null
    const workPausedAt = workPausedAtRaw ? toValidDate(workPausedAtRaw) : null

    const isPausedByDb = !!workPausedAt
    const isRunningByDb = !!workStartedAt && !isPausedByDb
    const activeByDb = isRunningByDb || isPausedByDb

    if (activeByDb) setIsActive(true)
    setIsPaused(isPausedByDb)

    if (isPausedByDb) {
      setStartTime(null)
      const bid = bookingRaw?.id || jobId
      const applied = applyMonotonicElapsed({ bookingId: bid, nextElapsed: workedBase, status: 'paused', nowMs: Date.now() })
      setPauseBuffer(applied)
      setLastPauseTime(workPausedAt)
      try {
        if (import.meta.env.DEV) log.debug('TIMER', 'HydrateBooking', { status: 'paused', workedBase, ...timerTrace(null) })
      } catch {
        // ignore
      }
      return
    }

    if (isRunningByDb) {
      setStartTime(workStartedAt)
      setPauseBuffer(workedBase)
      setLastPauseTime(null)

      const now = new Date()
      const delta = Math.max(0, Math.floor((now.getTime() - workStartedAt.getTime()) / 1000))
      const bid = bookingRaw?.id || jobId
      const applied = applyMonotonicElapsed({
        bookingId: bid,
        nextElapsed: workedBase + delta,
        status: 'running',
        nowMs: now.getTime(),
      })
      setPauseBuffer(applied)
      try {
        if (import.meta.env.DEV) log.debug('TIMER', 'HydrateBooking', { status: 'running', workedBase, delta, ...timerTrace(null) })
      } catch {
        // ignore
      }
      return
    }

    // Not active: keep as-is.
  }, [
    bookingRaw?.id,
    bookingRaw?.worked_seconds,
    bookingRaw?.work_started_at,
    bookingRaw?.work_paused_at,
    bookingRaw?.started_at,
    bookingRaw?.paused_at,
    bookingRaw?.ended_at,
    bookingRaw?.work_ended_at,
    bookingRaw?.finished_at,
    liveWorkSession?.id,
    liveWorkSession?.status,
    workSessionsUnavailable,
    sessionLoading,
  ])

  useEffect(() => {
    // While effectively paused, tick to keep pause timer updating.
    // Note: pause can be driven by booking evidence even if the live session row is still 'running' (race).
    const bookingPausedAt = readPausedAtFromBooking(bookingRaw)
    const liveStatus = String(liveWorkSession?.status || '')
    const effectivePaused = !!bookingPausedAt || liveStatus === 'paused' || !!isPaused
    if (!effectivePaused) return
    const interval = setInterval(() => setPauseNowMs(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [isPaused, bookingRaw, liveWorkSession?.status])

  useEffect(() => {
    if (!user?.id) {
      setAcceptedServicesCount(0)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        // Conta quantos bookings desse profissional estão aceitos/em andamento.
        // (Usado apenas para trocar o título "Serviço em andamento" -> "Próximos serviços").
        const withRelations = 'id, status, created_at'
        const res = await supabase
          .from('bookings')
          .select(withRelations)
          .eq('professional_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30)

        if (cancelled) return
        if (res?.error) {
          setAcceptedServicesCount(0)
          return
        }
        const rows = Array.isArray(res?.data) ? res.data : []
        const count = rows.filter((b) => isAcceptedWorkStatus(b?.status)).length
        setAcceptedServicesCount(count)
      } catch {
        if (!cancelled) setAcceptedServicesCount(0)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user?.id])

  useEffect(() => {
    if (!jobId) return
    let cancelled = false
    ;(async () => {
      try {
        setJobDetails(null)
        setBookingRaw(null)
        setAgenda(EMPTY_AGENDA)

        const resolveAcceptedBookingIdForUser = async () => {
          const userId = user?.id
          if (!userId) return null

          const withRelations =
            '*, client:client_id(id, username, name, avatar), professional:professional_id(id, username, name, avatar), service:service_id(id, title, price, price_unit)'
          const noRelations = '*'
          const variants = [withRelations, noRelations]

          const fetchByRole = async (column) => {
            for (const sel of variants) {
              const res = await supabase
                .from('bookings')
                .select(sel)
                .eq(column, userId)
                .order('created_at', { ascending: false })
                .limit(20)

              if (!res?.error) return Array.isArray(res?.data) ? res.data : []

              if (isMissingRelationship(res.error)) continue
              break
            }
            return []
          }

          const pickAccepted = (rows) => {
            const list = Array.isArray(rows) ? rows : []
            const accepted = list.find((b) => isAcceptedWorkStatus(b?.status))
            return accepted?.id ? String(accepted.id) : null
          }

          // Prefer: profissional (quem executa o turno)
          const proId = pickAccepted(await fetchByRole('professional_id'))
          if (proId) return proId

          // Fallback: cliente (acompanhar serviço)
          const clientId = pickAccepted(await fetchByRole('client_id'))
          if (clientId) return clientId

          return null
        }

        // Se a rota veio com placeholder (/work-timer/current, sample-job-123, etc), resolve automaticamente.
        if (!isUuid(jobId)) {
          const resolved = await resolveAcceptedBookingIdForUser()
          if (cancelled) return
          if (resolved) {
            navigate(`/work-timer/${resolved}`, { replace: true })
            return
          }

          setBookingRaw(null)
          setAgenda(EMPTY_AGENDA)
          setJobDetails({
            id: jobId,
            clientName: 'Cliente',
            professionalName: 'Profissional',
            service: 'Serviço',
            paymentType: 'hourly',
            hourlyRate: 0,
            dailyRate: 0,
            eventValue: 0,
            status: 'Agendado',
            professionalId: null,
            clientId: null,
            clientAllowsSoloStart: false,
            maximumWorkTime: 480,
            breakReminder: 240,
          })
          // Sem booking aceito = sem trabalho real selecionado.
          setStaffBookings([])
          setStaffLoading(false)
          return
        }

        // IMPORTANT: keep this resilient to DB schema differences.
        // Selecting explicit booking columns can explode with 42703 when a column doesn't exist.
        // So we fetch booking with `*` and only enumerate relation fields.
        const withRelations =
          '*, client:client_id(id, username, name, avatar), professional:professional_id(id, username, name, avatar), service:service_id(id, title, price, price_unit)'
        const noRelations = '*'

        const variants = [withRelations, noRelations]
        let lastError = null
        let booking = null

        for (const sel of variants) {
          let res = await supabase.from('bookings').select(sel).eq('id', jobId).maybeSingle()

          if (!res?.error) {
            booking = res?.data || null
            lastError = null
            break
          }

          lastError = res.error
          // If relationships are missing, try next variants.
          if (
            isMissingRelationship(res.error)
          ) {
            continue
          }
          break
        }

        if (lastError) throw lastError
        if (cancelled) return

        // Se não encontrou booking por id (ex.: veio um id antigo/errado), tenta resolver para o aceito.
        if (!booking?.id) {
          const resolved = await resolveAcceptedBookingIdForUser()
          if (cancelled) return
          if (resolved && String(resolved) !== String(jobId)) {
            navigate(`/work-timer/${resolved}`, { replace: true })
            return
          }
        }

        // If booking is not accepted (pending/cancelled), resolve the correct accepted one.
        if (booking?.id && !isAcceptedWorkStatus(booking?.status)) {
          const resolved = await resolveAcceptedBookingIdForUser()
          if (cancelled) return
          if (resolved && String(resolved) !== String(jobId)) {
            navigate(`/work-timer/${resolved}`, { replace: true })
            return
          }
        }

        // If schedule data lives in service_requests but there's no FK relationship,
        // fetch it separately and attach to booking for agenda computations.
        const serviceRequestId = booking?.service_request_id ?? booking?.serviceRequestId ?? null
        let bookingWithRequest = booking
        if (serviceRequestId && !booking?.service_request && !booking?.serviceRequest) {
          try {
            const r = await supabase
              .from('service_requests')
              .select('*')
              .eq('id', serviceRequestId)
              .maybeSingle()
            if (!r?.error && r?.data) {
              bookingWithRequest = { ...booking, service_request: r.data }
            }
          } catch {
            // ignore
          }
        }

        // Re-check after attaching request (some schemas store status in request).
        if (bookingWithRequest?.id && !isAcceptedWorkStatus(bookingWithRequest?.status)) {
          const resolved = await resolveAcceptedBookingIdForUser()
          if (cancelled) return
          if (resolved && String(resolved) !== String(jobId)) {
            navigate(`/work-timer/${resolved}`, { replace: true })
            return
          }
        }

        setBookingRaw(bookingWithRequest)

        // Ensure profiles when relationship failed
        let clientProfile = booking?.client || null
        let professionalProfile = booking?.professional || null
        if (!clientProfile && booking?.client_id) {
          const r = await supabase
            .from('profiles')
            .select('id, username, name, avatar')
            .eq('id', booking.client_id)
            .maybeSingle()
          if (!cancelled && !r?.error) clientProfile = r?.data || null
        }
        if (!professionalProfile && booking?.professional_id) {
          const r = await supabase
            .from('profiles')
            .select('id, username, name, avatar')
            .eq('id', booking.professional_id)
            .maybeSingle()
          if (!cancelled && !r?.error) professionalProfile = r?.data || null
        }

        // Ensure service when relationship failed
        let service = booking?.service || null
        if (!service && booking?.service_id) {
          const r = await supabase
            .from('services')
            .select('id, title, price, price_unit')
            .eq('id', booking.service_id)
            .maybeSingle()
          if (!cancelled && !r?.error) service = r?.data || null
        }

        const unitKey = normalizeUnitKey(service?.price_unit)
        const paymentTypeFromUnit =
          unitKey === 'hour' ? 'hourly' : unitKey === 'day' ? 'daily' : 'event'

        const price = Number(service?.price)
        const safePrice = Number.isFinite(price) && price >= 0 ? price : 0

        const nextJobDetails = {
          id: booking?.id ?? jobId,
          clientName: getDisplayName(clientProfile) || 'Cliente',
          clientAvatar: clientProfile?.avatar || clientProfile?.avatar_url || null,
          professionalName: getDisplayName(professionalProfile) || 'Profissional',
          professionalAvatar: professionalProfile?.avatar || professionalProfile?.avatar_url || null,
          service: service?.title || 'Serviço',
          paymentType: paymentTypeFromUnit,
          hourlyRate: paymentTypeFromUnit === 'hourly' ? safePrice : 0,
          dailyRate: paymentTypeFromUnit === 'daily' ? safePrice : 0,
          eventValue: paymentTypeFromUnit === 'event' ? safePrice : 0,
          status: booking?.status || 'Agendado',
          professionalId:
            booking?.professional_id ||
            booking?.professionalId ||
            booking?.provider_id ||
            booking?.providerId ||
            booking?.worker_id ||
            booking?.workerId ||
            professionalProfile?.id ||
            null,
          clientId:
            booking?.client_id ||
            booking?.clientId ||
            booking?.customer_id ||
            booking?.customerId ||
            booking?.requester_id ||
            booking?.requesterId ||
            booking?.user_id ||
            booking?.userId ||
            clientProfile?.id ||
            null,
          clientAllowsSoloStart: false,
          maximumWorkTime: 480,
          breakReminder: 240,
        }

        setJobDetails(nextJobDetails)
        setPaymentType(nextJobDetails.paymentType)

        if (nextJobDetails.paymentType === 'hourly') {
          setPaymentRate(nextJobDetails.hourlyRate)
          setTotalValue(0)
        } else if (nextJobDetails.paymentType === 'daily') {
          setPaymentRate(nextJobDetails.dailyRate)
          setTotalValue(0)
        } else {
          setPaymentRate(0)
          setTotalValue(nextJobDetails.eventValue)
        }

        // Default agenda month to first scheduled day (if any)
        const selectedDates = getSelectedDatesFromBooking(booking)
        if (selectedDates?.length) {
          const min = selectedDates
            .slice()
            .sort((a, b) => a.getTime() - b.getTime())[0]
          if (min && !cancelled) {
            setAgendaMonth(new Date(min.getFullYear(), min.getMonth(), 1))
          }
        }
      } catch (e) {
        if (cancelled) return
        log.error('TIMER', 'load_service_failed', { ...timerTrace(null), error: e })
        // Só exibe toast destrutivo quando o jobId é válido; erros por rotas “demo” devem ser silenciosos.
        if (isUuid(jobId)) {
          toast({
            variant: 'destructive',
            title: 'Não foi possível carregar o serviço',
            description: String(e?.message || 'Tente novamente.'),
          })
        }
        // Fallback: allow page to render with placeholders
        setJobDetails({
          id: jobId,
          clientName: 'Cliente',
          professionalName: 'Profissional',
          service: 'Serviço',
          paymentType: 'hourly',
          hourlyRate: 0,
          dailyRate: 0,
          eventValue: 0,
          status: 'Agendado',
          professionalId: null,
          clientId: null,
          clientAllowsSoloStart: false,
          maximumWorkTime: 480,
          breakReminder: 240,
        })
        setAgenda(EMPTY_AGENDA)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [jobId])

  useEffect(() => {
    if (!bookingRaw) {
      setAgenda(EMPTY_AGENDA)
      return
    }
    setAgenda(
      computeAgendaFromBooking({
        booking: bookingRaw,
        elapsedTimeSeconds: elapsedTime,
        isActive,
        isPaused,
        startTime,
        sessions: workSessions,
      })
    )
  }, [bookingRaw, elapsedTime, isActive, isPaused, startTime, workSessions])

  useEffect(() => {
    // If a schedule exists, keep the selection on a contracted day.
    const planned = agenda?.plannedByDay || {}
    const keys = Object.keys(planned)
    if (!keys.length) return

    const currentKey = dayKey(selectedDay)
    if (planned[currentKey]) return

    const todayKey = dayKey(new Date())
    const nextKey = planned[todayKey] ? todayKey : keys.slice().sort()[0]
    const m = String(nextKey || '').match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/)
    if (!m) return
    const y = Number(m[1])
    const mo = Number(m[2])
    const da = Number(m[3])
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(da)) return
    setSelectedDay(new Date(y, mo - 1, da))
  }, [agenda, selectedDay])

  useEffect(() => {
    if (!jobId) {
      setStaffBookings([])
      setStaffFallbackProfile(null)
      setStaffLoading(false)
      return
    }

    // A aba "Contratando" é exclusivamente do cliente. Nunca mostrar o próprio serviço/profissional aqui.
    const resolvedClientIdForStaffTab =
      jobDetails?.clientId ||
      bookingRaw?.client_id ||
      bookingRaw?.clientId ||
      bookingRaw?.customer_id ||
      bookingRaw?.customerId ||
      bookingRaw?.requester_id ||
      bookingRaw?.requesterId ||
      bookingRaw?.user_id ||
      bookingRaw?.userId ||
      null

    const isClientForStaffTab =
      !!user?.id && !!resolvedClientIdForStaffTab && user.id === resolvedClientIdForStaffTab

    if (!isClientForStaffTab) {
      setStaffBookings([])
      setStaffFallbackProfile(null)
      setStaffLoading(false)
      return
    }

    if (!isUuid(jobId)) {
      // Modo demo/placeholder: não consulta o Supabase.
      setStaffLoading(false)
      return
    }

    // Sempre tenta mostrar ao menos o booking atual (evita lista vazia).
    if (bookingRaw) setStaffBookings([bookingRaw])
    else setStaffBookings([])

    let cancelled = false
    ;(async () => {
      try {
        setStaffLoading(true)

        const withRelations =
          '*, professional:professional_id(id, username, name, avatar), service:service_id(id, title, price, price_unit)'
        const noRelations = '*'
        const variants = [withRelations, noRelations]

        const b = bookingRaw || null

        const groupCandidates = []
        const addCandidate = (column, value) => {
          if (!column) return
          const v = value == null ? null : String(value)
          if (!v) return
          groupCandidates.push({ column, value: v })
        }

        addCandidate('request_id', b?.request_id ?? b?.requestId)
        addCandidate('service_request_id', b?.service_request_id ?? b?.serviceRequestId)
        addCandidate('work_request_id', b?.work_request_id ?? b?.workRequestId)
        addCandidate('group_id', b?.group_id ?? b?.groupId)

        // Fallback por “mesmo cliente + mesmo serviço + mesmo dia”.
        const clientId = b?.client_id || b?.clientId || null
        const serviceId = b?.service_id || b?.serviceId || null
        const scheduledDate = toValidDate(b?.scheduled_date || b?.scheduledDate)

        const queryPlans = []
        for (const c of groupCandidates) queryPlans.push({ type: 'column', ...c })
        if (clientId && serviceId && scheduledDate) {
          const dayStart = new Date(scheduledDate)
          dayStart.setHours(0, 0, 0, 0)
          const dayEnd = new Date(dayStart)
          dayEnd.setDate(dayEnd.getDate() + 1)
          queryPlans.push({
            type: 'composite',
            clientId: String(clientId),
            serviceId: String(serviceId),
            dayStart: dayStart.toISOString(),
            dayEnd: dayEnd.toISOString(),
          })
        }

        let rows = null
        let gotAny = false

        for (const plan of queryPlans) {
          if (cancelled) return

          let lastError = null
          let data = null

          for (const sel of variants) {
            let q = supabase.from('bookings').select(sel)
            if (plan.type === 'column') {
              q = q.eq(plan.column, plan.value)
            } else {
              q = q
                .eq('client_id', plan.clientId)
                .eq('service_id', plan.serviceId)
                .gte('scheduled_date', plan.dayStart)
                .lt('scheduled_date', plan.dayEnd)
            }

            const res = await q

            if (!res?.error) {
              data = Array.isArray(res?.data) ? res.data : []
              lastError = null
              break
            }

            lastError = res.error

            if (plan.type === 'column' && isMissingColumn(res.error, plan.column)) {
              // Coluna não existe neste schema; tenta próximo plano.
              data = null
              lastError = null
              break
            }
            if (isMissingRelationship(res.error)) {
              continue
            }
            break
          }

          if (lastError) {
            // Erro real (ex.: permissão) -> não quebra a tela; tenta próximo plano.
            continue
          }

          if (Array.isArray(data) && data.length) {
            rows = data
            gotAny = true
            break
          }
        }

        if (cancelled) return

        const normalized = (rows || []).filter(Boolean)
        const hasCurrent = normalized.some((x) => String(x?.id) === String(jobId))
        const base = b ? [b] : []
        const finalList = gotAny ? (hasCurrent ? normalized : [...base, ...normalized]) : base
        setStaffBookings(finalList.filter((x) => isAcceptedWorkStatus(x?.status)))
      } catch (e) {
        if (cancelled) return
        log.warn('TIMER', 'load_staff_failed', { ...timerTrace(null), error: e })
        if (bookingRaw && isAcceptedWorkStatus(bookingRaw?.status)) setStaffBookings([bookingRaw])
        else setStaffBookings([])
      } finally {
        if (!cancelled) setStaffLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [bookingRaw, jobId, user?.id, jobDetails?.clientId])

  useEffect(() => {
    // Fallback: se não conseguimos montar a lista, busca o perfil do profissional do booking atual.
    const resolvedClientIdForStaffTab =
      jobDetails?.clientId ||
      bookingRaw?.client_id ||
      bookingRaw?.clientId ||
      bookingRaw?.customer_id ||
      bookingRaw?.customerId ||
      bookingRaw?.requester_id ||
      bookingRaw?.requesterId ||
      bookingRaw?.user_id ||
      bookingRaw?.userId ||
      null

    const isClientForStaffTab =
      !!user?.id && !!resolvedClientIdForStaffTab && user.id === resolvedClientIdForStaffTab

    if (!isClientForStaffTab) {
      setStaffFallbackProfile(null)
      return
    }

    const professionalId = jobDetails?.professionalId
    if (!professionalId) {
      setStaffFallbackProfile(null)
      return
    }

    if (staffBookings?.length) {
      setStaffFallbackProfile(null)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await supabase
          .from('profiles')
          .select('id, username, name, avatar')
          .eq('id', professionalId)
          .maybeSingle()
        if (cancelled) return
        setStaffFallbackProfile(res?.error ? null : res?.data || null)
      } catch {
        if (!cancelled) setStaffFallbackProfile(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user?.id, jobDetails?.clientId, bookingRaw, jobDetails?.professionalId, staffBookings?.length])

  // Sessões (registro simples no device) para calcular horas por dia/período.
  useEffect(() => {
    if (!jobId) return
    if (!workSessionsUnavailable) return
    try {
      const raw = localStorage.getItem(`workSessions_${jobId}`)
      const parsed = raw ? JSON.parse(raw) : []
      setWorkSessions(Array.isArray(parsed) ? parsed : [])
    } catch {
      setWorkSessions([])
    }
  }, [jobId, workSessionsUnavailable])

  useEffect(() => {
    if (!jobId) return
    if (!workSessionsUnavailable) return
    try {
      localStorage.setItem(`workSessions_${jobId}`, JSON.stringify(workSessions || []))
    } catch {
      // ignore
    }
  }, [jobId, workSessions, workSessionsUnavailable])

  useEffect(() => {
    if (!jobId) return
    if (!workSessionsUnavailable) return
    try {
      const savedTimerState = localStorage.getItem(`timerState_${jobId}`)
      if (!savedTimerState) return
      const parsedState = JSON.parse(savedTimerState)
      setElapsedTime(parsedState.elapsedTime || 0)
      setIsActive(parsedState.isActive || false)
      setIsPaused(parsedState.isPaused || false)
      setStartTime(parsedState.startTime ? new Date(parsedState.startTime) : null)
      setPauseBuffer(parsedState.pauseBuffer || 0)
    } catch {
      // ignore
    }
  }, [jobId, workSessionsUnavailable])

  useEffect(() => {
    if (jobDetails) {
      if (!workSessionsUnavailable) return
      if (!hydrationReadyRef.current) return
      const hasMeaningfulState =
        Number(elapsedTime) > 0 ||
        !!isActive ||
        !!isPaused ||
        !!startTime ||
        Number(pauseBuffer) > 0
      if (!hasMeaningfulState) return

      const timerState = {
        elapsedTime,
        isActive,
        isPaused,
        startTime: startTime ? startTime.toISOString() : null,
        pauseBuffer,
      }
      try {
        localStorage.setItem(`timerState_${jobId}`, JSON.stringify(timerState))
      } catch {
        // ignore
      }

      try {
        if (import.meta.env.DEV) {
          log.debug('TIMER', 'Persist', {
            where: 'localStorage',
            key: `timerState_${jobId}`,
            timerState,
            ...timerTrace(liveWorkSession?.id || null),
          })
        }
      } catch {
        // ignore
      }
    }
  }, [
    elapsedTime,
    isActive,
    isPaused,
    startTime,
    pauseBuffer,
    jobId,
    jobDetails,
    workSessionsUnavailable,
  ])

  // Cliente: buscar notificação de "turno iniciado" desse booking para exibir botão de confirmação.
  useEffect(() => {
    const userId = user?.id
    if (!userId || !jobId || !jobDetails?.clientId) return
    if (userId !== jobDetails.clientId) {
      setClientStartNotif(null)
      return
    }

    let cancelled = false
    setClientStartNotifLoading(true)
    ;(async () => {
      try {
        const res = await supabase
          .from('notifications')
          .select('id,data,is_read,created_at,action_url')
          .eq('user_id', userId)
          .eq('type', 'work_request')
          .contains('data', { kind: 'work_timer_started', booking_id: String(jobId) })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (cancelled) return
        if (res?.error) throw res.error
        setClientStartNotif(res?.data || null)
      } catch (_e) {
        if (cancelled) return
        setClientStartNotif(null)
      } finally {
        if (!cancelled) setClientStartNotifLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user?.id, jobId, jobDetails?.clientId])

  useEffect(() => {
    let interval = null
    // When using DB-backed sessions, elapsedTime comes from computeElapsedSecondsFromSession.
    // Avoid running the legacy local tick (it ignores total_paused_seconds).
    // IMPORTANT: do NOT disable the legacy tick when the last known session is already finished.
    // Otherwise, after "Encerrar dia" the UI may have no active ticking source until a new session arrives.
    const liveStatus = String(liveWorkSession?.status || '')
    const hasLiveRunningSource =
      !!liveWorkSession?.id &&
      !workSessionsUnavailable &&
      (liveStatus === 'running' || liveStatus === 'paused')
    if (hasLiveRunningSource) return

    // Debug (DEV only): show which ticking source is active.
    try {
      if (import.meta.env.DEV) {
        const decision = computeHydrateDecision({ now: new Date() })
        log.debug('TIMER', 'TickSource', {
          source: 'legacy',
          isActive,
          isPaused,
          startTime: startTime ? String(startTime) : null,
          pauseBuffer,
          liveWorkSessionId: liveWorkSession?.id || null,
          liveWorkSessionStatus: liveStatus || null,
          effectiveStatus: decision?.effectiveStatus || null,
          pauseEvidence: decision?.pauseEvidence,
          pauseEvidenceFrom: decision?.pauseEvidenceFrom,
          workSessionsUnavailable,
          ...timerTrace(liveWorkSession?.id || null),
        })
      }
    } catch {
      // ignore
    }

    if (isActive && !isPaused && startTime) {
      interval = setInterval(() => {
        const now = new Date()
        const secondsSinceStart = Math.floor((now - startTime) / 1000)
        const newElapsedTime = pauseBuffer + secondsSinceStart
        setElapsedTime(newElapsedTime)

        // Verificar tempo máximo de trabalho
        const totalMinutes = newElapsedTime / 60
        if (totalMinutes >= jobDetails?.maximumWorkTime) {
          toast({
            title: 'Alerta de Tempo Máximo',
            description: 'Você atingiu o tempo máximo recomendado de trabalho.',
            variant: 'warning',
          })
        }

        // Lembrete de pausa
        if (totalMinutes % jobDetails?.breakReminder === 0) {
          toast({
            title: 'Lembrete de Pausa',
            description: 'Considere fazer uma pausa para descanso.',
            variant: 'default',
          })
        }
      }, 1000)
    } else {
      clearInterval(interval)
    }
    return () => clearInterval(interval)
  }, [
    isActive,
    isPaused,
    startTime,
    pauseBuffer,
    jobDetails,
    liveWorkSession?.id,
    workSessionsUnavailable,
  ])

  const handleStart = () => {
    // Debug (DEV only): capture state when starting/continuing.
    try {
      if (import.meta.env.DEV) {
        log.debug('TIMER', 'handleStart begin', {
          hasFinalizedToday,
          skipRestartConfirm: !!skipRestartConfirmRef.current,
          isActive,
          isPaused,
          elapsedTime,
          base: getBaseSecondsForToday(),
          liveWorkSessionId: liveWorkSession?.id || null,
          liveWorkSessionStatus: liveWorkSession?.status || null,
          ...timerTrace(liveWorkSession?.id || null),
        })
      }
    } catch {
      // ignore
    }

    // If the user already finalized today, confirm before starting again.
    if (!skipRestartConfirmRef.current && hasFinalizedToday && !isActive && !isPaused) {
      // Capture a best-effort base now so "Continuar" can reliably accumulate even if
      // the last stop hasn't finished persisting to Supabase yet.
      const bookingBase = readWorkedSecondsFromBooking(bookingRaw)
      const bookingPausedBase = readPausedSecondsFromBooking(bookingRaw)
      const localBase = readWorkedSecondsFromLocalTimerState(jobId)
      const currentBase = getBaseSecondsForToday()
      const worked = Math.max(bookingBase, localBase, currentBase.worked)
      const paused = Math.max(bookingPausedBase, currentBase.paused)
      setBaseSecondsForToday({ worked, paused })
      setRestartConfirmOpen(true)
      return
    }
    skipRestartConfirmRef.current = false

    // Só permite iniciar quando existe um trabalho real (booking UUID) e ele foi aceito.
    if (!isUuid(jobId) || !bookingRaw?.id) return
    const professionalIdFromBooking =
      bookingRaw?.professional_id || bookingRaw?.professionalId || null
    const isProfessionalNow =
      !!user?.id &&
      (user.id === jobDetails?.professionalId ||
        (professionalIdFromBooking && user.id === professionalIdFromBooking))
    if (!isProfessionalNow) return
    const statusRaw = bookingRaw?.status || jobDetails?.status
    if (isBlockedWorkStatus(statusRaw)) return
    if (!isAcceptedWorkStatus(statusRaw) && !hasFinalizedToday) return

    const persistedWorkedBase = Math.max(0, Math.floor(Number(bookingRaw?.worked_seconds) || 0))
    const persistedPausedBase = Math.max(0, Math.floor(Number(bookingRaw?.total_paused_seconds) || 0))
    const persistedAmountBase = calculatePayment(persistedWorkedBase)

    // If restarting after finalize today, capture the day's base so DB-backed session seconds can be added.
    // This makes the timer accumulate across multiple work_sessions in the same calendar day.
    if (hasFinalizedToday && !isActive && !isPaused) {
      const bookingBase = readWorkedSecondsFromBooking(bookingRaw)
      const bookingPausedBase = readPausedSecondsFromBooking(bookingRaw)
      const localBase = readWorkedSecondsFromLocalTimerState(jobId)
      const current = getBaseSecondsForToday()
      const worked = Math.max(persistedWorkedBase, bookingBase, localBase, current.worked)
      const paused = Math.max(persistedPausedBase, bookingPausedBase, current.paused)
      setBaseSecondsForToday({ worked, paused })
    } else {
      // First start of the day: base should be 0.
      setBaseSecondsForToday({ worked: 0, paused: 0 })
    }

    if (!isActive) {
      // Continue from what is already saved (do not overwrite the day's record).
      setPauseBuffer(persistedWorkedBase)
      setElapsedTime(persistedWorkedBase)
    }
    const now = new Date()
    setStartTime(now)
    setIsActive(true)
    setIsPaused(false)
    setJobDetails((prev) => ({ ...prev, status: 'Em Andamento' }))

    // Best-effort: persist start instantly so the client can see it.
    updateBookingProgressInSupabase({
      bookingId: bookingRaw?.id || jobId,
      workedSeconds: persistedWorkedBase,
      amount: persistedAmountBase,
      startedAt: now,
      pausedAt: null,
    }).catch(() => {})

    // Ensure ended markers are cleared (some schemas might miss columns; helper trims them).
    updateBookingTimerFieldsInSupabase({
      bookingId: bookingRaw?.id || jobId,
      payload: {
        worked_seconds: persistedWorkedBase,
        total_paused_seconds: persistedPausedBase,
        total_amount: Number(persistedAmountBase) || 0,
        work_paused_at: null,
        paused_at: null,
        ended_at: null,
        work_ended_at: null,
        work_started_at: now.toISOString(),
      },
    })
      .then((r) => {
        if (r?.data?.id) setBookingRaw((prev) => (prev ? { ...prev, ...r.data } : r.data))
      })
      .catch(() => {})

    // Realtime session (lightweight): client computes seconds/value locally.
    try {
      const b = bookingRaw || {}
      const clientId =
        jobDetails?.clientId ||
        b.client_id ||
        b.clientId ||
        b.customer_id ||
        b.customerId ||
        b.requester_id ||
        b.requesterId ||
        b.user_id ||
        b.userId ||
        null

      const ratePerHour =
        paymentType === 'hourly' && Number(paymentRate) > 0 ? Number(paymentRate) : 0

      const fixedAmount =
        paymentType === 'daily'
          ? Number(paymentRate) || 0
          : paymentType === 'event'
            ? Number(totalValue) || 0
            : null

      startWorkSession({
        bookingId: bookingRaw?.id || jobId,
        serviceId: b?.service_id || b?.serviceId || null,
        clientId,
        professionalId: user?.id,
        paymentType,
        fixedAmount,
        ratePerHour,
        startedAt: now,
      }).then((res) => {
        // Debug (DEV only): confirm whether we got a new live session.
        try {
          if (import.meta.env.DEV) {
            log.debug('TIMER', 'startWorkSession result', {
              unavailable: !!res?.unavailable,
              id: res?.data?.id || null,
              status: res?.data?.status || null,
              ...timerTrace(res?.data?.id || liveWorkSession?.id || null),
            })
          }
        } catch {
          // ignore
        }

        if (res?.unavailable) setWorkSessionsUnavailable(true)
        else if (res?.data) setLiveWorkSession(res.data)
      })
    } catch {
      // ignore
    }
    toast({
      title: 'Serviço Iniciado!',
      description: 'O cronômetro está contando.',
      variant: 'success',
    })

    // Notificação para o cliente confirmar (registro; não bloqueia o cronômetro)
    try {
      const b = bookingRaw || {}
      const clientId =
        jobDetails?.clientId ||
        b.client_id ||
        b.clientId ||
        b.customer_id ||
        b.customerId ||
        b.requester_id ||
        b.requesterId ||
        b.user_id ||
        b.userId
      const professionalName = jobDetails?.professionalName || 'Profissional'
      const serviceTitle = jobDetails?.service || 'Serviço'
      if (clientId && user?.id) {
        ;(async () => {
          const shouldCheckConfirmed = hasFinalizedToday && !isActive && !isPaused
          if (shouldCheckConfirmed) {
            try {
              const res = await supabase
                .from('notifications')
                .select('id,data,created_at')
                .eq('user_id', clientId)
                .eq('type', 'work_request')
                .contains('data', { kind: 'work_timer_started', booking_id: String(jobId) })
                .order('created_at', { ascending: false })
                .limit(5)

              const rows = Array.isArray(res?.data) ? res.data : []
              const confirmedToday = rows.some((n) => {
                const at = toValidDate(n?.data?.confirmed_at)
                return at && isSameDayKey(at, todayKey)
              })

              // No "Continuar" no mesmo dia, não pedir confirmação de novo se já confirmou hoje.
              if (confirmedToday) return

              // If we can't confirm, prefer to avoid spamming confirmations on continue.
              if (res?.error) return
            } catch {
              return
            }
          }

          createNotification({
            userId: clientId,
            type: 'work_request',
            title: 'Turno iniciado',
            body: `${professionalName} iniciou o turno de ${serviceTitle}. Confirme para registrar.`,
            actionUrl: `/work-timer/${jobId}`,
            bookingId: jobId,
            data: {
              kind: 'work_timer_started',
              booking_id: jobId,
              professional_id: user.id,
              started_at: now.toISOString(),
            },
          }).catch((e) => {
            const msg = String(e?.message || e || '')
            toast({
              title: 'Aviso ao cliente não enviado',
              description:
                msg.toLowerCase().includes('create_notification_for_booking') ||
                msg.toLowerCase().includes('does not exist')
                  ? 'Falta instalar o RPC no Supabase (setup_notifications_create_notification_for_booking_rpc.sql).'
                  : 'O turno iniciou, mas não conseguimos avisar o cliente agora.',
              variant: 'default',
            })
          })
        })()
      } else {
        toast({
          title: 'Aviso',
          description: 'Não foi possível identificar o cliente para enviar a confirmação.',
          variant: 'default',
        })
      }
    } catch (_e) {
      // silencioso: iniciar turno não pode falhar por notificação
    }
  }

  const handleClientConfirmArrival = async () => {
    if (!user?.id || !jobId) return
    if (user.id !== jobDetails?.clientId) return
    if (!clientStartNotif?.id) return
    if (clientStartNotif?.data?.confirmed_at) return

    const nowIso = new Date().toISOString()
    const professionalId = clientStartNotif?.data?.professional_id || jobDetails?.professionalId

    try {
      // 1) Marca a notificação do cliente como confirmada + lida
      const payload = {
        is_read: true,
        read_at: nowIso,
        data: {
          ...(clientStartNotif?.data || {}),
          confirmed_at: nowIso,
          confirmed_by: user.id,
        },
      }

      await supabase
        .from('notifications')
        .update(payload)
        .eq('id', clientStartNotif.id)
        .eq('user_id', user.id)

      // 2) Notifica o profissional (registro)
      if (professionalId) {
        await createNotification({
          userId: professionalId,
          type: 'work_request',
          title: 'Chegada confirmada',
          body: 'O cliente confirmou que você já chegou. (Registro)',
          actionUrl: `/work-timer/${jobId}`,
          bookingId: jobId,
          data: {
            kind: 'work_timer_start_confirmed',
            booking_id: jobId,
            client_id: user.id,
            confirmed_at: nowIso,
          },
        })
      }

      setClientStartNotif((prev) =>
        prev
          ? { ...prev, is_read: true, data: { ...(prev.data || {}), confirmed_at: nowIso, confirmed_by: user.id } }
          : prev
      )

      toast({
        title: 'Confirmado',
        description: 'Confirmação registrada com sucesso.',
        variant: 'success',
      })
    } catch (e) {
      toast({
        title: 'Não foi possível confirmar',
        description: String(e?.message || 'Tente novamente.'),
        variant: 'destructive',
      })
    }
  }

  const handlePauseResume = () => {
    if (!isActive) return

    const now = new Date()

    try {
      if (import.meta.env.DEV) {
        log.debug('TIMER', 'pauseToggle click', {
          ...timerTrace(liveWorkSession?.id || null),
          isActive,
          isPaused,
          liveWorkSessionId: liveWorkSession?.id || null,
          liveSessionProfessionalId: liveWorkSession?.professional_id || null,
          bookingProfessionalId: bookingRaw?.professional_id || bookingRaw?.professionalId || null,
          workSessionsUnavailable: !!workSessionsUnavailable,
          now: now.toISOString(),
        })
      }
    } catch {
      // ignore
    }

    // Preferred path: DB-backed session (ONLY when the session is running/paused).
    const liveStatusRaw = String(liveWorkSession?.status || '')
    const liveStatus = liveStatusRaw.trim().toLowerCase()
    const sessionToggleUsable =
      !!liveWorkSession?.id &&
      !workSessionsUnavailable &&
      (liveStatus === 'running' || liveStatus === 'paused')

    if (!sessionToggleUsable && liveWorkSession?.id) {
      try {
        if (import.meta.env.DEV) {
          log.debug('TIMER', 'session not usable for pause/resume (expect running/paused)', {
            ...timerTrace(liveWorkSession?.id || null),
            sessionStatus: liveWorkSession?.status || null,
          })
        }
      } catch {
        // ignore
      }
    }

    if (sessionToggleUsable) {
      const decision = computeHydrateDecision({ now })
      const status = String(decision?.effectiveStatus || liveWorkSession?.status || '')
      const baseWorked = getBaseSecondsForToday().worked

      try {
        if (import.meta.env.DEV) {
          log.debug('TIMER', 'pauseToggle branch=session', {
            ...timerTrace(liveWorkSession?.id || null),
            sessionStatus: liveWorkSession?.status || null,
            decisionEffectiveStatus: decision?.effectiveStatus || null,
            computedStatus: status || null,
            sessionProfessionalId: liveWorkSession?.professional_id || null,
            baseWorked,
            sessionPausedAt: liveWorkSession?.paused_at || null,
            sessionTotalPausedSeconds: liveWorkSession?.total_paused_seconds ?? null,
          })
        }
      } catch {
        // ignore
      }

      if (status === 'paused') {
        toast({
          title: 'Serviço Retomado!',
          description: 'O cronômetro voltou a contar.',
          variant: 'success',
        })

        // Immediate UI unlock: do not rely on hydration/persist to exit paused.
        setIsPaused(false)
        setLastPauseTime(null)

        // Optimistic UI: flip status to running immediately (hydration reads liveWorkSession).
        try {
          const pausedAt = liveWorkSession?.paused_at ? new Date(liveWorkSession.paused_at) : null
          const extraPaused = pausedAt && !Number.isNaN(pausedAt.getTime())
            ? Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 1000))
            : 0
          const nextTotalPaused = Math.max(
            0,
            Math.floor(Number(liveWorkSession?.total_paused_seconds) || 0) + extraPaused
          )
          setLiveWorkSession((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'running',
                  paused_at: null,
                  total_paused_seconds: nextTotalPaused,
                }
              : prev
          )

          // Clear booking pause evidence locally to avoid stale "pauseEvidence".
          setBookingRaw((prev) =>
            prev
              ? {
                  ...prev,
                  paused_at: null,
                  work_paused_at: null,
                  work_started_at: now.toISOString(),
                  total_paused_seconds: nextTotalPaused,
                }
              : prev
          )
        } catch {
          // ignore
        }

        // Best-effort: clear pause instantly in bookings so other screens update immediately.
        try {
          const sessionSeconds = computeElapsedSecondsFromSession(liveWorkSession, now)
          const seconds = baseWorked + Math.max(0, Math.floor(Number(sessionSeconds) || 0))
          const amount = calculatePayment(seconds)
          try {
            if (import.meta.env.DEV) {
              log.debug('TIMER', 'bookings(best-effort) resume -> updateBookingProgressInSupabase', {
                bookingId: bookingRaw?.id || jobId,
                workedSeconds: seconds,
                amount,
                startedAt: liveWorkSession?.started_at || startTime || null,
                pausedAt: null,
                ...timerTrace(liveWorkSession?.id || null),
              })
            }
          } catch {
            // ignore
          }
          updateBookingProgressInSupabase({
            bookingId: bookingRaw?.id || jobId,
            workedSeconds: seconds,
            amount,
            startedAt: liveWorkSession?.started_at || startTime || null,
            pausedAt: null,
          }).catch((e) =>
            log.warn('TIMER', 'updateBookingProgressInSupabase_resume_failed', { ...timerTrace(liveWorkSession?.id || null), error: e })
          )
        } catch {
          // ignore
        }

        resumeWorkSession({
          session: liveWorkSession,
          resumedAt: now,
          bookingId: bookingIdForWorkSession,
          userId: user?.id || null,
        }).then((res) => {
          try {
            if (import.meta.env.DEV) {
              log.debug('TIMER', 'resumeWorkSession result', {
                ...timerTrace(liveWorkSession?.id || null),
                error: res?.error || null,
                unavailable: !!res?.unavailable,
                data: res?.data || null,
              })
            }
          } catch {
            // ignore
          }
          if (res?.error) {
            log.error('TIMER', 'resumeWorkSession_failed', { ...timerTrace(liveWorkSession?.id || null), error: res.error })
          }
          if (res?.unavailable) setWorkSessionsUnavailable(true)
          else if (res?.data) {
            // Authoritative success: session is running again; UI must not stay paused.
            setIsPaused(false)
            setLastPauseTime(null)

            setLiveWorkSession(res.data)

            // Best-effort: keep bookings consistent for client/other screens.
            try {
              const nextTotalPaused = Math.max(
                0,
                Math.floor(
                  Number(
                    res?.data?.total_paused_seconds ??
                      liveWorkSession?.total_paused_seconds ??
                      0
                  ) || 0
                )
              )

              setBookingRaw((prev) =>
                prev
                  ? {
                      ...prev,
                      total_paused_seconds: nextTotalPaused,
                      paused_at: null,
                      work_paused_at: null,
                      work_started_at: now.toISOString(),
                    }
                  : prev
              )

              updateBookingTimerFieldsInSupabase({
                bookingId: bookingRaw?.id || jobId,
                payload: {
                  total_paused_seconds: nextTotalPaused,
                  paused_at: null,
                  work_paused_at: null,
                  work_started_at: now.toISOString(),
                },
              }).catch((e) =>
                log.warn('TIMER', 'updateBookingTimerFieldsInSupabase_resume_mirror_failed', {
                  ...timerTrace(liveWorkSession?.id || null),
                  error: e,
                })
              )
            } catch {
              // ignore
            }
          }
        })

        return
      }

      if (status === 'running') {
        // Optimistic UI: flip status to paused immediately (hydration reads liveWorkSession).
        setLiveWorkSession((prev) =>
          prev
            ? {
                ...prev,
                status: 'paused',
                paused_at: now.toISOString(),
              }
            : prev
        )

        // Best-effort: persist pause instantly using DB-derived seconds/amount.
        try {
          const sessionSeconds = computeElapsedSecondsFromSession(liveWorkSession, now)
          const seconds = baseWorked + Math.max(0, Math.floor(Number(sessionSeconds) || 0))
          const amount = calculatePayment(seconds)
          try {
            if (import.meta.env.DEV) {
              log.debug('TIMER', 'bookings(best-effort) pause -> updateBookingProgressInSupabase', {
                bookingId: bookingRaw?.id || jobId,
                workedSeconds: seconds,
                amount,
                startedAt: liveWorkSession?.started_at || startTime || null,
                pausedAt: now.toISOString(),
                ...timerTrace(liveWorkSession?.id || null),
              })
            }
          } catch {
            // ignore
          }
          updateBookingProgressInSupabase({
            bookingId: bookingRaw?.id || jobId,
            workedSeconds: seconds,
            amount,
            startedAt: liveWorkSession?.started_at || startTime || null,
            pausedAt: now,
          }).catch((e) =>
            log.warn('TIMER', 'updateBookingProgressInSupabase_pause_failed', { ...timerTrace(liveWorkSession?.id || null), error: e })
          )
        } catch {
          // ignore
        }

        pauseWorkSession({
          sessionId: liveWorkSession.id,
          pausedAt: now,
          bookingId: bookingIdForWorkSession,
          userId: user?.id || null,
        }).then((res) => {
          try {
            if (import.meta.env.DEV) {
              log.debug('TIMER', 'pauseWorkSession result', {
                ...timerTrace(liveWorkSession?.id || null),
                error: res?.error || null,
                unavailable: !!res?.unavailable,
                data: res?.data || null,
              })
            }
          } catch {
            // ignore
          }
          if (res?.error) {
            log.error('TIMER', 'pauseWorkSession_failed', { ...timerTrace(liveWorkSession?.id || null), error: res.error })
          }
          if (res?.unavailable) setWorkSessionsUnavailable(true)
          else if (res?.data) setLiveWorkSession(res.data)
        })

        toast({
          title: 'Serviço Pausado',
          description: 'O cronômetro está pausado.',
          variant: 'default',
        })
        return
      }
    }

    // Fallback (minimal, DB-backed via bookings): persist pause/resume so it doesn't reset on refresh.
    // Works even when work_sessions is unavailable or blocked by RLS.
    if (bookingRaw?.id) {
      const bookingId = bookingRaw.id

      try {
        if (import.meta.env.DEV) {
          log.debug('TIMER', 'pauseToggle branch=bookings', {
            ...timerTrace(liveWorkSession?.id || null),
            bookingId,
            isPaused,
            bookingTotalPausedSeconds: bookingRaw?.total_paused_seconds ?? null,
            bookingPausedAt: bookingRaw?.work_paused_at || bookingRaw?.paused_at || null,
          })
        }
      } catch {
        // ignore
      }

      if (isPaused) {
        const basePaused = Math.max(0, Math.floor(Number(bookingRaw?.total_paused_seconds) || 0))
        const pausedAtRaw =
          bookingRaw?.work_paused_at ||
          bookingRaw?.workPausedAt ||
          bookingRaw?.paused_at ||
          bookingRaw?.pausedAt ||
          lastPauseTime ||
          null
        const pausedAt = pausedAtRaw ? toValidDate(pausedAtRaw) : null
        const extraPaused = pausedAt ? Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 1000)) : 0
        const nextTotalPaused = basePaused + extraPaused

        // Update booking: close pause + start a new work block.
        try {
          if (import.meta.env.DEV) {
            log.debug('TIMER', 'bookings resume -> updateBookingTimerFieldsInSupabase payload', {
              bookingId,
              payload: {
                total_paused_seconds: nextTotalPaused,
                work_paused_at: null,
                paused_at: null,
                work_started_at: now.toISOString(),
              },
              ...timerTrace(liveWorkSession?.id || null),
            })
          }
        } catch {
          // ignore
        }
        updateBookingTimerFieldsInSupabase({
          bookingId,
          payload: {
            total_paused_seconds: nextTotalPaused,
            work_paused_at: null,
            paused_at: null,
            work_started_at: now.toISOString(),
          },
        })
          .then((r) => {
            try {
              if (import.meta.env.DEV) {
                log.debug('TIMER', 'bookings resume -> updateBookingTimerFieldsInSupabase result', {
                  bookingId,
                  data: r?.data || null,
                  ...timerTrace(liveWorkSession?.id || null),
                })
              }
            } catch {
              // ignore
            }
            if (r?.data?.id) setBookingRaw((prev) => (prev ? { ...prev, ...r.data } : r.data))
          })
            .catch((e) =>
              log.warn('TIMER', 'updateBookingTimerFieldsInSupabase_resume_failed', {
                ...timerTrace(liveWorkSession?.id || null),
                bookingId,
                error: e,
              })
            )

        setPauseBuffer(Math.max(0, Math.floor(Number(elapsedTime) || 0)))
        setStartTime(now)
        setIsPaused(false)
        setLastPauseTime(null)

        toast({
          title: 'Serviço Retomado!',
          description: 'O cronômetro voltou a contar.',
          variant: 'success',
        })
        return
      }

      // Pausing: lock worked time and store pause start in DB.
      const workedSecondsNow = Math.max(0, Math.floor(Number(elapsedTime) || 0))
      try {
        if (import.meta.env.DEV) {
          log.debug('TIMER', 'bookings pause -> updateBookingTimerFieldsInSupabase payload', {
            bookingId,
            payload: {
              worked_seconds: workedSecondsNow,
              worked_minutes_total: Math.max(0, Math.floor(workedSecondsNow / 60)),
              worked_minutes: Math.max(0, Math.floor(workedSecondsNow / 60)),
              worked_hours: Math.max(0, Math.round((workedSecondsNow / 3600) * 100) / 100),
              work_started_at: null,
              work_paused_at: now.toISOString(),
              paused_at: now.toISOString(),
            },
            ...timerTrace(liveWorkSession?.id || null),
          })
        }
      } catch {
        // ignore
      }
      updateBookingTimerFieldsInSupabase({
        bookingId,
        payload: {
          worked_seconds: workedSecondsNow,
          worked_minutes_total: Math.max(0, Math.floor(workedSecondsNow / 60)),
          worked_minutes: Math.max(0, Math.floor(workedSecondsNow / 60)),
          worked_hours: Math.max(0, Math.round((workedSecondsNow / 3600) * 100) / 100),
          work_started_at: null,
          work_paused_at: now.toISOString(),
          paused_at: now.toISOString(),
        },
      })
        .then((r) => {
          try {
            if (import.meta.env.DEV) {
              log.debug('TIMER', 'bookings pause -> updateBookingTimerFieldsInSupabase result', {
                bookingId,
                data: r?.data || null,
                ...timerTrace(liveWorkSession?.id || null),
              })
            }
          } catch {
            // ignore
          }
          if (r?.data?.id) setBookingRaw((prev) => (prev ? { ...prev, ...r.data } : r.data))
        })
        .catch((e) =>
          log.warn('TIMER', 'updateBookingTimerFieldsInSupabase_pause_failed', {
            ...timerTrace(liveWorkSession?.id || null),
            bookingId,
            error: e,
          })
        )

      setPauseBuffer(workedSecondsNow)
      setStartTime(null)
      setIsPaused(true)
      setLastPauseTime(now)

      toast({
        title: 'Serviço Pausado',
        description: 'O cronômetro está pausado.',
        variant: 'default',
      })
      return
    }

    if (isPaused) {
      setStartTime(now)
      setIsPaused(false)
      setPauseHistory((prev) => [
        ...prev,
        {
          start: lastPauseTime,
          end: now,
          duration: Math.floor((now - lastPauseTime) / (1000 * 60)),
        },
      ])
      toast({
        title: 'Serviço Retomado!',
        description: 'O cronômetro voltou a contar.',
        variant: 'success',
      })

      // Realtime session resume
      if (liveWorkSession?.id && !workSessionsUnavailable) {
        resumeWorkSession({
          session: liveWorkSession,
          resumedAt: now,
          bookingId: bookingIdForWorkSession,
          userId: user?.id || null,
        }).then((res) => {
          if (res?.unavailable) setWorkSessionsUnavailable(true)
          else if (res?.data) setLiveWorkSession(res.data)
        })
      }
    } else {
      // Fecha a sessão atual (do último start/resume até agora)
      try {
        const st = startTime instanceof Date ? startTime : startTime ? new Date(startTime) : null
        if (st && !Number.isNaN(st.getTime())) {
          if (workSessionsUnavailable || !liveWorkSession?.id) {
            setWorkSessions((prev) => [
              ...(Array.isArray(prev) ? prev : []),
              { start: st.toISOString(), end: now.toISOString() },
            ])
          }
        }
      } catch {
        // ignore
      }

      const secondsSinceStart = Math.floor((now - startTime) / 1000)
      setPauseBuffer((prev) => prev + secondsSinceStart)
      setIsPaused(true)
      setLastPauseTime(now)
      setTotalPauses((prev) => prev + 1)

      // Best-effort: persist pause instantly.
      updateBookingProgressInSupabase({
        bookingId: bookingRaw?.id || jobId,
        workedSeconds: elapsedTime,
        amount: calculatedAmount,
        startedAt: startTime || null,
        pausedAt: now,
      }).catch((e) =>
        log.warn('TIMER', 'updateBookingProgressInSupabase_local_pause_failed', {
          ...timerTrace(liveWorkSession?.id || null),
          error: e,
        })
      )

      // Realtime session pause
      if (liveWorkSession?.id && !workSessionsUnavailable) {
        pauseWorkSession({
          sessionId: liveWorkSession.id,
          pausedAt: now,
          bookingId: bookingIdForWorkSession,
          userId: user?.id || null,
        }).then((res) => {
          if (res?.unavailable) setWorkSessionsUnavailable(true)
          else if (res?.data) setLiveWorkSession(res.data)
        })
      }
      toast({
        title: 'Serviço Pausado',
        description: 'O cronômetro está pausado.',
        variant: 'default',
      })
    }
  }

  const calculatePayment = (workedSecondsOverride) => {
    const workedSeconds =
      workedSecondsOverride != null
        ? Math.max(0, Math.floor(Number(workedSecondsOverride) || 0))
        : Math.max(0, Math.floor(Number(elapsedTime) || 0))

    if (paymentType === 'hourly') {
      const hours = workedSeconds / 3600 // converter segundos para horas
      return hours * paymentRate
    }

    if (paymentType === 'daily') {
      return paymentRate // valor fixo da diária
    }

    if (paymentType === 'event') {
      return totalValue // valor fixo do evento
    }

    return 0
  }

  const handleStop = () => {
    const now = new Date()
    const sessionIdToFinish = liveWorkSession?.id || null

    // Debug (DEV only): show state before stop.
    try {
      if (import.meta.env.DEV) {
        log.debug('TIMER', 'handleStop begin', {
          isActive,
          isPaused,
          elapsedTime,
          base: getBaseSecondsForToday(),
          liveWorkSessionId: liveWorkSession?.id || null,
          liveWorkSessionStatus: liveWorkSession?.status || null,
          ...timerTrace(sessionIdToFinish),
        })
      }
    } catch {
      // ignore
    }

    // Prevent double-count while server-side finalize is still in-flight.
    // From this point on, the UI should treat the session as finished.
    try {
      if (liveWorkSession?.id) {
        const nowIso = now.toISOString()
        setLiveWorkSession((prev) =>
          prev
            ? {
                ...prev,
                status: 'finished',
                finished_at: prev.finished_at || nowIso,
                paused_at: null,
              }
            : prev
        )
      }
    } catch {
      // ignore
    }

    const base = getBaseSecondsForToday()

    const workedSecondsFinal = (() => {
      try {
        if (liveWorkSession?.id && !workSessionsUnavailable) {
          const sessionSeconds = computeElapsedSecondsFromSession(liveWorkSession, now)
          return base.worked + Math.max(0, Math.floor(Number(sessionSeconds) || 0))
        }
      } catch {
        // ignore
      }
      return Math.max(0, Math.floor(Number(elapsedTime) || 0))
    })()

    const pausedSecondsFinal = (() => {
      // Prefer DB-backed session pause totals.
      try {
        if (liveWorkSession?.id && !workSessionsUnavailable) {
          const sessionPaused = computeSessionPausedSeconds(liveWorkSession, now)
          return base.paused + Math.max(0, Math.floor(Number(sessionPaused) || 0))
        }
      } catch {
        // ignore
      }

      // Fallback to bookings-only model.
      try {
        if (bookingRaw?.id) {
          const base = Math.max(0, Math.floor(Number(bookingRaw?.total_paused_seconds) || 0))
          const pausedAtRaw =
            bookingRaw?.work_paused_at ||
            bookingRaw?.workPausedAt ||
            bookingRaw?.paused_at ||
            bookingRaw?.pausedAt ||
            null
          if (!pausedAtRaw) return base
          const pausedAt = toValidDate(pausedAtRaw)
          if (!pausedAt) return base
          const extra = Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 1000))
          return base + extra
        }
      } catch {
        // ignore
      }

      return 0
    })()

    const finalPayment = calculatePayment(workedSecondsFinal)

    // Daily payments should be fixed, but we can warn on irregular worked time.
    // IMPORTANT: This must NOT run during render (avoid toast/setState loops).
    try {
      if (paymentType === 'daily') {
        const totalMinutes = workedSecondsFinal / 60
        if (totalMinutes < 120 || totalMinutes > 720) {
          toast({
            title: 'Alerta de Tempo Irregular',
            description: 'O tempo trabalhado está muito abaixo ou acima do esperado para uma diária.',
            variant: 'warning',
          })
        }
      }
    } catch {
      // ignore
    }

    // Fecha a sessão atual (se estiver ativa e não pausada)
    try {
      if (isActive && !isPaused && startTime) {
        const st = startTime instanceof Date ? startTime : new Date(startTime)
        if (!Number.isNaN(st.getTime())) {
          if (workSessionsUnavailable || !liveWorkSession?.id) {
            setWorkSessions((prev) => [
              ...(Array.isArray(prev) ? prev : []),
              { start: st.toISOString(), end: now.toISOString() },
            ])
          }
        }
      }
    } catch {
      // ignore
    }

    setIsActive(false)
    setIsPaused(false)
    setJobDetails((prev) => ({ ...prev, status: 'Concluído' }))

    const summary = {
      totalTime: formatTime(workedSecondsFinal),
      totalPausedSeconds: pausedSecondsFinal,
      totalPauseTime: formatTime(pausedSecondsFinal),
      // Keep legacy fields for any consumers, but don't rely on them for totals.
      totalPauses: Math.max(0, Math.floor(Number(totalPauses) || 0)) || (Array.isArray(pauseHistory) ? pauseHistory.length : 0),
      pauseHistory,
      payment: finalPayment,
    }

    if (import.meta.env.DEV) {
      log.debug('TIMER', 'JobSummary', { ...summary, ...timerTrace(sessionIdToFinish) })
    }

    toast({
      title: 'Dia encerrado',
      description: `Tempo total: ${formatTime(workedSecondsFinal)}. Valor: ${formatCurrency(finalPayment)}.`,
      variant: 'success',
      duration: 7000,
    })

    // Mark locally that we finalized at least once today (used for restart confirmation).
    try {
      if (finalizedTodayStorageKey) localStorage.setItem(finalizedTodayStorageKey, '1')
    } catch {
      // ignore
    }

    localStorage.removeItem(`timerState_${jobId}`)

    // Persist final state (close the day): totals + exit time + clear pause/running markers.
    if (bookingRaw?.id || jobId) {
      const bookingId = bookingRaw?.id || jobId
      const nowIso = now.toISOString()
      const hasStableStartedAt = !!(bookingRaw?.started_at || bookingRaw?.startedAt)
      updateBookingTimerFieldsInSupabase({
        bookingId,
        payload: {
          worked_seconds: workedSecondsFinal,
          worked_minutes_total: Math.max(0, Math.floor(workedSecondsFinal / 60)),
          worked_minutes: Math.max(0, Math.floor(workedSecondsFinal / 60)),
          worked_hours: Math.max(0, Math.round((workedSecondsFinal / 3600) * 100) / 100),
          total_paused_seconds: pausedSecondsFinal,
          total_amount: Number(finalPayment) || 0,
          // Stop counting on refresh.
          work_started_at: hasStableStartedAt ? null : undefined,
          work_paused_at: null,
          paused_at: null,
          // Exit time (Saída)
          ended_at: nowIso,
          work_ended_at: nowIso,
        },
      })
        .then((r) => {
          if (!isMountedRef.current) return
          if (r?.data?.id) setBookingRaw((prev) => (prev ? { ...prev, ...r.data } : r.data))
        })
        .catch(() => {})
    }

    // Realtime session finish (server-side finalize when available)
    if (sessionIdToFinish && !workSessionsUnavailable) {
      // Best-effort: persist the correct paused total even if the session ends as finished.
      try {
        const nowIso = now.toISOString()
        supabase
          .from('work_sessions')
          .update({
            status: 'finished',
            finished_at: nowIso,
            paused_at: null,
            total_paused_seconds: pausedSecondsFinal,
          })
          .eq('id', sessionIdToFinish)
          .select('*')
          .maybeSingle()
          .then((r) => {
            if (!isMountedRef.current) return
            if (r?.data?.id) {
              setLiveWorkSession((prev) => (prev ? { ...prev, ...r.data } : r.data))
            }
          })
          .catch(() => {})
      } catch {
        // ignore
      }

      finishWorkSession({ sessionId: sessionIdToFinish }).then((res) => {
        if (!isMountedRef.current) return
        if (res?.unavailable) setWorkSessionsUnavailable(true)
        // If RPC returned a row, keep it so client can show final
        if (res?.data) {
          // RPC returns {session_id, elapsed_seconds, amount} or a full row on fallback
          if (res.data?.session_id && String(res.data.session_id) === String(sessionIdToFinish)) {
            setLiveWorkSession((prev) =>
              prev
                ? {
                    ...prev,
                    status: 'finished',
                    finished_at: now.toISOString(),
                    paused_at: null,
                    elapsed_seconds_final: res.data.elapsed_seconds,
                    amount_final: res.data.amount,
                    total_paused_seconds:
                      prev?.total_paused_seconds != null
                        ? prev.total_paused_seconds
                        : pausedSecondsFinal,
                  }
                : prev
            )
          } else {
            // Avoid clobbering a correct paused total with 0 from a stale row.
            setLiveWorkSession((prev) => {
              const incoming = res.data
              const incomingPaused = Math.max(0, Math.floor(Number(incoming?.total_paused_seconds) || 0))
              const preferPaused = Math.max(
                incomingPaused,
                Math.max(0, Math.floor(Number(prev?.total_paused_seconds) || 0)),
                Math.max(0, Math.floor(Number(pausedSecondsFinal) || 0))
              )

              return incoming
                ? {
                    ...(prev || {}),
                    ...incoming,
                    total_paused_seconds: preferPaused,
                  }
                : prev
            })
          }
        } else {
          setLiveWorkSession((prev) => (prev ? { ...prev, status: 'finished' } : prev))
        }
      })
    }

    // Reset UI state and focus on agenda.
    setIsActive(false)
    setIsPaused(false)
    setStartTime(null)
    setPauseBuffer(workedSecondsFinal)
    setLastPauseTime(null)
    setElapsedTime(workedSecondsFinal)
    setTotalPauses(0)
    setPauseHistory([])
    // Keep recorded sessions/events so Agenda stays correct.
    setSelectedShiftId(jobId || null)

    // Keep a reliable base for same-day "Continuar".
    setBaseSecondsForToday({ worked: workedSecondsFinal, paused: pausedSecondsFinal })

    // Debug (DEV only): show state after stop.
    try {
      if (import.meta.env.DEV) {
        log.debug('TIMER', 'handleStop end', {
          workedSecondsFinal,
          pausedSecondsFinal,
          liveWorkSessionId: sessionIdToFinish,
          ...timerTrace(sessionIdToFinish),
        })
      }
    } catch {
      // ignore
    }

    // Keep modal open and jump to agenda section.
    setTimeout(() => scrollToAgendaCard(), 0)
  }

  const handleConfirmFinishService = async () => {
    if (serviceActionBusy) return
    if (!canControlTimer) return
    if (!bookingRaw?.id && !isUuid(jobId)) return

    let shouldNavigateBack = false
    setServiceActionBusy(true)
    try {
      handleStop()

      const bookingId = bookingRaw?.id || jobId
      const r = await updateBookingTimerFieldsInSupabase({
        bookingId,
        payload: {
          status: 'completed',
        },
      })
      if (!r?.data?.id) {
        throw new Error('Não foi possível confirmar o status concluído. Tente novamente.')
      }

      setBookingRaw((prev) => (prev ? { ...prev, ...r.data } : r.data))

      // UX: finalizar serviço completo deve sair do modal e voltar.
      setIsDetailsOpen(false)
      setSelectedShiftId(null)
      shouldNavigateBack = true
    } catch (e) {
      toast({
        title: 'Não foi possível finalizar o serviço',
        description: String(e?.message || 'Tente novamente.'),
        variant: 'destructive',
      })
    } finally {
      setServiceActionBusy(false)
      setFinishServiceConfirmOpen(false)
    }

    if (shouldNavigateBack) {
      navigate(-1)
    }
  }

  const handleConfirmCancelService = async () => {
    if (serviceActionBusy) return
    if (!canControlTimer) return
    if (!bookingRaw?.id && !isUuid(jobId)) return

    setServiceActionBusy(true)
    try {
      const now = new Date()
      const bookingId = bookingRaw?.id || jobId

      // Stop any running DB-backed session, best-effort.
      if (liveWorkSession?.id && !workSessionsUnavailable) {
        try {
          await finishWorkSession({ sessionId: liveWorkSession.id })
        } catch {
          // ignore
        }
      }

      // Clear local running markers.
      setIsActive(false)
      setIsPaused(false)
      setStartTime(null)
      setLastPauseTime(null)
      setJobDetails((prev) => ({ ...prev, status: 'Cancelado' }))

      // Persist cancellation + stop markers.
      const nowIso = now.toISOString()
      const r = await updateBookingTimerFieldsInSupabase({
        bookingId,
        payload: {
          status: 'cancelled',
          work_started_at: null,
          work_paused_at: null,
          paused_at: null,
          ended_at: nowIso,
          work_ended_at: nowIso,
        },
      })
      if (r?.data?.id) {
        setBookingRaw((prev) => (prev ? { ...prev, ...r.data } : r.data))
      }

      toast({
        title: 'Serviço cancelado',
        description: 'O serviço foi cancelado com sucesso.',
        variant: 'default',
      })
    } catch (e) {
      toast({
        title: 'Não foi possível cancelar',
        description: String(e?.message || 'Tente novamente.'),
        variant: 'destructive',
      })
    } finally {
      setServiceActionBusy(false)
      setCancelServiceConfirmOpen(false)
    }
  }

  const resolvedClientId =
    jobDetails?.clientId ||
    bookingRaw?.client_id ||
    bookingRaw?.clientId ||
    bookingRaw?.customer_id ||
    bookingRaw?.customerId ||
    bookingRaw?.requester_id ||
    bookingRaw?.requesterId ||
    bookingRaw?.user_id ||
    bookingRaw?.userId ||
    null

  const resolvedProfessionalId =
    jobDetails?.professionalId ||
    bookingRaw?.professional_id ||
    bookingRaw?.professionalId ||
    bookingRaw?.provider_id ||
    bookingRaw?.providerId ||
    bookingRaw?.worker_id ||
    bookingRaw?.workerId ||
    null

  const isClient = !!user?.id && !!resolvedClientId && user.id === resolvedClientId
  const isProfessional = !!user?.id && !!resolvedProfessionalId && user.id === resolvedProfessionalId
  const calculatedAmount = jobDetails ? calculatePayment() : 0

  const hasRealWork = isUuid(jobId) && !!bookingRaw?.id
  const bookingStatusRaw = bookingRaw?.status || jobDetails?.status
  const canOperateTimer =
    !!user?.id &&
    hasRealWork &&
    isProfessional &&
    !isBlockedWorkStatus(bookingStatusRaw) &&
    (isAcceptedWorkStatus(bookingStatusRaw) || hasFinalizedToday)

  async function updateBookingProgressInSupabase({
    bookingId,
    workedSeconds,
    amount,
    startedAt,
    pausedAt,
    endedAt,
  }) {
    const id = String(bookingId || '').trim()
    if (!id) return

    let payload = {
      worked_seconds: Math.max(0, Math.floor(Number(workedSeconds) || 0)),
      worked_minutes_total: Math.max(0, Math.floor((Number(workedSeconds) || 0) / 60)),
      worked_minutes: Math.max(0, Math.floor((Number(workedSeconds) || 0) / 60)),
      worked_hours: Math.max(0, Math.round(((Number(workedSeconds) || 0) / 3600) * 100) / 100),
    }

    // IMPORTANT: do not persist total_amount until payment is ready (avoid writing 0 during hydration races).
    try {
      if (isPaymentReadyForPersist()) {
        const n = Number(amount)
        if (Number.isFinite(n) && n >= 0) payload.total_amount = n
      }
    } catch {
      // ignore
    }

    try {
      if (import.meta.env.DEV) {
        log.debug('TIMER', 'Persist', {
          where: 'updateBookingProgressInSupabase',
          bookingId: id,
          worked_seconds: payload.worked_seconds,
          has_total_amount: Object.prototype.hasOwnProperty.call(payload, 'total_amount'),
          ...timerTrace(liveWorkSession?.id || null),
        })
      }
    } catch {
      // ignore
    }

    if (startedAt) {
      const iso = startedAt instanceof Date ? startedAt.toISOString() : String(startedAt)
      payload = {
        ...payload,
        started_at: iso,
        work_started_at: iso,
        // Restarting after finalize: clear exit markers so hydration doesn't force-stop.
        ended_at: null,
        work_ended_at: null,
      }
    }

    if (pausedAt !== undefined) {
      const iso = pausedAt
        ? pausedAt instanceof Date
          ? pausedAt.toISOString()
          : String(pausedAt)
        : null
      payload = {
        ...payload,
        paused_at: iso,
        work_paused_at: iso,
      }
    }

    if (endedAt) {
      const iso = endedAt instanceof Date ? endedAt.toISOString() : String(endedAt)
      payload = {
        ...payload,
        ended_at: iso,
        work_ended_at: iso,
      }
    }

    // Remove null/undefined keys early to reduce schema mismatch chances.
    for (const k of Object.keys(payload)) {
      if (payload[k] === undefined) delete payload[k]
    }

    // Retry removing missing columns (42703) until it works.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const res = await supabase.from('bookings').update(payload).eq('id', id)
      if (!res?.error) return

      const code = String(res.error?.code || '')
      if (code !== '42703' && code !== 'PGRST204') throw res.error

      const missing = extractMissingColumnName(res.error)
      if (!missing || !(missing in payload)) throw res.error

      const next = { ...payload }
      delete next[missing]
      payload = next

      // If nothing left to update, stop.
      if (!Object.keys(payload).length) return
    }
  }

  async function updateBookingTimerFieldsInSupabase({ bookingId, payload }) {
    const id = String(bookingId || '').trim()
    if (!id) return { data: null }

    let nextPayload = payload && typeof payload === 'object' ? { ...payload } : {}

    // Remove undefined keys early to reduce schema mismatch chances.
    for (const k of Object.keys(nextPayload)) {
      if (nextPayload[k] === undefined) delete nextPayload[k]
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await supabase.from('bookings').update(nextPayload).eq('id', id).select('*').maybeSingle()
      if (!res?.error) return { data: res?.data || null }

      const code = String(res.error?.code || '')
      if (code !== '42703' && code !== 'PGRST204') throw res.error

      const missing = extractMissingColumnName(res.error)
      if (!missing || !(missing in nextPayload)) throw res.error

      const trimmed = { ...nextPayload }
      delete trimmed[missing]
      nextPayload = trimmed

      if (!Object.keys(nextPayload).length) return { data: null }
    }

    return { data: null }
  }

  async function syncBookingProgress({ force = false, reason = '' } = {}) {
    if (!canOperateTimer) return
    if (!isActive && !force) return
    if (!bookingRaw?.id) return

    if (!hydrationReadyRef.current) {
      try {
        if (import.meta.env.DEV) {
          log.debug('TIMER', 'Persist', {
            skipped: true,
            reason: 'hydration_not_ready',
            trigger: reason,
            ...timerTrace(liveWorkSession?.id || null),
          })
        }
      } catch {
        // ignore
      }
      return
    }

    const now = Date.now()
    const minIntervalMs = 10_000
    if (!force && now - (lastProgressSyncAtRef.current || 0) < minIntervalMs) return
    if (progressSyncInFlightRef.current) return

    progressSyncInFlightRef.current = true
    lastProgressSyncAtRef.current = now

    try {
      const bookingKnown = Math.max(0, Math.floor(Number(bookingRaw?.worked_seconds) || 0))
      const lastKnown = Math.max(0, Math.floor(Number(lastPersistedSecondsRef.current) || 0))
      const current = Math.max(0, Math.floor(Number(elapsedTime) || 0))
      const workedSecondsSafe = Math.max(bookingKnown, lastKnown, current)

      if (workedSecondsSafe < lastKnown) {
        try {
          if (import.meta.env.DEV) {
            log.debug('TIMER', 'Persist', {
              skipped: true,
              reason: 'monotonic_guard',
              trigger: reason,
              bookingKnown,
              lastKnown,
              current,
              workedSecondsSafe,
              ...timerTrace(liveWorkSession?.id || null),
            })
          }
        } catch {
          // ignore
        }
        return
      }

      const paymentReady = isPaymentReadyForPersist()

      await updateBookingProgressInSupabase({
        bookingId: bookingRaw.id,
        workedSeconds: workedSecondsSafe,
        amount: paymentReady ? calculatedAmount : undefined,
        startedAt: startTime || null,
        pausedAt: isPaused ? lastPauseTime || new Date() : null,
      })

      lastPersistedSecondsRef.current = workedSecondsSafe

      try {
        if (import.meta.env.DEV) {
          log.debug('TIMER', 'Persist', {
            trigger: reason,
            workedSeconds: workedSecondsSafe,
            paymentReady,
            amount: paymentReady ? calculatedAmount : '(skipped)',
            ...timerTrace(liveWorkSession?.id || null),
          })
        }
      } catch {
        // ignore
      }
    } catch (e) {
      // Do not break UX if DB update fails; just log.
      log.warn('TIMER', 'sync_progress_failed', {
        ...timerTrace(liveWorkSession?.id || null),
        reason,
        error: e,
      })
    } finally {
      progressSyncInFlightRef.current = false
    }
  }

  useEffect(() => {
    if (!canOperateTimer) return
    if (!isActive) return
    // Throttled by syncBookingProgress.
    syncBookingProgress({ reason: 'tick' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canOperateTimer, isActive, elapsedTime])

  useEffect(() => {
    if (!canOperateTimer) return
    if (!hasRealWork) return
    // Persist state transitions (pause/resume) immediately.
    syncBookingProgress({ force: true, reason: 'pause_toggle' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canOperateTimer, hasRealWork, isPaused])

  const bookingIdsKeyForRealtime = (() => {
    const ids = Array.from(
      new Set(
        [
          ...(Array.isArray(staffBookings) ? staffBookings : []).map((b) => b?.id),
          bookingRaw?.id,
          jobId,
        ]
          .filter(Boolean)
          .map((x) => String(x))
      )
    )
    ids.sort()
    return ids.join('|')
  })()

  useEffect(() => {
    // Client/other devices: subscribe to booking updates to reflect realtime progress.
    if (!user?.id) return
    if (!hasRealWork) return

    if (!bookingIdsKeyForRealtime) return
    const ids = bookingIdsKeyForRealtime.split('|').filter(Boolean)
    const topic = `bookings-live:${user.id}:${bookingIdsKeyForRealtime.slice(0, 64)}`

    // Ensure we don't keep old channels around.
    const existing = supabase.getChannels?.().find((c) => c?.topic === `realtime:${topic}`)
    if (existing) {
      try {
        supabase.removeChannel(existing)
      } catch {
        // ignore
      }
    }

    const channel = supabase.channel(topic)
    for (const id of ids) {
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${id}` },
        (payload) => {
          const next = payload?.new
          if (!next?.id) return
          const nextId = String(next.id)

          setStaffBookings((prev) => {
            const list = Array.isArray(prev) ? prev : []
            if (!list.length) return prev
            let changed = false
            const merged = list.map((b) => {
              if (!b?.id || String(b.id) !== nextId) return b
              changed = true
              return {
                ...b,
                ...next,
                // Preserve relation objects loaded via select with relations.
                client: b?.client || null,
                professional: b?.professional || null,
                service: b?.service || null,
              }
            })
            return changed ? merged : prev
          })

          if (String(jobId || '') && nextId === String(jobId)) {
            setBookingRaw((prev) =>
              prev
                ? {
                    ...prev,
                    ...next,
                    client: prev?.client || null,
                    professional: prev?.professional || null,
                    service: prev?.service || null,
                  }
                : next
            )
          }
        }
      )
    }

    channel.subscribe()
    return () => {
      try {
        channel.unsubscribe?.()
      } catch {
        // ignore
      }
      try {
        supabase.removeChannel(channel)
      } catch {
        // ignore
      }
    }
  }, [user?.id, hasRealWork, bookingIdsKeyForRealtime])

  if (!jobDetails) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-150px)]">
        <Hourglass className="h-12 w-12 animate-spin text-primary" />
      </div>
    )
  }

  const scheduledTimeRaw = bookingRaw?.scheduled_time || bookingRaw?.scheduledTime
  const todaySchedule = formatTodayScheduleLine(scheduledTimeRaw)

  const scheduleStartMinutes = getScheduleStartMinutesFromRaw(scheduledTimeRaw)
  const nowForLate = new Date()
  const scheduledStart =
    scheduleStartMinutes == null
      ? null
      : new Date(
          nowForLate.getFullYear(),
          nowForLate.getMonth(),
          nowForLate.getDate(),
          Math.floor(scheduleStartMinutes / 60),
          scheduleStartMinutes % 60,
          0,
          0
        )
  const lateReference = startTime || nowForLate
  const lateSeconds = scheduledStart
    ? Math.floor((lateReference.getTime() - scheduledStart.getTime()) / 1000)
    : 0
  const isLate = lateSeconds > 0
  const plannedMinutesToday = sumMinutesFromTimeRanges(
    typeof scheduledTimeRaw === 'string'
      ? scheduledTimeRaw
      : JSON.stringify(scheduledTimeRaw || '')
  )
  const plannedSecondsToday = plannedMinutesToday > 0 ? plannedMinutesToday * 60 : 0
  const remainingSecondsToday = plannedSecondsToday
    ? Math.max(0, plannedSecondsToday - elapsedTime)
    : 0

  const liveStatusForArc = String(liveWorkSession?.status || '')
  const isPausedByBookingEvidence = !!readPausedAtFromBooking(bookingRaw)
  const isEffectivelyPausedForArc = isPaused || liveStatusForArc === 'paused' || isPausedByBookingEvidence
  const arcNow = isEffectivelyPausedForArc ? new Date(Number(pauseNowMs) || Date.now()) : new Date()

  const workedSecondsTotalFromLive = (() => {
    if (!liveWorkSession?.id || workSessionsUnavailable) return null
    return computeElapsedSecondsFromSession(liveWorkSession, arcNow)
  })()

  const pausedSecondsTotalFromLive = (() => {
    if (!liveWorkSession?.id || workSessionsUnavailable) return null
    const base = Math.max(0, Math.floor(Number(liveWorkSession?.total_paused_seconds) || 0))
    const status = String(liveWorkSession?.status || '')
    if (status !== 'paused') return base
    const pausedAt = liveWorkSession?.paused_at ? new Date(liveWorkSession.paused_at) : null
    if (!pausedAt || Number.isNaN(pausedAt.getTime())) return base
    const now = new Date(Number(pauseNowMs) || Date.now())
    const extra = Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 1000))
    return base + extra
  })()

  const workedSecondsTotalFromBooking = (() => {
    if (!bookingRaw?.id) return null
    const base = Math.max(0, Math.floor(Number(bookingRaw?.worked_seconds) || 0))
    const workStartedAtRaw =
      bookingRaw?.work_started_at || bookingRaw?.workStartedAt || bookingRaw?.started_at || bookingRaw?.startedAt || null
    const workPausedAtRaw =
      bookingRaw?.work_paused_at || bookingRaw?.workPausedAt || bookingRaw?.paused_at || bookingRaw?.pausedAt || null

    const workStartedAt = workStartedAtRaw ? toValidDate(workStartedAtRaw) : null
    const workPausedAt = workPausedAtRaw ? toValidDate(workPausedAtRaw) : null
    if (!workStartedAt || workPausedAt) return base

    const delta = Math.max(0, Math.floor((arcNow.getTime() - workStartedAt.getTime()) / 1000))
    return base + delta
  })()

  const pausedSecondsTotalFromBookingDb = (() => {
    if (!bookingRaw?.id) return null
    const base = Math.max(0, Math.floor(Number(bookingRaw?.total_paused_seconds) || 0))
    const pausedAtRaw =
      bookingRaw?.work_paused_at ||
      bookingRaw?.workPausedAt ||
      bookingRaw?.paused_at ||
      bookingRaw?.pausedAt ||
      null
    if (!pausedAtRaw) return base
    const pausedAt = toValidDate(pausedAtRaw)
    if (!pausedAt) return base
    const now = new Date(Number(pauseNowMs) || Date.now())
    const extra = Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 1000))
    return base + extra
  })()

  const timelineSegments = (() => {
    // DB-driven visualization: persist the trails across refresh.
    // IMPORTANT: When the user has already "Encerrar dia" once today and then "Continuar",
    // a new work_session starts. If we build the trail only from the current session's events,
    // the arc would restart from zero. After finalize-today, prefer accumulated totals instead.
    if (
      !hasFinalizedToday &&
      liveWorkSession?.id &&
      !workSessionsUnavailable &&
      !workSessionEventsUnavailable &&
      workSessionEvents?.length
    ) {
      const startedAt = liveWorkSession?.started_at ? toValidDate(liveWorkSession.started_at) : null
      if (startedAt) {
        const status = String(liveWorkSession?.status || '')
        const pausedAt = liveWorkSession?.paused_at ? toValidDate(liveWorkSession.paused_at) : null
        const finishedAt = liveWorkSession?.finished_at ? toValidDate(liveWorkSession.finished_at) : null

        const events = (Array.isArray(workSessionEvents) ? workSessionEvents : [])
          .map((e) => ({
            id: e?.id,
            type: String(e?.event_type || '').trim().toLowerCase(),
            at: toValidDate(e?.occurred_at || e?.created_at) || null,
          }))
          .filter((e) => e.at && e.type)
          .sort((a, b) => {
            const at = a.at.getTime()
            const bt = b.at.getTime()
            if (at !== bt) return at - bt
            return String(a.id || '').localeCompare(String(b.id || ''))
          })

        const end = (() => {
          if (status === 'paused' && pausedAt) return pausedAt
          if (status === 'finished' && finishedAt) return finishedAt
          return arcNow
        })()

        const segs = []
        const addSeg = (kind, start, end) => {
          const s = start instanceof Date ? start : toValidDate(start)
          const e = end instanceof Date ? end : toValidDate(end)
          if (!s || !e) return
          const ms = e.getTime() - s.getTime()
          if (!Number.isFinite(ms) || ms <= 0) return
          segs.push({ kind, seconds: Math.max(0, Math.floor(ms / 1000)), startMs: s.getTime() })
        }

        let state = 'running'
        let cursor = startedAt

        for (const ev of events) {
          const t = ev.at
          if (!t) continue
          if (t.getTime() <= cursor.getTime()) continue

          if (ev.type === 'pause') {
            if (state === 'running') {
              addSeg('work', cursor, t)
              cursor = t
              state = 'paused'
            }
            continue
          }

          if (ev.type === 'resume') {
            if (state === 'paused') {
              addSeg('pause', cursor, t)
              cursor = t
              state = 'running'
            }
            continue
          }

          if (ev.type === 'finish') {
            addSeg(state === 'paused' ? 'pause' : 'work', cursor, t)
            cursor = t
            state = 'finished'
            break
          }

          // start/other events: ignore for segmentation.
        }

        if (state !== 'finished' && end && end.getTime() > cursor.getTime()) {
          addSeg(state === 'paused' ? 'pause' : 'work', cursor, end)
        }

        segs.sort((a, b) => (a.startMs || 0) - (b.startMs || 0))
        if (segs.length) return segs
      }
    }

    if (workedSecondsTotalFromLive != null || pausedSecondsTotalFromLive != null) {
      const worked = Math.max(0, Math.floor(Number(workedSecondsTotalFromLive) || 0))
      const paused = Math.max(0, Math.floor(Number(pausedSecondsTotalFromLive) || 0))
      const status = String(liveWorkSession?.status || '')
      const list = []
      const push = (kind, seconds, startMs) => {
        const s = Math.max(0, Math.floor(Number(seconds) || 0))
        if (!s) return
        list.push({ kind, seconds: s, startMs })
      }

      // Make the last segment match the current status (work last when running, pause last when paused).
      if (status === 'paused') {
        push('work', worked, 1)
        push('pause', paused, 2)
      } else {
        push('pause', paused, 1)
        push('work', worked, 2)
      }
      return list
    }

    if (workedSecondsTotalFromBooking != null || pausedSecondsTotalFromBookingDb != null) {
      const worked = Math.max(0, Math.floor(Number(workedSecondsTotalFromBooking) || 0))
      const paused = Math.max(0, Math.floor(Number(pausedSecondsTotalFromBookingDb) || 0))
      const isPausedByDb = !!(bookingRaw?.work_paused_at || bookingRaw?.workPausedAt || bookingRaw?.paused_at || bookingRaw?.pausedAt)
      const list = []
      const push = (kind, seconds, startMs) => {
        const s = Math.max(0, Math.floor(Number(seconds) || 0))
        if (!s) return
        list.push({ kind, seconds: s, startMs })
      }

      if (isPausedByDb) {
        push('work', worked, 1)
        push('pause', paused, 2)
      } else {
        push('pause', paused, 1)
        push('work', worked, 2)
      }
      return list
    }

    const segs = []
    const addSeg = (kind, start, end) => {
      const s = start instanceof Date ? start : toValidDate(start)
      const e = end instanceof Date ? end : toValidDate(end)
      if (!s || !e) return
      const ms = e.getTime() - s.getTime()
      if (!Number.isFinite(ms) || ms <= 0) return
      segs.push({ kind, seconds: Math.max(0, Math.floor(ms / 1000)), startMs: s.getTime() })
    }

    // Work segments: closed sessions + current open work session.
    for (const ws of Array.isArray(workSessions) ? workSessions : []) {
      addSeg('work', ws?.start, ws?.end)
    }
    if (isActive && !isPaused && startTime) {
      addSeg('work', startTime, arcNow)
    }

    // Pause segments: history + current open pause.
    for (const p of Array.isArray(pauseHistory) ? pauseHistory : []) {
      addSeg('pause', p?.start, p?.end)
    }
    if (isPaused && lastPauseTime) {
      addSeg('pause', lastPauseTime, arcNow)
    }

    segs.sort((a, b) => (a.startMs || 0) - (b.startMs || 0))
    return segs
  })()

  const pausedSecondsTotal = timelineSegments
    .filter((s) => s?.kind === 'pause')
    .reduce((sum, s) => sum + (Number(s?.seconds) || 0), 0)

  const pausedSecondsTotalEffective =
    // Pause always wins: if booking says paused but the live session isn't paused yet, prefer booking totals.
    isPausedByBookingEvidence && liveStatusForArc !== 'paused'
      ? (pausedSecondsTotalFromBookingDb != null ? pausedSecondsTotalFromBookingDb : pausedSecondsTotal)
      : pausedSecondsTotalFromLive != null
        ? pausedSecondsTotalFromLive
        : pausedSecondsTotalFromBookingDb != null
          ? pausedSecondsTotalFromBookingDb
          : pausedSecondsTotal

  const timelineSecondsTotal = timelineSegments.reduce(
    (sum, s) => sum + (Number(s?.seconds) || 0),
    0
  )

  const arcDenomSeconds = (() => {
    const maxWork = Number(jobDetails?.maximumWorkTime)
    const maxWorkSeconds = Number.isFinite(maxWork) && maxWork > 0 ? Math.floor(maxWork * 60) : 0
    return plannedSecondsToday || maxWorkSeconds || Math.max(1, Math.floor(timelineSecondsTotal) || 0)
  })()

  const arcSegments = (() => {
    const list = []
    let acc = 0

    for (let i = 0; i < timelineSegments.length; i += 1) {
      const seg = timelineSegments[i]
      const dur = Math.max(0, Math.floor(Number(seg?.seconds) || 0))
      if (!dur) continue

      const startPct = arcDenomSeconds ? acc / arcDenomSeconds : 0
      const endPct = arcDenomSeconds ? (acc + dur) / arcDenomSeconds : 0

      // Segments (work/pause) share the same trail and are sequential.
      // We keep them on the first half (0–180) to preserve the green earnings arc on the second half.
      const startAngle = 0 + 179.999 * clamp01(startPct)
      const endAngle = 0 + 179.999 * clamp01(endPct)

      if (endAngle - startAngle >= 0.25) {
        const kind = seg?.kind === 'pause' ? 'pause' : 'work'
        const className = kind === 'pause' ? 'text-primary' : ''
        list.push({
          key: `${kind}-${i}-${Math.round(startAngle * 10)}`,
          kind,
          className,
          startAngle,
          endAngle,
        })
      }

      acc += dur
      if (acc >= arcDenomSeconds) break
    }

    return list
  })()

  const expectedValueToday = (() => {
    if (!plannedSecondsToday && paymentType === 'hourly') return 0
    if (paymentType === 'hourly') return ((Number(plannedSecondsToday) || 0) / 3600) * (Number(paymentRate) || 0)
    if (paymentType === 'daily') return Number(paymentRate) || 0
    if (paymentType === 'event') return Number(totalValue) || 0
    return 0
  })()

  const startedAtTextForModal = (() => {
    const raw =
      (startTime ? (startTime instanceof Date ? startTime.toISOString() : String(startTime)) : null) ||
      bookingRaw?.started_at ||
      bookingRaw?.startedAt ||
      bookingRaw?.work_started_at ||
      bookingRaw?.workStartedAt ||
      null
    const d = raw ? toValidDate(raw) : null
    return d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'
  })()

  const pausedAtTextForModal = (() => {
    const total = Math.max(
      0,
      Math.floor(Number((isActive || isPaused ? pausedSecondsTotalEffective : 0) || 0))
    )
    if (!isActive && !isPaused && !total) return formatTime(0)
    return formatTime(total)
  })()

  const exitAtTextForModal = (() => {
    if (isActive || isPaused) return '—'

    const fromBooking =
      bookingRaw?.ended_at ||
      bookingRaw?.endedAt ||
      bookingRaw?.finished_at ||
      bookingRaw?.finishedAt ||
      bookingRaw?.completed_at ||
      bookingRaw?.completedAt ||
      bookingRaw?.stopped_at ||
      bookingRaw?.stoppedAt ||
      null

    const fromSessions = (() => {
      const sessions = Array.isArray(workSessions) ? workSessions : []
      for (let i = sessions.length - 1; i >= 0; i -= 1) {
        const end = sessions[i]?.end
        if (end) return end
      }
      return null
    })()

    const raw = fromBooking || fromSessions
    const d = raw ? toValidDate(raw) : null
    return d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'
  })()

  const locationLabel = (() => {
    const b = bookingRaw || {}
    const raw =
      b?.location ||
      b?.neighborhood ||
      b?.bairro ||
      b?.district ||
      b?.address_neighborhood ||
      b?.addressNeighborhood ||
      b?.address_district ||
      b?.addressDistrict ||
      b?.address_bairro ||
      b?.addressBairro ||
      b?.address?.neighborhood ||
      b?.address?.district ||
      b?.address?.bairro ||
      null
    return raw ? String(raw).trim() : ''
  })()

  const locationTextForModal = (() => {
    const neighborhood = String(locationLabel || '').trim()
    const city = pickFirstNonEmptyString(
      bookingRaw?.city,
      bookingRaw?.cidade,
      bookingRaw?.address_city,
      bookingRaw?.addressCity,
      bookingRaw?.address?.city,
      bookingRaw?.address?.cidade
    )
    const parts = [neighborhood, city].filter(Boolean)
    if (parts.length >= 2) return `${parts[0]} - ${parts[1]}`
    if (parts.length === 1) return parts[0]
    return 'Centro - Estrela'
  })()

  const progressRatio = plannedSecondsToday
    ? Math.max(0, Math.min(1, elapsedTime / plannedSecondsToday))
    : 0

  const timeProgressRatio = clamp01(progressRatio)
  const moneyProgressRatio = clamp01(
    expectedValueToday > 0 ? (Number(calculatedAmount) || 0) / (Number(expectedValueToday) || 0) : 0
  )

  const greenTrackPauseArcSegments = (() => {
    const list = []
    if (!timelineSegments?.length) return list
    let acc = 0
    for (let i = 0; i < timelineSegments.length; i += 1) {
      const seg = timelineSegments[i]
      const dur = Math.max(0, Math.floor(Number(seg?.seconds) || 0))
      if (!dur) continue

      const startPct = arcDenomSeconds ? acc / arcDenomSeconds : 0
      const endPct = arcDenomSeconds ? (acc + dur) / arcDenomSeconds : 0
      const startAngle = 180 + 179.999 * clamp01(startPct)
      const endAngle = 180 + 179.999 * clamp01(endPct)

      if (seg?.kind === 'pause' && endAngle - startAngle >= 0.25) {
        list.push({
          key: `green-pause-${i}-${Math.round(startAngle * 10)}`,
          startAngle,
          endAngle,
        })
      }

      acc += dur
      if (acc >= arcDenomSeconds) break
    }
    return list
  })()

  const greenTrackMoneyArcSegments = (() => {
    const list = []
    if (!timelineSegments?.length) return list

    const targetWorkSeconds = Math.max(0, Math.floor((Number(arcDenomSeconds) || 0) * clamp01(moneyProgressRatio)))
    if (!targetWorkSeconds) return list

    let accTime = 0
    let paintedWork = 0

    for (let i = 0; i < timelineSegments.length; i += 1) {
      const seg = timelineSegments[i]
      const dur = Math.max(0, Math.floor(Number(seg?.seconds) || 0))
      if (!dur) continue

      const startPct = arcDenomSeconds ? accTime / arcDenomSeconds : 0
      const endPct = arcDenomSeconds ? (accTime + dur) / arcDenomSeconds : 0
      const startAngle = 180 + 179.999 * clamp01(startPct)
      const endAngle = 180 + 179.999 * clamp01(endPct)
      const span = endAngle - startAngle

      if (seg?.kind === 'work' && span >= 0.25 && paintedWork < targetWorkSeconds) {
        const remaining = targetWorkSeconds - paintedWork
        const paintDur = Math.max(0, Math.min(dur, remaining))
        const paintRatio = dur ? paintDur / dur : 0
        const paintedEndAngle = startAngle + span * clamp01(paintRatio)

        if (paintedEndAngle - startAngle >= 0.25) {
          list.push({
            key: `green-money-${i}-${Math.round(startAngle * 10)}`,
            startAngle,
            endAngle: paintedEndAngle,
          })
        }
        paintedWork += paintDur
        if (paintedWork >= targetWorkSeconds) break
      }

      accTime += dur
      if (accTime >= arcDenomSeconds) break
    }

    return list
  })()

  const canControlTimer = canOperateTimer

  const monthLabel = monthLabelPtBr
  const mockAgenda = agenda
  const agendaDaysGrid = buildAgendaDaysGrid(agendaMonth)

  const today0 = new Date()
  today0.setHours(0, 0, 0, 0)
  const todayKey0 = dayKey(today0)

  const startDayKey = (() => {
    const first = Array.isArray(workSessions) && workSessions.length ? toValidDate(workSessions[0]?.start) : null
    const st = first || (startTime ? toValidDate(startTime) : null)
    if (!st) return null
    const d = new Date(st)
    d.setHours(0, 0, 0, 0)
    return dayKey(d)
  })()

  const selectedKey = dayKey(selectedDay)

  const selectedSeg = buildDaySegments({ date: selectedDay, scheduledTimeRaw })
  const openSessionForDetails = isActive && !isPaused && startTime
    ? { start: startTime instanceof Date ? startTime.toISOString() : startTime, end: new Date().toISOString() }
    : null
  const nowForDetails = new Date()
  const selMorningWorked = computeWorkedSecondsInWindow({
    sessions: workSessions,
    openSession: openSessionForDetails,
    windowStart: selectedSeg.morning.windowStart,
    windowEnd: selectedSeg.morning.windowEnd,
  })
  const selAfternoonWorked = computeWorkedSecondsInWindow({
    sessions: workSessions,
    openSession: openSessionForDetails,
    windowStart: selectedSeg.afternoon.windowStart,
    windowEnd: selectedSeg.afternoon.windowEnd,
  })
  const selMorningDesc = describeSegment({
    plannedSeconds: selectedSeg.morning.plannedSeconds,
    workedSeconds: selMorningWorked,
    segmentEnd: selectedSeg.morning.windowEnd,
    now: nowForDetails,
  })
  const selAfternoonDesc = describeSegment({
    plannedSeconds: selectedSeg.afternoon.plannedSeconds,
    workedSeconds: selAfternoonWorked,
    segmentEnd: selectedSeg.afternoon.windowEnd,
    now: nowForDetails,
  })

  const agendaProgressPct = mockAgenda.plannedHoursTotal
    ? Math.max(0, Math.min(100, (mockAgenda.doneHoursTotal / mockAgenda.plannedHoursTotal) * 100))
    : 0

  const statusDotClass = (status) => {
    if (status === 'in_progress') return 'bg-orange-500'
    if (status === 'paused') return 'bg-orange-500'
    if (status === 'finalized') return 'bg-green-600'
    if (status === 'occurrence') return 'bg-amber-600'
    if (status === 'missed') return 'bg-destructive'
    return 'bg-muted-foreground/20'
  }

  const statusPillClass = (status) => {
    if (status === 'in_progress') return 'bg-orange-500/15 text-orange-600'
    if (status === 'paused') return 'bg-orange-500/15 text-orange-600'
    if (status === 'finalized') return 'bg-green-600/15 text-green-600'
    if (status === 'occurrence') return 'bg-amber-600/15 text-amber-600'
    if (status === 'missed') return 'bg-destructive/15 text-destructive'
    return 'bg-muted/40 text-muted-foreground'
  }

  const normalizeBookingStatus = (raw) => {
    const s = String(raw || '').toLowerCase()
    if (s.includes('andamento') || s.includes('em andamento') || s.includes('in_progress')) {
      return 'in_progress'
    }
    if (s.includes('conclu') || s.includes('finaliz') || s.includes('finalized')) {
      return 'finalized'
    }
    if (s.includes('ocorr') || s.includes('proble') || s.includes('issue')) {
      return 'occurrence'
    }
    return 'scheduled'
  }

  const getWorkedSecondsFromBooking = (booking) => {
    const b = booking || {}
    const workedSecondsDirect = pickNonNegative(
      b?.worked_seconds,
      b?.workedSeconds,
      b?.seconds_worked,
      b?.secondsWorked
    )
    const workedHours = pickNonNegative(
      b?.worked_hours,
      b?.workedHours,
      b?.hours_worked,
      b?.hoursWorked
    )
    const workedMinutes = pickNonNegative(
      b?.worked_minutes,
      b?.workedMinutes,
      b?.worked_minutes_total,
      b?.workedMinutesTotal
    )
    if (workedSecondsDirect != null) return Math.max(0, Math.round(Number(workedSecondsDirect)))
    if (workedHours != null) return Math.max(0, Math.round(Number(workedHours) * 3600))
    if (workedMinutes != null) return Math.max(0, Math.round(Number(workedMinutes) * 60))
    return 0
  }

  const getBookingUnitKey = (booking) => {
    const unit =
      booking?.service?.price_unit ||
      booking?.price_unit ||
      booking?.priceUnit ||
      booking?.unit ||
      null
    return normalizeUnitKey(unit)
  }

  const getBookingPrice = (booking) => {
    const servicePrice = Number(booking?.service?.price)
    const directPrice = Number(booking?.price)
    const p = Number.isFinite(servicePrice) ? servicePrice : directPrice
    return Number.isFinite(p) && p >= 0 ? p : 0
  }

  const calcEarningsForBooking = (booking, workedSeconds) => {
    const b = booking || {}
    const directAmount = pickNonNegative(
      b?.total_amount,
      b?.totalAmount,
      b?.amount,
      b?.value,
      b?.price_total,
      b?.priceTotal
    )
    if (directAmount != null) return Number(directAmount) || 0

    const unitKey = getBookingUnitKey(b)
    const price = getBookingPrice(b)
    if (unitKey === 'hour') {
      return ((Number(workedSeconds) || 0) / 3600) * price
    }
    // Para diária/evento: valor fixo do serviço (como na UI de acompanhamento).
    return price
  }

  const isAcceptedForStaffTab = (booking) => {
    const b = booking || {}
    const statusRaw = String(b?.status || '').trim().toLowerCase()

    // Após finalizar, deve sumir do cronômetro também para o contratante.
    if (isFinalizedWorkStatus(statusRaw)) return false

    if (statusRaw) {
      if (statusRaw === 'pending' || statusRaw.includes('pendente')) return false
      if (statusRaw.includes('cancel') || statusRaw.includes('archiv')) return false
      if (statusRaw.includes('rejeit') || statusRaw.includes('declin')) return false
    }

    const acceptedSignal =
      b?.accepted_at ||
      b?.acceptedAt ||
      b?.confirmed_at ||
      b?.confirmedAt ||
      b?.professional_accepted ||
      b?.professionalAccepted ||
      b?.accepted ||
      null

    if (acceptedSignal) return true
    if (isAcceptedWorkStatus(statusRaw)) return true

    // In many schemas, a completed job also implies it was accepted.
    if (
      statusRaw === 'completed' ||
      statusRaw.includes('complete') ||
      statusRaw.includes('conclu') ||
      statusRaw.includes('finaliz')
    ) {
      return true
    }

    return false
  }

  const computeStaffTotals = () => {
    const now = new Date()
    let plannedSecondsTotal = 0
    let registeredSecondsTotal = 0
    let activeCount = 0
    let lateCount = 0
    let totalCount = 0

    for (const b of staffBookings || []) {
      if (!b) continue
      if (!isAcceptedForStaffTab(b)) continue
      totalCount += 1

      const plannedMinutes = sumMinutesFromTimeRanges(b?.scheduled_time || b?.scheduledTime || '')
      plannedSecondsTotal += Math.max(0, plannedMinutes * 60)

      const dbWorked = getWorkedSecondsFromBooking(b)
      const bid = String(b?.id || '').trim()
      const staffSession = bid ? staffWorkSessionsByBookingId?.[bid] : null
      const liveWorked = (() => {
        if (String(b?.id) === String(jobId)) {
          if (canOperateTimer && (isActive || isPaused)) return Number(elapsedTime) || 0
          if (liveWorkSession) return computeElapsedSecondsFromSession(liveWorkSession, now)
          return 0
        }
        if (staffSession) return computeElapsedSecondsFromSession(staffSession, now)
        return 0
      })()
      const mergedWorked = Math.max(dbWorked, liveWorked)
      registeredSecondsTotal += mergedWorked

      let status = String(b?.id) === String(jobId)
        ? (isActive && isPaused ? 'paused' : isActive && !isPaused ? 'in_progress' : normalizeBookingStatus(b?.status))
        : normalizeBookingStatus(b?.status)

      if (staffSession?.id) {
        const s = String(staffSession?.status || '')
        if (s === 'running') status = 'in_progress'
        else if (s === 'paused') status = 'paused'
        else if (s === 'finished') status = 'finalized'
      }

      const startedAtRaw =
        b?.started_at || b?.startedAt || b?.work_started_at || b?.workStartedAt || null
      const pausedAtRaw =
        b?.paused_at || b?.pausedAt || b?.work_paused_at || b?.workPausedAt || null

      if (status !== 'in_progress' && status !== 'paused' && status !== 'finalized') {
        if (mergedWorked > 0 && pausedAtRaw) status = 'paused'
        else if (mergedWorked > 0 && startedAtRaw) status = 'in_progress'
      }

      if (status === 'in_progress' || status === 'paused') activeCount += 1

      if (status !== 'in_progress' && status !== 'finalized' && status !== 'paused') {
        const plannedStartMin = getScheduleStartMinutesFromRaw(b?.scheduled_time || b?.scheduledTime)
        if (plannedStartMin != null) {
          const start = new Date(now)
          start.setHours(0, 0, 0, 0)
          start.setMinutes(plannedStartMin)
          const lateSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000))
          const workedSeconds = getWorkedSecondsFromBooking(b)
          if (lateSeconds > 60 && workedSeconds <= 0) lateCount += 1
        }
      }
    }

    // Se não houver planned do schema, usa o planned do booking atual como fallback.
    if (!plannedSecondsTotal && plannedSecondsToday) plannedSecondsTotal = plannedSecondsToday

    return {
      plannedSecondsTotal,
      registeredSecondsTotal,
      activeCount,
      lateCount,
      totalCount,
      now,
    }
  }

  const staffTotals = computeStaffTotals()

  const getStaffRowKind = (booking) => {
    const b = booking || {}
    const isCurrent = String(b?.id) === String(jobId)

    const bid = String(b?.id || '').trim()
    const staffSession = !isCurrent && bid ? staffWorkSessionsByBookingId?.[bid] : null

    if (isCurrent && liveWorkSession) {
      const s = String(liveWorkSession?.status || '')
      if (s === 'running') return 'in_progress'
      if (s === 'paused') return 'paused'
      if (s === 'finished') return 'finalized'
    }

    if (staffSession?.id) {
      const s = String(staffSession?.status || '')
      if (s === 'running') return 'in_progress'
      if (s === 'paused') return 'paused'
      if (s === 'finished') return 'finalized'
    }

    const dbWorkedSeconds = getWorkedSecondsFromBooking(b)
    const workedSeconds = isCurrent ? Math.max(dbWorkedSeconds, Number(elapsedTime) || 0) : dbWorkedSeconds

    const status = isCurrent
      ? (isActive && isPaused ? 'paused' : isActive && !isPaused ? 'in_progress' : normalizeBookingStatus(b?.status))
      : normalizeBookingStatus(b?.status)

    if (status === 'in_progress') return 'in_progress'
    if (status === 'paused') return 'paused'
    if (status === 'finalized') return 'finalized'

    const startedAtRaw =
      b?.started_at || b?.startedAt || b?.work_started_at || b?.workStartedAt || null
    const pausedAtRaw =
      b?.paused_at || b?.pausedAt || b?.work_paused_at || b?.workPausedAt || null

    if (workedSeconds > 0 && pausedAtRaw) return 'paused'
    if (workedSeconds > 0 && startedAtRaw) return 'in_progress'

    const plannedStartMin = getScheduleStartMinutesFromRaw(b?.scheduled_time || b?.scheduledTime)
    const now = staffTotals?.now || new Date()
    if (plannedStartMin != null) {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      start.setMinutes(plannedStartMin)
      const lateSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000))
      if (lateSeconds > 60 && workedSeconds <= 0) return 'late'
    }

    return 'scheduled'
  }

  const renderStaffRowDetailed = (booking) => {
    const b = booking || {}
    const isCurrent = String(b?.id) === String(jobId)

    const bid = String(b?.id || '').trim()
    const staffSession = !isCurrent && bid ? staffWorkSessionsByBookingId?.[bid] : null

    const profile = b?.professional || null
    const professionalId = profile?.id || b?.professional_id || b?.professionalId || null
    const name = getDisplayName(profile) || jobDetails?.professionalName || 'Profissional'
    const avatar = profile?.avatar

    const dbWorkedSeconds = getWorkedSecondsFromBooking(b)
    const liveWorkedSeconds =
      isCurrent && liveWorkSession
        ? computeElapsedSecondsFromSession(liveWorkSession, new Date(liveSessionNowMs))
        : staffSession
          ? computeElapsedSecondsFromSession(staffSession, new Date(staffSessionsNowMs))
          : 0

    const workedSeconds = isCurrent
      ? Math.max(
          dbWorkedSeconds,
          canOperateTimer && (isActive || isPaused) ? Number(elapsedTime) || 0 : liveWorkedSeconds
        )
      : dbWorkedSeconds

    const earnings = (() => {
      if (isCurrent && canOperateTimer && (isActive || isPaused)) return Number(calculatedAmount) || 0
      if (isCurrent && liveWorkSession) {
        const finalAmt = Number(liveWorkSession?.amount_final)
        if (String(liveWorkSession?.status || '') === 'finished' && Number.isFinite(finalAmt) && finalAmt >= 0) {
          return finalAmt
        }
        return computeLiveAmountFromSession(liveWorkSession, new Date(liveSessionNowMs))
      }

      if (!isCurrent && staffSession) {
        const finalAmt = Number(staffSession?.amount_final)
        if (String(staffSession?.status || '') === 'finished' && Number.isFinite(finalAmt) && finalAmt >= 0) {
          return finalAmt
        }
        return computeLiveAmountFromSession(staffSession, new Date(staffSessionsNowMs))
      }
      return calcEarningsForBooking(b, workedSeconds)
    })()

    const kind = getStaffRowKind(b)
    const now = staffTotals?.now || new Date()
    const plannedStartMin = getScheduleStartMinutesFromRaw(b?.scheduled_time || b?.scheduledTime)
    const lateSeconds = (() => {
      if (kind !== 'late' || plannedStartMin == null) return 0
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      start.setMinutes(plannedStartMin)
      return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000))
    })()

    const scheduleLine = formatTodayScheduleLine(b?.scheduled_time || b?.scheduledTime)

    const showName = String(name || 'Profissional')

    const statusLine = (() => {
      if (kind === 'in_progress') {
        return (
          <div className="flex items-center gap-2 text-sm text-orange-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-semibold">Em andamento</span>
          </div>
        )
      }

      if (kind === 'paused') {
        return (
          <div className="flex items-center gap-2 text-sm text-orange-600">
            <Pause className="h-4 w-4" />
            <span className="font-semibold">Serviço em pausa</span>
          </div>
        )
      }

      if (kind === 'finalized') {
        return (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-semibold">Finalizado</span>
          </div>
        )
      }

      if (kind === 'late') {
        return (
          <div>
            <div className="flex items-center gap-2 text-sm text-destructive">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                1
              </span>
              <span className="font-semibold">Não iniciou</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Atrasado em <span className="font-semibold text-destructive">{formatHoursMinutesShort(lateSeconds)}</span>
            </div>
          </div>
        )
      }

      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
          <span className="font-semibold">Agendado</span>
        </div>
      )
    })()

    const mainLeftLabel = (() => {
      if (kind === 'in_progress') return formatTime(workedSeconds)
      if (kind === 'paused') return formatTime(workedSeconds)
      if (kind === 'finalized') return `${formatHoursMinutesShort(workedSeconds)} registradas`
      return null
    })()

    const progressPctForCard = (() => {
      const plannedMinutes = sumMinutesFromTimeRanges(b?.scheduled_time || b?.scheduledTime || '')
      const plannedSeconds = Math.max(0, plannedMinutes * 60)
      if (!plannedSeconds) return 0
      return Math.max(0, Math.min(100, Math.round((workedSeconds / plannedSeconds) * 100)))
    })()

    const handleMessage = () => {
      if (!professionalId) return
      navigate('/messages', {
        state: {
          startConversationWith: { id: professionalId },
          serviceChat: {
            requestId: String(b?.id || '').trim(),
            tab: 'staff',
          },
        },
      })
    }

    const handleDetails = () => {
      const id = String(b?.id || '').trim()
      if (!id) return

      // Cliente (Contratando): abrir modal (sem navegar).
      if (isClient) {
        setSelectedShiftId(id)
        setIsDetailsOpen(true)
        return
      }

      navigate(`/work-timer/${id}`)
    }

    const handleReport = () => {
      toast({
        title: 'Em breve',
        description: 'O reporte de problema estará disponível em uma próxima atualização.',
      })
    }

    if (kind === 'in_progress' || kind === 'paused') {
      return (
        <Card key={String(b?.id || showName)} className="border-border/50 shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 bg-green-600/90 px-4 py-2 text-white">
            <CheckCircle2 className="h-4 w-4" />
            <div className="text-sm font-semibold">Profissional em serviço</div>
          </div>

          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="relative">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={avatar} alt={showName} />
                    <AvatarFallback className="text-sm font-semibold">
                      {showName.replace('@', '').trim().slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-600 ring-2 ring-background" />
                </div>

                <div className="min-w-0">
                  <div className="text-base font-semibold text-foreground truncate">{showName}</div>
                  <div className="text-sm text-muted-foreground">
                    {kind === 'paused' ? 'está em pausa' : 'está trabalhando'}
                  </div>
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label="Mais opções"
                onClick={() => {}}
              >
                <MoreVertical className="h-5 w-5" />
              </Button>
            </div>

            <div className="mt-3 h-2 w-full rounded-full bg-muted/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-green-600"
                style={{ width: `${progressPctForCard || 12}%` }}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 rounded-full bg-primary/15 p-1.5 text-primary">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xl font-semibold text-primary">
                    {formatHoursMinutesLong(workedSeconds)}
                  </div>
                  <div className="text-xs text-muted-foreground">{kind === 'paused' ? 'em pausa' : 'em execução'}</div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="mt-0.5 rounded-full bg-green-600/15 p-1.5 text-green-600">
                  <Wallet className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xl font-semibold text-green-600">{formatCurrency(earnings)}</div>
                  <div className="text-xs text-muted-foreground">Valor acumulado até agora</div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
              <Lock className="h-4 w-4 mt-0.5" />
              <div>Pagamento protegido, será liberado após sua confirmação</div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl gap-2"
                onClick={handleMessage}
                disabled={!professionalId}
              >
                <MessageSquare className="h-4 w-4" />
                Mensagem
              </Button>

              <Button
                type="button"
                className="h-11 rounded-2xl joby-gradient text-primary-foreground gap-2"
                onClick={handleDetails}
              >
                <Eye className="h-4 w-4" />
                Ver detalhes
              </Button>
            </div>
          </CardContent>
        </Card>
      )
    }

    return (
      <Card key={String(b?.id || showName)} className="border-border/50 shadow-xl">
        <CardContent className="pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <Avatar className="h-12 w-12">
                <AvatarImage src={avatar} alt={showName} />
                <AvatarFallback className="text-sm font-semibold">
                  {showName.replace('@', '').trim().slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0">
                <div className="text-base font-semibold text-foreground truncate">{showName}</div>
                <div className="mt-1">{statusLine}</div>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="Mais opções"
              onClick={() => {}}
            >
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>

          {(kind === 'in_progress' || kind === 'paused' || kind === 'finalized') && (
            <div className="mt-4 flex items-end justify-between gap-3">
              <div
                className={
                  kind === 'in_progress' || kind === 'paused'
                    ? 'text-xl font-mono font-semibold tabular-nums text-primary'
                    : 'text-sm text-muted-foreground'
                }
              >
                {mainLeftLabel}
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold text-green-600">{formatCurrency(earnings)}</div>
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-2xl gap-2"
              onClick={handleMessage}
              disabled={!professionalId}
            >
              <MessageSquare className="h-4 w-4" />
              Mensagem
            </Button>

            {kind === 'late' ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-2xl gap-2 text-destructive"
                onClick={handleReport}
              >
                <AlertTriangle className="h-4 w-4" />
                Reportar problema
              </Button>
            ) : (
              <Button
                type="button"
                className="h-11 rounded-2xl joby-gradient text-primary-foreground gap-2"
                onClick={handleDetails}
              >
                <Eye className="h-4 w-4" />
                Ver detalhes
              </Button>
            )}
          </div>

          {scheduleLine && kind !== 'in_progress' && kind !== 'finalized' ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              <span className="truncate">{scheduleLine}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  const renderStaffRow = (booking) => {
    const b = booking || {}
    const isCurrent = String(b?.id) === String(jobId)

    const profile = b?.professional || null
    const name = getDisplayName(profile) || jobDetails?.professionalName || 'Profissional'
    const avatar = profile?.avatar

    const dbWorkedSeconds = getWorkedSecondsFromBooking(b)
    const liveWorkedSeconds =
      isCurrent && liveWorkSession
        ? computeElapsedSecondsFromSession(liveWorkSession, new Date(liveSessionNowMs))
        : 0

    const workedSeconds = isCurrent
      ? Math.max(
          dbWorkedSeconds,
          canOperateTimer && (isActive || isPaused) ? Number(elapsedTime) || 0 : liveWorkedSeconds
        )
      : dbWorkedSeconds

    const earnings = (() => {
      if (isCurrent && canOperateTimer && (isActive || isPaused)) return Number(calculatedAmount) || 0
      if (isCurrent && liveWorkSession) {
        const finalAmt = Number(liveWorkSession?.amount_final)
        if (String(liveWorkSession?.status || '') === 'finished' && Number.isFinite(finalAmt) && finalAmt >= 0) {
          return finalAmt
        }
        return computeLiveAmountFromSession(liveWorkSession, new Date(liveSessionNowMs))
      }
      return calcEarningsForBooking(b, workedSeconds)
    })()

    const status = isCurrent
      ? (isActive && !isPaused ? 'in_progress' : normalizeBookingStatus(b?.status))
      : normalizeBookingStatus(b?.status)

    const plannedStartMin = getScheduleStartMinutesFromRaw(b?.scheduled_time || b?.scheduledTime)
    const now = staffTotals?.now || new Date()

    let subtitle = null
    if (status === 'in_progress') {
      subtitle = (
        <div className="flex items-center gap-2 text-sm text-orange-600">
          <CheckCircle2 className="h-4 w-4" />
          <span className="font-semibold">Em andamento</span>
        </div>
      )
    } else if (status === 'finalized') {
      subtitle = (
        <div className="text-sm text-muted-foreground">
          <span className="text-green-600 font-semibold">Finalizado</span>
          {workedSeconds > 0 ? (
            <span className="ml-2">{formatHoursMinutesShort(workedSeconds)} registradas</span>
          ) : null}
        </div>
      )
    } else {
      // scheduled
      if (plannedStartMin != null) {
        const start = new Date(now)
        start.setHours(0, 0, 0, 0)
        start.setMinutes(plannedStartMin)
        const lateSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000))
        if (lateSeconds > 60 && workedSeconds <= 0) {
          subtitle = (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
              <span className="font-semibold">Atrasado em {formatHoursMinutesShort(lateSeconds)}</span>
            </div>
          )
        }
      }
    }

    return (
      <div
        key={String(b?.id || name)}
        className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/50 px-3 py-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-12 w-12">
            <AvatarImage src={avatar} alt={name} />
            <AvatarFallback className="text-sm font-semibold">
              {String(name || '?')
                .replace('@', '')
                .trim()
                .slice(0, 1)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-base font-semibold text-foreground truncate">{name}</div>
            </div>
            <div className="mt-0.5">{subtitle}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-base font-semibold text-green-600">
              {formatCurrency(earnings)}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="Mais opções"
            onClick={() => {}}
          >
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </div>
    )
  }

  const displayStaffBookings =
    isClient
      ? staffBookings?.length
        ? staffBookings
        : staffFallbackProfile
          ? [
              {
                id: jobId,
                professional_id: staffFallbackProfile.id,
                professional: staffFallbackProfile,
                status: jobDetails?.status,
                service: {
                  price: paymentRate,
                  price_unit:
                    jobDetails?.paymentType === 'hourly'
                      ? 'hour'
                      : jobDetails?.paymentType === 'daily'
                        ? 'day'
                        : 'event',
                },
                scheduled_time: bookingRaw?.scheduled_time || bookingRaw?.scheduledTime,
              },
            ]
          : []
      : []

  const acceptedDisplayStaffBookings = (displayStaffBookings || [])
    .filter(isAcceptedForStaffTab)
    .filter((b) => {
      const uid = String(user?.id || '').trim()
      const pid = String(b?.professional_id || b?.professional?.id || '').trim()
      if (!uid || !pid) return true
      return pid !== uid
    })

  const staffListForTab = (() => {
    const list = acceptedDisplayStaffBookings || []
    if (staffFilter === 'all') return list
    if (staffFilter === 'in_progress') return list.filter((b) => getStaffRowKind(b) === 'in_progress')
    if (staffFilter === 'late') return list.filter((b) => getStaffRowKind(b) === 'late')
    if (staffFilter === 'finalized') return list.filter((b) => getStaffRowKind(b) === 'finalized')
    return list
  })()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto py-6 px-3 sm:px-4 max-w-lg"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden border-b-0">
          <TabsTrigger value="mine" className="py-2">
            Prestando serviço
          </TabsTrigger>
          <TabsTrigger value="staff" className="py-2">
            Contratando
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="mt-5">
          {(() => {
            if (
              !isProfessional ||
              !hasRealWork ||
              isBlockedWorkStatus(bookingStatusRaw) ||
              isFinalizedWorkStatus(bookingStatusRaw)
            ) {
              return (
                <div className="p-6 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/40">
                    <Briefcase className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="text-lg font-semibold text-foreground">Nenhum serviço para prestar</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Crie um novo serviço para começar a receber solicitações.
                  </div>
                  <div className="mt-5">
                    <Button
                      type="button"
                      className="w-full h-12 rounded-2xl gap-2"
                      onClick={() => {
                        if (!user?.id) {
                          navigate('/login')
                          return
                        }
                        navigate(`/profile/${user.id}?tab=services&serviceForm=1`)
                      }}
                    >
                      <Briefcase className="h-4 w-4" />
                      Adicionar Serviço
                    </Button>
                  </div>
                </div>
              )
            }

            const workedLabel = formatHoursMinutesLong(elapsedTime)
            const earned = Number.isFinite(Number(calculatedAmount)) ? Number(calculatedAmount) : 0
            const progressPct = Math.round(Math.max(0, Math.min(100, (progressRatio || 0) * 100)))

            const clientName = jobDetails?.clientName || 'Cliente'
            const serviceTitle = jobDetails?.service || 'Serviço'

            const neighborhood = String(locationLabel || '').trim()
            const city = pickFirstNonEmptyString(
              bookingRaw?.city,
              bookingRaw?.cidade,
              bookingRaw?.address_city,
              bookingRaw?.addressCity,
              bookingRaw?.address?.city,
              bookingRaw?.address?.cidade
            )

            const locationText = (() => {
              const parts = [neighborhood, city].filter(Boolean)
              if (parts.length >= 2) return `${parts[0]} - ${parts[1]}`
              if (parts.length === 1) return parts[0]
              return 'Centro - Estrela'
            })()

            const clientAvatar =
              bookingRaw?.client?.avatar ||
              bookingRaw?.client?.avatar_url ||
              bookingRaw?.client?.photo_url ||
              bookingRaw?.client?.photoUrl ||
              jobDetails?.clientAvatar ||
              null

            const openDetails = () => {
              setSelectedShiftId(jobId || null)
              setIsDetailsOpen(true)
            }

            const titleLabel =
              acceptedServicesCount > 1
                ? 'Próximos serviços'
                : isPaused
                  ? 'Serviço em pausa'
                  : isActive
                    ? 'Serviço em andamento'
                    : 'Próximos serviços'

            const showInServiceBand = (titleLabel === 'Serviço em andamento' && isActive) || (titleLabel === 'Serviço em pausa' && isPaused)

            const inServiceBand = (() => {
              if (!showInServiceBand) return null
              if (titleLabel === 'Serviço em pausa') {
                return {
                  className: 'bg-orange-500/90',
                  icon: <Pause className="h-4 w-4" />,
                  label: 'Serviço em pausa',
                }
              }
              return {
                className: 'bg-green-600/90',
                icon: <CheckCircle2 className="h-4 w-4" />,
                label: 'Serviço em andamento',
              }
            })()

            const primaryLabel = 'Ver detalhes'

            const handlePrimaryAction = () => {
              openDetails()
            }

            const handleChat = () => {
              const clientId = jobDetails?.clientId
              if (!clientId) {
                toast({
                  variant: 'destructive',
                  title: 'Chat indisponível',
                  description: 'Não foi possível identificar o cliente para abrir o chat.',
                })
                return
              }
              navigate('/messages', {
                state: {
                  startConversationWith: { id: clientId },
                  serviceChat: {
                    requestId: String(jobId || '').trim(),
                    tab: 'mine',
                  },
                },
              })
            }

            const r = 18
            const c = 2 * Math.PI * r
            const progressOffset = c * (1 - progressPct / 100)

            return (
              <>
                <Card className="border-border/50 shadow-xl overflow-hidden">
                  {inServiceBand ? (
                    <div className={`flex items-center gap-2 ${inServiceBand.className} px-4 py-2 text-white`}>
                      {inServiceBand.icon}
                      <div className="text-sm font-semibold">{inServiceBand.label}</div>
                    </div>
                  ) : null}

                  <CardContent className={inServiceBand ? 'pt-3' : 'pt-5'}>
                    {!inServiceBand ? (
                      <div className="flex items-center gap-3">
                        <div className="text-base font-semibold text-foreground">{titleLabel}</div>
                      </div>
                    ) : null}

                    <div className={inServiceBand ? 'mt-2 flex items-start gap-3 min-w-0' : 'mt-4 flex items-start gap-3 min-w-0'}>
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={clientAvatar || undefined} alt={clientName} />
                          <AvatarFallback className="text-sm font-semibold">
                            {String(clientName || '?')
                              .replace('@', '')
                              .trim()
                              .slice(0, 1)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0">
                          <div className="text-base font-semibold text-foreground truncate">{clientName}</div>
                          <div className="mt-1 space-y-1 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2 min-w-0">
                              <Briefcase className="h-4 w-4" />
                              <span className="truncate">{serviceTitle}</span>
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              <MapPin className="h-4 w-4" />
                              <span className="truncate">{locationText}</span>
                            </div>
                          </div>
                        </div>
                    </div>

                    <div className="mt-5 -mx-5 grid grid-cols-3 gap-3 items-center">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <div className="text-lg font-semibold text-foreground">{workedLabel}</div>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">trabalhadas</div>
                      </div>

                      <div className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Wallet className="h-4 w-4 text-muted-foreground" />
                          <div className="text-lg font-semibold text-foreground">{formatCurrency(earned)}</div>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">acumulado</div>
                      </div>

                      <div className="flex items-center justify-center">
                        <div className="relative h-14 w-14">
                          <svg className="h-full w-full -rotate-90" viewBox="0 0 50 50" aria-hidden="true">
                            <circle
                              cx="25"
                              cy="25"
                              r={r}
                              fill="transparent"
                              stroke="currentColor"
                              className="text-muted/40"
                              strokeWidth="5"
                            />
                            <circle
                              cx="25"
                              cy="25"
                              r={r}
                              fill="transparent"
                              stroke="currentColor"
                              className="text-primary"
                              strokeWidth="5"
                              strokeLinecap="round"
                              strokeDasharray={c}
                              strokeDashoffset={progressOffset}
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-foreground">
                            {progressPct}%
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        className="h-12 rounded-2xl joby-gradient text-primary-foreground gap-2"
                        onClick={handlePrimaryAction}
                      >
                        <Eye className="h-4 w-4" />
                        {primaryLabel}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        className="h-12 rounded-2xl gap-2"
                        onClick={handleChat}
                      >
                        <MessageSquare className="h-4 w-4" />
                        Chat
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )
          })()}
        </TabsContent>

        <TabsContent value="staff" className="mt-5">
          <>
            {isClient ? (
              <div className="px-1">
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <div>
                    Total previsto hoje:{' '}
                    <span className="font-semibold text-foreground">
                      {staffTotals?.plannedSecondsTotal ? formatHoursMinutesShort(staffTotals.plannedSecondsTotal) : '—'}
                    </span>
                  </div>
                  <div>
                    Total registrado:{' '}
                    <span className="font-semibold text-foreground">
                      {Number.isFinite(Number(staffTotals?.registeredSecondsTotal))
                        ? formatHoursMinutesShort(Number(staffTotals?.registeredSecondsTotal) || 0)
                        : '—'}
                    </span>
                  </div>
                </div>

                <div className="mt-2 text-xs text-muted-foreground">
                  Profissionais ativos:{' '}
                  <span className="font-semibold text-primary">
                    {Number(staffTotals?.activeCount || 0)} de {Number(staffTotals?.totalCount || 0)}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {staffListForTab?.length ? (
                staffListForTab.map(renderStaffRowDetailed)
              ) : (
                <div className="p-6 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/40">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="text-lg font-semibold text-foreground">Nenhum profissional contratado</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Encontre profissionais para contratar e acompanhar os turnos por aqui.
                  </div>
                  <div className="mt-5">
                    <Button
                      type="button"
                      className="w-full h-12 rounded-2xl gap-2"
                      onClick={() => navigate('/explore?tab=people')}
                    >
                      <Users className="h-4 w-4" />
                      Encontre profissionais para contratar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        </TabsContent>
      </Tabs>

      <WorkDetailsModal
        open={isDetailsOpen}
        title="Detalhes do turno"
        onClose={() => {
          setIsDetailsOpen(false)
          setSelectedShiftId(null)
        }}
        closeOnOutside={true}
        closeOnEsc={true}
        showHeader={false}
      >
        <div
          className="px-5 pb-6 pt-4 space-y-4"
          data-selected-shift-id={String(selectedShiftId || '')}
        >
          {isClient ? (
            (() => {
              const activeBookingId = String(selectedShiftId || jobId || '').trim()
              const selectedBooking =
                (Array.isArray(staffBookings)
                  ? staffBookings.find((x) => String(x?.id || '').trim() === activeBookingId)
                  : null) ||
                (String(bookingRaw?.id || jobId || '').trim() === activeBookingId ? bookingRaw : null) ||
                bookingRaw ||
                null

              const segmentsRaw = (() => {
                if (!activeBookingId) return []
                if (String(jobId || '').trim() === activeBookingId) {
                  return Array.isArray(workSessions) ? workSessions : []
                }
                const fromStaff = staffWorkSessionsByBookingId?.[activeBookingId]
                return Array.isArray(fromStaff) ? fromStaff : []
              })()

              const segments = (Array.isArray(segmentsRaw) ? segmentsRaw : [])
                .map((s) => {
                  const st = toValidDate(s?.start)
                  const en = toValidDate(s?.end)
                  if (!st || !en) return null
                  const ms = en.getTime() - st.getTime()
                  if (ms <= 0) return null
                  return { start: st, end: en, seconds: Math.floor(ms / 1000) }
                })
                .filter(Boolean)

              const workedSeconds = segments.reduce((acc, s) => acc + (Number(s.seconds) || 0), 0)

              const workedLabel = formatHoursColonMinutes(workedSeconds)

              const earnings = (() => {
                if (!selectedBooking) return 0
                return calcEarningsForBooking(selectedBooking, workedSeconds)
              })()

              const startedAt = segments.length ? segments[0].start : null
              const startedAtText = startedAt
                ? startedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : '—'

              const dateLabel = (() => {
                const raw =
                  selectedBooking?.scheduled_date ||
                  selectedBooking?.scheduledDate ||
                  selectedBooking?.date ||
                  selectedBooking?.created_at ||
                  selectedBooking?.createdAt ||
                  bookingRaw?.scheduled_date ||
                  bookingRaw?.scheduledDate ||
                  bookingRaw?.created_at ||
                  bookingRaw?.createdAt ||
                  null
                const d = raw ? toValidDate(raw) : null
                return d
                  ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
                  : '—'
              })()

              const priceLabel = (() => {
                const price = getBookingPrice(selectedBooking || bookingRaw || {})
                const unit = getBookingUnitKey(selectedBooking || bookingRaw || {})
                if (!price) return '—'
                if (unit === 'hour') return `${formatCurrency(price)} / hora`
                if (unit === 'day') return `${formatCurrency(price)} / diária`
                if (unit === 'event') return `${formatCurrency(price)} / evento`
                return formatCurrency(price)
              })()

              const description =
                selectedBooking?.description ||
                selectedBooking?.service_description ||
                selectedBooking?.serviceDescription ||
                jobDetails?.description ||
                ''

              const time = (d) =>
                d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'

              const pauseSecondsTotal = (() => {
                let secs = 0
                for (let i = 0; i < segments.length - 1; i += 1) {
                  const end = segments[i]?.end
                  const nextStart = segments[i + 1]?.start
                  if (!end || !nextStart) continue
                  const gapSec = Math.floor((nextStart.getTime() - end.getTime()) / 1000)
                  if (gapSec > 30) secs += gapSec
                }
                return Math.max(0, secs)
              })()

              const scheduledTimeRaw = pickFirstNonEmptyString(
                selectedBooking?.scheduled_time,
                selectedBooking?.scheduledTime,
                selectedBooking?.scheduled_time_raw,
                selectedBooking?.time_ranges,
                selectedBooking?.timeRanges,
                bookingRaw?.scheduled_time,
                bookingRaw?.scheduledTime,
                bookingRaw?.time_ranges,
                bookingRaw?.timeRanges
              )

              const plannedSecondsToday = (() => {
                const minutes = sumMinutesFromTimeRanges(scheduledTimeRaw)
                return Math.max(0, Math.floor(Number(minutes || 0) * 60))
              })()

              const progressPct = plannedSecondsToday
                ? Math.max(0, Math.min(100, Math.round((workedSeconds / plannedSecondsToday) * 100)))
                : 0

              const formatCompactHm = (seconds) => {
                const totalMinutes = Math.max(0, Math.floor(Number(seconds || 0) / 60))
                const hours = Math.floor(totalMinutes / 60)
                const minutes = totalMinutes % 60
                return `${hours}h${String(minutes).padStart(2, '0')}`
              }

              const remainingSecondsToday = plannedSecondsToday
                ? Math.max(0, plannedSecondsToday - workedSeconds)
                : 0

              const scheduledStartText = (() => {
                const s = String(scheduledTimeRaw || '').trim()
                if (!s) return '—'
                const m = s.match(/\b(\d{1,2}):(\d{2})\b/)
                if (!m) return '—'
                const hh = String(m[1]).padStart(2, '0')
                const mm = String(m[2]).padStart(2, '0')
                return `${hh}:${mm}`
              })()

              const scheduleDiffLabel = (() => {
                if (!startedAt) return '—'
                if (scheduledStartText === '—') return '—'

                const parts = scheduledStartText.split(':')
                const hh = Number(parts[0])
                const mm = Number(parts[1])
                if (!Number.isFinite(hh) || !Number.isFinite(mm)) return '—'

                const scheduled = new Date(
                  startedAt.getFullYear(),
                  startedAt.getMonth(),
                  startedAt.getDate(),
                  hh,
                  mm,
                  0,
                  0
                )
                const diffMin = Math.round((startedAt.getTime() - scheduled.getTime()) / 60000)

                if (Math.abs(diffMin) <= 5) return 'No horário'
                if (diffMin > 0) return `Atrasado ${diffMin}min`
                return `Adiantado ${Math.abs(diffMin)}min`
              })()

              const startedOnTime = scheduleDiffLabel === 'No horário'

              const timelineName = (() => {
                const prof =
                  selectedBooking?.professional ||
                  selectedBooking?.provider ||
                  selectedBooking?.worker ||
                  selectedBooking?.professional_profile ||
                  null
                const username = String(prof?.username || '').trim()
                if (username) return username.startsWith('@') ? username : `@${username}`
                return jobDetails?.professionalName || 'Profissional'
              })()

              const timelineAvatar = (() => {
                const prof =
                  selectedBooking?.professional ||
                  selectedBooking?.provider ||
                  selectedBooking?.worker ||
                  selectedBooking?.professional_profile ||
                  null
                return prof?.avatar || prof?.avatar_url || prof?.photo_url || prof?.photoUrl || null
              })()

              const timelineStatus = (() => {
                const raw = selectedBooking?.status || bookingRaw?.status || ''
                const normalized = normalizeBookingStatus(raw)
                if (normalized === 'in_progress') return 'Trabalhando agora'
                if (normalized === 'paused') return 'Em pausa'
                if (normalized === 'finalized') return 'Finalizado'
                return 'Agendado'
              })()

              const buildTimelineRows = () => {
                const rows = []
                for (let i = 0; i < segments.length; i += 1) {
                  const seg = segments[i]
                  rows.push({
                    key: `work-${i}-${seg.start.toISOString()}`,
                    kind: 'work',
                    left: `${time(seg.start)} - ${time(seg.end)}`,
                    label: `Trabalhou ${formatHoursMinutesShort(seg.seconds)}`,
                  })

                  const next = segments[i + 1]
                  if (next) {
                    const gapSec = Math.floor((next.start.getTime() - seg.end.getTime()) / 1000)
                    if (gapSec > 30) {
                      rows.push({
                        key: `pause-${i}-${seg.end.toISOString()}`,
                        kind: 'pause',
                        left: `${time(seg.end)} - ${time(next.start)}`,
                        label: `Pausa ${formatHoursMinutesShort(gapSec)}`,
                      })
                    }
                  }
                }
                return rows
              }

              const rows = buildTimelineRows()

              return (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border/50">
                      <div className="text-base font-semibold text-foreground">Resumo do Dia</div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-lg font-medium text-foreground">Total estimado hoje</div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            Baseado em {formatHoursMinutesShort(workedSeconds)} trabalhadas
                          </div>
                        </div>
                        <div className="text-3xl font-semibold text-green-600">{formatCurrency(earnings)}</div>
                      </div>

                      {plannedSecondsToday ? (
                        <div className="mt-4">
                          <div className="h-3 w-full rounded-full bg-muted/40 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${progressPct}%`,
                                background: 'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary)) 100%)',
                              }}
                            />
                          </div>
                          <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                            <div className="tabular-nums">
                              {formatCompactHm(workedSeconds)} da carga diária - {progressPct}%
                            </div>
                            <div className="tabular-nums">
                              {remainingSecondsToday > 0
                                ? `Faltam ${formatCompactHm(remainingSecondsToday)} para completar o dia`
                                : 'Carga diária concluída'}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-3 flex items-center gap-2">
                        {startedOnTime ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-orange-600" />
                        )}
                        <div className={startedOnTime ? 'text-green-600 font-medium' : 'text-orange-600 font-medium'}>
                          {startedOnTime ? 'Começou no horário' : scheduleDiffLabel}
                        </div>
                      </div>

                      <div className="mt-4 border-t border-border/50" />

                      <div className="mt-3 space-y-2 text-base">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-orange-600">Tempo trabalhado:</span>
                          <span className="font-semibold text-foreground tabular-nums">
                            {formatHoursColonMinutes(workedSeconds)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[hsl(var(--trust-blue))]">Tempo em pausa:</span>
                          <span className="font-semibold text-foreground tabular-nums">
                            {formatHoursMinutesShort(pauseSecondsTotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border/50">
                      <div className="text-base font-semibold text-foreground">Situação do Dia</div>
                    </div>
                    <div className="p-4 space-y-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>Horário combinado:</span>
                        <span className="ml-auto font-semibold text-foreground tabular-nums">{scheduledStartText}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>Início real:</span>
                        <span className="ml-auto font-semibold text-foreground tabular-nums">{startedAtText}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>Diferença:</span>
                        <span className="ml-auto font-semibold text-foreground">{scheduleDiffLabel}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-card/60 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border/50">
                      <div className="text-base font-semibold text-foreground">Linha do Tempo</div>
                    </div>

                    <div className="p-4">
                      {!startedAt ? (
                        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                          Ainda não há registros de tempo para este serviço.
                        </div>
                      ) : (
                        <div className="relative pl-7">
                          <div className="absolute left-2 top-1 bottom-1 w-px bg-border/60" aria-hidden="true" />

                          <div className="relative mb-4">
                            <div className="absolute -left-[21px] top-1.5 h-3 w-3 rounded-full bg-orange-500" />
                            <div className="flex items-center gap-3 text-sm">
                              <span className="font-semibold text-foreground tabular-nums">{time(startedAt)}</span>
                              <span className="text-muted-foreground">Início do serviço</span>
                            </div>
                          </div>

                          <div className="relative mb-4">
                            <div className="absolute -left-[21px] top-5 h-3 w-3 rounded-full bg-orange-500" />
                            <div className="rounded-2xl border border-border/60 bg-background/40 px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <Avatar className="h-10 w-10">
                                    <AvatarImage src={timelineAvatar || undefined} alt={timelineName} />
                                    <AvatarFallback className="text-sm font-semibold">
                                      {String(timelineName || '?')
                                        .replace('@', '')
                                        .trim()
                                        .slice(0, 1)
                                        .toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <div className="font-semibold text-foreground truncate">{timelineName}</div>
                                    <div className="text-sm text-muted-foreground">{timelineStatus}</div>
                                  </div>
                                </div>
                                <div className="rounded-full bg-muted/40 px-3 py-1 text-sm font-semibold text-foreground tabular-nums">
                                  {formatHoursMinutesShort(workedSeconds)}
                                </div>
                              </div>
                            </div>
                          </div>

                          {rows.map((r) => (
                            <div key={r.key} className="relative mb-3">
                              <div
                                className={
                                  'absolute -left-[21px] top-1.5 h-3 w-3 rounded-full ' +
                                  (r.kind === 'pause' ? 'bg-[hsl(var(--trust-blue))]' : 'bg-orange-500')
                                }
                              />
                              <div className="flex items-center gap-3 text-sm">
                                <span className="font-semibold text-foreground tabular-nums">{r.left}</span>
                                <span className={r.kind === 'pause' ? 'text-[hsl(var(--trust-blue))] font-medium' : 'text-muted-foreground'}>
                                  {r.label}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()
          ) : !isActive && !isPaused ? (
            <>
              <div className="pt-1">
                <div className="flex items-center justify-center">
                  <div className="inline-flex items-center gap-2 rounded-full bg-muted/40 px-3 py-1 text-sm text-muted-foreground">
                    <Hourglass className="h-4 w-4" />
                    <span className="font-semibold">Aguardando início</span>
                  </div>
                </div>

                <div className="mt-3 text-center text-base font-semibold text-foreground">
                  {(jobDetails?.service || 'Serviço') + ' • ' + (jobDetails?.clientName || 'Cliente')}
                </div>

                <div className="mt-5 flex items-center justify-center">
                  <div className="relative h-84 w-84 rounded-full bg-background shadow-xl overflow-hidden">
                    <svg className="h-full w-full" viewBox="0 0 100 100" aria-hidden="true">
                      <defs>
                        <linearGradient
                          id={jobyWorkArcGradientId}
                          gradientUnits="userSpaceOnUse"
                          x1="50"
                          y1="0"
                          x2="50"
                          y2="100"
                        >
                          <stop offset="0%" stopColor="hsl(var(--primary))" />
                          <stop offset="100%" stopColor="hsl(var(--trust-blue))" />
                        </linearGradient>
                      </defs>

                      <circle
                        cx="50"
                        cy="50"
                        r="48"
                        fill="transparent"
                        stroke="currentColor"
                        className="text-muted/40"
                        strokeWidth="4"
                      />

                      {arcSegments?.length
                        ? arcSegments.map((seg) => (
                            <g key={seg.key}>
                              <path
                                d={describeArc(50, 50, 48, seg.startAngle, seg.endAngle)}
                                fill="transparent"
                                stroke="hsl(var(--background))"
                                strokeWidth="6"
                                strokeLinecap="round"
                              />
                              <path
                                d={describeArc(50, 50, 48, seg.startAngle, seg.endAngle)}
                                fill="transparent"
                                stroke={seg.kind === 'work' ? `url(#${jobyWorkArcGradientId})` : 'currentColor'}
                                className={seg.className}
                                strokeWidth="4"
                                strokeLinecap="round"
                              />
                            </g>
                          ))
                        : null}

                      {greenTrackMoneyArcSegments?.length
                        ? greenTrackMoneyArcSegments.map((seg) => (
                            <g key={seg.key}>
                              <path
                                d={describeArc(50, 50, 48, seg.startAngle, seg.endAngle)}
                                fill="transparent"
                                stroke="hsl(var(--background))"
                                strokeWidth="6"
                                strokeLinecap="round"
                              />
                              <path
                                d={describeArc(50, 50, 48, seg.startAngle, seg.endAngle)}
                                fill="transparent"
                                stroke="currentColor"
                                className="text-green-600"
                                strokeWidth="4"
                                strokeLinecap="round"
                              />
                            </g>
                          ))
                        : null}
                    </svg>

                    <div className="absolute inset-5 rounded-full bg-background/95 flex flex-col items-center justify-center text-center px-5">
                      <div className="relative h-12 w-full">
                        <div
                          className={
                            'absolute inset-0 flex items-center justify-center font-mono font-semibold tabular-nums leading-none tracking-wider transform-gpu transition-all duration-300 ease-out ' +
                            (isPaused ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100')
                          }
                        >
                          <span
                            style={{
                              backgroundImage:
                                'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--trust-blue)) 100%)',
                            }}
                            className="text-5xl bg-clip-text text-transparent"
                          >
                            {formatTime(elapsedTime)}
                          </span>
                        </div>

                        <div
                          className={
                            'absolute inset-0 flex items-center justify-center font-mono font-semibold tabular-nums leading-none tracking-wider transform-gpu transition-all duration-300 ease-out ' +
                            (isPaused ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.02]')
                          }
                        >
                          <span
                            style={{
                              backgroundImage:
                                'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--trust-blue)) 100%)',
                            }}
                            className="text-4xl bg-clip-text text-transparent"
                          >
                            {formatTime(elapsedTime)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 text-sm text-muted-foreground">Ganho até agora</div>
                      <div className="mt-1 text-3xl font-semibold text-green-600">{formatCurrency(calculatedAmount)}</div>

                      <div className="mt-3 relative h-12 w-full">
                        <div
                          className={
                            'absolute inset-0 flex items-center justify-center transform-gpu transition-all duration-300 ease-out ' +
                            (isPaused ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none')
                          }
                        >
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Pause className="h-5 w-5" />
                            <div className="text-4xl font-mono font-semibold tabular-nums leading-none tracking-wider">
                              {formatTime(isActive || isPaused ? pausedSecondsTotalEffective : 0)}
                            </div>
                          </div>
                        </div>

                        <div
                          className={
                            'absolute inset-0 flex items-center justify-center transform-gpu transition-all duration-300 ease-out ' +
                            (isPaused ? 'opacity-0 translate-y-1 pointer-events-none' : 'opacity-100 translate-y-0')
                          }
                        >
                          <div className="inline-flex items-center gap-2 rounded-full bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground">
                            <Pause className="h-4 w-4" />
                            <span className="font-mono font-semibold tabular-nums">
                              {formatTime(isActive || isPaused ? pausedSecondsTotalEffective : 0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 border-t border-border/50" />

                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin className="h-4 w-4" />
                    <span className="truncate">{locationTextForModal}</span>
                  </div>

                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="flex-1">Início:</span>
                    <span className="font-semibold text-foreground tabular-nums">{startedAtTextForModal}</span>
                  </div>

                  <div className="flex items-center gap-2 min-w-0">
                    <Wallet className="h-4 w-4" />
                    <span className="flex-1">Meta do dia:</span>
                    <span className="font-semibold text-foreground">{formatCurrency(expectedValueToday)}</span>
                  </div>

                  <div className="flex items-center gap-2 min-w-0">
                    <Pause className="h-4 w-4" />
                    <span className="flex-1">Pausa:</span>
                    <span className="font-semibold text-foreground tabular-nums">{pausedAtTextForModal}</span>
                  </div>

                  <div className="flex items-center gap-2 min-w-0">
                    <Hourglass className="h-4 w-4" />
                    <span className="flex-1">Tempo estimado restante:</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {plannedSecondsToday ? formatHoursMinutesLong(remainingSecondsToday) : '—'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 min-w-0">
                    <StopCircle className="h-4 w-4" />
                    <span className="flex-1">Saída:</span>
                    <span className="font-semibold text-foreground tabular-nums">{exitAtTextForModal}</span>
                  </div>
                </div>

                <div className="mt-6">
                  <Button
                    type="button"
                    size="lg"
                    className="w-full h-12 rounded-2xl gap-2"
                    onClick={handleStart}
                    disabled={!canControlTimer}
                  >
                    <Play size={20} /> Iniciar turno
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="pt-1">
              <div className="flex items-center justify-center">
                {isActive && !isPaused ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/15 px-3 py-1 text-sm text-orange-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="font-semibold">Em andamento</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/15 px-3 py-1 text-sm text-orange-600">
                    <Hourglass className="h-4 w-4" />
                    <span className="font-semibold">Serviço em pausa</span>
                  </div>
                )}
              </div>

              <div className="mt-3 text-center text-base font-semibold text-foreground">
                {(jobDetails?.service || 'Serviço') + ' • ' + (jobDetails?.clientName || 'Cliente')}
              </div>

              <div className="mt-5 flex items-center justify-center">
                <div className="relative h-84 w-84 rounded-full bg-background shadow-xl overflow-hidden">
                  <svg className="h-full w-full" viewBox="0 0 100 100" aria-hidden="true">
                    <defs>
                      <linearGradient
                        id={jobyWorkArcGradientId}
                        gradientUnits="userSpaceOnUse"
                        x1="50"
                        y1="0"
                        x2="50"
                        y2="100"
                      >
                        <stop offset="0%" stopColor="hsl(var(--primary))" />
                        <stop offset="100%" stopColor="hsl(var(--trust-blue))" />
                      </linearGradient>
                    </defs>

                    <circle
                      cx="50"
                      cy="50"
                      r="48"
                      fill="transparent"
                      stroke="currentColor"
                      className="text-muted/40"
                      strokeWidth="4"
                    />

                    {arcSegments?.length
                      ? arcSegments.map((seg) => (
                          <g key={seg.key}>
                            <path
                              d={describeArc(50, 50, 48, seg.startAngle, seg.endAngle)}
                              fill="transparent"
                              stroke="hsl(var(--background))"
                              strokeWidth="6"
                              strokeLinecap="round"
                            />
                            <path
                              d={describeArc(50, 50, 48, seg.startAngle, seg.endAngle)}
                              fill="transparent"
                              stroke={seg.kind === 'work' ? `url(#${jobyWorkArcGradientId})` : 'currentColor'}
                              className={seg.className}
                              strokeWidth="4"
                              strokeLinecap="round"
                            />
                          </g>
                        ))
                      : null}

                    {greenTrackMoneyArcSegments?.length
                      ? greenTrackMoneyArcSegments.map((seg) => (
                          <g key={seg.key}>
                            <path
                              d={describeArc(50, 50, 48, seg.startAngle, seg.endAngle)}
                              fill="transparent"
                              stroke="hsl(var(--background))"
                              strokeWidth="6"
                              strokeLinecap="round"
                            />
                            <path
                              d={describeArc(50, 50, 48, seg.startAngle, seg.endAngle)}
                              fill="transparent"
                              stroke="currentColor"
                              className="text-green-600"
                              strokeWidth="4"
                              strokeLinecap="round"
                            />
                          </g>
                        ))
                      : null}
                  </svg>

                    <div className="absolute inset-5 rounded-full bg-background/95 flex flex-col items-center justify-center text-center px-5">
                    <div className="relative h-12 w-full">
                      <div
                        className={
                          'absolute inset-0 flex items-center justify-center font-mono font-semibold tabular-nums leading-none tracking-wider transform-gpu transition-all duration-300 ease-out ' +
                          (isPaused ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100')
                        }
                      >
                        <span
                          style={{
                            backgroundImage:
                              'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--trust-blue)) 100%)',
                          }}
                          className="text-5xl bg-clip-text text-transparent"
                        >
                          {formatTime(elapsedTime)}
                        </span>
                      </div>

                      <div
                        className={
                          'absolute inset-0 flex items-center justify-center font-mono font-semibold tabular-nums leading-none tracking-wider transform-gpu transition-all duration-300 ease-out ' +
                          (isPaused ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.02]')
                        }
                      >
                        <span
                          style={{
                            backgroundImage:
                              'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--trust-blue)) 100%)',
                          }}
                          className="text-4xl bg-clip-text text-transparent"
                        >
                          {formatTime(elapsedTime)}
                        </span>
                      </div>
                    </div>

                      <div className="mt-3 text-sm text-muted-foreground">Ganho até agora</div>
                      <div className="mt-1 text-3xl font-semibold text-green-600">{formatCurrency(calculatedAmount)}</div>

                      <div className="mt-3 relative h-12 w-full">
                        <div
                          className={
                            'absolute inset-0 flex items-center justify-center transform-gpu transition-all duration-300 ease-out ' +
                            (isPaused ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none')
                          }
                        >
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Pause className="h-5 w-5" />
                            <div className="text-4xl font-mono font-semibold tabular-nums leading-none tracking-wider">
                              {formatTime(isActive || isPaused ? pausedSecondsTotalEffective : 0)}
                            </div>
                          </div>
                        </div>

                        <div
                          className={
                            'absolute inset-0 flex items-center justify-center transform-gpu transition-all duration-300 ease-out ' +
                            (isPaused ? 'opacity-0 translate-y-1 pointer-events-none' : 'opacity-100 translate-y-0')
                          }
                        >
                          <div className="inline-flex items-center gap-2 rounded-full bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground">
                            <Pause className="h-4 w-4" />
                            <span className="font-mono font-semibold tabular-nums">
                              {formatTime(isActive || isPaused ? pausedSecondsTotalEffective : 0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                </div>
              </div>

              <div className="mt-6 border-t border-border/50" />

              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="h-4 w-4" />
                  <span className="truncate">{locationTextForModal}</span>
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="flex-1">Início:</span>
                  <span className="font-semibold text-foreground tabular-nums">{startedAtTextForModal}</span>
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <Wallet className="h-4 w-4" />
                  <span className="flex-1">Meta do dia:</span>
                  <span className="font-semibold text-foreground">{formatCurrency(expectedValueToday)}</span>
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <Pause className="h-4 w-4" />
                  <span className="flex-1">Pausa:</span>
                  <span className="font-semibold text-foreground tabular-nums">{pausedAtTextForModal}</span>
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <Hourglass className="h-4 w-4" />
                  <span className="flex-1">Tempo estimado restante:</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {plannedSecondsToday ? formatHoursMinutesLong(remainingSecondsToday) : '—'}
                  </span>
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <StopCircle className="h-4 w-4" />
                  <span className="flex-1">Saída:</span>
                  <span className="font-semibold text-foreground tabular-nums">{exitAtTextForModal}</span>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {canControlTimer && (
                  <div>
                    <div className="flex gap-3">
                      <Button
                        onClick={handlePauseResume}
                        size="lg"
                        className="flex-1 h-12 rounded-2xl gap-2"
                      >
                        {isPaused ? <Play size={20} /> : <Pause size={20} />}
                        {isPaused ? 'Retomar' : 'Pausar'}
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="flex-1 h-12 rounded-2xl gap-2"
                        onClick={handleStop}
                      >
                        <StopCircle size={20} /> Encerrar dia
                      </Button>
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      Encerra só hoje. O serviço continua.
                    </div>
                  </div>
                )}

                {!canControlTimer && hasRealWork && !isProfessional && (
                  <div className="text-sm text-muted-foreground">Aguardando o profissional registrar o turno.</div>
                )}
              </div>
            </div>
          )}

          <Card ref={agendaCardRef} className="shadow-xl border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Agenda</CardTitle>
              <CardDescription>
                {monthLabel ? monthLabel(agendaMonth) : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {agendaDaysGrid.map((d, idx) => {
                  if (!d) return <div key={`empty-${idx}`} />
                  const k = dayKey(d)
                  const planned = mockAgenda?.plannedByDay || {}
                  const hasPlan = Object.keys(planned).length > 0
                  const isPlanned = !!planned?.[k]
                  const isSelectable = hasPlan ? isPlanned : true
                  const status = isSelectable ? mockAgenda?.byDay?.[k]?.status || null : null
                  const isSelected = k === selectedKey

                  const dotClass = statusDotClass(status)
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={!isSelectable}
                      onClick={() => {
                        if (!isSelectable) return
                        setSelectedDay(d)
                      }}
                      className={
                        !isSelectable
                          ? 'rounded-xl border border-border/30 bg-muted/10 px-0.5 py-2 text-center opacity-40 cursor-not-allowed'
                          : isSelected
                            ? 'rounded-xl border border-primary/50 bg-background px-0.5 py-2 text-center'
                            : 'rounded-xl border border-border/50 bg-card/40 px-0.5 py-2 text-center'
                      }
                    >
                      <div className={isSelectable ? 'text-xs font-semibold text-foreground' : 'text-xs font-semibold text-muted-foreground'}>
                        {d.getDate()}
                      </div>
                      <div className={`mx-auto mt-1 h-1.5 w-6 rounded-full ${dotClass}`} />
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 rounded-2xl border border-border/50 bg-card/40 p-3">
                <div className="text-sm font-semibold text-foreground">{formatAgendaLabelPt(selectedDay)}</div>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <div>
                    <span className="font-semibold text-foreground">Manhã:</span> {selMorningDesc?.label || '—'}
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Tarde:</span> {selAfternoonDesc?.label || '—'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {hasRealWork && canControlTimer && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  size="lg"
                  className="w-full h-12 rounded-2xl justify-center gap-2 joby-gradient text-primary-foreground"
                  onClick={() => setFinishServiceConfirmOpen(true)}
                  disabled={serviceActionBusy}
                >
                  <StopCircle size={20} />
                  <span className="whitespace-nowrap">Finalizar serviço</span>
                </Button>

                <Button
                  type="button"
                  size="lg"
                  variant="destructive"
                  className="w-full h-12 rounded-2xl justify-center gap-2"
                  onClick={() => setCancelServiceConfirmOpen(true)}
                  disabled={serviceActionBusy}
                >
                  <AlertTriangle size={20} />
                  <span className="whitespace-nowrap">Cancelar serviço</span>
                </Button>
              </div>

              <div className="rounded-xl bg-muted/30 p-3 text-xs text-muted-foreground">
                <div className="flex gap-2">
                  <span
                    className="mt-0.5 h-2 w-2 rounded-full flex-none"
                    style={{ backgroundColor: 'hsl(var(--trust-blue))' }}
                    aria-hidden="true"
                  />
                  <span>Ao finalizar o serviço, o valor será enviado para confirmação do cliente.</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <span
                    className="mt-0.5 h-2 w-2 rounded-full flex-none"
                    style={{ backgroundColor: 'hsl(var(--trust-blue))' }}
                    aria-hidden="true"
                  />
                  <span>O cancelamento pode impactar sua reputação na plataforma.</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </WorkDetailsModal>

      <AlertDialog
        open={restartConfirmOpen}
        onOpenChange={(open) => {
          setRestartConfirmOpen(open)
          if (!open) skipRestartConfirmRef.current = false
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você já finalizou hoje</AlertDialogTitle>
            <AlertDialogDescription>
              Você já finalizou este turno hoje. Quer continuar registrando mais tempo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Sair</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                skipRestartConfirmRef.current = true
                setRestartConfirmOpen(false)
                handleStart()
              }}
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={finishServiceConfirmOpen} onOpenChange={setFinishServiceConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalizar serviço completo?</AlertDialogTitle>
            <AlertDialogDescription>
              <div>
                Isso encerra o dia de hoje e marca o serviço como concluído (completed). Não poderá continuar depois.
              </div>
              <div className="mt-3 flex items-start gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <span>Ação definitiva: bloqueia novos registros para este serviço.</span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={serviceActionBusy}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmFinishService} disabled={serviceActionBusy}>
              Finalizar serviço
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelServiceConfirmOpen} onOpenChange={setCancelServiceConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar serviço</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja cancelar o serviço? Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={serviceActionBusy}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancelService} disabled={serviceActionBusy}>
              Cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}

export default WorkTimer
