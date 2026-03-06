import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/use-toast'
import { MessageCircle, MoreVertical, X } from 'lucide-react'
import { useComments } from '@/hooks/useComments'
import { getProfileDisplayName } from '@/lib/profileDisplay'
import { CommentComposer } from './CommentComposer'
import { CommentItem } from './CommentItem'
import { RepliesThread } from './RepliesThread'

const CommentSkeleton = () => {
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-full bg-muted animate-pulse mt-1" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="h-3 w-28 rounded bg-muted animate-pulse" />
          <div className="h-3 w-16 rounded bg-muted animate-pulse" />
        </div>
        <div className="mt-2 space-y-2">
          <div className="h-3 w-[92%] rounded bg-muted animate-pulse" />
          <div className="h-3 w-[70%] rounded bg-muted animate-pulse" />
        </div>
      </div>
    </div>
  )
}

export const CommentsSheet = ({ open, onOpenChange, contentId, contentType, onCountChange }) => {
  const { user: currentUser } = useAuth()
  const { toast } = useToast()

  const [keyboardInset, setKeyboardInset] = useState(0)
  const [replyTo, setReplyTo] = useState(null)
  const composerRef = useRef(null)

  const enabled = !!open && !!contentId && !!contentType

  const {
    comments,
    count,
    totalCount,
    loading,
    loadingMore,
    hasMore,
    posting,
    sort,
    setSort,
    features,
    loadMore,
    postComment,
    removeComment,
    toggleLike,
    repliesByParentId,
    repliesLoading,
    loadReplies,
  } = useComments({ contentId, contentType, enabled })

  const title = useMemo(() => {
    const n = Number.isFinite(Number(totalCount)) ? Number(totalCount) : Number(count) || 0
    return `${n} ${n === 1 ? 'comentário' : 'comentários'}`
  }, [count, totalCount])

  const onCountChangeRef = useRef(onCountChange)
  const lastReportedRef = useRef({ key: '', n: null })

  useEffect(() => {
    onCountChangeRef.current = onCountChange
  }, [onCountChange])

  useEffect(() => {
    if (!enabled) return
    const cb = onCountChangeRef.current
    if (typeof cb !== 'function') return
    const n = Number.isFinite(Number(totalCount)) ? Number(totalCount) : Number(count) || 0
    const key = `${contentType || ''}:${contentId || ''}`
    if (lastReportedRef.current.key === key && lastReportedRef.current.n === n) return
    lastReportedRef.current = { key, n }
    cb(n)
  }, [count, enabled, totalCount, contentId, contentType])

  useEffect(() => {
    if (!open) setReplyTo(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!replyTo) return
    const id = window.setTimeout(() => {
      try {
        composerRef.current?.focus?.()
      } catch {
        // ignore
      }
    }, 0)
    return () => window.clearTimeout(id)
  }, [open, replyTo])

  const handlePost = async (text) => {
    if (!currentUser) {
      toast({
        title: 'Login necessário',
        description: 'Você precisa estar logado para comentar.',
        variant: 'destructive',
      })
      return
    }

    const { error } = await postComment({ content: text })
    if (error) {
      const msg = String(error?.message || error || '').trim()
      toast({
        title: 'Erro',
        description: msg ? `Não foi possível publicar o comentário. ${msg}` : 'Não foi possível publicar o comentário.',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async (commentId) => {
    const { error } = await removeComment(commentId)
    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível deletar o comentário.',
        variant: 'destructive',
      })
      return
    }

    toast({
      title: 'Comentário deletado',
      description: 'O comentário foi removido com sucesso.',
    })
  }

  const handleReply = async (parentId, text) => {
    if (!currentUser) {
      toast({
        title: 'Login necessário',
        description: 'Você precisa estar logado para responder.',
        variant: 'destructive',
      })
      return
    }

    const { error } = await postComment({ content: text, parentId })
    if (error) {
      const msg = String(error?.message || error || '').trim()
      toast({
        title: 'Erro',
        description: msg ? `Não foi possível publicar a resposta. ${msg}` : 'Não foi possível publicar a resposta.',
        variant: 'destructive',
      })
    }
  }

  const beginReply = (parentComment) => {
    if (!currentUser) {
      toast({
        title: 'Login necessário',
        description: 'Você precisa estar logado para responder.',
        variant: 'destructive',
      })
      return
    }

    const display = getProfileDisplayName(parentComment?.user)

    setReplyTo({
      parentId: parentComment?.id,
      display,
    })
  }

  const submitComposer = async (text) => {
    if (replyTo?.parentId) {
      await handleReply(replyTo.parentId, text)
      setReplyTo(null)
      return
    }
    await handlePost(text)
  }

  // Keep the sheet above the mobile keyboard (Android/iOS) without hardcoding.
  useEffect(() => {
    if (!open) {
      setKeyboardInset(0)
      return
    }

    const vv = window.visualViewport
    if (!vv) return

    let raf = 0
    const update = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // visualViewport.height shrinks when keyboard is shown; innerHeight may not.
        const inset = Math.max(0, Math.round((window.innerHeight || 0) - (vv.height || 0) - (vv.offsetTop || 0)))
        setKeyboardInset(inset)
      })
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    window.addEventListener('resize', update)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [open])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild>
              <motion.div
                // Use percentage-based translate to avoid jank on different screen heights
                // and remove spring bounce for a smoother "sheet" feel.
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'tween', duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="fixed z-[10001] left-0 right-0 bottom-0 mx-auto w-full max-w-2xl bg-background rounded-t-2xl border border-border shadow-2xl flex flex-col"
                style={{
                  height: '78dvh',
                  // Don't move the whole sheet up (that makes the white panel jump).
                  // Keep it anchored and only add inner padding so the composer stays visible.
                  paddingBottom: keyboardInset
                    ? `calc(env(safe-area-inset-bottom) + ${keyboardInset}px)`
                    : 'env(safe-area-inset-bottom)',
                  willChange: 'transform',
                }}
              >
                <DialogPrimitive.Title className="sr-only">Comentários</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">Lista de comentários e campo para comentar.</DialogPrimitive.Description>

                {/* Handle */}
                <div className="pt-2 flex justify-center">
                  <div className="h-1 w-12 rounded-full bg-muted" />
                </div>

                {/* Header */}
                <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-shrink-0">
                  <MessageCircle size={18} className="text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{title}</p>
                    <p className="text-xs text-muted-foreground">
                      {sort === 'top' ? 'Principais' : 'Mais recentes'}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Ordenar comentários">
                        <MoreVertical size={18} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => setSort('top')}>Principais</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setSort('new')}>Mais recentes</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button variant="ghost" size="icon" onClick={() => onOpenChange?.(false)} aria-label="Fechar">
                    <X size={18} />
                  </Button>
                </div>

                {/* Body */}
                <div
                  className="px-4 py-4 overflow-y-auto flex-1"
                  style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
                >
                  {comments.length > 0 ? (
                    <div className="space-y-4">
                      {loading && (
                        <div className="-mt-1 mb-2">
                          <p className="text-[11px] text-muted-foreground">Atualizando…</p>
                        </div>
                      )}
                      {comments.map((c) => (
                        <div key={c.id}>
                          <CommentItem
                            comment={c}
                            currentUserId={currentUser?.id}
                            onLike={toggleLike}
                            likesEnabled={features.likes}
                            onDelete={handleDelete}
                          />

                          {features.replies && (
                            <RepliesThread
                              parent={c}
                              replies={repliesByParentId[c.id] || []}
                              loading={!!repliesLoading[c.id]}
                              currentUser={currentUser}
                              canReply={!!currentUser}
                              onLoad={() => loadReplies(c.id)}
                              onReplyRequest={beginReply}
                              onLike={toggleLike}
                              likesEnabled={features.likes}
                              onDelete={handleDelete}
                            />
                          )}
                        </div>
                      ))}

                      {hasMore && (
                        <div className="pt-2">
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={loadMore}
                            disabled={loadingMore}
                          >
                            {loadingMore ? 'Carregando...' : 'Carregar mais'}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : loading ? (
                    <div className="py-2">
                      <div className="space-y-4">
                        {Array.from({ length: 6 }).map((_, idx) => (
                          <CommentSkeleton key={idx} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-10">
                      <MessageCircle size={34} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Nenhum comentário ainda</p>
                      <p className="text-xs">Seja o primeiro a comentar!</p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-4 py-4 border-t border-border bg-background flex-shrink-0">
                  {replyTo?.parentId && (
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground truncate">
                        Respondendo a <span className="font-medium text-foreground">{replyTo.display}</span>
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setReplyTo(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}

                  <CommentComposer
                    ref={composerRef}
                    currentUser={currentUser}
                    submitting={posting}
                    onSubmit={submitComposer}
                    placeholder={replyTo?.parentId ? 'Responder...' : 'Adicione um comentário...'}
                    autoFocus={!!replyTo?.parentId}
                  />
                  {!features.likes && !features.replies && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Dica: para curtir/responder comentários, aplique o SQL de migração.
                    </p>
                  )}
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}
