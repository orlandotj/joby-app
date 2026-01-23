import React, { useState, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Send, Paperclip } from 'lucide-react'

const MessageInput = ({ onSendMessage, onSendFile, onTyping }) => {
  const [messageText, setMessageText] = useState('')
  const fileInputRef = useRef(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (messageText.trim()) {
      onSendMessage(messageText)
      setMessageText('')
    }
  }

  const handleInputChange = (e) => {
    setMessageText(e.target.value)
    if (onTyping) {
      onTyping()
    }
  }

  const handleFileClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e) => {
    const files = e.target.files
    if (files && files.length > 0) {
      Array.from(files).forEach((file) => {
        if (onSendFile) {
          onSendFile(file)
        }
      })
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-2 sm:p-2.5">
      <div className="flex items-center gap-2 sm:gap-3 bg-background rounded-full border-2 border-border shadow-lg px-2 py-1.5">
        <Button
          type="button"
          onClick={handleFileClick}
          variant="ghost"
          size="icon"
          className="flex-shrink-0 h-9 w-9 sm:h-10 sm:w-10 text-muted-foreground hover:text-primary hover:bg-transparent rounded-full"
          title="Enviar arquivo"
        >
          <Paperclip size={18} className="sm:size-5" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          className="hidden"
          accept="*/*"
        />
        <Input
          placeholder="Digite sua mensagem..."
          value={messageText}
          onChange={handleInputChange}
          className="flex-1 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-sm sm:text-base h-9 sm:h-10 px-2"
          autoComplete="off"
        />
        <Button
          type="submit"
          disabled={!messageText.trim()}
          size="icon"
          className="flex-shrink-0 h-9 w-9 sm:h-10 sm:w-10 bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 rounded-full shadow-md"
        >
          <Send size={18} className="sm:size-5" />
        </Button>
      </div>
    </form>
  )
}

export default MessageInput
