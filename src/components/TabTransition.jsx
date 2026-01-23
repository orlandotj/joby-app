import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

export const TabTransition = ({
  value,
  order = [],
  className,
  children,
  distancePx = 18,
  durationSec = 0.18,
} = {}) => {
  const reduceMotion = useReducedMotion()
  const prevIndexRef = useRef(-1)
  const [direction, setDirection] = useState(0)

  useEffect(() => {
    const nextIndex = Array.isArray(order) ? order.indexOf(value) : -1
    const prevIndex = prevIndexRef.current

    if (prevIndex === -1 || nextIndex === -1 || prevIndex === nextIndex) {
      setDirection(0)
    } else {
      setDirection(nextIndex > prevIndex ? 1 : -1)
    }

    prevIndexRef.current = nextIndex
  }, [value, order])

  const variants = useMemo(() => {
    const dist = reduceMotion ? 0 : distancePx

    return {
      enter: (dir) => ({
        opacity: 0,
        x: dir === 0 ? dist : dir * dist,
      }),
      center: {
        opacity: 1,
        x: 0,
      },
      exit: (dir) => ({
        opacity: 0,
        x: dir === 0 ? -dist : dir * -dist,
      }),
    }
  }, [reduceMotion, distancePx])

  const transition = useMemo(() => {
    if (reduceMotion) return { duration: 0.1 }

    return {
      duration: durationSec,
      ease: [0.22, 1, 0.36, 1],
    }
  }, [reduceMotion, durationSec])

  return (
    <div className={cn('relative', className)}>
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={String(value)}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={transition}
          style={{ willChange: 'transform, opacity', transform: 'translateZ(0)' }}
        >
          {typeof children === 'function' ? children() : children}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
