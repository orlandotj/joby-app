/**
 * Registra o Service Worker para funcionalidade PWA
 */
export const registerServiceWorker = () => {
  // Em desenvolvimento (Vite) o Service Worker costuma atrapalhar com cache e HMR.
  // Registramos apenas em produção.
  if (import.meta.env.DEV) {
    return
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((registration) => {
          // Verificar atualizações periodicamente
          setInterval(() => {
            registration.update()
          }, 1000 * 60 * 60) // A cada 1 hora
        })
        .catch((error) => {
          // Em produção, ainda é ok falhar sem quebrar o app.
          console.warn('Falha ao registrar Service Worker:', error)
        })
    })

    // Detectar quando uma nova versão está disponível
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })
  }
}

/**
 * Desregistra o Service Worker
 */
export const unregisterServiceWorker = () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister()
      })
      .catch((error) => {
        if (import.meta.env.DEV) {
          console.error('Erro ao desregistrar Service Worker:', error)
        }
      })
  }
}

/**
 * Limpa o cache do Service Worker
 */
export const clearServiceWorkerCache = () => {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage('clearCache')
  }
}
