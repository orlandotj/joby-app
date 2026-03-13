import React, { useEffect, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, X } from 'lucide-react'
import { useOverlayLock } from '@/hooks/useOverlayLock'

const DEFAULT_TITLE = 'Cronômetro'

const WorkDetailsModal = ({
  open,
  title = DEFAULT_TITLE,
  onClose,
  children,
  closeOnOutside = true,
  closeOnEsc = true,
  showHeader = true,
}) => {
  const mounted = typeof document !== 'undefined'

  useOverlayLock(!!open)

  useEffect(() => {
    if (!open) return
    if (!closeOnEsc) return
    if (!mounted) return

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closeOnEsc, mounted, onClose])

  const portalTarget = useMemo(() => {
    if (!mounted) return null
    return document.body
  }, [mounted])

  if (!portalTarget) return null

  return ReactDOM.createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[10050] bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (!closeOnOutside) return
            if (e.target !== e.currentTarget) return
            onClose?.()
          }}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            className="h-full w-full flex items-center justify-center p-3 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <motion.div
              className="relative w-full max-w-lg max-h-[92vh] rounded-3xl bg-background border border-border/60 shadow-2xl overflow-hidden flex flex-col"
              initial={{ y: 18, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 18, scale: 0.98, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            >
              {!showHeader ? (
                <button
                  type="button"
                  className="absolute top-2 right-2 z-20 h-10 w-10 rounded-full bg-background/70 backdrop-blur border border-border/60 hover:bg-background/90 flex items-center justify-center"
                  onClick={() => onClose?.()}
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              ) : (
                <div className="border-b border-border/60 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70">
                  <div className="h-12 px-3 flex items-center justify-between">
                    <button
                      type="button"
                      className="h-10 w-10 rounded-full hover:bg-muted/40 flex items-center justify-center"
                      onClick={() => onClose?.()}
                      aria-label="Voltar"
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </button>

                    <div className="text-sm font-semibold text-foreground truncate">{title}</div>

                    <button
                      type="button"
                      className="h-10 w-10 rounded-full hover:bg-muted/40 flex items-center justify-center"
                      onClick={() => onClose?.()}
                      aria-label="Fechar"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="w-full flex-1 overflow-y-auto">{children}</div>
            </motion.div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    portalTarget
  )
}

export default WorkDetailsModal
