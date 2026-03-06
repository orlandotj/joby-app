import React, { useMemo, useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send } from 'lucide-react'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { getProfileDisplayName, getProfileInitial } from '@/lib/profileDisplay'

export const CommentComposer = React.forwardRef(function CommentComposer(
  {
  currentUser,
  placeholder = 'Adicione um comentário...',
  submitting,
  onSubmit,
  compact = true,
    autoFocus = false,
  },
  ref
) {
  const [value, setValue] = useState('')
  const avatarSrc = useResolvedStorageUrl(currentUser?.avatar || '')
  const displayName = useMemo(() => getProfileDisplayName(currentUser), [currentUser])

  const canSend = useMemo(() => !!value.trim() && !submitting, [submitting, value])

  const submit = async () => {
    if (!value.trim() || submitting) return
    const text = value.trim()
    setValue('')
    await onSubmit?.(text)
  }

  return (
    <div className="flex items-start gap-3">
      <Avatar className={compact ? 'h-8 w-8 mt-1' : 'h-9 w-9 mt-1'}>
        <AvatarImage src={avatarSrc} alt={displayName} />
        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
          {getProfileInitial(currentUser)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 flex gap-2">
        <Textarea
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={compact ? 'resize-none flex-1 min-h-[44px]' : 'resize-none flex-1 min-h-[56px]'}
          rows={2}
          ref={ref}
          autoFocus={autoFocus}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <Button
          onClick={submit}
          size="icon"
          disabled={!canSend}
          className="self-end flex-shrink-0"
          aria-label="Enviar comentário"
        >
          {submitting ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
          ) : (
            <Send size={18} />
          )}
        </Button>
      </div>
    </div>
  )
})
