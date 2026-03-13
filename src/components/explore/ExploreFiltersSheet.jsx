import React, { useMemo, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Briefcase,
  ChevronRight,
  Circle,
  DollarSign,
  MapPin,
  Star,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  bottomSheetContainerBase,
  bottomSheetHandleBar,
  bottomSheetHandleWrap,
  sheetOverlayBlurDark,
} from '@/design/sheetTokens'
import { useOverlayLock } from '@/hooks/useOverlayLock'
import { cn } from '@/lib/utils'
import { formatPriceUnit } from '@/lib/priceUnit'

const FILTER_ITEMS = [
  { key: 'profession', label: 'Profissão', Icon: Briefcase },
  { key: 'location', label: 'Localização', Icon: MapPin },
  { key: 'rating', label: 'Avaliação', Icon: Star },
  { key: 'price', label: 'Preço', Icon: DollarSign },
  { key: 'available_now', label: 'Disponível agora', Icon: Circle, iconClassName: 'text-green-500' },
  { key: 'emergency', label: 'Emergência', Icon: AlertTriangle, iconClassName: 'text-orange-500' },
]

const DEFAULT_FILTERS = {
  profession: '',
  location: '',
  nearMe: false,
  radiusKm: 10,
  minRating: 0,
  priceRange: [0, 500],
  priceUnit: '',
  availableNow: false,
  emergency: false,
}

const normalizePriceRange = (value, fallback) => {
  if (!Array.isArray(value) || value.length < 2) return fallback
  const a = Number(value[0])
  const b = Number(value[1])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return fallback
  const min = Math.min(a, b)
  const max = Math.max(a, b)
  return [min, max]
}

export const ExploreFiltersSheet = ({
  open,
  onOpenChange,
  onPickItem,
  value,
  onChange,
  onReset,
  onApply,
  canUseNearMe = true,
}) => {
  useOverlayLock(!!open)
  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState(DEFAULT_FILTERS)
  const v = (isControlled ? value : internalValue) || {}

  const priceUnitOptions = useMemo(
    () => [
      { label: 'Todos', value: '' },
      { label: 'Hora', value: 'hora' },
      { label: 'Diária', value: 'dia' },
      { label: 'Evento', value: 'evento' },
      { label: 'Mês', value: 'mes' },
      { label: 'Projeto', value: 'projeto' },
    ],
    []
  )

  const ratingOptions = useMemo(
    () => [
      { label: 'Qualquer', value: 0 },
      { label: '3+', value: 3 },
      { label: '4+', value: 4 },
      { label: '4,5+', value: 4.5 },
    ],
    []
  )

  const priceRange = normalizePriceRange(v.priceRange, [0, 500])
  const hasAnyPriceFilter = priceRange[0] > 0 || priceRange[1] < 500
  const priceUnit = String(v.priceUnit || '').trim()
  const prettyUnit = priceUnit ? formatPriceUnit(priceUnit) : ''

  const update = (patch) => {
    const next = { ...v, ...(patch || {}) }

    if (!isControlled) {
      setInternalValue(next)
    }

    onChange?.(next)
  }

  const canReset = !!onReset || !isControlled
  const handleReset = () => {
    onReset?.()
    if (!isControlled) {
      setInternalValue(DEFAULT_FILTERS)
    }
  }

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
                className={sheetOverlayBlurDark}
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'tween', duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className={`${bottomSheetContainerBase} flex flex-col`}
                style={{ height: '62dvh', willChange: 'transform' }}
              >
                <DialogPrimitive.Title className="sr-only">Filtros avançados</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">Escolha filtros para refinar os resultados da busca.</DialogPrimitive.Description>

                <div className={bottomSheetHandleWrap}>
                  <div className={bottomSheetHandleBar} />
                </div>

                <div className="px-4 py-3 border-b border-border/60 bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/70 flex items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    disabled={!canReset}
                    className="h-9 px-2 text-sm"
                  >
                    Limpar
                  </Button>
                  <h2 className="flex-1 text-center text-lg font-semibold">Filtros</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onOpenChange?.(false)}
                    aria-label="Fechar filtros"
                    className="rounded-full"
                  >
                    <X size={18} />
                  </Button>
                </div>

                <div className="px-2 py-2 overflow-y-auto" style={{ height: 'calc(62dvh - 66px - 84px)' }}>
                  <div className="mx-2 space-y-3">
                    <div className="rounded-xl border border-border/70 bg-card/40 backdrop-blur">
                      {FILTER_ITEMS.slice(0, 4).map(({ key, label, Icon, iconClassName }) => (
                        <div key={key} className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => onPickItem?.(key)}
                            className="w-full flex items-center gap-3 text-left"
                          >
                            <Icon size={20} className={iconClassName || 'text-muted-foreground'} />
                            <span className="flex-1 text-base font-medium">{label}</span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                          </button>

                          {key === 'profession' && (
                            <div className="mt-3">
                              <Input
                                value={String(v.profession || '')}
                                onChange={(e) => update({ profession: e.target.value })}
                                placeholder="Ex: Eletricista"
                                className="h-10 rounded-lg bg-background"
                              />
                            </div>
                          )}

                          {key === 'location' && (
                            <div className="mt-3 space-y-3">
                              <Input
                                value={String(v.location || '')}
                                onChange={(e) => update({ location: e.target.value })}
                                placeholder="Cidade, bairro..."
                                className="h-10 rounded-lg bg-background"
                              />

                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-foreground">Perto de mim</p>
                                  {!canUseNearMe && (
                                    <p className="text-xs text-muted-foreground">Faça login para usar sua localização salva.</p>
                                  )}
                                </div>
                                <Switch
                                  checked={!!v.nearMe}
                                  onCheckedChange={(checked) => {
                                    if (!canUseNearMe) return
                                    update({ nearMe: !!checked })
                                  }}
                                  disabled={!canUseNearMe}
                                />
                              </div>

                              <div className={cn('space-y-2', !v.nearMe && 'opacity-50 pointer-events-none')}>
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-medium text-foreground">Distância</p>
                                  <p className="text-sm text-muted-foreground">{Number(v.radiusKm || 10)} km</p>
                                </div>
                                <Slider
                                  value={[Number(v.radiusKm || 10)]}
                                  min={1}
                                  max={50}
                                  step={1}
                                  onValueChange={(vals) => {
                                    const next = Number(vals?.[0])
                                    update({ radiusKm: Number.isFinite(next) ? next : 10 })
                                  }}
                                />
                                <div className="flex gap-2 pt-1">
                                  {[3, 5, 10, 25].map((km) => (
                                    <Button
                                      key={km}
                                      type="button"
                                      variant={Number(v.radiusKm || 10) === km ? 'default' : 'secondary'}
                                      size="sm"
                                      className="h-8 px-3 rounded-full text-xs"
                                      onClick={() => update({ radiusKm: km })}
                                    >
                                      {km} km
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {key === 'rating' && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {ratingOptions.map((opt) => (
                                <Button
                                  key={opt.value}
                                  type="button"
                                  variant={Number(v.minRating || 0) === opt.value ? 'default' : 'secondary'}
                                  size="sm"
                                  className="h-8 px-3 rounded-full text-xs"
                                  onClick={() => update({ minRating: opt.value })}
                                >
                                  {opt.label}
                                </Button>
                              ))}
                            </div>
                          )}

                          {key === 'price' && (
                            <div className="mt-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-foreground">Faixa de preço</p>
                                <p className="text-sm text-muted-foreground">
                                  {hasAnyPriceFilter || priceUnit
                                    ? `R$ ${priceRange[0]} - R$ ${priceRange[1]}${prettyUnit ? ` / ${prettyUnit}` : ''}`
                                    : 'Qualquer'}
                                </p>
                              </div>
                              <Slider
                                value={priceRange}
                                min={0}
                                max={500}
                                step={5}
                                onValueChange={(vals) => update({ priceRange: normalizePriceRange(vals, [0, 500]) })}
                              />

                              <div className="w-full overflow-x-auto overscroll-x-contain touch-pan-x pt-1 scrollbar-hide">
                                <div className="flex gap-2 w-max pb-0 pr-2">
                                  {priceUnitOptions.map((opt) => (
                                    <Button
                                      key={opt.value || 'any'}
                                      type="button"
                                      variant={String(v.priceUnit || '') === opt.value ? 'default' : 'secondary'}
                                      size="sm"
                                      className="h-8 px-3 rounded-full text-xs whitespace-nowrap"
                                      onClick={() => update({ priceUnit: opt.value })}
                                    >
                                      {opt.label}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-border/70 bg-card/40 backdrop-blur divide-y divide-border/50">
                      <div className="px-4 py-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Circle size={20} className="text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-base font-medium text-foreground">Disponível agora</p>
                            <p className="text-xs text-muted-foreground">Mostra somente itens ativos</p>
                          </div>
                        </div>
                        <Switch
                          checked={!!v.availableNow}
                          onCheckedChange={(checked) => update({ availableNow: !!checked })}
                        />
                      </div>

                      <div className="px-4 py-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <AlertTriangle size={20} className="text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-base font-medium text-foreground">Emergência</p>
                            <p className="text-xs text-muted-foreground">Mostra serviços de emergência</p>
                          </div>
                        </div>
                        <Switch
                          checked={!!v.emergency}
                          onCheckedChange={(checked) => update({ emergency: !!checked })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-4 border-t border-border/60 bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/70">
                  <Button
                    className="w-full h-12 rounded-xl text-base"
                    onClick={() => onApply?.(v)}
                  >
                    Aplicar filtros
                  </Button>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}
