import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { log } from '@/lib/logger'

const LikesContext = createContext(null)

const makeEmptyState = () => ({
  likedByMe: {
    video: new Set(),
    photo: new Set(),
  },
  countsById: {
    video: new Map(),
    photo: new Map(),
  },
  hydratedIds: {
    video: new Set(),
    photo: new Set(),
  },
})

const normalizeIds = (ids) => {
  if (!Array.isArray(ids)) return []
  const out = []
  const seen = new Set()
  for (const id of ids) {
    const s = String(id || '').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

const typeConfig = {
  video: {
    table: 'video_likes',
    idCol: 'video_id',
    rpc: 'get_video_like_counts',
    rpcArg: 'video_ids',
    rpcKey: 'video_id',
  },
  photo: {
    table: 'photo_likes',
    idCol: 'photo_id',
    rpc: 'get_photo_like_counts',
    rpcArg: 'photo_ids',
    rpcKey: 'photo_id',
  },
}

export const LikesProvider = ({ children }) => {
  const { user } = useAuth()

  const [state, setState] = useState(() => makeEmptyState())

  const inFlightRef = useRef(new Set())
  const authUserIdRef = useRef(user?.id || null)

  // Reset likes when user changes (or logs out)
  useEffect(() => {
    const next = user?.id || null
    if (authUserIdRef.current === next) return
    authUserIdRef.current = next
    setState(makeEmptyState())
    inFlightRef.current = new Set()
  }, [user?.id])

  const isLiked = useCallback(
    (type, id) => {
      const t = typeConfig[type]
      if (!t) return false
      const key = String(id || '').trim()
      if (!key) return false
      return state.likedByMe[type]?.has(key) || false
    },
    [state.likedByMe]
  )

  const getCount = useCallback(
    (type, id) => {
      const t = typeConfig[type]
      if (!t) return null
      const key = String(id || '').trim()
      if (!key) return null
      const v = state.countsById[type]?.get(key)
      return v === undefined ? null : v
    },
    [state.countsById]
  )

  const applyOptimistic = useCallback((type, id, nextLiked) => {
    const key = String(id || '').trim()
    if (!key) return

    setState((prev) => {
      const next = {
        likedByMe: { ...prev.likedByMe },
        countsById: { ...prev.countsById },
        hydratedIds: prev.hydratedIds,
      }

      const likedSet = new Set(prev.likedByMe[type] || [])
      const counts = new Map(prev.countsById[type] || [])

      const wasLiked = likedSet.has(key)
      if (nextLiked) likedSet.add(key)
      else likedSet.delete(key)

      const prevCountRaw = counts.get(key)
      const prevCount = typeof prevCountRaw === 'number' && Number.isFinite(prevCountRaw) ? prevCountRaw : 0
      const delta = nextLiked === wasLiked ? 0 : nextLiked ? 1 : -1
      const nextCount = Math.max(0, prevCount + delta)

      counts.set(key, nextCount)

      next.likedByMe[type] = likedSet
      next.countsById[type] = counts

      return next
    })
  }, [])

  const rollback = useCallback((type, id, prevLiked) => {
    applyOptimistic(type, id, prevLiked)
  }, [applyOptimistic])

  const hydrateForIds = useCallback(
    async (type, ids, { force = false } = {}) => {
      const cfg = typeConfig[type]
      if (!cfg) return

      const normalizedIds = normalizeIds(ids)
      if (!normalizedIds.length) return

      const missing = normalizedIds.filter((id) => force || !state.hydratedIds[type]?.has(id))
      if (!missing.length) return

      // Mark as hydrated early to avoid duplicate requests in fast renders
      setState((prev) => {
        const nextHydrated = new Set(prev.hydratedIds[type] || [])
        for (const id of missing) nextHydrated.add(id)
        return {
          ...prev,
          hydratedIds: {
            ...prev.hydratedIds,
            [type]: nextHydrated,
          },
        }
      })

      // 1) My likes (only if logged in)
      let likedIds = []
      if (user?.id) {
        const { data, error } = await supabase
          .from(cfg.table)
          .select(cfg.idCol)
          .eq('user_id', user.id)
          .in(cfg.idCol, missing)

        if (!error) {
          likedIds = (data || []).map((r) => r?.[cfg.idCol]).filter(Boolean)
        }
      }

      // 2) Real counts via RPC
      const countsMap = new Map()
      try {
        const { data, error } = await supabase.rpc(cfg.rpc, { [cfg.rpcArg]: missing })
        if (!error) {
          for (const row of data || []) {
            const id = row?.[cfg.rpcKey]
            if (!id) continue
            countsMap.set(String(id), Number(row.likes_count) || 0)
          }
        } else {
          // If RPC is missing (PGRST202), don't keep retrying (it spams the console).
          // Keep hydrated mark and let UI show "—" until backend is fixed.
          if (String(error?.code || '') === 'PGRST202') {
            log.warn(
              'LIKES',
              `RPC missing: ${cfg.rpc}. Run the setup SQL (e.g. setup_get_${type}_like_counts_rpc.sql) in Supabase to enable real like counts.`
            )
            return
          }

          // Other RPC failures: unmark hydrated so caller can retry later.
          setState((prev) => {
            const nextHydrated = new Set(prev.hydratedIds[type] || [])
            for (const id of missing) nextHydrated.delete(id)
            return {
              ...prev,
              hydratedIds: {
                ...prev.hydratedIds,
                [type]: nextHydrated,
              },
            }
          })
          return
        }
      } catch {
        setState((prev) => {
          const nextHydrated = new Set(prev.hydratedIds[type] || [])
          for (const id of missing) nextHydrated.delete(id)
          return {
            ...prev,
            hydratedIds: {
              ...prev.hydratedIds,
              [type]: nextHydrated,
            },
          }
        })
        return
      }

      setState((prev) => {
        const nextLikedSet = new Set(prev.likedByMe[type] || [])
        for (const id of likedIds) nextLikedSet.add(String(id))
        // Also remove missing ids that are not in likedIds (so stale doesn't linger)
        if (user?.id) {
          const likedSetIncoming = new Set(likedIds.map((x) => String(x)))
          for (const id of missing) {
            if (!likedSetIncoming.has(String(id))) nextLikedSet.delete(String(id))
          }
        }

        const nextCounts = new Map(prev.countsById[type] || [])
        for (const id of missing) {
          const c = countsMap.has(String(id)) ? countsMap.get(String(id)) : 0
          nextCounts.set(String(id), c)
        }

        return {
          ...prev,
          likedByMe: {
            ...prev.likedByMe,
            [type]: nextLikedSet,
          },
          countsById: {
            ...prev.countsById,
            [type]: nextCounts,
          },
        }
      })
    },
    [state.hydratedIds, user?.id]
  )

  const toggleLike = useCallback(
    async (type, id) => {
      const cfg = typeConfig[type]
      const key = String(id || '').trim()
      if (!cfg || !key) return { error: new Error('invalid_like_target') }

      const flightKey = `${type}:${key}`
      if (inFlightRef.current.has(flightKey)) return { error: null, ignored: true }

      if (!user?.id) return { error: new Error('not_authenticated') }

      inFlightRef.current.add(flightKey)

      const prevLiked = isLiked(type, key)
      const nextLiked = !prevLiked

      applyOptimistic(type, key, nextLiked)

      try {
        if (nextLiked) {
          const { error } = await supabase.from(cfg.table).insert({ [cfg.idCol]: key, user_id: user.id })
          if (error) throw error
        } else {
          const { error } = await supabase.from(cfg.table).delete().eq(cfg.idCol, key).eq('user_id', user.id)
          if (error) throw error
        }

        // Optional: sync the real count after success
        await hydrateForIds(type, [key], { force: true })

        return { error: null }
      } catch (error) {
        rollback(type, key, prevLiked)
        return { error }
      } finally {
        inFlightRef.current.delete(flightKey)
      }
    },
    [applyOptimistic, hydrateForIds, isLiked, rollback, user?.id]
  )

  const value = useMemo(
    () => ({
      isLiked,
      getCount,
      hydrateForIds,
      toggleLike,
    }),
    [getCount, hydrateForIds, isLiked, toggleLike]
  )

  return <LikesContext.Provider value={value}>{children}</LikesContext.Provider>
}

export const useLikes = () => {
  const ctx = useContext(LikesContext)
  if (!ctx) throw new Error('useLikes must be used within LikesProvider')
  return ctx
}
