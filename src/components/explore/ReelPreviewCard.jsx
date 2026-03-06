import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, Play } from 'lucide-react'
import { buildR2VideoPlaybackUrl, useResolvedStorageUrl } from '@/lib/storageUrl'
import { asInt, formatCompactNumber } from '@/lib/numberFormat'

const getAuthorLabel = (user) => {
  const u = String(user?.username || '').trim()
  if (u) return `@${u}`
  const n = String(user?.name || '').trim()
  return n || 'Autor'
}

const isRenderableSrc = (src) => {
  const s = String(src || '').trim()
  if (!s) return false
  if (/^https?:\/\//i.test(s)) return true
  if (s.startsWith('/')) return true
  if (s.startsWith('data:') || s.startsWith('blob:')) return true
  return false
}

const ReelPreviewCard = ({ item, onOpen }) => {
  const cardRef = useRef(null)
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false)

  const videoSrc = useMemo(() => {
    if (!shouldLoadVideo) return ''
    return buildR2VideoPlaybackUrl(item?.url)
  }, [item?.url, shouldLoadVideo])
  const posterSrc = useResolvedStorageUrl(item?.thumbnail_url || item?.thumbnail || '', { provider: item?.provider })

  const author = item?.user || null
  const authorLabel = getAuthorLabel(author)
  const authorLocation = String(author?.location || '').trim()
  const avatarSrc = useResolvedStorageUrl(author?.avatar || '')

  const viewsToShow = asInt(item?.views ?? 0)
  const commentsToShow = typeof item?.comments_count === 'number' ? asInt(item?.comments_count) : null

  const canRenderVideo = useMemo(() => isRenderableSrc(videoSrc), [videoSrc])
  const canRenderPoster = useMemo(() => isRenderableSrc(posterSrc), [posterSrc])

  const [videoError, setVideoError] = useState(false)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        const anyVisible = entries?.some((e) => e.isIntersecting)
        if (anyVisible) {
          setShouldLoadVideo(true)
          observer.disconnect()
        }
      },
      { root: null, rootMargin: '350px 0px', threshold: 0 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setVideoError(false)
  }, [videoSrc])

  const handleOpen = () => onOpen?.(item)

  return (
    <button
      type="button"
      onClick={handleOpen}
      ref={cardRef}
      className="relative shrink-0 w-[124px] sm:w-[140px] aspect-[9/16] rounded-2xl overflow-hidden bg-muted shadow-sm"
    >
      {shouldLoadVideo && canRenderVideo && !videoError ? (
        <video
          src={videoSrc}
          poster={canRenderPoster ? posterSrc : ''}
          className="h-full w-full object-cover"
          muted
          playsInline
          loop
          autoPlay
          preload="metadata"
          onError={() => setVideoError(true)}
        />
      ) : canRenderPoster ? (
        <img
          src={posterSrc}
          alt="Reels"
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center text-muted-foreground">
          <Play size={22} />
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10 pointer-events-none" />

      <div className="absolute inset-x-0 bottom-0 p-2 pointer-events-none text-white">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-6 w-6 rounded-full overflow-hidden bg-white/10 shrink-0 ring-1 ring-white/15">
            {avatarSrc ? (
              <img src={avatarSrc} alt={authorLabel} className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <div className="h-full w-full" />
            )}
          </div>

          <div className="min-w-0">
            <div className="text-[11px] font-semibold leading-tight truncate">{authorLabel}</div>
            {authorLocation ? (
              <div className="text-[10px] leading-tight text-white/80 truncate">{authorLocation}</div>
            ) : null}
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between text-[11px] leading-none">
          <div className="flex items-center gap-1">
            <Play size={12} className="opacity-90" />
            <span className="font-semibold">{formatCompactNumber(viewsToShow)}</span>
          </div>

          {typeof commentsToShow === 'number' ? (
            <div className="flex items-center gap-1 text-white/90">
              <MessageCircle size={12} className="opacity-90" />
              <span className="font-semibold">{formatCompactNumber(commentsToShow)}</span>
            </div>
          ) : (
            <span className="text-white/70" />
          )}
        </div>
      </div>
    </button>
  )
}

export default ReelPreviewCard
