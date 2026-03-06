import React from 'react'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export const SwipeTabsList = ({
  tabs,
  listClassName,
  triggerClassName,
  tabClassName,
  onTabClick,
}) => {
  const lastInvokeAtRef = React.useRef(0)

  const invokeTabClick = React.useCallback(
    (value) => {
      if (!onTabClick) return
      const now = Date.now()
      if (now - lastInvokeAtRef.current < 250) return
      lastInvokeAtRef.current = now
      onTabClick(value)
    },
    [onTabClick]
  )

  return (
    <TabsList className={cn(listClassName)} data-swipe-tabs-allow="true">
      {tabs.map((t) => {
        const value = typeof t === 'string' ? t : t.value
        const label = typeof t === 'string' ? t : t.label
        const itemClass =
          typeof t === 'object' && t?.triggerClassName
            ? t.triggerClassName
            : triggerClassName

        return (
          <TabsTrigger
            key={value}
            value={value}
            className={cn(tabClassName, itemClass)}
            onPointerDown={(e) => {
              if (e?.pointerType === 'touch') invokeTabClick(value)
            }}
            onClick={() => invokeTabClick(value)}
          >
            {label}
          </TabsTrigger>
        )
      })}
    </TabsList>
  )
}
