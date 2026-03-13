import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { commentApi } from '@/lib/commentApi'
import { supabase } from '@/lib/supabaseClient'
import { useCommentsMeta } from '@/contexts/CommentsMetaContext'
import { useAuth } from '@/contexts/AuthContext'

const sortCommentsTop = (list) => {
  return [...(list || [])].sort((a, b) => {
    const la = Number(a?.likes_count) || 0
    const lb = Number(b?.likes_count) || 0
    if (lb !== la) return lb - la
    const da = a?.created_at ? new Date(a.created_at).getTime() : 0
    const db = b?.created_at ? new Date(b.created_at).getTime() : 0
    return db - da
  })
}

const normalizeComment = (row, { likedByMe = false } = {}) => {
  const likesCount = Number(row?.likes_count)
  const repliesCount = Number(row?.replies_count)

  return {
    ...row,
    content: row?.content ?? '',
    created_at: row?.created_at,
    likes_count: Number.isFinite(likesCount) ? likesCount : 0,
    replies_count: Number.isFinite(repliesCount) ? repliesCount : 0,
    likedByMe,
  }
}

const COMMENTS_CACHE = new Map()
const cacheKeyFor = ({ contentType, contentId, sort }) => `${String(contentType)}:${String(contentId)}:${String(sort)}`

const COUNTS_CACHE = new Map()
const countKeyFor = ({ contentType, contentId }) => `count:${String(contentType)}:${String(contentId)}`

export const prefetchCommentsCount = async ({ contentId, contentType } = {}) => {
  try {
    if (!contentId || !contentType) return
    if (contentType !== 'video' && contentType !== 'photo') return

    const cacheKey = countKeyFor({ contentType, contentId })
    const cached = COUNTS_CACHE.get(cacheKey)
    const ttlMs = 45_000
    if (cached && Date.now() - (Number(cached.ts) || 0) < ttlMs) {
      return { totalCount: Number(cached.totalCount) || 0 }
    }

    const videoId = contentType === 'video' ? contentId : null
    const photoId = contentType === 'photo' ? contentId : null

    const { count, error } = await commentApi.getTotalCommentsCount({ videoId, photoId })
    if (error) return

    const totalCount = Number(count) || 0
    COUNTS_CACHE.set(cacheKey, { totalCount, ts: Date.now() })
    return { totalCount }
  } catch {
    // ignore
  }
}

export const prefetchComments = async ({ contentId, contentType, sort = 'new', userId = null } = {}) => {
  try {
    if (!contentId || !contentType) return
    if (contentType !== 'video' && contentType !== 'photo') return

    const cacheKey = cacheKeyFor({ contentType, contentId, sort })
    const cached = COMMENTS_CACHE.get(cacheKey)
    const ttlMs = 30_000
    if (cached?.comments?.length && Date.now() - (Number(cached.ts) || 0) < ttlMs) {
      return { totalCount: Number(cached?.totalCount) || 0 }
    }

    const videoId = contentType === 'video' ? contentId : null
    const photoId = contentType === 'photo' ? contentId : null

    const features = await commentApi.getFeatures()

    const listPromise = commentApi.listComments({
      videoId,
      photoId,
      parentId: null,
      limit: 20,
      offset: 0,
      sort,
    })

    const totalPromise = commentApi.getTotalCommentsCount({ videoId, photoId })

    const [{ data, error }, totalRes] = await Promise.all([listPromise, totalPromise])
    if (error) return

    const rows = data || []
    const ids = rows.map((c) => c.id).filter(Boolean)

    let likedIds = []
    let countsById = new Map()
    if (features.likes && ids.length) {
      const [likedRes, countsRes] = await Promise.all([
        commentApi.getLikedCommentIds(ids, { userId }),
        commentApi.getCommentLikeCounts(ids),
      ])
      likedIds = likedRes?.data || []
      if (!countsRes?.error) countsById = countsRes?.data || new Map()
    }

    let normalized = rows.map((row) => {
      const base = normalizeComment(row, { likedByMe: likedIds.includes(row.id) })
      if (features.likes) {
        const c = countsById.get(row.id)
        if (c !== undefined) return { ...base, likes_count: c }
      }
      return base
    })

    if (sort === 'top') normalized = sortCommentsTop(normalized)

    const computedTotal = totalRes && !totalRes?.error ? Number(totalRes?.count) || 0 : normalized.length
    COMMENTS_CACHE.set(cacheKey, {
      comments: normalized,
      totalCount: computedTotal,
      hasMore: rows.length === 20,
      ts: Date.now(),
    })

    return { totalCount: computedTotal }
  } catch {
    // best-effort prefetch; ignore
  }
}

export const useComments = ({ contentId, contentType, enabled }) => {
  const videoId = contentType === 'video' ? contentId : null
  const photoId = contentType === 'photo' ? contentId : null

  const commentsMeta = useCommentsMeta()
  const { user: currentUser } = useAuth()

  const [features, setFeatures] = useState({ replies: false, likes: false })

  const [sort, setSort] = useState('new') // 'new' | 'top'

  const [comments, setComments] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const [posting, setPosting] = useState(false)

  const [repliesByParentId, setRepliesByParentId] = useState({})
  const [repliesLoading, setRepliesLoading] = useState({})

  const subscriptionRef = useRef(null)
  const seenIdsRef = useRef(new Set())

  const cacheKey = useMemo(() => {
    if (!contentId || !contentType) return null
    return cacheKeyFor({ contentType, contentId, sort })
  }, [contentId, contentType, sort])

  useEffect(() => {
    // New content: reset dedupe tracker
    seenIdsRef.current = new Set()
  }, [contentId, contentType])

  const count = useMemo(() => comments.length, [comments])

  const refreshFeatures = useCallback(async () => {
    const f = await commentApi.getFeatures()
    setFeatures(f)
    return f
  }, [])

  const refresh = useCallback(
    async ({ keepExisting = false, silent = false } = {}) => {
      if (!enabled || !contentId || !contentType) return

      if (!silent) setLoading(true)
      try {
        const { data, error } = await commentApi.listComments({
          videoId,
          photoId,
          parentId: null,
          limit: 20,
          offset: 0,
          sort,
        })

        if (error) throw error

        const rows = data || []
        const ids = rows.map((c) => c.id).filter(Boolean)

        const likedIdsPromise =
          features.likes && ids.length
            ? commentApi.getLikedCommentIds(ids, { userId: currentUser?.id || null })
            : null
        const countsPromise = features.likes && ids.length ? commentApi.getCommentLikeCounts(ids) : null
        const totalPromise = !keepExisting ? commentApi.getTotalCommentsCount({ videoId, photoId }) : null

        let likedIds = []
        let countsById = new Map()
        if (likedIdsPromise && countsPromise) {
          const [likedRes, countsRes] = await Promise.all([likedIdsPromise, countsPromise])
          likedIds = likedRes?.data || []
          if (!countsRes?.error) countsById = countsRes?.data || new Map()
        }

        let normalized = rows.map((row) => {
          const base = normalizeComment(row, { likedByMe: likedIds.includes(row.id) })
          if (features.likes) {
            const c = countsById.get(row.id)
            if (c !== undefined) return { ...base, likes_count: c }
          }
          return base
        })

        if (sort === 'top') normalized = sortCommentsTop(normalized)

        // Track IDs we've already seen (avoid double-counting realtime)
        for (const c of normalized) {
          if (c?.id) seenIdsRef.current.add(c.id)
        }

        setComments(keepExisting ? (prev) => [...prev, ...normalized] : normalized)
        const nextHasMore = (data || []).length === 20
        setHasMore(nextHasMore)

        if (!keepExisting) {
          const totalRes = totalPromise ? await totalPromise : null
          const computedTotal = totalRes && !totalRes?.error ? Number(totalRes?.count) || 0 : normalized.length
          setTotalCount(computedTotal)

          if (contentId && (contentType === 'video' || contentType === 'photo')) {
            commentsMeta.setCount(contentType, contentId, computedTotal)
          }

          if (cacheKey) {
            COMMENTS_CACHE.set(cacheKey, {
              comments: normalized,
              totalCount: computedTotal,
              hasMore: nextHasMore,
              ts: Date.now(),
            })
          }
        } else if (cacheKey) {
          const cached = COMMENTS_CACHE.get(cacheKey)
          if (cached?.comments) {
            COMMENTS_CACHE.set(cacheKey, {
              ...cached,
              comments: [...cached.comments, ...normalized],
              hasMore: nextHasMore,
              ts: Date.now(),
            })
          }
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [cacheKey, contentId, contentType, currentUser?.id, enabled, features.likes, photoId, sort, videoId]
  )

  const loadMore = useCallback(async () => {
    if (!enabled || loadingMore || loading || !hasMore) return

    setLoadingMore(true)
    try {
      const offset = comments.length
      const { data, error } = await commentApi.listComments({
        videoId,
        photoId,
        parentId: null,
        limit: 20,
        offset,
        sort,
      })

      if (error) throw error

      const rows = data || []
      const ids = rows.map((c) => c.id).filter(Boolean)

      const likedIdsPromise =
        features.likes && ids.length
          ? commentApi.getLikedCommentIds(ids, { userId: currentUser?.id || null })
          : null
      const countsPromise = features.likes && ids.length ? commentApi.getCommentLikeCounts(ids) : null

      let likedIds = []
      let countsById = new Map()
      if (likedIdsPromise && countsPromise) {
        const [likedRes, countsRes] = await Promise.all([likedIdsPromise, countsPromise])
        likedIds = likedRes?.data || []
        if (!countsRes?.error) countsById = countsRes?.data || new Map()
      }

      const normalized = rows.map((row) => {
        const base = normalizeComment(row, { likedByMe: likedIds.includes(row.id) })
        if (features.likes) {
          const c = countsById.get(row.id)
          if (c !== undefined) return { ...base, likes_count: c }
        }
        return base
      })

      let nextForCache = null
      setComments((prev) => {
        const next = [...prev, ...normalized]
        nextForCache = sort === 'top' ? sortCommentsTop(next) : next
        return nextForCache
      })
      const nextHasMore = rows.length === 20
      setHasMore(nextHasMore)

      if (cacheKey && nextForCache) {
        const cached = COMMENTS_CACHE.get(cacheKey)
        COMMENTS_CACHE.set(cacheKey, {
          comments: nextForCache,
          totalCount: Number.isFinite(Number(cached?.totalCount)) ? Number(cached.totalCount) : totalCount,
          hasMore: nextHasMore,
          ts: Date.now(),
        })
      }
    } finally {
      setLoadingMore(false)
    }
  }, [cacheKey, comments.length, currentUser?.id, enabled, features.likes, hasMore, loading, loadingMore, photoId, sort, totalCount, videoId])

  const postComment = useCallback(
    async ({ content, parentId = null }) => {
      if (!enabled || !content?.trim()) return { data: null, error: null }

      setPosting(true)
      try {
        const { data, error } = await commentApi.addComment({
          videoId,
          photoId,
          parentId,
          content: content.trim(),
        })

        if (error) throw error

        if (!data) return { data: null, error: null }

        if (data?.id) seenIdsRef.current.add(data.id)

        // Optimistic insert at top
        if (!parentId) {
          setComments((prev) => [normalizeComment(data, { likedByMe: false }), ...prev])
        } else {
          setRepliesByParentId((prev) => {
            const list = prev[parentId] || []
            return {
              ...prev,
              [parentId]: [normalizeComment(data, { likedByMe: false }), ...list],
            }
          })

          // Update replies_count in UI if supported
          setComments((prev) =>
            prev.map((c) => (c.id === parentId ? { ...c, replies_count: (c.replies_count || 0) + 1 } : c))
          )
        }

        // IMPORTANT: don't do optimistic +1 here.
        // The realtime INSERT can arrive before addComment returns, causing a temporary +2.
        // Instead, sync from the exact DB count after the insert succeeds.
        try {
          const totalRes = await commentApi.getTotalCommentsCount({ videoId, photoId })
          if (!totalRes?.error) {
            const computedTotal = Number(totalRes?.count) || 0
            setTotalCount(computedTotal)

            if (contentId && (contentType === 'video' || contentType === 'photo')) {
              commentsMeta.setCount(contentType, contentId, computedTotal)
            }

            if (cacheKey) {
              const cached = COMMENTS_CACHE.get(cacheKey)
              if (cached?.comments) {
                COMMENTS_CACHE.set(cacheKey, {
                  ...cached,
                  totalCount: computedTotal,
                })
              }
            }
          }
        } catch {
          // ignore
        }

        return { data, error: null }
      } catch (error) {
        return { data: null, error }
      } finally {
        setPosting(false)
      }
    },
    [cacheKey, commentsMeta, contentId, contentType, enabled, photoId, videoId]
  )

  const removeComment = useCallback(async (commentId) => {
    const { error } = await commentApi.deleteComment(commentId)
    if (error) return { error }

    setComments((prev) => prev.filter((c) => c.id !== commentId))
    try {
      seenIdsRef.current.delete(commentId)
    } catch {
      // ignore
    }
    setTotalCount((prev) => Math.max(0, (Number(prev) || 0) - 1))
    return { error: null }
  }, [])

  const toggleLike = useCallback(
    async (comment) => {
      if (!features.likes) return { error: null, featureUnsupported: true }

      const shouldLike = !comment?.likedByMe

      // Optimistic
      setComments((prev) =>
        prev.map((c) =>
          c.id === comment.id
            ? {
                ...c,
                likedByMe: shouldLike,
                likes_count: Math.max(0, (c.likes_count || 0) + (shouldLike ? 1 : -1)),
              }
            : c
        )
      )

      const res = shouldLike ? await commentApi.likeComment(comment.id) : await commentApi.unlikeComment(comment.id)

      if (res?.featureUnsupported) {
        // revert and hide likes
        setFeatures((f) => ({ ...f, likes: false }))
        setComments((prev) =>
          prev.map((c) => (c.id === comment.id ? { ...c, likedByMe: false, likes_count: c.likes_count } : c))
        )
        return { error: null, featureUnsupported: true }
      }

      if (res?.error) {
        // revert
        setComments((prev) =>
          prev.map((c) =>
            c.id === comment.id
              ? {
                  ...c,
                  likedByMe: !shouldLike,
                  likes_count: Math.max(0, (c.likes_count || 0) + (shouldLike ? -1 : 1)),
                }
              : c
          )
        )
        return { error: res.error }
      }

      // Sync with the TOTAL REAL count (avoid drift if comments.likes_count is stale)
      try {
        const countsRes = await commentApi.getCommentLikeCounts([comment.id])
        const c = countsRes?.data?.get?.(comment.id)
        if (c !== undefined) {
          setComments((prev) => prev.map((x) => (x.id === comment.id ? { ...x, likes_count: c } : x)))
        }
      } catch {
        // ignore
      }

      return { error: null }
    },
    [features.likes]
  )

  const loadReplies = useCallback(
    async (parentId) => {
      if (!enabled || !features.replies) return

      setRepliesLoading((prev) => ({ ...prev, [parentId]: true }))
      try {
        const { data, error } = await commentApi.listComments({
          videoId,
          photoId,
          parentId,
          limit: 50,
          offset: 0,
          sort: 'new',
        })

        if (error) throw error

        const rows = data || []
        const ids = rows.map((c) => c.id).filter(Boolean)

        let likedIds = []
        let countsById = new Map()
        if (features.likes && ids.length) {
          const likedRes = await commentApi.getLikedCommentIds(ids, { userId: currentUser?.id || null })
          likedIds = likedRes?.data || []

          const countsRes = await commentApi.getCommentLikeCounts(ids)
          if (!countsRes?.error) countsById = countsRes?.data || new Map()
        }

        setRepliesByParentId((prev) => ({
          ...prev,
          [parentId]: rows.map((row) => {
            const base = normalizeComment(row, { likedByMe: likedIds.includes(row.id) })
            if (features.likes) {
              const c = countsById.get(row.id)
              if (c !== undefined) return { ...base, likes_count: c }
            }
            return base
          }),
        }))

        for (const r of rows || []) {
          if (r?.id) seenIdsRef.current.add(r.id)
        }
      } finally {
        setRepliesLoading((prev) => ({ ...prev, [parentId]: false }))
      }
    },
    [currentUser?.id, enabled, features.likes, features.replies, photoId, videoId]
  )

  const startRealtime = useCallback(() => {
    if (!enabled || !contentId || subscriptionRef.current) return

    const filter = videoId ? `video_id=eq.${videoId}` : photoId ? `photo_id=eq.${photoId}` : null
    if (!filter) return

    subscriptionRef.current = supabase
      .channel(`comments:${contentType}:${contentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
          filter,
        },
        async (payload) => {
          const newId = payload?.new?.id
          if (!newId) return

          // Keep total count (includes replies) but don't double-count.
          if (seenIdsRef.current.has(newId)) return
          seenIdsRef.current.add(newId)
          setTotalCount((prev) => Math.max(0, (Number(prev) || 0) + 1))

          // Only handle top-level inserts when possible
          if (payload?.new?.parent_id) return

          // Try with profile embed, but fall back if RLS blocks joins.
          let data = null
          const r1 = await supabase
            .from('comments')
            .select('*, user:profiles(id, name, avatar, profession, username)')
            .eq('id', payload.new.id)
            .single()
          if (!r1?.error) data = r1?.data
          else {
            const r2 = await supabase.from('comments').select('*').eq('id', payload.new.id).single()
            if (!r2?.error) data = r2?.data
          }

          if (!data) return

          setComments((prev) => {
            if (prev.some((c) => c.id === data.id)) return prev
            return [normalizeComment(data, { likedByMe: false }), ...prev]
          })
        }
      )
      .subscribe()
  }, [contentId, contentType, enabled, photoId, videoId])

  const stopRealtime = useCallback(() => {
    const sub = subscriptionRef.current
    subscriptionRef.current = null
    if (!sub) return

    try {
      Promise.resolve(sub?.unsubscribe?.()).catch(() => {})
    } catch {
      // ignore
    }

    try {
      Promise.resolve(supabase?.removeChannel?.(sub)).catch(() => {})
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    // Hydrate instantly from cache (per content+sort) and refresh in background.
    if (cacheKey) {
      const cached = COMMENTS_CACHE.get(cacheKey)
      if (cached?.comments?.length) {
        setComments(cached.comments)
        if (Number.isFinite(Number(cached.totalCount))) setTotalCount(Number(cached.totalCount))
        for (const c of cached.comments) {
          if (c?.id) seenIdsRef.current.add(c.id)
        }
        setHasMore(!!cached.hasMore)
        setLoading(false)
      }
    }

    refreshFeatures().finally(() => {
      const cached = cacheKey ? COMMENTS_CACHE.get(cacheKey) : null
      refresh({ silent: !!(cached?.comments?.length) })
      startRealtime()
    })

    return () => {
      stopRealtime()
    }
  }, [enabled, refresh, refreshFeatures, startRealtime, stopRealtime])

  useEffect(() => {
    if (!enabled) return
    // If we already have cached data for this sort, refresh silently.
    const cached = cacheKey ? COMMENTS_CACHE.get(cacheKey) : null
    refresh({ silent: !!(cached?.comments?.length) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort])

  return {
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
    refresh,
    loadMore,
    postComment,
    removeComment,
    toggleLike,
    repliesByParentId,
    repliesLoading,
    loadReplies,
  }
}
