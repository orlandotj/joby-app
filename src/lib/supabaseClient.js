import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
export const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  const message =
    'Configuração do Supabase ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ou VITE_SUPABASE_KEY) no .env'
  // Em dev, ajuda a diagnosticar. Em produção, falhar cedo é melhor que ficar quebrando silenciosamente.
  if (import.meta.env.DEV) {
    console.error(message)
  }
  throw new Error(message)
}

const baseFetch = (...args) => fetch(...args)

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

const fetchWithRetry = async (input, init = {}) => {
  const request = input instanceof Request ? input : null
  const method = String(init?.method || request?.method || 'GET').toUpperCase()

  // Retry only safe/idempotent methods to avoid duplicating writes.
  const maxRetries = method === 'GET' || method === 'HEAD' ? 2 : 0

  let lastError
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await baseFetch(input, init)
    } catch (err) {
      lastError = err
      if (attempt >= maxRetries) break

      // If aborted, don't retry.
      const msg = String(err?.message || err)
      if (msg.includes('AbortError')) break

      // Small backoff: 250ms, 750ms
      const delay = 250 * (attempt * 2 + 1)
      await sleep(delay, init?.signal)
    }
  }

  throw lastError
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: fetchWithRetry,
  },
})
