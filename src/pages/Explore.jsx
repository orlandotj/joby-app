import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Search, SlidersHorizontal } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import LoadingSkeleton from '@/components/explore/LoadingSkeleton'
import EmptyState from '@/components/explore/EmptyState'
import { useDebounce } from '@/hooks/useDebounce'
import PersonResultCard from '@/components/explore/PersonResultCard'
import ServiceResultCard from '@/components/explore/ServiceResultCard'
import PublicationResultCard from '@/components/explore/PublicationResultCard'
import { ExploreFiltersSheet } from '@/components/explore/ExploreFiltersSheet'
import ReelPreviewCard from '@/components/explore/ReelPreviewCard'
import { ReelsFeedModal } from '@/components/explore/ReelsFeedModal'
import ServiceDetailsModal from '@/components/ServiceDetailsModal'
import ContentViewModal from '@/components/ContentViewModal'
import { exploreSearch, inferSearchIntent } from '@/services/exploreSearchService'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

const Explore = () => {
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useDebounce(searchTerm, 400)
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

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

        // eslint-disable-next-line no-console
        console.warn('[EXPLORE] overflow-x detected:', {
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
        console.error('[EXPLORE] search error', e)
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
    const isVideo = item?.type === 'video' || item?.video_type
    if (isVideo) {
      const rid = String(item?.id || '')
      const idx = Math.max(
        0,
        reels.findIndex((r) => String(r?.id || '') === rid)
      )

      setReelsFeedSeed(reels)
      setReelsFeedIndex(idx)
      setReelsFeedTerm(String(debouncedSearchTerm || '').trim())
      setReelsFeedOpen(true)
      return
    }

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
    <div className="w-full overflow-x-hidden">
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
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-muted-foreground">Reels</h2>
                      <span className="text-xs text-muted-foreground">Arraste para o lado</span>
                    </div>
                    <div className="w-full overflow-x-auto overscroll-x-contain touch-pan-x">
                      <div className="flex gap-3 w-max snap-x snap-mandatory pb-1 pr-3">
                        {reels.slice(0, 16).map((item) => (
                          <div key={`${item.type}:${item.id}`} className="snap-start">
                            <ReelPreviewCard item={item} onOpen={openPublication} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {allOrder.map((section) => {
                  if (section === 'posts' && publications.length > 0) {
                    return (
                      <div key="posts" className="space-y-3">
                        <h2 className="text-sm font-semibold text-muted-foreground">Publicações</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                          {publications.slice(0, 12).map((item) => (
                            <PublicationResultCard key={`${item.type}:${item.id}`} item={item} onOpen={openPublication} />
                          ))}
                        </div>
                      </div>
                    )
                  }
                  if (section === 'people' && profiles.length > 0) {
                    return (
                      <div key="people" className="space-y-3">
                        <h2 className="text-sm font-semibold text-muted-foreground">Pessoas</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {profiles.slice(0, 10).map((p) => (
                            <PersonResultCard key={p.id} profile={p} />
                          ))}
                        </div>
                      </div>
                    )
                  }
                  if (section === 'services' && services.length > 0) {
                    return (
                      <div key="services" className="space-y-3">
                        <h2 className="text-sm font-semibold text-muted-foreground">Serviços</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {services.slice(0, 10).map((s) => (
                            <ServiceResultCard key={s.id} service={s} onHire={openService} />
                          ))}
                        </div>
                      </div>
                    )
                  }
                  return null
                })}
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="people" className="mt-4">
            {loading ? (
              <LoadingSkeleton />
            ) : profiles.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {profiles.map((p) => (
                  <PersonResultCard key={p.id} profile={p} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="services" className="mt-4">
            {loading ? (
              <LoadingSkeleton />
            ) : services.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {services.map((s) => (
                  <ServiceResultCard key={s.id} service={s} onHire={openService} />
                ))}
              </div>
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
                  <PublicationResultCard key={`${item.type}:${item.id}`} item={item} onOpen={openPublication} />
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
