import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { motion } from 'framer-motion'
import {
  X,
  Trash2,
  Clock,
  Calendar,
  MapPin,
  Home,
  AlertCircle,
  TrendingUp,
  Truck,
  Percent,
  Timer,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Upload,
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

const ServiceForm = ({ isOpen, onClose, onSave, editingService = null }) => {
  const { toast } = useToast()
  const { user } = useAuth()
  const [docsDialogOpen, setDocsDialogOpen] = useState(false)
  const formRef = useRef(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(
    editingService?.image || null
  )

  const resolvedImagePreview = useResolvedStorageUrl(imagePreview || '', {
    debugLabel: 'service cover preview',
  })

  const isImagePreviewStorageRef =
    typeof imagePreview === 'string' && imagePreview.trim().startsWith('storage://')
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
  const [showAvailability, setShowAvailability] = useState(false)
  const [showDefinedDaysHours, setShowDefinedDaysHours] = useState(false)
  const [showAttendanceTypes, setShowAttendanceTypes] = useState(false)
  const [showExtraFees, setShowExtraFees] = useState(false)

  const [availabilityMonth, setAvailabilityMonth] = useState(new Date())
  const [availabilityStart, setAvailabilityStart] = useState(null)
  const [availabilityEnd, setAvailabilityEnd] = useState(null)
  const [availabilityWeekendMode, setAvailabilityWeekendMode] = useState('include')

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

  // Atualizar formData quando editingService mudar
  useEffect(() => {
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
        homeServiceFee: editingService.home_service_fee || '',
        emergencyServiceFee: editingService.emergency_service_fee || '',
        travelFee: editingService.travel_fee || '',
        overtimeFee: editingService.overtime_fee || '',
      })
      setImagePreview(editingService.image || null)
      if (editingService.price != null && editingService.price !== '') {
        const cents = Math.round(toMoneyNumber(editingService.price) * 100)
        setPriceDigits(cents > 0 ? String(cents) : '')
      } else {
        setPriceDigits('')
      }

      // Keep sections collapsed by default; open if there are active flags/fees.
      setShowPriceUnitOptions(false)
      setShowAvailability(false)
      setShowAttendanceTypes(
        !!(
          editingService.home_service ||
          editingService.emergency_service ||
          editingService.home_service_fee ||
          editingService.emergency_service_fee
        )
      )
      setShowExtraFees(
        !!(
          editingService.travel_service ||
          editingService.overtime_service ||
          editingService.travel_fee ||
          editingService.overtime_fee
        )
      )

      setAvailabilityMonth(new Date())
      setAvailabilityStart(null)
      setAvailabilityEnd(null)
      setAvailabilityWeekendMode('include')

      // Tenta inferir intervalo e preferência de fins de semana a partir do texto salvo.
      const first = (editingService.available_hours || [])[0]
      if (typeof first === 'string' && first.trim()) {
        const m = first
          .trim()
          .match(
            /^(\d{2}\/\d{2}\/\d{4})\s+até\s+(\d{2}\/\d{2}\/\d{4})\s+disponível(?:\s*[•\-]\s*(.*))?$/i
          )

        const parseBRDate = (s) => {
          const [dd, mm, yyyy] = String(s).split('/')
          const d = Number(dd)
          const mo = Number(mm)
          const y = Number(yyyy)
          if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return null
          if (mo < 1 || mo > 12) return null
          if (d < 1 || d > 31) return null
          const dt = new Date(y, mo - 1, d)
          return Number.isFinite(dt.getTime()) ? startOfDay(dt) : null
        }

        if (m) {
          const start = parseBRDate(m[1])
          const end = parseBRDate(m[2])
          if (start && end) {
            setAvailabilityStart(start)
            setAvailabilityEnd(end)
          }
          const suffix = String(m[3] || '').toLowerCase()
          if (suffix.includes('somente dias úteis') || suffix.includes('apenas dias úteis')) {
            setAvailabilityWeekendMode('exclude')
          } else if (suffix.includes('inclui')) {
            setAvailabilityWeekendMode('include')
          }
        }
      }
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
      setPriceDigits('')

      setShowPriceUnitOptions(false)
      setShowAvailability(false)
      setShowAttendanceTypes(false)
      setShowExtraFees(false)

      setAvailabilityMonth(new Date())
      setAvailabilityStart(null)
      setAvailabilityEnd(null)
      setAvailabilityWeekendMode('include')
    }
  }, [editingService])

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const formatAvailabilityRangeLabel = (
    startDate,
    endDate,
    { weekendMode = availabilityWeekendMode } = {}
  ) => {
    if (!startDate || !endDate) return ''
    const weekendSuffix =
      weekendMode === 'exclude'
        ? ' • somente dias úteis'
        : ' • inclui fins de semana'
    return `${format(startDate, 'dd/MM/yyyy', { locale: ptBR })} até ${format(
      endDate,
      'dd/MM/yyyy',
      { locale: ptBR }
    )} disponível${weekendSuffix}`
  }

  const commitAvailabilityRange = ({ startDate, endDate }) => {
    if (!startDate || !endDate) return
    const label = formatAvailabilityRangeLabel(startDate, endDate)
    if (!label) return
    handleChange('availableHours', [label])
    setShowAvailability(false)
  }

  const updateAvailabilityLabelInPlace = ({ startDate, endDate, weekendMode }) => {
    if (!startDate || !endDate) return
    const label = formatAvailabilityRangeLabel(startDate, endDate, { weekendMode })
    if (!label) return
    handleChange('availableHours', [label])
  }

  const clearAvailabilityRange = () => {
    setAvailabilityStart(null)
    setAvailabilityEnd(null)
    setAvailabilityWeekendMode('include')
    handleChange('availableHours', [])
    setShowAvailability(false)
  }

  const setWeekendMode = (mode) => {
    setAvailabilityWeekendMode(mode)
    if (availabilityStart && availabilityEnd) {
      updateAvailabilityLabelInPlace({
        startDate: availabilityStart,
        endDate: availabilityEnd,
        weekendMode: mode,
      })
    }
  }

  const handleAvailabilityDayClick = (day) => {
    const d = startOfDay(day)
    const today = startOfDay(new Date())
    if (isBefore(d, today)) return

    if (!availabilityStart || (availabilityStart && availabilityEnd)) {
      setAvailabilityStart(d)
      setAvailabilityEnd(null)
      return
    }

    // start set, end not set
    if (isBefore(d, availabilityStart)) {
      setAvailabilityStart(d)
      setAvailabilityEnd(null)
      return
    }

    setAvailabilityEnd(d)
    commitAvailabilityRange({ startDate: availabilityStart, endDate: d })
  }

  const isDayInAvailabilityRange = (day) => {
    if (!availabilityStart) return false
    const d = startOfDay(day)
    const start = startOfDay(availabilityStart)
    const end = availabilityEnd ? startOfDay(availabilityEnd) : null

    if (!end) return isSameDay(d, start)

    if (isBefore(d, start) || isAfter(d, end)) return false
    return true
  }

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Arquivo inválido',
          description: 'Por favor, selecione uma imagem.',
          variant: 'destructive',
        })
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: 'Arquivo muito grande',
          description: 'A imagem deve ter no máximo 5MB.',
          variant: 'destructive',
        })
        return
      }

      setImageFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemoveImage = () => {
    setImageFile(null)
    setImagePreview(editingService?.image || null)
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
      let imageUrl = editingService?.image || null

      // Upload da imagem se houver uma nova
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop()
        const fileName = `${user.id}-${Date.now()}.${fileExt}`
        const filePath = `service-images/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('photos')
          .upload(filePath, imageFile, {
            cacheControl: '3600',
            upsert: false,
          })

        if (uploadError) {
          throw new Error(
            `Erro ao fazer upload da imagem: ${uploadError.message}`
          )
        }

        imageUrl = `storage://photos/${filePath}`
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
      console.error('Erro ao salvar serviço:', error)
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
            <Label className="flex items-center gap-2 mb-2">
              <ImageIcon size={16} />
              Foto de Capa
              <span className="text-xs text-muted-foreground font-normal">
                (opcional - recomendado para melhor visualização)
              </span>
            </Label>
            <div className="space-y-3">
              {imagePreview ? (
                <div className="relative w-full h-48 rounded-lg overflow-hidden border border-border">
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
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-2 hover:bg-black/80 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors bg-muted/30">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                    <p className="mb-2 text-sm text-muted-foreground">
                      <span className="font-semibold">Clique para enviar</span>{' '}
                      ou arraste
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PNG, JPG ou GIF (máx. 5MB)
                    </p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleImageSelect}
                  />
                </label>
              )}
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

          {/* Disponibilidade (calendário) */}
          <div className="rounded-2xl border border-border/50 bg-card p-4">
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
              aria-label={
                showAvailability
                  ? 'Ocultar dias disponíveis'
                  : 'Mostrar dias disponíveis'
              }
            >
              <div>
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Calendar size={16} className="text-primary" />
                  Dias disponíveis
                </h4>
                <p className="text-xs text-muted-foreground">
                  Selecione um intervalo de datas em que você estará disponível
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
                aria-label={
                  showAvailability
                    ? 'Ocultar dias disponíveis'
                    : 'Mostrar dias disponíveis'
                }
              >
                {showAvailability ? (
                  <ChevronUp size={18} />
                ) : (
                  <ChevronDown size={18} />
                )}
              </Button>
            </div>

            {!showAvailability ? (
              <div className="mt-3 rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm select-none">
                {formData.availableHours.length > 0 ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-foreground">
                      {formData.availableHours[0]}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAvailability(true)}
                    >
                      Editar
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      Nenhum dia definido
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="text-xs text-muted-foreground">
                    {!availabilityStart
                      ? 'Selecione a data inicial'
                      : !availabilityEnd
                        ? `Início: ${format(availabilityStart, 'dd/MM/yyyy', {
                            locale: ptBR,
                          })} (agora selecione a data final)`
                        : formatAvailabilityRangeLabel(
                            availabilityStart,
                            availabilityEnd
                          )}
                  </div>
                  {(availabilityStart || formData.availableHours.length > 0) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={clearAvailabilityRange}
                    >
                      Limpar
                    </Button>
                  )}
                </div>

                <div className="mb-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    Preferência de fins de semana
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setWeekendMode('include')}
                      className={
                        'rounded-xl border px-3 py-2 text-sm text-left transition-colors ' +
                        (availabilityWeekendMode === 'include'
                          ? 'bg-muted/60 border-primary/40'
                          : 'bg-card border-border/50 hover:bg-muted/40')
                      }
                      aria-pressed={availabilityWeekendMode === 'include'}
                    >
                      <div className="font-semibold text-foreground">
                        Inclui fins de semana
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Disponível também sábado e domingo
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeekendMode('exclude')}
                      className={
                        'rounded-xl border px-3 py-2 text-sm text-left transition-colors ' +
                        (availabilityWeekendMode === 'exclude'
                          ? 'bg-muted/60 border-primary/40'
                          : 'bg-card border-border/50 hover:bg-muted/40')
                      }
                      aria-pressed={availabilityWeekendMode === 'exclude'}
                    >
                      <div className="font-semibold text-foreground">
                        Somente dias úteis
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Segunda a sexta-feira
                      </div>
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-border/50 bg-muted/10 p-3">
                  <div className="flex items-center justify-between py-1 px-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setAvailabilityMonth(subMonths(availabilityMonth, 1))
                      }
                      aria-label="Mês anterior"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <span className="text-sm font-semibold">
                      {format(availabilityMonth, 'MMMM yyyy', {
                        locale: ptBR,
                      })}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setAvailabilityMonth(addMonths(availabilityMonth, 1))
                      }
                      aria-label="Próximo mês"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {Array.from({ length: 7 }).map((_, i) => {
                      const startDate = startOfWeek(availabilityMonth, {
                        locale: ptBR,
                      })
                      const label = format(addDays(startDate, i), 'EE', {
                        locale: ptBR,
                      })
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
                      const calendarStartDate = startOfWeek(monthStart, {
                        locale: ptBR,
                      })
                      const calendarEndDate = endOfWeek(monthEnd, {
                        locale: ptBR,
                      })

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
                        const isSelected = isDayInAvailabilityRange(day)
                        const isStartSel =
                          availabilityStart &&
                          isSameDay(d, availabilityStart)
                        const isEndSel =
                          availabilityEnd && isSameDay(d, availabilityEnd)

                        return (
                          <Button
                            key={day.toISOString()}
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={
                              'h-8 w-8 text-xs p-0 rounded-full ' +
                              (isOutsideMonth
                                ? 'text-muted-foreground/30 invisible '
                                : '') +
                              (isDisabled
                                ? 'opacity-40 cursor-not-allowed hover:bg-transparent '
                                : 'hover:bg-accent ') +
                              (isSelected ? 'bg-primary/15 ' : '') +
                              (isStartSel || isEndSel
                                ? 'bg-primary text-primary-foreground hover:bg-primary/90 '
                                : '')
                            }
                            onClick={() =>
                              !isDisabled && handleAvailabilityDayClick(day)
                            }
                            disabled={isDisabled}
                            aria-label={format(day, 'dd/MM/yyyy', {
                              locale: ptBR,
                            })}
                          >
                            {format(day, 'd')}
                          </Button>
                        )
                      })
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Dias e horários definidos */}
          <div className="rounded-2xl border border-border/50 bg-card p-4">
            <div
              className="flex items-start justify-between gap-3 cursor-pointer select-none"
              role="button"
              tabIndex={0}
              onClick={() => setShowDefinedDaysHours((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setShowDefinedDaysHours((v) => !v)
                }
              }}
              aria-label={
                showDefinedDaysHours
                  ? 'Ocultar dias e horários definidos'
                  : 'Mostrar dias e horários definidos'
              }
            >
              <div>
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Clock size={16} className="text-primary" />
                  Dias e horários definidos
                </h4>
                <p className="text-xs text-muted-foreground">
                  Defina dias da semana e horários específicos para este serviço
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDefinedDaysHours((v) => !v)
                }}
                aria-label={
                  showDefinedDaysHours
                    ? 'Ocultar dias e horários definidos'
                    : 'Mostrar dias e horários definidos'
                }
              >
                {showDefinedDaysHours ? (
                  <ChevronUp size={18} />
                ) : (
                  <ChevronDown size={18} />
                )}
              </Button>
            </div>

            {!showDefinedDaysHours ? (
              <div className="mt-3 rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm select-none">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Nenhum dia definido
                  </span>
                  <span className="text-xs text-muted-foreground">(em aberto)</span>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-border/50 bg-muted/10 p-3">
                <p className="text-sm text-muted-foreground">
                  Defina aqui os dias da semana e os horários específicos para este serviço.
                </p>
              </div>
            )}
          </div>

          {/* Tipos de Atendimento + Taxas (recolhível) */}
          <div className="space-y-4">
            <div className="border-t border-border pt-4">
              <h3 className="text-base font-semibold text-foreground mb-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <TrendingUp size={18} className="text-primary" />
                  Atendimento e Taxas
                </span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Configure tipos de atendimento e taxas adicionais (opcional)
              </p>
            </div>

            {/* Tipos de Atendimento */}
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <div
                className="flex items-start justify-between gap-3 cursor-pointer select-none"
                role="button"
                tabIndex={0}
                onClick={() => setShowAttendanceTypes((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setShowAttendanceTypes((v) => !v)
                  }
                }}
                aria-label={
                  showAttendanceTypes
                    ? 'Ocultar tipos de atendimento'
                    : 'Mostrar tipos de atendimento'
                }
              >
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    Tipos de atendimento
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Selecione os modos em que você atende
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowAttendanceTypes((v) => !v)
                  }}
                  aria-label={
                    showAttendanceTypes
                      ? 'Ocultar tipos de atendimento'
                      : 'Mostrar tipos de atendimento'
                  }
                >
                  {showAttendanceTypes ? (
                    <ChevronUp size={18} />
                  ) : (
                    <ChevronDown size={18} />
                  )}
                </Button>
              </div>

              {!showAttendanceTypes ? (
                <div
                  className="mt-3 rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm text-muted-foreground cursor-pointer select-none"
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowAttendanceTypes(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setShowAttendanceTypes(true)
                    }
                  }}
                  aria-label="Abrir tipos de atendimento"
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
                    onCheckedChange={(checked) =>
                      handleChange('homeService', checked)
                    }
                  />
                </div>
                {formData.homeService && (
                  <div className="pl-12 pt-2">
                    <div className="relative w-24">
                      <Input
                        id="homeServiceFee"
                        type="number"
                        value={formData.homeServiceFee}
                        onChange={(e) =>
                          handleChange('homeServiceFee', e.target.value)
                        }
                        placeholder="30"
                        className="pr-8 h-8 text-sm"
                        min="0"
                        max="100"
                        step="1"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
                        %
                      </span>
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
                    onCheckedChange={(checked) =>
                      handleChange('emergencyService', checked)
                    }
                  />
                </div>
                {formData.emergencyService && (
                  <div className="pl-12 pt-2">
                    <div className="relative w-24">
                      <Input
                        id="emergencyServiceFee"
                        type="number"
                        value={formData.emergencyServiceFee}
                        onChange={(e) =>
                          handleChange('emergencyServiceFee', e.target.value)
                        }
                        placeholder="50"
                        className="pr-8 h-8 text-sm"
                        min="0"
                        max="200"
                        step="1"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
                        %
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Taxa adicional para atendimentos urgentes
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

                </div>
              )}
            </div>

            {/* Taxas adicionais */}
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <div
                className="flex items-start justify-between gap-3 cursor-pointer select-none"
                role="button"
                tabIndex={0}
                onClick={() => setShowExtraFees((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setShowExtraFees((v) => !v)
                  }
                }}
                aria-label={
                  showExtraFees
                    ? 'Ocultar taxas adicionais'
                    : 'Mostrar taxas adicionais'
                }
              >
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    Taxas adicionais
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Defina taxas percentuais (opcional)
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowExtraFees((v) => !v)
                  }}
                  aria-label={
                    showExtraFees
                      ? 'Ocultar taxas adicionais'
                      : 'Mostrar taxas adicionais'
                  }
                >
                  {showExtraFees ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </Button>
              </div>

              {!showExtraFees ? (
                <div
                  className="mt-3 rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm text-muted-foreground cursor-pointer select-none"
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowExtraFees(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setShowExtraFees(true)
                    }
                  }}
                  aria-label="Abrir taxas adicionais"
                >
                  {(() => {
                    const items = []
                    if (formData.travelService)
                      items.push(
                        `Deslocamento${formData.travelFee ? ` (+${formData.travelFee}%)` : ''}`
                      )
                    if (formData.overtimeService)
                      items.push(
                        `Hora extra${formData.overtimeFee ? ` (+${formData.overtimeFee}%)` : ''}`
                      )
                    if (!items.length) return 'Nenhuma selecionada'

                    if (formData.price) {
                      let total = parseFloat(formData.price)
                      if (formData.travelFee) {
                        total +=
                          parseFloat(formData.price) *
                          (parseFloat(formData.travelFee) / 100)
                      }
                      if (formData.overtimeFee) {
                        total +=
                          parseFloat(formData.price) *
                          (parseFloat(formData.overtimeFee) / 100)
                      }
                      return `${items.join(' · ')} • Total estimado: ${formatBRL(total)}`
                    }

                    return items.join(' · ')
                  })()}
                </div>
              ) : (
                <div className="mt-4 space-y-4">

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
                    onCheckedChange={(checked) =>
                      handleChange('travelService', checked)
                    }
                  />
                </div>
                {formData.travelService && (
                  <div className="pl-12 pt-2">
                    <div className="relative w-24">
                      <Input
                        id="travelFee"
                        type="number"
                        value={formData.travelFee}
                        onChange={(e) =>
                          handleChange('travelFee', e.target.value)
                        }
                        placeholder="10"
                        className="pr-8 h-8 text-sm"
                        min="0"
                        max="100"
                        step="1"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
                        %
                      </span>
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
                    onCheckedChange={(checked) =>
                      handleChange('overtimeService', checked)
                    }
                  />
                </div>
                {formData.overtimeService && (
                  <div className="pl-12 pt-2">
                    <div className="relative w-24">
                      <Input
                        id="overtimeFee"
                        type="number"
                        value={formData.overtimeFee}
                        onChange={(e) =>
                          handleChange('overtimeFee', e.target.value)
                        }
                        placeholder="50"
                        className="pr-8 h-8 text-sm"
                        min="0"
                        max="200"
                        step="1"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">
                        %
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Aplica-se após horário combinado ou em finais de semana
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Resumo das Taxas */}
            {(formData.homeServiceFee ||
              formData.emergencyServiceFee ||
              formData.travelFee ||
              formData.overtimeFee) &&
              formData.price && (
                <Card className="bg-gradient-to-r from-primary/10 to-trust-blue/10 border-primary/30">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">
                          Valor base:
                        </span>
                        <span className="text-sm font-medium">
                          {formatBRL(formData.price)}
                        </span>
                      </div>

                      {formData.homeService && formData.homeServiceFee && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            Taxa Domicílio (+{formData.homeServiceFee}%):
                          </span>
                          <span className="font-medium text-blue-600">
                            + {formatBRL(
                              parseFloat(formData.price) *
                                (parseFloat(formData.homeServiceFee) / 100)
                            )}
                          </span>
                        </div>
                      )}

                      {formData.emergencyService &&
                        formData.emergencyServiceFee && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              Taxa Emergência (+{formData.emergencyServiceFee}
                              %):
                            </span>
                            <span className="font-medium text-red-600">
                              + {formatBRL(
                                parseFloat(formData.price) *
                                  (parseFloat(formData.emergencyServiceFee) / 100)
                              )}
                            </span>
                          </div>
                        )}

                      {formData.travelFee && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            Taxa Deslocamento (+{formData.travelFee}%):
                          </span>
                          <span className="font-medium text-green-600">
                            + {formatBRL(
                              parseFloat(formData.price) *
                                (parseFloat(formData.travelFee) / 100)
                            )}
                          </span>
                        </div>
                      )}

                      {formData.overtimeFee && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            Taxa Hora Extra (+{formData.overtimeFee}%):
                          </span>
                          <span className="font-medium text-amber-600">
                            + {formatBRL(
                              parseFloat(formData.price) *
                                (parseFloat(formData.overtimeFee) / 100)
                            )}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t-2 border-primary/30">
                        <span className="text-base font-bold text-foreground">
                          Valor Total:
                        </span>
                        <span className="text-lg font-bold text-primary">
                          {''}
                          {(() => {
                            let total = parseFloat(formData.price)
                            if (
                              formData.homeService &&
                              formData.homeServiceFee
                            ) {
                              total +=
                                parseFloat(formData.price) *
                                (parseFloat(formData.homeServiceFee) / 100)
                            }
                            if (
                              formData.emergencyService &&
                              formData.emergencyServiceFee
                            ) {
                              total +=
                                parseFloat(formData.price) *
                                (parseFloat(formData.emergencyServiceFee) / 100)
                            }
                            if (formData.travelFee) {
                              total +=
                                parseFloat(formData.price) *
                                (parseFloat(formData.travelFee) / 100)
                            }
                            if (formData.overtimeFee) {
                              total +=
                                parseFloat(formData.price) *
                                (parseFloat(formData.overtimeFee) / 100)
                            }
                            return formatBRL(total)
                          })()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
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
