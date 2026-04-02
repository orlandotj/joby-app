import React, { useId, useState, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Send, Paperclip } from 'lucide-react'

const MessageInput = ({ onSendMessage, onSendFile, onTyping }) => {
  const [messageText, setMessageText] = useState('')
  const fileInputRef = useRef(null)
  const textInputRef = useRef(null)
  const messageTextRef = useRef('')
  const submitNonceRef = useRef(0)
  const fileInputId = useId()

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

      // Reset input (permite escolher o mesmo arquivo novamente)
      try {
        e.target.value = ''
      } catch (_e) {
        // ignore
      }

      if (!onSendFile) return

      try {
        await onSendFile(file, { description: '' })
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
  }

  const openNativeAttachPicker = () => {
    try {
      fileInputRef.current?.click?.()
    } catch (_e) {
      // ignore
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-2 sm:p-2.5">
      <div className="flex items-center gap-2 sm:gap-3 bg-background rounded-full border-2 border-border shadow-lg px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0 h-9 w-9 sm:h-10 sm:w-10 text-muted-foreground hover:text-primary hover:bg-transparent rounded-full"
          type="button"
          onClick={openNativeAttachPicker}
          title="Enviar arquivo"
        >
          <Paperclip size={18} className="sm:size-5" />
        </Button>

        {/* Hidden picker (single, reliable flow) */}
        <input
          id={fileInputId}
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="sr-only"
          accept="image/*,video/*,application/pdf"
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
    </form>
  )
}

export default MessageInput
