import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export const useUnreadMessagesCount = (userId) => {
  const [count, setCount] = useState(0)
  const safeUserId = useMemo(() => (userId ? String(userId) : ''), [userId])

  const inFlightRef = useRef(null)
  const lastRefreshAtRef = useRef(0)
  const scheduledRef = useRef({ timerId: null, promise: null })

  useEffect(() => {
    let isMounted = true
    let pollId = null
    let onChanged = null

    // Prevent cross-user overlap (effect reruns with a different userId)
    inFlightRef.current = null
    lastRefreshAtRef.current = 0
    try {
      if (scheduledRef.current?.timerId) clearTimeout(scheduledRef.current.timerId)
    } catch {
      // ignore
    }
    scheduledRef.current = { timerId: null, promise: null }

    if (!safeUserId) {
      setCount(0)
      return
    }

    const refreshImpl = async () => {
      try {
        // Preferência 0: RPC (mais compatível com RLS/esquemas diferentes)
        try {
          const rpc = await supabase.rpc('count_unread_messages', { user_uuid: safeUserId })
          if (!rpc?.error) {
            const v = Number(rpc?.data)
            if (isMounted) setCount(Number.isFinite(v) ? v : 0)
            return
          }

          // Se a RPC não existir (ou não for permitida), seguimos para o fallback via tabela.
          const code = String(rpc?.error?.code || '')
          const msg = String(rpc?.error?.message || '').toLowerCase()
          const missingFn = code === '42883' || msg.includes('function')
          if (!missingFn) {
            // para erros reais (ex: sem permissão), ainda tentamos via tabela
          }
        } catch (_e) {
          // ignore
        }

        // Preferência: esquema novo (read_at)
        const primary = await supabase
          .from('messages')
          .select('id', { count: 'exact' })
          .eq('receiver_id', safeUserId)
          .is('read_at', null)
          .range(0, 0)

        if (!primary.error) {
          if (isMounted) setCount(primary.count || 0)
          return
        }

        // Fallback: esquema antigo (is_read)
        const fallback = await supabase
          .from('messages')
          .select('id', { count: 'exact' })
          .eq('receiver_id', safeUserId)
          .eq('is_read', false)
          .range(0, 0)

        if (!fallback.error) {
          if (isMounted) setCount(fallback.count || 0)
        }
      } catch (_e) {
        // badge não pode quebrar navegação
      }
    }

    const COOLDOWN_MS = 800

    const requestRefresh = () => {
      const inFlight = inFlightRef.current
      if (inFlight) return inFlight

      const now = Date.now()
      const last = Number(lastRefreshAtRef.current || 0)
      const elapsed = now - last
      if (last && elapsed >= 0 && elapsed < COOLDOWN_MS) {
        const existing = scheduledRef.current?.promise
        if (existing) return existing

        const waitMs = COOLDOWN_MS - elapsed
        const scheduled = { timerId: null, promise: null }
        const promise = new Promise((resolve) => {
          try {
            scheduled.timerId = setTimeout(() => {
              scheduledRef.current = { timerId: null, promise: null }
              Promise.resolve(requestRefresh()).finally(resolve)
            }, waitMs)
          } catch {
            // If setTimeout fails, just resolve.
            resolve()
          }
        })
        scheduled.promise = promise
        scheduledRef.current = scheduled
        return promise
      }

      const p = Promise.resolve(refreshImpl())
        .catch(() => {})
        .finally(() => {
          inFlightRef.current = null
          lastRefreshAtRef.current = Date.now()
        })

      inFlightRef.current = p
      return p
    }

    void requestRefresh()

    onChanged = () => {
      void requestRefresh()
    }

    try {
      window.addEventListener('messages:changed', onChanged)
    } catch (_e) {
      // ignore
    }
    pollId = setInterval(() => void requestRefresh(), 30_000)

    return () => {
      isMounted = false
      if (pollId) clearInterval(pollId)
      try {
        if (onChanged) window.removeEventListener('messages:changed', onChanged)
      } catch (_e) {
        // ignore
      }

      try {
        if (scheduledRef.current?.timerId) clearTimeout(scheduledRef.current.timerId)
      } catch {
        // ignore
      }
      scheduledRef.current = { timerId: null, promise: null }
      inFlightRef.current = null
    }
  }, [safeUserId])

  return count
}
