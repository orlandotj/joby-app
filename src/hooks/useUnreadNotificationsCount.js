import { useEffect, useMemo, useRef, useState } from 'react'
import {
  subscribeToNotifications,
} from '@/services/notificationService'
import { supabase } from '@/lib/supabaseClient'

const isMissingColumn42703 = (e) => String(e?.code || '') === '42703'

export const useUnreadNotificationsCount = (userId) => {
  const [unreadCount, setUnreadCount] = useState(0)

  const safeUserId = useMemo(() => (userId ? String(userId) : ''), [userId])

  const inFlightRef = useRef(null)
  const lastRefreshAtRef = useRef(0)
  const scheduledRef = useRef({ timerId: null, promise: null })

  useEffect(() => {
    let isMounted = true
    let pollId = null
    let disabled = false
    let sub = null
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
      setUnreadCount(0)
      return
    }

    const isMissingNotificationsTable = (e) => {
      const msg = String(e?.message || e || '').toLowerCase()
      const code = String(e?.code || '').toLowerCase()
      return (
        code === 'pgrst205' ||
        msg.includes("could not find the table") ||
        msg.includes("public.notifications") ||
        msg.includes('404')
      )
    }

    const refreshImpl = async () => {
      try {
        if (disabled) return

        // Count leve via supabase-js (badge não pode quebrar a navegação)
        const base = supabase
          .from('notifications')
          .select('id', { count: 'exact' })
          .eq('user_id', safeUserId)
          .eq('is_read', false)
          .range(0, 0)

        let res = await base.is('archived_at', null)
        if (res.error && isMissingColumn42703(res.error)) {
          // Schema antigo: sem archived_at -> contar sem filtro
          res = await base
        }

        if (res.error) throw res.error

        if (isMounted) setUnreadCount(res.count || 0)
      } catch (_e) {
        // Se a tabela não existe ainda, desativa para evitar spam.
        if (isMissingNotificationsTable(_e)) {
          disabled = true
          if (isMounted) setUnreadCount(0)
          try {
            sub?.unsubscribe?.()
          } catch (_ignore) {
            // ignore
          }
          if (pollId) clearInterval(pollId)
          return
        }
        // silenciar: badge não pode quebrar navegação
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

    // Fallback: se realtime estiver bloqueado, ao menos atualiza periodicamente.
    pollId = setInterval(() => void requestRefresh(), 30_000)

    sub = subscribeToNotifications({
      userId: safeUserId,
      onChange: requestRefresh,
    })

    return () => {
      isMounted = false
      sub?.unsubscribe?.()
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

  return unreadCount
}
