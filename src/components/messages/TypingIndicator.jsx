import React from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useResolvedStorageUrl } from '@/lib/storageUrl'

const TypingIndicator = ({ user }) => {
  const avatarSrc = useResolvedStorageUrl(user?.avatar)

  return (
    <div className="flex items-center gap-2 mb-4 animate-in fade-in slide-in-from-left-2">
      <Avatar className="h-8 w-8">
        <AvatarImage src={avatarSrc} alt={user?.name} />
        <AvatarFallback className="bg-muted text-xs">
          {user?.name?.charAt(0)?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      <div className="bg-card border border-border/50 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm">
        <div className="flex gap-1">
          <div
            className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
            style={{ animationDelay: '0ms' }}
          />
          <div
            className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
            style={{ animationDelay: '150ms' }}
          />
          <div
            className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      </div>
    </div>
  )
}

export default TypingIndicator
