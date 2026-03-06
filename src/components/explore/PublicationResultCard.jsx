import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ThumbsUp, MessageCircle, Video as VideoIcon, Image as ImageIcon } from 'lucide-react'
import { buildR2VideoPlaybackUrl, useResolvedStorageUrl } from '@/lib/storageUrl'
import { formatCompactNumber, asInt } from '@/lib/numberFormat'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useLikes } from '@/contexts/LikesContext'
import { useCommentsMeta } from '@/contexts/CommentsMetaContext'
import { usePrefetchCommentsOnVisible } from '@/hooks/usePrefetchCommentsOnVisible'

const isRenderableSrc = (src) => {
  const s = String(src || '').trim()
  if (!s) return false
  if (/^https?:\/\//i.test(s)) return true
  if (s.startsWith('/')) return true
  if (s.startsWith('data:') || s.startsWith('blob:')) return true
  return false
}

const getAuthorLabel = (user) => {
  const u = String(user?.username || '').trim()
  if (u) return `@${u}`
  const n = String(user?.name || '').trim()
  return n || 'Autor'
}

const CountLoadingDots = () => {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Carregando">
      <span className="h-1.5 w-1.5 rounded-full bg-white/80 animate-pulse" />
      <span className="h-1.5 w-1.5 rounded-full bg-white/70 animate-pulse [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-white/60 animate-pulse [animation-delay:300ms]" />
    </span>
  )
}

const PublicationResultCard = ({ item, onOpen, disableTouchPreview = false }) => {
  const likes = useLikes()
  const commentsMeta = useCommentsMeta()
  const isVideo = item?.type === 'video' || item?.video_type
  const title = isVideo
    ? (item?.title || item?.description || 'Vídeo')
    : (item?.caption || 'Foto')

  const likeType = isVideo ? 'video' : 'photo'
  const likedByMe = item?.id ? likes.isLiked(likeType, item.id) : false
  const likeCount = item?.id ? likes.getCount(likeType, item.id) : null
  const baseLikeCount = asInt(item?.likes ?? item?.likes_count ?? 0)
  const likeCountToShow = typeof likeCount === 'number' ? likeCount : baseLikeCount

  const videoElRef = useRef(null)
  const cardRef = useRef(null)
  const touchDownRef = useRef(false)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const startTsRef = useRef(0)
  const isDraggingRef = useRef(false)
  const previewStartedRef = useRef(false)
  const previewTimerRef = useRef(null)
  const suppressClickRef = useRef(false)
  const suppressClickTimerRef = useRef(null)

  const videoSrc = useMemo(() => buildR2VideoPlaybackUrl(item?.url), [item?.url])

  // IMPORTANT: não usar item.url como fallback de thumbnail em <img>.
  // Se for vídeo e não houver thumbnail, mostramos placeholder (ou <video> sem poster).
  const posterRaw = isVideo ? (item?.thumbnail_url || item?.thumbnail || '') : ''
  const posterSrc = useResolvedStorageUrl(posterRaw, {
    debugLabel: `explore:pub:${item?.type || (isVideo ? 'video' : 'photo')}:${item?.id}:poster`,
  })

  const photoFullRaw = item?.image_full_url || item?.url || ''
  const photoThumbRaw = item?.image_thumb_url || photoFullRaw || ''

  const photoFullSrc = useResolvedStorageUrl(photoFullRaw, {
    debugLabel: `explore:pub:photo:${item?.id}:full`,
  })
  const photoThumbSrc = useResolvedStorageUrl(photoThumbRaw, {
    debugLabel: `explore:pub:photo:${item?.id}:thumb`,
  })

  const canRenderPoster = useMemo(() => isRenderableSrc(posterSrc), [posterSrc])
  const canRenderVideo = useMemo(() => isRenderableSrc(videoSrc), [videoSrc])
  const canRenderPhotoThumb = useMemo(() => isRenderableSrc(photoThumbSrc), [photoThumbSrc])
  const canRenderPhotoFull = useMemo(() => isRenderableSrc(photoFullSrc), [photoFullSrc])

  const isProgressivePhoto = useMemo(() => {
    if (isVideo) return false
    if (!photoThumbSrc || !photoFullSrc) return false
    return String(photoThumbSrc) !== String(photoFullSrc)
  }, [isVideo, photoThumbSrc, photoFullSrc])

  const [posterError, setPosterError] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)

  const [photoThumbError, setPhotoThumbError] = useState(false)
  const [photoFullError, setPhotoFullError] = useState(false)
  const [photoFullLoaded, setPhotoFullLoaded] = useState(false)

  useEffect(() => {
    setPosterError(false)
  }, [posterSrc])

  useEffect(() => {
    setPhotoThumbError(false)
  }, [photoThumbSrc])

  useEffect(() => {
    setPhotoFullError(false)
    setPhotoFullLoaded(false)
  }, [photoFullSrc])

  useEffect(() => {
    setVideoError(false)
  }, [videoSrc])

  useEffect(() => {
    return () => {
      if (suppressClickTimerRef.current) {
        window.clearTimeout(suppressClickTimerRef.current)
        suppressClickTimerRef.current = null
      }
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current)
        previewTimerRef.current = null
      }
      const el = videoElRef.current
      if (!el) return
      try {
        el.pause?.()
        el.currentTime = 0
        el.removeAttribute('src')
        el.load?.()
      } catch {
        // ignore
      }
    }
  }, [])

  useEffect(() => {
    if (isPreviewing) return
    const el = videoElRef.current
    if (!el) return
    try {
      el.pause?.()
      el.currentTime = 0
      el.removeAttribute('src')
      el.load?.()
    } catch {
      // ignore
    }
  }, [isPreviewing])

  const commentsType = isVideo ? 'video' : 'photo'
  const liveCommentsCount = item?.id ? commentsMeta.getCount(commentsType, item.id) : null
  const commentsToShow = typeof liveCommentsCount === 'number' ? liveCommentsCount : null

  usePrefetchCommentsOnVisible({
    targetRef: cardRef,
    contentId: item?.id,
    contentType: commentsType,
    sort: 'new',
    enabled: true,
    rootMargin: '250px',
  })

  useEffect(() => {
    if (!item?.id) return
    void commentsMeta.hydrateForIds(commentsType, [item.id])
  }, [commentsMeta, commentsType, item?.id])

  const author = item?.user || {}
  const authorLabel = getAuthorLabel(author)

  const avatarSrc = useResolvedStorageUrl(author?.avatar || '')

  const handleOpen = () => onOpen?.(item)

  const startPreview = () => {
    if (!isVideo) return
    if (!canRenderVideo || videoError) return
    if (!videoSrc) return

    setIsPreviewing(true)

    window.setTimeout(() => {
      const el = videoElRef.current
      if (!el) return

      try {
        el.muted = true
        // iOS/Safari friendliness
        el.playsInline = true
        el.loop = true
        const p = el.play?.()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {
        // ignore
      }
    }, 0)
  }

  const stopPreview = () => {
    if (!isVideo) return
    setIsPreviewing(false)
  }

  const clearSuppressClickSoon = () => {
    if (suppressClickTimerRef.current) {
      window.clearTimeout(suppressClickTimerRef.current)
      suppressClickTimerRef.current = null
    }
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false
      suppressClickTimerRef.current = null
    }, 260)
  }

  const scheduleTouchPreview = () => {
    if (disableTouchPreview) return
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }

    // Premium: começa preview com um micro-delay (evita play em toques muito rápidos).
    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null
      if (!touchDownRef.current) return
      if (previewStartedRef.current) return
      previewStartedRef.current = true
      suppressClickRef.current = true
      startPreview()
    }, 110)
  }

  const clearTouchPreviewTimer = () => {
    if (!previewTimerRef.current) return
    window.clearTimeout(previewTimerRef.current)
    previewTimerRef.current = null
  }

  const handleTouchStart = (e) => {
    const t = e?.touches?.[0]
    if (!t) return
    touchDownRef.current = true
    isDraggingRef.current = false
    previewStartedRef.current = false
    suppressClickRef.current = false
    startXRef.current = Number(t.clientX || 0)
    startYRef.current = Number(t.clientY || 0)
    startTsRef.current = Date.now()

    // Qualquer atividade na miniatura: se o usuário segurar um pouco, já entra preview.
    if (!disableTouchPreview) scheduleTouchPreview()
  }

  const handleTouchMove = (e) => {
    if (!touchDownRef.current) return
    const t = e?.touches?.[0]
    if (!t) return

    const dx = Number(t.clientX || 0) - startXRef.current
    const dy = Number(t.clientY || 0) - startYRef.current
    const dist = Math.hypot(dx, dy)

    if (dist > 12 && !isDraggingRef.current) {
      isDraggingRef.current = true
      suppressClickRef.current = true
      clearTouchPreviewTimer()
      if (!disableTouchPreview && !previewStartedRef.current) {
        previewStartedRef.current = true
        startPreview()
      }
    }

    if (isDraggingRef.current) {
      suppressClickRef.current = true
    }
  }

  const handleTouchEnd = () => {
    if (!touchDownRef.current) return
    touchDownRef.current = false
    clearTouchPreviewTimer()

    const heldMs = Math.max(0, Date.now() - (startTsRef.current || 0))

    // Se houve drag ou preview, nunca abre (apenas encerra preview).
    if (isDraggingRef.current || previewStartedRef.current || heldMs > 220) {
      if (!disableTouchPreview) stopPreview()
      suppressClickRef.current = true
      clearSuppressClickSoon()
    }

    isDraggingRef.current = false
    previewStartedRef.current = false
  }

  const handleClick = (e) => {
    if (suppressClickRef.current) {
      e.preventDefault()
      e.stopPropagation()
      suppressClickRef.current = false
      return
    }

    handleOpen()
  }

  return (
    <Card
      ref={cardRef}
      data-preview-card="publication"
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseEnter={() => {
        // Desktop: hover = preview
        startPreview()
      }}
      onMouseLeave={() => {
        stopPreview()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleOpen()
      }}
      style={{ touchAction: 'pan-y' }}
      className="h-full bg-card border-border/50 hover:shadow-lg transition-shadow overflow-hidden cursor-pointer"
    >
      <CardContent className="p-0">
        <div className="relative w-full aspect-square sm:aspect-[4/3] bg-muted">
          {isVideo ? (
            canRenderVideo && !videoError ? (
              <video
                data-preview-video="1"
                ref={videoElRef}
                src={isPreviewing ? videoSrc : undefined}
                poster={canRenderPoster && !posterError ? posterSrc : ''}
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
                loop
                onError={() => setVideoError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <VideoIcon size={22} />
              </div>
            )
          ) : canRenderPhotoThumb || canRenderPhotoFull ? (
            <div className="absolute inset-0">
              {isProgressivePhoto && canRenderPhotoThumb && !photoThumbError ? (
                <img
                  src={photoThumbSrc}
                  alt={title}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                  width={asInt(item?.width_thumb) || undefined}
                  height={asInt(item?.height_thumb) || undefined}
                  onError={() => setPhotoThumbError(true)}
                />
              ) : null}

              {canRenderPhotoFull && !photoFullError ? (
                <img
                  src={photoFullSrc}
                  alt={title}
                  className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                  style={{ opacity: isProgressivePhoto ? (photoFullLoaded ? 1 : 0) : 1 }}
                  loading="lazy"
                  decoding="async"
                  width={asInt(item?.width_full) || undefined}
                  height={asInt(item?.height_full) || undefined}
                  onLoad={() => setPhotoFullLoaded(true)}
                  onError={() => setPhotoFullError(true)}
                />
              ) : isProgressivePhoto && canRenderPhotoThumb && !photoThumbError ? null : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <ImageIcon size={22} />
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <ImageIcon size={22} />
            </div>
          )}

          <div className="absolute right-2 bottom-2 text-white text-[11px] px-2 py-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <ThumbsUp size={14} className={`${likedByMe ? 'fill-white' : ''} drop-shadow-lg`} />
              <span className="drop-shadow-lg">{formatCompactNumber(likeCountToShow)}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle size={14} className="drop-shadow-lg" />
              <span className="drop-shadow-lg">
                {typeof commentsToShow === 'number' ? formatCompactNumber(commentsToShow) : <CountLoadingDots />}
              </span>
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
