import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { formatPriceUnit } from '@/lib/priceUnit'

const getProfessionalLabel = (user) => {
  const u = String(user?.username || '').trim()
  if (u) return `@${u}`
  const n = String(user?.name || '').trim()
  return n || 'Profissional'
}

const ServiceResultCard = ({ service, onHire }) => {
  const pro = service?.user || {}
  const avatarSrc = useResolvedStorageUrl(pro?.avatar || '')
  const proLabel = getProfessionalLabel(pro)

  const coverSrc = useResolvedStorageUrl(service?.image || '')

  const hasProfessional = Boolean(service?.user && (service.user.username || service.user.name))
  const canHire = service?.is_active !== false && hasProfessional

  return (
    <Card className="h-full bg-card border-border/50 hover:shadow-lg transition-shadow overflow-hidden">
      <div className="w-full aspect-[4/3] bg-muted">
        {coverSrc ? (
          <img src={coverSrc} alt={service?.title || 'Serviço'} className="w-full h-full object-cover" />
        ) : null}
      </div>

      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={avatarSrc} alt={proLabel} />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {proLabel.replace('@', '').charAt(0)?.toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground line-clamp-2">
              {service?.title || 'Serviço'}
            </h3>
            <p className="text-xs text-muted-foreground truncate">
              {proLabel}{pro?.profession ? ` • ${pro.profession}` : ''}
            </p>

            <div className="mt-2 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <span className="text-base font-bold text-orange-500">
                  R$ {service?.price ?? '--'}
                </span>
                <span className="text-xs text-muted-foreground ml-1">
                  / {formatPriceUnit(service?.price_unit || service?.priceUnit || 'hora')}
                </span>
              </div>

              <Button
                size="sm"
                className="shrink-0"
                onClick={() => onHire?.(service)}
                disabled={!canHire}
              >
                {service?.is_active === false ? 'Indisponível' : hasProfessional ? 'Contratar' : 'Indisponível'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default ServiceResultCard
