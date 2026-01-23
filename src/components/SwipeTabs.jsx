import React from 'react'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export const SwipeTabsList = ({
  tabs,
  listClassName,
  triggerClassName,
  tabClassName,
}) => {
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
          <TabsTrigger key={value} value={value} className={cn(tabClassName, itemClass)}>
            {label}
          </TabsTrigger>
        )
      })}
    </TabsList>
  )
}
