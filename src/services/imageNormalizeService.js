import { supabase } from '@/lib/supabaseClient'
import { log } from '@/lib/logger'

const WORKER_BASE_URL =
  import.meta.env.VITE_WORKER_API_URL || import.meta.env.VITE_CLOUDFLARE_WORKER_URL || ''

function getWorkerBaseUrl() {
  const raw = String(WORKER_BASE_URL || '').trim().replace(/\/+$/, '')

  if (!raw) return ''

  try {
    const currentHost = window.location.hostname
    const envHost = new URL(raw).hostname
    const isEnvLocal = envHost === '127.0.0.1' || envHost === 'localhost'
    const isCurrentLocal = currentHost === '127.0.0.1' || currentHost === 'localhost'
    if (isEnvLocal && !isCurrentLocal) return ''
  } catch {
    // ignore
  }

  return raw
}

function buildWorkerUrl(path) {
  const base = getWorkerBaseUrl()
  const p = String(path || '').startsWith('/') ? String(path || '') : `/${path}`
  return base ? `${base}${p}` : p
}

export class NormalizeImageError extends Error {
  constructor(message, { status = 0, code = '', payload = null } = {}) {
    super(message)
    this.name = 'NormalizeImageError'
    this.status = status
    this.code = code
    this.payload = payload
  }
}

/**
 * normalizeImage
 * - Calls Worker: POST /api/images/normalize (multipart/form-data)
 * - Sends Authorization: Bearer <supabase access_token>
 *
 * @param {Object} params
 * @param {File} params.file
 * @param {'post_photo'|'profile_avatar'|'profile_cover'|'service_cover'|'chat_image'} params.context
 * @param {'webp'|'jpeg'} [params.target]
 */
export async function normalizeImage({ file, context, target } = {}) {
  if (!(file instanceof File)) {
    throw new NormalizeImageError('Arquivo inválido para normalização', {
      status: 0,
      code: 'INVALID_FILE',
    })
  }

  const ctx = String(context || '').trim()
  if (!ctx) {
    throw new NormalizeImageError('Contexto de normalização ausente', {
      status: 0,
      code: 'MISSING_CONTEXT',
    })
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const accessToken = session?.access_token
  if (!accessToken) {
    throw new NormalizeImageError('Sessão inválida. Faça login novamente.', {
      status: 401,
      code: 'NO_SESSION',
    })
  }

  const url = buildWorkerUrl('/api/images/normalize')

  const formData = new FormData()
  formData.append('file', file)
  formData.append('context', ctx)
  if (target) formData.append('target', String(target))

  const controller = new AbortController()
  const timeoutMs = 45_000
  const id = setTimeout(() => {
    try {
      controller.abort()
    } catch {
      // ignore
    }
  }, timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
      signal: controller.signal,
    })

    const text = await res.text().catch(() => '')
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }

    if (!res.ok) {
      const code = String(json?.code || json?.error || '').trim()
      const message =
        String(json?.message || json?.detail || '').trim() ||
        `Falha ao normalizar imagem (HTTP ${res.status})`
      throw new NormalizeImageError(message, {
        status: res.status,
        code,
        payload: json,
      })
    }

    return {
      ok: true,
      result: json?.result || json,
      warnings: Array.isArray(json?.warnings) ? json.warnings : [],
    }
  } catch (err) {
    if (err instanceof NormalizeImageError) throw err

    const aborted = String(err?.name || '').toLowerCase() === 'aborterror'
    const msg = aborted
      ? 'Tempo esgotado ao normalizar a imagem no servidor.'
      : err?.message || 'Falha ao normalizar a imagem no servidor.'

    try {
      if (import.meta.env.DEV) {
        log.warn('UPLOAD', 'normalize_image_failed', {
          context: ctx,
          error: String(err?.message || err),
        })
      }
    } catch {
      // ignore
    }

    throw new NormalizeImageError(msg, {
      status: 0,
      code: aborted ? 'TIMEOUT' : 'NETWORK',
      payload: null,
    })
  } finally {
    clearTimeout(id)
  }
}
