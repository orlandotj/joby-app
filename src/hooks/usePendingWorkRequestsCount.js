import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export const usePendingWorkRequestsCount = (userId) => {
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
        const { count: pendingCount, error } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('professional_id', safeUserId)
          .eq('status', 'pending')

        if (error) throw error
        if (isMounted) setCount(pendingCount || 0)
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
