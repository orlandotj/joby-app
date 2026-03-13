import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@supabase/supabase-js'
import { resetSupabase, supabase, supabaseKey, supabaseUrl } from '@/lib/supabaseClient'

const MAX_LOGS = 250
const TIMEOUT_MS = 5000

class TimeoutError extends Error {
  constructor(message = `Timeout after ${TIMEOUT_MS}ms`) {
    super(message)
    this.name = 'TimeoutError'
  }
}

const safeNow = () => Date.now()

const createReadOnlyAuthStorage = () => {
  const hasLocalStorage = () => {
    try {
      return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
    } catch {
      return false
    }
  }

  const safeGetItem = (key) => {
    try {
      if (!hasLocalStorage()) return null
      return window.localStorage.getItem(String(key))
    } catch {
      return null
    }
  }

  // Read-only: prevents writes/broadcast side effects that can interfere with the app's main auth client.
  return {
    getItem: (key) => safeGetItem(key),
    setItem: (_key, _value) => {
      // no-op (read-only)
    },
    removeItem: (_key) => {
      // no-op (read-only)
    },
  }
}

const formatTs = (ms) => {
  try {
    return new Date(ms).toLocaleString('pt-BR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return String(ms)
  }
}

const readNavigatorOnline = () => {
  try {
    return typeof navigator !== 'undefined' ? navigator.onLine !== false : true
  } catch {
    return true
  }
}

const readVisibility = () => {
  try {
    if (typeof document === 'undefined') return 'unknown'
    return String(document.visibilityState || 'unknown')
  } catch {
    return 'unknown'
  }
}

const isNativeCapacitor = () => {
  try {
    return Boolean(Capacitor?.isNativePlatform?.())
  } catch {
    return false
  }
}

const fetchWithTimeout = async (url, init = {}, timeoutMs = TIMEOUT_MS) => {
  const controller = new AbortController()
  const startedAt = safeNow()
  const timeout = Math.max(0, Number(timeoutMs) || TIMEOUT_MS)
  let didTimeout = false

  const id = setTimeout(() => {
    didTimeout = true
    try {
      controller.abort()
    } catch {
      // ignore
    }
  }, timeout)

  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    const text = await res.text().catch(() => '')

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      ms: safeNow() - startedAt,
      textSnippet: text ? String(text).slice(0, 900) : '',
    }
  } catch (err) {
    if (didTimeout) {
      const e = new TimeoutError(`Timeout after ${timeout}ms`)
      e.cause = err
      throw e
    }
    throw err
  } finally {
    try {
      clearTimeout(id)
    } catch {
      // ignore
    }
  }
}

const withTimeout = async (promise, timeoutMs = TIMEOUT_MS) => {
  const timeout = Math.max(0, Number(timeoutMs) || TIMEOUT_MS)
  let timerId = null

  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      reject(new TimeoutError(`Timeout after ${timeout}ms`))
    }, timeout)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    try {
      if (timerId) clearTimeout(timerId)
    } catch {
      // ignore
    }
  }
}

export default function DebugResume() {
  const location = useLocation()

  const [logs, setLogs] = useState([])
  const [lastResumeAt, setLastResumeAt] = useState(0)
  const [resumeCount, setResumeCount] = useState(0)
  const [autoTestArmed, setAutoTestArmed] = useState(false)

  const isRunningRef = useRef(false)

  const [lastResults, setLastResults] = useState({
    fetch_generic: null,
    supabase_auth_health: null,
    supabase_getSession: null,
    supabase_getSession_reset: null,
    supabase_getSession_new_client: null,
    supabase_getUser: null,
    supabase_getUser_reset: null,
    supabase_getUser_new_client: null,
    navigator_locks_query: null,
  })

  const envInfo = useMemo(() => {
    const native = isNativeCapacitor()
    let platform = 'web'
    try {
      platform = String(Capacitor?.getPlatform?.() || (native ? 'native' : 'web'))
    } catch {
      platform = native ? 'native' : 'web'
    }
    return { native, platform }
  }, [])

  const routeLabel = useMemo(() => {
    const p = String(location?.pathname || '')
    const s = String(location?.search || '')
    return `${p}${s}`
  }, [location?.pathname, location?.search])

  const appendLog = useCallback((type, detail = {}) => {
    const entry = {
      id: `${safeNow()}-${Math.random().toString(16).slice(2)}`,
      ts: safeNow(),
      type: String(type || 'log'),
      onLine: readNavigatorOnline(),
      visibility: readVisibility(),
      detail: detail && typeof detail === 'object' ? detail : { value: String(detail) },
    }

    setLogs((prev) => {
      const next = [entry, ...(prev || [])]
      return next.length > MAX_LOGS ? next.slice(0, MAX_LOGS) : next
    })
  }, [])

  const markResume = useCallback(
    (source, extra = {}) => {
      const now = safeNow()
      setLastResumeAt(now)
      setResumeCount((c) => c + 1)
      appendLog('RESUME', { source: String(source || 'unknown'), ...extra })
    },
    [appendLog]
  )

  // Lifecycle logs (web)
  useEffect(() => {
    const onFocus = () => {
      appendLog('focus')
      markResume('focus')
    }
    const onBlur = () => appendLog('blur')
    const onPageShow = (e) => {
      appendLog('pageshow', { persisted: Boolean(e?.persisted) })
      markResume('pageshow', { persisted: Boolean(e?.persisted) })
    }
    const onVisibility = () => {
      const state = readVisibility()
      appendLog('visibilitychange', { state })
      if (state === 'visible') markResume('visibilitychange', { state })
    }
    const onOnline = () => appendLog('online')
    const onOffline = () => appendLog('offline')

    appendLog('debug:mounted', { route: routeLabel })

    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    try {
      document.addEventListener('visibilitychange', onVisibility)
    } catch {
      // ignore
    }

    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      try {
        document.removeEventListener('visibilitychange', onVisibility)
      } catch {
        // ignore
      }
    }
  }, [appendLog, markResume, routeLabel])

  // Capacitor logs (native)
  useEffect(() => {
    if (!envInfo.native) return

    let handle = null
    let cancelled = false

    ;(async () => {
      try {
        const mod = await import('@capacitor/app')
        if (cancelled) return
        const { App } = mod

        handle = App.addListener('appStateChange', (state) => {
          appendLog('capacitor:appStateChange', { isActive: Boolean(state?.isActive) })
          if (state?.isActive) markResume('capacitor:appStateChange', { isActive: true })
        })
      } catch (e) {
        appendLog('capacitor:error', { message: e?.message || String(e) })
      }
    })()

    return () => {
      cancelled = true
      try {
        handle?.remove?.()
      } catch {
        // ignore
      }
    }
  }, [appendLog, envInfo.native, markResume])

  const setResult = useCallback((key, patch) => {
    setLastResults((prev) => ({
      ...(prev || {}),
      [key]: { ...(prev?.[key] || null), ...(patch || {}) },
    }))
  }, [])

  const runAction = useCallback(
    async (key, label, fn) => {
      const startedAt = safeNow()
      appendLog('TEST:start', { key, label })
      setResult(key, {
        status: 'running',
        startedAt,
        endedAt: 0,
        ms: 0,
        ok: null,
        error: null,
        summary: '',
      })

      try {
        const out = await fn()
        const endedAt = safeNow()
        const ms = endedAt - startedAt

        setResult(key, {
          status: 'done',
          endedAt,
          ms,
          ok: true,
          error: null,
          summary: out?.summary || 'ok',
          data: out?.data ?? null,
        })
        appendLog('TEST:success', { key, label, ms, summary: out?.summary || 'ok' })
        return out
      } catch (e) {
        const endedAt = safeNow()
        const ms = endedAt - startedAt
        const message = e?.message || String(e)
        const name = e?.name || 'Error'

        setResult(key, {
          status: name === 'TimeoutError' ? 'timeout' : 'error',
          endedAt,
          ms,
          ok: false,
          error: { name, message },
          summary: `${name}: ${message}`,
        })
        appendLog('TEST:error', { key, label, ms, name, message })
        throw e
      }
    },
    [appendLog, setResult]
  )

  const testFetchGeneric = useCallback(() => {
    return runAction('fetch_generic', 'Fetch genérico (jsonplaceholder)', async () => {
      const res = await fetchWithTimeout('https://jsonplaceholder.typicode.com/todos/1', {}, TIMEOUT_MS)
      return {
        summary: `HTTP ${res.status} (${res.ms}ms)`,
        data: res,
      }
    })
  }, [runAction])

  const testSupabaseAuthHealth = useCallback(() => {
    return runAction('supabase_auth_health', 'Supabase Auth health (/auth/v1/health)', async () => {
      const url = String(supabaseUrl || '').replace(/\/+$/, '') + '/auth/v1/health'
      const headers = {
        apikey: String(supabaseKey || ''),
        Authorization: `Bearer ${String(supabaseKey || '')}`,
      }
      const res = await fetchWithTimeout(url, { method: 'GET', headers }, TIMEOUT_MS)
      return {
        summary: `HTTP ${res.status} (${res.ms}ms)`,
        data: { url, ...res },
      }
    })
  }, [runAction])

  const testGetSession = useCallback(() => {
    return runAction('supabase_getSession', 'supabase.auth.getSession()', async () => {
      const result = await withTimeout(supabase.auth.getSession(), TIMEOUT_MS)
      const hasSession = Boolean(result?.data?.session)
      const userId = result?.data?.session?.user?.id || null

      return {
        summary: hasSession ? `session ok (user=${userId || 'unknown'})` : 'no session',
        data: {
          hasSession,
          userId,
          error: result?.error ? { message: result.error.message, name: result.error.name } : null,
        },
      }
    })
  }, [runAction])

  const testGetSessionWithReset = useCallback(() => {
    return runAction('supabase_getSession_reset', 'getSession (principal + reset)', async () => {
      const isTimeout = (err) => err instanceof TimeoutError || String(err?.name || '') === 'TimeoutError'

      const toSessionData = (result) => {
        const hasSession = Boolean(result?.data?.session)
        const userId = result?.data?.session?.user?.id || null
        return {
          hasSession,
          userId,
          error: result?.error ? { message: result.error.message, name: result.error.name } : null,
        }
      }

      let attempt1 = null
      let attempt2 = null

      try {
        const result1 = await withTimeout(supabase.auth.getSession(), TIMEOUT_MS)
        attempt1 = { ok: true, timeout: false, data: toSessionData(result1) }

        return {
          summary: `ok (sem reset) • ${attempt1.data.hasSession ? `session ok (user=${attempt1.data.userId || 'unknown'})` : 'no session'}`,
          data: {
            initialTimeout: false,
            didReset: false,
            retryOk: null,
            attempt1,
            attempt2,
          },
        }
      } catch (err) {
        if (!isTimeout(err)) throw err

        attempt1 = {
          ok: false,
          timeout: true,
          error: { name: String(err?.name || 'TimeoutError'), message: String(err?.message || err || '') },
        }

        resetSupabase()

        try {
          const result2 = await withTimeout(supabase.auth.getSession(), TIMEOUT_MS)
          attempt2 = { ok: true, timeout: false, data: toSessionData(result2) }

          return {
            summary: `timeout -> reset -> ok • ${attempt2.data.hasSession ? `session ok (user=${attempt2.data.userId || 'unknown'})` : 'no session'}`,
            data: {
              initialTimeout: true,
              didReset: true,
              retryOk: true,
              attempt1,
              attempt2,
            },
          }
        } catch (err2) {
          attempt2 = {
            ok: false,
            timeout: isTimeout(err2),
            error: { name: String(err2?.name || 'Error'), message: String(err2?.message || err2 || '') },
          }

          return {
            summary: `timeout -> reset -> falhou (${attempt2.error.name})`,
            data: {
              initialTimeout: true,
              didReset: true,
              retryOk: false,
              attempt1,
              attempt2,
            },
          }
        }
      }
    })
  }, [runAction])

  const testGetSessionWithNewClient = useCallback(() => {
    return runAction('supabase_getSession_new_client', 'getSession (client novo)', async () => {
      const url = String(supabaseUrl || '')
      const key = String(supabaseKey || '')
      if (!url || !key) {
        throw new Error('Supabase URL/KEY ausentes (supabaseUrl/supabaseKey).')
      }

      const debugClient = createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storage: createReadOnlyAuthStorage(),
        },
      })

      const result = await withTimeout(debugClient.auth.getSession(), TIMEOUT_MS)
      const hasSession = Boolean(result?.data?.session)
      const userId = result?.data?.session?.user?.id || null

      return {
        summary: hasSession ? `session ok (user=${userId || 'unknown'})` : 'no session',
        data: {
          hasSession,
          userId,
          error: result?.error ? { message: result.error.message, name: result.error.name } : null,
        },
      }
    })
  }, [runAction])

  const testGetUser = useCallback(() => {
    return runAction('supabase_getUser', 'supabase.auth.getUser()', async () => {
      const result = await withTimeout(supabase.auth.getUser(), TIMEOUT_MS)
      const userId = result?.data?.user?.id || null

      return {
        summary: userId ? `user ok (id=${userId})` : 'no user',
        data: {
          userId,
          error: result?.error ? { message: result.error.message, name: result.error.name } : null,
        },
      }
    })
  }, [runAction])

  const testGetUserWithReset = useCallback(() => {
    return runAction('supabase_getUser_reset', 'getUser (principal + reset)', async () => {
      const isTimeout = (err) => err instanceof TimeoutError || String(err?.name || '') === 'TimeoutError'

      const toUserData = (result) => {
        const userId = result?.data?.user?.id || null
        return {
          userId,
          error: result?.error ? { message: result.error.message, name: result.error.name } : null,
        }
      }

      let attempt1 = null
      let attempt2 = null

      try {
        const result1 = await withTimeout(supabase.auth.getUser(), TIMEOUT_MS)
        attempt1 = { ok: true, timeout: false, data: toUserData(result1) }

        return {
          summary: `ok (sem reset) • ${attempt1.data.userId ? `user ok (id=${attempt1.data.userId})` : 'no user'}`,
          data: {
            initialTimeout: false,
            didReset: false,
            retryOk: null,
            attempt1,
            attempt2,
          },
        }
      } catch (err) {
        if (!isTimeout(err)) throw err

        attempt1 = {
          ok: false,
          timeout: true,
          error: { name: String(err?.name || 'TimeoutError'), message: String(err?.message || err || '') },
        }

        resetSupabase()

        try {
          const result2 = await withTimeout(supabase.auth.getUser(), TIMEOUT_MS)
          attempt2 = { ok: true, timeout: false, data: toUserData(result2) }

          return {
            summary: `timeout -> reset -> ok • ${attempt2.data.userId ? `user ok (id=${attempt2.data.userId})` : 'no user'}`,
            data: {
              initialTimeout: true,
              didReset: true,
              retryOk: true,
              attempt1,
              attempt2,
            },
          }
        } catch (err2) {
          attempt2 = {
            ok: false,
            timeout: isTimeout(err2),
            error: { name: String(err2?.name || 'Error'), message: String(err2?.message || err2 || '') },
          }

          return {
            summary: `timeout -> reset -> falhou (${attempt2.error.name})`,
            data: {
              initialTimeout: true,
              didReset: true,
              retryOk: false,
              attempt1,
              attempt2,
            },
          }
        }
      }
    })
  }, [runAction])

  const testGetUserWithNewClient = useCallback(() => {
    return runAction('supabase_getUser_new_client', 'getUser (client novo)', async () => {
      const url = String(supabaseUrl || '')
      const key = String(supabaseKey || '')
      if (!url || !key) {
        throw new Error('Supabase URL/KEY ausentes (supabaseUrl/supabaseKey).')
      }

      const debugClient = createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storage: createReadOnlyAuthStorage(),
        },
      })

      const result = await withTimeout(debugClient.auth.getUser(), TIMEOUT_MS)
      const userId = result?.data?.user?.id || null

      return {
        summary: userId ? `user ok (id=${userId})` : 'no user',
        data: {
          userId,
          error: result?.error ? { message: result.error.message, name: result.error.name } : null,
        },
      }
    })
  }, [runAction])

  const inspectNavigatorLocks = useCallback(() => {
    return runAction('navigator_locks_query', 'Inspecionar locks (navigator.locks.query)', async () => {
      const hasNavigator = typeof navigator !== 'undefined'
      const hasLocks = (() => {
        try {
          return Boolean(hasNavigator && navigator.locks)
        } catch {
          return false
        }
      })()

      const hasQuery = (() => {
        try {
          return Boolean(hasLocks && typeof navigator.locks.query === 'function')
        } catch {
          return false
        }
      })()

      const observedAt = safeNow()

      if (!hasLocks || !hasQuery) {
        appendLog('LOCKS:query', { ok: true, observedAt, hasNavigator, hasLocks, hasQuery, note: 'API indisponível' })
        return {
          summary: !hasNavigator
            ? 'navigator ausente'
            : !hasLocks
              ? 'navigator.locks indisponível'
              : 'navigator.locks.query indisponível',
          data: { observedAt, hasNavigator, hasLocks, hasQuery, held: [], pending: [] },
        }
      }

      const res = await withTimeout(navigator.locks.query(), TIMEOUT_MS)

      const held = Array.isArray(res?.held) ? res.held : []
      const pending = Array.isArray(res?.pending) ? res.pending : []

      const normalize = (arr) =>
        (arr || []).slice(0, 50).map((x) => ({
          name: x?.name ?? null,
          mode: x?.mode ?? null,
          clientId: x?.clientId ?? null,
        }))

      const heldNorm = normalize(held)
      const pendingNorm = normalize(pending)

      const held0 = heldNorm.length > 0 ? heldNorm[0] : null
      const pending0 = pendingNorm.length > 0 ? pendingNorm[0] : null

      const heldNames = heldNorm.map((x) => x.name).filter(Boolean).slice(0, 20)
      const pendingNames = pendingNorm.map((x) => x.name).filter(Boolean).slice(0, 20)

      const payload = {
        observedAt,
        heldCount: heldNorm.length,
        pendingCount: pendingNorm.length,
        held0,
        pending0,
        held: heldNorm,
        pending: pendingNorm,
      }

      appendLog('LOCKS:query', {
        ok: true,
        observedAt,
        heldCount: heldNorm.length,
        pendingCount: pendingNorm.length,
        held0,
        pending0,
        heldNames,
        pendingNames,
        held: heldNorm,
        pending: pendingNorm,
      })

      return {
        summary: `held=${heldNorm.length} pending=${pendingNorm.length}`,
        data: payload,
      }
    })
  }, [appendLog, runAction])

  const runAll = useCallback(async () => {
    if (isRunningRef.current) {
      appendLog('TEST:skip', { reason: 'already_running' })
      return
    }
    isRunningRef.current = true
    appendLog('TEST:all:start')

    try {
      await testFetchGeneric()
      await testSupabaseAuthHealth()
      await testGetSession()
      await testGetUser()
      appendLog('TEST:all:done')
    } catch {
      appendLog('TEST:all:done_with_errors')
    } finally {
      isRunningRef.current = false
    }
  }, [appendLog, testFetchGeneric, testGetSession, testGetUser, testSupabaseAuthHealth])

  // Auto-test once on resume when armed
  const lastAutoResumeRef = useRef(0)
  useEffect(() => {
    if (!autoTestArmed) return
    if (!lastResumeAt) return
    if (lastResumeAt === lastAutoResumeRef.current) return

    lastAutoResumeRef.current = lastResumeAt
    setAutoTestArmed(false)

    appendLog('AUTO_TEST:trigger', { resumeAt: lastResumeAt })
    void runAll()
  }, [appendLog, autoTestArmed, lastResumeAt, runAll])

  const onLineNow = readNavigatorOnline()
  const visibilityNow = readVisibility()

  const locksCaps = useMemo(() => {
    let hasLocks = false
    let hasQuery = false
    try {
      hasLocks = typeof navigator !== 'undefined' && Boolean(navigator.locks)
    } catch {
      hasLocks = false
    }
    try {
      hasQuery = Boolean(hasLocks && typeof navigator.locks?.query === 'function')
    } catch {
      hasQuery = false
    }
    return { hasLocks, hasQuery }
  }, [])

  const lastLocksResult = lastResults?.navigator_locks_query || null

  return (
    <div className="p-6 space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Debug Resume</h1>
        <div className="text-sm text-muted-foreground">
          <div>Ambiente: {envInfo.native ? `Capacitor (${envInfo.platform})` : 'Web'}</div>
          <div>
            Rota atual: <span className="font-mono">{routeLabel}</span>
          </div>
          <div>
            navigator.onLine: <span className="font-mono">{String(onLineNow)}</span>
          </div>
          <div>
            visibilityState: <span className="font-mono">{visibilityNow}</span>
          </div>
          <div>
            Último resume:{' '}
            <span className="font-mono">{lastResumeAt ? formatTs(lastResumeAt) : '-'}</span> (count=
            {resumeCount})
          </div>
          <div>
            navigator.locks:{' '}
            <span className="font-mono">{String(locksCaps.hasLocks)}</span>
          </div>
          <div>
            navigator.locks.query:{' '}
            <span className="font-mono">{String(locksCaps.hasQuery)}</span>
          </div>
          <div>
            Última inspeção locks:{' '}
            <span className="font-mono">
              {lastLocksResult?.endedAt
                ? `${formatTs(lastLocksResult.endedAt)} • ${lastLocksResult.summary || ''}`
                : '-'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-white"
          onClick={() => void testFetchGeneric()}
        >
          Testar fetch genérico
        </button>
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-white"
          onClick={() => void testSupabaseAuthHealth()}
        >
          Testar auth health
        </button>
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-white"
          onClick={() => void testGetSession()}
        >
          Testar getSession
        </button>
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-white"
          onClick={() => void testGetSessionWithReset()}
        >
          getSession (principal + reset)
        </button>
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-white"
          onClick={() => void testGetSessionWithNewClient()}
        >
          getSession (client novo)
        </button>
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-white"
          onClick={() => void testGetUser()}
        >
          Testar getUser
        </button>
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-white"
          onClick={() => void testGetUserWithReset()}
        >
          getUser (principal + reset)
        </button>
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 text-white"
          onClick={() => void testGetUserWithNewClient()}
        >
          getUser (client novo)
        </button>
        <button
          type="button"
          className="rounded border border-border px-4 py-2"
          onClick={() => void inspectNavigatorLocks()}
        >
          Inspecionar locks
        </button>
        <button type="button" className="rounded border border-border px-4 py-2" onClick={() => void runAll()}>
          Rodar todos
        </button>
        <button type="button" className="rounded border border-border px-4 py-2" onClick={() => setLogs([])}>
          Limpar logs
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <input
          id="arm_auto"
          type="checkbox"
          checked={autoTestArmed}
          onChange={(e) => setAutoTestArmed(e.target.checked)}
        />
        <label htmlFor="arm_auto" className="select-none">
          Armar auto-teste 1x no próximo resume
        </label>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">Últimos resultados</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(lastResults).map(([k, r]) => (
            <div key={k} className="rounded border border-border p-3 bg-card">
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-xs">{k}</div>
                <div className="text-xs">
                  <span className="font-mono">{r?.status || 'idle'}</span>
                </div>
              </div>
              <div className="mt-1 text-sm">
                {r?.summary ? (
                  <span className="font-mono">{r.summary}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {r?.startedAt ? `start: ${formatTs(r.startedAt)}` : 'start: —'}{' '}
                {r?.endedAt ? `• end: ${formatTs(r.endedAt)}` : ''}{' '}
                {typeof r?.ms === 'number' && r.ms ? `• ${r.ms}ms` : ''}
              </div>

              {k === 'navigator_locks_query' ? (
                <div className="mt-2 space-y-2">
                  <div className="text-xs">
                    <div className="text-muted-foreground">held[0]</div>
                    <div className="font-mono">
                      name: {r?.data?.held0?.name ?? '—'} {' | '}
                      mode: {r?.data?.held0?.mode ?? '—'} {' | '}
                      clientId: {r?.data?.held0?.clientId ?? '—'}
                    </div>
                  </div>

                  <div className="text-xs">
                    <div className="text-muted-foreground">held / pending (normalizado)</div>
                    <pre className="mt-1 max-h-40 overflow-auto rounded bg-black/5 p-2 text-[11px] leading-relaxed">
                      {JSON.stringify(
                        {
                          held: r?.data?.held ?? [],
                          pending: r?.data?.pending ?? [],
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold">Logs (mais recentes primeiro)</h2>
        <div className="rounded border border-border bg-black/5 p-3 max-h-[55vh] overflow-auto">
          {logs.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem logs ainda.</div>
          ) : (
            <pre className="whitespace-pre-wrap text-xs leading-relaxed">
              {logs
                .map((l) => {
                  const line = {
                    ts: formatTs(l.ts),
                    type: l.type,
                    onLine: l.onLine,
                    visibility: l.visibility,
                    detail: l.detail,
                  }
                  return JSON.stringify(line)
                })
                .join('\n')}
            </pre>
          )}
        </div>
        <div className="text-xs text-muted-foreground">Timeout fixo: {TIMEOUT_MS}ms.</div>
      </div>
    </div>
  )
}
