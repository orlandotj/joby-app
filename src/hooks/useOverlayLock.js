import { useEffect, useRef } from 'react'

const OVERLAY_CLASS = 'joby-overlay-open'
const SCROLL_LOCK_CLASS = 'joby-overlay-scroll-locked'
const NAV_HIDDEN_CLASS = 'joby-overlay-nav-hidden'
const NAV_DIM_CLASS = 'joby-overlay-nav-dim'

let overlayCount = 0
let scrollLockCount = 0
let navHiddenCount = 0
let navDimCount = 0
let restoreState = null

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

const setScrollLockClass = (enabled) => {
  if (!canUseDom()) return
  const html = document.documentElement
  const body = document.body

  if (enabled) {
    html.classList.add(SCROLL_LOCK_CLASS)
    body.classList.add(SCROLL_LOCK_CLASS)
    return
  }

  html.classList.remove(SCROLL_LOCK_CLASS)
  body.classList.remove(SCROLL_LOCK_CLASS)
}

const setNavHiddenClass = (enabled) => {
  if (!canUseDom()) return
  const html = document.documentElement
  const body = document.body

  if (enabled) {
    html.classList.add(NAV_HIDDEN_CLASS)
    body.classList.add(NAV_HIDDEN_CLASS)
    return
  }

  html.classList.remove(NAV_HIDDEN_CLASS)
  body.classList.remove(NAV_HIDDEN_CLASS)
}

const setNavDimClass = (enabled) => {
  if (!canUseDom()) return
  const html = document.documentElement
  const body = document.body

  if (enabled) {
    html.classList.add(NAV_DIM_CLASS)
    body.classList.add(NAV_DIM_CLASS)
    return
  }

  html.classList.remove(NAV_DIM_CLASS)
  body.classList.remove(NAV_DIM_CLASS)
}

const updateNavClasses = () => {
  const hidden = navHiddenCount > 0
  const dim = !hidden && navDimCount > 0
  setNavHiddenClass(hidden)
  setNavDimClass(dim)
}

const lockBodyFixed = () => {
  if (!canUseDom()) return
  const body = document.body
  const scrollY = window.scrollY || document.documentElement.scrollTop || 0

  const scrollbarGap = Math.max(
    0,
    (window.innerWidth || 0) - (document.documentElement.clientWidth || 0)
  )

  restoreState = {
    scrollY,
    position: body.style.position,
    top: body.style.top,
    width: body.style.width,
    overflow: body.style.overflow,
    paddingRight: body.style.paddingRight,
  }

  if (scrollbarGap) body.style.paddingRight = `${scrollbarGap}px`
  body.style.position = 'fixed'
  body.style.top = `-${scrollY}px`
  body.style.width = '100%'
  body.style.overflow = 'hidden'
}

const unlockBodyFixed = () => {
  if (!canUseDom()) return
  const body = document.body
  const prev = restoreState
  restoreState = null
  if (!prev) return

  body.style.position = prev.position
  body.style.top = prev.top
  body.style.width = prev.width
  body.style.overflow = prev.overflow
  body.style.paddingRight = prev.paddingRight

  window.scrollTo(0, prev.scrollY || 0)
}

export const acquireOverlayLock = ({ lockScroll = true, navMode = 'dim' } = {}) => {
  if (!canUseDom()) return () => {}

  // Nova regra: nunca esconder bottom nav; tratar "hidden" como "dim".
  const ownedNavMode = navMode === 'hidden' ? 'dim' : navMode

  overlayCount += 1
  if (lockScroll) scrollLockCount += 1
  if (ownedNavMode === 'dim') navDimCount += 1
  else navHiddenCount += 1

  if (overlayCount === 1) setOverlayClass(true)
  if (scrollLockCount === 1) {
    setScrollLockClass(true)
    lockBodyFixed()
  }
  updateNavClasses()

  let released = false
  return () => {
    if (released) return
    released = true

    overlayCount = Math.max(0, overlayCount - 1)
    if (lockScroll) scrollLockCount = Math.max(0, scrollLockCount - 1)
    if (ownedNavMode === 'dim') navDimCount = Math.max(0, navDimCount - 1)
    else navHiddenCount = Math.max(0, navHiddenCount - 1)

    if (scrollLockCount === 0) {
      unlockBodyFixed()
      setScrollLockClass(false)
    }
    if (overlayCount === 0) setOverlayClass(false)
    updateNavClasses()
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
