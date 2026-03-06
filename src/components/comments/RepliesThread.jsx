import React, { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { CommentItem } from './CommentItem'

export const RepliesThread = ({
  parent,
  replies,
  loading,
  currentUser,
  canReply,
  onToggle,
  onLoad,
  onReplyRequest,
  onLike,
  likesEnabled,
  onDelete,
}) => {
  const [open, setOpen] = useState(false)

  const label = useMemo(() => {
    const n = Number(parent?.replies_count) || 0
    if (n <= 0) return 'Responder'
    return open ? 'Ocultar respostas' : `Ver ${n} ${n === 1 ? 'resposta' : 'respostas'}`
  }, [open, parent?.replies_count])

  const toggle = async () => {
    const next = !open
    setOpen(next)
    onToggle?.(next)
    if (next && onLoad) await onLoad()
  }

  const requestReply = () => {
    if (!canReply) return
    onReplyRequest?.(parent)
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        {Number(parent?.replies_count) > 0 ? (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={toggle}>
            {open ? <ChevronUp size={16} className="mr-1" /> : <ChevronDown size={16} className="mr-1" />}
            {label}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={requestReply}>
            {label}
          </Button>
        )}

        {Number(parent?.replies_count) > 0 && canReply && (
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={requestReply}>
            Responder
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-2 pl-11 space-y-3">
          {loading ? (
            <div className="text-xs text-muted-foreground py-2">Carregando respostas...</div>
          ) : (replies || []).length > 0 ? (
            (replies || []).map((r) => (
              <CommentItem
                key={r.id}
                comment={r}
                currentUserId={currentUser?.id}
                onLike={onLike}
                likesEnabled={likesEnabled}
                onDelete={onDelete}
                isReply
              />
            ))
          ) : (
            <div className="text-xs text-muted-foreground py-2">Nenhuma resposta ainda.</div>
          )}
        </div>
      )}
    </div>
  )
}
