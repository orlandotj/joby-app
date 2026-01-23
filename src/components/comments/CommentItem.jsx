import React, { useMemo } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ThumbsUp, Trash2 } from 'lucide-react'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { formatTimeAgoPtBR } from './commentsUtils'

const getInitial = (name) => (name ? String(name).trim().charAt(0).toUpperCase() : '?')

export const CommentItem = ({ comment, currentUserId, onLike, likesEnabled, onDelete, isReply = false }) => {
  const avatarSrc = useResolvedStorageUrl(comment?.user?.avatar || '')

  const displayName = useMemo(() => {
    return comment?.user?.name || comment?.user?.username || 'Usuário'
  }, [comment?.user?.name, comment?.user?.username])

  const timeAgo = useMemo(() => formatTimeAgoPtBR(comment?.created_at), [comment?.created_at])

  const canDelete = comment?.user_id && currentUserId && comment.user_id === currentUserId

  return (
    <div className="flex gap-3">
      <Avatar className={isReply ? 'h-7 w-7 mt-1' : 'h-8 w-8 mt-1'}>
        <AvatarImage src={avatarSrc} alt={displayName} />
        <AvatarFallback className="bg-muted text-xs">{getInitial(displayName)}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-xs truncate">{displayName}</p>
          {timeAgo ? <span className="text-[11px] text-muted-foreground">{timeAgo}</span> : null}
        </div>

        <p className="text-sm break-words mt-0.5">{comment?.content}</p>

        <div className="flex items-center gap-1 mt-1">
          {likesEnabled && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1"
              onClick={() => onLike?.(comment)}
              aria-label={comment?.likedByMe ? 'Remover like' : 'Dar like'}
            >
              <ThumbsUp
                size={14}
                className={comment?.likedByMe ? 'fill-primary text-primary' : 'text-muted-foreground'}
              />
              <span className="text-xs text-muted-foreground">{comment?.likes_count || 0}</span>
            </Button>
          )}

          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete?.(comment?.id)}
              aria-label="Deletar comentário"
            >
              <Trash2 size={14} />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
