import { useEffect, useMemo, useState } from 'react'
import {
  subscribeToNotifications,
} from '@/services/notificationService'
import { supabase } from '@/lib/supabaseClient'

const isMissingColumn42703 = (e) => String(e?.code || '') === '42703'

export const useUnreadNotificationsCount = (userId) => {
  const [unreadCount, setUnreadCount] = useState(0)

  const safeUserId = useMemo(() => (userId ? String(userId) : ''), [userId])

  useEffect(() => {
    let isMounted = true
    let pollId = null
    let disabled = false
    let sub = null
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

    const refresh = async () => {
      try {
        if (disabled) return

        // Count leve via supabase-js (badge não pode quebrar a navegação)
        const base = supabase
          .from('notifications')
          .select('id', { head: true, count: 'exact' })
          .eq('user_id', safeUserId)
          .eq('is_read', false)

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

    refresh()

    // Fallback: se realtime estiver bloqueado, ao menos atualiza periodicamente.
    pollId = setInterval(refresh, 30_000)

    sub = subscribeToNotifications({
      userId: safeUserId,
      onChange: refresh,
    })

    return () => {
      isMounted = false
      sub?.unsubscribe?.()
      if (pollId) clearInterval(pollId)
    }
  }, [safeUserId])

  return unreadCount
}
