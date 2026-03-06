// Service Worker para PWA
// Objetivo: evitar comportamento "só funciona após dar reload" (stale shell / chunks)
// Estratégia:
// - HTML/navegação: Network First com fallback offline para /index.html
// - Assets versionados do Vite (/assets/*): Cache First (safe, pois nomes são hash)
// - Não cachear JSON/API/rotas dinâmicas (reduz inconsistências)

const CACHE_VERSION = 'v3'
const PAGES_CACHE = `joby-pages-${CACHE_VERSION}`
const ASSETS_CACHE = `joby-assets-${CACHE_VERSION}`

const PRECACHE_URLS = ['/index.html', '/manifest.json', '/']

const isHtmlNavigation = (request) => {
  if (request.mode === 'navigate') return true
  const accept = request.headers.get('accept') || ''
  return accept.includes('text/html')
}

const isVersionedAsset = (url) => {
  // Vite build: /assets/<name>.<hash>.(js|css|...)
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/')
}

const shouldIgnore = (request, url) => {
  // Ignorar requisições não-GET
  if (request.method !== 'GET') return true

  // Ignorar requisições para APIs externas (Supabase, etc.)
  if (url.origin !== self.location.origin) return true

  // Evitar cachear requests de dados (JSON) e outros endpoints dinâmicos
  const accept = request.headers.get('accept') || ''
  if (accept.includes('application/json')) return true

  return false
}

// Instalar Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(PAGES_CACHE)
        await Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch(() => {
              // ignora falhas individuais (404, etc.)
            })
          )
        )
      } catch (error) {
        console.error('Erro ao criar cache:', error)
      }
    })()
  )
  self.skipWaiting()
})

// Ativar Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== PAGES_CACHE && cacheName !== ASSETS_CACHE) {
            console.log('Removendo cache antigo:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (shouldIgnore(request, url)) return

  event.respondWith(
    (async () => {
      // 1) Navegação/HTML: Network First (evita shell stale) + fallback offline
      if (isHtmlNavigation(request)) {
        try {
          const response = await fetch(request)
          // Atualiza o cache do app shell (offline fallback)
          if (response && response.status === 200) {
            const cache = await caches.open(PAGES_CACHE)
            cache.put('/index.html', response.clone())
            cache.put('/', response.clone())
          }
          return response
        } catch {
          const cached = await caches.match('/index.html')
          if (cached) return cached
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
        }
      }

      // 2) Assets versionados (/assets/*): Cache First
      if (isVersionedAsset(url)) {
        const cached = await caches.match(request)
        if (cached) return cached

        const response = await fetch(request)
        if (response && response.status === 200) {
          const cache = await caches.open(ASSETS_CACHE)
          cache.put(request, response.clone())
        }
        return response
      }

      // 3) Outros GET same-origin: Network only (sem cache)
      return fetch(request)
    })()
  )
})

// Limpar caches antigos periodicamente
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting()
  }

  if (event.data === 'clearCache') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        )
      })
    )
  }
})
