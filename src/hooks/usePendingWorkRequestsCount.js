import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export const usePendingWorkRequestsCount = (userId) => {
  const [count, setCount] = useState(0)
  const safeUserId = useMemo(() => (userId ? String(userId) : ''), [userId])

  useEffect(() => {
    let isMounted = true
    let pollId = null
    let onChanged = null

    if (!safeUserId) {
      setCount(0)
      return
    }

    const refresh = async () => {
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

    refresh()

    onChanged = () => {
      refresh()
    }

    try {
      window.addEventListener('notifications:changed', onChanged)
    } catch (_e) {
      // ignore
    }
    pollId = setInterval(refresh, 30_000)

    return () => {
      isMounted = false
      if (pollId) clearInterval(pollId)
      try {
        if (onChanged) window.removeEventListener('notifications:changed', onChanged)
      } catch (_e) {
        // ignore
      }
    }
  }, [safeUserId])

  return count
}
