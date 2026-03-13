import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App'
import '@/index.css'
import 'leaflet/dist/leaflet.css'
import {
  clearServiceWorkerCache,
  registerServiceWorker,
  unregisterServiceWorker,
} from '@/lib/serviceWorkerRegistration'
import { Capacitor } from '@capacitor/core'
import { log } from '@/lib/logger'

const isNativeCapacitor = () => {
  try {
    return Boolean(Capacitor?.isNativePlatform?.())
  } catch {
    return false
  }
}

const initResumeBus = () => {
  try {
    if (typeof window === 'undefined') return

    // Avoid duplicate listeners in DEV/HMR.
    if (window.__JOBY_RESUME_BUS__?.initialized === true) return

    const RESUME_THROTTLE_MS = 900

    window.__JOBY_RESUME_BUS__ = {
      initialized: true,
      lastEmitAt: 0,
      throttleMs: RESUME_THROTTLE_MS,
      capacitorHandle: null,
    }

    const canEmitNow = () => {
      try {
        if (typeof document === 'undefined') return true
        const state = document.visibilityState
        if (!state) return true
        return state === 'visible'
      } catch {
        return true
      }
    }

    const emitResume = (source, extraDetail) => {
      try {
        if (!canEmitNow()) return

        const now = Date.now()
        const bus = window.__JOBY_RESUME_BUS__
        if (bus && typeof bus.lastEmitAt === 'number') {
          if (now - bus.lastEmitAt < RESUME_THROTTLE_MS) return
          bus.lastEmitAt = now
        }

        window.dispatchEvent(
          new CustomEvent('joby:resume', {
            detail: {
              source: String(source || 'unknown'),
              at: now,
              ...(extraDetail && typeof extraDetail === 'object' ? extraDetail : null),
            },
          })
        )
      } catch {
        // ignore
      }
    }

    const onFocus = () => emitResume('focus')

    const onPageShow = (event) => {
      emitResume('pageshow', { persisted: Boolean(event?.persisted) })
    }

    const onVisibilityChange = () => {
      try {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      } catch {
        // ignore
      }
      emitResume('visibilitychange')
    }

    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onPageShow)
    try {
      document.addEventListener('visibilitychange', onVisibilityChange)
    } catch {
      // ignore
    }

    // Native (Capacitor): use App.appStateChange for reliable resume.
    if (isNativeCapacitor()) {
      import('@capacitor/app')
        .then(({ App }) => {
          try {
            const bus = window.__JOBY_RESUME_BUS__
            if (bus?.capacitorHandle) return

            const handle = App.addListener('appStateChange', (state) => {
              if (state?.isActive) emitResume('capacitor')
            })

            if (bus) bus.capacitorHandle = handle
          } catch {
            // ignore
          }
        })
        .catch(() => {
          // ignore
        })
    }
  } catch {
    // ignore
  }
}

// PWA Service Worker:
// - Em produção web, registramos normalmente.
// - Em DEV, desregistramos (se existir) para não quebrar HMR nem servir cache/bundle antigo.
// - Em Capacitor (app nativo), DESLIGAMOS o SW para evitar cache antigo mesmo após atualizar APK.
if (import.meta.env.DEV || isNativeCapacitor()) {
  unregisterServiceWorker()
  clearServiceWorkerCache()
  // Limpeza extra (caches API) para evitar assets antigos presos.
  try {
    if ('caches' in window) {
      caches.keys().then((keys) => {
        keys.forEach((k) => {
          try {
            caches.delete(k)
          } catch {
            // ignore
          }
        })
      })
    }
  } catch {
    // ignore
  }
} else {
  registerServiceWorker()
}

// DEV helper: enable image debug logs without using the console.
// Usage:
// - Add `?imgDebug=1` to enable (persists in localStorage)
// - Add `?imgDebug=0` to disable
if (import.meta.env.DEV) {
  try {
    const params = new URLSearchParams(window.location.search)
    const fromQuery = params.get('imgDebug')
    const key = 'joby:imgDebug'

    if (fromQuery === '1') {
      localStorage.setItem(key, '1')
    } else if (fromQuery === '0') {
      localStorage.removeItem(key)
    }

    const enabled = localStorage.getItem(key) === '1'
    window.__JOBY_IMAGE_DEBUG__ = enabled
    if (enabled) {
      log.debug('IMG', 'Image debug enabled (window.__JOBY_IMAGE_DEBUG__ = true)')
    }
  } catch {
    // ignore
  }
}

const isLikelyChunkLoadError = (err) => {
  const message =
    typeof err === 'string'
      ? err
      : err?.message || err?.reason?.message || String(err || '')

  return (
    /ChunkLoadError/i.test(message) ||
    /Loading chunk\s+\d+\s+failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  )
}

const reloadOnceWithCacheBust = () => {
  const key = 'joby_chunk_reload_done'
  if (sessionStorage.getItem(key) === '1') return
  sessionStorage.setItem(key, '1')

  const url = new URL(window.location.href)
  url.searchParams.set('v', String(Date.now()))
  window.location.replace(url.toString())
}

const tryHardReloadRecover = async () => {
  const key = 'joby_hard_reload_recover_done'
  if (sessionStorage.getItem(key) === '1') return
  sessionStorage.setItem(key, '1')

  // Em produção, o Service Worker pode segurar um "app shell" antigo.
  // Ao detectar erro de chunk/import, fazemos uma limpeza agressiva para o usuário
  // não precisar recarregar manualmente.
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.allSettled(regs.map((r) => r.unregister()))
    }
  } catch {
    // ignore
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.allSettled(keys.map((k) => caches.delete(k)))
    }
  } catch {
    // ignore
  }

  // Também tenta limpar via SW (quando houver controller)
  try {
    clearServiceWorkerCache()
  } catch {
    // ignore
  }

  reloadOnceWithCacheBust()
}

try {
  if (!window.__JOBY_GLOBAL_ERROR_HOOKS__) {
    window.__JOBY_GLOBAL_ERROR_HOOKS__ = true

    const shouldLogChunkErrorOnce = () => {
      try {
        const key = 'joby_chunk_error_logged'
        if (sessionStorage.getItem(key) === '1') return false
        sessionStorage.setItem(key, '1')
        return true
      } catch {
        return true
      }
    }

    window.addEventListener('unhandledrejection', (event) => {
      try {
        const reason = event?.reason
        const isChunkLoadError = isLikelyChunkLoadError(reason)

        // Reduce spam: ChunkLoadError tends to cascade; log once per session.
        if (!isChunkLoadError || shouldLogChunkErrorOnce()) {
          log.error('APP', 'unhandledrejection', { reason, isChunkLoadError })
        }

        if (isChunkLoadError) {
          void tryHardReloadRecover()
        }
      } catch {
        // ignore
      }
    })

    window.addEventListener('error', (event) => {
      try {
        const errOrMessage = event?.error || event?.message
        const isChunkLoadError = isLikelyChunkLoadError(errOrMessage)

        if (!isChunkLoadError || shouldLogChunkErrorOnce()) {
          log.error('APP', 'window_error', {
            message: event?.message,
            filename: event?.filename,
            lineno: event?.lineno,
            colno: event?.colno,
            error: event?.error,
            isChunkLoadError,
          })
        }

        if (isChunkLoadError) {
          void tryHardReloadRecover()
        }
      } catch {
        // ignore
      }
    })
  }
} catch {
  // ignore
}

initResumeBus()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
