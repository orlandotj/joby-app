import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

const CommentsMetaContext = createContext(null)

const STORAGE_KEY = 'joby:commentsMeta:v1'
const STORAGE_TTL_MS = 24 * 60 * 60 * 1000

const loadPersistedCounts = () => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage?.getItem?.(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const savedAt = Number(parsed?.savedAt) || 0
    if (!savedAt || Date.now() - savedAt > STORAGE_TTL_MS) return null

    const toMap = (obj) => {
      const m = new Map()
      if (!obj || typeof obj !== 'object') return m
      for (const [k, v] of Object.entries(obj)) {
        const n = Number(v)
        if (!k) continue
        if (!Number.isFinite(n) || n < 0) continue
        m.set(String(k), n)
      }
      return m
    }

    return {
      video: toMap(parsed?.video),
      photo: toMap(parsed?.photo),
    }
  } catch {
    return null
  }
}

const persistCounts = (countsById) => {
  if (typeof window === 'undefined') return
  try {
    const toObj = (map) => {
      const obj = {}
      const entries = Array.from(map?.entries?.() || [])
      // keep most recent-ish by insertion order; cap size
      const capped = entries.slice(-600)
      for (const [k, v] of capped) obj[String(k)] = Number(v) || 0
      return obj
    }
    const payload = {
      savedAt: Date.now(),
      video: toObj(countsById?.video || new Map()),
      photo: toObj(countsById?.photo || new Map()),
    }
    window.localStorage?.setItem?.(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore storage errors
  }
}

const makeEmptyState = () => ({
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
    table: 'videos',
    idCol: 'id',
    countCol: 'comments_count',
  },
  photo: {
    table: 'photos',
    idCol: 'id',
    countCol: 'comments_count',
  },
}

export const CommentsMetaProvider = ({ children }) => {
  const [state, setState] = useState(() => {
    const base = makeEmptyState()
    const persisted = loadPersistedCounts()
    if (!persisted) return base
    return {
      ...base,
      countsById: {
        video: persisted.video || base.countsById.video,
        photo: persisted.photo || base.countsById.photo,
      },
    }
  })
  const inFlightRef = useRef(new Set())

  const persistTimerRef = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current)
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = 0
      persistCounts(state.countsById)
    }, 500)
    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current)
      persistTimerRef.current = 0
    }
  }, [state.countsById])

  const getCount = useCallback(
    (type, id) => {
      const cfg = typeConfig[type]
      if (!cfg) return null
      const key = String(id || '').trim()
      if (!key) return null
      const v = state.countsById[type]?.get(key)
      return v === undefined ? null : v
    },
    [state.countsById]
  )

  const setCount = useCallback((type, id, count) => {
    const key = String(id || '').trim()
    if (!key) return
    const n = Number(count)
    if (!Number.isFinite(n) || n < 0) return

    setState((prev) => {
      const nextCounts = new Map(prev.countsById[type] || [])
      nextCounts.set(key, n)
      return {
        ...prev,
        countsById: {
          ...prev.countsById,
          [type]: nextCounts,
        },
      }
    })
  }, [])

  const bumpCount = useCallback((type, id, delta) => {
    const key = String(id || '').trim()
    if (!key) return
    const d = Number(delta)
    if (!Number.isFinite(d) || d === 0) return

    setState((prev) => {
      const nextCounts = new Map(prev.countsById[type] || [])
      const cur = nextCounts.get(key)
      const curN = Number.isFinite(Number(cur)) ? Number(cur) : 0
      nextCounts.set(key, Math.max(0, curN + d))
      return {
        ...prev,
        countsById: {
          ...prev.countsById,
          [type]: nextCounts,
        },
      }
    })
  }, [])

  const markHydrated = useCallback((type, ids) => {
    setState((prev) => {
      const nextHydrated = new Set(prev.hydratedIds[type] || [])
      for (const id of ids) nextHydrated.add(String(id))
      return {
        ...prev,
        hydratedIds: {
          ...prev.hydratedIds,
          [type]: nextHydrated,
        },
      }
    })
  }, [])

  const unmarkHydrated = useCallback((type, ids) => {
    setState((prev) => {
      const nextHydrated = new Set(prev.hydratedIds[type] || [])
      for (const id of ids) nextHydrated.delete(String(id))
      return {
        ...prev,
        hydratedIds: {
          ...prev.hydratedIds,
          [type]: nextHydrated,
        },
      }
    })
  }, [])

  const hydrateForIds = useCallback(
    async (type, ids, { force = false } = {}) => {
      const cfg = typeConfig[type]
      if (!cfg) return

      const normalizedIds = normalizeIds(ids)
      if (!normalizedIds.length) return

      const missing = normalizedIds.filter((id) => force || !state.hydratedIds[type]?.has(id))
      if (!missing.length) return

      // Avoid duplicated requests
      const flightKey = `${type}:${missing.join(',')}`
      if (inFlightRef.current.has(flightKey)) return
      inFlightRef.current.add(flightKey)

      // Mark as hydrated early to avoid repeated calls during fast renders.
      markHydrated(type, missing)

      try {
        const { data, error } = await supabase
          .from(cfg.table)
          .select(`${cfg.idCol}, ${cfg.countCol}`)
          .in(cfg.idCol, missing)

        if (error) {
          // If column is missing, allow future retries after DB is fixed.
          const msg = String(error?.message || '').toLowerCase()
          const missingColumn = msg.includes('column') && msg.includes('does not exist')
          if (missingColumn) unmarkHydrated(type, missing)
          return
        }

        setState((prev) => {
          const nextCounts = new Map(prev.countsById[type] || [])
          for (const row of data || []) {
            const id = row?.[cfg.idCol]
            if (!id) continue
            const key = String(id)
            if (!force && nextCounts.has(key)) continue
            nextCounts.set(key, Number(row?.[cfg.countCol]) || 0)
          }

          return {
            ...prev,
            countsById: {
              ...prev.countsById,
              [type]: nextCounts,
            },
          }
        })
      } finally {
        inFlightRef.current.delete(flightKey)
      }
    },
    [markHydrated, state.hydratedIds, unmarkHydrated]
  )

  const value = useMemo(
    () => ({
      getCount,
      setCount,
      bumpCount,
      hydrateForIds,
    }),
    [bumpCount, getCount, hydrateForIds, setCount]
  )

  return <CommentsMetaContext.Provider value={value}>{children}</CommentsMetaContext.Provider>
}

export const useCommentsMeta = () => {
  const ctx = useContext(CommentsMetaContext)
  if (!ctx) throw new Error('useCommentsMeta must be used within CommentsMetaProvider')
  return ctx
}
