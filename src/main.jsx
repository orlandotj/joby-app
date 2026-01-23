import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App'
import '@/index.css'
import { registerServiceWorker } from '@/lib/serviceWorkerRegistration'

// Registrar Service Worker para PWA
registerServiceWorker()

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
      console.log('[DEBUG] Image debug enabled (window.__JOBY_IMAGE_DEBUG__ = true)')
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

window.addEventListener('unhandledrejection', (event) => {
  if (isLikelyChunkLoadError(event?.reason)) {
    reloadOnceWithCacheBust()
  }
})

window.addEventListener('error', (event) => {
  if (isLikelyChunkLoadError(event?.error || event?.message)) {
    reloadOnceWithCacheBust()
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
