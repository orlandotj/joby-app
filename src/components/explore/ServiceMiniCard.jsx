import React from 'react'
import { Card } from '@/components/ui/card'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { MapPin, Star } from 'lucide-react'
import { formatPriceUnit } from '@/lib/priceUnit'

const getLocationLabel = (service) => {
  const loc = String(service?.user?.location || service?.location || '').trim()
  return loc
}

const getProfessionLabel = (service) => {
  const prof = String(service?.user?.profession || '').trim()
  if (prof) return prof
  const cat = String(service?.category || '').trim()
  return cat
}

const formatRating = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n.toFixed(1)
}

const formatDistance = (service) => {
  const n = Number(service?.distance_km ?? service?.distanceKm ?? service?.distance)
  if (!Number.isFinite(n) || n <= 0) return null
  // keep it simple; avoid locale surprises
  const rounded = n < 10 ? Math.round(n * 10) / 10 : Math.round(n)
  return `${rounded}km`
}

const ServiceMiniCard = ({ service, onOpen }) => {
  const coverSrc = useResolvedStorageUrl(service?.image || '')
  const title = service?.title || 'Serviço'
  const profession = getProfessionLabel(service)
  const location = getLocationLabel(service)
  const distance = formatDistance(service)
  const ratingNum = Number(service?.user?.rating)
  const showRating = Number.isFinite(ratingNum) && ratingNum > 0
  const rating = showRating ? ratingNum.toFixed(1) : null
  const priceUnit = formatPriceUnit(service?.price_unit || service?.priceUnit || 'hora')

  return (
    <button type="button" className="w-full min-w-0 text-left flex flex-col" onClick={() => onOpen?.(service)}>
      <div className="text-[13px] font-semibold text-foreground leading-tight truncate mb-2">{title}</div>

      <Card className="relative h-[76px] bg-card border-0 shadow-none ring-1 ring-border/40 hover:shadow-sm transition-shadow rounded-2xl overflow-hidden p-0">
        <div className="flex items-stretch min-w-0 h-full">
          <div className="relative w-16 shrink-0 h-full bg-muted overflow-hidden">
            {coverSrc ? (
              <img src={coverSrc} alt={title} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 w-full h-full bg-muted" />
            )}
          </div>

          <div className="min-w-0 flex-1 flex flex-col gap-0.5 pl-2 pr-0 py-2.5">
            {profession ? (
              <div className="text-[12px] font-semibold text-foreground leading-tight truncate">
                {profession}
              </div>
            ) : (
              <div className="h-[14px]" aria-hidden="true" />
            )}

            {(location || distance) ? (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
                <MapPin size={13} className="shrink-0" />
                <span className="truncate">
                  {location || ''}
                  {location && distance ? ` • ${distance}` : distance ? distance : ''}
                </span>
              </div>
            ) : (
              <div className="h-[14px]" aria-hidden="true" />
            )}

            <div className="flex items-baseline justify-between gap-3 whitespace-nowrap">
              <div className="flex items-baseline gap-1 min-w-0">
                <span className="text-[13px] font-bold text-orange-500">R$ {service?.price ?? '--'}</span>
                <span className="text-[11px] text-muted-foreground">/ {priceUnit}</span>
              </div>
              {rating ? (
                <div className="shrink-0 inline-flex items-center gap-1 text-[12px] text-foreground">
                  <Star size={14} className="text-orange-500" />
                  <span className="font-semibold">{rating}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Card>
    </button>
  )
}

export default ServiceMiniCard
