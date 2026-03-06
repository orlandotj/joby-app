const STORAGE_KEY = 'joby:profileCountersCache:v1'
const MAX_ENTRIES = 200
const TTL_MS = 30 * 60 * 1000 // 30 minutes

const memory = new Map()
let storageLoaded = false
let storageCache = {}

const now = () => Date.now()

const isExpired = (entry) => {
  if (!entry || typeof entry !== 'object') return true
  const ts = Number(entry.ts || 0)
  if (!ts) return true
  return now() - ts > TTL_MS
}

const loadFromStorageOnce = () => {
  if (storageLoaded) return
  storageLoaded = true

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') storageCache = parsed
  } catch {
    // ignore
  }
}

const persistToStorage = () => {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(storageCache))
  } catch {
    // ignore
  }
}

const prune = () => {
  // Remove expirados
  for (const [id, entry] of memory.entries()) {
    if (isExpired(entry)) memory.delete(id)
  }

  loadFromStorageOnce()
  for (const id of Object.keys(storageCache)) {
    if (isExpired(storageCache[id])) delete storageCache[id]
  }

  // Enforce max entries by ts
  const ids = Object.keys(storageCache)
  if (ids.length > MAX_ENTRIES) {
    ids
      .sort((a, b) => Number(storageCache[a]?.ts || 0) - Number(storageCache[b]?.ts || 0))
      .slice(0, Math.max(0, ids.length - MAX_ENTRIES))
      .forEach((id) => delete storageCache[id])
  }

  persistToStorage()
}

export const getCachedProfileCounters = (profileId) => {
  if (!profileId) return null

  const mem = memory.get(profileId)
  if (mem && !isExpired(mem)) return mem

  loadFromStorageOnce()
  const stored = storageCache[profileId]
  if (stored && !isExpired(stored)) {
    memory.set(profileId, stored)
    return stored
  }

  return null
}

export const setCachedProfileCounters = (
  profileId,
  { followersCount, followingCount, isFollowing }
) => {
  if (!profileId) return

  const entry = {
    followersCount: Number.isFinite(followersCount) ? followersCount : 0,
    followingCount: Number.isFinite(followingCount) ? followingCount : 0,
    isFollowing: !!isFollowing,
    ts: now(),
  }

  memory.set(profileId, entry)

  loadFromStorageOnce()
  storageCache[profileId] = entry
  prune()
}
