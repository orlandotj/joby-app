import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export const usePendingWorkRequestsCount = (userId) => {
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
        // Preferência: usar notificações não lidas de solicitações (comportamento tipo apps grandes)
        const baseNotifications = supabase
          .from('notifications')
          .select('id', { count: 'exact' })
          .eq('user_id', safeUserId)
          .eq('type', 'work_request')
          .eq('is_read', false)
          .range(0, 0)

        let res = await baseNotifications.is('archived_at', null)

        // Schema antigo: sem archived_at -> contar sem filtro
        if (res.error && String(res.error?.code || '') === '42703') {
          res = await baseNotifications
        }

        if (!res.error) {
          if (isMounted) setCount(res.count || 0)
          return
        }

        // Se notifications não existe/está bloqueada, cai pro comportamento antigo (pending bookings)
        const { count: pendingCount, error } = await supabase
          .from('bookings')
          .select('id', { count: 'exact' })
          .eq('professional_id', safeUserId)
          .eq('status', 'pending')
          .range(0, 0)

        if (error) throw error
        if (isMounted) setCount(pendingCount || 0)
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
      window.addEventListener('notifications:changed', onChanged)
    } catch (_e) {
      // ignore
    }
    pollId = setInterval(() => void requestRefresh(), 30_000)

    return () => {
      isMounted = false
      if (pollId) clearInterval(pollId)
      try {
        if (onChanged) window.removeEventListener('notifications:changed', onChanged)
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
