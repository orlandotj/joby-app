import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import ProfileHeader from '@/components/ProfileHeader'
import VideoCard from '@/components/VideoCard'
import ContentViewModal from '@/components/ContentViewModal'
import LazyImage from '@/components/LazyImage'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import {
  Star,
  Briefcase,
  UploadCloud,
  PlayCircle,
  MessageSquare as MessageSquareText,
  Image as ImageIcon,
  Video as VideoIcon,
  Eye,
  MoreVertical,
  Pencil,
  Trash2,
  Clock,
  MapPin,
  TrendingUp,
  Zap,
  Users,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useAuth } from '@/contexts/AuthContext'
import { useLikes } from '@/contexts/LikesContext'
import AddContentFab from '@/components/AddContentFab'
import UploadDialog from '@/components/UploadDialog'
import ServiceForm from '@/components/ServiceForm'
import ServiceDetailsModal from '@/components/ServiceDetailsModal'
import { supabase } from '@/lib/supabaseClient'
import { getProfileDisplayName } from '@/lib/profileDisplay'
import { resolveStorageUrl, useResolvedStorageUrl } from '@/lib/storageUrl'
import { log } from '@/lib/logger'
import { useToast } from '@/components/ui/use-toast'
import { isUuid } from '@/lib/uuid'
import { formatPriceUnit } from '@/lib/priceUnit'
import { useSwipeTabs } from '@/hooks/useSwipeTabs'
import { TabTransition } from '@/components/TabTransition'
import {
  getCachedProfileCounters,
  setCachedProfileCounters,
} from '@/lib/profileCountersCache'

const imageDebugOn = () => {
  try {
    return !!(import.meta.env.DEV && window.__JOBY_IMAGE_DEBUG__)
  } catch {
    return false
  }
}

const SERVICE_COVER_PLACEHOLDER =
  'https://placehold.co/600x400/e2e8f0/64748b?text=Serviço'

let VIDEO_SELECT_COLS_CACHE = null
let PHOTO_SELECT_COLS_CACHE = null

const ServiceCoverImage = ({ service }) => {
  const resolvedSrc = useResolvedStorageUrl(service?.image || '', {
    debugLabel: `service:${service?.id}:cover`,
  })

  const finalSrc = resolvedSrc || SERVICE_COVER_PLACEHOLDER

  return (
    <img
      src={finalSrc}
      alt={service?.title || 'Serviço'}
      className="w-full h-full object-cover"
      loading="lazy"
      decoding="async"
    />
  )
}

// Componente separado para cada item de vídeo
const VideoGridItem = ({ video, onClick, index = 0 }) => {
  const videoRef = useRef(null)
  const [shouldPlay, setShouldPlay] = useState(false)

  const renderCount = useRef(0)
  renderCount.current += 1

  const videoSrc = useResolvedStorageUrl(video?.url, {
    preferPublic: true,
    provider: video?.provider,
    debugLabel: `video:${video?.id}:url`,
  })
  const posterSrc = useResolvedStorageUrl(video?.thumbnail_url || video?.thumbnail || '', {
    preferPublic: true,
    debugLabel: `video:${video?.id}:thumb`,
  })
  
  // Apenas primeira linha (2 itens) acima da dobra
  const isAboveFold = index < 2
  const preloadStrategy = isAboveFold ? 'auto' : 'metadata'

  const handleMouseEnter = () => {
    setShouldPlay(true)
  }

  const handleMouseLeave = () => {
    setShouldPlay(false)
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }

  const isTouchLikePointer = (e) => {
    const t = String(e?.pointerType || '')
    return t === 'touch' || t === 'pen'
  }

  const handlePointerDown = (e) => {
    // Em mobile não existe hover: qualquer interação deve iniciar a prévia.
    // Mantemos o modal no onClick (e pausamos a prévia antes de abrir).
    if (!isTouchLikePointer(e)) return
    setShouldPlay(true)
  }

  const handlePointerEnd = (e) => {
    // Se o usuário só tocou/scrollou (sem abrir modal), pare a prévia.
    if (!isTouchLikePointer(e)) return
    setShouldPlay(false)
    if (videoRef.current) {
      try {
        videoRef.current.pause()
        videoRef.current.currentTime = 0
      } catch {
        // ignore
      }
    }
  }

  const stopPreviewNow = () => {
    setShouldPlay(false)
    if (videoRef.current) {
      try {
        videoRef.current.pause()
        videoRef.current.currentTime = 0
      } catch {
        // ignore
      }
    }
  }

  useEffect(() => {
    if (!shouldPlay) return
    if (!videoRef.current) return
    if (!videoSrc) return

    videoRef.current
      .play()
      .catch((e) => {
        const name = String(e?.name || '')
        const msg = String(e?.message || '')
        const low = `${name} ${msg}`.toLowerCase()
        const isAbort = name === 'AbortError' || low.includes('aborterror') || low.includes('interrupted')
        if (isAbort) return
        if (import.meta.env.DEV) log.debug('PROFILE', 'Play error', e)
      })
  }, [shouldPlay, videoSrc])

  useEffect(() => {
    if (!imageDebugOn()) return
    const t = performance.now()
    log.debug('IMG', 'VideoGridItem mount', { id: video?.id, idx: index, t: t.toFixed(1) })
    return () => {
      const t2 = performance.now()
      log.debug('IMG', 'VideoGridItem unmount', { id: video?.id, idx: index, t: t2.toFixed(1) })
    }
  }, [video?.id, index])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="aspect-[9/16] bg-muted rounded-lg overflow-hidden relative group cursor-pointer"
      style={{ willChange: 'opacity', transform: 'translateZ(0)' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onClick={() => {
        stopPreviewNow()
        onClick?.()
      }}
    >
      <video
        ref={videoRef}
        src={videoSrc || undefined}
        className="w-full h-full object-cover"
        poster={posterSrc || undefined}
        preload={preloadStrategy}
        muted
        loop
        playsInline
        onLoadedData={() => {
          if (imageDebugOn() && isAboveFold) {
            log.debug('IMG', 'video loaded', {
              id: video?.id,
              idx: index,
              render: renderCount.current,
              src: String(videoSrc).substring(0, 80),
              t: performance.now().toFixed(1),
            })
          }
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3">
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-1.5">
            <PlayCircle size={18} className="opacity-90" />
            <span className="text-sm font-semibold">
              {video.duration || '0:54'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-full px-2.5 py-1">
            <Eye size={16} className="opacity-90" />
            <span className="text-sm font-medium">{video.views || 0}</span>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center">
        <PlayCircle
          size={48}
          className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 drop-shadow-lg"
        />
      </div>
    </motion.div>
  )
}

const PhotoGridItem = ({ photo, onClick, index = 0 }) => {
  const renderCount = useRef(0)
  renderCount.current += 1

  useEffect(() => {
    if (!imageDebugOn()) return
    const t = performance.now()
    log.debug('IMG', 'PhotoGridItem mount', { id: photo?.id, idx: index, t: t.toFixed(1) })
    return () => {
      const t2 = performance.now()
      log.debug('IMG', 'PhotoGridItem unmount', { id: photo?.id, idx: index, t: t2.toFixed(1) })
    }
  }, [photo?.id, index])

  const photoSrc = useResolvedStorageUrl(photo?.url, {
    preferPublic: true,
    debugLabel: `photo:${photo?.id}:url`,
  })
  
  // NÃO usar transformSupabasePublicImageUrl aqui - gera querystrings dinâmicas!
  // Usar URL original para cache funcionar. Thumbnail pode ser feito no backend.
  const finalSrc = photoSrc || ''
  
  const [imgLoaded, setImgLoaded] = useState(false)
  const loadStartTime = useRef(performance.now())
  
  // Apenas primeira linha (2 itens) com eager
  const isAboveFold = index < 2
  const loadingStrategy = isAboveFold ? 'eager' : 'lazy'
  const fetchPriority = isAboveFold ? 'high' : 'auto'

  const handleImageLoad = () => {
    const loadTime = performance.now() - loadStartTime.current
    setImgLoaded(true)
    if (imageDebugOn() && isAboveFold) {
      log.debug('IMG', 'photo loaded', {
        id: photo?.id,
        idx: index,
        render: renderCount.current,
        ms: loadTime.toFixed(2),
        loading: loadingStrategy,
        url: String(finalSrc).substring(0, 80),
      })
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="aspect-[9/16] bg-muted rounded-lg overflow-hidden relative group cursor-pointer"
      style={{ willChange: 'opacity', transform: 'translateZ(0)' }}
      onClick={onClick}
    >
      {/* Skeleton apenas enquanto carrega */}
      {!imgLoaded && (
        <div className="absolute inset-0 bg-muted/40 animate-pulse" />
      )}
      
      {finalSrc && (
        <img
          src={finalSrc}
          alt={photo?.caption || 'Foto do portfólio'}
          className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
            imgLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          loading={loadingStrategy}
          decoding="async"
          fetchpriority={fetchPriority}
          onLoad={handleImageLoad}
        />
      )}
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3">
        <div className="flex items-center justify-between text-white">
          <h4 className="text-sm font-semibold truncate drop-shadow-lg flex-1">
            {photo?.caption}
          </h4>
          <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-full px-2.5 py-1 ml-2">
            <Eye size={16} className="opacity-90" />
            <span className="text-sm font-medium">{photo?.views || 0}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

const Profile = () => {
  const { id: profileId } = useParams() // Renamed to avoid conflict with item id
  const location = useLocation()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const likes = useLikes()
  const [user, setUser] = useState(null)
  const [videos, setVideos] = useState([])
  const [photos, setPhotos] = useState([]) // Added state for photos
  const [reviews, setReviews] = useState([])
  const [services, setServices] = useState([])
  const [deleteServiceConfirmOpen, setDeleteServiceConfirmOpen] = useState(false)
  const [deleteServiceConfirmId, setDeleteServiceConfirmId] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [contentLoading, setContentLoading] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('videos')
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [uploadType, setUploadType] = useState('') // 'photo', 'short-video', 'long-video'
  const [isServiceFormOpen, setIsServiceFormOpen] = useState(false)
  const [isServiceDetailsOpen, setIsServiceDetailsOpen] = useState(false)
  const [selectedService, setSelectedService] = useState(null)
  const [editingService, setEditingService] = useState(null)
  const [followersCount, setFollowersCount] = useState(null)
  const [followingCount, setFollowingCount] = useState(null)
  const [isFollowing, setIsFollowing] = useState(null)
  const [selectedContent, setSelectedContent] = useState(null)
  const [isContentModalOpen, setIsContentModalOpen] = useState(false)

  const TAB_ORDER = ['videos', 'services', 'reviews']
  const swipeTabs = useSwipeTabs({
    tabs: TAB_ORDER,
    value: activeTab,
    onValueChange: setActiveTab,
    disabled:
      isMobileMenuOpen ||
      isUploadDialogOpen ||
      isServiceFormOpen ||
      isServiceDetailsOpen ||
      isContentModalOpen,
  })

  const { toast } = useToast()

  const isOwnProfile = currentUser?.id === profileId

  // Keep global likes hydrated for any items currently in the profile
  useEffect(() => {
    const videoIds = (videos || []).map((v) => v?.id).filter(Boolean)
    const photoIds = (photos || []).map((p) => p?.id).filter(Boolean)
    if (videoIds.length) void likes.hydrateForIds('video', videoIds)
    if (photoIds.length) void likes.hydrateForIds('photo', photoIds)
  }, [likes, photos, videos])

  // Prevent duplicate in-flight loads (React 18 StrictMode runs effects twice in DEV)
  const loadSeqRef = useRef(0)
  const loadInFlightRef = useRef({ profileId: null, seq: 0, inFlight: false, startedAt: 0 })
  const countersSeqRef = useRef(0)
  const lastGridLogRef = useRef('')

  // DEBUG: Contador de renders
  const renderCount = useRef(0)
  useEffect(() => {
    renderCount.current += 1
    if (imageDebugOn()) {
      log.debug('PROFILE', 'Render', { count: renderCount.current, profileId })
    }
  })

  // Detectar quando o menu mobile está aberto
  useEffect(() => {
    const checkMobileMenu = () => {
      // Verificar se existe algum overlay do menu usando attribute selector
      const overlays = document.querySelectorAll('.fixed.inset-0')
      let menuOverlayFound = false

      overlays.forEach((overlay) => {
        const hasBackdrop =
          overlay.className.includes('bg-black') &&
          overlay.className.includes('60')
        if (hasBackdrop) {
          menuOverlayFound = true
        }
      })

      setIsMobileMenuOpen(menuOverlayFound)
    }

    // Verificar inicialmente
    checkMobileMenu()

    // Usar MutationObserver para detectar mudanças no DOM
    const observer = new MutationObserver(checkMobileMenu)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!profileId) return

    // Guard rails: avoid queries like id=eq.edit (and any other invalid uuid)
    if (profileId === 'edit') {
      const dest = `/me/edit${location.search || ''}`
      try {
        if (import.meta.env.DEV) {
          log.debug('NAV', dest, 'profile:legacy_edit_redirect', new Error().stack)
        }
      } catch {
        // ignore
      }
      navigate(dest, { replace: true })
      return
    }

    if (!isUuid(profileId)) {
      navigate('/404', { replace: true })
      return
    }

    if (imageDebugOn()) log.debug('IMG', 'Loading profile for', profileId)

    // Counters: show cached values immediately (if any) and refresh in background.
    const cached = getCachedProfileCounters(profileId)
    if (cached) {
      setFollowersCount(cached.followersCount)
      setFollowingCount(cached.followingCount)
      setIsFollowing(cached.isFollowing)
    } else {
      setFollowersCount(null)
      setFollowingCount(null)
      setIsFollowing(null)
    }

    refreshFollowCounters(profileId)

    // Also clear previous user quickly (avoid a brief flash of the old profile header).
    setUser(null)
    setProfileLoading(true)
    setContentLoading(true)

    loadUserProfile()
  }, [profileId])

  const refreshFollowCounters = React.useCallback(async (targetProfileId = profileId) => {
    if (!targetProfileId || !isUuid(targetProfileId)) return

    const seq = (countersSeqRef.current += 1)
    const isStale = () => countersSeqRef.current !== seq || targetProfileId !== profileId

    try {
      const countersPromises = [
        supabase
          .from('follows')
          .select('id', { count: 'exact' })
          .eq('following_id', targetProfileId)
          .range(0, 0),
        supabase
          .from('follows')
          .select('id', { count: 'exact' })
          .eq('follower_id', targetProfileId)
          .range(0, 0),
      ]

      if (currentUser && currentUser.id !== targetProfileId) {
        countersPromises.push(
          supabase
            .from('follows')
            .select('id')
            .eq('follower_id', currentUser.id)
            .eq('following_id', targetProfileId)
            .maybeSingle()
        )
      }

      const countersResults = await Promise.all(countersPromises)
      if (isStale()) return

      const nextFollowers = countersResults[0]?.count ?? 0
      const nextFollowing = countersResults[1]?.count ?? 0
      const nextIsFollowing = countersResults[2]
        ? !!countersResults[2].data
        : false

      setFollowersCount(nextFollowers)
      setFollowingCount(nextFollowing)
      setIsFollowing(nextIsFollowing)

      setCachedProfileCounters(targetProfileId, {
        followersCount: nextFollowers,
        followingCount: nextFollowing,
        isFollowing: nextIsFollowing,
      })
    } catch (error) {
      log.error('PROFILE', 'Erro ao carregar contadores de follow', error)
      if (!isStale()) {
        setFollowersCount(0)
        setFollowingCount(0)
        setIsFollowing(false)
      }
    }
  }, [currentUser?.id, profileId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onAuthReady = () => {
      if (!profileId || !isUuid(profileId)) return
      refreshFollowCounters(profileId)
    }
    window.addEventListener('auth:ready', onAuthReady)
    return () => window.removeEventListener('auth:ready', onAuthReady)
  }, [profileId, refreshFollowCounters])

  const updateSearchParams = (mutate, { replace = false } = {}) => {
    const params = new URLSearchParams(location.search)
    mutate(params)
    const search = params.toString()
    navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : '',
      },
      { replace }
    )
  }

  // Sync: URL -> state (aba + modais)
  useEffect(() => {
    const params = new URLSearchParams(location.search)

    const tab = params.get('tab')
    if (tab && ['videos', 'services', 'reviews'].includes(tab)) {
      if (activeTab !== tab) setActiveTab(tab)
    }

    const upload = params.get('upload')
    if (upload && ['photo', 'short-video', 'long-video'].includes(upload)) {
      if (!isUploadDialogOpen || uploadType !== upload) {
        setUploadType(upload)
        setIsUploadDialogOpen(true)
      }
    } else if (isUploadDialogOpen) {
      setIsUploadDialogOpen(false)
    }

    const contentId = params.get('contentId')
    const contentType = params.get('contentType')
    if (contentId && (contentType === 'photo' || contentType === 'video')) {
      const source = contentType === 'photo' ? photos : videos
      const found = source.find((item) => String(item.id) === String(contentId))
      if (found) {
        const next = { ...found, type: contentType }
        if (!isContentModalOpen || selectedContent?.id !== next.id) {
          setSelectedContent(next)
          setIsContentModalOpen(true)
        }
      }
    } else if (isContentModalOpen) {
      setSelectedContent(null)
      setIsContentModalOpen(false)
    }

    const serviceId = params.get('service')
    if (serviceId) {
      const found = services.find((s) => String(s.id) === String(serviceId))
      if (found) {
        if (!isServiceDetailsOpen || selectedService?.id !== found.id) {
          setSelectedService(found)
          setIsServiceDetailsOpen(true)
        }
      }
    } else if (isServiceDetailsOpen) {
      setIsServiceDetailsOpen(false)
      setSelectedService(null)
    }

    const serviceForm = params.get('serviceForm')
    const editServiceId = params.get('editService')
    if (serviceForm) {
      const toEdit = editServiceId
        ? services.find((s) => String(s.id) === String(editServiceId))
        : null
      if (
        !isServiceFormOpen ||
        (editServiceId && editingService?.id !== toEdit?.id)
      ) {
        setEditingService(toEdit)
        setIsServiceFormOpen(true)
      }
    } else if (isServiceFormOpen) {
      setIsServiceFormOpen(false)
      setEditingService(null)
    }
  }, [location.search, photos, videos, services])

  // Sync: state -> URL (aba). Use replace para não poluir histórico.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const current = params.get('tab')
    if (activeTab && current !== activeTab) {
      updateSearchParams((p) => p.set('tab', activeTab), { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const loadUserProfile = async () => {
    if (!profileId) {
      log.error('PROFILE', 'No profileId provided')
      return
    }

    if (!isUuid(profileId)) {
      log.error('PROFILE', 'Invalid profileId (not a UUID)', profileId)
      return
    }

    // Skip duplicate calls for the same profileId while an earlier request is in-flight.
    if (loadInFlightRef.current.inFlight && loadInFlightRef.current.profileId === profileId) {
      const startedAt = Number(loadInFlightRef.current.startedAt || 0)
      const ageMs = startedAt ? Date.now() - startedAt : 0

      // Escape hatch: allow retry if an older request got "stuck" (resume/hiccup).
      if (startedAt && ageMs > 10_000) {
        log.warn('PROFILE', 'Stale in-flight load; allowing retry', { profileId, ageMs })
        loadInFlightRef.current.inFlight = false
        loadInFlightRef.current.startedAt = 0
      } else {
        if (imageDebugOn()) {
          log.debug('PROFILE', 'Skip duplicate in-flight load', profileId)
        }
        return
      }
    }

    const seq = (loadSeqRef.current += 1)
    loadInFlightRef.current = { profileId, seq, inFlight: true, startedAt: Date.now() }
    const isStale = () => loadSeqRef.current !== seq

    const t0 = performance.now()
    if (imageDebugOn()) {
      log.debug('PROFILE', 'Start loading profile', { profileId, seq, t: t0.toFixed(2) })
    }

    setProfileLoading(true)
    setContentLoading(true)

    try {
      const currentProfileId = profileId

      // Start media fetch ASAP (do not block on profile header).
      const loadVideos = async () => {
        const run = (selectCols) =>
          supabase
            .from('videos')
            .select(selectCols)
            .eq('user_id', currentProfileId)
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(12)

        const baseCandidates = [
          // Keep a safe default first.
          'id, url, title, thumbnail_url, thumbnail, views, likes, created_at, video_type',
          'id, url, title, thumbnail_url, thumbnail, views, likes, comments_count, created_at, video_type',
          'id, url, title, thumbnail_url, thumbnail, views, likes, created_at, video_type, provider',
          'id, url, title, thumbnail_url, thumbnail, views, likes, comments_count, created_at, video_type, provider',
          // Fallback: schema antigo sem thumbnail_url
          'id, url, title, thumbnail, views, likes, created_at, video_type',
          'id, url, title, thumbnail, views, likes, comments_count, created_at, video_type',
          'id, url, title, thumbnail, views, likes, created_at, video_type, provider',
          'id, url, title, thumbnail, views, likes, comments_count, created_at, video_type, provider',
        ]

        const candidates = VIDEO_SELECT_COLS_CACHE
          ? [VIDEO_SELECT_COLS_CACHE, ...baseCandidates]
          : baseCandidates

        let last = null
        for (const cols of candidates) {
          const r = await run(cols)
          if (!r.error) {
            VIDEO_SELECT_COLS_CACHE = cols
            return r
          }
          last = r

          const msg = String(r.error?.message || '').toLowerCase()
          const missingColumn = msg.includes('column') && msg.includes('does not exist')
          if (!missingColumn) return r
        }

        return last
      }

      const loadPhotos = async () => {
        const run = (selectCols) =>
          supabase
            .from('photos')
            .select(selectCols)
            .eq('user_id', currentProfileId)
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(12)

        const baseCandidates = [
          // Safe default first.
          'id, url, caption, views, likes, created_at',
          'id, url, caption, views, likes, comments_count, created_at',
        ]

        const candidates = PHOTO_SELECT_COLS_CACHE
          ? [PHOTO_SELECT_COLS_CACHE, ...baseCandidates]
          : baseCandidates

        let last = null
        for (const cols of candidates) {
          const r = await run(cols)
          if (!r.error) {
            PHOTO_SELECT_COLS_CACHE = cols
            return r
          }
          last = r

          const msg = String(r.error?.message || '').toLowerCase()
          const missingColumn = msg.includes('column') && msg.includes('does not exist')
          if (!missingColumn) return r
        }

        return last
      }

      const mediaPromise = Promise.all([loadVideos(), loadPhotos()])

      // FASE 1: Carregar profile PRIMEIRO (crítico para foto/capa aparecerem rápido)
      const t1 = performance.now()
      let profileResult = await supabase
        .from('profiles')
        .select(
          'id, username, can_offer_service, profession, bio, avatar, cover_image, location, created_at'
        )
        .eq('id', profileId)
        .single()

      if (profileResult.error) {
        const msg = String(profileResult.error?.message || profileResult.error)
        const isMissingColumn =
          msg.toLowerCase().includes('column') && msg.toLowerCase().includes('does not exist')
        if (isMissingColumn) {
          profileResult = await supabase
            .from('profiles')
            .select(
              'id, name, can_offer_service, profession, bio, avatar, cover_image, location, created_at'
            )
            .eq('id', profileId)
            .single()
        }
      }

      const t2 = performance.now()
      if (imageDebugOn()) {
        log.debug('PROFILE', 'Profile fetched', { ms: (t2 - t1).toFixed(2) })
      }

      if (isStale()) return

      if (profileResult.error) throw profileResult.error
      const profileData = profileResult.data

      const display = getProfileDisplayName(profileData)

      // Renderizar profile IMEDIATAMENTE (foto e capa aparecem agora!)
      setUser({
        ...profileData,
        name: display,
        display_name: display,
        coverImage: profileData?.cover_image,
      })
      setProfileLoading(false)
      if (imageDebugOn()) {
        log.debug('IMG', 'Avatar URL', profileData?.avatar)
      }

      // FASE 2: Media grid (do not block on reviews/services)
      const t3 = performance.now()
      const [videosResult, photosResult] = await mediaPromise

      const t4 = performance.now()
      if (imageDebugOn()) {
        log.debug('PROFILE', 'Content fetched', { ms: (t4 - t3).toFixed(2) })
      }

      if (isStale()) return

      // Log errors from photos and videos queries
      if (photosResult.error) {
        log.error('PROFILE', 'Error loading photos', photosResult.error)
      }
      if (videosResult.error) {
        log.error('PROFILE', 'Error loading videos', videosResult.error)
      }

      // Hydrate global likes (my likes + real counts) in batch via LikesContext.
      const rawVideos = videosResult.data || []
      const rawPhotos = photosResult.data || []
      setVideos(rawVideos)
      setPhotos(rawPhotos)
      try {
        const videoIds = (rawVideos || []).map((v) => v?.id).filter(Boolean)
        const photoIds = (rawPhotos || []).map((p) => p?.id).filter(Boolean)
        if (videoIds.length > 0) void likes.hydrateForIds('video', videoIds)
        if (photoIds.length > 0) void likes.hydrateForIds('photo', photoIds)
      } catch {
        // ignore
      }

      // Unblock the grid as soon as media arrives (reviews/services can load later).
      if (!isStale()) setContentLoading(false)

      if (imageDebugOn()) {
        log.debug('IMG', 'raw avatar', String(profileData?.avatar || '').substring(0, 120))
        log.debug('IMG', 'raw cover_image', String(profileData?.cover_image || '').substring(0, 120))
      }

      // Preload only the critical images, and keep it off the critical path.
      ;(typeof window !== 'undefined' && window.requestIdleCallback
        ? window.requestIdleCallback
        : (cb) => setTimeout(cb, 60))(() => {
        const preloadUrls = new Set() // Dedupe: evita carregar mesma URL várias vezes

        const allContent = [
          ...(photosResult.data || []).map((p) => ({ ...p, type: 'photo' })),
          ...(videosResult.data || []).map((v) => ({ ...v, type: 'video' })),
        ]
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 2)

        const candidates = [
          { raw: profileData?.avatar, label: 'preload:avatar' },
          { raw: profileData?.cover_image, label: 'preload:cover' },
          ...allContent.map((item) => ({
            raw: item.type === 'photo' ? item.url : item.thumbnail,
            label: `preload:${item.type}:${item.id}`,
          })),
        ]

        const t5 = imageDebugOn() ? performance.now() : 0
        Promise.all(
          candidates.map(async (c) => {
            if (!c.raw) return
            const url = await resolveStorageUrl(c.raw, {
              preferPublic: true,
              debugLabel: c.label,
            })
            if (url) preloadUrls.add(url)
          })
        ).then(() => {
          const preloadedImages = []
          preloadUrls.forEach((url) => {
            const img = new Image()
            img.src = url
            preloadedImages.push(img)
          })

          if (imageDebugOn()) {
            const t6 = performance.now()
            log.debug('IMG', 'Preloading unique images (critical)', {
              count: preloadedImages.length,
              ms: (t6 - t5).toFixed(2),
            })
            log.debug('IMG', 'Preload URLs', Array.from(preloadUrls))
          }
        })
      })

      // Carregar dados secundários em paralelo (apenas contagens)
      const [reviewsResult, servicesResult] = await Promise.all([
        supabase
          .from('reviews')
          .select('rating', { count: 'exact' })
          .eq('professional_id', profileId)
          .limit(5),
        supabase
          .from('services')
          .select(
            'id, title, description, price, price_unit, category, image, views, bookings_count, work_area, duration, home_service, emergency_service, travel_service, overtime_service, available_hours, home_service_fee, emergency_service_fee, travel_fee, overtime_fee'
          )
          .eq('user_id', profileId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(6),
      ])

      // Calcular rating apenas se houver reviews
      if (reviewsResult.data && reviewsResult.data.length > 0) {
        const avgRating =
          reviewsResult.data.reduce((sum, review) => sum + review.rating, 0) /
          reviewsResult.data.length
        profileData.rating = parseFloat(avgRating.toFixed(1))
        profileData.reviews_count = reviewsResult.data.length
      }
      setReviews(reviewsResult.data || [])
      setServices(servicesResult.data || [])

      // Atualizar o state do usuário com todos os dados calculados (sem perder name/display)
      setUser((prev) => ({
        ...(prev || {}),
        ...profileData,
        name: display,
        display_name: display,
        coverImage: profileData?.cover_image,
      }))
    } catch (error) {
      log.error('PROFILE', 'Erro ao carregar perfil', error)
      if (!isStale()) setProfileLoading(false) // Libera render mesmo com erro
    } finally {
      if (!isStale()) setContentLoading(false)
      if (loadInFlightRef.current.seq === seq) {
        loadInFlightRef.current.inFlight = false
        loadInFlightRef.current.startedAt = 0
      }
    }
  }

  // Retry on resume (keep-alive / app switching / bfcache).
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!profileId) return

    const trigger = () => void loadUserProfile()
    const onFocus = () => trigger()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') trigger()
    }
    const onPageShow = () => trigger()

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [profileId, loadUserProfile])

  const handleOpenUploadDialog = (type) => {
    setUploadType(type)
    setIsUploadDialogOpen(true)

    updateSearchParams(
      (p) => {
        p.set('upload', type)
      },
      { replace: false }
    )
  }

  const handleOpenContentModal = (content) => {
    setSelectedContent(content)
    setIsContentModalOpen(true)

    // Prefetch current + neighbors (helps avoid "—" on fast swipe)
    try {
      const list = [
        ...photos.map((p) => ({ ...p, type: 'photo' })),
        ...videos.map((v) => ({ ...v, type: 'video' })),
      ]
      const currentId = String(content?.id ?? '')
      const currentType = String(content?.type ?? '')
      const idx = list.findIndex(
        (item) => String(item?.id ?? '') === currentId && String(item?.type ?? '') === currentType
      )

      const candidates = [list[idx], list[idx - 1], list[idx + 1]].filter(Boolean)
      const videoIds = []
      const photoIds = []
      for (const c of candidates) {
        const id = c?.id
        if (!id) continue
        const isPhoto = c?.type === 'photo'
        if (isPhoto) photoIds.push(id)
        else videoIds.push(id)
      }

      if (videoIds.length) void likes.hydrateForIds('video', videoIds)
      if (photoIds.length) void likes.hydrateForIds('photo', photoIds)
    } catch {
      // ignore
    }

    const contentType = content?.type === 'photo' ? 'photo' : 'video'
    updateSearchParams(
      (p) => {
        p.set('contentType', contentType)
        p.set('contentId', String(content.id))
      },
      { replace: false }
    )
  }

  const navigateProfileContentByDelta = (delta) => {
    if (!selectedContent) return
    const list = [
      ...photos.map((p) => ({ ...p, type: 'photo' })),
      ...videos.map((v) => ({ ...v, type: 'video' })),
    ]
    if (list.length === 0) return

    const currentId = String(selectedContent?.id ?? '')
    const currentType = String(selectedContent?.type ?? '')
    const idx = list.findIndex(
      (item) => String(item?.id ?? '') === currentId && String(item?.type ?? '') === currentType
    )
    if (idx < 0) return

    let next = list[idx + delta]
    if (!next) {
      if (delta > 0) next = list[0]
      else if (delta < 0) next = list[list.length - 1]
    }
    if (!next) return
    handleOpenContentModal(next)
  }

  const handleCloseContentModal = () => {
    setSelectedContent(null)
    setIsContentModalOpen(false)

    updateSearchParams(
      (p) => {
        p.delete('contentType')
        p.delete('contentId')
      },
      { replace: true }
    )
  }

  const handleDeleteContent = async (content) => {
    if (!currentUser?.id) {
      toast({
        title: 'Login necessário',
        description: 'Você precisa estar logado para excluir.',
        variant: 'destructive',
      })
      return
    }
    if (!content?.id) return

    try {
      const isPhoto = content?.type === 'photo'
      const table = isPhoto ? 'photos' : 'videos'

      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', content.id)
        .eq('user_id', currentUser.id)

      if (error) throw error

      if (isPhoto) setPhotos((prev) => prev.filter((p) => p.id !== content.id))
      else setVideos((prev) => prev.filter((v) => v.id !== content.id))

      toast({
        title: 'Conteúdo excluído',
        description: 'O conteúdo foi removido com sucesso.',
        variant: 'success',
      })

      handleCloseContentModal()
    } catch (error) {
      log.error('CONTENT', 'Erro ao excluir conteúdo', error)
      toast({
        title: 'Erro ao excluir',
        description: error?.message || 'Não foi possível excluir. Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteService = async (serviceId) => {
    if (!currentUser?.id) {
      toast({
        title: 'Login necessário',
        description: 'Você precisa estar logado para excluir.',
        variant: 'destructive',
      })
      return
    }
    if (!serviceId) return

    try {
      const { error } = await supabase
        .from('services')
        .update({ is_active: false })
        .eq('id', serviceId)
        .eq('user_id', currentUser.id)

      if (error) throw error

      setServices((prev) => prev.filter((s) => s.id !== serviceId))
      toast({
        title: 'Serviço removido',
        description: 'O serviço foi removido com sucesso.',
        variant: 'success',
      })
    } catch (error) {
      log.error('SERVICE', 'Erro ao excluir serviço', error)
      toast({
        title: 'Erro ao excluir',
        description: error?.message || 'Não foi possível excluir. Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  const openDeleteServiceConfirm = (serviceId) => {
    if (!serviceId) return
    setDeleteServiceConfirmId(serviceId)
    setDeleteServiceConfirmOpen(true)
  }

  const handleEditContent = async (content) => {
    if (!currentUser?.id) {
      toast({
        title: 'Login necessário',
        description: 'Você precisa estar logado para editar.',
        variant: 'destructive',
      })
      return
    }
    if (!content?.id) return

    const isPhoto = content?.type === 'photo'

    const nextValue = window.prompt(
      isPhoto ? 'Editar legenda da foto:' : 'Editar título do vídeo:',
      isPhoto ? content?.caption || '' : content?.title || ''
    )

    if (nextValue === null) return
    const trimmed = nextValue.trim()

    try {
      if (isPhoto) {
        const { error } = await supabase
          .from('photos')
          .update({ caption: trimmed })
          .eq('id', content.id)
          .eq('user_id', currentUser.id)

        if (error) throw error

        setPhotos((prev) =>
          prev.map((p) => (p.id === content.id ? { ...p, caption: trimmed } : p))
        )

        setSelectedContent((prev) => (prev ? { ...prev, caption: trimmed } : prev))
      } else {
        const { error } = await supabase
          .from('videos')
          .update({ title: trimmed })
          .eq('id', content.id)
          .eq('user_id', currentUser.id)

        if (error) throw error

        setVideos((prev) =>
          prev.map((v) => (v.id === content.id ? { ...v, title: trimmed } : v))
        )

        setSelectedContent((prev) => (prev ? { ...prev, title: trimmed } : prev))
      }

      toast({
        title: 'Conteúdo atualizado',
        description: 'Alterações salvas com sucesso.',
        variant: 'success',
      })
    } catch (error) {
      log.error('CONTENT', 'Erro ao editar conteúdo', error)
      toast({
        title: 'Erro ao editar',
        description: error?.message || 'Não foi possível salvar. Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  const handleContentUploaded = (newContent) => {
    if (import.meta.env.DEV) log.debug('PROFILE', 'New content uploaded', newContent)

    // Atualizar estado baseado no tipo de conteúdo
    if (newContent.type === 'photo') {
      setPhotos((prev) => [newContent, ...prev])
    } else if (
      newContent.type === 'short-video' ||
      newContent.type === 'long-video'
    ) {
      setVideos((prev) => [newContent, ...prev])
    }

    // Recarregar o perfil para garantir dados atualizados
    setTimeout(() => {
      loadUserProfile()
    }, 500)

    setIsUploadDialogOpen(false)

    updateSearchParams(
      (p) => {
        p.delete('upload')
      },
      { replace: true }
    )
  }

  const handleOpenServiceForm = (service = null) => {
    setEditingService(service)
    setIsServiceFormOpen(true)

    updateSearchParams(
      (p) => {
        p.set('serviceForm', '1')
        if (service?.id) p.set('editService', String(service.id))
        else p.delete('editService')
      },
      { replace: false }
    )
  }

  const handleSaveService = (serviceData) => {
    if (editingService) {
      setServices((prev) =>
        prev.map((s) => (s.id === serviceData.id ? serviceData : s))
      )
    } else {
      setServices((prev) => [serviceData, ...prev])
    }
    setIsServiceFormOpen(false)
    setEditingService(null)

    updateSearchParams(
      (p) => {
        p.delete('serviceForm')
        p.delete('editService')
      },
      { replace: true }
    )
  }

  const handleViewServiceDetails = (service) => {
    setSelectedService(service)
    setIsServiceDetailsOpen(true)

    updateSearchParams(
      (p) => {
        p.set('service', String(service.id))
      },
      { replace: false }
    )
  }

  // Só bloquear se profile crítico ainda não carregou E não tem user
  if (profileLoading && !user) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-150px)]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-12 h-12 rounded-full joby-gradient"
          style={{ willChange: 'transform' }}
        />
      </div>
    )
  }

  if (!user) {
    return <div className="text-center py-10">Perfil não encontrado.</div>
  }

  const renderEmptyState = (title, message, icon, actionButton) => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="text-center py-12 px-4"
    >
      {React.createElement(icon, {
        size: 48,
        className: 'mx-auto text-muted-foreground mb-4 opacity-70',
      })}
      <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">{message}</p>
      {actionButton && actionButton}
    </motion.div>
  )

  return (
    <>
      <div
        className="pb-16 md:pb-4 relative touch-pan-y"
        style={{ willChange: 'scroll-position', transform: 'translateZ(0)' }}
        {...swipeTabs.containerProps}
      >
        {' '}
        {/* Added padding bottom for FAB */}
        <ProfileHeader
          user={user}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isOwnProfile={isOwnProfile}
          followersCount={followersCount}
          followingCount={followingCount}
          isFollowing={isFollowing}
          onFollowChange={refreshFollowCounters}
        />
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="px-0 sm:px-2 md:px-0 mt-1"
        >
          <TabsContent
            value="videos"
            forceMount={true}
            hidden={activeTab !== 'videos'}
          >
            {activeTab === 'videos' ? (
              <TabTransition value={activeTab} order={['videos', 'services', 'reviews']}>
                {contentLoading ? (
                  // Skeleton grid enquanto carrega conteúdo
                  <div className="grid grid-cols-2 gap-2 pt-4">
                    {[...Array(6)].map((_, i) => (
                      <div
                        key={i}
                        className="aspect-[9/16] bg-muted rounded-lg overflow-hidden animate-pulse"
                      />
                    ))}
                  </div>
                ) : videos.length > 0 || photos.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 pt-4">
                    {/* Combinar fotos e vídeos ordenados por data */}
                    {(() => {
                      const allContent = [
                        ...photos.map((p) => ({ ...p, type: 'photo' })),
                        ...videos.map((v) => ({ ...v, type: 'video' })),
                      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

                      // DEBUG: Log primeiras 4 URLs para verificar estabilidade
                      if (import.meta.env.DEV && imageDebugOn() && allContent.length > 0) {
                        const first4 = allContent.slice(0, 4).map((item, i) => ({
                          index: i,
                          id: item.id,
                          type: item.type,
                          url: (item.type === 'photo' ? item.url : item.thumbnail)?.substring(0, 80)
                        }))
                        const hash = JSON.stringify(first4)
                        if (lastGridLogRef.current !== hash) {
                          lastGridLogRef.current = hash
                            log.debug('IMG', 'First 4 content items', first4)
                        }
                      }

                      return allContent.map((item, index) =>
                        item.type === 'video' ? (
                          <VideoGridItem
                            key={item.id}
                            video={item}
                            index={index}
                            onClick={() => handleOpenContentModal(item)}
                          />
                        ) : (
                          <PhotoGridItem
                            key={item.id}
                            photo={item}
                            index={index}
                            onClick={() => handleOpenContentModal(item)}
                          />
                        )
                      )
                    })()}
                  </div>
                ) : isOwnProfile ? (
                  renderEmptyState(
                    'Mostre seu Talento!',
                    "Você ainda não postou fotos ou vídeos. Clique no '+' para adicionar seu primeiro conteúdo e atrair mais clientes!",
                    PlayCircle,
                    <Button onClick={() => handleOpenUploadDialog('photo')}>
                      <UploadCloud size={18} className="mr-2" />
                      Adicionar Conteúdo
                    </Button>
                  )
                ) : (
                  renderEmptyState(
                    'Sem Publicações Ainda',
                    `${user.name} ainda não compartilhou conteúdo.`,
                    PlayCircle
                  )
                )}
              </TabTransition>
            ) : null}
          </TabsContent>

          <TabsContent
            value="services"
            forceMount={true}
            hidden={activeTab !== 'services'}
          >
            {activeTab === 'services' ? (
              <TabTransition value={activeTab} order={['videos', 'services', 'reviews']}>
                {contentLoading ? (
                  // Skeleton grid para serviços
                  <div className="grid grid-cols-2 gap-4 pt-4 pb-4">
                    {[...Array(4)].map((_, i) => (
                      <div
                        key={i}
                        className="rounded-2xl overflow-hidden bg-muted animate-pulse h-48"
                      />
                    ))}
                  </div>
                ) : services.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4 pt-4 pb-4">
                    {services.map((service) => (
                      <motion.div
                        key={service.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        className="rounded-2xl overflow-hidden bg-card shadow-md hover:shadow-xl transition-all cursor-pointer"
                        onClick={() => handleViewServiceDetails(service)}
                      >
                        {/* Imagem de Capa */}
                        <div className="relative h-40">
                          <ServiceCoverImage service={service} />

                          {/* Badge de Destaque */}
                          {service.bookings_count > 10 && (
                            <span className="absolute top-2 left-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white text-xs px-3 py-1.5 rounded-full font-semibold shadow-lg flex items-center gap-1">
                              <TrendingUp size={12} />
                              Popular
                            </span>
                          )}

                          {service.is_available_today && (
                            <span className="absolute top-2 left-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs px-3 py-1.5 rounded-full font-semibold shadow-lg flex items-center gap-1">
                              <Zap size={12} />
                              Disponível hoje
                            </span>
                          )}

                          {/* Menu de Opções - Três Pontinhos */}
                          {isOwnProfile && (
                            <div className="absolute top-2 right-2">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    className="bg-black/60 backdrop-blur-sm text-white rounded-full p-1.5 hover:bg-black/80 transition-colors shadow-lg"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreVertical size={16} />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleOpenServiceForm(service)
                                    }}
                                  >
                                    <Pencil size={14} className="mr-2" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-red-600"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      openDeleteServiceConfirm(service.id)
                                    }}
                                  >
                                    <Trash2 size={14} className="mr-2" />
                                    Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                        </div>

                        {/* Conteúdo do Card */}
                        <div className="p-3">
                          {/* Título */}
                          <h3 className="font-bold text-base text-foreground mb-2 line-clamp-2">
                            {service.title}
                          </h3>

                          {/* Preço */}
                          <div className="flex items-baseline gap-1 mb-2">
                            <span className="text-orange-500 font-bold text-xl">
                              R$ {service.price}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              / {formatPriceUnit(service.price_unit)}
                            </span>
                          </div>

                          {/* Informações em linha única */}
                          {(() => {
                            const durationText = String(service?.duration || '').trim()
                            const locationText = String(
                              service?.work_area || service?.workArea || user?.location || ''
                            ).trim()

                            const ratingRaw =
                              service?.rating != null ? service.rating : user?.rating
                            const ratingNum = Number(ratingRaw)
                            const ratingText =
                              Number.isFinite(ratingNum) && ratingNum > 0
                                ? ratingNum.toFixed(1).replace('.', ',')
                                : ''

                            const hasAny =
                              !!durationText || !!locationText || !!ratingText
                            if (!hasAny) return null

                            return (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                                {durationText && (
                                  <span className="flex items-center gap-0.5">
                                    <Clock size={14} />
                                    {durationText}
                                  </span>
                                )}
                                {locationText && (
                                  <span className="flex items-center gap-0.5">
                                    <MapPin size={14} />
                                    {locationText}
                                  </span>
                                )}
                                {ratingText && (
                                  <span className="flex items-center gap-0.5">
                                    <Star
                                      size={14}
                                      className="fill-yellow-400 text-yellow-400"
                                    />
                                    {ratingText}
                                  </span>
                                )}
                              </div>
                            )
                          })()}

                          {/* Botão CTA */}
                          <button
                            className="w-full rounded-lg py-2 text-white font-medium text-sm
                            bg-gradient-to-r from-orange-500 to-blue-500
                            hover:opacity-90 hover:shadow-md transition-all duration-200"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleViewServiceDetails(service)
                            }}
                          >
                            {isOwnProfile ? 'Ver Detalhes' : 'Solicitar serviço'}
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : isOwnProfile ? (
                  renderEmptyState(
                    'Cadastre Seus Serviços',
                    'Ainda não há serviços cadastrados. Adicione seus serviços para que os clientes saibam o que você oferece.',
                    Briefcase,
                    <Button onClick={() => handleOpenServiceForm()}>
                      <Briefcase size={18} className="mr-2" />
                      Adicionar Serviço
                    </Button>
                  )
                ) : (
                  renderEmptyState(
                    'Serviços Não Informados',
                    `${user.name} ainda não listou os serviços oferecidos.`,
                    Briefcase
                  )
                )}
              </TabTransition>
            ) : null}
          </TabsContent>

          <TabsContent
            value="reviews"
            forceMount={true}
            hidden={activeTab !== 'reviews'}
          >
            {activeTab === 'reviews' ? (
              <TabTransition value={activeTab} order={['videos', 'services', 'reviews']}>
                {reviews.length > 0 ? (
                  <div className="space-y-3 pt-4">
                    {reviews.map((review) => (
                      <motion.div
                        key={review.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.15 }}
                        style={{ willChange: 'opacity' }}
                      >
                        <Card className="shadow-sm">
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-1">
                              <h3 className="font-medium text-foreground text-sm">
                                {review.author}
                              </h3>
                              <div className="flex items-center">
                                <div className="flex">
                                  {[...Array(5)].map((_, i) => (
                                    <Star
                                      key={i}
                                      size={14}
                                      className={
                                        i < review.rating
                                          ? 'fill-yellow-400 text-yellow-400'
                                          : 'text-muted'
                                      }
                                    />
                                  ))}
                                </div>
                                <span className="text-xs text-muted-foreground ml-2">
                                  {review.date}
                                </span>
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {review.comment}
                            </p>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  renderEmptyState(
                    'Sem Avaliações Ainda',
                    `${user.name} ainda não recebeu avaliações. Seja o primeiro a contratar e avaliar!`,
                    MessageSquareText
                  )
                )}
              </TabTransition>
            ) : null}
          </TabsContent>
        </Tabs>
        <UploadDialog
          isOpen={isUploadDialogOpen}
          setIsOpen={(open) => {
            setIsUploadDialogOpen(open)
            if (!open) {
              updateSearchParams(
                (p) => {
                  p.delete('upload')
                },
                { replace: true }
              )
            }
          }}
          uploadType={uploadType}
          onUploadComplete={handleContentUploaded}
        />
        <ServiceForm
          isOpen={isServiceFormOpen}
          onClose={() => {
            setIsServiceFormOpen(false)
            setEditingService(null)
            updateSearchParams(
              (p) => {
                p.delete('serviceForm')
                p.delete('editService')
              },
              { replace: true }
            )
          }}
          onSave={handleSaveService}
          editingService={editingService}
        />
        <ServiceDetailsModal
          isOpen={isServiceDetailsOpen}
          onClose={() => {
            setIsServiceDetailsOpen(false)
            setSelectedService(null)
            updateSearchParams(
              (p) => {
                p.delete('service')
              },
              { replace: true }
            )
          }}
          service={selectedService}
          professional={{ ...user, isOwnProfile }}
          onEditService={(svc) => {
            const full =
              svc?.id && Array.isArray(services)
                ? services.find((s) => String(s.id) === String(svc.id)) || svc
                : svc
            // Abre o form e fecha os detalhes numa única transição de URL/estado,
            // evitando corrida com location.search desatualizado.
            setEditingService(full)
            setIsServiceFormOpen(true)
            setIsServiceDetailsOpen(false)
            setSelectedService(null)

            updateSearchParams(
              (p) => {
                p.set('serviceForm', '1')
                if (full?.id) p.set('editService', String(full.id))
                else p.delete('editService')
                p.delete('service')
              },
              { replace: false }
            )
          }}
        />
        <ContentViewModal
          isOpen={isContentModalOpen}
          onClose={handleCloseContentModal}
          content={selectedContent}
          user={user}
          onDelete={handleDeleteContent}
          onEdit={handleEditContent}
          onRequestNext={() => navigateProfileContentByDelta(1)}
          onRequestPrev={() => navigateProfileContentByDelta(-1)}
        />
      </div>

      {/* FAB Button - Outside content flow for true fixed positioning */}
      {isOwnProfile && !isContentModalOpen && !isMobileMenuOpen && (
        <AddContentFab onOpenUploadDialog={handleOpenUploadDialog} />
      )}

      <AlertDialog
        open={deleteServiceConfirmOpen}
        onOpenChange={(open) => {
          setDeleteServiceConfirmOpen(open)
          if (!open) setDeleteServiceConfirmId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
            <AlertDialogDescription>
              O serviço será removido do seu perfil. Você pode adicioná-lo novamente depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const serviceId = deleteServiceConfirmId
                if (!serviceId) return
                setDeleteServiceConfirmOpen(false)
                setDeleteServiceConfirmId(null)
                handleDeleteService(serviceId)
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default Profile
