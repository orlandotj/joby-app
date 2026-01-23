import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Eye, MessageCircle, Play, Plus, Check, ThumbsUp, Volume2, VolumeX } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { getProfileDisplayName, getProfileInitial } from '@/lib/profileDisplay'
import { asInt, formatCompactNumber } from '@/lib/numberFormat'
import { CommentsSheet } from '@/components/comments/CommentsSheet'
import { checkVideoLike, getVideoLikesCount, likeVideo, unlikeVideo } from '@/services/commentService'
import { incrementVideoView } from '@/services/viewService'
import { searchVideos } from '@/services/exploreSearchService'

const uniqueById = (items) => {
  const seen = new Set()
  const out = []
  for (const it of items || []) {
    const key = String(it?.id ?? '')
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

const ReelSlide = ({
  video,
  author,
  active,
  muted,
  onToggleMuted,
  onRequestComments,
  onTap,
}) => {
  const { toast } = useToast()
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()

  const videoRef = useRef(null)
  const viewedOnceRef = useRef(false)

  const videoSrc = useResolvedStorageUrl(video?.url, { provider: video?.provider })
  const posterSrc = useResolvedStorageUrl(video?.thumbnail || '', { provider: video?.provider })

  const avatarSrc = useResolvedStorageUrl(author?.avatar || '')
  const displayName = useMemo(() => getProfileDisplayName(author), [author])
  const initial = useMemo(() => getProfileInitial(author), [author])

  const descriptionText = useMemo(() => {
    return String(video?.description || video?.title || '').trim()
  }, [video?.description, video?.title])

  const commentsCount = asInt(video?.comments_count ?? video?.comments ?? 0)

  const [isPlaying, setIsPlaying] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(asInt(video?.likes_count ?? video?.likes ?? 0))
  const [viewCount, setViewCount] = useState(asInt(video?.views_count ?? video?.views ?? 0))

  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)

  // Reset when swapping
  useEffect(() => {
    viewedOnceRef.current = false
    setIsPlaying(false)
    setLiked(false)
    setLikeCount(asInt(video?.likes_count ?? video?.likes ?? 0))
    setViewCount(asInt(video?.views_count ?? video?.views ?? 0))
  }, [video?.id])

  // Apply mute state
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.muted = !!muted
  }, [muted])

  // Auto play/pause on active
  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    if (active) {
      el.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false))
    } else {
      if (!el.paused) el.pause()
      setIsPlaying(false)
    }
  }, [active, videoSrc])

  // Increment view once when becomes active
  useEffect(() => {
    if (!active) return
    if (!video?.id) return
    if (viewedOnceRef.current) return
    viewedOnceRef.current = true

    ;(async () => {
      try {
        const { views } = await incrementVideoView(video.id)
        if (typeof views === 'number') setViewCount(views)
        else setViewCount((prev) => prev + 1)
      } catch {
        setViewCount((prev) => prev + 1)
      }
    })()
  }, [active, video?.id])

  // Load like state when becomes active (cheap)
  useEffect(() => {
    if (!active) return
    if (!video?.id) return

    let cancelled = false
    ;(async () => {
      try {
        const [{ liked: isLiked }, { count }] = await Promise.all([
          checkVideoLike(video.id),
          getVideoLikesCount(video.id),
        ])
        if (cancelled) return
        setLiked(!!isLiked)
        if (typeof count === 'number') setLikeCount(count)
      } catch {
        // ignore
      }
    })()

    return () => {
      cancelled = true
    }
  }, [active, video?.id])

  // Load follow state
  useEffect(() => {
    if (!active) return
    if (!currentUser?.id) {
      setIsFollowing(false)
      return
    }
    if (!author?.id || currentUser.id === author.id) {
      setIsFollowing(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const { supabase } = await import('@/lib/supabaseClient')
        const { data } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', currentUser.id)
          .eq('following_id', author.id)
          .maybeSingle()
        if (cancelled) return
        setIsFollowing(!!data)
      } catch {
        if (cancelled) return
        setIsFollowing(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [active, author?.id, currentUser?.id])

  const togglePlay = useCallback(() => {
    const el = videoRef.current
    if (!el) return

    if (el.paused || el.ended) {
      el.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
    } else {
      el.pause()
      setIsPlaying(false)
    }
  }, [])

  const toggleLike = useCallback(
    async (e) => {
      e?.stopPropagation?.()
      if (!video?.id) return

      if (!currentUser) {
        toast({
          title: 'Login necessário',
          description: 'Você precisa estar logado para curtir.',
          variant: 'destructive',
        })
        return
      }

      const nextLiked = !liked
      setLiked(nextLiked)
      setLikeCount((prev) => Math.max(0, prev + (nextLiked ? 1 : -1)))

      try {
        if (nextLiked) {
          const { error } = await likeVideo(video.id)
          if (error) throw error
        } else {
          const { error } = await unlikeVideo(video.id)
          if (error) throw error
        }

        const { count } = await getVideoLikesCount(video.id)
        if (typeof count === 'number') setLikeCount(count)
      } catch (error) {
        setLiked((prev) => !prev)
        setLikeCount((prev) => Math.max(0, prev + (nextLiked ? -1 : 1)))
        toast({
          title: 'Erro ao curtir',
          description: error?.message || 'Tente novamente.',
          variant: 'destructive',
        })
      }
    },
    [currentUser, liked, toast, video?.id]
  )

  const handleFollow = useCallback(
    async (e) => {
      e?.stopPropagation?.()
      if (followLoading) return

      if (!author?.id) return

      if (!currentUser?.id) {
        toast({
          title: 'Login necessário',
          description: 'Você precisa estar logado para seguir.',
          variant: 'destructive',
        })
        navigate('/login')
        return
      }

      if (currentUser.id === author.id) return

      if (isFollowing) return

      setFollowLoading(true)
      try {
        const { supabase } = await import('@/lib/supabaseClient')
        const { error } = await supabase.from('follows').insert([
          {
            follower_id: currentUser.id,
            following_id: author.id,
          },
        ])
        if (error) throw error

        setIsFollowing(true)
        toast({
          title: 'Seguindo!',
          description: 'Agora você está seguindo este perfil.',
        })
      } catch (error) {
        toast({
          title: 'Erro',
          description: error?.message || 'Não foi possível seguir. Tente novamente.',
          variant: 'destructive',
        })
      } finally {
        setFollowLoading(false)
      }
    },
    [author?.id, currentUser?.id, followLoading, isFollowing, navigate, toast]
  )

  return (
    <div
      className="relative h-[100dvh] w-full overflow-hidden snap-start snap-always"
      onClick={() => {
        togglePlay()
        onTap?.()
      }}
    >
      <video
        ref={videoRef}
        src={videoSrc}
        poster={posterSrc || ''}
        className="h-full w-full object-cover"
        playsInline
        loop
        muted={muted}
        preload="metadata"
      />

      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/30 pointer-events-none" />

      <AnimatePresence>
        {!isPlaying && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          >
            <Play size={64} className="text-white/75 drop-shadow-lg" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions (right) */}
      <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-4">
        {/* Profile ABOVE like (no name here) */}
        <div className="relative">
          {author?.id ? (
            <Link
              to={`/profile/${author.id}`}
              onClick={(e) => e.stopPropagation()}
              className="block"
              aria-label="Abrir perfil"
            >
              <div className="h-12 w-12 rounded-full border-2 border-white/80 overflow-hidden bg-primary flex items-center justify-center">
                {avatarSrc ? (
                  <img src={avatarSrc} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-primary-foreground">{initial}</span>
                )}
              </div>
            </Link>
          ) : (
            <div className="h-12 w-12 rounded-full border-2 border-white/80 overflow-hidden bg-primary flex items-center justify-center">
              {avatarSrc ? (
                <img src={avatarSrc} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-primary-foreground">{initial}</span>
              )}
            </div>
          )}

          {/* Follow no canto do perfil (como na foto) */}
          {author?.id && currentUser?.id !== author.id && (
            <button
              type="button"
              onClick={handleFollow}
              disabled={followLoading}
              aria-label={isFollowing ? 'Seguindo' : 'Seguir'}
              className="absolute -bottom-1 -right-1"
            >
              {isFollowing ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white border-2 border-black/40 shadow">
                  <Check size={14} strokeWidth={3} />
                </span>
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white border-2 border-black/40 shadow">
                  <Plus size={14} strokeWidth={3} />
                </span>
              )}
            </button>
          )}
        </div>

        <button
          onClick={toggleLike}
          className="flex flex-col items-center text-white hover:scale-110 transition-transform"
          aria-label="Curtir"
        >
          <div className={`p-2.5 rounded-full ${liked ? 'bg-primary/25' : 'bg-black/45'} backdrop-blur-sm`}>
            <ThumbsUp size={20} className={liked ? 'text-primary fill-primary' : 'text-white'} />
          </div>
          <span className="text-[11px] font-semibold mt-1 drop-shadow-md">
            {formatCompactNumber(likeCount)}
          </span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation()
            onRequestComments?.(video)
          }}
          className="flex flex-col items-center text-white hover:scale-110 transition-transform"
          aria-label="Comentários"
        >
          <div className="p-2.5 rounded-full bg-black/45 backdrop-blur-sm">
            <MessageCircle size={20} />
          </div>
          <span className="text-[11px] font-semibold mt-1 drop-shadow-md">
            {formatCompactNumber(commentsCount)}
          </span>
        </button>

        <div className="flex flex-col items-center text-white" aria-label="Visualizações">
          <div className="p-2.5 rounded-full bg-black/45 backdrop-blur-sm">
            <Eye size={20} />
          </div>
          <span className="text-[11px] font-semibold mt-1 drop-shadow-md">
            {formatCompactNumber(viewCount)}
          </span>
        </div>
      </div>

      {/* Bottom text: name + description */}
      <div className="absolute left-3 right-16 bottom-4 z-20">
        <div className="text-white drop-shadow-lg">
          <p className="text-[13px] font-semibold leading-tight">{displayName}</p>
          {author?.profession ? (
            <p className="text-[12px] text-white/80 leading-tight mt-0.5">{author.profession}</p>
          ) : null}
          {descriptionText ? (
            <p className="text-[13px] mt-2 leading-snug line-clamp-3">{descriptionText}</p>
          ) : null}
        </div>
      </div>

      {/* Mute (top right for active slide only) */}
      {active && (
        <div className="absolute right-3 top-3 z-30">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full bg-black/35 hover:bg-black/55 text-white"
            onClick={(e) => {
              e.stopPropagation()
              onToggleMuted?.()
            }}
            aria-label={muted ? 'Ativar som' : 'Mutar'}
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </Button>
        </div>
      )}
    </div>
  )
}

export const ReelsFeedModal = ({
  open,
  onOpenChange,
  initialItems,
  initialIndex = 0,
  searchTerm = '',
  pageSize = 10,
}) => {
  const { toast } = useToast()

  const [items, setItems] = useState(() => uniqueById(initialItems || []))
  const [activeIndex, setActiveIndex] = useState(Math.max(0, Number(initialIndex) || 0))
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextPage, setNextPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [muted, setMuted] = useState(true)

  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentsTargetId, setCommentsTargetId] = useState(null)

  const containerRef = useRef(null)
  const lastLoadRef = useRef(0)

  const authorsByVideoId = useMemo(() => {
    const map = {}
    for (const it of items) {
      map[String(it?.id)] = it?.user || it?.author || null
    }
    return map
  }, [items])

  useEffect(() => {
    if (!open) return

    const normalized = uniqueById(initialItems || [])
    setItems(normalized)
    setActiveIndex(Math.max(0, Number(initialIndex) || 0))
    setLoadingMore(false)
    setNextPage(1)
    setHasMore(true)
    setMuted(true)
    setCommentsOpen(false)
    setCommentsTargetId(null)

    // Scroll to initial
    requestAnimationFrame(() => {
      const el = containerRef.current
      if (!el) return
      const h = window?.visualViewport?.height || window.innerHeight || el.clientHeight
      el.scrollTo({ top: (Number(initialIndex) || 0) * h, behavior: 'instant' })
    })
  }, [open, initialItems, initialIndex])

  const loadMore = useCallback(async () => {
    if (!open) return
    if (loadingMore) return
    if (!hasMore) return

    const now = Date.now()
    if (now - lastLoadRef.current < 600) return
    lastLoadRef.current = now

    setLoadingMore(true)
    try {
      const res = await searchVideos(String(searchTerm || ''), { limit: pageSize, page: nextPage })
      const newItems = (res?.data || []).map((v) => ({ ...v, type: 'video' }))
      if (newItems.length === 0) {
        setHasMore(false)
        return
      }
      setItems((prev) => uniqueById([...(prev || []), ...newItems]))
      setNextPage((p) => p + 1)
    } catch (e) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar mais Reels.',
        variant: 'destructive',
      })
    } finally {
      setLoadingMore(false)
    }
  }, [hasMore, loadingMore, nextPage, open, pageSize, searchTerm, toast])

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const h = window?.visualViewport?.height || window.innerHeight || el.clientHeight
    const idx = Math.round(el.scrollTop / Math.max(1, h))
    setActiveIndex(idx)

    if (idx >= items.length - 3) {
      loadMore()
    }
  }, [items.length, loadMore])

  const handleOpenComments = useCallback((video) => {
    const id = video?.id
    if (!id) return
    setCommentsTargetId(id)
    setCommentsOpen(true)
  }, [])

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
                className="fixed inset-0 z-[9999] bg-black"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[10000] h-[100dvh] w-full overflow-hidden bg-black"
              >
                <DialogPrimitive.Title className="sr-only">Reels</DialogPrimitive.Title>

                {/* Exit (fixed) */}
                <div className="absolute left-3 top-3 z-[10001]">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-full bg-black/35 hover:bg-black/55 text-white"
                    onClick={() => onOpenChange?.(false)}
                    aria-label="Sair"
                  >
                    <ArrowLeft size={20} />
                  </Button>
                </div>

                <div
                  ref={containerRef}
                  className="h-[100dvh] w-full overflow-y-scroll overscroll-none snap-y snap-mandatory scrollbar-hide touch-pan-y"
                  onScroll={handleScroll}
                >
                  {items.map((v, idx) => (
                    <ReelSlide
                      key={String(v.id)}
                      video={v}
                      author={authorsByVideoId[String(v.id)]}
                      active={idx === activeIndex}
                      muted={muted}
                      onToggleMuted={() => setMuted((m) => !m)}
                      onRequestComments={handleOpenComments}
                    />
                  ))}
                </div>

                {loadingMore && (
                  <div className="pointer-events-none absolute left-0 right-0 bottom-6 z-[10002] flex items-center justify-center">
                    <div className="rounded-full bg-black/55 px-3 py-2 text-xs text-white/90 backdrop-blur">
                      Carregando mais...
                    </div>
                  </div>
                )}

                <CommentsSheet
                  open={commentsOpen}
                  onOpenChange={setCommentsOpen}
                  contentId={commentsTargetId}
                  contentType="video"
                />
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}
