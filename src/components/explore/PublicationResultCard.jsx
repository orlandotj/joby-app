import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ThumbsUp, MessageCircle, Video as VideoIcon, Image as ImageIcon } from 'lucide-react'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { formatCompactNumber, asInt } from '@/lib/numberFormat'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const getAuthorLabel = (user) => {
  const u = String(user?.username || '').trim()
  if (u) return `@${u}`
  const n = String(user?.name || '').trim()
  return n || 'Autor'
}

const PublicationResultCard = ({ item, onOpen }) => {
  const isVideo = item?.type === 'video' || item?.video_type
  const title = isVideo
    ? (item?.title || item?.description || 'Vídeo')
    : (item?.caption || 'Foto')

  const thumb = isVideo ? (item?.thumbnail || item?.url) : item?.url
  const thumbSrc = useResolvedStorageUrl(thumb)

  const canRenderThumb = useMemo(() => {
    const src = String(thumbSrc || '').trim()
    if (!src) return false
    if (/^https?:\/\//i.test(src)) return true
    if (src.startsWith('/')) return true
    if (src.startsWith('data:') || src.startsWith('blob:')) return true
    return false
  }, [thumbSrc])

  const [thumbError, setThumbError] = useState(false)

  useEffect(() => {
    setThumbError(false)
  }, [thumbSrc])

  const likes = asInt(item?.likes_count ?? item?.likes ?? 0)
  const comments = asInt(item?.comments_count ?? item?.comments ?? 0)

  const author = item?.user || {}
  const authorLabel = getAuthorLabel(author)

  const avatarSrc = useResolvedStorageUrl(author?.avatar || '')

  const handleOpen = () => onOpen?.(item)

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleOpen()
      }}
      className="h-full bg-card border-border/50 hover:shadow-lg transition-shadow overflow-hidden cursor-pointer"
    >
      <CardContent className="p-0">
        <div className="relative w-full aspect-square sm:aspect-[4/3] bg-muted">
          {canRenderThumb && !thumbError ? (
            <img
              src={thumbSrc}
              alt={title}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={() => setThumbError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              {isVideo ? <VideoIcon size={22} /> : <ImageIcon size={22} />}
            </div>
          )}

          <div className="absolute right-2 bottom-2 rounded-md bg-black/60 text-white text-[11px] px-2 py-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <ThumbsUp size={14} /> {formatCompactNumber(likes)}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle size={14} /> {formatCompactNumber(comments)}
            </span>
          </div>
        </div>

        <div className="p-3">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="h-7 w-7">
              <AvatarImage src={avatarSrc} alt={authorLabel} />
              <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
                {authorLabel?.replace('@', '')?.charAt(0)?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{authorLabel}</p>
              <p className="text-xs text-muted-foreground truncate">
                {author?.profession || (isVideo ? 'Vídeo' : 'Foto')}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default PublicationResultCard
