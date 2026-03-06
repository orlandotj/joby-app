import React from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { getProfileDisplayName, getProfileInitial } from '@/lib/profileDisplay'

const TypingIndicator = ({ user }) => {
  const avatarSrc = useResolvedStorageUrl(user?.avatar)
  const displayName = getProfileDisplayName(user)
  const initial = getProfileInitial(user)

  return (
    <div className="flex items-center gap-2 mb-4 animate-in fade-in slide-in-from-left-2">
      <Avatar className="h-8 w-8">
        <AvatarImage src={avatarSrc} alt={displayName} />
        <AvatarFallback className="bg-muted text-xs">
          {initial}
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
