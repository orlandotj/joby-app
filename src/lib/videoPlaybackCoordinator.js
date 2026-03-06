let activeKey = null
const registry = new Map() // key -> HTMLVideoElement

let userPlaybackUnlocked = false
let gestureHandlerInstalled = false

export const isUserPlaybackUnlocked = () => userPlaybackUnlocked

export const markUserPlaybackUnlocked = () => {
  userPlaybackUnlocked = true
}

export const tryUnmuteActiveVideo = () => {
  // Chrome blocks unmuting w/o a real user activation and may pause the media.
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userActivation : null
    if (ua && ua.isActive === false) return
  } catch {
    // ignore
  }

  if (!activeKey) return
  const el = registry.get(activeKey)
  if (!el) return
  try {
    if (el.muted) el.muted = false
  } catch {
    // ignore
  }
  try {
    const p = el.play?.()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch {
    // ignore
  }
}

// Call once (idempotent). Registers a global gesture handler so the first user
// interaction can be used to unlock audio playback, and opportunistically unmute
// the active video.
export const ensureUserPlaybackUnlockedOnFirstGesture = () => {
  if (gestureHandlerInstalled) return
  if (typeof window === 'undefined') return
  gestureHandlerInstalled = true

  const handler = () => {
    // Some gestures (like scroll) may fire pointer/touch events but not grant
    // user activation for media. Only proceed when the browser considers it active.
    try {
      const ua = typeof navigator !== 'undefined' ? navigator.userActivation : null
      if (ua && ua.isActive === false) return
    } catch {
      // ignore
    }

    markUserPlaybackUnlocked()
    tryUnmuteActiveVideo()
    window.removeEventListener('pointerdown', handler, true)
    window.removeEventListener('touchstart', handler, true)
    window.removeEventListener('keydown', handler, true)
  }

  window.addEventListener('pointerdown', handler, true)
  window.addEventListener('touchstart', handler, true)
  window.addEventListener('keydown', handler, true)
}

export const registerVideo = (key, element) => {
  const k = String(key ?? '')
  if (!k || !element) return
  registry.set(k, element)
}

export const unregisterVideo = (key) => {
  const k = String(key ?? '')
  if (!k) return
  registry.delete(k)
  if (activeKey === k) activeKey = null
}

export const getActiveVideoKey = () => activeKey

export const clearActiveVideoKey = (key) => {
  const k = String(key ?? '')
  if (!k) return
  if (activeKey === k) activeKey = null
}

export const requestExclusivePlayback = (key) => {
  const k = String(key ?? '')
  if (!k) return

  // Pause every other registered video to avoid double audio/video.
  for (const [otherKey, el] of registry.entries()) {
    if (!el) continue
    if (otherKey === k) continue
    try {
      if (!el.paused) el.pause()
    } catch {
      // ignore
    }
  }

  activeKey = k
}
