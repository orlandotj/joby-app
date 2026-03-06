import React, { useLayoutEffect, useMemo, useRef } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'

const DEFAULT_MAX = 6

const normalizeBase = (base) => {
  const b = String(base || '')
  if (!b) return ''
  if (b === '/') return '/'
  return b.endsWith('/') ? b.slice(0, -1) : b
}

const matchBaseKey = (pathname, bases) => {
  const path = String(pathname || '')
  if (!path) return null

  for (const rawBase of bases) {
    const base = normalizeBase(rawBase)
    if (!base) continue

    if (base === '/') {
      if (path === '/') return '/'
      continue
    }

    if (path === base) return base
    if (path.startsWith(base + '/')) return base
  }

  return null
}

export const KeepAliveOutlet = ({ includeBases, maxEntries = DEFAULT_MAX }) => {
  const location = useLocation()
  const outlet = useOutlet()

  const bases = useMemo(() => (includeBases || []).map(normalizeBase).filter(Boolean), [includeBases])
  const activeKey = useMemo(() => matchBaseKey(location.pathname, bases), [bases, location.pathname])

  const cacheRef = useRef(new Map())
  const orderRef = useRef([])

  // Use layout effect so the active route is cached before paint (prevents blank screen on reload).
  useLayoutEffect(() => {
    if (!activeKey) return

    cacheRef.current.set(activeKey, outlet)

    const order = orderRef.current
    const nextOrder = [activeKey, ...order.filter((k) => k !== activeKey)]

    const cap = Math.max(1, Number(maxEntries) || DEFAULT_MAX)
    const trimmed = nextOrder.slice(0, cap)

    // Evict oldest
    for (const k of order) {
      if (!trimmed.includes(k)) cacheRef.current.delete(k)
    }

    orderRef.current = trimmed
  }, [activeKey, outlet, maxEntries])

  // Not a cached route -> behave like a normal Outlet.
  if (!activeKey) return outlet

  // On hard reload/first mount, the cache may not be populated yet. Never render an empty screen.
  const activeElement = cacheRef.current.get(activeKey) || outlet

  const cap = Math.max(1, Number(maxEntries) || DEFAULT_MAX)
  const keys = orderRef.current.includes(activeKey)
    ? orderRef.current
    : [activeKey, ...orderRef.current].slice(0, cap)

  const entries = keys
    .map((k) => [k, k === activeKey ? activeElement : cacheRef.current.get(k)])
    .filter(([, el]) => !!el)

  return (
    <>
      {entries.map(([key, element]) => (
        <div key={key} className={key === activeKey ? 'block' : 'hidden'}>
          {element}
        </div>
      ))}
    </>
  )
}
