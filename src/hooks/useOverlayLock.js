import { useEffect, useRef } from 'react'

const OVERLAY_OPEN_CLASS = 'joby-overlay-open'
const HIDE_NAV_CLASS = 'joby-overlay-hide-nav'
let scrollLockCount = 0
let hideNavCount = 0

const canUseDom = () =>
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  !!document.body &&
  !!document.documentElement

const setRootClass = (className, enabled) => {
  if (!canUseDom()) return
  const html = document.documentElement
  const body = document.body

  if (enabled) {
    html.classList.add(className)
    body.classList.add(className)
    return
  }

  html.classList.remove(className)
  body.classList.remove(className)
}

const setOverlayOpenClass = (enabled) => setRootClass(OVERLAY_OPEN_CLASS, enabled)
const setHideNavClass = (enabled) => setRootClass(HIDE_NAV_CLASS, enabled)

export const acquireOverlayLock = ({ lockScroll = true, navMode = 'dim' } = {}) => {
  if (!canUseDom()) return () => {}

  const wantsScrollLock = !!lockScroll
  const wantsHideNav = navMode === 'hide'

  if (!wantsScrollLock && !wantsHideNav) return () => {}

  if (wantsScrollLock) {
    scrollLockCount += 1
    if (scrollLockCount === 1) setOverlayOpenClass(true)
  }

  if (wantsHideNav) {
    hideNavCount += 1
    if (hideNavCount === 1) setHideNavClass(true)
  }

  let released = false
  return () => {
    if (released) return
    released = true

    if (wantsScrollLock) {
      scrollLockCount = Math.max(0, scrollLockCount - 1)
      if (scrollLockCount === 0) setOverlayOpenClass(false)
    }

    if (wantsHideNav) {
      hideNavCount = Math.max(0, hideNavCount - 1)
      if (hideNavCount === 0) setHideNavClass(false)
    }
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
