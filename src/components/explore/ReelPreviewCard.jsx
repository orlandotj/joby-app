import React, { useEffect, useMemo, useState } from 'react'
import { Play } from 'lucide-react'
import { useResolvedStorageUrl } from '@/lib/storageUrl'

const isRenderableSrc = (src) => {
  const s = String(src || '').trim()
  if (!s) return false
  if (/^https?:\/\//i.test(s)) return true
  if (s.startsWith('/')) return true
  if (s.startsWith('data:') || s.startsWith('blob:')) return true
  return false
}

const ReelPreviewCard = ({ item, onOpen }) => {
  const videoSrc = useResolvedStorageUrl(item?.url, { provider: item?.provider })
  const posterSrc = useResolvedStorageUrl(item?.thumbnail || '', { provider: item?.provider })

  const canRenderVideo = useMemo(() => isRenderableSrc(videoSrc), [videoSrc])
  const canRenderPoster = useMemo(() => isRenderableSrc(posterSrc), [posterSrc])

  const [videoError, setVideoError] = useState(false)

  useEffect(() => {
    setVideoError(false)
  }, [videoSrc])

  const handleOpen = () => onOpen?.(item)

  return (
    <button
      type="button"
      onClick={handleOpen}
      className="relative shrink-0 w-[124px] sm:w-[140px] aspect-[9/16] rounded-2xl overflow-hidden bg-muted border border-border/60 shadow"
    >
      {canRenderVideo && !videoError ? (
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

      <div className="absolute left-2 bottom-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/45 text-white text-[11px] pointer-events-none">
        <Play size={12} className="opacity-90" />
        <span className="font-semibold">Reels</span>
      </div>
    </button>
  )
}

export default ReelPreviewCard
