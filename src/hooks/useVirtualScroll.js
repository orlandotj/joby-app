import { useEffect, useState, useRef, useCallback } from 'react'

/**
 * Hook customizado para Virtual Scrolling
 * Renderiza apenas items visíveis na viewport
 *
 * @param {Array} items - Array de items para renderizar
 * @param {number} itemHeight - Altura estimada de cada item em pixels
 * @param {number} overscan - Quantidade de items extras para renderizar (buffer)
 * @returns {Object} { visibleItems, containerProps, scrollerProps }
 */
export const useVirtualScroll = (items, itemHeight = 600, overscan = 2) => {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 10 })
  const containerRef = useRef(null)
  const scrollerRef = useRef(null)

  const updateVisibleRange = useCallback(() => {
    if (!containerRef.current) return

    const scrollTop = window.scrollY || document.documentElement.scrollTop
    const viewportHeight = window.innerHeight

    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const end = Math.min(
      items.length,
      Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan
    )

    setVisibleRange({ start, end })
  }, [items.length, itemHeight, overscan])

  useEffect(() => {
    updateVisibleRange()

    const handleScroll = () => {
      requestAnimationFrame(updateVisibleRange)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', updateVisibleRange, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', updateVisibleRange)
    }
  }, [updateVisibleRange])

  const visibleItems = items
    .slice(visibleRange.start, visibleRange.end)
    .map((item, index) => ({
      ...item,
      virtualIndex: visibleRange.start + index,
    }))

  const totalHeight = items.length * itemHeight
  const offsetY = visibleRange.start * itemHeight

  const containerProps = {
    ref: containerRef,
    style: {
      position: 'relative',
      height: `${totalHeight}px`,
    },
  }

  const scrollerProps = {
    ref: scrollerRef,
    style: {
      position: 'relative',
      transform: `translateY(${offsetY}px)`,
    },
  }

  return {
    visibleItems,
    containerProps,
    scrollerProps,
    totalHeight,
    offsetY,
  }
}

export default useVirtualScroll
