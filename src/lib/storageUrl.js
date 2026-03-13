import { useEffect, useMemo, useRef, useState } from 'react'
import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabaseClient'

const cache = new Map()

const SIGNED_URL_STORAGE_PREFIX = 'joby:signedUrl:v1:'

const getSignedCacheKey = (bucket, path, expiresIn) =>
  `${bucket}:${path}:${typeof expiresIn === 'number' ? expiresIn : 3600}`

// P1: protect Supabase auth lock by avoiding bursts of concurrent createSignedUrl calls.
// - Dedupe in-flight by a stable key (bucket + path + expiresIn)
// - Global concurrency limiter (max N simultaneous createSignedUrl)
const SIGNED_URL_MAX_CONCURRENCY = 3
let signedUrlActiveCount = 0
const signedUrlWaitQueue = []
const signedUrlInFlight = new Map()

const acquireSignedUrlSlot = async () => {
  if (signedUrlActiveCount < SIGNED_URL_MAX_CONCURRENCY) {
    signedUrlActiveCount += 1
    return
  }

  await new Promise((resolve) => {
    signedUrlWaitQueue.push(() => {
      signedUrlActiveCount += 1
      resolve()
    })
  })
}

const releaseSignedUrlSlot = () => {
  signedUrlActiveCount = Math.max(0, signedUrlActiveCount - 1)
  const next = signedUrlWaitQueue.shift()
  if (next) next()
}

const createSignedUrlDeduped = async (bucket, path, expiresIn) => {
  const exp =
    typeof expiresIn === 'number' && Number.isFinite(expiresIn) ? expiresIn : 3600

  const inFlightKey = getSignedCacheKey(bucket, path, exp)
  const existing = signedUrlInFlight.get(inFlightKey)
  if (existing) return existing

  const promise = (async () => {
    await acquireSignedUrlSlot()
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, exp)
      if (error) throw error
      return data?.signedUrl || ''
    } finally {
      releaseSignedUrlSlot()
    }
  })()

  signedUrlInFlight.set(inFlightKey, promise)

  // Cleanup without creating an unhandled-rejection-prone derived promise.
  // (Using .finally() would create a new promise that could reject if unused.)
  void promise.then(
    () => {
      if (signedUrlInFlight.get(inFlightKey) === promise) signedUrlInFlight.delete(inFlightKey)
    },
    () => {
      if (signedUrlInFlight.get(inFlightKey) === promise) signedUrlInFlight.delete(inFlightKey)
    }
  )

  return promise
}

const readPersistedSignedUrl = (key) => {
  try {
    const raw = localStorage.getItem(`${SIGNED_URL_STORAGE_PREFIX}${key}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.url || !parsed?.expiresAt) return null
    return parsed
  } catch {
    return null
  }
}

const writePersistedSignedUrl = (key, url, expiresAt) => {
  try {
    localStorage.setItem(
      `${SIGNED_URL_STORAGE_PREFIX}${key}`,
      JSON.stringify({ url, expiresAt })
    )
  } catch {
    // ignore (quota / disabled)
  }
}

const CLOUDFLARE_WORKER_URL = (
  import.meta.env?.VITE_WORKER_API_URL || import.meta.env?.VITE_CLOUDFLARE_WORKER_URL || ''
)
  .toString()
  .trim()
  .replace(/\/+$/, '')

const getWorkerBaseUrl = () => {
  const raw = (CLOUDFLARE_WORKER_URL || '').toString().trim().replace(/\/+$/, '')
  if (!raw) return ''

  // DEV: even if env points to localhost, prefer same-origin paths (Vite proxy).
  // This avoids hard-coding 127.0.0.1:8787, which breaks when accessed via LAN IP,
  // preview devices, or when the worker restarts.
  try {
    const envHost = new URL(raw).hostname
    const isEnvLocal = envHost === '127.0.0.1' || envHost === 'localhost'
    if (import.meta.env?.DEV && isEnvLocal) return ''
  } catch {
    // ignore
  }

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

const buildWorkerUrl = (path) => {
  const base = getWorkerBaseUrl()
  const p = String(path || '').startsWith('/') ? String(path || '') : `/${path}`
  return base ? `${base}${p}` : p
}

const normalize = (value) => (typeof value === 'string' ? value.trim() : '')

const isImageDebugEnabled = () => {
  try {
    return !!(import.meta.env.DEV && window.__JOBY_IMAGE_DEBUG__)
  } catch {
    return false
  }
}

export const transformSupabasePublicImageUrl = (rawUrl, { width, height, quality = 70, resize = 'cover' } = {}) => {
  const value = normalize(rawUrl)
  if (!value) return ''

  // Only for Supabase public object URLs
  const marker = '/storage/v1/object/public/'
  if (!value.includes(marker)) return value

  try {
    const u = new URL(value)
    u.pathname = u.pathname.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')

    if (typeof width === 'number' && Number.isFinite(width)) u.searchParams.set('width', String(Math.round(width)))
    if (typeof height === 'number' && Number.isFinite(height)) u.searchParams.set('height', String(Math.round(height)))
    if (resize) u.searchParams.set('resize', String(resize))
    if (typeof quality === 'number' && Number.isFinite(quality)) u.searchParams.set('quality', String(Math.round(quality)))

    return u.toString()
  } catch {
    return value
  }
}

const tryParseStorageRef = (raw) => {
  const value = normalize(raw)
  if (!value) return null

  // Our internal format
  // storage://<bucket>/<path>
  if (value.startsWith('storage://')) {
    const rest = value.slice('storage://'.length)
    const slash = rest.indexOf('/')
    if (slash <= 0) return null
    const bucket = rest.slice(0, slash)
    const path = rest.slice(slash + 1)
    if (!bucket || !path) return null
    return { bucket, path, original: value }
  }

  // Supabase public URL format
  // https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
  // Otimização: se já é uma URL pública, usa como está (sem createSignedUrl),
  // senão cada foto dispara uma chamada extra ao Supabase e fica lento.
  if (value.includes('/storage/v1/object/public/')) {
    return null
  }

  // Supabase signed URL format already (leave as-is)
  if (value.includes('/storage/v1/object/sign/')) {
    return null
  }

  // Legacy plain bucket/path (common in old rows):
  // - thumbnails/<path>
  // - photos/<path>
  // - profile-photos/<path>
  // Also tolerate route-relative prefixes like profile/thumbnails/<path>
  // (which would otherwise resolve to /profile/thumbnails/... and 404).
  try {
    const knownBuckets = new Set(['thumbnails', 'photos', 'profile-photos', 'videos'])

    let p = value.replace(/^\/+/, '')
    if (p.startsWith('profile/')) p = p.slice('profile/'.length)
    if (p.startsWith('me/')) p = p.slice('me/'.length)

    const slash = p.indexOf('/')
    if (slash > 0) {
      const bucket = p.slice(0, slash)
      const path = p.slice(slash + 1)
      if (knownBuckets.has(bucket) && path) {
        return { bucket, path, original: value }
      }
    }
  } catch {
    // ignore
  }

  return null
}

const encodePathPreserveSlashes = (value) => {
  const input = normalize(value)
  if (!input) return ''
  return input
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

const toR2VideoKey = (raw) => {
  const value = normalize(raw)
  if (!value) return ''

  // Legacy: storage://videos/<path> (treat as R2 key).
  const parsed = tryParseStorageRef(value)
  if (parsed && parsed.bucket === 'videos' && parsed.path) {
    let p = String(parsed.path || '').trim().replace(/^\/+/, '')
    if (p.startsWith('profile/')) p = p.slice('profile/'.length)
    if (!p.startsWith('videos/')) p = `videos/${p}`
    return p
  }

  // Normalize common relative forms that show up as 404s:
  // - videos/<user>/<file>
  // - /videos/<user>/<file>
  // - profile/videos/<user>/<file> (relative from /profile route)
  // - /profile/videos/<user>/<file>
  let path = value.replace(/^\/+/, '')
  if (path.startsWith('profile/')) path = path.slice('profile/'.length)
  if (!path.startsWith('videos/')) return ''
  return path
}

// Project rule (JOBY): ALL videos are served via Cloudflare Worker streaming endpoint.
// This is synchronous (no Supabase calls) and safe to run only when the UI decides to load video.
export const buildR2VideoPlaybackUrl = (rawKey) => {
  const r2Key = toR2VideoKey(rawKey)
  if (!r2Key) return ''
  const encoded = encodePathPreserveSlashes(r2Key)
  return buildWorkerUrl(`/video/${encoded}`)
}

const tryParseCloudflareVideoKey = (raw, provider) => {
  const value = normalize(raw)
  if (!value) return null

  // If it's already an absolute URL, leave as-is.
  if (/^https?:\/\//i.test(value)) return null

  const r2Key = toR2VideoKey(value)
  if (!r2Key) return null
  return { r2Key }
}

export const resolveStorageUrl = async (
  raw,
  { expiresIn = 3600, preferPublic = false, debugLabel = '', provider = null } = {}
) => {
  const value = normalize(raw)
  if (!value) return ''

  const debugOn = isImageDebugEnabled()
  const t0 = debugOn ? performance.now() : 0

  // Cloudflare R2 video keys: map to Worker playback endpoint.
  const videoKey = tryParseCloudflareVideoKey(value, provider)
  if (videoKey) {
    const encoded = encodePathPreserveSlashes(videoKey.r2Key)
    return buildWorkerUrl(`/video/${encoded}`)
  }

  const parsed = tryParseStorageRef(value)
  if (!parsed) return value

  const signedKey = getSignedCacheKey(parsed.bucket, parsed.path, expiresIn)
  const key = `${parsed.bucket}:${parsed.path}:${expiresIn}:${preferPublic ? 'pub' : 'sign'}`
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) {
    if (debugOn) {
      const t1 = performance.now()
      log.debug(
        'URL',
        `(cache) ${debugLabel || ''} ${parsed.bucket}/${parsed.path} -> ${cached.url.substring(0, 80)}... in ${(
          t1 - t0
        ).toFixed(2)}ms`
      )
    }
    return cached.url
  }

  // Persistent cache: prevents re-generating signed URLs on every reload,
  // which breaks browser caching and causes “flicker / loads last”.
  const persisted = readPersistedSignedUrl(signedKey)
  if (persisted && persisted.expiresAt > now) {
    cache.set(key, persisted)
    if (debugOn) {
      const t1 = performance.now()
      log.debug(
        'URL',
        `(persist) ${debugLabel || ''} ${parsed.bucket}/${parsed.path} -> ${String(
          persisted.url
        ).substring(0, 80)}... in ${(t1 - t0).toFixed(2)}ms`
      )
    }
    return persisted.url
  }

  // IMPORTANT: If the bucket is public, prefer a stable public URL (cache-friendly).
  // If it's private, we still stabilize by persisting the signed URL across reloads.
  const publicBuckets = new Set(['profile-photos', 'photos', 'thumbnails'])
  // IMPORTANT: message attachments must work even when the bucket is PRIVATE.
  // For message-attachments/* we prefer signed URLs (public URL can 404 on private buckets
  // and new tabs/downloads don't carry Authorization headers).
  const isMessageAttachment =
    parsed.bucket === 'photos' && String(parsed.path || '').startsWith('message-attachments/')
  const shouldPreferPublic = publicBuckets.has(parsed.bucket) && !isMessageAttachment

  if (shouldPreferPublic) {
    try {
      const { data } = supabase.storage.from(parsed.bucket).getPublicUrl(parsed.path)
      const publicUrl = data?.publicUrl
      if (publicUrl) {
        cache.set(key, {
          url: publicUrl,
          // public URLs are stable; cache for a long time
          expiresAt: now + 24 * 60 * 60 * 1000,
        })

        if (debugOn) {
          const t1 = performance.now()
          log.debug(
            'URL',
            `(public) ${debugLabel || ''} ${parsed.bucket}/${parsed.path} -> ${publicUrl.substring(
              0,
              80
            )}... in ${(t1 - t0).toFixed(2)}ms`
          )
        }

        return publicUrl
      }
    } catch (_errPublic) {
      // fall through to signed
    }
  }

  try {
    const signedUrl = await createSignedUrlDeduped(parsed.bucket, parsed.path, expiresIn)
    if (signedUrl) {
      // Cache slightly less than expiry to avoid edge timing issues
      const expiresAt = now + Math.max(5_000, (expiresIn - 30) * 1000)
      const record = { url: signedUrl, expiresAt }
      cache.set(key, record)
      writePersistedSignedUrl(signedKey, signedUrl, expiresAt)

      if (debugOn) {
        const t1 = performance.now()
        log.debug(
          'URL',
          `(signed) ${debugLabel || ''} ${parsed.bucket}/${parsed.path} -> ${signedUrl.substring(
            0,
            80
          )}... in ${(t1 - t0).toFixed(2)}ms`
        )
      }

      return signedUrl
    }
  } catch (_err) {
    // Fall back to public URL if it exists / bucket is public.
    try {
      const { data } = supabase.storage
        .from(parsed.bucket)
        .getPublicUrl(parsed.path)
      if (data?.publicUrl) return data.publicUrl
    } catch (_err2) {
      // ignore
    }
  }

  // Last resort: keep original (may already be public)
  // IMPORTANT: never return storage:// (or legacy bucket/path) to the DOM.
  // Browsers can't load storage://, and legacy bucket/path would 404 as a relative URL.
  return ''
}

export const useResolvedStorageUrl = (raw, options) => {
  const input = normalize(raw)
  const opts = options || {}

  const resolveCountRef = useRef(0)

  const stableKey = useMemo(() => {
    const expiresIn = typeof opts.expiresIn === 'number' ? opts.expiresIn : 3600
    const label = typeof opts.debugLabel === 'string' ? opts.debugLabel : ''
    const preferPublic = !!opts.preferPublic
    const provider = typeof opts.provider === 'string' ? opts.provider : ''
    return `${input}::${expiresIn}::${preferPublic ? 'pub' : 'sign'}::${provider}::${label}`
  }, [input, opts.expiresIn, opts.preferPublic, opts.provider, opts.debugLabel])

  // OPTIMIZATION: Return public URLs and Cloudflare video keys synchronously (instant)
  const initialValue = useMemo(() => {
    if (!input) return ''

    const debugOn = isImageDebugEnabled()

    // If already a public Supabase URL, return immediately (no async needed!)
    if (input.includes('/storage/v1/object/public/')) {
      if (debugOn) {
        log.debug('URL', `(instant public) ${opts?.debugLabel || ''} ${input.substring(0, 90)}...`)
      }
      return input
    }
    
    // If already a signed URL, return immediately
    if (input.includes('/storage/v1/object/sign/')) {
      if (debugOn) {
        log.debug('URL', `(instant signed) ${opts?.debugLabel || ''} ${input.substring(0, 90)}...`)
      }
      return input
    }
    
    // If absolute HTTP(S) URL, return immediately
    if (/^https?:\/\//i.test(input)) {
      if (debugOn) {
        log.debug('URL', `(instant http) ${opts?.debugLabel || ''} ${input.substring(0, 90)}...`)
      }
      return input
    }
    
    // Cloudflare video keys can be resolved synchronously to the Worker playback endpoint.
    const videoKey = tryParseCloudflareVideoKey(input, opts?.provider)
    if (videoKey) {
      const encoded = encodePathPreserveSlashes(videoKey.r2Key)
      const next = buildWorkerUrl(`/video/${encoded}`)
      if (debugOn) {
        log.debug('URL', `(instant worker) ${opts?.debugLabel || ''} ${input} -> ${next}`)
      }
      return next
    }
    
    // storage:// format: try a synchronous stable value (public URL or persisted signed URL)
    const parsed = tryParseStorageRef(input)
    if (parsed) {
      const isMessageAttachment =
        parsed.bucket === 'photos' && String(parsed.path || '').startsWith('message-attachments/')

      const publicBuckets = new Set(['profile-photos', 'photos', 'thumbnails'])
      if (publicBuckets.has(parsed.bucket) && !isMessageAttachment) {
        try {
          const { data } = supabase.storage.from(parsed.bucket).getPublicUrl(parsed.path)
          const publicUrl = data?.publicUrl || ''
          if (publicUrl) {
            if (debugOn) {
              log.debug(
                'URL',
                `(instant public via storage://) ${opts?.debugLabel || ''} ${parsed.bucket}/${
                  parsed.path
                } -> ${publicUrl.substring(0, 90)}...`
              )
            }
            return publicUrl
          }
        } catch {
          // fall through
        }
      }

      const expiresIn = typeof opts.expiresIn === 'number' ? opts.expiresIn : 3600
      const signedKey = getSignedCacheKey(parsed.bucket, parsed.path, expiresIn)
      const persisted = readPersistedSignedUrl(signedKey)
      if (persisted && persisted.expiresAt > Date.now()) {
        if (debugOn) {
          log.debug(
            'URL',
            `(instant persisted signed) ${opts?.debugLabel || ''} ${parsed.bucket}/${
              parsed.path
            } -> ${String(persisted.url).substring(0, 90)}...`
          )
        }
        return persisted.url
      }

      if (debugOn) {
        log.debug('URL', `(async storage://) ${opts?.debugLabel || ''} ${input}`)
      }
      return ''
    }
    
    // Default: use as-is (might be a relative path or other format)
    return input
  }, [input, opts?.provider, opts?.preferPublic, opts?.expiresIn, opts?.debugLabel])

  const [resolved, setResolved] = useState(initialValue)

  useEffect(() => {
    // Skip async resolution if we already have a valid public URL
    if (initialValue) {
      setResolved(initialValue)
      return
    }

    let cancelled = false

    const run = async () => {
      if (!input) {
        setResolved('')
        return
      }

      const debugOn = isImageDebugEnabled()
      const seq = (resolveCountRef.current += 1)
      const t0 = debugOn ? performance.now() : 0
      if (debugOn) {
        log.debug(
          'URL',
          `resolve#${seq} START ${opts?.debugLabel || ''} raw=${String(input).substring(0, 90)}...`
        )
      }

      const next = await resolveStorageUrl(input, opts)

      // Never set a storage:// URL on <img src>
      const safe = String(next || '').trim().startsWith('storage://') ? '' : next

      if (debugOn) {
        const t1 = performance.now()
        log.debug(
          'URL',
          `resolve#${seq} END ${opts?.debugLabel || ''} -> ${String(next).substring(0, 90)}... in ${(
            t1 - t0
          ).toFixed(2)}ms`
        )
      }

      if (!cancelled) setResolved(safe)
    }

    run()

    return () => {
      cancelled = true
    }
  }, [stableKey, initialValue])

  return resolved
}
