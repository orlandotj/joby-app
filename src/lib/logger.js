const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

const nowIso = () => {
  try {
    return new Date().toISOString()
  } catch {
    return ''
  }
}

const normalizeTag = (tag) => {
  const t = String(tag || '').trim()
  if (!t) return 'APP'
  // Allow passing "[TAG]"; normalize to "TAG".
  return t.startsWith('[') && t.endsWith(']') ? t.slice(1, -1).trim() || 'APP' : t
}

const safeGetLocalStorageItem = (key) => {
  try {
    if (typeof window === 'undefined') return null
    if (!window?.localStorage) return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const parseLevel = (raw) => {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'error' || v === 'warn' || v === 'info' || v === 'debug') return v
  return null
}

const isPlainObject = (value) => {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const safeErrorToObject = (err) => {
  if (!err || typeof err !== 'object') return null
  if (!(err instanceof Error)) {
    const message = String(err?.message || err)
    return { name: String(err?.name || 'Error'), message }
  }
  return {
    name: err.name,
    message: err.message,
    stack: err.stack,
  }
}

const normalizePayload = (value) => {
  if (value == null) return undefined

  if (value instanceof Error) {
    return { error: safeErrorToObject(value) }
  }

  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') {
    return { value }
  }

  if (Array.isArray(value)) {
    return { items: value }
  }

  if (isPlainObject(value)) {
    // If it already looks like an error payload, keep it.
    if (value.error instanceof Error) {
      const { error, ...rest } = value
      return { ...rest, error: safeErrorToObject(error) }
    }
    return value
  }

  // Fallback: keep as-is but wrapped.
  return { value }
}

const normalizeArgs = (action, data, rest) => {
  // Preferred signature: (tag, action, data)
  // Compatibility:
  // - (tag, action)
  // - (tag, ...args)
  // - (tag, action, err, extra...)
  let normalizedAction = ''
  let payload = undefined
  let extra = rest || []

  if (typeof action === 'string') {
    normalizedAction = action
    payload = data
  } else {
    // Old style: log.*(TAG, data)
    normalizedAction = 'log'
    payload = action
    extra = [data, ...(rest || [])].filter((x) => x !== undefined)
  }

  const normalizedPayload = normalizePayload(payload)
  const normalizedExtra = extra.filter((x) => x !== undefined)

  if (!normalizedExtra.length) return { action: normalizedAction, data: normalizedPayload }

  // Merge extra args in a stable shape.
  const extraPayload = normalizedExtra.map((x) => (x instanceof Error ? { error: safeErrorToObject(x) } : x))
  if (!normalizedPayload) return { action: normalizedAction, data: { extra: extraPayload } }
  if (isPlainObject(normalizedPayload)) return { action: normalizedAction, data: { ...normalizedPayload, extra: extraPayload } }
  return { action: normalizedAction, data: { data: normalizedPayload, extra: extraPayload } }
}

const getRuntimeConfig = () => {
  const isDev = !!import.meta?.env?.DEV

  // Production: only errors.
  if (!isDev) {
    return {
      isDev,
      minLevel: 'error',
      tagAllowList: null,
    }
  }

  const fromLs = parseLevel(safeGetLocalStorageItem('JOBY_LOG_LEVEL'))
  const minLevel = fromLs || 'debug'

  const rawTags = safeGetLocalStorageItem('JOBY_LOG_TAGS')
  const tagAllowList = (() => {
    const s = String(rawTags || '').trim()
    if (!s) return null
    const set = new Set(
      s
        .split(',')
        .map((x) => normalizeTag(x))
        .filter(Boolean)
    )
    return set.size ? set : null
  })()

  return { isDev, minLevel, tagAllowList }
}

const shouldLog = ({ level, tag }) => {
  const cfg = getRuntimeConfig()

  // Always allow errors (even when tags filter is set).
  if (level === 'error') return true

  if (LEVELS[level] > LEVELS[cfg.minLevel]) return false

  if (cfg.tagAllowList && !cfg.tagAllowList.has(tag)) return false

  return true
}

const emit = (level, tag, action, data, rest) => {
  const safeTag = normalizeTag(tag)

  if (!shouldLog({ level, tag: safeTag })) return

  const prefix = `[${safeTag}]`

  const normalized = normalizeArgs(action, data, rest)
  const safeAction = String(normalized.action || 'log')
  const safeData = normalized.data

  // Keep console output compact/readable in dev.
  // In production, we only emit errors (see getRuntimeConfig).
  const entry = safeData ? { ...safeData, ts: nowIso() } : { ts: nowIso() }

  try {
    if (level === 'error') console.error(prefix, safeAction, entry)
    else if (level === 'warn') console.warn(prefix, safeAction, entry)
    else if (level === 'info') console.info(prefix, safeAction, entry)
    else console.debug(prefix, safeAction, entry)
  } catch {
    // ignore
  }
}

export const log = {
  error: (tag, action, errOrData, ...rest) => emit('error', tag, action, errOrData, rest),
  warn: (tag, action, data, ...rest) => emit('warn', tag, action, data, rest),
  info: (tag, action, data, ...rest) => emit('info', tag, action, data, rest),
  debug: (tag, action, data, ...rest) => emit('debug', tag, action, data, rest),
}

export const _loggerInternals = {
  LEVELS,
  normalizeTag,
  parseLevel,
  getRuntimeConfig,
  safeErrorToObject,
  normalizePayload,
  normalizeArgs,
}
