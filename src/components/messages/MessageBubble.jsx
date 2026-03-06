import React from 'react'
import { Check, CheckCheck } from 'lucide-react'
import { useResolvedStorageUrl } from '@/lib/storageUrl'

const extractFirstUrl = (text) => {
  const t = String(text || '')
  const m = t.match(/(storage:\/\/[^\s]+|https?:\/\/[^\s]+)/i)
  return m ? m[1] : ''
}

const formatBytes = (bytes) => {
  const n = Number(bytes || 0)
  if (!Number.isFinite(n) || n <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  const idx = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const value = n / Math.pow(1024, idx)
  const rounded = value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)
  return `${rounded} ${units[idx]}`
}

const MessageBubble = ({ message, onRetry, layout = 'bubble' }) => {
  const isMe = message.sender === 'me'
  const isRead = Boolean(message?.read_at || message?.is_read)
  const sendState = String(message?._send_state || '')
  const isSending = sendState === 'sending'
  const isFailed = sendState === 'failed'
  const canRetry = Boolean(isFailed && typeof onRetry === 'function')

  const attachmentRaw =
    (typeof message?.attachment_url === 'string' && message.attachment_url.trim()) ||
    extractFirstUrl(message?.text)

  const attachmentUrl = useResolvedStorageUrl(attachmentRaw, {
    debugLabel: 'msg-attachment',
  })

  const attachmentName =
    (typeof message?.attachment_name === 'string' && message.attachment_name.trim()) ||
    ''

  const attachmentType =
    (typeof message?.attachment_type === 'string' && message.attachment_type.trim()) ||
    ''

  const mimeType = (typeof message?.mime_type === 'string' && message.mime_type.trim()) || ''
  const attachmentSize = message?.attachment_size

  const isImageAttachment =
    attachmentType === 'image' ||
    attachmentType.toLowerCase().startsWith('image/') ||
    mimeType.toLowerCase().startsWith('image/')

  const isPdfAttachment =
    attachmentType === 'pdf' ||
    mimeType.toLowerCase() === 'application/pdf' ||
    attachmentName.toLowerCase().endsWith('.pdf')

  const hasText = Boolean(String(message?.text || '').trim())

  const Meta = () => (
    <div
      className={`flex items-center gap-1 flex-shrink-0 whitespace-nowrap ${
        isMe ? 'text-foreground/60' : 'text-muted-foreground'
      }`}
    >
      <span className="text-xs">{message.timestamp}</span>
      {isMe && (
        <span className="flex-shrink-0">
          {isRead ? (
            <CheckCheck size={14} className="text-blue-400" />
          ) : (
            <Check size={14} className="opacity-60" />
          )}
        </span>
      )}
    </div>
  )

  const isField = layout === 'field'

  return (
    <div
      className={`flex ${isField ? 'justify-stretch' : isMe ? 'justify-end' : 'justify-start'} mb-2`}
    >
      <div
        onClick={canRetry ? onRetry : undefined}
        role={canRetry ? 'button' : undefined}
        tabIndex={canRetry ? 0 : undefined}
        onKeyDown={
          canRetry
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onRetry?.()
                }
              }
            : undefined
        }
        className={
          isField
            ? `w-full rounded-2xl border border-border/50 bg-card/70 px-3 py-3 shadow-sm ${
                canRetry ? 'cursor-pointer' : ''
              }`
            : `max-w-[70%] sm:max-w-[60%] rounded-2xl px-3 py-2 shadow-sm ${
                isMe
                  ? 'bg-primary/10 text-foreground'
                  : 'bg-card text-foreground border border-border/50'
              } ${canRetry ? 'cursor-pointer' : ''}`
        }
      >
        {hasText ? (
          <div className="flex items-end justify-between gap-2">
            <p className="min-w-0 flex-1 text-base leading-snug break-words">{message.text}</p>
            <Meta />
          </div>
        ) : null}

        {attachmentUrl || attachmentName || isSending || isFailed ? (
          <div className={`mt-2 rounded-lg p-2 ${isMe ? 'bg-muted/40' : 'bg-muted/40'}`}>
            {isImageAttachment ? (
              attachmentUrl ? (
                <a href={attachmentUrl} target="_blank" rel="noreferrer" className="block">
                  <img
                    src={attachmentUrl}
                    alt={attachmentName || 'Anexo'}
                    className="max-h-48 w-auto rounded-md"
                    loading="lazy"
                  />
                </a>
              ) : (
                <div className="h-32 w-48 max-w-full rounded-md bg-muted" />
              )
            ) : isPdfAttachment ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {attachmentName || 'Documento PDF'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(attachmentSize) || 'PDF'}
                  </div>
                </div>
                {attachmentUrl ? (
                  <a
                    href={attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm underline text-foreground whitespace-nowrap"
                  >
                    Abrir
                  </a>
                ) : null}
              </div>
            ) : attachmentUrl ? (
              <a
                href={attachmentUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm underline text-foreground"
              >
                📎 {attachmentName || 'Abrir anexo'}
              </a>
            ) : (
              <div className="text-sm text-muted-foreground">Arquivo</div>
            )}
          </div>
        ) : null}

        {isSending ? (
          <div className={`mt-1 text-xs ${isMe ? 'text-foreground/60' : 'text-muted-foreground'}`}>
            Enviando…
          </div>
        ) : null}

        {isFailed ? (
          <div className="mt-1 text-xs text-destructive">
            Falha — tocar para reenviar
          </div>
        ) : null}

        {!hasText ? (
          <div className="mt-1 flex items-center justify-end">
            <Meta />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default MessageBubble
