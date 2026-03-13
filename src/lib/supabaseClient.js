import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
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

const isNativeRuntime = () => {
  try {
    return Boolean(Capacitor?.isNativePlatform?.())
  } catch {
    return false
  }
}

// Avoid navigator.locks deadlock by using an in-memory mutex.
const NATIVE_AUTH_LOCK_ACQUIRE_TIMEOUT_MS = 4000

const createInMemoryAuthLock = () => {
  const locks = new Map()
  const isDev = import.meta.env?.DEV === true
  const hasWindow = typeof window !== 'undefined'
  const lockDebugEnabled = (() => {
    if (!isDev || !hasWindow) return false

    try {
      const v = String(import.meta.env?.VITE_SUPABASE_AUTH_LOCK_DEBUG || '').toLowerCase()
      if (v === '1' || v === 'true' || v === 'yes') return true
    } catch {
      // ignore
    }

    try {
      const v = window.localStorage?.getItem?.('JOBY_SUPABASE_AUTH_LOCK_DEBUG')
      const s = String(v || '').toLowerCase()
      if (s === '1' || s === 'true' || s === 'yes') return true
    } catch {
      // ignore
    }

    return false
  })()
  let seq = 0

  const shortStack = () => {
    try {
      const raw = new Error('SUPABASE_AUTH_LOCK').stack || ''
      const lines = String(raw).split('\n')
      return lines.slice(0, 8).join('\n')
    } catch {
      return ''
    }
  }

  const locksDebugSnapshot = () => {
    try {
      const out = []
      for (const [lockName, state] of locks.entries()) {
        out.push({
          lockName,
          pendingCount: state?.pendingCount ?? null,
          activeHolder: state?.activeHolder
            ? {
                id: state.activeHolder.id ?? null,
                acquiredAt: state.activeHolder.acquiredAt ?? null,
                stack: state.activeHolder.stack ?? '',
              }
            : null,
        })
      }
      return out
    } catch (e) {
      return [{ error: { name: e?.name || 'Error', message: e?.message || String(e) } }]
    }
  }

  if (lockDebugEnabled) {
    try {
      window.__JOBY_AUTH_LOCKS__ = {
        ...(window.__JOBY_AUTH_LOCKS__ || {}),
        locksDebugSnapshot,
      }
    } catch {
      // ignore
    }
  }

  return async (lockName, acquireTimeoutMs, fn) => {
    if (typeof fn !== 'function') {
      throw new TypeError('auth.lock: fn must be a function')
    }

    const name = String(lockName || '')
    if (!name) {
      // Sem nome de lock, não dá para serializar: executa direto.
      return await fn()
    }

    const timeout = Math.max(0, Number(acquireTimeoutMs) || 0)
    const id = ++seq
    const enqueuedAt = Date.now()
    const stack = lockDebugEnabled ? shortStack() : ''
    let acquiredAt = 0

    let state = locks.get(name)
    if (!state) {
      state = {
        tail: Promise.resolve(),
        pendingCount: 0,
      }
      locks.set(name, state)
    }

    // acquireTimeout=0 é "ifAvailable": falha imediatamente se já estiver ocupado/na fila.
    if (timeout === 0 && state.pendingCount > 0) {
      try {
        log.warn('SUPABASE_AUTH', 'native auth lock not immediately available', {
          lockName: name,
          timeoutMs: timeout,
        })
      } catch {
        // ignore
      }

      const err = new TimeoutError(`Auth lock not immediately available: ${name}`)
      err.isAcquireTimeout = true
      throw err
    }

    state.pendingCount += 1
    if (lockDebugEnabled) {
      try {
        console.log('[SUPABASE_AUTH_LOCK]', 'enqueue', {
          id,
          lockName: name,
          acquireTimeoutMs: timeout,
          pendingCount: state.pendingCount,
          timestamp: enqueuedAt,
          stack,
        })
      } catch {
        // ignore
      }
    }

    const prev = state.tail
    let release = null
    let released = false

    const gate = new Promise((resolve) => {
      release = () => {
        if (released) return
        released = true

        const releasedAt = Date.now()

        try {
          state.pendingCount = Math.max(0, Number(state.pendingCount || 0) - 1)
        } catch {
          state.pendingCount = 0
        }

        if (lockDebugEnabled) {
          try {
            if (state.activeHolder?.id === id) state.activeHolder = null
          } catch {
            // ignore
          }

          try {
            console.log('[SUPABASE_AUTH_LOCK]', 'released', {
              id,
              lockName: name,
              acquireTimeoutMs: timeout,
              heldMs: acquiredAt ? Math.max(0, releasedAt - acquiredAt) : null,
              totalMs: Math.max(0, releasedAt - enqueuedAt),
              pendingCount: state.pendingCount,
              pendingCountAfter: state.pendingCount,
              timestamp: releasedAt,
              stack,
            })
          } catch {
            // ignore
          }
        }

        // Cleanup quando o lock fica ocioso (evita acumular chaves no Map)
        if (state.pendingCount === 0) {
          try {
            locks.delete(name)
          } catch {
            // ignore
          }
        }

        resolve()
      }
    })

    // Fila: "tail" só resolve quando este holder liberar.
    state.tail = prev.then(() => gate)

    let cancelled = false

    // Se o acquire der timeout, NÃO podemos "furar" a fila.
    // Quando chegar nossa vez, liberamos imediatamente (release) e saímos.
    prev.then(
      () => {
        if (cancelled) release?.()
      },
      () => {
        if (cancelled) release?.()
      }
    )

    if (timeout > 0) {
      let timerId = null
      const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => {
          cancelled = true
          const now = Date.now()

          try {
            log.warn('SUPABASE_AUTH', 'native auth lock acquire timeout', {
              lockName: name,
              timeoutMs: timeout,
            })
          } catch {
            // ignore
          }

          if (lockDebugEnabled) {
            try {
              console.warn('[SUPABASE_AUTH_LOCK]', 'acquire_timeout', {
                id,
                lockName: name,
                acquireTimeoutMs: timeout,
                waitedMs: Math.max(0, now - enqueuedAt),
                pendingCount: state?.pendingCount ?? null,
                timestamp: now,
                stack,
                activeHolderId: state?.activeHolder?.id ?? null,
                activeHolderAcquiredAt: state?.activeHolder?.acquiredAt ?? null,
                activeHolderAgeMs: state?.activeHolder?.acquiredAt
                  ? Math.max(0, now - state.activeHolder.acquiredAt)
                  : null,
                activeHolderStack: state?.activeHolder?.stack ?? '',
              })
            } catch {
              // ignore
            }
          }

          const err = new TimeoutError(`Auth lock acquire timeout after ${timeout}ms: ${name}`)
          err.isAcquireTimeout = true
          reject(err)
        }, timeout)
      })

      try {
        await Promise.race([prev, timeoutPromise])
      } finally {
        try {
          if (timerId) clearTimeout(timerId)
        } catch {
          // ignore
        }
      }
    } else {
      await prev
    }

    acquiredAt = Date.now()
    if (lockDebugEnabled) {
      try {
        state.activeHolder = { id, acquiredAt, stack }
      } catch {
        // ignore
      }

      try {
        console.log('[SUPABASE_AUTH_LOCK]', 'acquired', {
          id,
          lockName: name,
          acquireTimeoutMs: timeout,
          waitedMs: Math.max(0, acquiredAt - enqueuedAt),
          pendingCount: state?.pendingCount ?? null,
          timestamp: acquiredAt,
          stack,
        })
      } catch {
        // ignore
      }
    }

    try {
      return await fn()
    } finally {
      release?.()
    }
  }
}

let nativeAuthLock = createInMemoryAuthLock()

const DEFAULT_TIMEOUT_MS = 15_000

const fetchWithTimeout = (input, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const timeout = Math.max(0, Number(timeoutMs) || DEFAULT_TIMEOUT_MS)
  const deadline = Date.now() + timeout

  const externalSignal = init?.signal
  const controller = new AbortController()

  const abortController = () => {
    try {
      controller.abort()
    } catch {
      // ignore
    }
  }

  return new Promise((resolve, reject) => {
    let finished = false
    let timerId = null

    const hasWindow = typeof window !== 'undefined'
    const hasDocument = typeof document !== 'undefined'

    function abortError() {
      try {
        return new DOMException('Aborted', 'AbortError')
      } catch {
        const e = new Error('Aborted')
        e.name = 'AbortError'
        return e
      }
    }

    function finish(fn, value) {
      if (finished) return
      finished = true

      try {
        if (timerId) clearTimeout(timerId)
      } catch {}

      if (externalSignal) {
        try {
          externalSignal.removeEventListener('abort', onExternalAbort)
        } catch {}
      }

      if (hasWindow) {
        try {
          window.removeEventListener('focus', onResume)
        } catch {}
        try {
          window.removeEventListener('pageshow', onResume)
        } catch {}
        try {
          window.removeEventListener('online', onResume)
        } catch {}
        try {
          window.removeEventListener('joby:resume', onResume)
        } catch {}
      }

      if (hasDocument) {
        try {
          document.removeEventListener('visibilitychange', onResume)
        } catch {}
      }

      fn(value)
    }

    function onExternalAbort() {
      abortController()
      finish(reject, abortError())
    }

    function onTimeout() {
      abortController()
      finish(reject, new TimeoutError('Request timeout'))
    }

    function armTimer() {
      if (finished) return
      try {
        if (timerId) clearTimeout(timerId)
      } catch {}

      const remaining = Math.max(0, deadline - Date.now())
      timerId = setTimeout(onTimeout, remaining)
    }

    function onResume() {
      if (finished) return
      if (Date.now() >= deadline) onTimeout()
      else armTimer()
    }

    if (externalSignal) {
      if (externalSignal.aborted) {
        onExternalAbort()
        return
      }
      externalSignal.addEventListener('abort', onExternalAbort, { once: true })
    }

    if (hasWindow) {
      window.addEventListener('focus', onResume)
      window.addEventListener('pageshow', onResume)
      window.addEventListener('online', onResume)
      window.addEventListener('joby:resume', onResume)
    }

    if (hasDocument) {
      document.addEventListener('visibilitychange', onResume)
    }

    armTimer()

    baseFetch(input, { ...init, signal: controller.signal })
      .then((res) => finish(resolve, res))
      .catch((err) => finish(reject, err))
  })
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

const isAuthTimeoutError = (err) => {
  if (!err) return false
  if (err?.isAcquireTimeout === true) return true
  if (isTimeoutError(err)) return true
  const msg = String(err?.message || err || '').toLowerCase()
  return (
    msg.includes('auth lock acquire timeout') ||
    msg.includes('auth lock not immediately available')
  )
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

const createClientOptions = (authLock) => {
  const clientOptions = {
    global: {
      fetch: fetchWithRetry,
    },
  }

  clientOptions.auth = {
    persistSession: true,
    lock: authLock,
    lockAcquireTimeout: NATIVE_AUTH_LOCK_ACQUIRE_TIMEOUT_MS,
  }

  // Mitigação WEB: evita refresh automático acionado por visibilitychange (_onVisibilityChanged).
  // No runtime nativo, manter o comportamento padrão do Supabase.
  if (!isNativeRuntime()) {
    clientOptions.auth.autoRefreshToken = false
  }

  return clientOptions
}

const createSupabaseClient = () =>
  createClient(supabaseUrl, supabaseKey, createClientOptions(nativeAuthLock))

export let supabase = createSupabaseClient()

export const getSupabase = () => supabase

let isResettingSupabase = false

// Generation + in-flight dedupe for auth.getSession (used by safeGetSession).
// Goal: multiple callers share the same real getSession() while it's in flight.
let supabaseGeneration = 1
let safeGetSessionInFlight = null // { id, generation, promise, startedAt }
let safeGetSessionInFlightSeq = 0
const SAFE_GET_SESSION_INFLIGHT_WATCHDOG_MS = 60_000

const getSessionDeduped = () => {
  const generation = supabaseGeneration
  const current = safeGetSessionInFlight
  if (current?.promise && current.generation === generation) return current.promise

  const id = ++safeGetSessionInFlightSeq
  const client = supabase
  const startedAt = Date.now()

  const promise = (async () => {
    try {
      return await client.auth.getSession()
    } finally {
      const latest = safeGetSessionInFlight
      if (latest && latest.id === id) safeGetSessionInFlight = null
    }
  })()

  safeGetSessionInFlight = { id, generation, promise, startedAt }

  // Safety: if something goes very wrong and this never settles, don't reuse forever.
  try {
    setTimeout(() => {
      const latest = safeGetSessionInFlight
      if (!latest || latest.id !== id) return
      const ageMs = Date.now() - (latest.startedAt || startedAt)
      if (ageMs < SAFE_GET_SESSION_INFLIGHT_WATCHDOG_MS) return
      safeGetSessionInFlight = null
      if (import.meta.env.DEV) {
        log.warn('SUPABASE_AUTH', 'safeGetSession inFlight watchdog cleared', { ageMs })
      }
    }, SAFE_GET_SESSION_INFLIGHT_WATCHDOG_MS + 50)
  } catch {
    // ignore
  }

  return promise
}

export const resetSupabase = () => {
  // Guard contra resets reentrantes: evita cascata de recriações lock/client.
  if (isResettingSupabase) return supabase
  isResettingSupabase = true
  try {
    nativeAuthLock = createInMemoryAuthLock()
    supabase = createSupabaseClient()
    supabaseGeneration += 1
    safeGetSessionInFlight = null
    try {
      window.dispatchEvent(
        new CustomEvent('supabase:reset', {
          detail: { at: Date.now() },
        })
      )
    } catch {}
    return supabase
  } finally {
    isResettingSupabase = false
  }
}

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

export const safeGetSession = async (timeoutMs) => {
  const timeout = Math.max(0, Number(timeoutMs) || 0)

  const isSessionTimeoutSentinel = (err) => {
    const msg = String(err?.message || err || '')
    return msg === 'SESSION_TIMEOUT' || msg.toLowerCase().includes('session_timeout')
  }

  const withSessionTimeout = (promise) => {
    if (!timeout) return promise
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SESSION_TIMEOUT')), timeout)
      ),
    ])
  }

  const run = async () => {
    const res = await withSessionTimeout(getSessionDeduped())
    if (res?.error && isAuthTimeoutError(res.error)) throw res.error
    return res
  }

  try {
    return await run()
  } catch (err) {
    // SESSION_TIMEOUT = timeout local de espera (Promise.race), não prova deadlock do lock/client.
    // Evitar reset agressivo no boot/resume apenas por "demorou demais".
    if (isSessionTimeoutSentinel(err)) {
      if (import.meta.env.DEV) {
        log.warn('SUPABASE_AUTH', 'safeGetSession SESSION_TIMEOUT (no reset)', {
          timeoutMs: timeout,
        })
      }
      throw err
    }

    // Auth/lock timeout real: tentar recovery com reset + retry.
    if (isAuthTimeoutError(err)) {
      resetSupabase()
      return await run()
    }
    throw err
  }
}

export const safeGetUser = async () => {
  try {
    const res = await supabase.auth.getUser()
    if (res?.error && isAuthTimeoutError(res.error)) throw res.error
    if (res?.error && isSessionNotFoundError(res.error)) {
      await forceLocalSignOut('session_not_found')
      return { data: { user: null }, error: res.error }
    }
    return res
  } catch (err) {
    if (isAuthTimeoutError(err)) {
      try {
        resetSupabase()
        const res = await supabase.auth.getUser()
        if (res?.error && isAuthTimeoutError(res.error)) throw res.error
        if (res?.error && isSessionNotFoundError(res.error)) {
          await forceLocalSignOut('session_not_found')
          return { data: { user: null }, error: res.error }
        }
        return res
      } catch (err2) {
        if (isSessionNotFoundError(err2)) {
          await forceLocalSignOut('session_not_found')
          return { data: { user: null }, error: err2 }
        }
        throw err2
      }
    }
    if (isSessionNotFoundError(err)) {
      await forceLocalSignOut('session_not_found')
      return { data: { user: null }, error: err }
    }
    throw err
  }
}
