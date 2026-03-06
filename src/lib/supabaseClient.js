import { createClient } from '@supabase/supabase-js'
import { log } from '@/lib/logger'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
export const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  const message =
    'Configuração do Supabase ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ou VITE_SUPABASE_KEY) no .env'
  log.error('SUPABASE', message)
  throw new Error(message)
}

const baseFetch = (...args) => fetch(...args)

class TimeoutError extends Error {
  constructor(message = 'Request timeout') {
    super(message)
    this.name = 'TimeoutError'
  }
}

const DEFAULT_TIMEOUT_MS = 15_000

const fetchWithTimeout = async (input, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const externalSignal = init?.signal
  const controller = new AbortController()
  let timedOut = false

  const onAbort = () => {
    try {
      controller.abort()
    } catch {
      // ignore
    }
  }

  if (externalSignal) {
    if (externalSignal.aborted) onAbort()
    else externalSignal.addEventListener('abort', onAbort, { once: true })
  }

  const id = setTimeout(() => {
    timedOut = true
    onAbort()
  }, Math.max(0, Number(timeoutMs) || DEFAULT_TIMEOUT_MS))

  try {
    return await baseFetch(input, { ...init, signal: controller.signal })
  } catch (err) {
    if (timedOut) throw new TimeoutError('Request timeout')
    throw err
  } finally {
    clearTimeout(id)
    if (externalSignal) {
      try {
        externalSignal.removeEventListener('abort', onAbort)
      } catch {
        // ignore
      }
    }
  }
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms)
    if (!signal) return
    if (signal.aborted) {
      clearTimeout(id)
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(id)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })

const isAbortError = (err) => {
  if (!err) return false
  const name = String(err?.name || '')
  if (name === 'AbortError') return true
  const msg = String(err?.message || err || '')
  return msg.includes('AbortError')
}

const isTimeoutError = (err) => {
  if (!err) return false
  if (err instanceof TimeoutError) return true
  return String(err?.name || '') === 'TimeoutError'
}

const NON_RETRYABLE_HTTP_STATUSES = new Set([400, 401, 403, 404])

const getHttpStatusFromError = (err) => {
  if (!err) return 0
  const raw = err?.status ?? err?.statusCode ?? err?.response?.status ?? err?.cause?.status
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

const fetchWithRetry = async (input, init = {}) => {
  const request = input instanceof Request ? input : null
  const method = String(init?.method || request?.method || 'GET').toUpperCase()

  // Retry only safe/idempotent methods to avoid duplicating writes.
  const maxRetries = method === 'GET' || method === 'HEAD' ? 2 : 0

  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(input, init, DEFAULT_TIMEOUT_MS)

      // Fetch normally doesn't throw on 4xx/5xx; keep returning the Response
      // so Supabase can parse it. We still check status to ensure we don't
      // accidentally add retry behaviors around non-retryable statuses.
      if (res instanceof Response) {
        const status = Number(res.status) || 0
        if (!res.ok && NON_RETRYABLE_HTTP_STATUSES.has(status)) {
          return res
        }
      }

      return res
    } catch (err) {
      lastError = err
      if (attempt >= maxRetries) break

      // If aborted or timed out, don't retry (avoid multiplying the timeout window).
      if (isAbortError(err)) break
      if (isTimeoutError(err)) break

      // If the client surfaced a HTTP error with a non-retryable status, don't retry.
      const status = getHttpStatusFromError(err)
      if (NON_RETRYABLE_HTTP_STATUSES.has(status)) break

      // Small backoff: 250ms, 750ms
      const delay = 250 * (attempt * 2 + 1)
      await sleep(delay, init?.signal)
    }
  }

  throw lastError
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: fetchWithRetry,
  },
})

let lastForcedSignOutAt = 0

export const clearSupabaseAuthStorage = () => {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k) keys.push(k)
    }
    for (const k of keys) {
      if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
        localStorage.removeItem(k)
      }
    }
  } catch {
    // ignore
  }
}

export const isSessionNotFoundError = (err) => {
  const msg = String(err?.message || err || '').toLowerCase()
  const code = String(err?.code || err?.error_code || '').toLowerCase()
  const status = Number(err?.status || err?.statusCode || 0)
  return (
    code === 'session_not_found' ||
    msg.includes('session_not_found') ||
    msg.includes('session not found') ||
    (status === 403 && (msg.includes('session') || msg.includes('not found')))
  )
}

export const forceLocalSignOut = async (reason = 'session_not_found') => {
  // Debounce: avoid repeated signOut storms when many calls fail at once.
  const now = Date.now()
  if (now - lastForcedSignOutAt < 3000) return { reason, didRun: false }
  lastForcedSignOutAt = now

  clearSupabaseAuthStorage()
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // ignore
  }

  return { reason, didRun: true }
}

export const safeGetUser = async () => {
  try {
    const res = await supabase.auth.getUser()
    if (res?.error && isSessionNotFoundError(res.error)) {
      await forceLocalSignOut('session_not_found')
      return { data: { user: null }, error: res.error }
    }
    return res
  } catch (err) {
    if (isSessionNotFoundError(err)) {
      await forceLocalSignOut('session_not_found')
      return { data: { user: null }, error: err }
    }
    throw err
  }
}
