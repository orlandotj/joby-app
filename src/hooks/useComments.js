import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { commentApi } from '@/lib/commentApi'
import { supabase } from '@/lib/supabaseClient'

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

export const useComments = ({ contentId, contentType, enabled }) => {
  const videoId = contentType === 'video' ? contentId : null
  const photoId = contentType === 'photo' ? contentId : null

  const [features, setFeatures] = useState({ replies: false, likes: false })

  const [sort, setSort] = useState('new') // 'new' | 'top'

  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const [posting, setPosting] = useState(false)

  const [repliesByParentId, setRepliesByParentId] = useState({})
  const [repliesLoading, setRepliesLoading] = useState({})

  const subscriptionRef = useRef(null)

  const count = useMemo(() => comments.length, [comments])

  const refreshFeatures = useCallback(async () => {
    const f = await commentApi.getFeatures()
    setFeatures(f)
    return f
  }, [])

  const refresh = useCallback(
    async ({ keepExisting = false } = {}) => {
      if (!enabled || !contentId || !contentType) return

      setLoading(true)
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

        let likedIds = []
        if (ids.length) {
          const likedRes = await commentApi.getLikedCommentIds(ids)
          likedIds = likedRes?.data || []
        }

        const normalized = rows.map((row) =>
          normalizeComment(row, { likedByMe: likedIds.includes(row.id) })
        )

        setComments(keepExisting ? (prev) => [...prev, ...normalized] : normalized)
        setHasMore((data || []).length === 20)
      } finally {
        setLoading(false)
      }
    },
    [contentId, contentType, enabled, photoId, sort, videoId]
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

      let likedIds = []
      if (ids.length) {
        const likedRes = await commentApi.getLikedCommentIds(ids)
        likedIds = likedRes?.data || []
      }

      const normalized = rows.map((row) =>
        normalizeComment(row, { likedByMe: likedIds.includes(row.id) })
      )

      setComments((prev) => [...prev, ...normalized])
      setHasMore(rows.length === 20)
    } finally {
      setLoadingMore(false)
    }
  }, [comments.length, enabled, hasMore, loading, loadingMore, photoId, sort, videoId])

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

        return { data, error: null }
      } catch (error) {
        return { data: null, error }
      } finally {
        setPosting(false)
      }
    },
    [enabled, photoId, videoId]
  )

  const removeComment = useCallback(async (commentId) => {
    const { error } = await commentApi.deleteComment(commentId)
    if (error) return { error }

    setComments((prev) => prev.filter((c) => c.id !== commentId))
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
        if (ids.length) {
          const likedRes = await commentApi.getLikedCommentIds(ids)
          likedIds = likedRes?.data || []
        }

        setRepliesByParentId((prev) => ({
          ...prev,
          [parentId]: rows.map((row) => normalizeComment(row, { likedByMe: likedIds.includes(row.id) })),
        }))
      } finally {
        setRepliesLoading((prev) => ({ ...prev, [parentId]: false }))
      }
    },
    [enabled, features.replies, photoId, videoId]
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
          // Only handle top-level inserts when possible
          if (payload?.new?.parent_id) return

          const { data } = await supabase
            .from('comments')
            .select('*, user:profiles(id, name, avatar, profession, username)')
            .eq('id', payload.new.id)
            .single()

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
    sub?.unsubscribe?.()
  }, [])

  useEffect(() => {
    if (!enabled) return

    refreshFeatures().finally(() => {
      refresh()
      startRealtime()
    })

    return () => {
      stopRealtime()
    }
  }, [enabled, refresh, refreshFeatures, startRealtime, stopRealtime])

  useEffect(() => {
    if (!enabled) return
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort])

  return {
    comments,
    count,
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
