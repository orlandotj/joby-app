import React, { useMemo } from 'react'
import PopularServiceCategoryCard from '@/components/explore/PopularServiceCategoryCard'

const shuffle = (arr) => {
  const a = [...(arr || [])]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const pickRandomServices = (services, { limit = 12 } = {}) => {
  const list = Array.isArray(services) ? services : []

  const isHourUnit = (s) => {
    const u = String(s?.price_unit || s?.priceUnit || '').toLowerCase()
    return u === 'hora' || u === 'hour' || u === 'hr'
  }

  // Prefer hourly services (since UI will show “/ hora”). Fill with any if not enough.
  const hourly = list.filter(isHourUnit)
  const rest = list.filter((s) => !isHourUnit(s))

  return [...shuffle(hourly), ...shuffle(rest)].slice(0, limit)
}

const PopularServicesStrip = ({ services = [], onViewAll }) => {
  const items = useMemo(() => pickRandomServices(services, { limit: 12 }), [services])

  if (items.length === 0) return null

  return (
    <div className="w-full overflow-x-auto overscroll-x-contain touch-pan-x">
      <div className="flex gap-3 w-max snap-x snap-mandatory pb-1 pr-3">
        {items.map((s) => (
          <PopularServiceCategoryCard
            key={s.id || `${s.title}:${s.created_at || ''}`}
            service={s}
            onClick={onViewAll}
          />
        ))}
      </div>
    </div>
  )
}

export default PopularServicesStrip
