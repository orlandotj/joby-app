import React, { useMemo } from 'react'
import ServiceMiniCard from '@/components/explore/ServiceMiniCard'
import ServiceCategoryCard from '@/components/explore/ServiceCategoryCard'
import PopularServicesStrip from '@/components/explore/PopularServicesStrip'

const buildPopularCategories = (services, { limit = 8 } = {}) => {
  const byCategory = new Map()

  for (const s of services || []) {
    const key = String(s?.category || '').trim()
    if (!key) continue

    const price = Number(s?.price)
    const entry = byCategory.get(key) || {
      category: key,
      cover: s?.image || '',
      minPrice: Number.isFinite(price) ? price : null,
      count: 0,
    }

    entry.count += 1
    if (!entry.cover && s?.image) entry.cover = s.image
    if (Number.isFinite(price)) {
      entry.minPrice = entry.minPrice == null ? price : Math.min(entry.minPrice, price)
    }

    byCategory.set(key, entry)
  }

  return Array.from(byCategory.values())
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, limit)
}

const pickDistanceKm = (service) => {
  const n = Number(service?.distance_km ?? service?.distanceKm ?? service?.distance)
  return Number.isFinite(n) && n > 0 ? n : null
}

const ServicesShowcase = ({ services = [], onOpenService, onViewAll, maxNearby = 4, showViewAll = true }) => {
  const nearby = useMemo(() => {
    const list = Array.isArray(services) ? services : []
    const limit = Math.max(0, Number(maxNearby) || 0)
    if (limit <= 0) return []

    const decorated = list.map((s, idx) => ({ s, idx, km: pickDistanceKm(s) }))
    const hasAnyDistance = decorated.some((x) => x.km != null)
    if (!hasAnyDistance) return list.slice(0, limit)

    const withKm = decorated
      .filter((x) => x.km != null)
      .sort((a, b) => (a.km || 0) - (b.km || 0) || a.idx - b.idx)
      .map((x) => x.s)

    const withoutKm = decorated
      .filter((x) => x.km == null)
      .sort((a, b) => a.idx - b.idx)
      .map((x) => x.s)

    return [...withKm, ...withoutKm].slice(0, limit)
  }, [services, maxNearby])

  const popularCategories = useMemo(() => buildPopularCategories(services, { limit: 10 }), [services])

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Serviços próximos de você</h2>
          {showViewAll ? (
            <button
              type="button"
              className="text-xs text-orange-500 font-semibold"
              onClick={onViewAll}
            >
              Ver todos
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-6">
          {nearby.map((s) => (
            <ServiceMiniCard key={s.id} service={s} onOpen={onOpenService} />
          ))}
        </div>
      </div>

      {popularCategories.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">Categorias</h2>
            {showViewAll ? (
              <button
                type="button"
                className="text-xs text-orange-500 font-semibold"
                onClick={onViewAll}
              >
                Ver todos
              </button>
            ) : null}
          </div>

          <div className="w-full overflow-x-auto overscroll-x-contain touch-pan-x">
            <div className="flex gap-3 w-max snap-x snap-mandatory pb-1 pr-3">
              {popularCategories.map((c) => (
                <ServiceCategoryCard
                  key={c.category}
                  category={c.category}
                  cover={c.cover}
                  minPrice={c.minPrice}
                  onClick={onViewAll}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">Serviços mais solicitados</h2>
          {showViewAll ? (
            <button type="button" className="text-xs text-orange-500 font-semibold" onClick={onViewAll}>
              Ver todos
            </button>
          ) : null}
        </div>

        <PopularServicesStrip services={services} onViewAll={onViewAll} />
      </div>
    </div>
  )
}

export default ServicesShowcase
