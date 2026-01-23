import React from 'react'
import { Link } from 'react-router-dom'
import { Star, BadgeCheck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useResolvedStorageUrl } from '@/lib/storageUrl'

const getPersonTitle = (profile) => {
  const u = String(profile?.username || '').trim()
  if (u) return `@${u}`
  const n = String(profile?.name || '').trim()
  return n || 'Profissional'
}

const PersonResultCard = ({ profile }) => {
  const avatarSrc = useResolvedStorageUrl(profile?.avatar || '')
  const title = getPersonTitle(profile)
  const profession = profile?.profession || ''
  const location = profile?.location || ''
  const rating = Number(profile?.rating || 0)
  const verified = !!profile?.is_verified

  return (
    <Link to={`/profile/${profile.id}`} className="block h-full">
      <Card className="h-full bg-card border-border/50 hover:shadow-lg transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={avatarSrc} alt={title} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {title.replace('@', '').charAt(0)?.toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-semibold text-foreground truncate">{title}</h3>
                {verified && (
                  <span className="inline-flex items-center text-primary shrink-0">
                    <BadgeCheck size={16} />
                  </span>
                )}
              </div>

              <p className="text-sm text-primary truncate">{profession || 'Profissional'}</p>

              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-yellow-500">
                  <Star size={14} fill="currentColor" />
                  <span className="text-xs font-medium text-foreground">
                    {rating ? rating.toFixed(1) : '0.0'}
                  </span>
                </div>
                {location && (
                  <span className="text-xs text-muted-foreground truncate">{location}</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export default PersonResultCard
