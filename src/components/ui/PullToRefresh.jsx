import React, { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { log } from '@/lib/logger'

const DEFAULT_THRESHOLD_PX = 70
const MAX_PULL_PX = 140
const INDICATOR_MAX_HEIGHT_PX = 56

const clamp = (n, min, max) => Math.max(min, Math.min(max, n))

const PullToRefresh = ({
  enabled = false,
  onRefresh,
  isRefreshing,
  children,
  threshold = DEFAULT_THRESHOLD_PX,
  spinnerText = 'Atualizando…',
  className,
  style,
  ...rest
}) => {
  const containerRef = useRef(null)
  const startRef = useRef({ x: 0, y: 0 })
  const pullingRef = useRef(false)
  const lockRef = useRef(false)
  const pullPxRef = useRef(0)
  const thresholdRef = useRef(DEFAULT_THRESHOLD_PX)
  const refreshingRef = useRef(false)

  const [pullPx, setPullPx] = useState(0)
  const [internalRefreshing, setInternalRefreshing] = useState(false)

  const isControlled = typeof isRefreshing === 'boolean'
  const refreshing = isControlled ? isRefreshing : internalRefreshing

  const effectiveThreshold = useMemo(() => {
    const t = Number(threshold)
    return Number.isFinite(t) && t > 0 ? t : DEFAULT_THRESHOLD_PX
  }, [threshold])

  useEffect(() => {
    thresholdRef.current = effectiveThreshold
  }, [effectiveThreshold])

  useEffect(() => {
    refreshingRef.current = !!refreshing
  }, [refreshing])

  useEffect(() => {
    pullPxRef.current = Number(pullPx) || 0
  }, [pullPx])

  const getEffectiveScrollTop = () => {
    const el = containerRef.current
    if (!el) return Number(globalThis?.scrollY || 0)

    // If the element is actually scrollable, treat it as the scroll container.
    // Otherwise, fall back to window scroll.
    const isScrollable = el.scrollHeight > el.clientHeight + 1
    if (isScrollable) return Number(el.scrollTop || 0)

    return Number(globalThis?.scrollY || 0)
  }

  const resetPull = () => {
    pullingRef.current = false
    setPullPx(0)
  }

  const triggerRefresh = async () => {
    if (lockRef.current) return
    if (refreshing) return

    lockRef.current = true

    if (!isControlled) setInternalRefreshing(true)
    // keep indicator visible while refreshing
    setPullPx(Math.max(effectiveThreshold, 48))

    try {
      if (typeof onRefresh === 'function') {
        await onRefresh()
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        log.error('UI', '[PullToRefresh] onRefresh error:', err)
      }
    } finally {
      if (!isControlled) setInternalRefreshing(false)
      resetPull()
      lockRef.current = false
    }
  }

  useEffect(() => {
    // If parent controls refreshing, ensure we hide indicator when it stops.
    if (!isControlled) return
    if (refreshing) return
    resetPull()
  }, [isControlled, refreshing])

  useEffect(() => {
    if (!enabled) return
    const el = containerRef.current
    if (!el) return

    const onTouchStart = (ev) => {
      if (lockRef.current || refreshingRef.current) return
      if (getEffectiveScrollTop() > 1) return

      const t = ev.touches?.[0]
      if (!t) return

      startRef.current = { x: t.clientX, y: t.clientY }
      pullingRef.current = true
      setPullPx(0)
    }

    const onTouchMove = (ev) => {
      if (!pullingRef.current) return
      if (lockRef.current || refreshingRef.current) return

      const t = ev.touches?.[0]
      if (!t) return

      const dx = t.clientX - startRef.current.x
      const dy = t.clientY - startRef.current.y

      // ignore horizontal gestures
      if (Math.abs(dx) > Math.abs(dy)) return

      if (dy <= 0) {
        setPullPx(0)
        return
      }

      if (getEffectiveScrollTop() > 1) {
        resetPull()
        return
      }

      // prevent native overscroll only while pulling down at top
      if (ev.cancelable) ev.preventDefault()

      const next = clamp(dy, 0, MAX_PULL_PX)
      pullPxRef.current = next
      setPullPx(next)
    }

    const onTouchEnd = () => {
      if (!pullingRef.current) return

      const shouldRefresh = pullPxRef.current >= thresholdRef.current
      if (!shouldRefresh) {
        resetPull()
        return
      }

      void triggerRefresh()
    }

    const onTouchCancel = () => {
      resetPull()
    }

    // Important: touchmove must be non-passive so preventDefault works
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchCancel, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchCancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  const showIndicator = enabled && (refreshing || pullPx > 0)
  const indicatorHeight = showIndicator
    ? clamp(
        Math.round((pullPx / effectiveThreshold) * INDICATOR_MAX_HEIGHT_PX),
        24,
        INDICATOR_MAX_HEIGHT_PX
      )
    : 0

  const progress = clamp(pullPx / effectiveThreshold, 0, 1)
  const spinnerStyle = refreshing
    ? undefined
    : {
        transform: `rotate(${Math.round(progress * 360)}deg)`,
      }

  return (
    <div ref={containerRef} className={cn('relative', className)} style={style} {...rest}>
      <div
        aria-hidden={!showIndicator}
        className={cn(
          'w-full flex items-center justify-center overflow-hidden',
          showIndicator
            ? 'transition-[height] duration-150 ease-out'
            : 'transition-[height] duration-150 ease-in'
        )}
        style={{ height: showIndicator ? indicatorHeight : 0 }}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground select-none">
          <div
            className={cn(
              'h-4 w-4 rounded-full border-2 border-muted-foreground/30 border-t-foreground/70',
              refreshing ? 'animate-spin' : ''
            )}
            style={spinnerStyle}
          />
          {String(spinnerText || '').trim() ? <span>{String(spinnerText)}</span> : null}
        </div>
      </div>

      {children}
    </div>
  )
}

export default PullToRefresh
