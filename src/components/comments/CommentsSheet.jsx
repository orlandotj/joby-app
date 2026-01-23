import React, { useMemo, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/use-toast'
import { MessageCircle, MoreVertical, X } from 'lucide-react'
import { useComments } from '@/hooks/useComments'
import { CommentComposer } from './CommentComposer'
import { CommentItem } from './CommentItem'
import { RepliesThread } from './RepliesThread'

export const CommentsSheet = ({ open, onOpenChange, contentId, contentType }) => {
  const { user: currentUser } = useAuth()
  const { toast } = useToast()

  const enabled = !!open && !!contentId && !!contentType

  const {
    comments,
    count,
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
    const n = Number(count) || 0
    return `${n} ${n === 1 ? 'comentário' : 'comentários'}`
  }, [count])

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
      toast({
        title: 'Erro',
        description: 'Não foi possível publicar o comentário.',
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
      toast({
        title: 'Erro',
        description: 'Não foi possível publicar a resposta.',
        variant: 'destructive',
      })
    }
  }

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
                initial={{ y: 600 }}
                animate={{ y: 0 }}
                exit={{ y: 600 }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="fixed z-[10001] left-0 right-0 bottom-0 mx-auto w-full max-w-2xl bg-background rounded-t-2xl border border-border shadow-2xl"
                style={{ height: '78vh' }}
              >
                <DialogPrimitive.Title className="sr-only">Comentários</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">Lista de comentários e campo para comentar.</DialogPrimitive.Description>

                {/* Handle */}
                <div className="pt-2 flex justify-center">
                  <div className="h-1 w-12 rounded-full bg-muted" />
                </div>

                {/* Header */}
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
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
                <div className="px-4 py-4 overflow-y-auto" style={{ height: 'calc(78vh - 56px - 92px)' }}>
                  {loading ? (
                    <div className="text-center text-muted-foreground py-10">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
                      <p className="text-sm">Carregando comentários...</p>
                    </div>
                  ) : comments.length > 0 ? (
                    <div className="space-y-4">
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
                              onReply={(text) => handleReply(c.id, text)}
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
                  ) : (
                    <div className="text-center text-muted-foreground py-10">
                      <MessageCircle size={34} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Nenhum comentário ainda</p>
                      <p className="text-xs">Seja o primeiro a comentar!</p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-4 py-4 border-t border-border bg-background">
                  <CommentComposer currentUser={currentUser} submitting={posting} onSubmit={handlePost} />
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
