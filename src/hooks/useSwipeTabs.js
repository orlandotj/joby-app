import { useCallback, useMemo, useRef } from 'react'

const isInteractiveElement = (target) => {
  if (!(target instanceof Element)) return false

  // Permite swipe em cima do header de tabs (mesmo sendo botões)
  if (target.closest('[data-swipe-tabs-allow="true"]')) return false

  return Boolean(
    target.closest(
      'input, textarea, select, option, button, a, [role="button"], [contenteditable="true"], [data-swipe-tabs-ignore="true"]'
    )
  )
}

export const useSwipeTabs = ({
  tabs,
  value,
  onValueChange,
  thresholdPx = 60,
  lockRatio = 1.2,
  lockDistancePx = 10,
  disabled = false,
} = {}) => {
  const tabValues = useMemo(() => {
    if (!Array.isArray(tabs)) return []
    return tabs.map((t) => (typeof t === 'string' ? t : t?.value)).filter(Boolean)
  }, [tabs])

  const swipeRef = useRef({
    x: 0,
    y: 0,
    active: false,
    locked: false,
    horizontalIntent: false,
  })

  const swipeTo = useCallback(
    (direction) => {
      const idx = tabValues.indexOf(value)
      if (idx < 0) return

      const nextIdx = direction === 'next' ? idx + 1 : idx - 1
      const clamped = Math.max(0, Math.min(tabValues.length - 1, nextIdx))
      if (clamped === idx) return

      onValueChange?.(tabValues[clamped])
    },
    [tabValues, value, onValueChange]
  )

  const onTouchStart = useCallback(
    (e) => {
      if (disabled) return
      if (isInteractiveElement(e?.target)) return

      const t = e?.touches?.[0]
      if (!t) return
      if (e.touches?.length > 1) return

      swipeRef.current = {
        x: t.clientX,
        y: t.clientY,
        active: true,
        locked: false,
        horizontalIntent: false,
      }
    },
    [disabled]
  )

  const onTouchMove = useCallback(
    (e) => {
      if (disabled) return
      const t = e?.touches?.[0]
      if (!t) return

      const s = swipeRef.current
      if (!s?.active || s.locked) return

      const dx = t.clientX - s.x
      const dy = t.clientY - s.y

      // Pequeno movimento: ainda não decide
      if (Math.abs(dx) < lockDistancePx && Math.abs(dy) < lockDistancePx) return

      // Se for claramente vertical, trava e não interfere
      if (Math.abs(dy) > Math.abs(dx) * lockRatio) {
        swipeRef.current.locked = true
        return
      }

      // Se for claramente horizontal, marca intenção (sem bloquear scroll vertical)
      if (Math.abs(dx) > Math.abs(dy) * lockRatio) {
        swipeRef.current.horizontalIntent = true
      }
    },
    [disabled, lockDistancePx, lockRatio]
  )

  const onTouchEnd = useCallback(
    (e) => {
      if (disabled) return
      const s = swipeRef.current
      if (!s?.active) return

      swipeRef.current.active = false

      const t = e?.changedTouches?.[0]
      if (!t) return

      const dx = t.clientX - s.x
      const dy = t.clientY - s.y

      const isHorizontal =
        Math.abs(dx) > thresholdPx &&
        Math.abs(dx) > Math.abs(dy) * lockRatio &&
        (s.horizontalIntent || Math.abs(dx) > Math.abs(dy))

      if (!isHorizontal) return

      if (dx < 0) swipeTo('next')
      else swipeTo('prev')
    },
    [disabled, thresholdPx, lockRatio, swipeTo]
  )

  const containerProps = useMemo(
    () => ({
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    }),
    [onTouchStart, onTouchMove, onTouchEnd]
  )

  return {
    tabValues,
    swipeTo,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    containerProps,
  }
}
