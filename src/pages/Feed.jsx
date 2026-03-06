import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import VideoCard from '@/components/VideoCard'
import { Tabs } from '@/components/ui/tabs'
import { Loader2, WifiOff, UserPlus, Compass, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useLikes } from '@/contexts/LikesContext'
import { useCommentsMeta } from '@/contexts/CommentsMetaContext'
import { supabase } from '@/lib/supabaseClient'
import { useSwipeTabs } from '@/hooks/useSwipeTabs'
import { SwipeTabsList } from '@/components/SwipeTabs'
import { TabTransition } from '@/components/TabTransition'
import { useMobileHeader } from '@/contexts/MobileHeaderContext'
import { log } from '@/lib/logger'

const FeedVideoSkeletonCard = () => {
  return (
    <div
      className="relative mb-3 rounded-xl overflow-hidden bg-card shadow-lg border border-border/50 animate-pulse"
      aria-hidden="true"
    >
      <div className="relative aspect-[9/16] bg-accent">
        <div className="absolute inset-0 bg-gradient-to-t from-accent/80 via-transparent to-accent/50" />

        <div className="absolute top-3 right-3 h-8 w-8 rounded-full bg-muted" />

        <div className="absolute bottom-14 right-3 z-10 flex flex-col items-center space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="h-9 w-9 rounded-full bg-muted" />
              <div className="mt-1 h-2.5 w-8 rounded bg-muted" />
            </div>
          ))}
        </div>

        <div className="absolute bottom-2 left-2 right-2 h-10 rounded-lg bg-muted" />
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center space-x-2.5 mr-2 min-w-0">
            <div className="h-9 w-9 rounded-full bg-muted" />
            <div className="min-w-0 space-y-2">
              <div className="h-3 w-28 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
            </div>
          </div>
        </div>

        <div className="h-4 w-3/4 rounded bg-muted mb-2" />
        <div className="h-3 w-full rounded bg-muted mb-1.5" />
        <div className="h-3 w-5/6 rounded bg-muted mb-3" />

        <div className="flex justify-end">
          <div className="h-3 w-24 rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}

const FeedVideoLoadingSkeleton = ({ count = 2 } = {}) => {
  const n = Math.max(1, Number(count) || 2)
  return (
    <div>
      {Array.from({ length: n }).map((_, idx) => (
        <FeedVideoSkeletonCard key={idx} />
      ))}
    </div>
  )
}

const Feed = () => {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)
  const pageRef = useRef(0)
  const offsetRef = useRef(0)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('for-you')
  const [reloadNonce, setReloadNonce] = useState(0)
  const { showMobileHeader, setShowMobileHeader } = useMobileHeader()
  const { user } = useAuth() // Get current user
  const likes = useLikes()
  const commentsMeta = useCommentsMeta()
  const feedContainerRef = useRef(null)
  const scrollParentRef = useRef(null)
  const activeScrollerRef = useRef(null)
  const topAnchorRef = useRef(null)
  const tabsBarRef = useRef(null)
  const showMobileHeaderRef = useRef(true)
  const lastScrollY = useRef(0)
  const ticking = useRef(false)
  const observerTarget = useRef(null)
  const requestSeqRef = useRef(0)
  const tabCacheRef = useRef(new Map())
  const loadingMoreLockRef = useRef(false)

  const [uiReady, setUiReady] = useState(false)

  const [tabsBarHeight, setTabsBarHeight] = useState(68)
  const [headerHeightPx, setHeaderHeightPx] = useState(48)

  const perfEnabled = React.useMemo(() => {
    if (import.meta.env?.DEV !== true) return false
    if (typeof window === 'undefined') return false
    return window.__JOBY_PERF_FEED === true
  }, [])
  const feedPerfT0Ref = useRef(0)
  useEffect(() => {
    feedPerfT0Ref.current = performance.now()
    if (perfEnabled) {
      log.debug('PERF', 'feed mount', { t: feedPerfT0Ref.current })
    }
  }, [])

  const scheduleIdle = useCallback((fn) => {
    if (typeof window === 'undefined') return
    const run = () => {
      try {
        void fn?.()
      } catch (e) {
        if (perfEnabled) {
          log.warn('PERF', 'idle task failed', e)
        }
      }
    }

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => run(), { timeout: 500 })
      return
    }

    window.setTimeout(() => run(), 50)
  }, [])

  const contentTopPadding = React.useMemo(() => {
    return Math.max(0, Math.round(tabsBarHeight)) + (showMobileHeader ? Math.max(0, Math.round(headerHeightPx)) : 0)
  }, [tabsBarHeight, showMobileHeader, headerHeightPx])

  const readHeaderHeightVar = useCallback(() => {
    if (typeof window === 'undefined') return 0
    const root = document.documentElement
    const raw =
      root.style.getPropertyValue('--joby-mobile-header-height') ||
      window.getComputedStyle(root).getPropertyValue('--joby-mobile-header-height')
    // If the var isn't set yet, keep consistent with CSS fallback (48px)
    // used by the tabs bar translateY: var(--joby-mobile-header-height,48px).
    if (!raw || !String(raw).trim()) return 48
    return Math.max(0, Math.round(parseFloat(raw) || 0))
  }, [])

  const findScrollParent = useCallback((startEl) => {
    let el = startEl
    while (el && el !== document.body && el !== document.documentElement) {
      if (el instanceof HTMLElement) {
        const style = window.getComputedStyle(el)
        const overflowY = style.overflowY
        const isScrollableContainer =
          overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'

        // Important: in many layouts the scroll container is `overflow-y:auto`
        // but it may not be scrollable yet during initial render (content not
        // mounted, images/videos not measured). We still want to lock onto the
        // correct container so our fixed-header padding math is stable.
        if (isScrollableContainer) return el
      }
      el = el.parentElement
    }
    return null
  }, [])

  const getCurrentScrollTop = useCallback((scrollParent) => {
    if (scrollParent && typeof scrollParent.scrollTop === 'number') {
      return scrollParent.scrollTop
    }

    const docScrollTop =
      document.scrollingElement?.scrollTop || document.documentElement?.scrollTop

    return window.scrollY || docScrollTop || 0
  }, [])

  const isValidScrollerEl = useCallback((el) => {
    if (!el || !(el instanceof HTMLElement)) return false
    const style = window.getComputedStyle(el)
    const overflowY = style.overflowY
    const isScrollable =
      overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
    if (!isScrollable) return false
    const ch = el.clientHeight || 0
    const sh = el.scrollHeight || 0
    // Even if not scrollable yet (content not mounted), keep it if it looks like the app scroller.
    // But never accept tiny inner elements.
    if (ch < 120) return false
    return sh >= ch
  }, [])

  // Keep tabs bar height in sync (used to offset the feed content).
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    const el = tabsBarRef.current
    if (!el) return

    const readHeight = () => {
      const rect = el.getBoundingClientRect()
      const height = rect?.height || el.offsetHeight || 0
      if (height > 0) setTabsBarHeight(Math.round(height))
    }

    readHeight()

    let ro
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(() => readHeight())
      try {
        ro.observe(el)
      } catch {
        // ignore
      }
    }

    window.addEventListener('resize', readHeight, { passive: true })
    return () => {
      window.removeEventListener('resize', readHeight)
      if (ro) ro.disconnect()
    }
  }, [])

  // Track the header height CSS variable without expensive per-frame polling.
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    const root = document.documentElement

    const sync = () => {
      setHeaderHeightPx(readHeaderHeightVar())
    }

    sync()

    // Navigation updates --joby-mobile-header-height via root.style.setProperty.
    // Observe changes to the root's style attribute and sync when it changes.
    const mo = new MutationObserver(() => sync())
    try {
      mo.observe(root, { attributes: true, attributeFilter: ['style'] })
    } catch {
      // ignore
    }

    window.addEventListener('resize', sync, { passive: true })
    return () => {
      window.removeEventListener('resize', sync)
      mo.disconnect()
    }
  }, [readHeaderHeightVar])

  const FEED_CACHE_TTL_MS = 45_000
  const MIN_SPINNER_MS = 250

  const TAB_ORDER = ['for-you', 'following', 'nearby']
  const swipeTabs = useSwipeTabs({
    tabs: TAB_ORDER,
    value: activeTab,
    onValueChange: setActiveTab,
  })

  useEffect(() => {
    showMobileHeaderRef.current = !!showMobileHeader
  }, [showMobileHeader])

  // Enable transitions only after the first paint settles.
  // This prevents Chrome scroll-restoration (on reload) from triggering a bad initial animation
  // where the header/tabs momentarily overlap or move together.
  useEffect(() => {
    let raf1 = 0
    let raf2 = 0
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => setUiReady(true))
    })
    return () => {
      if (raf1) window.cancelAnimationFrame(raf1)
      if (raf2) window.cancelAnimationFrame(raf2)
    }
  }, [])

  // Chrome can restore scroll position after reload in a way that doesn't reliably
  // trigger scroll events, which causes incorrect initial header/tab states.
  // We disable automatic restoration while the Feed is mounted.
  useEffect(() => {
    const h = window?.history
    if (!h || typeof h.scrollRestoration !== 'string') return
    const prev = h.scrollRestoration
    h.scrollRestoration = 'manual'
    return () => {
      h.scrollRestoration = prev
    }
  }, [])

  // Sync header visibility BEFORE paint based on the actual scroll position.
  // Important on reloads where Chrome may restore scroll position asynchronously.
  useLayoutEffect(() => {
    let firstBootThisTab = false
    try {
      const k = 'joby-feed-first-boot-v1'
      if (!window.sessionStorage.getItem(k)) {
        window.sessionStorage.setItem(k, '1')
        firstBootThisTab = true
      }
    } catch {
      // ignore
    }

    const sp = scrollParentRef.current || findScrollParent(feedContainerRef.current)
    scrollParentRef.current = sp
    activeScrollerRef.current = sp

    // Solid rule for startup: the first time the app opens in this tab,
    // always start the Feed at the top with header visible.
    // This eliminates Chrome reload/restore edge-cases where header/tabs animate from a wrong state.
    if (firstBootThisTab) {
      try {
        if (sp && typeof sp.scrollTo === 'function') sp.scrollTo({ top: 0, behavior: 'auto' })
        else if (sp) sp.scrollTop = 0
      } catch {
        // ignore
      }

      try {
        const scrollingEl = document.scrollingElement || document.documentElement
        if (scrollingEl) scrollingEl.scrollTop = 0
      } catch {
        // ignore
      }

      try {
        window.scrollTo({ top: 0, behavior: 'auto' })
      } catch {
        // ignore
      }

      lastScrollY.current = 0
      showMobileHeaderRef.current = true
      setShowMobileHeader(true)
      return
    }

    const y = getCurrentScrollTop(sp)
    lastScrollY.current = y

    // Solid rule: header only shows at the very top.
    const shouldShow = y <= 2
    showMobileHeaderRef.current = shouldShow
    setShowMobileHeader(shouldShow)
  }, [findScrollParent, getCurrentScrollTop, setShowMobileHeader])

  useEffect(() => {
    pageRef.current = page
  }, [page])

  const getScrollMetrics = useCallback((scrollParent) => {
    if (scrollParent && scrollParent !== window && scrollParent !== document) {
      return {
        scrollTop: scrollParent.scrollTop || 0,
        clientHeight: scrollParent.clientHeight || 0,
        scrollHeight: scrollParent.scrollHeight || 0,
      }
    }

    const scrollingEl = document.scrollingElement || document.documentElement
    return {
      scrollTop: getCurrentScrollTop(null),
      clientHeight: window.innerHeight || scrollingEl?.clientHeight || 0,
      scrollHeight: scrollingEl?.scrollHeight || 0,
    }
  }, [getCurrentScrollTop])

  const scrollFeedToTop = useCallback(
    (behavior = 'smooth') => {
      const anchor = topAnchorRef.current
      if (anchor && typeof anchor.scrollIntoView === 'function') {
        anchor.scrollIntoView({ behavior, block: 'start', inline: 'nearest' })
        return
      }

      const scrollParent = scrollParentRef.current || findScrollParent(feedContainerRef.current)
      scrollParentRef.current = scrollParent

      const doScroll = () => {
        if (scrollParent && typeof scrollParent.scrollTo === 'function') {
          scrollParent.scrollTo({ top: 0, behavior })
        } else if (scrollParent) {
          scrollParent.scrollTop = 0
        }

        const scrollingEl = document.scrollingElement || document.documentElement
        if (scrollingEl && typeof scrollingEl.scrollTo === 'function') {
          scrollingEl.scrollTo({ top: 0, behavior })
        } else if (scrollingEl) {
          scrollingEl.scrollTop = 0
        }

        window.scrollTo({ top: 0, behavior })
      }

      doScroll()
      // Alguns WebViews reaplicam o scroll após re-render; reforça no próximo frame.
      window.requestAnimationFrame(doScroll)
    },
    [findScrollParent]
  )

  const isFeedAtTop = useCallback(() => {
    const scrollParent = scrollParentRef.current || findScrollParent(feedContainerRef.current)
    scrollParentRef.current = scrollParent
    const scrollTop = getCurrentScrollTop(scrollParent)
    if (scrollTop < 10) return true

    const anchor = topAnchorRef.current
    if (anchor && typeof anchor.getBoundingClientRect === 'function') {
      const rect = anchor.getBoundingClientRect()
      // Se o topo do conteúdo estiver praticamente visível (abaixo do header fixo), consideramos "no topo".
      if (rect.top >= 0 && rect.top < 140) return true
    }

    return false
  }, [findScrollParent, getCurrentScrollTop])

  // Detectar scroll para esconder/mostrar header (somente no Feed)
  useEffect(() => {
    const resolveScrollParent = () => {
      const sp = scrollParentRef.current || findScrollParent(feedContainerRef.current)
      scrollParentRef.current = sp
      return sp
    }

    const getScrollTopFromEvent = (ev) => {
      const target = ev?.target

      // If the event target is a real scrolling element, prefer it.
      if (target && target instanceof HTMLElement) {
        if (isValidScrollerEl(target)) {
          scrollParentRef.current = target
          activeScrollerRef.current = target
          return target.scrollTop || 0
        }
      }

      // Document/window scrolling fallback
      const scrollingEl = document.scrollingElement || document.documentElement
      return window.scrollY || scrollingEl?.scrollTop || 0
    }

    const readScrollTop = () => {
      const sp = resolveScrollParent()
      if (sp) return getCurrentScrollTop(sp)

      const scrollingEl = document.scrollingElement || document.documentElement
      return window.scrollY || scrollingEl?.scrollTop || 0
    }

    const handleScroll = (e) => {
      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          try {
            const isHeaderVisible = showMobileHeaderRef.current

            // Deterministic thresholds (prevents header pop-in mid-feed).
            const SHOW_AT_TOP_PX = 2
            const HIDE_AFTER_PX = 6

            const currentScrollY = (() => {
              const fromEvent = getScrollTopFromEvent(e)
              if (typeof fromEvent === 'number' && !Number.isNaN(fromEvent)) return fromEvent
              return readScrollTop()
            })()

            // Solid hysteresis: show only at top, hide immediately after first scroll down.
            // Between thresholds we keep the current state.
            if (currentScrollY <= SHOW_AT_TOP_PX) {
              if (!isHeaderVisible) {
                showMobileHeaderRef.current = true
                setShowMobileHeader(true)
              }
            } else if (currentScrollY >= HIDE_AFTER_PX) {
              if (isHeaderVisible) {
                showMobileHeaderRef.current = false
                setShowMobileHeader(false)
              }
            }

            lastScrollY.current = currentScrollY
          } finally {
            ticking.current = false
          }
        })
        ticking.current = true
      }
    }

    const scrollParent = findScrollParent(feedContainerRef.current)
    scrollParentRef.current = scrollParent
    activeScrollerRef.current = scrollParent

    // Initialize with the current scroll position to avoid a large first delta.
    lastScrollY.current = readScrollTop()

    const attachTo = (el) => {
      if (el && el instanceof HTMLElement) {
        el.addEventListener('scroll', handleScroll, { passive: true })
      } else {
        window.addEventListener('scroll', handleScroll, { passive: true })
      }
    }

    const detachFrom = (el) => {
      if (el && el instanceof HTMLElement) {
        el.removeEventListener('scroll', handleScroll)
      } else {
        window.removeEventListener('scroll', handleScroll)
      }
    }

    attachTo(scrollParent)

    // Capture listener only for scroller discovery during the first moments.
    // Prevents multiple sources from fighting forever.
    const onCapture = (ev) => {
      const t = ev?.target
      if (t && t instanceof HTMLElement && isValidScrollerEl(t) && t !== activeScrollerRef.current) {
        const prev = activeScrollerRef.current
        detachFrom(prev)
        activeScrollerRef.current = t
        scrollParentRef.current = t
        attachTo(t)
        handleScroll(ev)
      }
    }

    window.addEventListener('scroll', onCapture, { passive: true, capture: true })

    // Lightweight stabilization loop: Chrome may restore scrollTop after mount.
    // We only READ scrollTop (no layout) and sync header state if it changes.
    let rafId = 0
    const startAt = performance.now()
    const stabilize = () => {
      const sp = activeScrollerRef.current || resolveScrollParent()
      const y = getCurrentScrollTop(sp)
      if (Math.abs(y - (lastScrollY.current || 0)) > 1) {
        lastScrollY.current = y
        const shouldShow = y <= 2
        if (showMobileHeaderRef.current !== shouldShow) {
          showMobileHeaderRef.current = shouldShow
          setShowMobileHeader(shouldShow)
        }
      }

      if (performance.now() - startAt < 900) {
        rafId = window.requestAnimationFrame(stabilize)
      }
    }
    rafId = window.requestAnimationFrame(stabilize)

    // Sync once on mount so the header state matches the current scroll.
    // Do it in rAF to give the layout a moment to settle on fresh app opens.
    window.requestAnimationFrame(() => handleScroll())

    // And sync again shortly after mount + on pageshow (bfcache / reload restoration).
    const t = window.setTimeout(() => handleScroll(), 180)
    const onPageShow = () => handleScroll()
    window.addEventListener('pageshow', onPageShow)

    // Cleanup: Resetar header ao sair da página
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId)

      window.removeEventListener('scroll', onCapture, { capture: true })

      detachFrom(activeScrollerRef.current)
      activeScrollerRef.current = null
      window.removeEventListener('pageshow', onPageShow)
      window.clearTimeout(t)
      // Apenas ao desmontar o Feed
      showMobileHeaderRef.current = true
      setShowMobileHeader(true)
    }
  }, [findScrollParent, getCurrentScrollTop, isValidScrollerEl, setShowMobileHeader])

  const fetchVideos = useCallback(
    async (tab, pageNum = 0, append = false, opts = {}) => {
      const { soft = false, silent = false, prefetch = false } = opts
      const requestSeq = ++requestSeqRef.current
      const startedAt = performance.now()

      const INITIAL_LIMIT = 4
      const PAGE_LIMIT = 10

      const cachedForTab = tabCacheRef.current.get(tab)
      const isInitialTabLoad =
        !append &&
        pageNum === 0 &&
        !soft &&
        (!cachedForTab || !Array.isArray(cachedForTab.videos) || cachedForTab.videos.length === 0)
      if (isInitialTabLoad) {
        if (perfEnabled) {
          log.debug('PERF', 'feed initial fetch start', { tab, t: startedAt })
        }
      }

      if (append) {
        loadingMoreLockRef.current = true
        if (!silent) setLoadingMore(true)
      } else {
        // Se já temos vídeos na tela, faz refresh “suave” sem piscar
        if (soft && videos.length > 0) setRefreshing(true)
        else setLoading(true)

        setPage(0)
        pageRef.current = 0
        offsetRef.current = 0
        setHasMore(true)
      }

      // Não travar a UI com erro antigo durante refresh
      setError(null)

      try {
        const limit = isInitialTabLoad ? INITIAL_LIMIT : PAGE_LIMIT
        const from = append ? offsetRef.current : 0
        const to = from + limit - 1

        const baseSelectVariants = [
          // Preferido (novo schema): inclui upload_type + metadata
          `
            id,
            url,
            title,
            description,
            thumbnail_url,
            thumbnail,
            upload_type,
            duration_seconds,
            width,
            height,
            video_type,
            views,
            likes,
            comments_count,
            created_at,
            provider,
            user:user_id(id, username, name, profession, avatar)
          `,
          // Fallback (novo schema): sem username
          `
            id,
            url,
            title,
            description,
            thumbnail_url,
            thumbnail,
            upload_type,
            duration_seconds,
            width,
            height,
            video_type,
            views,
            likes,
            comments_count,
            created_at,
            provider,
            user:user_id(id, name, profession, avatar)
          `,
          // Preferido: com username (nickname) + comments_count
          `
            id,
            url,
            title,
            description,
            thumbnail_url,
            thumbnail,
            video_type,
            views,
            likes,
            comments_count,
            created_at,
            provider,
            user:user_id(id, username, name, profession, avatar)
          `,
          // Fallback: sem username
          `
            id,
            url,
            title,
            description,
            thumbnail_url,
            thumbnail,
            video_type,
            views,
            likes,
            comments_count,
            created_at,
            provider,
            user:user_id(id, name, profession, avatar)
          `,
          // Fallback sem comments_count (mas com username se existir)
          `
            id,
            url,
            title,
            description,
            thumbnail_url,
            thumbnail,
            video_type,
            views,
            likes,
            created_at,
            provider,
            user:user_id(id, username, name, profession, avatar)
          `,
          // Fallback final: schema antigo sem thumbnail_url
          `
            id,
            url,
            title,
            description,
            thumbnail,
            video_type,
            views,
            likes,
            comments_count,
            created_at,
            provider,
            user:user_id(id, username, name, profession, avatar)
          `,
          // Fallback final (antigo): sem username e sem thumbnail_url
          `
            id,
            url,
            title,
            description,
            thumbnail,
            video_type,
            views,
            likes,
            comments_count,
            created_at,
            provider,
            user:user_id(id, name, profession, avatar)
          `,
        ]

        const selectVariants = baseSelectVariants

        // Calcular filtros (following/nearby) uma vez
        let followingIds = null
        let nearbyIds = null

        if (tab === 'following' && user) {
          // Buscar vídeos de quem o usuário segue
          const { data: followsData } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', user.id)

          followingIds = followsData?.map((f) => f.following_id) || []
          if (followingIds.length === 0) {
            if (requestSeq !== requestSeqRef.current) return
            setVideos([])
            setHasMore(false)
            tabCacheRef.current.set(tab, {
              videos: [],
              page: 0,
              offset: 0,
              hasMore: false,
              ts: Date.now(),
            })
            return
          }
        } else if (tab === 'nearby' && user?.location) {
          // Buscar vídeos de usuários próximos (mesma localização)
          const { data: nearbyUsers } = await supabase
            .from('profiles')
            .select('id')
            .eq('location', user.location)

          nearbyIds = nearbyUsers?.map((u) => u.id) || []
        }

        const buildQuery = (selectStr) => {
          let q = supabase
            .from('videos')
            .select(selectStr)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to)

          // "Para Você" deve trazer todos os vídeos que o usuário pode ver (RLS decide).
          // As outras abas continuam limitadas a públicos.
          if (tab !== 'for-you') {
            q = q.eq('is_public', true)
          }

          if (Array.isArray(followingIds)) q = q.in('user_id', followingIds)
          if (Array.isArray(nearbyIds) && nearbyIds.length > 0) q = q.in('user_id', nearbyIds)
          return q
        }

        let data
        let error
        for (const selectStr of selectVariants) {
          const result = await buildQuery(selectStr)
          data = result.data
          error = result.error
          if (!error) break
        }

        if (error) throw error

        const pageItems = Array.isArray(data) ? data : []
        const baseHasMore = pageItems.length >= limit

        const pageIds = pageItems.map((r) => r?.id).filter(Boolean)

        if (requestSeq !== requestSeqRef.current) return

        if (isInitialTabLoad && perfEnabled) {
          log.debug('PERF', 'feed first items received', {
            tab,
            count: pageItems.length,
            t: performance.now(),
            dt: Math.round(performance.now() - startedAt),
          })
        }

        if (!append) {
          setHasMore(baseHasMore)
        }

        if (append) {
          setVideos((prev) => {
            const seen = new Set((prev || []).map((v) => String(v?.id ?? '')))
            const uniqueIncoming = pageItems.filter((v) => {
              const id = String(v?.id ?? '')
              if (!id) return false
              if (seen.has(id)) return false
              seen.add(id)
              return true
            })

            const next = [...prev, ...uniqueIncoming]
            const hasAnyNew = uniqueIncoming.length > 0
            const nextHasMore = baseHasMore && hasAnyNew

            // Se não veio nada novo, para de tentar para não repetir.
            if (!hasAnyNew) {
              setHasMore(false)
            } else {
              setHasMore(nextHasMore)
            }

            tabCacheRef.current.set(tab, {
              videos: next,
              page: pageNum,
              offset: from + pageItems.length,
              hasMore: hasAnyNew ? nextHasMore : false,
              ts: Date.now(),
            })
            return next
          })

          offsetRef.current = from + pageItems.length
          if (pageNum > pageRef.current) {
            pageRef.current = pageNum
            setPage(pageNum)
          }
        } else {
          const next = pageItems
          setVideos(next)
          tabCacheRef.current.set(tab, {
            videos: next,
            page: 0,
            offset: pageItems.length,
            hasMore: baseHasMore,
            ts: Date.now(),
          })

          offsetRef.current = pageItems.length
        }

        // Hydrate likes/comments AFTER first paint (idle), never blocking render.
        if (pageIds.length > 0) {
          window.requestAnimationFrame(() => {
            scheduleIdle(async () => {
              await Promise.all([
                likes.hydrateForIds('video', pageIds),
                commentsMeta.hydrateForIds('video', pageIds),
              ])
            })
          })
        }

        // Background prefetch: after the initial 4 items render, fetch the next chunk silently.
        if (isInitialTabLoad && baseHasMore && !prefetch) {
          window.requestAnimationFrame(() => {
            scheduleIdle(() => {
              if (requestSeq !== requestSeqRef.current) return
              if (perfEnabled) {
                log.debug('PERF', 'feed background prefetch start', { tab, t: performance.now() })
              }
              void fetchVideos(tab, 1, true, { silent: true, prefetch: true })
            })
          })
        }
      } catch (err) {
        if (requestSeq !== requestSeqRef.current) return
        setError('Falha ao carregar vídeos. Tente novamente.')
        log.error('FEED', 'fetchVideos error', err)
      } finally {
        const elapsed = performance.now() - startedAt
        const remaining = Math.max(0, MIN_SPINNER_MS - elapsed)

        if (remaining > 0) {
          await new Promise((r) => setTimeout(r, remaining))
        }

        // Sempre finalize o spinner de append, mesmo se a request ficou "stale".
        if (append) {
          setLoadingMore(false)
          loadingMoreLockRef.current = false
          return
        }

        // Para requests base/refresh, só finalize quando for a mais recente.
        if (requestSeq !== requestSeqRef.current) return
        setLoading(false)
        setRefreshing(false)
        setLoadingMore(false)
        loadingMoreLockRef.current = false
      }
    },
    // Intencionalmente inclui videos.length para decidir entre loading x refresh suave
    [commentsMeta, likes, scheduleIdle, user, videos.length, perfEnabled]
  )

  const handleTabClick = useCallback(
    (value) => {
      if (value !== 'for-you') return

      const scrollParent =
        scrollParentRef.current || findScrollParent(feedContainerRef.current)
      scrollParentRef.current = scrollParent
      const isAtTop = isFeedAtTop()

      // 1) Sempre leva ao topo
      scrollFeedToTop('smooth')

      // 2) Se já está no topo e já está em "Para Você", recarrega
      if (isAtTop && activeTab === 'for-you') {
        tabCacheRef.current.delete('for-you')
        setReloadNonce((n) => n + 1)
        fetchVideos('for-you', 0, false, { soft: true })
      }
    },
    [activeTab, fetchVideos, findScrollParent, isFeedAtTop, scrollFeedToTop]
  )

  const handleTabsClickCapture = useCallback(
    (e) => {
      const tabEl = e?.target?.closest?.('[role="tab"]')
      if (!tabEl) return
      const labelRaw = String(tabEl.textContent || '').trim()
      if (!labelRaw) return

      // Normaliza acentos: "Você" -> "voce"
      const label = labelRaw
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')

      if (label === 'para voce' || label.includes('para voce')) {
        handleTabClick('for-you')
      }
    },
    [handleTabClick]
  )

  const loadMore = useCallback(() => {
    if (!hasMore) return
    if (loadingMoreLockRef.current) return
    if (loadingMore) return

    const nextPage = pageRef.current + 1
    pageRef.current = nextPage
    setPage(nextPage)
    loadingMoreLockRef.current = true
    fetchVideos(activeTab, nextPage, true)
  }, [fetchVideos, hasMore, loadingMore, activeTab])

  useEffect(() => {
    const cached = tabCacheRef.current.get(activeTab)
    if (cached && Date.now() - cached.ts < FEED_CACHE_TTL_MS) {
      setVideos(cached.videos || [])
      setPage(cached.page || 0)
      offsetRef.current = typeof cached.offset === 'number' ? cached.offset : (cached.videos || []).length
      setHasMore(typeof cached.hasMore === 'boolean' ? cached.hasMore : true)
      setLoading(false)
      setError(null)
      // Atualiza em background sem piscar
      fetchVideos(activeTab, 0, false, { soft: true })
      return
    }

    fetchVideos(activeTab)
  }, [activeTab, fetchVideos])

  // Infinite scroll com IntersectionObserver
  useEffect(() => {
    const rootEl = scrollParentRef.current || findScrollParent(feedContainerRef.current)
    scrollParentRef.current = rootEl

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore()
        }
      },
      {
        root: rootEl || null,
        threshold: 0.1,
        rootMargin: '400px 0px',
      }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [findScrollParent, hasMore, loadingMore, loadMore])

  // Fallback: alguns WebViews não disparam IntersectionObserver de forma confiável.
  useEffect(() => {
    const rootEl = activeScrollerRef.current || scrollParentRef.current || findScrollParent(feedContainerRef.current)
    scrollParentRef.current = rootEl
    activeScrollerRef.current = rootEl

    let rafId = 0
    const onScroll = () => {
      if (rafId) return
      rafId = window.requestAnimationFrame(() => {
        rafId = 0
        if (!hasMore || loadingMore || loading) return

        const { scrollTop, clientHeight, scrollHeight } = getScrollMetrics(rootEl)
        if (!scrollHeight || !clientHeight) return

        const distanceToBottom = scrollHeight - (scrollTop + clientHeight)
        if (distanceToBottom < 900) {
          loadMore()
        }
      })
    }

    if (rootEl) {
      rootEl.addEventListener('scroll', onScroll, { passive: true })
    }
    // Window fallback (no capture) for cases where the document is the scroller.
    window.addEventListener('scroll', onScroll, { passive: true })

    // Checagem imediata: se a lista ainda é curta, carrega mais
    onScroll()

    return () => {
      if (rootEl) rootEl.removeEventListener('scroll', onScroll)
      window.removeEventListener('scroll', onScroll)
      if (rafId) window.cancelAnimationFrame(rafId)
    }
  }, [findScrollParent, getScrollMetrics, hasMore, loadMore, loading, loadingMore])

  const renderEmptyState = (tab) => {
    let icon, title, message, actionButton
    switch (tab) {
      case 'following':
        icon = UserPlus
        title = 'Siga Profissionais'
        message =
          'Você ainda não segue ninguém. Comece a seguir para ver os vídeos deles aqui!'
        actionButton = (
          <Button
            size="sm"
            onClick={() => {
              /* Navigate to explore or search */
            }}
          >
            <Compass size={16} className="mr-2" /> Explorar{' '}
          </Button>
        )
        break
      case 'nearby':
        icon = Compass
        title = 'Descubra Talentos Próximos'
        message =
          'Ative sua localização para ver vídeos de profissionais perto de você ou explore manualmente.'
        actionButton = (
          <Button
            size="sm"
            onClick={() => {
              /* Open location settings or search */
            }}
          >
            <Compass size={16} className="mr-2" /> Buscar Próximos
          </Button>
        )
        break
      default: // Also for 'for-you' if it's empty
        icon = UploadCloud
        title = 'Nenhum Vídeo por Aqui'
        message =
          'Parece que não há vídeos para mostrar agora. Que tal explorar ou postar o seu?'
        actionButton = (
          <Button
            size="sm"
            onClick={() => {
              /* Navigate to upload or explore */
            }}
          >
            <UploadCloud size={16} className="mr-2" /> Postar Vídeo
          </Button>
        )
        break
    }

    return (
      <motion.div
        key={tab + '-empty'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1 }}
        className="flex flex-col items-center justify-center text-center py-12 px-4 min-h-[calc(100vh-11rem)]"
      >
        {React.createElement(icon, {
          size: 40,
          className: 'text-muted-foreground mb-3 opacity-70',
        })}
        <h3 className="text-lg font-semibold text-foreground mb-1.5">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground mb-5 max-w-xs mx-auto leading-relaxed">
          {message}
        </p>
        {actionButton}
      </motion.div>
    )
  }

  return (
    <div ref={feedContainerRef} className="touch-pan-y" {...swipeTabs.containerProps}>
      <div
        ref={tabsBarRef}
        className={`fixed left-0 right-0 md:left-64 top-0 z-[60] bg-background border-b border-border transform-gpu md:top-0 md:translate-y-0 ${
          uiReady ? 'transition-transform duration-150 ease-out' : ''
        } ${
          showMobileHeader
            ? 'translate-y-[var(--joby-mobile-header-height,48px)]'
            : 'translate-y-0 safeFeedTabs'
        }`}
        style={{ willChange: 'transform' }}
      >
        <div onClickCapture={handleTabsClickCapture}>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <SwipeTabsList
              tabs={[
                { value: 'for-you', label: 'Para Você' },
                { value: 'following', label: 'Seguindo' },
                { value: 'nearby', label: 'Próximos' },
              ]}
              listClassName="w-full h-12 rounded-none"
              triggerClassName="text-sm md:text-base flex-1"
              onTabClick={handleTabClick}
            />
          </Tabs>
        </div>
      </div>

      <div ref={topAnchorRef} className="h-0 w-0" aria-hidden="true" />

      <AnimatePresence mode="wait">
        {loading && videos.length === 0 ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className={`px-3 pb-6 min-h-[calc(100vh-11rem)] ${
              uiReady ? 'transition-[padding-top] duration-150 ease-out' : ''
            }`}
            style={{ paddingTop: `${contentTopPadding}px` }}
          >
            <FeedVideoLoadingSkeleton count={2} />
          </motion.div>
        ) : error && videos.length === 0 ? (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className={`flex flex-col items-center justify-center min-h-[calc(100vh-11rem)] text-center px-4 ${
              uiReady ? 'transition-[padding-top] duration-150 ease-out' : ''
            }`}
            style={{ paddingTop: `${contentTopPadding}px` }}
          >
            <WifiOff className="h-10 w-10 text-destructive mb-3" />
            <p className="text-base font-semibold text-destructive-foreground mb-1.5">
              Oops! Algo deu errado.
            </p>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">
              {error}
            </p>
            <Button onClick={() => fetchVideos(activeTab)} size="sm">
              Tentar Novamente
            </Button>
          </motion.div>
        ) : videos.length === 0 ? (
          renderEmptyState(activeTab)
        ) : (
          <TabTransition
            value={activeTab}
            order={TAB_ORDER}
            className={`px-3 pb-6 ${uiReady ? 'transition-[padding-top] duration-150 ease-out' : ''}`}
            style={{ paddingTop: `${contentTopPadding}px` }}
          >
            <>
              {videos.map((video, index) => (
                <VideoCard
                  key={`${reloadNonce}-${video.id || index}`}
                  video={video}
                  user={video.user}
                  isFirst={index === 0}
                />
              ))}

              {/* Observer target para infinite scroll */}
              {hasMore && (
                <div ref={observerTarget} className="py-6">
                  {loadingMore && <FeedVideoSkeletonCard />}
                </div>
              )}

              {!hasMore && videos.length > 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Você viu todos os vídeos disponíveis
                </div>
              )}
            </>
          </TabTransition>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Feed
