import React, { useId, useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Send,
  Paperclip,
  Image as ImageIcon,
  Video as VideoIcon,
  FileText,
} from 'lucide-react'

const MessageInput = ({ onSendMessage, onSendFile, onTyping }) => {
  const [messageText, setMessageText] = useState('')
  const [isAttachSheetOpen, setIsAttachSheetOpen] = useState(false)
  const [isAttachComposeOpen, setIsAttachComposeOpen] = useState(false)
  const [pendingAttachFile, setPendingAttachFile] = useState(null)
  const [attachDescription, setAttachDescription] = useState('')
  const [attachAnchorBottom, setAttachAnchorBottom] = useState(96)
  const fileInputRef = useRef(null)
  const imageInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const pdfInputRef = useRef(null)
  const textInputRef = useRef(null)
  const composerRef = useRef(null)
  const attachButtonRef = useRef(null)
  const attachDescInputRef = useRef(null)
  const messageTextRef = useRef('')
  const submitNonceRef = useRef(0)
  const fileInputId = useId()
  const imageInputId = useId()
  const videoInputId = useId()
  const pdfInputId = useId()
  const [attachMenuPos, setAttachMenuPos] = useState({ left: 12, bottom: 140 })

  const handleSubmit = async (e) => {
    e.preventDefault()
    const text = messageTextRef.current
    if (!text.trim()) return

    // UX: envia instantâneo (não espera a rede para limpar o input)
    const nonce = (submitNonceRef.current += 1)
    messageTextRef.current = ''
    setMessageText('')

    // Mobile/Android: ao clicar no botão enviar, o foco pode ir para o botão e fechar o teclado.
    // Reforçamos o foco de volta no input.
    requestAnimationFrame(() => {
      try {
        textInputRef.current?.focus?.()
      } catch (_e) {
        // ignore
      }
    })

    const result = await onSendMessage?.(text)

    // Se falhou, restaurar o texto SOMENTE se o usuário não digitou nada depois.
    if (result?.ok === false) {
      if (submitNonceRef.current === nonce && !messageTextRef.current) {
        messageTextRef.current = text
        setMessageText(text)
      }
      return
    }
  }

  const handleInputChange = (e) => {
    const v = e.target.value
    messageTextRef.current = v
    setMessageText(v)
    if (onTyping) {
      onTyping()
    }
  }

  const handleFileChange = async (e) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      setIsAttachSheetOpen(false)
      setPendingAttachFile(file)
      setAttachDescription('')
      setIsAttachComposeOpen(true)

      // Reset input
      try {
        e.target.value = ''
      } catch (_e) {
        // ignore
      }
    }
  }

  const openPicker = (type) => {
    try {
      if (type === 'image') imageInputRef.current?.click?.()
      else if (type === 'video') videoInputRef.current?.click?.()
      else if (type === 'pdf') pdfInputRef.current?.click?.()
    } catch (_e) {
      // ignore
    }
  }

  const recomputeAttachAnchor = () => {
    try {
      const el = composerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vh =
        typeof window !== 'undefined'
          ? Number(window.visualViewport?.height || window.innerHeight || 0)
          : 0

      // Anchor the sheet exactly to the TOP of the composer (no gap)
      const bottom = Math.max(0, Math.round(vh - rect.top))
      setAttachAnchorBottom(bottom)

      // Position the attach menu near the paperclip button
      const btn = attachButtonRef.current
      const vw =
        typeof window !== 'undefined'
          ? Number(window.visualViewport?.width || window.innerWidth || 0)
          : 0
      if (btn && vw > 0 && vh > 0) {
        const b = btn.getBoundingClientRect()
        const desiredLeft = Math.round(b.left)
        const maxLeft = Math.max(8, vw - 240)
        const left = Math.max(8, Math.min(desiredLeft, maxLeft))
        const bottomForMenu = Math.max(0, Math.round(vh - (b.top - 10)))
        setAttachMenuPos({ left, bottom: bottomForMenu })
      }
    } catch (_e) {
      // ignore
    }
  }

  const openAttachSheet = () => {
    setIsAttachSheetOpen(true)
    requestAnimationFrame(() => recomputeAttachAnchor())
  }

  const toggleAttachSheet = () => {
    if (isAttachSheetOpen) {
      setIsAttachSheetOpen(false)
      return
    }
    openAttachSheet()
  }

  useEffect(() => {
    if (!isAttachSheetOpen && !isAttachComposeOpen) return

    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    const onResize = () => recomputeAttachAnchor()
    window.addEventListener('resize', onResize)
    vv?.addEventListener?.('resize', onResize)
    vv?.addEventListener?.('scroll', onResize)

    // One more tick for Android keyboard animations
    const t = setTimeout(() => recomputeAttachAnchor(), 120)

    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', onResize)
      vv?.removeEventListener?.('resize', onResize)
      vv?.removeEventListener?.('scroll', onResize)
    }
  }, [isAttachSheetOpen, isAttachComposeOpen])

  useEffect(() => {
    if (!isAttachComposeOpen) return
    requestAnimationFrame(() => {
      try {
        attachDescInputRef.current?.focus?.()
      } catch (_e) {
        // ignore
      }
    })
  }, [isAttachComposeOpen])

  const closeAttachCompose = () => {
    setIsAttachComposeOpen(false)
    setPendingAttachFile(null)
    setAttachDescription('')
    requestAnimationFrame(() => {
      try {
        textInputRef.current?.focus?.()
      } catch (_e) {
        // ignore
      }
    })
  }

  const submitAttachCompose = async () => {
    const file = pendingAttachFile
    if (!file || !onSendFile) {
      closeAttachCompose()
      return
    }

    // Fecha o sheet imediatamente (UX), mas mantém o envio rodando.
    setIsAttachComposeOpen(false)
    setPendingAttachFile(null)
    const description = String(attachDescription || '').trim()
    setAttachDescription('')

    try {
      await onSendFile(file, { description })
    } finally {
      requestAnimationFrame(() => {
        try {
          textInputRef.current?.focus?.()
        } catch (_e) {
          // ignore
        }
      })
    }
  }

  return (
    <form ref={composerRef} onSubmit={handleSubmit} className="p-2 sm:p-2.5">
      <div className="flex items-center gap-2 sm:gap-3 bg-background rounded-full border-2 border-border shadow-lg px-2 py-1.5">
        <Button
          ref={attachButtonRef}
          variant="ghost"
          size="icon"
          className="flex-shrink-0 h-9 w-9 sm:h-10 sm:w-10 text-muted-foreground hover:text-primary hover:bg-transparent rounded-full"
          type="button"
          onClick={toggleAttachSheet}
          title="Enviar arquivo"
        >
          <Paperclip size={18} className="sm:size-5" />
        </Button>

        {/* Hidden pickers (single, reliable flow) */}
        <input
          id={fileInputId}
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="sr-only"
          accept="*/*"
        />
        <input
          id={imageInputId}
          ref={imageInputRef}
          type="file"
          onChange={handleFileChange}
          className="sr-only"
          accept="image/*"
        />
        <input
          id={videoInputId}
          ref={videoInputRef}
          type="file"
          onChange={handleFileChange}
          className="sr-only"
          accept="video/*"
        />
        <input
          id={pdfInputId}
          ref={pdfInputRef}
          type="file"
          onChange={handleFileChange}
          className="sr-only"
          accept="application/pdf"
        />
        <Input
          ref={textInputRef}
          placeholder="Digite sua mensagem..."
          value={messageText}
          onChange={handleInputChange}
          className="flex-1 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-base sm:text-lg h-10 sm:h-11 px-2"
          autoComplete="off"
        />
        <Button
          type="submit"
          disabled={!messageText.trim()}
          size="icon"
          tabIndex={-1}
          onMouseDown={(e) => {
            // Desktop: evita focar o botão (mantém comportamento de chat)
            e.preventDefault()
          }}
          onTouchStart={() => {
            // Mobile/Android: garante que o input continue focado (teclado não fecha)
            try {
              textInputRef.current?.focus?.()
            } catch (_e) {
              // ignore
            }
          }}
          className="flex-shrink-0 h-9 w-9 sm:h-10 sm:w-10 bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 rounded-full shadow-md"
        >
          <Send size={18} className="sm:size-5" />
        </Button>
      </div>

      {/* Floating attach menu (Profile FAB style) */}
      <AnimatePresence>
        {isAttachSheetOpen ? (
          <div className="fixed inset-0 z-[60] pointer-events-none">
            <div
              className="absolute inset-0 bg-transparent pointer-events-auto"
              onClick={() => setIsAttachSheetOpen(false)}
              style={{ bottom: `${attachAnchorBottom}px` }}
            />

            <motion.div
              className="pointer-events-auto flex flex-col items-center space-y-2"
              initial={{ scale: 0.98, opacity: 0, y: 6 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 6 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              style={{ position: 'absolute', left: `${attachMenuPos.left}px`, bottom: `${attachMenuPos.bottom}px` }}
            >
              {[
                { icon: <ImageIcon size={20} />, label: 'Foto', type: 'image' },
                { icon: <VideoIcon size={20} />, label: 'Vídeo', type: 'video' },
                { icon: <FileText size={20} />, label: 'Documento', type: 'pdf' },
              ].map((opt) => (
                <div key={opt.type} className="flex items-center">
                  <Button
                    size="icon"
                    className="rounded-full h-10 w-10 joby-gradient-alt text-primary-foreground shadow-md"
                    type="button"
                    onClick={() => {
                      openPicker(opt.type)
                      setIsAttachSheetOpen(false)
                    }}
                  >
                    {opt.icon}
                  </Button>
                  <span className="text-xs bg-card text-card-foreground px-2 py-1 rounded-md shadow-sm ml-2">
                    {opt.label}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      {/* Pre-send description sheet */}
      {isAttachComposeOpen ? (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-background/60"
            onClick={closeAttachCompose}
            style={{ bottom: `${attachAnchorBottom}px` }}
          />

          <div className="absolute inset-x-0 px-3 sm:px-0" style={{ bottom: `${attachAnchorBottom}px` }}>
            <div className="mx-auto w-full max-w-sm sm:max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
              <div className="px-4 py-3">
                <div className="text-sm font-semibold text-foreground">Adicionar descrição</div>
                <div className="mt-1 text-xs text-muted-foreground truncate">
                  {pendingAttachFile?.name || 'Arquivo'}
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="p-3">
                <Input
                  ref={attachDescInputRef}
                  placeholder="Escreva uma descrição (opcional)"
                  value={attachDescription}
                  onChange={(e) => setAttachDescription(e.target.value)}
                  className="w-full bg-background"
                  autoComplete="off"
                />
                <div className="mt-3 flex items-center gap-2">
                  <Button type="button" variant="ghost" className="flex-1" onClick={closeAttachCompose}>
                    Cancelar
                  </Button>
                  <Button type="button" className="flex-1" onClick={submitAttachCompose}>
                    Enviar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  )
}

export default MessageInput
