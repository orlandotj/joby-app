import { useEffect, useMemo, useRef, useState } from 'react'

const readOnline = () => {
  try {
    if (typeof navigator === 'undefined') return true
    // navigator.onLine is best-effort; treat undefined as online.
    return navigator.onLine !== false
  } catch {
    return true
  }
}

export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(readOnline)
  const lastToastAtRef = useRef(0)

  useEffect(() => {
    const update = () => setIsOnline(readOnline())

    update()

    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    window.addEventListener('joby:resume', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      window.removeEventListener('joby:resume', update)
    }
  }, [])

  const isOffline = !isOnline

  const rateLimitGate = (minMs = 3000) => {
    const now = Date.now()
    if (now - lastToastAtRef.current < minMs) return false
    lastToastAtRef.current = now
    return true
  }

  return useMemo(
    () => ({
      isOnline,
      isOffline,
      // helper for callers that want to toast/bannner without spamming
      rateLimitGate,
    }),
    [isOnline, isOffline]
  )
}
