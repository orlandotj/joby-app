import React from 'react'
import { Check, CheckCheck } from 'lucide-react'

const MessageBubble = ({ message }) => {
  const isMe = message.sender === 'me'

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[70%] sm:max-w-[60%] rounded-2xl p-3 shadow-sm ${
          isMe
            ? 'bg-primary text-primary-foreground rounded-br-none'
            : 'bg-card text-foreground border border-border/50 rounded-bl-none'
        }`}
      >
        <p className="text-sm break-words">{message.text}</p>
        <div
          className={`flex items-center justify-end gap-1 mt-1 ${
            isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'
          }`}
        >
          <span className="text-xs">{message.timestamp}</span>
          {isMe && (
            <span className="flex-shrink-0">
              {message.read_at ? (
                <CheckCheck size={14} className="text-blue-400" />
              ) : (
                <Check size={14} className="opacity-60" />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default MessageBubble
