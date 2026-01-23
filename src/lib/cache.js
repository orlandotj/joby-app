// Cache simples para dados do Supabase
class SimpleCache {
  constructor(ttl = 5 * 60 * 1000) {
    // 5 minutos padrão
    this.cache = new Map()
    this.ttl = ttl
  }

  set(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    })
  }

  get(key) {
    const item = this.cache.get(key)
    if (!item) return null

    const isExpired = Date.now() - item.timestamp > this.ttl
    if (isExpired) {
      this.cache.delete(key)
      return null
    }

    return item.value
  }

  has(key) {
    return this.get(key) !== null
  }

  clear() {
    this.cache.clear()
  }

  delete(key) {
    this.cache.delete(key)
  }
}

// Instância global
export const profileCache = new SimpleCache(5 * 60 * 1000) // 5 min
export const videosCache = new SimpleCache(2 * 60 * 1000) // 2 min
export const servicesCache = new SimpleCache(10 * 60 * 1000) // 10 min

// Helper para criar chave de cache
export const getCacheKey = (table, params) => {
  return `${table}:${JSON.stringify(params)}`
}
