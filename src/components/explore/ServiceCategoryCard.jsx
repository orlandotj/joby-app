import React from 'react'
import { Card } from '@/components/ui/card'
import { useResolvedStorageUrl } from '@/lib/storageUrl'

const ServiceCategoryCard = ({ category, cover, minPrice, onClick }) => {
  const coverSrc = useResolvedStorageUrl(cover || '')
  const title = String(category || '').trim() || 'Categoria'

  return (
    <button type="button" className="snap-start text-left" onClick={onClick}>
      <Card className="bg-card border-border/50 overflow-hidden hover:shadow-sm transition-shadow">
        <div className="w-[132px]">
          <div className="h-20 bg-muted">
            {coverSrc ? (
              <img src={coverSrc} alt={title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-muted" />
            )}
          </div>
          <div className="p-2">
            <div className="text-xs font-semibold text-foreground leading-tight line-clamp-1">{title}</div>
            {Number.isFinite(minPrice) ? (
              <div className="mt-0.5 text-[11px] text-muted-foreground leading-tight">
                A partir de <span className="text-orange-500 font-semibold">R$ {minPrice}</span>
              </div>
            ) : null}
          </div>
        </div>
      </Card>
    </button>
  )
}

export default ServiceCategoryCard
