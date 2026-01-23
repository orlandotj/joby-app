import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import VideoCard from '@/components/VideoCard'
import { Tabs } from '@/components/ui/tabs'
import { Loader2, WifiOff, UserPlus, Compass, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { useSwipeTabs } from '@/hooks/useSwipeTabs'
import { SwipeTabsList } from '@/components/SwipeTabs'
import { TabTransition } from '@/components/TabTransition'

const Feed = () => {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('for-you')
  const [showHeader, setShowHeader] = useState(true)
  const { user } = useAuth() // Get current user
  const feedContainerRef = useRef(null)
  const lastScrollY = useRef(0)
  const ticking = useRef(false)
  const observerTarget = useRef(null)

  const TAB_ORDER = ['for-you', 'following', 'nearby']
  const swipeTabs = useSwipeTabs({
    tabs: TAB_ORDER,
    value: activeTab,
    onValueChange: setActiveTab,
  })

  // Detectar scroll para esconder/mostrar header
  useEffect(() => {
    const handleScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY
          const mobileHeader = document.querySelector('.mobile-header-joby')

          // Mostrar header apenas quando estiver no topo (menos de 10px do topo)
          if (currentScrollY < 10) {
            if (!showHeader) {
              setShowHeader(true)
              if (mobileHeader) {
                mobileHeader.style.transform = 'translateY(0)'
                mobileHeader.style.opacity = '1'
              }
            }
          } else {
            // Esconder header quando rolar para baixo (mais de 60px do topo)
            if (currentScrollY > 60 && showHeader) {
              setShowHeader(false)
              if (mobileHeader) {
                mobileHeader.style.transform = 'translateY(-100%)'
                mobileHeader.style.opacity = '0'
              }
            }
          }

          lastScrollY.current = currentScrollY
          ticking.current = false
        })
        ticking.current = true
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    // Cleanup: Resetar header ao sair da página
    return () => {
      window.removeEventListener('scroll', handleScroll)
      const mobileHeader = document.querySelector('.mobile-header-joby')
      if (mobileHeader) {
        mobileHeader.style.transform = 'translateY(0)'
        mobileHeader.style.opacity = '1'
      }
    }
  }, [showHeader])

  const fetchVideos = useCallback(
    async (tab, pageNum = 0, append = false) => {
      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
        setVideos([])
        setPage(0)
        setHasMore(true)
      }
      setError(null)
      try {
        const pageSize = 10
        const from = pageNum * pageSize
        const to = from + pageSize - 1

        const selectVariants = [
          // Schema mais comum (sem username obrigatório)
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
          // Fallback sem comments_count
          `
            id,
            url,
            title,
            description,
            thumbnail,
            video_type,
            views,
            likes,
            created_at,
            provider,
            user:user_id(id, name, profession, avatar)
          `,
          // Fallback para schemas que usam username (se existir)
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
            user:user_id(id, username, profession, avatar)
          `,
        ]

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
          if (followingIds.length > 0) {
            // ok
          } else {
            setVideos([])
            setLoading(false)
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
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .range(from, to)

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

        if (data && data.length < 10) {
          setHasMore(false)
        }

        if (append) setVideos((prev) => [...prev, ...(data || [])])
        else setVideos(data || [])
      } catch (err) {
        setError('Falha ao carregar vídeos. Tente novamente.')
        console.error(err)
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [user]
  )

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      const nextPage = page + 1
      setPage(nextPage)
      fetchVideos(activeTab, nextPage, true)
    }
  }, [loadingMore, hasMore, page, activeTab, fetchVideos])

  useEffect(() => {
    fetchVideos(activeTab)
  }, [activeTab, fetchVideos])

  // Infinite scroll com IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore()
        }
      },
      { threshold: 0.1 }
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
  }, [hasMore, loadingMore, loadMore])

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
        transition={{ duration: 0.15 }}
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
        className={`fixed left-0 right-0 md:left-64 z-[60] bg-background border-b border-border shadow-sm transition-all duration-300 ${
          showHeader ? 'top-11 md:top-0' : 'top-0'
        }`}
        style={{ willChange: 'top', transform: 'translateZ(0)' }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <SwipeTabsList
            tabs={[
              { value: 'for-you', label: 'Para Você' },
              { value: 'following', label: 'Seguindo' },
              { value: 'nearby', label: 'Próximos' },
            ]}
            listClassName="w-full h-12 rounded-none"
            triggerClassName="text-sm md:text-base flex-1"
          />
        </Tabs>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`flex flex-col items-center justify-center min-h-[calc(100vh-11rem)] ${
              showHeader ? 'pt-[56px] md:pt-[68px]' : 'pt-[68px]'
            }`}
          >
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">
              Carregando vídeos...
            </p>
          </motion.div>
        ) : error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`flex flex-col items-center justify-center min-h-[calc(100vh-11rem)] text-center px-4 ${
              showHeader ? 'pt-[56px] md:pt-[68px]' : 'pt-[68px]'
            }`}
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
            className={`px-3 pb-6 ${
              showHeader ? 'pt-[56px] md:pt-[68px]' : 'pt-[68px]'
            }`}
          >
            <>
              {videos.map((video, index) => (
                <VideoCard
                  key={video.id || index}
                  video={video}
                  user={video.user}
                />
              ))}

              {/* Observer target para infinite scroll */}
              {hasMore && (
                <div ref={observerTarget} className="py-6 flex justify-center">
                  {loadingMore && (
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  )}
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
