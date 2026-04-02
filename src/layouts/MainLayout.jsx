import React, { useCallback, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import Navigation from '@/components/Navigation'
import MobileTopHeader from '@/components/MobileTopHeader'
import { useAuth } from '@/contexts/AuthContext'
import { MobileHeaderProvider } from '@/contexts/MobileHeaderContext'
import { KeepAliveOutlet } from '@/components/routing/KeepAliveOutlet'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { log } from '@/lib/logger'

const MainLayout = () => {
  const { isAuthenticated, loading, user, profileStatus } = useAuth()
  const { isOffline } = useNetworkStatus()
  const navigate = useNavigate()
  const location = useLocation()

  const navDebugLog = useCallback((to, reason) => {
    if (import.meta.env.DEV !== true) return
    const dest = String(to || '')
    if (!dest) return
    if (!dest.startsWith('/me/edit') && !dest.startsWith('/login')) return
    try {
      log.debug('NAV', dest, reason, new Error().stack)
    } catch {
      // ignore
    }
  }, [])

  const navigateWithReason = useCallback((to, { reason, ...opts } = {}) => {
    navDebugLog(to, reason)
    navigate(to, opts)
  }, [navDebugLog, navigate])

  // Páginas que precisam de largura total
  const fullWidthPages = ['/messages']
  const isFullWidth = fullWidthPages.includes(location.pathname)

  const isHomeRoute = location.pathname === '/'
  const isMessagesRoute = location.pathname === '/messages'
  const useInFlowMobileHeader = !isHomeRoute && !isMessagesRoute

  const isProfileEditRoute = location.pathname === '/me/edit'

  useEffect(() => {
    const publicPaths = ['/termos', '/terms']
    if (
      !loading &&
      !isOffline &&
      !isAuthenticated &&
      !publicPaths.includes(location.pathname)
    ) {
      navigateWithReason('/login', { reason: 'mainlayout:unauthenticated' })
    }
  }, [isAuthenticated, isOffline, loading, navigateWithReason, location.pathname])

  useEffect(() => {
    if (loading) return
    if (!isAuthenticated || !user) return
    if (isOffline) return

    // Nunca redirecionar para /me/edit se ainda estamos carregando perfil
    // ou se houve erro de rede (falha de fetch não é perfil incompleto).
    if (profileStatus === 'loading' || profileStatus === 'error_network') return

    if (profileStatus === 'needs_completion' && !isProfileEditRoute) {
      navigateWithReason('/me/edit?tab=personal', {
        replace: true,
        reason: 'mainlayout:needs_completion',
      })
    }
  }, [isAuthenticated, isOffline, loading, user, profileStatus, navigateWithReason, isProfileEditRoute])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <motion.div
          animate={{
            rotate: 360,
            scale: [1, 1.2, 1],
          }}
          transition={{
            repeat: Infinity,
            duration: 2,
            ease: 'easeInOut',
          }}
          className="w-12 h-12 rounded-full profile-gradient"
        />
      </div>
    )
  }

  return (
    <MobileHeaderProvider>
      <div className="flex min-h-[100dvh] bg-background">
        <Navigation />

        <main
          className={`flex-1 min-w-0 md:ml-64 ${
            isFullWidth || isProfileEditRoute ? 'h-[100dvh] overflow-hidden' : ''
          }`}
        >
          {useInFlowMobileHeader && <MobileTopHeader />}

          {isOffline ? (
            <div className="px-4 md:px-4">
              <div className="mt-2 mb-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                Sem internet. Alguns dados podem estar desatualizados.
              </div>
            </div>
          ) : null}

          <div
            className={
              isFullWidth || isProfileEditRoute
                ? `joby-content-shell h-full flex flex-col overflow-hidden ${
                    useInFlowMobileHeader ? 'pt-0' : 'pt-12'
                  } pb-0 md:pt-8 md:pb-8 px-0 md:px-4`
                : `joby-content-shell min-h-screen container max-w-3xl mx-auto ${
                    // Home (/) uses a fixed header + fixed feed tabs bar.
                    // The Feed page already adds the correct dynamic paddingTop so
                    // keeping pt-12 here would double-count and create a large gap.
                    isHomeRoute ? 'pt-0' : useInFlowMobileHeader ? 'pt-0' : 'pt-12'
                  } pb-20 md:py-8 px-4`
            }
          >
            <KeepAliveOutlet includeBases={['/', '/explore']} maxEntries={4} />
          </div>
        </main>
      </div>
    </MobileHeaderProvider>
  )
}

export default MainLayout
