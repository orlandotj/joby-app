import { supabase } from '@/lib/supabaseClient'
import { log } from '@/lib/logger'

const isMissingWorkSessionsTable = (error) => {
  const code = String(error?.code || '')
  const msg = String(error?.message || error || '').toLowerCase()
  return code === '42P01' || msg.includes('relation') && msg.includes('work_sessions') && msg.includes('does not exist')
}

const isMissingWorkSessionEventsTable = (error) => {
  const code = String(error?.code || '')
  const msg = String(error?.message || error || '').toLowerCase()
  return (
    code === '42P01' ||
    (msg.includes('relation') && msg.includes('work_session_events') && msg.includes('does not exist'))
  )
}

const toDate = (v) => {
  if (!v) return null
  if (v instanceof Date) return v
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

const extractMissingColumnName = (err) => {
  const code = String(err?.code || '')
  if (code !== '42703') return ''

  const msg = String(err?.message || '')
  // Examples:
  // - column "payment_type" of relation "work_sessions" does not exist
  // - Could not find the 'payment_type' column of 'work_sessions' in the schema cache
  const m1 = msg.match(/column\s+"([a-zA-Z0-9_]+)"\s+of\s+relation\s+"[a-zA-Z0-9_]+"\s+does\s+not\s+exist/i)
  if (m1?.[1]) return String(m1[1])
  const m2 = msg.match(/could\s+not\s+find\s+the\s+'([a-zA-Z0-9_]+)'\s+column/i)
  if (m2?.[1]) return String(m2[1])
  return ''
}

export const computeElapsedSecondsFromSession = (session, now = new Date()) => {
  const s = session || {}
  const startedAt = toDate(s.started_at)
  if (!startedAt) return 0

  const status = String(s.status || '')
  const pausedAt = toDate(s.paused_at)
  const finishedAt = toDate(s.finished_at)

  let end = now
  if (status === 'paused' && pausedAt) end = pausedAt
  if (status === 'finished' && finishedAt) end = finishedAt

  const totalPaused = Math.max(0, Math.floor(Number(s.total_paused_seconds) || 0))
  const raw = Math.floor((end.getTime() - startedAt.getTime()) / 1000) - totalPaused
  return Math.max(0, raw)
}

export const computeLiveAmountFromSession = (session, now = new Date()) => {
  const s = session || {}

  const status = String(s.status || '')
  const amountFinal = Number(s.amount_final)
  if (status === 'finished' && Number.isFinite(amountFinal)) return amountFinal

  const paymentType = String(s.payment_type || '').trim() || 'hourly'
  if (paymentType === 'daily' || paymentType === 'event') {
    const fixed = Number(s.fixed_amount)
    if (Number.isFinite(fixed)) return fixed
    if (Number.isFinite(amountFinal)) return amountFinal
    return 0
  }

  const rate = Number(s.rate_per_hour)
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 25
  const seconds = computeElapsedSecondsFromSession(s, now)
  return (seconds / 3600) * safeRate
}

export const logWorkSessionEvent = async ({
  sessionId,
  eventType,
  occurredAt = new Date(),
  payload = {},
} = {}) => {
  const session_id = String(sessionId || '').trim()
  const event_type = String(eventType || '').trim()
  if (!session_id || !event_type) return { data: null, error: null, unavailable: false }

  const row = {
    session_id,
    event_type,
    occurred_at: occurredAt instanceof Date ? occurredAt.toISOString() : String(occurredAt),
    payload: payload && typeof payload === 'object' ? payload : {},
  }

  const res = await supabase.from('work_session_events').insert(row).select('*').maybeSingle()
  if (res?.error) {
    if (isMissingWorkSessionEventsTable(res.error)) return { data: null, error: null, unavailable: true }
    return { data: null, error: res.error, unavailable: false }
  }
  return { data: res?.data || null, error: null, unavailable: false }
}

export const fetchWorkSessionEventsForSession = async (sessionId) => {
  const id = String(sessionId || '').trim()
  if (!id) return { data: [], error: null, unavailable: false }

  const res = await supabase
    .from('work_session_events')
    .select('*')
    .eq('session_id', id)
    .order('occurred_at', { ascending: true })
    .order('created_at', { ascending: true })

  if (res?.error) {
    if (isMissingWorkSessionEventsTable(res.error)) return { data: [], error: null, unavailable: true }
    return { data: [], error: res.error, unavailable: false }
  }

  return { data: Array.isArray(res?.data) ? res.data : [], error: null, unavailable: false }
}

export const fetchActiveWorkSessionForBooking = async (bookingId) => {
  const id = String(bookingId || '').trim()
  if (!id) return { data: null, error: null, unavailable: false }

  const res = await supabase
    .from('work_sessions')
    .select('*')
    .eq('booking_id', id)
    .in('status', ['running', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (res?.error) {
    if (isMissingWorkSessionsTable(res.error)) return { data: null, error: null, unavailable: true }
    return { data: null, error: res.error, unavailable: false }
  }

  return { data: res?.data || null, error: null, unavailable: false }
}

export const fetchLatestWorkSessionsForBookings = async (bookingIds = []) => {
  const ids = Array.from(
    new Set(
      (Array.isArray(bookingIds) ? bookingIds : [])
        .map((v) => String(v || '').trim())
        .filter(Boolean)
    )
  )

  if (!ids.length) return { data: {}, error: null, unavailable: false }

  const res = await supabase
    .from('work_sessions')
    .select('*')
    .in('booking_id', ids)
    .order('updated_at', { ascending: false })
    .order('started_at', { ascending: false })

  if (res?.error) {
    if (isMissingWorkSessionsTable(res.error)) return { data: {}, error: null, unavailable: true }
    return { data: {}, error: res.error, unavailable: false }
  }

  const rows = Array.isArray(res?.data) ? res.data : []
  const map = {}
  for (const row of rows) {
    const bid = String(row?.booking_id || '').trim()
    if (!bid) continue
    if (map[bid]) continue
    map[bid] = row
  }

  return { data: map, error: null, unavailable: false }
}

export const fetchWorkSessionsForBooking = async (bookingId, { limit = 400 } = {}) => {
  const id = String(bookingId || '').trim()
  if (!id) return { data: [], error: null, unavailable: false }

  const safeLimit = Math.max(1, Math.min(2000, Math.floor(Number(limit) || 400)))

  const res = await supabase
    .from('work_sessions')
    .select('*')
    .eq('booking_id', id)
    .order('started_at', { ascending: true })
    .limit(safeLimit)

  if (res?.error) {
    if (isMissingWorkSessionsTable(res.error)) return { data: [], error: null, unavailable: true }
    return { data: [], error: res.error, unavailable: false }
  }

  return { data: Array.isArray(res?.data) ? res.data : [], error: null, unavailable: false }
}

export const fetchWorkSessionEventsForSessions = async (sessionIds = []) => {
  const ids = Array.from(
    new Set((Array.isArray(sessionIds) ? sessionIds : []).map((v) => String(v || '').trim()).filter(Boolean))
  )

  if (!ids.length) return { data: {}, error: null, unavailable: false }

  const res = await supabase
    .from('work_session_events')
    .select('*')
    .in('session_id', ids)
    .order('occurred_at', { ascending: true })
    .order('created_at', { ascending: true })

  if (res?.error) {
    if (isMissingWorkSessionEventsTable(res.error)) return { data: {}, error: null, unavailable: true }
    return { data: {}, error: res.error, unavailable: false }
  }

  const rows = Array.isArray(res?.data) ? res.data : []
  const map = {}
  for (const row of rows) {
    const sid = String(row?.session_id || '').trim()
    if (!sid) continue
    if (!map[sid]) map[sid] = []
    map[sid].push(row)
  }

  return { data: map, error: null, unavailable: false }
}

export const startWorkSession = async ({
  bookingId,
  serviceId = null,
  clientId = null,
  professionalId,
  paymentType = 'hourly',
  fixedAmount = null,
  ratePerHour = 25,
  startedAt = new Date(),
} = {}) => {
  const booking_id = String(bookingId || '').trim()
  const professional_id = String(professionalId || '').trim()
  if (!booking_id || !professional_id) return { data: null, error: null, unavailable: false }

  const pt = String(paymentType || '').trim() || 'hourly'
  const safeRate =
    pt === 'hourly'
      ? Number.isFinite(Number(ratePerHour)) && Number(ratePerHour) > 0
        ? Number(ratePerHour)
        : 25
      : 0

  let payload = {
    booking_id,
    service_id: serviceId || null,
    client_id: clientId || null,
    professional_id,
    status: 'running',
    started_at: startedAt instanceof Date ? startedAt.toISOString() : String(startedAt),
    paused_at: null,
    total_paused_seconds: 0,
    rate_per_hour: safeRate,
    payment_type: pt,
    fixed_amount:
      fixedAmount === null || fixedAmount === undefined || fixedAmount === ''
        ? null
        : Number(fixedAmount) || 0,
  }

  // Insert with missing-column retries for backward compatibility.
  let res = null
  for (let attempt = 0; attempt < 6; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    res = await supabase.from('work_sessions').insert(payload).select('*').maybeSingle()
    if (!res?.error) break
    if (isMissingWorkSessionsTable(res.error)) break

    const code = String(res.error?.code || '')
    if (code !== '42703') break
    const missing = extractMissingColumnName(res.error)
    if (!missing || !(missing in payload)) break
    const next = { ...payload }
    delete next[missing]
    payload = next
    if (!Object.keys(payload).length) break
  }

  if (res?.error) {
    if (isMissingWorkSessionsTable(res.error)) return { data: null, error: null, unavailable: true }

    // If there is already an active session (unique partial index), reuse it.
    const msg = String(res.error?.message || '').toLowerCase()
    if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('work_sessions_one_active_per_booking')) {
      const existing = await fetchActiveWorkSessionForBooking(booking_id)
      if (existing?.data?.id) {
        // If it was paused, properly account for the pause duration.
        const now = startedAt instanceof Date ? startedAt : new Date(startedAt)
        const pausedAt = toDate(existing.data.paused_at)
        const extraPaused = pausedAt ? Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 1000)) : 0
        const nextTotalPaused = Math.max(
          0,
          Math.floor(Number(existing.data.total_paused_seconds) || 0) + extraPaused
        )

        const updPayload = {
          status: 'running',
          paused_at: null,
          total_paused_seconds: nextTotalPaused,
          payment_type: String(paymentType || 'hourly'),
          fixed_amount:
            fixedAmount === null || fixedAmount === undefined || fixedAmount === ''
              ? null
              : Number(fixedAmount) || 0,
        }

        let upd = null
        let nextUpdPayload = { ...updPayload }
        for (let attempt = 0; attempt < 6; attempt += 1) {
          // eslint-disable-next-line no-await-in-loop
          upd = await supabase
            .from('work_sessions')
            .update(nextUpdPayload)
            .eq('id', existing.data.id)
            .select('*')
            .maybeSingle()

          if (!upd?.error) break

          const code = String(upd.error?.code || '')
          if (code !== '42703') break
          const missing = extractMissingColumnName(upd.error)
          if (!missing || !(missing in nextUpdPayload)) break
          const trimmed = { ...nextUpdPayload }
          delete trimmed[missing]
          nextUpdPayload = trimmed
          if (!Object.keys(nextUpdPayload).length) break
        }

        if (upd?.error) return { data: null, error: upd.error, unavailable: false }

        // Best-effort: log event history.
        try {
          const seconds = computeElapsedSecondsFromSession(upd?.data, now)
          const amount = computeLiveAmountFromSession(upd?.data, now)
          await logWorkSessionEvent({
            sessionId: upd?.data?.id,
            eventType: 'start',
            occurredAt: now,
            payload: { elapsed_seconds: seconds, amount },
          })
        } catch {
          // ignore
        }
        return { data: upd?.data || null, error: null, unavailable: false }
      }
    }

    return { data: null, error: res.error, unavailable: false }
  }
  // Best-effort: log event history.
  try {
    const now = startedAt instanceof Date ? startedAt : new Date(startedAt)
    const seconds = computeElapsedSecondsFromSession(res?.data, now)
    const amount = computeLiveAmountFromSession(res?.data, now)
    await logWorkSessionEvent({
      sessionId: res?.data?.id,
      eventType: 'start',
      occurredAt: now,
      payload: { elapsed_seconds: seconds, amount },
    })
  } catch {
    // ignore
  }

  return { data: res?.data || null, error: null, unavailable: false }
}

export const pauseWorkSession = async ({ sessionId, bookingId = null, userId = null, pausedAt = new Date() } = {}) => {
  const id = String(sessionId || '').trim()
  if (!id) return { data: null, error: null, unavailable: false }

  const bid = String(bookingId || '').trim() || null
  const traceId = bid ? `timer:${bid}:${id}` : null

  const payload = {
    status: 'paused',
    paused_at: pausedAt instanceof Date ? pausedAt.toISOString() : String(pausedAt),
  }

  try {
    if (import.meta.env.DEV) {
      log.debug('TIMER', 'pauseWorkSession request', {
        traceId,
        userId: userId || null,
        bookingId: bid,
        sessionId: id,
        payload,
      })
    }
  } catch {
    // ignore
  }

  const res = await supabase.from('work_sessions').update(payload).eq('id', id).select('*').maybeSingle()

  try {
    if (import.meta.env.DEV) {
      log.debug('TIMER', 'pauseWorkSession response', {
        traceId,
        userId: userId || null,
        bookingId: bid,
        sessionId: id,
        status: res?.status ?? null,
        statusText: res?.statusText ?? null,
        data: res?.data || null,
        error: res?.error || null,
      })
    }
  } catch {
    // ignore
  }

  if (res?.error) {
    if (isMissingWorkSessionsTable(res.error)) return { data: null, error: null, unavailable: true }
    return { data: null, error: res.error, unavailable: false }
  }

  // Best-effort: log event history.
  try {
    const now = pausedAt instanceof Date ? pausedAt : new Date(pausedAt)
    const seconds = computeElapsedSecondsFromSession(res?.data, now)
    const amount = computeLiveAmountFromSession(res?.data, now)
    await logWorkSessionEvent({
      sessionId: res?.data?.id,
      eventType: 'pause',
      occurredAt: now,
      payload: { elapsed_seconds: seconds, amount },
    })
  } catch {
    // ignore
  }

  return { data: res?.data || null, error: null, unavailable: false }
}

export const resumeWorkSession = async ({ session, bookingId = null, userId = null, resumedAt = new Date() } = {}) => {
  const s = session || {}
  const id = String(s?.id || '').trim()
  if (!id) return { data: null, error: null, unavailable: false }

  const bid =
    String(bookingId || '').trim() || String(s?.booking_id || s?.bookingId || '').trim() || null
  const traceId = bid ? `timer:${bid}:${id}` : null

  const pausedAt = toDate(s.paused_at)
  const resumed = resumedAt instanceof Date ? resumedAt : new Date(resumedAt)

  const extraPaused = pausedAt ? Math.max(0, Math.floor((resumed.getTime() - pausedAt.getTime()) / 1000)) : 0
  const nextTotalPaused = Math.max(0, Math.floor(Number(s.total_paused_seconds) || 0) + extraPaused)

  const payload = {
    status: 'running',
    paused_at: null,
    total_paused_seconds: nextTotalPaused,
  }

  try {
    if (import.meta.env.DEV) {
      log.debug('TIMER', 'resumeWorkSession request', {
        traceId,
        userId: userId || null,
        bookingId: bid,
        sessionId: id,
        pausedAt: s?.paused_at || null,
        baseTotalPausedSeconds: s?.total_paused_seconds ?? null,
        resumedAt: resumed instanceof Date ? resumed.toISOString() : String(resumed),
        computed: { extraPaused, nextTotalPaused },
        payload,
      })
    }
  } catch {
    // ignore
  }

  const res = await supabase.from('work_sessions').update(payload).eq('id', id).select('*').maybeSingle()

  try {
    if (import.meta.env.DEV) {
      log.debug('TIMER', 'resumeWorkSession response', {
        traceId,
        userId: userId || null,
        bookingId: bid,
        sessionId: id,
        status: res?.status ?? null,
        statusText: res?.statusText ?? null,
        data: res?.data || null,
        error: res?.error || null,
      })
    }
  } catch {
    // ignore
  }

  if (res?.error) {
    if (isMissingWorkSessionsTable(res.error)) return { data: null, error: null, unavailable: true }
    return { data: null, error: res.error, unavailable: false }
  }

  // Best-effort: log event history.
  try {
    const now = resumedAt instanceof Date ? resumedAt : new Date(resumedAt)
    const seconds = computeElapsedSecondsFromSession(res?.data, now)
    const amount = computeLiveAmountFromSession(res?.data, now)
    await logWorkSessionEvent({
      sessionId: res?.data?.id,
      eventType: 'resume',
      occurredAt: now,
      payload: { elapsed_seconds: seconds, amount },
    })
  } catch {
    // ignore
  }

  return { data: res?.data || null, error: null, unavailable: false }
}

export const finishWorkSession = async ({ sessionId } = {}) => {
  const id = String(sessionId || '').trim()
  if (!id) return { data: null, error: null, unavailable: false }

  // Prefer server-side finalize if available.
  const rpc = await supabase.rpc('finalize_work_session', { p_session_id: id })
  if (!rpc?.error) {
    const row = Array.isArray(rpc?.data) ? rpc.data[0] : rpc?.data || null

    // Best-effort: log event history.
    try {
      const now = new Date()
      // Fetch the full session row after finalize so the event trigger can populate refs.
      const s = await supabase.from('work_sessions').select('*').eq('id', id).maybeSingle()
      const seconds = Number(row?.elapsed_seconds) || computeElapsedSecondsFromSession(s?.data, now)
      const amount = Number(row?.amount)
      const safeAmount = Number.isFinite(amount) ? amount : computeLiveAmountFromSession(s?.data, now)
      await logWorkSessionEvent({
        sessionId: id,
        eventType: 'finish',
        occurredAt: now,
        payload: { elapsed_seconds: seconds, amount: safeAmount },
      })
    } catch {
      // ignore
    }

    return { data: row, error: null, unavailable: false }
  }

  if (isMissingWorkSessionsTable(rpc.error)) return { data: null, error: null, unavailable: true }

  // If RPC doesn't exist, fall back to a simple status update.
  const msg = String(rpc.error?.message || '').toLowerCase()
  if (msg.includes('function') && msg.includes('finalize_work_session') && msg.includes('does not exist')) {
    const res = await supabase
      .from('work_sessions')
      .update({ status: 'finished', finished_at: new Date().toISOString(), paused_at: null })
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (res?.error) {
      if (isMissingWorkSessionsTable(res.error)) return { data: null, error: null, unavailable: true }
      return { data: null, error: res.error, unavailable: false }
    }

    // Best-effort: log event history.
    try {
      const now = new Date()
      const seconds = computeElapsedSecondsFromSession(res?.data, now)
      const amount = computeLiveAmountFromSession(res?.data, now)
      await logWorkSessionEvent({
        sessionId: res?.data?.id,
        eventType: 'finish',
        occurredAt: now,
        payload: { elapsed_seconds: seconds, amount },
      })
    } catch {
      // ignore
    }

    return { data: res?.data || null, error: null, unavailable: false }
  }

  return { data: null, error: rpc.error, unavailable: false }
}

export const subscribeToWorkSessionByBooking = ({ bookingId, onChange } = {}) => {
  const id = String(bookingId || '').trim()
  if (!id) return { unsubscribe: () => {} }

  const topic = `work-sessions:${id}`
  const channel = supabase.channel(topic)

  const handler = (payload) => {
    const next = payload?.new || null
    if (!next?.id) return
    if (String(next.booking_id || '') !== id) return
    try {
      onChange?.(next, payload)
    } catch {
      // ignore
    }
  }

  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'work_sessions', filter: `booking_id=eq.${id}` },
    handler
  )

  channel.subscribe()

  return {
    unsubscribe: () => {
      try {
        channel.unsubscribe?.()
      } catch {
        // ignore
      }
      try {
        supabase.removeChannel(channel)
      } catch {
        // ignore
      }
    },
  }
}
