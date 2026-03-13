import { supabase } from '@/lib/supabaseClient'

const emitNotificationsChanged = () => {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('notifications:changed'))
    }
  } catch (_e) {
    // ignore
  }
}

const isMissingColumnError = (error, columnName) => {
  const code = String(error?.code || '')
  const msg = String(error?.message || error || '')
  if (code === '42703') return true
  const lower = msg.toLowerCase()
  return lower.includes('column') && lower.includes('does not exist') && lower.includes(String(columnName).toLowerCase())
}

const isRlsOrPermissionError = (error) => {
  const code = String(error?.code || '')
  const msg = String(error?.message || error || '').toLowerCase()
  if (code === '42501') return true // insufficient_privilege / RLS
  if (code === '401' || code === '403') return true
  return (
    msg.includes('row-level security') ||
    msg.includes('rls') ||
    msg.includes('permission denied') ||
    msg.includes('not allowed')
  )
}

const isRealtimeEnabled = () => {
  // Default: OFF (evita erros de WebSocket em ambientes que bloqueiam realtime)
  // Para ativar depois: defina VITE_ENABLE_SUPABASE_REALTIME=true
  return String(import.meta?.env?.VITE_ENABLE_SUPABASE_REALTIME)
    .toLowerCase()
    .trim() === 'true'
}

export const listNotifications = async ({
  userId,
  status = 'all',
  type = 'all',
  limit = 50,
} = {}) => {
  if (!userId) return []

  const SELECT_WITH_ARCHIVED =
    'id,type,title,body,data,action_url,is_read,read_at,archived_at,created_at'
  const SELECT_NO_ARCHIVED =
    'id,type,title,body,data,action_url,is_read,read_at,created_at'

  const buildQuery = ({ includeArchivedColumn, includeArchivedFilter } = {}) => {
    const select = includeArchivedColumn ? SELECT_WITH_ARCHIVED : SELECT_NO_ARCHIVED
    let query = supabase
      .from('notifications')
      .select(select)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    // status: all | unread | archived
    if (status === 'unread') query = query.eq('is_read', false)
    if (type && type !== 'all') query = query.eq('type', type)

    if (includeArchivedFilter) {
      if (status === 'archived') query = query.not('archived_at', 'is', null)
      else query = query.is('archived_at', null)
    }

    return query
  }

  // Tentativa 1: inclui archived_at e filtra por não-arquivadas/arquivadas.
  const res1 = await buildQuery({ includeArchivedColumn: true, includeArchivedFilter: true })
  if (!res1.error) return res1.data || []

  // Fallback seguro: schema antigo sem archived_at
  if (isMissingColumnError(res1.error, 'archived_at')) {
    // Não existe conceito de arquivadas -> aba Arquivadas fica vazia
    if (status === 'archived') return []

    const res2 = await buildQuery({ includeArchivedColumn: false, includeArchivedFilter: false })
    if (res2.error) throw res2.error
    return res2.data || []
  }

  throw res1.error
}

export const getUnreadNotificationsCount = async (userId) => {
  if (!userId) return 0

  const base = supabase
    .from('notifications')
    .select('id', { count: 'exact' })
    .eq('user_id', userId)
    .eq('is_read', false)
    .range(0, 0)

  const res1 = await base.is('archived_at', null)
  if (!res1.error) return res1.count || 0

  if (isMissingColumnError(res1.error, 'archived_at')) {
    const res2 = await base
    if (res2.error) throw res2.error
    return res2.count || 0
  }

  throw res1.error
}

export const archiveNotification = async ({ id, userId, archived = true } = {}) => {
  if (!id || !userId) return

  const payload = archived
    ? { archived_at: new Date().toISOString() }
    : { archived_at: null }

  const { error } = await supabase
    .from('notifications')
    .update(payload)
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw error

  emitNotificationsChanged()
}

export const deleteNotification = async ({ id, userId } = {}) => {
  if (!id || !userId) return

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw error

  emitNotificationsChanged()
}

export const markNotificationRead = async ({ id, userId } = {}) => {
  if (!id || !userId) return

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw error

  emitNotificationsChanged()
}

export const markAllNotificationsRead = async (userId) => {
  if (!userId) return

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) throw error

  emitNotificationsChanged()
}

export const markNotificationsReadByType = async ({ userId, type } = {}) => {
  if (!userId || !type || type === 'all') return

  const payload = { is_read: true, read_at: new Date().toISOString() }

  const base = () =>
    supabase
      .from('notifications')
      .update(payload)
      .eq('user_id', userId)
      .eq('type', type)
      .eq('is_read', false)

  // Tentativa 1: schema com archived_at (não mexer nas arquivadas)
  const res1 = await base().is('archived_at', null)
  if (!res1.error) {
    emitNotificationsChanged()
    return
  }

  // Fallback: schema antigo sem archived_at
  if (isMissingColumnError(res1.error, 'archived_at')) {
    const res2 = await base()
    if (res2.error) throw res2.error
    emitNotificationsChanged()
    return
  }

  throw res1.error
}

export const createTestNotifications = async ({ userId, count = 12 } = {}) => {
  if (!userId) return

  const safeCount = Math.max(1, Math.min(50, Number(count) || 12))
  const batchId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

  const types = ['message', 'work_request', 'payment', 'review', 'system']
  const rows = Array.from({ length: safeCount }).map((_, i) => {
    const type = types[i % types.length]
    const titleByType = {
      message: 'Nova mensagem',
      work_request: 'Nova solicitação de serviço',
      payment: 'Atualização de pagamento',
      review: 'Nova avaliação',
      system: 'Aviso do sistema',
    }
    const bodyByType = {
      message: 'Você recebeu uma nova mensagem. Toque para abrir.',
      work_request: 'Você recebeu uma nova solicitação. Toque para ver.',
      payment: 'Houve uma atualização no seu pagamento. Toque para ver.',
      review: 'Você recebeu uma nova avaliação. Toque para conferir.',
      system: 'Temos uma novidade importante para você.',
    }
    const actionByType = {
      message: '/messages',
      work_request: '/work-requests',
      payment: '/wallet',
      review: `/profile/${userId}`,
      system: '/settings',
    }

    return {
      user_id: userId,
      type,
      title: titleByType[type],
      body: bodyByType[type],
      action_url: actionByType[type],
      is_read: false,
      data: {
        is_test: true,
        test_batch: batchId,
        index: i + 1,
      },
    }
  })

  const { error } = await supabase.from('notifications').insert(rows)
  if (error) throw error
}

export const createNotification = async ({
  userId,
  type = 'system',
  title = '',
  body = '',
  actionUrl = null,
  data = null,
  bookingId = null,
} = {}) => {
  if (!userId) return

  const baseRow = {
    user_id: userId,
    type,
    title,
    body,
    is_read: false,
  }

  const candidates = [
    {
      ...baseRow,
      action_url: actionUrl,
      data,
    },
    {
      ...baseRow,
      action_url: actionUrl,
    },
    {
      ...baseRow,
      data,
    },
    {
      ...baseRow,
    },
  ]

  let lastError = null
  let permissionBlocked = false
  for (const row of candidates) {
    const clean = { ...row }
    Object.keys(clean).forEach((k) => clean[k] == null && delete clean[k])
    const res = await supabase.from('notifications').insert([clean])
    if (!res.error) {
      emitNotificationsChanged()
      return
    }
    lastError = res.error
    if (String(res.error?.code || '') === '42703') {
      // schema drift (missing column) -> try next candidate
      continue
    }

    if (isRlsOrPermissionError(res.error)) {
      permissionBlocked = true
    }
    break
  }

  // If inserts are blocked by RLS (default setup), try RPC that validates booking ownership.
  if (permissionBlocked && bookingId) {
    try {
      const rpcRes = await supabase.rpc('create_notification_for_booking', {
        p_booking_id: bookingId,
        p_to_user_id: userId,
        p_type: type,
        p_title: title,
        p_body: body,
        p_data: data || {},
        p_action_url: actionUrl,
      })

      if (!rpcRes.error) {
        emitNotificationsChanged()
        return
      }

      lastError = rpcRes.error
    } catch (e) {
      lastError = e
    }
  }

  // Notifications should never break the main UX. If RLS/permissions block inserts,
  // treat it as a non-fatal no-op.
  if (lastError) {
    if (permissionBlocked && isRlsOrPermissionError(lastError)) return
    throw lastError
  }
}

export const subscribeToNotifications = ({ userId, onChange } = {}) => {
  if (!userId) return { unsubscribe: () => {} }

  if (!isRealtimeEnabled()) {
    return { unsubscribe: () => {} }
  }

  try {
    const client = supabase
    const uniqueSuffix = `${Date.now()}:${Math.random().toString(16).slice(2)}`
    const channelName = `notifications:${userId}:${uniqueSuffix}`

    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          try {
            onChange?.()
          } catch (_e) {
            // não deixar callback quebrar subscription
          }
        }
      )
      .subscribe()

    return {
      unsubscribe: () => {
        try {
          // IMPORTANT: removeChannel/unsubscribe can be async and reject.
          // In React effect cleanups we must never throw.
          if (channel && typeof channel.unsubscribe === 'function') {
            Promise.resolve(channel.unsubscribe()).catch(() => {})
          }

          Promise.resolve(client.removeChannel(channel)).catch(() => {})
        } catch (_e) {
          // ignore
        }
      },
    }
  } catch (err) {
    return { unsubscribe: () => {} }
  }
}
