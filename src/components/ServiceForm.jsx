import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { motion } from 'framer-motion'
import {
  X,
  Clock,
  Calendar,
  ClipboardList,
  Wrench,
  AlertCircle,
  Truck,
  Percent,
  Timer,
  Home,
  Upload,
  MapPin,
  Check,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
} from 'lucide-react'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import DocsRequiredDialog from '@/components/DocsRequiredDialog'
import { formatPriceUnit, normalizePriceUnit } from '@/lib/priceUnit'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { optimizeImageFile } from '@/lib/imageOptimize'
import { formatFileSize } from '@/lib/mediaCompression'
import { log } from '@/lib/logger'
import { normalizeImage, NormalizeImageError } from '@/services/imageNormalizeService'
import { runHeicFlow, revokePreviewUrlIfNeeded } from '@/lib/heicClientConvert'
import { resizeImageClient } from '@/lib/imageResizeClient'

const PRICE_UNIT_OPTIONS = [
  { value: 'hora', label: 'Hora' },
  { value: 'dia', label: 'Diária' },
  { value: 'mes', label: 'Mês' },
  { value: 'projeto', label: 'Projeto' },
  { value: 'evento', label: 'Evento' },
]

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const brlNumberFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const toMoneyNumber = (value) => {
  if (value == null) return 0
  const normalized = String(value).trim().replace(',', '.')
  const num = Number(normalized)
  return Number.isFinite(num) ? num : 0
}

const formatBRL = (value) => brlFormatter.format(toMoneyNumber(value))

const parseBRLNumber = (raw) => {
  const v = String(raw ?? '').trim()
  if (!v) return null

  // pt-BR: milhares '.' e decimais ','
  const cleaned = v.replace(/[^0-9.,-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === ',' || cleaned === '.') return null

  const normalized = cleaned.replace(/\./g, '').replace(',', '.')
  const num = Number(normalized)
  return Number.isFinite(num) ? num : null
}

const formatBRLNumber = (value) => brlNumberFormatter.format(toMoneyNumber(value))

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

const clampTimeToRange = (value, minTime, maxTime) => {
  // Permite o sentinel "00:00" (período não utilizado).
  if (String(value || '') === '00:00') return '00:00'
  const v = timeToMinutes(value)
  const minV = timeToMinutes(minTime)
  const maxV = timeToMinutes(maxTime)
  if (v == null || minV == null || maxV == null) return value
  const clamped = Math.max(minV, Math.min(maxV, v))
  return minutesToTime(clamped) || value
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

const isTimeInRange = (t, minTime, maxTime) => {
  const v = timeToMinutes(t)
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

const parseWorkDaysFromAvailableHours = (availableHours) => {
  const items = Array.isArray(availableHours) ? availableHours : []
  const map = {}
  let found = false

  for (const raw of items) {
    if (typeof raw !== 'string') continue
    const text = raw.trim()
    if (!text) continue

    // Ex.: "20/01/2026 • Manhã (4h)"
    const m = text.match(/^(\d{2}\/\d{2}\/\d{4})\s*[•\-]\s*(.+)$/)
    if (!m) continue
    const dt = parseBRDate(m[1])
    if (!dt) continue

    const label = String(m[2] || '').trim()
    if (!label) continue

    const key = format(dt, 'yyyy-MM-dd')
    map[key] = { label }
    found = true
  }

  return found ? map : null
}

const formatWorkDaysToAvailableHours = (workDaysMap) => {
  const map = workDaysMap || {}
  const keys = Object.keys(map)
    .filter(Boolean)
    .sort()

  return keys
    .map((key) => {
      const entry = map[key]
      if (!entry?.label) return null
      const dt = new Date(`${key}T00:00:00`)
      if (!Number.isFinite(dt.getTime())) return null
      const br = format(dt, 'dd/MM/yyyy', { locale: ptBR })
      return `${br} • ${entry.label}`
    })
    .filter(Boolean)
}

const normalizeAvailabilityLabel = (rawLabel) => {
  const raw = String(rawLabel || '').trim()
  if (!raw) return { key: '', display: '' }

  const lower = stripDiacritics(raw).toLowerCase()
  if (lower.startsWith('dia inteiro')) {
    return { key: 'full', display: 'Dia inteiro' }
  }

  // Suporta rótulos antigos como: "Manhã (4h)" / "Tarde (3,5h)"
  const hMatch = raw.match(/\((\d+(?:[\.,]\d+)?)h\)/i)
  if (hMatch) {
    const h = Number(String(hMatch[1] || '').replace(',', '.'))
    if (Number.isFinite(h) && h > 0) {
      const minutes = Math.round(h * 60)
      const display = formatHoursShort(minutes)
      return { key: `hours:${display}`, display }
    }
  }

  const ranges = raw.match(/\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}/g) || []
  if (ranges.length) {
    const normalized = ranges
      .map((r) => r.replace(/\s*[-–]\s*/g, '–').trim())
      .filter(Boolean)

    // Preferir horas por dia no resumo (ex.: manhã 5h => "5h")
    let totalMinutes = 0
    for (const r of normalized) {
      const m = r.match(/^(\d{2}:\d{2})–(\d{2}:\d{2})$/)
      if (!m) continue
      const startMin = timeToMinutes(m[1])
      const endMin = timeToMinutes(m[2])
      if (startMin == null || endMin == null) continue
      if (endMin > startMin) totalMinutes += endMin - startMin
    }

    if (totalMinutes > 0) {
      const display = formatHoursShort(totalMinutes)
      return { key: `hours:${display}`, display }
    }

    const display = normalized.join(' • ')
    return { key: `ranges:${display}`, display }
  }

  const cleaned = raw.replace(/\s+/g, ' ').trim()
  return { key: `label:${stripDiacritics(cleaned).toLowerCase()}`, display: cleaned }
}

const buildAvailabilitySummaryFromAvailableHours = (
  availableHours,
  {
    maxGroups = 3,
    maxDatesPerGroup = 6,
    maxPerDayLines = 4,
  } = {}
) => {
  const items = Array.isArray(availableHours) ? availableHours : []

  // Dedupe por dia (se vier duplicado do backend por algum motivo).
  const byDayKey = new Map()
  for (const raw of items) {
    if (typeof raw !== 'string') continue
    const text = raw.trim()
    if (!text) continue

    const m = text.match(/^(\d{2}\/\d{2}\/\d{4})\s*[•\-]\s*(.+)$/)
    if (!m) continue
    const dt = parseBRDate(m[1])
    if (!dt) continue

    const label = String(m[2] || '').trim()
    if (!label) continue

    const { key: patternKey, display } = normalizeAvailabilityLabel(label)
    if (!patternKey || !display) continue

    const dayKey = format(dt, 'yyyy-MM-dd')
    byDayKey.set(dayKey, {
      dt,
      short: format(dt, 'dd/MM', { locale: ptBR }),
      display,
      patternKey,
    })
  }

  const entries = Array.from(byDayKey.values())

  entries.sort((a, b) => a.dt.getTime() - b.dt.getTime())

  const totalDays = entries.length
  if (!totalDays) {
    return {
      mode: 'empty',
      overview: { daysText: 'Nenhum dia configurado', timeText: '' },
      groups: [],
      perDay: [],
      allDates: [],
      extraGroups: 0,
      extraPerDay: 0,
    }
  }

  const daysText = `Disponível em ${totalDays} dia${totalDays === 1 ? '' : 's'}`

  const groupsMap = new Map()
  for (const e of entries) {
    const current = groupsMap.get(e.patternKey)
    if (!current) {
      groupsMap.set(e.patternKey, {
        patternKey: e.patternKey,
        title: e.display,
        dates: [e.short],
      })
    } else {
      current.dates.push(e.short)
    }
  }

  const groupsAll = Array.from(groupsMap.values())
  const uniquePatterns = groupsAll.length

  // Caso extremo: tudo diferente -> lista individual com indicação clara.
  const everyDayDifferent = uniquePatterns === totalDays && totalDays >= 3
  if (everyDayDifferent) {
    const perDay = entries.slice(0, maxPerDayLines).map((e) => ({
      line: `${e.short} • ${e.display}`,
    }))
    const extraPerDay = Math.max(0, totalDays - perDay.length)
    return {
      mode: 'per-day',
      overview: { daysText, timeText: 'Horas personalizadas por dia' },
      groups: [],
      perDay,
      allDates: entries.map((e) => e.short),
      extraGroups: 0,
      extraPerDay,
    }
  }

  const overviewTimeText = uniquePatterns === 1 ? groupsAll[0].title : 'Horas variadas'

  const groupsSorted = groupsAll
    .map((g) => ({ ...g, count: g.dates.length }))
    .sort((a, b) => b.count - a.count)

  const groups = groupsSorted.slice(0, maxGroups).map((g) => ({
    title: g.title,
    // Mantém todas as datas; o UI decide o que cabe em 1 linha e mostra "...".
    dates: Array.isArray(g.dates) ? g.dates : [],
    count: g.count,
  }))

  const extraGroups = Math.max(0, groupsSorted.length - groups.length)

  return {
    mode: 'grouped',
    overview: { daysText, timeText: overviewTimeText },
    groups,
    perDay: [],
    allDates: entries.map((e) => e.short),
    extraGroups,
    extraPerDay: 0,
  }
}

const ServiceForm = ({ isOpen, onClose, onSave, editingService = null }) => {
  const { toast } = useToast()
  const { user } = useAuth()
  const [docsDialogOpen, setDocsDialogOpen] = useState(false)
  const formRef = useRef(null)
  const coverInputRef = useRef(null)
  const coverSelectOpIdRef = useRef(0)
  const prevEditingServiceIdRef = useRef(null)
  const prevIsOpenRef = useRef(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(
    editingService?.image || null
  )
  const [imageRemoved, setImageRemoved] = useState(false)
  const [imageOptimizeNote, setImageOptimizeNote] = useState('')
  const [isConvertingHeic, setIsConvertingHeic] = useState(false)

  const resolvedImagePreview = useResolvedStorageUrl(imagePreview || '', {
    debugLabel: 'service cover preview',
  })

  const isImagePreviewStorageRef =
    typeof imagePreview === 'string' && imagePreview.trim().startsWith('storage://')

  useEffect(() => {
    return () => {
      revokePreviewUrlIfNeeded(imagePreview)
    }
  }, [imagePreview])
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    priceUnit: 'hora',
    workArea: '',
    duration: '',
    homeService: false,
    emergencyService: false,
    travelService: false,
    overtimeService: false,
    availableHours: [],
    homeServiceFee: '',
    emergencyServiceFee: '',
    travelFee: '',
    overtimeFee: '',
  })

  const [priceDigits, setPriceDigits] = useState('')

  const [showPriceUnitOptions, setShowPriceUnitOptions] = useState(false)
  const [showAttendanceFees, setShowAttendanceFees] = useState(false)
  const [showAvailability, setShowAvailability] = useState(false)
  const [showServiceSummary, setShowServiceSummary] = useState(false)

  const [availabilityMonth, setAvailabilityMonth] = useState(new Date())

  const [selectedWorkDay, setSelectedWorkDay] = useState(null)
  const [workDayChoice, setWorkDayChoice] = useState('slots')
  const [slotMorningEnabled, setSlotMorningEnabled] = useState(true)
  const [slotAfternoonEnabled, setSlotAfternoonEnabled] = useState(false)
  const [morningHours, setMorningHours] = useState(4)
  const [afternoonHours, setAfternoonHours] = useState(4)
  const [workDayCustomMorningStart, setWorkDayCustomMorningStart] = useState('00:00')
  const [workDayCustomMorningEnd, setWorkDayCustomMorningEnd] = useState('00:00')
  const [workDayCustomAfternoonStart, setWorkDayCustomAfternoonStart] = useState('00:00')
  const [workDayCustomAfternoonEnd, setWorkDayCustomAfternoonEnd] = useState('00:00')
  const [workDaysMap, setWorkDaysMap] = useState({})
  const prevWorkDayChoiceRef = useRef('slots')
  const lastValidCustomRangesRef = useRef(null)

  const OneLineDateChips = ({ dates, icon: Icon }) => {
    const list = Array.isArray(dates) ? dates.filter(Boolean) : []
    const rowRef = useRef(null)
    const [hasOverflow, setHasOverflow] = useState(false)

    useEffect(() => {
      const el = rowRef.current
      if (!el) return

      const check = () => {
        try {
          setHasOverflow(el.scrollWidth > el.clientWidth + 1)
        } catch {
          setHasOverflow(false)
        }
      }

      check()

      let ro = null
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(check)
        ro.observe(el)
      } else {
        window.addEventListener('resize', check)
      }

      return () => {
        try {
          if (ro) ro.disconnect()
          else window.removeEventListener('resize', check)
        } catch {
          // ignore
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [list.join('|')])

    if (!list.length) return null

    return (
      <div className="flex items-center gap-2">
        {Icon ? (
          <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-background/40 border border-border/40">
            <Icon size={12} />
          </span>
        ) : null}
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <div
            ref={rowRef}
            className="flex-1 min-w-0 flex w-full flex-nowrap items-center gap-1.5 overflow-hidden"
          >
            {list.map((d) => (
              <span
                key={d}
                className="inline-flex items-center rounded-lg border border-border/35 bg-transparent px-2 py-0.5 text-xs font-semibold text-muted-foreground whitespace-nowrap leading-none"
              >
                {d}
              </span>
            ))}
          </div>

          {hasOverflow ? (
            <span className="shrink-0 inline-flex items-center rounded-lg border border-border/35 bg-transparent px-2 py-0.5 text-xs font-semibold text-muted-foreground leading-none">
              ...
            </span>
          ) : null}
        </div>
      </div>
    )
  }

  const PERCENT_STEP = 5
  const PERCENT_MIN = 5
  const PERCENT_MAX = 40

  // Observação: usado apenas para exibição transparente no resumo (não altera cálculos de negócio aqui).
  // Mantém o mesmo valor já aplicado em fluxos de pagamento/contratação do app.
  const APP_FEE_PERCENT = 10

  const normalizePercent = (raw) => {
    if (raw == null || raw === '') return ''
    const n = Number(raw)
    if (!Number.isFinite(n)) return ''
    const snapped = Math.round(n / PERCENT_STEP) * PERCENT_STEP
    const clamped = Math.max(PERCENT_MIN, Math.min(PERCENT_MAX, snapped))
    return clamped
  }

  const stepPercent = (raw, direction) => {
    const base = normalizePercent(raw)
    const current = base === '' ? PERCENT_MIN : Number(base)
    const delta = direction === 'down' ? -PERCENT_STEP : PERCENT_STEP
    const next = Math.max(PERCENT_MIN, Math.min(PERCENT_MAX, current + delta))
    return next
  }

  const PercentStepper = ({ id, value, onChange, disabled, ariaLabel }) => {
    const current = normalizePercent(value)
    const displayValue = current === '' ? `${PERCENT_MIN}%` : `${current}%`

    return (
      <div
        className={
          'inline-flex items-center rounded-md border border-border/60 bg-background/50 overflow-hidden ' +
          (disabled ? 'opacity-60 pointer-events-none' : '')
        }
        aria-label={ariaLabel}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-none"
          onClick={() => onChange(stepPercent(value, 'down'))}
          disabled={disabled}
          aria-label="Diminuir"
        >
          <ChevronDown size={16} />
        </Button>
        <div
          id={id}
          className="h-8 px-3 flex items-center justify-center text-sm font-semibold tabular-nums text-foreground"
          style={{ minWidth: 56 }}
        >
          {displayValue}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-none"
          onClick={() => onChange(stepPercent(value, 'up'))}
          disabled={disabled}
          aria-label="Aumentar"
        >
          <ChevronUp size={16} />
        </Button>
      </div>
    )
  }

  const getBasePriceForFees = () => {
    const base = toMoneyNumber(formData.price)
    return base > 0 ? base : null
  }

  const getFeeIncreaseAmount = (percentRaw) => {
    const base = getBasePriceForFees()
    if (!base) return null
    const pct = normalizePercent(percentRaw)
    if (pct === '') return null
    const pctNum = Number(pct)
    if (!Number.isFinite(pctNum) || pctNum <= 0) return null
    return base * (pctNum / 100)
  }

  const FeeIncreaseHint = ({ percentRaw }) => {
    const inc = getFeeIncreaseAmount(percentRaw)
    if (inc == null) return null
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-border/40 bg-background/30 px-2 py-1 text-[11px] text-muted-foreground">
        Acréscimo:
        <span className="font-semibold text-foreground">+{formatBRL(inc)}</span>
      </span>
    )
  }

  const calcAdditionalFeesBreakdown = (price, data) => {
    const base = toMoneyNumber(price)
    const items = []

    const add = (label, enabled, percentRaw) => {
      if (!enabled) return
      const normalized = normalizePercent(percentRaw)
      const pct = normalized === '' ? PERCENT_MIN : Number(normalized)
      const percent = Number.isFinite(pct) ? pct : PERCENT_MIN
      const amount = base * (percent / 100)
      items.push({ label, percent, amount })
    }

    add('Domicílio', !!data?.homeService, data?.homeServiceFee)
    add('Emergência', !!data?.emergencyService, data?.emergencyServiceFee)
    add('Deslocamento', !!data?.travelService, data?.travelFee)
    add('Hora extra', !!data?.overtimeService, data?.overtimeFee)

    return items
  }

  const calcTotalWithFees = (price, breakdown) => {
    const base = toMoneyNumber(price)
    const add = Array.isArray(breakdown)
      ? breakdown.reduce((sum, it) => sum + toMoneyNumber(it?.amount), 0)
      : 0
    return base + add
  }

  const formatDatesPreview = (datesRaw, max = 3) => {
    const list = Array.isArray(datesRaw)
      ? datesRaw.map((d) => String(d || '').trim()).filter(Boolean)
      : []
    const unique = Array.from(new Set(list))
    if (!unique.length) return ''
    if (unique.length <= max) return unique.join(', ')
    const head = unique.slice(0, max).join(', ')
    const rest = unique.length - max
    return `${head}… (+${rest})`
  }

  // Pedido: ao entrar no modo personalizado, os campos devem iniciar zerados.
  // Porém, ao selecionar um dia que já tem um label com horários, não deve sobrescrever.
  useEffect(() => {
    const prev = prevWorkDayChoiceRef.current
    prevWorkDayChoiceRef.current = workDayChoice

    if (workDayChoice !== 'custom' || prev === 'custom') return

    const key = selectedWorkDay ? getWorkDayKey(selectedWorkDay) : null
    const label = key ? workDaysMap?.[key]?.label : null
    const parsed = label ? getChoiceFromLabel(label) : null
    const hasAnySavedRange = Array.isArray(parsed?.ranges)
      ? parsed.ranges.some(
          (r) => timeToMinutes(r?.start) != null && timeToMinutes(r?.end) != null
        )
      : false

    if (hasAnySavedRange) return

    setWorkDayCustomMorningStart('00:00')
    setWorkDayCustomMorningEnd('00:00')
    setWorkDayCustomAfternoonStart('00:00')
    setWorkDayCustomAfternoonEnd('00:00')
  }, [workDayChoice, selectedWorkDay, workDaysMap])

  // No modo personalizado, ao selecionar "Personalizado" marcamos o dia como personalizado
  // mesmo antes de preencher horários (badge deve mostrar "1 turno").
  useEffect(() => {
    if (workDayChoice !== 'custom') return
    if (!selectedWorkDay) return
    const key = getWorkDayKey(selectedWorkDay)
    if (!key) return

    const prev = workDaysMap?.[key]
    if (prev?.mode === 'custom') return

    // Se o dia estava em Manhã/Tarde ou Dia inteiro, ao alternar para Personalizado
    // não carregamos o label anterior (evita aparecer "4h" sem ter horário definido).
    const prevParsed = prev?.label ? getChoiceFromLabel(prev.label) : null
    const keepPrevLabel = prevParsed?.choice === 'custom'

    const next = {
      ...(workDaysMap || {}),
      [key]: { ...(prev || {}), mode: 'custom', label: keepPrevLabel ? prev?.label || '' : '' },
    }
    syncWorkDays(next)
  }, [workDayChoice, selectedWorkDay, workDaysMap])

  // Se o calendário estiver limpo, ao usar Personalizado os campos devem iniciar zerados
  // (sem reaproveitar o último horário digitado).
  useEffect(() => {
    if (workDayChoice !== 'custom') return
    const keys = Object.keys(workDaysMap || {})
    if (keys.length) return

    lastValidCustomRangesRef.current = null
    setWorkDayCustomMorningStart('00:00')
    setWorkDayCustomMorningEnd('00:00')
    setWorkDayCustomAfternoonStart('00:00')
    setWorkDayCustomAfternoonEnd('00:00')
  }, [workDayChoice, workDaysMap])

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
    stepMinutes,
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
      stepMinutes,
    }) => {
      // Modelo novo: buffer de sessão (0-4 dígitos) + cursor (typedCountRef).
      // O display sempre deriva de buffer.padStart(4,'0').slice(-4).
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
        // Quando o valor externo muda (ex.: trocou de dia), sincroniza o buffer.
        if (!isCompleteTime(value)) return
        const next = timeToDigits4(value)
        if (next === bufferDigitsRef.current) return
        // Se o usuário está digitando no momento, não sobrescreve.
        if ((typedCountRef.current || 0) > 0) return
        bufferDigitsRef.current = next
        setBufferDigits(next)
        lastRawDigitsRef.current = next
      }, [value])

      const bufferDigitsToTimeCandidate = (digits) => {
        const d = String(digits || '').replace(/\D/g, '').slice(0, 4)
        if (!d) return '00:00'

        // Regras para digitação rápida:
        // 1 dígito: H => 0H:00 (ex.: 7 => 07:00)
        // 2 dígitos:
        //   - se começar com 0: 0H => 0H:00 (ex.: 09 => 09:00)
        //   - se formar hora válida 10–23: HH => HH:00 (ex.: 12 => 12:00)
        //   - caso contrário: H + M => 0H:M0 (ex.: 73 => 07:30)
        // 3 dígitos:
        //   - se os 2 primeiros formarem hora válida 00–23: HH + M => HH:M0 (ex.: 123 => 12:30)
        //   - caso contrário: H + MM => 0H:MM (ex.: 705 => 07:05)
        // 4 dígitos: HHMM => HH:MM

        if (d.length === 1) return `0${d}:00`

        if (d.length === 2) {
          if (d[0] === '0') return `${d}:00`
          const hh = Number(d)
          if (Number.isFinite(hh) && hh >= 10 && hh <= 23) return `${d}:00`
          return `0${d[0]}:${d[1]}0`
        }

        if (d.length === 3) {
          const hh2 = Number(d.slice(0, 2))
          if (Number.isFinite(hh2) && hh2 >= 0 && hh2 <= 23) {
            return `${d.slice(0, 2)}:${d[2]}0`
          }
          return `0${d[0]}:${d.slice(1)}`
        }

        return `${d.slice(0, 2)}:${d.slice(2)}`
      }

      const clampToRange = (t) => {
        const v = timeToMinutes(t)
        const minV = timeToMinutes(minTime)
        const maxV = timeToMinutes(maxTime)
        if (v == null || minV == null || maxV == null) return t
        if (v < minV) return minutesToTime(minV) || t
        if (v > maxV) return minutesToTime(maxV) || t
        return t
      }

      const snapDownToStep = (t) => {
        const step = Number(stepMinutes)
        if (!Number.isFinite(step) || step <= 0) return t
        const v = timeToMinutes(t)
        if (v == null) return t
        const hh = Math.floor(v / 60)
        const mm = v % 60
        const snappedMm = Math.floor(mm / step) * step
        return `${String(hh).padStart(2, '0')}:${String(snappedMm).padStart(2, '0')}`
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

        // Sentinel sempre permitido.
        if (t === '00:00') return { ok: true, time: '00:00' }

        if (!isValidClockTime(t)) return { ok: false, time: '00:00' }

        // Ao finalizar, faz clamp para o range do período.
        const clamped = isTimeInRange(t, minTime, maxTime) ? t : clampToRange(t)
        if (!isTimeInRange(clamped, minTime, maxTime)) return { ok: false, time: '00:00' }

        // Se houver step (ex.: 30 min), ajusta para baixo no step.
        const stepped = snapDownToStep(clamped)
        const steppedClamped = isTimeInRange(stepped, minTime, maxTime) ? stepped : clampToRange(stepped)
        if (!isTimeInRange(steppedClamped, minTime, maxTime)) return { ok: false, time: '00:00' }

        // Regras relacionais (início < fim).
        if (violatesRelationalRules(steppedClamped)) return { ok: false, time: '00:00' }

        return { ok: true, time: steppedClamped }
      }

      const commitIfNeeded = (finalAttempt, { triggerComplete = false } = {}) => {
        if (!finalAttempt) return
        const rawDigits = String(bufferDigitsRef.current || '').replace(/\D/g, '').slice(0, 4)
        const candidate = bufferDigitsToTimeCandidate(rawDigits)
        const resolved = resolveFinalTime(candidate)

        const finalDigits = timeToDigits4(resolved.time)
        bufferDigitsRef.current = finalDigits
        setBufferDigits(finalDigits)
        typedCountRef.current = 0
        lastRawDigitsRef.current = ''

        // Só aqui atualiza o estado do formulário (evita perder foco a cada dígito).
        onChange(resolved.time)

        // Ao completar (HH:MM) com um horário válido (≠ 00:00), avança para o próximo campo.
        if (
          triggerComplete &&
          resolved?.ok &&
          resolved.time !== '00:00' &&
          typeof onComplete === 'function'
        ) {
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
        // bufferDigitsRef guarda 0-4 dígitos da sessão; NÃO é o display em si.
        const prev = String(bufferDigitsRef.current || '')
        const next = (prev + d).slice(0, 4)
        bufferDigitsRef.current = next
        setBufferDigits(next)

        // Feedback sutil por ~120ms para qualquer dígito (inclui 0).
        try {
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
          setFlash(true)
          flashTimerRef.current = setTimeout(() => setFlash(false), 120)
        } catch {
          // ignore
        }
        // Mesmo que o display não mude (ex.: 00:00 + '0'), o buffer muda e re-renderiza.
        commitIfNeeded(finalAttempt, { triggerComplete: finalAttempt })
      }

      const allowControlKey = (e) => {
        const k = e.key
        if (k === 'Tab' || k === 'Escape') return true
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

        // Não comita no parent a cada backspace; só atualiza a máscara local.
      }

      const beginNewEntrySession = () => {
        sessionIdRef.current += 1
        bufferDigitsRef.current = ''
        typedCountRef.current = 0
        lastRawDigitsRef.current = ''
        setBufferDigits('')
      }

      const prepareForTypingIfNeeded = () => {
        if ((typedCountRef.current || 0) > 0) return
        beginNewEntrySession()
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
          value={bufferDigitsToTimeCandidate(bufferDigits)}
          onBeforeInput={(e) => {
            if (disabled) return
            const data = e.data
            if (!data || typeof data !== 'string') return
            if (!/^\d$/.test(data)) return

            // Em alguns browsers, keydown + beforeinput acontecem para o mesmo dígito.
            // Se já tratamos no keydown, suprime este beforeinput.
            if (suppressNextBeforeInputRef.current) {
              suppressNextBeforeInputRef.current = false
              e.preventDefault()
              return
            }

            e.preventDefault()
            prepareForTypingIfNeeded()
            const nextCount = Math.min(4, (typedCountRef.current || 0) + 1)
            typedCountRef.current = nextCount
            appendDigit(data, { finalAttempt: nextCount >= 4 })
          }}
          onPointerDown={(e) => {
            if (disabled) return
            // Se tocar/clicar novamente enquanto já está focado, zera.
            try {
              if (document?.activeElement && document.activeElement === inputRef.current) {
                beginNewEntrySession()
                // Zera também o valor real do formulário.
                onChange('00:00')
              }
            } catch {
              // ignore
            }
            // Mantém cursor no fim.
            setTimeout(() => {
              try {
                moveCaretToEnd(inputRef.current)
              } catch {
                // ignore
              }
            }, 0)
          }}
          onKeyDown={(e) => {
            if (allowControlKey(e)) return
            // Enter/Done: não submete o form; apenas comita o horário atual.
            if (e.key === 'Enter') {
              e.preventDefault()
              commitIfNeeded(true, { triggerComplete: true })
              return
            }
            // Backspace (opcional): volta gradualmente até 00:00.
            if (e.key === 'Backspace') {
              e.preventDefault()
              rollBackspace()
              return
            }
            // Delete: não faz nada.
            if (e.key === 'Delete') {
              e.preventDefault()
              return
            }
            if (/^\d$/.test(e.key)) {
              e.preventDefault()
              suppressNextBeforeInputRef.current = true
              prepareForTypingIfNeeded()
              const nextCount = Math.min(4, (typedCountRef.current || 0) + 1)
              typedCountRef.current = nextCount
              appendDigit(e.key, { finalAttempt: nextCount >= 4 })
              return
            }
            // Bloqueia qualquer outro caractere.
            e.preventDefault()
          }}
          onPaste={(e) => {
            e.preventDefault()
            const text = e.clipboardData?.getData('text') || ''
            const digits = text.replace(/\D/g, '')
            if (!digits) return
            prepareForTypingIfNeeded()
            for (const ch of digits) {
              const nextCount = Math.min(4, (typedCountRef.current || 0) + 1)
              typedCountRef.current = nextCount
              appendDigit(ch, { finalAttempt: nextCount >= 4 })
            }
          }}
          onChange={(e) => {
            // Fallback: alguns teclados podem disparar onChange sem beforeinput/keydown.
            // Não tenta deduzir a intenção quando o display não muda (caso do '0' em 00:00);
            // nesses casos, beforeinput/keydown cobre.
            const raw = String(e.target.value || '')

            // Permite digitar com ':' e sem zeros (ex.: 8:00, 8:0, 08:0).
            const mClock = raw.trim().match(/^(\d{1,2})\s*:\s*(\d{1,2})$/)
            if (mClock) {
              const hh = String(mClock[1]).padStart(2, '0')
              const mm = String(mClock[2]).padStart(2, '0')
              const candidate = `${hh}:${mm}`
              const resolved = resolveFinalTime(candidate)

              const finalDigits = timeToDigits4(resolved.time)
              bufferDigitsRef.current = finalDigits
              setBufferDigits(finalDigits)
              typedCountRef.current = 0
              lastRawDigitsRef.current = ''

              onChange(resolved.time)
              if (
                resolved?.ok &&
                resolved.time !== '00:00' &&
                typeof onComplete === 'function'
              ) {
                try {
                  onComplete()
                } catch {
                  // ignore
                }
              }
              return
            }

            const digits = raw.replace(/\D/g, '').slice(-4)
            if (!digits) {
              lastRawDigitsRef.current = ''
              bufferDigitsRef.current = ''
              typedCountRef.current = 0
              setBufferDigits('')
              return
            }
            // Se o usuário apagou caracteres (ex.: seleção + backspace), tenta refletir.
            if (digits.length < (typedCountRef.current || 0)) {
              const times = Math.min(4, (typedCountRef.current || 0) - digits.length)
              for (let i = 0; i < times; i++) rollBackspace()
              lastRawDigitsRef.current = digits
              return
            }
            // Quando o teclado só envia onChange, mantemos o buffer e deixamos o blur comitar.
            bufferDigitsRef.current = digits
            setBufferDigits(digits)
            typedCountRef.current = Math.min(4, digits.length)
            lastRawDigitsRef.current = digits
          }}
          onFocus={(e) => {
            // Mantém o valor atual ao focar; só inicia a sessão quando o usuário digitar.
            moveCaretToEnd(e.currentTarget)
          }}
          onClick={(e) => moveCaretToEnd(e.currentTarget)}
          onSelect={(e) => moveCaretToEnd(e.currentTarget)}
          onBlur={() => {
            // Se o usuário saiu no meio, resolve e comita uma vez.
            if ((typedCountRef.current || 0) > 0) {
              // No blur não deve pular automaticamente para o próximo campo.
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
          // Mantém cursor no fim.
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

      // 1) tentativa imediata (melhor quando vem de keydown/paste)
      tryFocus()
      // 2) retry no próximo frame (Android/iOS às vezes atrasam o foco)
      try {
        requestAnimationFrame(() => tryFocus())
      } catch {
        // ignore
      }
      // 3) fallback curto
      setTimeout(() => tryFocus(), 25)
    }

    return (
      <div
        className={
          'flex items-center rounded-md border bg-background ring-offset-background focus-within:ring-2 focus-within:ring-offset-2 ' +
          (invalid
            ? 'border-destructive focus-within:ring-destructive'
            : 'border-input focus-within:ring-ring')
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
          stepMinutes={stepMinutes}
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
          stepMinutes={stepMinutes}
        />
      </div>
    )
  }

  const normalizedPriceUnit = normalizePriceUnit(formData.priceUnit || 'hora')
  const isMonthlyBilling =
    editingService?.billing_type === 'MONTH' ||
    formData.billing_type === 'MONTH' ||
    formData.billingType === 'MONTH' ||
    normalizedPriceUnit === 'mes'

  const selectedPriceUnitLabel =
    PRICE_UNIT_OPTIONS.find((o) => o.value === formData.priceUnit)?.label ||
    'Hora'

  const focusNextFrom = (currentEl) => {
    const formEl = formRef.current
    if (!formEl || !currentEl) return false

    // Só avança para campos digitáveis/selecionáveis.
    // Não inclui botões nem abas clicáveis, para o Enter "parar" quando não houver campo para digitar.
    const focusable = Array.from(
      formEl.querySelectorAll('input, textarea, select')
    ).filter((el) => {
      if (el.disabled) return false
      if (el.getAttribute('type') === 'hidden') return false
      if (el.hasAttribute('readonly')) return false
      // Skip elements that are not visible (collapsed sections etc.)
      if (el.offsetParent === null) return false
      return true
    })

    const idx = focusable.indexOf(currentEl)
    if (idx < 0) return false

    for (let i = idx + 1; i < focusable.length; i++) {
      const next = focusable[i]
      if (next && typeof next.focus === 'function') {
        next.focus()
        return true
      }
    }

    return false
  }

  const handleEnterNext = (e, { allowShiftEnter = false } = {}) => {
    if (e.key !== 'Enter') return
    if (allowShiftEnter && e.shiftKey) return

    e.preventDefault()
    const moved = focusNextFrom(e.currentTarget)
    if (!moved && e.currentTarget && typeof e.currentTarget.blur === 'function') {
      e.currentTarget.blur()
    }
  }

  // Inicializa o form ao abrir o modal ou trocar o serviço (por id).
  // Importante: alguns pais recriam `editingService` a cada render; se dependermos do objeto inteiro,
  // o form reseta e quebra o fluxo de "Trocar"/"Apagar" foto.
  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false
      return
    }

    const justOpened = !prevIsOpenRef.current && isOpen
    prevIsOpenRef.current = true

    const currentId = editingService?.id || null
    const idChanged = prevEditingServiceIdRef.current !== currentId
    if (!justOpened && !idChanged) return
    prevEditingServiceIdRef.current = currentId

    if (editingService) {
      setFormData({
        title: editingService.title || '',
        description: editingService.description || '',
        price: editingService.price || '',
        priceUnit: normalizePriceUnit(editingService.price_unit || 'hora'),
        workArea: editingService.work_area || '',
        duration: editingService.duration || '',
        homeService: editingService.home_service || false,
        emergencyService: editingService.emergency_service || false,
        travelService: editingService.travel_service || false,
        overtimeService: editingService.overtime_service || false,
        availableHours: editingService.available_hours || [],
        homeServiceFee: normalizePercent(editingService.home_service_fee),
        emergencyServiceFee: normalizePercent(editingService.emergency_service_fee),
        travelFee: normalizePercent(editingService.travel_fee),
        overtimeFee: normalizePercent(editingService.overtime_fee),
      })
      setImagePreview(editingService.image || null)
      setImageFile(null)
      setImageRemoved(false)
      if (editingService.price != null && editingService.price !== '') {
        const cents = Math.round(toMoneyNumber(editingService.price) * 100)
        setPriceDigits(cents > 0 ? String(cents) : '')
      } else {
        setPriceDigits('')
      }

      // Keep sections collapsed by default; open if there are active flags/fees.
      setShowPriceUnitOptions(false)
      setShowAttendanceFees(
        !!(
          editingService.home_service ||
          editingService.emergency_service ||
          editingService.travel_service ||
          editingService.overtime_service ||
          editingService.home_service_fee ||
          editingService.emergency_service_fee ||
          editingService.travel_fee ||
          editingService.overtime_fee
        )
      )

      setAvailabilityMonth(new Date())

      // Inicializa a disponibilidade por dia a partir do available_hours salvo.
      const existing = editingService.available_hours || []
      setShowAvailability(!!existing.length)
      const parsedWorkDays = parseWorkDaysFromAvailableHours(existing)
      setWorkDaysMap(parsedWorkDays || {})
      setSelectedWorkDay(null)
    } else {
      // Resetar formulário se não estiver editando
      setFormData({
        title: '',
        description: '',
        price: '',
        priceUnit: 'hora',
        workArea: '',
        duration: '',
        homeService: false,
        emergencyService: false,
        travelService: false,
        overtimeService: false,
        availableHours: [],
        homeServiceFee: '',
        emergencyServiceFee: '',
        travelFee: '',
        overtimeFee: '',
      })
      setImagePreview(null)
      setImageFile(null)
      setImageRemoved(false)
      setPriceDigits('')

      setShowPriceUnitOptions(false)
      setShowAttendanceFees(false)
      setShowAvailability(false)

      setAvailabilityMonth(new Date())
      setSelectedWorkDay(null)
      setWorkDaysMap({})
    }
  }, [isOpen, editingService?.id])

  // Se o usuário habilitar um tipo/taxa e não houver valor, inicia em 5% (mínimo).
  useEffect(() => {
    setFormData((prev) => {
      const next = { ...prev }

      if (next.homeService) next.homeServiceFee = normalizePercent(next.homeServiceFee) || PERCENT_MIN
      else next.homeServiceFee = ''

      if (next.emergencyService) next.emergencyServiceFee = normalizePercent(next.emergencyServiceFee) || PERCENT_MIN
      else next.emergencyServiceFee = ''

      if (next.travelService) next.travelFee = normalizePercent(next.travelFee) || PERCENT_MIN
      else next.travelFee = ''

      if (next.overtimeService) next.overtimeFee = normalizePercent(next.overtimeFee) || PERCENT_MIN
      else next.overtimeFee = ''

      return next
    })
    // Intencionalmente depende apenas das chaves de toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.homeService, formData.emergencyService, formData.travelService, formData.overtimeService])

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const syncWorkDays = (nextMap) => {
    setWorkDaysMap(nextMap)
    handleChange('availableHours', formatWorkDaysToAvailableHours(nextMap))
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

  const parseLegacyPeriodHours = (label) => {
    const raw = String(label || '').trim()
    if (!raw) return null

    const normalized = stripDiacritics(raw).toLowerCase()

    const extract = (key) => {
      const re = new RegExp(`${key}\\s*(?:\\((\\d+(?:[\\.,]\\d+)?)h\\)|\\s+(\\d+(?:[\\.,]\\d+)?)h)?`, 'i')
      const m = raw.match(re)
      const num = m?.[1] || m?.[2] || null
      if (!num) return { has: normalized.includes(key), hours: null }
      const h = Number(String(num).replace(',', '.'))
      if (!Number.isFinite(h) || h <= 0) return { has: normalized.includes(key), hours: null }
      return { has: true, hours: h }
    }

    const m = extract('manha')
    const a = extract('tarde')
    const hasMorning = !!m.has
    const hasAfternoon = !!a.has
    if (!hasMorning && !hasAfternoon) return null

    const morningHoursParsed = m.hours
    const afternoonHoursParsed = a.hours

    const morningHoursFinal = hasMorning
      ? clampHours(morningHoursParsed == null ? morningHours : morningHoursParsed)
      : null
    const afternoonHoursFinal = hasAfternoon
      ? clampHours(afternoonHoursParsed == null ? afternoonHours : afternoonHoursParsed)
      : null

    const ranges = []
    if (hasMorning) {
      const r = buildMorningRange(morningHoursFinal)
      if (r) ranges.push(r)
    }
    if (hasAfternoon) {
      const r = buildAfternoonRange(afternoonHoursFinal)
      if (r) ranges.push(r)
    }

    return {
      choice: 'slots',
      morning: hasMorning,
      afternoon: hasAfternoon,
      ranges,
      morningHours: morningHoursFinal,
      afternoonHours: afternoonHoursFinal,
    }
  }

  const getChoiceFromLabel = (label) => {
    const raw = String(label || '').trim()
    if (!raw) return null
    if (stripDiacritics(raw).toLowerCase().startsWith('dia inteiro')) return { choice: 'full' }

    // Suporta labels legados: "Manhã (4h)", "Tarde (3,5h)", "Manhã + Tarde".
    const legacy = parseLegacyPeriodHours(raw)
    if (legacy) {
      return {
        choice: 'slots',
        morning: legacy.morning,
        afternoon: legacy.afternoon,
        ranges: legacy.ranges,
      }
    }

    // Suporta 1 ou 2 faixas no label, ex.: "08:00–12:00" ou "08:00–12:00 e 13:00–17:00"
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
    // Agora aplica somente no dia selecionado.
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
      // Exceção: 00:00–00:00 significa "não utilizado".
      allowUnused00: true,
    })

    // Se qualquer período estiver inválido (e não for unused), não salva.
    const hasInvalid = (!morning.valid && !morning.unused) || (!afternoon.valid && !afternoon.unused)
    if (hasInvalid) return

    const ranges = []
    if (morning.valid && !morning.unused) {
      ranges.push({ start: workDayCustomMorningStart, end: workDayCustomMorningEnd })
    }
    if (afternoon.valid && !afternoon.unused) {
      ranges.push({ start: workDayCustomAfternoonStart, end: workDayCustomAfternoonEnd })
    }

    // Pelo menos um período deve estar válido para o dia ser considerado disponível.
    if (!ranges.length) {
      return
    }

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

  // Se o serviço for mensal, garantimos horário definido (sem "Dia inteiro") automaticamente.
  useEffect(() => {
    if (!isMonthlyBilling) return
    const keys = Object.keys(workDaysMap || {})
    if (!keys.length) return

    let changed = false
    const next = { ...workDaysMap }
    for (const key of keys) {
      const entry = next[key]
      if (!entry?.label) continue
      if (stripDiacritics(entry.label).toLowerCase().startsWith('dia inteiro')) {
        // Em mensal, converte automaticamente "Dia inteiro" para uma faixa com horários.
        // Preferimos usar slots (manhã) para manter o padrão do editor.
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

    // Labels legados: "Manhã (4h)", "Tarde (3,5h)", "Manhã + Tarde".
    const legacy = parseLegacyPeriodHours(raw)
    if (legacy) {
      const minutesMorning = legacy.morningHours ? Math.round(legacy.morningHours * 60) : 0
      const minutesAfternoon = legacy.afternoonHours ? Math.round(legacy.afternoonHours * 60) : 0
      const totalMinutes = minutesMorning + minutesAfternoon
      const hours = totalMinutes ? formatHoursShort(totalMinutes) : ''
      if (legacy.morning && legacy.afternoon) return { hours, title: 'Manhã', subtitle: '+ Tarde' }
      if (legacy.morning) return { hours, title: 'Manhã' }
      if (legacy.afternoon) return { hours, title: 'Tarde' }
    }

    // Suporta também labels antigos/experimentais com mais de uma faixa.
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

      // Pedido: quando for Manhã + Tarde, mostrar total de horas acima e separar o label.
      if (hasMorning && hasAfternoon) return { hours, title: 'Manhã', subtitle: '+ Tarde' }

      // Se não seguir o padrão Manhã/Tarde (08:00 / 18:00), tratar como "Personalizado"
      // e não mostrar as faixas dentro do calendário.
      return { hours, title: '2 turnos' }
    }

    const range = parseTimeRangeLabel(raw)
    if (!range) return { hours: '', title: raw }

    const startMin = timeToMinutes(range.start)
    const endMin = timeToMinutes(range.end)
    const minutes = startMin != null && endMin != null ? endMin - startMin : null
    const hours = minutes != null ? formatHoursShort(minutes) : ''

    if (range.start === WORKDAY_RANGES.morningStart) return { hours, title: 'Manhã' }
    if (range.end === WORKDAY_RANGES.afternoonEnd) return { hours, title: 'Tarde' }

    // Faixa única fora do padrão => "Personalizado" (não exibir horas exatas no quadrinho).
    return { hours, title: '1 turno' }
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
    const parsed = getChoiceFromLabel(entry?.label)

    if (!entry?.label) {
      const isCalendarEmpty = Object.keys(workDaysMap || {}).length === 0
      const defaultChoice = workDayChoice || (isMonthlyBilling ? 'slots' : 'full')
      const safeChoice = isMonthlyBilling && defaultChoice === 'full' ? 'slots' : defaultChoice
      const defaultLabel =
        safeChoice === 'custom'
          ? ''
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
        // Não resetar o estado do usuário ao trocar de dia.
        // Só garante que exista pelo menos um período habilitado.
        if (!slotMorningEnabled && !slotAfternoonEnabled) {
          setSlotMorningEnabled(true)
        }
      }
      if (safeChoice === 'custom') {
        // Ao trocar de dia, manter os horários atuais no formulário.
        // Se o calendário estiver limpo, iniciar zerado.
        if (isCalendarEmpty) {
          lastValidCustomRangesRef.current = null
          setWorkDayCustomMorningStart('00:00')
          setWorkDayCustomMorningEnd('00:00')
          setWorkDayCustomAfternoonStart('00:00')
          setWorkDayCustomAfternoonEnd('00:00')
        }
      }
      return
    }

    const forcedCustom = entry?.mode === 'custom'
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

      // Importante: sempre atualizar ambos os turnos. Se não existir, zera para não herdar do dia anterior.
      if (morning?.start && morning?.end) {
        setWorkDayCustomMorningStart(morning.start)
        setWorkDayCustomMorningEnd(morning.end)
      } else {
        setWorkDayCustomMorningStart('00:00')
        setWorkDayCustomMorningEnd('00:00')
      }

      if (afternoon?.start && afternoon?.end) {
        setWorkDayCustomAfternoonStart(afternoon.start)
        setWorkDayCustomAfternoonEnd(afternoon.end)
      } else {
        setWorkDayCustomAfternoonStart('00:00')
        setWorkDayCustomAfternoonEnd('00:00')
      }
    }
  }

  const removeWorkDay = () => {
    if (!selectedWorkDay) return
    const key = getWorkDayKey(selectedWorkDay)
    if (!key) return
    const next = { ...(workDaysMap || {}) }
    delete next[key]
    syncWorkDays(next)
    setSelectedWorkDay(null)
  }

  const handleImageSelect = async (e) => {
    const selectedFile = e.target.files?.[0]

    const resetInput = () => {
      // Permite selecionar o mesmo arquivo novamente.
      try {
        e.target.value = ''
      } catch {
        // ignore
      }
    }

    if (!selectedFile) {
      resetInput()
      return
    }

    setImageOptimizeNote('')

    // Extreme-only block (same rule used elsewhere).
    const MAX_IMAGE_INPUT_BYTES = 30 * 1024 * 1024
    if (selectedFile.size > MAX_IMAGE_INPUT_BYTES) {
      toast({
        title: 'Arquivo muito grande',
        description: 'Envie uma imagem de até 30MB para otimização automática.',
        variant: 'destructive',
      })
      resetInput()
      return
    }

    // Guard the whole pipeline (resize + HEIC flow) against rapid re-selections.
    const pipelineOpId = (Number(coverSelectOpIdRef.current) || 0) + 1
    coverSelectOpIdRef.current = pipelineOpId

    let resizedFile = selectedFile
    try {
      resizedFile = await resizeImageClient(selectedFile, { maxDimension: 2048 })
    } catch {
      // Best-effort: if resize fails, continue with the original file.
      resizedFile = selectedFile
    }

    if (coverSelectOpIdRef.current !== pipelineOpId) {
      resetInput()
      return
    }

    // HEIC client-first flow (preview immediately + background convert when possible).
    let clientSelectedFile = resizedFile
    try {
      const heicResult = await runHeicFlow(resizedFile, {
        opIdRef: coverSelectOpIdRef,
        previousPreviewUrl: imagePreview || '',
        setPreviewUrl: (url) => setImagePreview(url || null),
        setIsConverting: setIsConvertingHeic,
      })

      // If user selected another file while converting, ignore.
      if (!heicResult) {
        resetInput()
        return
      }

      clientSelectedFile = heicResult.file
    } catch {
      toast({
        title: 'Formato não suportado',
        description: 'Não foi possível converter HEIC neste dispositivo. Tente JPG/PNG/WEBP.',
        variant: 'destructive',
      })
      resetInput()
      return
    }

    let fileToUse = clientSelectedFile
    try {
      const { file: optimizedFile, meta } = await optimizeImageFile(clientSelectedFile, {
        kind: 'photo',
      })

      if (optimizedFile?.size && optimizedFile.size > 0) {
        // Always use WEBP output when optimization succeeds.
        fileToUse = optimizedFile
        setImageOptimizeNote(
          `Imagem otimizada: ${formatFileSize(meta.originalSize)} → ${formatFileSize(meta.newSize)}`
        )
      }
    } catch (error) {
      const isUnsupportedClient =
        error?.code === 'IMAGE_TYPE_NOT_ALLOWED' || error?.code === 'GIF_NOT_SUPPORTED'

      const errMsg = String(error?.message || '')
      const isCanvasOrDecode = /canvas|carregar imagem|toBlob|dimens(\u00f5|o)es/i.test(errMsg)

      let usedServerNormalize = false

      if (isUnsupportedClient || isCanvasOrDecode) {
        setImageOptimizeNote('Convertendo no servidor…')
        try {
          const normalized = await normalizeImage({
            file: clientSelectedFile,
            context: 'service_cover',
            target: 'webp',
          })
          const url = normalized?.result?.url
          if (!url || !String(url).startsWith('storage://')) {
            throw new Error('Resposta inválida do servidor ao normalizar imagem.')
          }
          fileToUse = String(url)
          setImageOptimizeNote('Imagem convertida no servidor')
          usedServerNormalize = true
        } catch (e) {
          const status = e instanceof NormalizeImageError ? e.status : 0
          const msg =
            status === 415
              ? 'Esse formato não pode ser convertido no servidor no momento. Tente JPG/PNG/WEBP.'
              : e?.message || 'Não foi possível converter a imagem no servidor.'

          toast({
            title: 'Formato não suportado',
            description: msg,
            variant: 'destructive',
          })
          setImageOptimizeNote('')
          resetInput()
          return
        }
      }

      try {
        if (import.meta.env.DEV) {
          log.warn('UPLOAD', 'service_cover_image_optimize_failed', error)
        }
      } catch {
        // ignore
      }

      if (!usedServerNormalize) {
        toast({
          title: 'Aviso',
          description: 'Não foi possível otimizar a imagem. Enviando o arquivo original.',
          variant: 'default',
        })
      }
    }

    setImageFile(fileToUse)
    setImageRemoved(false)

    resetInput()
  }

  const handleRemoveImage = () => {
    try {
      coverSelectOpIdRef.current = (Number(coverSelectOpIdRef.current) || 0) + 1
    } catch {
      // ignore
    }
    setIsConvertingHeic(false)
    setImageFile(null)
    setImagePreview((prev) => {
      revokePreviewUrlIfNeeded(prev)
      return null
    })
    setImageRemoved(true)
    setImageOptimizeNote('')
    try {
      if (coverInputRef.current) coverInputRef.current.value = ''
    } catch {
      // ignore
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const hasCanOfferFlag = !!user && Object.prototype.hasOwnProperty.call(user, 'can_offer_service')
    const canOffer = hasCanOfferFlag ? user?.can_offer_service === true : true
    if (hasCanOfferFlag && !canOffer) {
      setDocsDialogOpen(true)
      return
    }

    if (!formData.title || !formData.price || !formData.workArea) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Por favor, preencha todos os campos obrigatórios.',
        variant: 'destructive',
      })
      return
    }

    if (!user) {
      toast({
        title: 'Erro de autenticação',
        description: 'Você precisa estar logado para criar um serviço.',
        variant: 'destructive',
      })
      return
    }

    setIsSubmitting(true)

    try {
      let imageUrl = imageRemoved ? null : editingService?.image || null

      // Upload da imagem se houver uma nova
      if (imageFile) {
        if (typeof imageFile === 'string' && String(imageFile).startsWith('storage://')) {
          imageUrl = String(imageFile)
        } else {
        const fileExt = imageFile.name.split('.').pop()
        const fileName = `${user.id}-${Date.now()}.${fileExt}`
        const filePath = `service-images/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(filePath, imageFile, {
            cacheControl: '3600',
            upsert: false,
            contentType: imageFile?.type || undefined,
          })

        if (uploadError) {
          throw new Error(
            `Erro ao fazer upload da imagem: ${uploadError.message}`
          )
        }

        imageUrl = `storage://photos/${filePath}`
        }
      }

      const serviceData = {
        user_id: user.id,
        title: formData.title,
        description: formData.description,
        price: parseFloat(formData.price),
        price_unit: formData.priceUnit,
        work_area: formData.workArea,
        duration: formData.duration,
        home_service: formData.homeService,
        emergency_service: formData.emergencyService,
        travel_service: formData.travelService,
        overtime_service: formData.overtimeService,
        home_service_fee: formData.homeServiceFee
          ? parseFloat(formData.homeServiceFee)
          : null,
        emergency_service_fee: formData.emergencyServiceFee
          ? parseFloat(formData.emergencyServiceFee)
          : null,
        travel_fee: formData.travelFee ? parseFloat(formData.travelFee) : null,
        overtime_fee: formData.overtimeFee
          ? parseFloat(formData.overtimeFee)
          : null,
        available_hours: formData.availableHours,
        image: imageUrl,
        is_active: true,
      }

      let result

      if (editingService?.id) {
        // Atualizar serviço existente
        result = await supabase
          .from('services')
          .update(serviceData)
          .eq('id', editingService.id)
          .select()
          .single()
      } else {
        // Criar novo serviço
        result = await supabase
          .from('services')
          .insert(serviceData)
          .select()
          .single()
      }

      if (result.error) throw result.error

      toast({
        title: editingService ? 'Serviço atualizado!' : 'Serviço criado!',
        description:
          'Seu serviço foi salvo com sucesso e já está visível para todos.',
        variant: 'success',
      })

      // Chamar onSave com os dados retornados do banco
      if (onSave) {
        onSave(result.data)
      }

      onClose()
    } catch (error) {
      log.error('SERVICE', 'Erro ao salvar serviço:', error)
      toast({
        title: 'Erro ao salvar',
        description:
          error.message ||
          'Não foi possível salvar o serviço. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm"
      style={{
        display: 'grid',
        placeItems: 'center',
        padding: '16px',
        overflow: 'hidden',
      }}
    >
      <DocsRequiredDialog open={docsDialogOpen} onOpenChange={setDocsDialogOpen} />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="bg-card rounded-xl shadow-2xl w-full max-w-2xl border border-border overflow-hidden"
        style={{ maxHeight: '90vh' }}
      >
        <div className="bg-card border-b border-border px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-foreground">
            {editingService ? 'Editar Serviço' : 'Adicionar Novo Serviço'}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="p-6 space-y-6 overflow-y-auto"
          style={{
            maxHeight: 'calc(90vh - 80px)',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        >
          {/* Foto de Capa */}
          <div>
            <Label className="mb-2 block">
              <div className="flex items-center gap-2">
                <ImageIcon size={16} />
                <span>Foto de capa</span>
              </div>
              <div className="text-xs text-muted-foreground font-normal mt-0.5">
                (opcional • recomendado para melhor visualização)
              </div>
            </Label>
            <input
              ref={coverInputRef}
              type="file"
              className="sr-only"
              accept="image/*"
              onChange={handleImageSelect}
            />
            <div className="space-y-3">
              {imagePreview ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => coverInputRef.current?.click?.()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      coverInputRef.current?.click?.()
                    }
                  }}
                  className="relative w-full h-48 rounded-lg overflow-hidden border border-border cursor-pointer"
                >
                  {isImagePreviewStorageRef && !resolvedImagePreview ? (
                    <div className="w-full h-full bg-muted/40 flex items-center justify-center">
                      <span className="text-sm text-muted-foreground">
                        Carregando imagem...
                      </span>
                    </div>
                  ) : (
                    <img
                      src={resolvedImagePreview || imagePreview}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  )}

                  {isConvertingHeic && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <span className="text-[11px] text-white/90">Convertendo HEIC…</span>
                    </div>
                  )}
                  <button
                    type="button"
                    title="Trocar Capa"
                    aria-label="Trocar Capa"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      coverInputRef.current?.click?.()
                    }}
                    className="absolute top-2 right-2 bg-black/40 text-white rounded-md px-2.5 py-1.5 text-[11px] hover:bg-black/55 transition-colors flex items-center gap-1.5"
                  >
                    <Upload size={12} />
                    Trocar Capa
                  </button>
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => coverInputRef.current?.click?.()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      coverInputRef.current?.click?.()
                    }
                  }}
                  className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors bg-muted/30"
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                    <p className="mb-2 text-sm text-muted-foreground">
                      <span className="font-semibold">Clique para enviar</span>{' '}
                      ou arraste
                    </p>
                    <p className="text-xs text-muted-foreground">
                      JPG, PNG ou WEBP (máx. 30MB)
                    </p>
                  </div>
                </div>
              )}

              {imageOptimizeNote ? (
                <p className="text-xs text-muted-foreground">{imageOptimizeNote}</p>
              ) : null}
            </div>
          </div>

          {/* Nome do Serviço */}
          <div>
            <Label htmlFor="title">
              Nome do Serviço <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              onKeyDown={(e) => handleEnterNext(e)}
              enterKeyHint="next"
              placeholder="Ex: Instalação elétrica"
              className="mt-1"
            />
          </div>

          {/* Descrição */}
          <div>
            <Label htmlFor="description">
              Descrição{' '}
              <span className="text-xs text-muted-foreground font-normal">
                (opcional)
              </span>
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              onKeyDown={(e) => handleEnterNext(e, { allowShiftEnter: true })}
              enterKeyHint="next"
              placeholder="Descreva o serviço, o que está incluso, garantias, etc."
              className="mt-1 min-h-[96px]"
            />
          </div>

          {/* Preço */}
          <div>
            <Label className="flex items-center justify-between">
              <span>
                Preço <span className="text-destructive">*</span>
              </span>
              <span className="text-xs text-muted-foreground font-normal">
                {formatBRL(formData.price)}
              </span>
            </Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                R$
              </span>
              <Input
                inputMode="numeric"
                value={
                  priceDigits
                    ? formatBRLNumber(Number(priceDigits) / 100)
                    : ''
                }
                onChange={(e) => {
                  const digits = String(e.target.value || '').replace(/\D/g, '')
                  const clamped = digits.slice(0, 12)
                  setPriceDigits(clamped)

                  if (!clamped) {
                    handleChange('price', '')
                    return
                  }

                  const amount = Number(clamped) / 100
                  handleChange('price', amount.toFixed(2))
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (
                      e.currentTarget &&
                      typeof e.currentTarget.blur === 'function'
                    ) {
                      e.currentTarget.blur()
                    }
                    setShowPriceUnitOptions(true)
                    return
                  }
                  handleEnterNext(e)
                }}
                enterKeyHint="done"
                placeholder="0,00"
                className="pl-10"
              />
            </div>
          </div>

          {/* Tipo de Cobrança (recolhível) */}
          <div>
            <div
              className="flex items-start justify-between gap-3 cursor-pointer select-none"
              role="button"
              tabIndex={0}
              onClick={() => setShowPriceUnitOptions((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setShowPriceUnitOptions((v) => !v)
                }
              }}
              aria-label={
                showPriceUnitOptions
                  ? 'Ocultar opções de cobrança'
                  : 'Mostrar opções de cobrança'
              }
            >
              <Label className="flex flex-col gap-1">
                <span>Tipo de Cobrança</span>
                <span className="text-xs text-muted-foreground font-normal">
                  Escolha apenas uma opção
                </span>
              </Label>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-0.5"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowPriceUnitOptions((v) => !v)
                }}
                aria-label={
                  showPriceUnitOptions
                    ? 'Ocultar opções de cobrança'
                    : 'Mostrar opções de cobrança'
                }
              >
                {showPriceUnitOptions ? (
                  <ChevronUp size={18} />
                ) : (
                  <ChevronDown size={18} />
                )}
              </Button>
            </div>

            {!showPriceUnitOptions ? (
              <div
                className="mt-2 rounded-xl border border-border/50 bg-muted/30 px-4 py-3 cursor-pointer select-none"
                role="button"
                tabIndex={0}
                onClick={() => setShowPriceUnitOptions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setShowPriceUnitOptions(true)
                  }
                }}
                aria-label="Abrir opções de cobrança"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    {selectedPriceUnitLabel}
                  </span>
                  <span className="text-sm font-bold text-primary">
                    {formatBRL(formData.price)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Toque para alterar
                </p>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {PRICE_UNIT_OPTIONS.map((opt) => {
                  const selected = formData.priceUnit === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        handleChange('priceUnit', opt.value)
                        setShowPriceUnitOptions(false)
                      }}
                      className={
                        `w-full flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors ` +
                        (selected
                          ? 'bg-muted/60 border-primary/40'
                          : 'bg-card border-border/50 hover:bg-muted/40')
                      }
                      aria-pressed={selected}
                    >
                      <span
                        className={
                          `h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ` +
                          (selected
                            ? 'border-primary'
                            : 'border-muted-foreground/50')
                        }
                        aria-hidden="true"
                      >
                        <span
                          className={
                            `h-2.5 w-2.5 rounded-full ` +
                            (selected ? 'bg-primary' : 'bg-transparent')
                          }
                        />
                      </span>
                      <span
                        className={
                          `text-sm sm:text-base ` +
                          (selected
                            ? 'font-semibold text-foreground'
                            : 'font-medium text-muted-foreground')
                        }
                      >
                        {opt.label}
                      </span>
                    </button>
                  )
                })}

                <p className="text-xs text-muted-foreground mt-2">
                  Exibição: {formatBRL(formData.price)} /{' '}
                  {formatPriceUnit(formData.priceUnit)}
                </p>
              </div>
            )}
          </div>

          {/* Área de Atuação */}
          <div>
            <Label htmlFor="workArea" className="flex items-center gap-2">
              <MapPin size={16} />
              Área de Atuação <span className="text-destructive">*</span>
            </Label>
            <Input
              id="workArea"
              value={formData.workArea}
              onChange={(e) => handleChange('workArea', e.target.value)}
              onKeyDown={(e) => handleEnterNext(e)}
              enterKeyHint="next"
              placeholder="Ex: Zona Sul de São Paulo, Bairro Centro"
              className="mt-1"
            />
          </div>

          {/* Duração Estimada */}
          <div>
            <Label htmlFor="duration" className="flex items-center gap-2">
              <Clock size={16} />
              Duração Estimada{' '}
              <span className="text-xs text-muted-foreground font-normal">
                (opcional)
              </span>
            </Label>
            <Input
              id="duration"
              value={formData.duration}
              onChange={(e) => handleChange('duration', e.target.value)}
              onKeyDown={(e) => handleEnterNext(e)}
              enterKeyHint="next"
              placeholder="Ex: 30 minutos, 2 horas, 1 dia"
              className="mt-1"
            />
          </div>

            {/* Disponibilidade (recolhível) */}
            <div className="space-y-3">
              <div className="border-t border-border pt-4">
                <div
                  className="flex items-start justify-between gap-3 cursor-pointer select-none"
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowAvailability((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setShowAvailability((v) => !v)
                    }
                  }}
                  aria-label={showAvailability ? 'Ocultar disponibilidade' : 'Mostrar disponibilidade'}
                >
                  <div>
                    <h3 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
                      <Calendar size={18} className="text-orange-500" />
                      Disponibilidade
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Toque nos dias para marcar ou remover sua disponibilidade.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowAvailability((v) => !v)
                    }}
                    aria-label={showAvailability ? 'Ocultar disponibilidade' : 'Mostrar disponibilidade'}
                  >
                    {showAvailability ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-border/50 bg-card p-4">
                {!showAvailability ? (
                  <div
                    className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm text-muted-foreground cursor-pointer select-none"
                    role="button"
                    tabIndex={0}
                    onClick={() => setShowAvailability(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setShowAvailability(true)
                      }
                    }}
                    aria-label="Abrir disponibilidade"
                  >
                    {(() => {
                      const summary = buildAvailabilitySummaryFromAvailableHours(
                        formData.availableHours,
                        { maxGroups: 3, maxDatesPerGroup: 8, maxPerDayLines: 4 }
                      )

                      if (summary.mode === 'empty') return summary.overview.daysText

                      return (
                        <div className="space-y-2">
                          <div className="text-sm font-semibold text-foreground">
                            {summary.overview.daysText}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-background/40 border border-border/40">
                              <Clock size={12} />
                            </span>
                            <span>
                              {(() => {
                                const t = String(summary.overview.timeText || '').trim()
                                if (!t) return ''
                                if (/^\d+(?:,\d+)?h$/i.test(t)) return `${t} por dia`
                                return t
                              })()}
                            </span>
                          </div>

                          {summary.mode === 'per-day' ? (
                            <div className="pt-1 space-y-1">
                              {summary.perDay.map((item, idx) => (
                                <div key={idx} className="text-xs text-foreground/90">
                                  {item.line}
                                </div>
                              ))}
                              {summary.extraPerDay ? (
                                <div className="text-xs text-muted-foreground">+{summary.extraPerDay} dias</div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="pt-1 space-y-2">
                              {(() => {
                                const groups = Array.isArray(summary.groups) ? summary.groups : []
                                const allDates = Array.isArray(summary.allDates) ? summary.allDates : []

                                // Caso "Horas variadas": manter o resumo minimalista (sem listar 4h/8h/etc.).
                                if ((summary.overview?.timeText || '') === 'Horas variadas') {
                                  return <OneLineDateChips dates={allDates} icon={Calendar} />
                                }

                                if (!groups.length) return null

                                const renderDatesRow = (g) => (
                                  <OneLineDateChips dates={g?.dates} icon={Calendar} />
                                )

                                // Se houver um único padrão, fica igual ao layout da imagem.
                                if (groups.length === 1) return renderDatesRow(groups[0])

                                return (
                                  <div className="space-y-3">
                                    {groups.map((g, idx) => (
                                      <div key={idx} className="space-y-1">
                                        <div className="text-xs font-semibold text-foreground">{g.title}</div>
                                        {renderDatesRow(g)}
                                      </div>
                                    ))}
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                ) : (
                  <>
              <div className="mt-4 rounded-xl border border-border/50 bg-card p-3">
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
                            (isDisabled
                              ? 'opacity-40 cursor-not-allowed '
                              : 'hover:bg-accent ') +
                            (isSelected
                              ? 'bg-primary text-primary-foreground '
                              : 'bg-card ') +
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
                              {badge.hours ? <div className="font-semibold">{badge.hours}</div> : null}
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

              <div className="mt-4 rounded-xl border border-border/50 bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      Configurar dia selecionado
                    </div>
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
                      const slotEnabled = isMorning ? slotMorningEnabled : isAfternoon ? slotAfternoonEnabled : false
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

                            // Manhã/Tarde são combináveis (toggles) no modo slots.
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
                            <span className={(selected ? 'font-semibold ' : 'font-medium ') + 'text-[15px] sm:text-base text-foreground'}>
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
                                    (!selectedWorkDay || disabled ? 'opacity-50 cursor-not-allowed hover:bg-transparent' : '')
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

                      // UX: permitir digitar um campo por vez sem "erro".
                      // Ex.: início 08:00 e fim ainda 00:00 (não definido) não deve ficar vermelho.
                      const morningIncompleteEnd =
                        workDayCustomMorningStart !== '00:00' && workDayCustomMorningEnd === '00:00'
                      const afternoonIncompleteEnd =
                        workDayCustomAfternoonStart !== '00:00' && workDayCustomAfternoonEnd === '00:00'

                      const showMorningInvalid = morningInvalid && !morningIncompleteEnd
                      const showAfternoonInvalid = afternoonInvalid && !afternoonIncompleteEnd

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
                          stepMinutes={30}
                          invalid={!!selectedWorkDay && showMorningInvalid}
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
                          invalid={!!selectedWorkDay && showAfternoonInvalid}
                        />
                      </div>
                    </div>
                      )
                    })()}
                  </div>
                ) : null}

                <div className="mt-4 flex items-center justify-end">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => setShowAvailability(false)}
                  >
                    Salvar disponibilidade
                  </Button>
                </div>

              </div>

                  </>
                )}
              </div>
            </div>

          {/* Tipos de Atendimento + Taxas (recolhível) */}
          <div className="space-y-3">
            <div className="border-t border-border pt-4">
              <div
                className="flex items-start justify-between gap-3 cursor-pointer select-none"
                role="button"
                tabIndex={0}
                onClick={() => setShowAttendanceFees((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setShowAttendanceFees((v) => !v)
                  }
                }}
                aria-label={
                  showAttendanceFees
                    ? 'Ocultar atendimento e taxas'
                    : 'Mostrar atendimento e taxas'
                }
              >
                <div>
                  <h3 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
                    <TrendingUp size={18} className="text-primary" />
                    Atendimento e Taxas
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Configure tipos de atendimento e taxas adicionais (opcional)
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowAttendanceFees((v) => !v)
                  }}
                  aria-label={
                    showAttendanceFees
                      ? 'Ocultar atendimento e taxas'
                      : 'Mostrar atendimento e taxas'
                  }
                >
                  {showAttendanceFees ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-card p-4">
              {!showAttendanceFees ? (
                <div
                  className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm text-muted-foreground cursor-pointer select-none"
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowAttendanceFees(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setShowAttendanceFees(true)
                    }
                  }}
                  aria-label="Abrir atendimento e taxas"
                >
                  {(() => {
                    const items = []
                    if (formData.homeService)
                      items.push(
                        `Domicílio${formData.homeServiceFee ? ` (+${formData.homeServiceFee}%)` : ''}`
                      )
                    if (formData.emergencyService)
                      items.push(
                        `Emergência${formData.emergencyServiceFee ? ` (+${formData.emergencyServiceFee}%)` : ''}`
                      )
                    if (formData.travelService)
                      items.push(
                        `Deslocamento${formData.travelFee ? ` (+${formData.travelFee}%)` : ''}`
                      )
                    if (formData.overtimeService)
                      items.push(
                        `Hora extra${formData.overtimeFee ? ` (+${formData.overtimeFee}%)` : ''}`
                      )
                    return items.length ? items.join(' · ') : 'Nenhum selecionado'
                  })()}
                </div>
              ) : (
                <div className="mt-4 space-y-4">

            {/* Atende a Domicílio */}
            <Card className="bg-gradient-to-r from-blue-500/5 to-primary/5 border-primary/20">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Home size={18} className="text-primary" />
                    </div>
                    <div>
                      <Label
                        htmlFor="homeService"
                        className="cursor-pointer font-semibold"
                      >
                        Atendimento a Domicílio
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Presto serviços na casa do cliente
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="homeService"
                    checked={formData.homeService}
                    onCheckedChange={(checked) => {
                      handleChange('homeService', checked)
                      if (!checked) handleChange('homeServiceFee', '')
                      else if (!normalizePercent(formData.homeServiceFee))
                        handleChange('homeServiceFee', PERCENT_MIN)
                    }}
                  />
                </div>
                {formData.homeService && (
                  <div className="pl-12 pt-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <PercentStepper
                        id="homeServiceFee"
                        value={formData.homeServiceFee}
                        onChange={(v) => handleChange('homeServiceFee', v)}
                        ariaLabel="Taxa de domicílio"
                      />
                      <FeeIncreaseHint percentRaw={formData.homeServiceFee} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Taxa sobre o valor base do serviço
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Atende Emergência */}
            <Card className="bg-gradient-to-r from-red-500/5 to-orange-500/5 border-red-500/20">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-red-500/10 rounded-lg">
                      <AlertCircle size={18} className="text-red-600" />
                    </div>
                    <div>
                      <Label
                        htmlFor="emergencyService"
                        className="cursor-pointer font-semibold"
                      >
                        Atendimento de Emergência
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Disponível para urgências 24h
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="emergencyService"
                    checked={formData.emergencyService}
                    onCheckedChange={(checked) => {
                      handleChange('emergencyService', checked)
                      if (!checked) handleChange('emergencyServiceFee', '')
                      else if (!normalizePercent(formData.emergencyServiceFee))
                        handleChange('emergencyServiceFee', PERCENT_MIN)
                    }}
                  />
                </div>
                {formData.emergencyService && (
                  <div className="pl-12 pt-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <PercentStepper
                        id="emergencyServiceFee"
                        value={formData.emergencyServiceFee}
                        onChange={(v) => handleChange('emergencyServiceFee', v)}
                        ariaLabel="Taxa de emergência"
                      />
                      <FeeIncreaseHint percentRaw={formData.emergencyServiceFee} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Taxa adicional para atendimentos urgentes
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Taxa de Deslocamento */}
            <Card className="bg-gradient-to-r from-green-500/5 to-teal-500/5 border-green-500/20">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-green-500/10 rounded-lg">
                      <Truck size={18} className="text-green-600" />
                    </div>
                    <div>
                      <Label
                        htmlFor="travelService"
                        className="cursor-pointer font-semibold"
                      >
                        Taxa de Deslocamento
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Cobrada para cobrir custos de transporte
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="travelService"
                    checked={formData.travelService}
                    onCheckedChange={(checked) => {
                      handleChange('travelService', checked)
                      if (!checked) handleChange('travelFee', '')
                      else if (!normalizePercent(formData.travelFee))
                        handleChange('travelFee', PERCENT_MIN)
                    }}
                  />
                </div>
                {formData.travelService && (
                  <div className="pl-12 pt-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <PercentStepper
                        id="travelFee"
                        value={formData.travelFee}
                        onChange={(v) => handleChange('travelFee', v)}
                        ariaLabel="Taxa de deslocamento"
                      />
                      <FeeIncreaseHint percentRaw={formData.travelFee} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Aplica-se quando há necessidade de deslocamento
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Taxa de Hora Extra */}
            <Card className="bg-gradient-to-r from-amber-500/5 to-yellow-500/5 border-amber-500/20">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-amber-500/10 rounded-lg">
                      <Timer size={18} className="text-amber-600" />
                    </div>
                    <div>
                      <Label
                        htmlFor="overtimeService"
                        className="cursor-pointer font-semibold"
                      >
                        Taxa de Hora Extra
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Cobrada quando excede o horário normal de trabalho
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="overtimeService"
                    checked={formData.overtimeService}
                    onCheckedChange={(checked) => {
                      handleChange('overtimeService', checked)
                      if (!checked) handleChange('overtimeFee', '')
                      else if (!normalizePercent(formData.overtimeFee))
                        handleChange('overtimeFee', PERCENT_MIN)
                    }}
                  />
                </div>
                {formData.overtimeService && (
                  <div className="pl-12 pt-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <PercentStepper
                        id="overtimeFee"
                        value={formData.overtimeFee}
                        onChange={(v) => handleChange('overtimeFee', v)}
                        ariaLabel="Taxa de hora extra"
                      />
                      <FeeIncreaseHint percentRaw={formData.overtimeFee} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Aplica-se após horário combinado ou em finais de semana
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

                </div>
              )}
            </div>
          </div>

          {/* Resumo (recolhível) */}
          <div className="space-y-3">
            <div className="border-t border-border pt-4">
              <div
                className="flex items-start justify-between gap-3 cursor-pointer select-none"
                role="button"
                tabIndex={0}
                onClick={() => setShowServiceSummary((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setShowServiceSummary((v) => !v)
                  }
                }}
                aria-label={showServiceSummary ? 'Ocultar resumo' : 'Mostrar resumo'}
              >
                <div>
                  <h3 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
                    <ClipboardList size={18} className="text-primary" />
                    Resumo
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Revise valor, disponibilidade e taxas antes de salvar
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowServiceSummary((v) => !v)
                  }}
                  aria-label={showServiceSummary ? 'Ocultar resumo' : 'Mostrar resumo'}
                >
                  {showServiceSummary ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-card p-4">
              {!showServiceSummary ? (
                <div
                  className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm text-muted-foreground cursor-pointer select-none"
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowServiceSummary(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setShowServiceSummary(true)
                    }
                  }}
                  aria-label="Abrir resumo"
                >
                  {(() => {
                    const serviceTitle = String(formData.title || '').trim() || 'Serviço'
                    const unitText = formatPriceUnit(formData.priceUnit)
                    const basePrice = toMoneyNumber(formData.price)
                    const baseText = `${formatBRL(basePrice)} / ${unitText}`

                    const breakdown = calcAdditionalFeesBreakdown(formData.price, formData)
                    const total = calcTotalWithFees(formData.price, breakdown)
                    const totalText = `${formatBRL(total)} / ${unitText}`

                    const availability = buildAvailabilitySummaryFromAvailableHours(formData.availableHours)
                    const availabilityText =
                      availability.mode === 'empty'
                        ? 'Disponibilidade: ainda não configurada'
                        : `${availability.overview.daysText} · ${availability.overview.timeText}`

                    const feesText = breakdown.length
                      ? `Taxas: ${breakdown.map((b) => b.label).join(' · ')}`
                      : 'Nenhuma taxa adicional'

                    return (
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-foreground">{serviceTitle}</div>
                        <div className="text-xs text-muted-foreground">💰 Você recebe: {baseText}</div>
                        <div className="text-xs font-semibold text-foreground/90">
                          🧾 Total (com taxas): <span className="tabular-nums">{totalText}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{feesText}</div>
                        <div className="text-xs text-muted-foreground">🗓️ {availabilityText}</div>
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {(() => {
                    const serviceTitle = String(formData.title || '').trim() || 'Serviço'
                    const unitText = formatPriceUnit(formData.priceUnit)
                    const basePrice = toMoneyNumber(formData.price)
                    const breakdown = calcAdditionalFeesBreakdown(formData.price, formData)
                    const total = calcTotalWithFees(formData.price, breakdown)

                    const availability = buildAvailabilitySummaryFromAvailableHours(formData.availableHours)
                    const datesPreview =
                      availability.mode === 'empty'
                        ? ''
                        : formatDatesPreview(Array.isArray(availability.allDates) ? availability.allDates : [], 3)

                    const timeText = availability.mode === 'empty' ? '' : String(availability?.overview?.timeText || '').trim()
                    const canShowAvg = timeText && /\bh\b/.test(timeText) && !/variad/i.test(timeText)

                    return (
                      <>
                        <div className="space-y-5">
                          {/* A) Cabeçalho do serviço (compacto) */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center justify-center h-6 w-6 rounded-lg bg-muted/30 border border-border/40">
                                <Wrench size={14} className="text-muted-foreground" />
                              </span>
                              <div className="text-sm font-semibold text-foreground">{serviceTitle}</div>
                            </div>
                            {formData.workArea ? (
                              <div className="text-xs text-muted-foreground">
                                Área: <span className="text-foreground/90">{formData.workArea}</span>
                              </div>
                            ) : null}
                          </div>

                          {/* B) Card Destaque #1 (Você recebe) */}
                          <div className="rounded-2xl border border-border/50 bg-background/40 shadow-sm p-5">
                            <div className="text-xs text-muted-foreground">Você recebe</div>
                            <div className="mt-2 text-2xl font-bold text-foreground tabular-nums">
                              {formatBRL(basePrice)} <span className="text-base font-semibold text-muted-foreground">/ {unitText}</span>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">Preço base definido por você</div>
                          </div>

                          {/* C) Card Taxas adicionais */}
                          <div className="rounded-2xl border border-border/50 bg-background/40 shadow-sm p-5">
                            <div className="text-xs text-muted-foreground">Taxas adicionais</div>
                            <div className="mt-3 space-y-2 text-sm">
                              {breakdown.length ? (
                                breakdown.map((it) => (
                                  <div key={it.label} className="flex items-center justify-between gap-3">
                                    <span className="text-foreground/90">{it.label}</span>
                                    <span className="tabular-nums text-muted-foreground">+{formatBRL(it.amount)} ({it.percent}%)</span>
                                  </div>
                                ))
                              ) : (
                                <div className="text-sm text-muted-foreground">Nenhuma taxa aplicada</div>
                              )}
                            </div>
                          </div>

                          {/* D) Card Destaque #2 (Total) */}
                          <div className="rounded-2xl border border-border/50 bg-background/40 shadow-sm p-5">
                            <div className="text-xs text-muted-foreground">Total por {unitText}</div>
                            <div className="mt-2 text-xl font-semibold text-foreground tabular-nums">{formatBRL(total)}</div>
                            <div className="mt-1 text-xs text-muted-foreground">Inclui taxas selecionadas</div>
                          </div>

                          {/* E) Disponibilidade */}
                          <div className="rounded-2xl border border-border/50 bg-background/40 shadow-sm p-5">
                            <div className="text-xs text-muted-foreground">Disponibilidade</div>
                            {availability.mode === 'empty' ? (
                              <div className="mt-2 text-sm text-muted-foreground">Ainda não configurada</div>
                            ) : (
                              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                                <div>{availability.overview.daysText}</div>
                                {canShowAvg ? <div>⏱ Média: {timeText}</div> : null}
                                {datesPreview ? <div>📅 {datesPreview}</div> : null}
                              </div>
                            )}
                          </div>

                          {/* F) Rodapé informativo (discreto) */}
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">Taxa do JOBY: {APP_FEE_PERCENT}% por contratação (automática)</div>
                            <div className="text-xs text-muted-foreground">Pagamento garantido — liberado após a conclusão do serviço</div>
                          </div>
                        </div>
                      </>
                    )
                  })()}

                  <div className="flex items-center justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowServiceSummary(false)}>
                      Fechar resumo
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 joby-gradient text-primary-foreground"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Salvando...'
                : editingService
                ? 'Atualizar Serviço'
                : 'Adicionar Serviço'}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  )

  // Renderizar usando Portal diretamente no body (resolve problemas de posicionamento no Android)
  return ReactDOM.createPortal(modalContent, document.body)
}

export default ServiceForm
