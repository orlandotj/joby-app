import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export const useUnreadMessagesCount = (userId) => {
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

    refresh()

    onChanged = () => {
      refresh()
    }

    try {
      window.addEventListener('messages:changed', onChanged)
    } catch (_e) {
      // ignore
    }
    pollId = setInterval(refresh, 30_000)

    return () => {
      isMounted = false
      if (pollId) clearInterval(pollId)
      try {
        if (onChanged) window.removeEventListener('messages:changed', onChanged)
      } catch (_e) {
        // ignore
      }
    }
  }, [safeUserId])

  return count
}
