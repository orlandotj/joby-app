import React from 'react'
import { Card } from '@/components/ui/card'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import {
  Paintbrush,
  Wrench,
  Zap,
  Hammer,
  Sparkles,
  Briefcase,
} from 'lucide-react'

const pickIcon = (label) => {
  const c = String(label || '').toLowerCase()

  if (c.includes('pint')) return Paintbrush
  if (c.includes('encan')) return Wrench
  if (c.includes('eletric')) return Zap
  if (c.includes('pedre') || c.includes('obra') || c.includes('alven')) return Hammer
  if (c.includes('limp') || c.includes('diar') || c.includes('fax') || c.includes('higi')) return Sparkles

  return Briefcase
}

const getProfession = (service) => {
  const prof = String(service?.user?.profession || '').trim()
  if (prof) return prof
  const cat = String(service?.category || '').trim()
  return cat
}

const PopularServiceCategoryCard = ({ service, onClick }) => {
  const coverSrc = useResolvedStorageUrl(service?.image || '')
  const title = getProfession(service) || 'Profissional'
  const Icon = pickIcon(title)
  const price = service?.price

  return (
    <button type="button" className="snap-start text-left" onClick={onClick}>
      <Card className="bg-card border-border/40 overflow-hidden hover:shadow-sm transition-shadow rounded-2xl">
        <div className="w-[128px]">
          <div className="relative h-[62px] bg-muted overflow-hidden">
            {coverSrc ? (
              <img src={coverSrc} alt={title} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 w-full h-full bg-muted" />
            )}

            <span className="absolute left-2 -bottom-3 h-7 w-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center">
              <Icon size={14} className="text-orange-500" />
            </span>
          </div>

          <div className="pt-4 pb-2 px-2">
            <div className="text-xs font-semibold text-foreground leading-tight truncate">{title}</div>

            {price != null ? (
              <div className="mt-0.5 text-[11px] text-muted-foreground leading-tight whitespace-nowrap">
                <span className="text-orange-500 font-semibold">R$ {price}</span>
                <span className="text-muted-foreground"> / hora</span>
              </div>
            ) : null}
          </div>
        </div>
      </Card>
    </button>
  )
}

export default PopularServiceCategoryCard
