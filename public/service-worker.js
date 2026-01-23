// Service Worker para PWA - Cache offline
const CACHE_NAME = 'joby-cache-v1'
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  // Adicionar outros recursos estáticos conforme necessário
]

// Instalar Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        // cache.addAll falha por completo se 1 request falhar.
        // Aqui cacheamos individualmente para evitar quebrar a instalação.
        return Promise.allSettled(
          urlsToCache.map((url) =>
            cache.add(url).catch(() => {
              // ignora falhas individuais (ex: manifest ausente em dev, 404, etc.)
            })
          )
        )
      })
      .catch((error) => {
        console.error('Erro ao criar cache:', error)
      })
  )
  self.skipWaiting()
})

// Ativar Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Removendo cache antigo:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  self.clients.claim()
})

// Estratégia de cache: Network First com fallback para Cache
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Ignorar requisições não-GET
  if (request.method !== 'GET') {
    return
  }

  // Ignorar requisições para APIs externas (Supabase, etc)
  if (url.origin !== location.origin) {
    return
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Se a resposta for válida, clone e armazene no cache
        if (response.status === 200) {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone)
          })
        }
        return response
      })
      .catch(() => {
        // Se falhar, tente buscar do cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse
          }

          // Se não houver no cache e for navegação, retorna página offline
          if (request.mode === 'navigate') {
            return caches.match('/index.html')
          }

          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
          })
        })
      })
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
