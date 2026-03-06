import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Search, SlidersHorizontal } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import LoadingSkeleton from '@/components/explore/LoadingSkeleton'
import EmptyState from '@/components/explore/EmptyState'
import { useDebounce } from '@/hooks/useDebounce'
import PeopleCarousel from '@/components/explore/PeopleCarousel'
import ServicesShowcase from '@/components/explore/ServicesShowcase'
import PublicationResultCard from '@/components/explore/PublicationResultCard'
import { ExploreFiltersSheet } from '@/components/explore/ExploreFiltersSheet'
import ReelPreviewCard from '@/components/explore/ReelPreviewCard'
import { ReelsFeedModal } from '@/components/explore/ReelsFeedModal'
import ServiceDetailsModal from '@/components/ServiceDetailsModal'
import ContentViewModal from '@/components/ContentViewModal'
import { exploreSearch, inferSearchIntent } from '@/services/exploreSearchService'
import { useToast } from '@/components/ui/use-toast'
import { useLikes } from '@/contexts/LikesContext'
import { cn } from '@/lib/utils'
import { log } from '@/lib/logger'

const Explore = () => {
  const { toast } = useToast()
  const likes = useLikes()
  const likesRef = useRef(likes)
  const [searchParams] = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebounce(searchTerm, 400)
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    const tab = String(searchParams.get('tab') || '').trim().toLowerCase()
    if (!tab) return
    if (tab === 'all' || tab === 'people' || tab === 'services' || tab === 'reels') {
      setActiveTab(tab)
    }
  }, [searchParams])

  const [allPublicationsVisible, setAllPublicationsVisible] = useState(12)
  const [loadingMorePublications, setLoadingMorePublications] = useState(false)

  const [blockedWarning, setBlockedWarning] = useState('')

  const [profiles, setProfiles] = useState([])
  const [services, setServices] = useState([])
  const [publications, setPublications] = useState([])

  const [serviceModalOpen, setServiceModalOpen] = useState(false)
  const [selectedService, setSelectedService] = useState(null)
  const [selectedServiceProfessional, setSelectedServiceProfessional] = useState(null)

  const [contentModalOpen, setContentModalOpen] = useState(false)
  const [selectedContent, setSelectedContent] = useState(null)
  const [selectedContentAuthor, setSelectedContentAuthor] = useState(null)

  const [reelsFeedOpen, setReelsFeedOpen] = useState(false)
  const [reelsFeedIndex, setReelsFeedIndex] = useState(0)
  const [reelsFeedSeed, setReelsFeedSeed] = useState([])
  const [reelsFeedTerm, setReelsFeedTerm] = useState('')

  const requestSeq = useRef(0)

  useEffect(() => {
    setAllPublicationsVisible(12)
    setLoadingMorePublications(false)
  }, [debouncedSearchTerm, activeTab])

  useEffect(() => {
    likesRef.current = likes
  }, [likes])

  const touchHoverActiveRef = useRef(false)
  const activePreviewVideoRef = useRef(null)
  const touchHoverRafRef = useRef(0)
  const touchHoverPointRef = useRef({ x: 0, y: 0, has: false })

  const startPreviewForVideoEl = (el) => {
    if (!el) return
    if (activePreviewVideoRef.current === el) {
      // already previewing
      return
    }

    const prev = activePreviewVideoRef.current
    if (prev && prev !== el) {
      try {
        prev.pause?.()
        prev.currentTime = 0
      } catch {
        // ignore
      }
    }

    activePreviewVideoRef.current = el
    try {
      el.muted = true
      el.playsInline = true
      el.loop = true
      const p = el.play?.()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    } catch {
      // ignore
    }
  }

  const stopActivePreview = () => {
    const el = activePreviewVideoRef.current
    activePreviewVideoRef.current = null
    if (!el) return
    try {
      el.pause?.()
      el.currentTime = 0
    } catch {
      // ignore
    }
  }

  const runTouchHoverHitTest = () => {
    touchHoverRafRef.current = 0
    if (!touchHoverActiveRef.current) return
    if (!touchHoverPointRef.current?.has) return

    const x = Number(touchHoverPointRef.current.x || 0)
    const y = Number(touchHoverPointRef.current.y || 0)

    const hit = document.elementFromPoint?.(x, y)
    const card = hit?.closest?.('[data-preview-card="publication"]')
    if (!card) {
      stopActivePreview()
      return
    }

    const videoEl = card.querySelector?.('video[data-preview-video="1"]')
    if (!videoEl) {
      stopActivePreview()
      return
    }

    startPreviewForVideoEl(videoEl)
  }

  const requestTouchHoverHitTest = (x, y) => {
    touchHoverPointRef.current = { x, y, has: true }
    if (touchHoverRafRef.current) return
    touchHoverRafRef.current = window.requestAnimationFrame(runTouchHoverHitTest)
  }

  const handleTouchHoverStartCapture = (e) => {
    touchHoverActiveRef.current = true

    const touches = e?.touches
    if (!touches || touches.length !== 1) {
      stopActivePreview()
      return
    }

    const t = touches[0]
    requestTouchHoverHitTest(Number(t.clientX || 0), Number(t.clientY || 0))
  }

  const handleTouchHoverMoveCapture = (e) => {
    if (!touchHoverActiveRef.current) return
    const touches = e?.touches
    if (!touches || touches.length !== 1) {
      stopActivePreview()
      return
    }

    const t = touches[0]
    requestTouchHoverHitTest(Number(t.clientX || 0), Number(t.clientY || 0))
  }

  const handleTouchHoverEndCapture = () => {
    touchHoverActiveRef.current = false
    touchHoverPointRef.current = { x: 0, y: 0, has: false }
    if (touchHoverRafRef.current) {
      window.cancelAnimationFrame(touchHoverRafRef.current)
      touchHoverRafRef.current = 0
    }
    // Premium: ao soltar o dedo, mantém o último preview tocando.
    // Só troca/parar quando o usuário tocar/passar por outro card.
  }

  // Scroll para o topo ao montar o componente
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  // Debug: detectar elementos que estouram a largura no mobile (somente em DEV)
  useEffect(() => {
    if (!import.meta?.env?.DEV) return

    const id = window.setTimeout(() => {
      try {
        const docEl = document.documentElement
        const overflow = docEl.scrollWidth - docEl.clientWidth
        if (overflow <= 0) return

        const offenders = []
        const all = Array.from(document.querySelectorAll('body *'))
        for (const el of all) {
          const rect = el.getBoundingClientRect?.()
          if (!rect) continue
          if (rect.right > docEl.clientWidth + 1 || rect.left < -1) {
            offenders.push({
              el,
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
            })
          }
        }

        log.warn('EXPLORE', 'overflow-x detected', {
          clientWidth: docEl.clientWidth,
          scrollWidth: docEl.scrollWidth,
          overflow,
          offenders: offenders.slice(0, 20).map((o) => ({
            tag: o.el.tagName,
            className: o.el.className,
            left: o.left,
            right: o.right,
            width: o.width,
          })),
        })
      } catch {
        // ignore
      }
    }, 300)

    return () => window.clearTimeout(id)
  }, [activeTab, debouncedSearchTerm, loading, publications.length, profiles.length, services.length])

  const intent = useMemo(() => inferSearchIntent(debouncedSearchTerm), [debouncedSearchTerm])

  const handleLoadMorePublications = async () => {
    if (activeTab !== 'all') return
    if (loadingMorePublications) return

    const term = String(debouncedSearchTerm || '').trim()
    const nextVisible = allPublicationsVisible + 12

    // If we already have enough items in memory, just reveal more.
    if ((publications || []).length >= nextVisible) {
      setAllPublicationsVisible(nextVisible)
      return
    }

    const nextPerType = Math.max(12, Math.ceil(nextVisible / 2))

    const seq = ++requestSeq.current
    setLoadingMorePublications(true)

    try {
      const res = await exploreSearch(term, {
        limits: { profiles: 8, services: 8, videos: nextPerType, photos: nextPerType },
      })

      if (seq !== requestSeq.current) return

      setProfiles(res.profiles || [])
      setServices(res.services || [])

      // Pre-hydrate like counts (RPC) for publications before rendering.
      try {
        const pubs = res.publications || []
        const videoIds = []
        const photoIds = []
        for (const p of pubs) {
          const id = p?.id
          if (!id) continue
          const isVideo = p?.type === 'video' || p?.video_type
          if (isVideo) videoIds.push(id)
          else photoIds.push(id)
        }

        const hydrate = likesRef.current?.hydrateForIds
        if (typeof hydrate === 'function' && (videoIds.length || photoIds.length)) {
          await Promise.all([
            videoIds.length ? hydrate('video', videoIds) : Promise.resolve(),
            photoIds.length ? hydrate('photo', photoIds) : Promise.resolve(),
          ])
        }
      } catch {
        // best-effort
      }

      if (seq !== requestSeq.current) return
      setPublications(res.publications || [])
      setAllPublicationsVisible(nextVisible)

      const permissionErrors = [res?.errors?.profiles, res?.errors?.services, res?.errors?.videos, res?.errors?.photos]
        .filter(Boolean)
        .filter((e) => String(e?.code || '') === '42501' || Number(e?.status || 0) === 403 || String(e?.message || '').toLowerCase().includes('permission denied'))

      if (permissionErrors.length > 0) {
        setBlockedWarning('Alguns resultados podem estar indisponíveis por permissões (RLS) no Supabase. Faça login ou ajuste as políticas de leitura.')
      } else {
        setBlockedWarning('')
      }
    } catch (e) {
      if (seq !== requestSeq.current) return
      log.error('EXPLORE', 'load more publications error', e)
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar mais publicações agora.',
        variant: 'destructive',
      })
    } finally {
      if (seq !== requestSeq.current) return
      setLoadingMorePublications(false)
    }
  }

  useEffect(() => {
    const seq = ++requestSeq.current
    const term = String(debouncedSearchTerm || '').trim()

    setLoading(true)

    ;(async () => {
      try {
        const res = await exploreSearch(term, {
          limits:
            activeTab === 'all'
              ? { profiles: 8, services: 8, videos: 12, photos: 12 }
              : activeTab === 'people'
              ? { profiles: 24, services: 0, videos: 0, photos: 0 }
              : activeTab === 'services'
              ? { profiles: 0, services: 24, videos: 0, photos: 0 }
              : { profiles: 0, services: 0, videos: 18, photos: 18 },
        })

        if (seq !== requestSeq.current) return
        setProfiles(res.profiles || [])
        setServices(res.services || [])

        // Avoid flashing wrong like counts: pre-hydrate like counts (RPC) for publications
        // before rendering the cards.
        try {
          const pubs = res.publications || []
          const videoIds = []
          const photoIds = []
          for (const p of pubs) {
            const id = p?.id
            if (!id) continue
            const isVideo = p?.type === 'video' || p?.video_type
            if (isVideo) videoIds.push(id)
            else photoIds.push(id)
          }

          const hydrate = likesRef.current?.hydrateForIds
          if (typeof hydrate === 'function' && (videoIds.length || photoIds.length)) {
            await Promise.all([
              videoIds.length ? hydrate('video', videoIds) : Promise.resolve(),
              photoIds.length ? hydrate('photo', photoIds) : Promise.resolve(),
            ])
          }
        } catch {
          // best-effort
        }

        if (seq !== requestSeq.current) return
        setPublications(res.publications || [])

        const permissionErrors = [res?.errors?.profiles, res?.errors?.services, res?.errors?.videos, res?.errors?.photos]
          .filter(Boolean)
          .filter((e) => String(e?.code || '') === '42501' || Number(e?.status || 0) === 403 || String(e?.message || '').toLowerCase().includes('permission denied'))

        if (permissionErrors.length > 0) {
          setBlockedWarning('Alguns resultados podem estar indisponíveis por permissões (RLS) no Supabase. Faça login ou ajuste as políticas de leitura.')
        } else {
          setBlockedWarning('')
        }
      } catch (e) {
        if (seq !== requestSeq.current) return
        log.error('EXPLORE', 'search error', e)
        setProfiles([])
        setServices([])
        setPublications([])
        setBlockedWarning('')
      } finally {
        if (seq !== requestSeq.current) return
        setLoading(false)
      }
    })()
  }, [debouncedSearchTerm, activeTab])

  // Hydrate likes in batch for publications returned by search
  useEffect(() => {
    const pubs = publications || []
    if (pubs.length === 0) return

    const videoIds = []
    const photoIds = []

    for (const p of pubs) {
      const id = p?.id
      if (!id) continue
      const isVideo = p?.type === 'video' || p?.video_type
      if (isVideo) videoIds.push(id)
      else photoIds.push(id)
    }

    if (videoIds.length) void likes.hydrateForIds('video', videoIds)
    if (photoIds.length) void likes.hydrateForIds('photo', photoIds)
  }, [likes, publications])

  const handleSearch = (e) => {
    setSearchTerm(e.target.value)
  }

  const openService = (service) => {
    const pro = service?.user || null

    if (!pro) {
      toast({
        title: 'Indisponível',
        description: 'Não foi possível carregar os dados do profissional para este serviço.',
        variant: 'destructive',
      })
      return
    }

    setSelectedService(service)
    setSelectedServiceProfessional(
      pro
        ? {
            ...pro,
            name: pro?.username ? `@${pro.username}` : pro?.name,
          }
        : null
    )
    setServiceModalOpen(true)
  }

  const openPublication = (item) => {
    // Se o usuário abriu o conteúdo, não deixe preview tocando ao fundo.
    stopActivePreview()
    touchHoverActiveRef.current = false

    setSelectedContent(item)
    const author = item?.user || null
    setSelectedContentAuthor(
      author
        ? {
            ...author,
            name: author?.username ? `@${author.username}` : author?.name,
          }
        : null
    )

    setContentModalOpen(true)

    // Prefetch current + neighbors (helps avoid "—" when navigating)
    try {
      const list = publications || []
      const currentId = String(item?.id ?? '')
      const currentType = String(item?.type ?? '')
      const idx = list.findIndex((x) => {
        if (!x) return false
        if (String(x?.id ?? '') !== currentId) return false
        if (!currentType) return true
        return String(x?.type ?? '') === currentType
      })

      const candidates = [list[idx], list[idx - 1], list[idx + 1]].filter(Boolean)
      const videoIds = []
      const photoIds = []
      for (const c of candidates) {
        const id = c?.id
        if (!id) continue
        const isVideo = c?.type === 'video' || c?.video_type
        if (isVideo) videoIds.push(id)
        else photoIds.push(id)
      }

      if (videoIds.length) void likes.hydrateForIds('video', videoIds)
      if (photoIds.length) void likes.hydrateForIds('photo', photoIds)
    } catch {
      // ignore
    }
  }

  const navigatePublicationByDelta = (delta) => {
    if (!selectedContent) return
    const list = publications || []
    if (list.length === 0) return
    const currentId = String(selectedContent?.id ?? '')
    const currentType = String(selectedContent?.type ?? '')

    const idx = list.findIndex((item) => {
      if (!item) return false
      const idOk = String(item?.id ?? '') === currentId
      if (!idOk) return false
      if (!currentType) return true
      return String(item?.type ?? '') === currentType
    })

    if (idx < 0) return
    let next = list[idx + delta]
    if (!next) {
      if (delta > 0) next = list[0]
      else if (delta < 0) next = list[list.length - 1]
    }
    if (!next) return
    openPublication(next)
  }

  const openReel = (item) => {
    const seed = reels || []
    const idx = seed.findIndex((r) => String(r?.id) === String(item?.id))

    setReelsFeedSeed(seed)
    setReelsFeedIndex(idx >= 0 ? idx : 0)
    setReelsFeedTerm(String(debouncedSearchTerm || '').trim())
    setReelsFeedOpen(true)
  }

  const showEmpty =
    !loading &&
    String(debouncedSearchTerm || '').trim().length > 0 &&
    profiles.length === 0 &&
    services.length === 0 &&
    publications.length === 0

  const allOrder = useMemo(() => {
    // Regra de prioridade na aba Tudo
    if (intent.type === 'people') return ['people', 'posts', 'services']
    return ['posts', 'people', 'services']
  }, [intent.type])

  const reels = useMemo(() => {
    return (publications || []).filter((p) => p?.type === 'video' || p?.video_type)
  }, [publications])

  return (
    <div
      className="w-full overflow-x-hidden"
      onTouchStartCapture={handleTouchHoverStartCapture}
      onTouchMoveCapture={handleTouchHoverMoveCapture}
      onTouchEndCapture={handleTouchHoverEndCapture}
      onTouchCancelCapture={handleTouchHoverEndCapture}
    >
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4 text-foreground">Explorar</h1>

        {blockedWarning && (
          <div className="mb-4 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-foreground flex items-start gap-2">
            <AlertTriangle size={18} className="text-orange-500 mt-0.5 shrink-0" />
            <span className="leading-relaxed">{blockedWarning}</span>
          </div>
        )}

        <div className="relative mb-4">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
            size={18}
          />
          <Input
            placeholder="Buscar pessoas, serviços e publicações..."
            className={cn('pl-10 pr-14 bg-card border-border/70 focus:border-primary')}
            value={searchTerm}
            onChange={handleSearch}
          />

          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Abrir filtros"
              className="h-9 w-9 rounded-full"
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal size={18} />
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="w-full overflow-x-hidden">
            <TabsList className="rounded-lg bg-card/60 backdrop-blur w-full justify-between">
              <TabsTrigger value="all" className="min-w-0 px-2 text-xs sm:px-4 sm:text-sm truncate">
                Tudo
              </TabsTrigger>
              <TabsTrigger value="people" className="min-w-0 px-2 text-xs sm:px-4 sm:text-sm truncate">
                Pessoas
              </TabsTrigger>
              <TabsTrigger value="services" className="min-w-0 px-2 text-xs sm:px-4 sm:text-sm truncate">
                Serviços
              </TabsTrigger>
              <TabsTrigger value="posts" className="min-w-0 px-2 text-xs sm:px-4 sm:text-sm truncate">
                Publicações
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="all" className="mt-4">
            {loading ? (
              <LoadingSkeleton />
            ) : showEmpty ? (
              <EmptyState />
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="space-y-4">
                {reels.length > 0 && (
                  <div className="w-full overflow-x-auto overscroll-x-contain touch-pan-x">
                    <div className="flex gap-3 w-max snap-x snap-mandatory pb-1 pr-3">
                      {reels.slice(0, 16).map((item) => (
                        <div key={`${item.type}:${item.id}`} className="snap-start">
                          <ReelPreviewCard item={item} onOpen={openReel} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(() => {
                  const nodes = []
                  const hasPeople = profiles.length > 0
                  const hasPosts = publications.length > 0
                  const shouldInsertLoadMore = hasPeople && hasPosts

                  let renderedPeople = false
                  let renderedPosts = false
                  let insertedLoadMore = false

                  const loadMoreNode = (
                    <div key="load-more-publications" className="w-full flex justify-center">
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-7 px-0 text-xs font-normal text-muted-foreground no-underline hover:underline"
                        onClick={handleLoadMorePublications}
                        disabled={loadingMorePublications}
                      >
                        {loadingMorePublications ? 'Carregando…' : 'Ver mais'}
                      </Button>
                    </div>
                  )

                  for (const section of allOrder) {
                    if (section === 'posts' && hasPosts) {
                      nodes.push(
                        <div key="posts" className="space-y-3">
                          <h2 className="text-sm font-semibold text-muted-foreground">Publicações</h2>
                          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                            {publications.slice(0, allPublicationsVisible).map((item) => (
                              <PublicationResultCard key={`${item.type}:${item.id}`} item={item} onOpen={openPublication} disableTouchPreview />
                            ))}
                          </div>
                        </div>
                      )
                      renderedPosts = true
                    }

                    if (section === 'people' && hasPeople) {
                      nodes.push(<PeopleCarousel key="people" people={profiles.slice(0, 16)} />)
                      renderedPeople = true
                    }

                    if (section === 'services' && services.length > 0) {
                      nodes.push(
                        <div key="services">
                          <ServicesShowcase
                            services={services}
                            onOpenService={openService}
                            onViewAll={() => setActiveTab('services')}
                            maxNearby={4}
                            showViewAll
                          />
                        </div>
                      )
                    }

                    if (shouldInsertLoadMore && !insertedLoadMore) {
                      const insertedAfterFirstOfPair =
                        (section === 'people' && renderedPeople && !renderedPosts) ||
                        (section === 'posts' && renderedPosts && !renderedPeople)

                      if (insertedAfterFirstOfPair) {
                        nodes.push(loadMoreNode)
                        insertedLoadMore = true
                      }
                    }
                  }

                  return nodes
                })()}
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="people" className="mt-4">
            {loading ? (
              <LoadingSkeleton />
            ) : profiles.length === 0 ? (
              <EmptyState />
            ) : (
              <PeopleCarousel people={profiles} />
            )}
          </TabsContent>

          <TabsContent value="services" className="mt-4">
            {loading ? (
              <LoadingSkeleton />
            ) : services.length === 0 ? (
              <EmptyState />
            ) : (
              <ServicesShowcase
                services={services}
                onOpenService={openService}
                onViewAll={() => {}}
                maxNearby={services.length}
                showViewAll={false}
              />
            )}
          </TabsContent>

          <TabsContent value="posts" className="mt-4">
            {loading ? (
              <LoadingSkeleton />
            ) : publications.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                {publications.map((item) => (
                  <PublicationResultCard key={`${item.type}:${item.id}`} item={item} onOpen={openPublication} disableTouchPreview />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <ServiceDetailsModal
        isOpen={serviceModalOpen}
        onClose={() => {
          setServiceModalOpen(false)
          setSelectedService(null)
          setSelectedServiceProfessional(null)
        }}
        service={selectedService}
        professional={selectedServiceProfessional}
      />

      <ContentViewModal
        isOpen={contentModalOpen}
        onClose={() => {
          setContentModalOpen(false)
          setSelectedContent(null)
          setSelectedContentAuthor(null)
        }}
        content={selectedContent}
        user={selectedContentAuthor}
        onDelete={() => {}}
        onEdit={() => {}}
        onRequestNext={() => navigatePublicationByDelta(1)}
        onRequestPrev={() => navigatePublicationByDelta(-1)}
      />

      <ReelsFeedModal
        open={reelsFeedOpen}
        onOpenChange={(next) => {
          setReelsFeedOpen(!!next)
          if (!next) {
            setReelsFeedSeed([])
            setReelsFeedIndex(0)
            setReelsFeedTerm('')
          }
        }}
        initialItems={reelsFeedSeed}
        initialIndex={reelsFeedIndex}
        searchTerm={reelsFeedTerm}
        pageSize={10}
      />

      <ExploreFiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        onPickItem={() => {
          toast({
            title: 'Em desenvolvimento',
            description: 'Esses filtros serão ativados na próxima atualização.',
          })
        }}
        onApply={() => setFiltersOpen(false)}
      />
    </div>
  )
}

export default Explore
