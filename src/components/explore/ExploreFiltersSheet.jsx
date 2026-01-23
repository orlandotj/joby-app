import React from 'react'
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

const FILTER_ITEMS = [
  { key: 'profession', label: 'Profissão', Icon: Briefcase },
  { key: 'location', label: 'Localização', Icon: MapPin },
  { key: 'rating', label: 'Avaliação', Icon: Star },
  { key: 'price', label: 'Preço', Icon: DollarSign },
  { key: 'available_now', label: 'Disponível agora', Icon: Circle, iconClassName: 'text-green-500' },
  { key: 'emergency', label: 'Emergência', Icon: AlertTriangle, iconClassName: 'text-orange-500' },
]

export const ExploreFiltersSheet = ({ open, onOpenChange, onPickItem, onApply }) => {
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
                className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ y: 600 }}
                animate={{ y: 0 }}
                exit={{ y: 600 }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="fixed z-[10001] left-0 right-0 bottom-0 mx-auto w-full max-w-2xl bg-background rounded-t-2xl border border-border shadow-2xl"
                style={{ height: '62vh' }}
              >
                <DialogPrimitive.Title className="sr-only">Filtros avançados</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">Escolha filtros para refinar os resultados da busca.</DialogPrimitive.Description>

                <div className="pt-2 flex justify-center">
                  <div className="h-1 w-12 rounded-full bg-muted" />
                </div>

                <div className="px-4 py-4 border-b border-border flex items-center">
                  <div className="w-10" />
                  <h2 className="flex-1 text-center text-lg font-semibold">Filtros avançados</h2>
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

                <div className="px-2 py-2 overflow-y-auto" style={{ height: 'calc(62vh - 66px - 84px)' }}>
                  <div className="mx-2 rounded-xl border border-border/70 bg-card/40 backdrop-blur">
                    {FILTER_ITEMS.map(({ key, label, Icon, iconClassName }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onPickItem?.(key)}
                        className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-accent/30 transition-colors"
                      >
                        <Icon size={20} className={iconClassName || 'text-muted-foreground'} />
                        <span className="flex-1 text-base font-medium">{label}</span>
                        <ChevronRight size={18} className="text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="px-4 py-4 border-t border-border bg-background">
                  <Button
                    className="w-full h-12 rounded-xl text-base"
                    onClick={() => onApply?.()}
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
