import React from 'react'
import { Link } from 'react-router-dom'
import { Star, BadgeCheck } from 'lucide-react'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { cn } from '@/lib/utils'

const getPersonTitle = (profile) => {
  const u = String(profile?.username || '').trim()
  if (u) return `@${u}`
  const n = String(profile?.name || '').trim()
  return n || 'Profissional'
}

const PersonResultCard = ({ profile, tiltDeg = -6 }) => {
  const avatarSrc = useResolvedStorageUrl(profile?.avatar || '')
  const title = getPersonTitle(profile)
  const profession = profile?.profession || ''
  const location = profile?.location || ''
  const rating = Number(profile?.rating || 0)
  const verified = !!profile?.is_verified

  const safeRating = Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0
  const showStarsRow = safeRating >= 4
  const stars = showStarsRow
    ? Array.from({ length: 5 }).map((_, i) => {
        const filled = safeRating >= i + 1
        return (
          <Star
            key={i}
            size={12}
            className={cn('text-yellow-500', filled ? 'fill-current' : 'fill-transparent')}
          />
        )
      })
    : null

  return (
    <Link to={`/profile/${profile.id}`} className="block">
      {/* Moldura diagonal */}
      <div
        className="relative w-[138px] h-[196px] rounded-2xl border-4 border-background bg-card shadow-md overflow-hidden"
        style={{ transform: `rotate(${Number(tiltDeg) || 0}deg)` }}
      >
        {/* Foto */}
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 w-full h-full bg-muted flex items-center justify-center">
            <span className="text-2xl font-bold text-muted-foreground">
              {title.replace('@', '').charAt(0)?.toUpperCase() || 'U'}
            </span>
          </div>
        )}

        {/* Overlay para legibilidade */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        {/* Conteúdo */}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[13px] font-semibold text-white truncate drop-shadow-sm">{title}</p>
            {verified && (
              <span className="inline-flex items-center text-primary shrink-0">
                <BadgeCheck size={14} />
              </span>
            )}
          </div>

          <p className="text-[11px] text-white/90 truncate drop-shadow-sm">
            {profession || 'Profissional'}
          </p>

          <div className="mt-1 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-yellow-500">
              <Star size={12} className="fill-current" />
              <span className="text-[11px] font-semibold text-white">
                {safeRating ? safeRating.toFixed(1) : '0.0'}
              </span>
            </span>
            {stars ? <div className="flex items-center gap-0.5">{stars}</div> : null}
          </div>

          {/* Mantém a info disponível, mas sem poluir o visual do card */}
          {location ? (
            <span className="sr-only">{location}</span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

export default PersonResultCard
