import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export const useUnreadMessagesCount = (userId) => {
  const [count, setCount] = useState(0)
  const safeUserId = useMemo(() => (userId ? String(userId) : ''), [userId])

  useEffect(() => {
    let isMounted = true
    let pollId = null

    if (!safeUserId) {
      setCount(0)
      return
    }

    const refresh = async () => {
      try {
        // Preferência: esquema novo (read_at)
        const primary = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('receiver_id', safeUserId)
          .is('read_at', null)

        if (!primary.error) {
          if (isMounted) setCount(primary.count || 0)
          return
        }

        // Fallback: esquema antigo (is_read)
        const fallback = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('receiver_id', safeUserId)
          .eq('is_read', false)

        if (!fallback.error) {
          if (isMounted) setCount(fallback.count || 0)
        }
      } catch (_e) {
        // badge não pode quebrar navegação
      }
    }

    refresh()
    pollId = setInterval(refresh, 30_000)

    return () => {
      isMounted = false
      if (pollId) clearInterval(pollId)
    }
  }, [safeUserId])

  return count
}
