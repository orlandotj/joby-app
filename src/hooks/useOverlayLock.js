import { useEffect, useRef } from 'react'

const OVERLAY_CLASS = 'joby-overlay-open'
let scrollLockCount = 0

const canUseDom = () =>
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  !!document.body &&
  !!document.documentElement

const setOverlayClass = (enabled) => {
  if (!canUseDom()) return
  const html = document.documentElement
  const body = document.body

  if (enabled) {
    html.classList.add(OVERLAY_CLASS)
    body.classList.add(OVERLAY_CLASS)
    return
  }

  html.classList.remove(OVERLAY_CLASS)
  body.classList.remove(OVERLAY_CLASS)
}

export const acquireOverlayLock = ({ lockScroll = true, navMode = 'dim' } = {}) => {
  if (!canUseDom()) return () => {}

  // Mantém compatibilidade de assinatura, mas o comportamento visual pré-f432bbd
  // dependia apenas de "overlay-open" quando o overlay trava scroll.
  void navMode

  // Overlays que NÃO travam scroll não devem acionar o modo "full-screen overlay".
  if (!lockScroll) return () => {}

  scrollLockCount += 1
  if (scrollLockCount === 1) setOverlayClass(true)

  let released = false
  return () => {
    if (released) return
    released = true

    scrollLockCount = Math.max(0, scrollLockCount - 1)
    if (scrollLockCount === 0) setOverlayClass(false)
  }
}

export const useOverlayLock = (active, { lockScroll = true, navMode = 'dim' } = {}) => {
  const releaseRef = useRef(null)

  useEffect(() => {
    if (!active) {
      if (releaseRef.current) {
        releaseRef.current()
        releaseRef.current = null
      }
      return
    }

    if (!releaseRef.current) releaseRef.current = acquireOverlayLock({ lockScroll, navMode })

    return () => {
      if (releaseRef.current) {
        releaseRef.current()
        releaseRef.current = null
      }
    }
  }, [active, lockScroll, navMode])
}
