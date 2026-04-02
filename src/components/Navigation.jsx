import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Home,
  Search,
  MessageSquare,
  LogOut,
  Menu,
  X,
  Briefcase,
  Timer,
  Settings,
  User,
  Wallet as WalletIcon,
  FileText,
  Bell,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount'
import { useUnreadMessagesCount } from '@/hooks/useUnreadMessagesCount'
import { usePendingWorkRequestsCount } from '@/hooks/usePendingWorkRequestsCount'
import { useMobileHeader } from '@/contexts/MobileHeaderContext'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { preloadMainTabs, preloadRoute } from '@/routes/routePreload'

const Navigation = () => {
  const location = useLocation()
  const { user, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [bottomNavVisible, setBottomNavVisible] = useState(true)
  const { showMobileHeader } = useMobileHeader()
  const mobileHeaderRef = useRef(null)
  const [uiReady, setUiReady] = useState(false)
  const lastScrollYRef = useRef(0)
  const scrollRafRef = useRef(0)

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

  // Regra: não mexer no Início (/).
  // Em outras páginas, o header do topo é renderizado no fluxo pelo MainLayout
  // (para sumir naturalmente ao rolar) e aqui não deve ficar fixo.
  const isHomeRoute = location.pathname === '/'
  const isMessagesRoute = location.pathname === '/messages'
  const shouldRenderFixedMobileHeader = isHomeRoute || isMessagesRoute

  // Expose the fixed mobile header height as a CSS var so other fixed UI
  // (e.g. Feed tabs) can anchor below it without hard-coded values.
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    const root = document.documentElement

    if (!shouldRenderFixedMobileHeader) {
      root.style.setProperty('--joby-mobile-header-height', '0px')
      return
    }

    // Default early to match Feed/tabs fallback, then measure accurately.
    root.style.setProperty('--joby-mobile-header-height', '48px')

    const el = mobileHeaderRef.current
    if (!el) return

    const readHeight = () => {
      const rect = el.getBoundingClientRect()
      const height = rect?.height || el.offsetHeight || 0
      root.style.setProperty('--joby-mobile-header-height', `${Math.round(height)}px`)
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
  }, [shouldRenderFixedMobileHeader])

  const avatarSrc = useResolvedStorageUrl(user?.avatar)
  const unreadNotifications = useUnreadNotificationsCount(user?.id)
  const unreadMessages = useUnreadMessagesCount(user?.id)
  const pendingWorkRequests = usePendingWorkRequestsCount(user?.id)

  const alertCount =
    (unreadNotifications || 0) +
    (unreadMessages || 0) +
    (pendingWorkRequests || 0)

  const getBadgeLabel = (value) => (value > 10 ? '10+' : String(value))
  const renderBadge = (value) => {
    if (!value || value <= 0) return null
    return (
      <span className="absolute top-0 right-0 translate-x-[65%] -translate-y-[65%] min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-md ring-2 ring-background pointer-events-none">
        {getBadgeLabel(value)}
      </span>
    )
  }

  // Detectar quando o teclado abre no mobile
  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined' && window.visualViewport) {
        // No mobile, quando o teclado abre, o visualViewport height diminui
        const viewportHeight = window.visualViewport.height
        const windowHeight = window.innerHeight

        // Se a diferença for maior que 150px, consideramos que o teclado está aberto
        const isKeyboardOpen = windowHeight - viewportHeight > 150
        setKeyboardVisible(isKeyboardOpen)
      }
    }

    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize)
      handleResize() // Check inicial

      return () => {
        window.visualViewport.removeEventListener('resize', handleResize)
      }
    }
  }, [])

  // Android/WebView: when a full-screen overlay is open (e.g. comments sheet/modal)
  // we must hide the fixed bottom nav to avoid it flashing above the dim backdrop.
  // Relying only on z-index/CSS is not enough on some devices.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const hasOverlay = () =>
      document.documentElement.classList.contains('joby-overlay-hide-nav') ||
      document.body.classList.contains('joby-overlay-hide-nav')

    const update = () => {
      const next = hasOverlay()
      setOverlayOpen(next)
      if (next) setMobileMenuOpen(false)
    }

    update()

    const observer = new MutationObserver(update)

    try {
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    } catch {
      // ignore
    }
    try {
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    } catch {
      // ignore
    }

    return () => observer.disconnect()
  }, [])

  const shouldHideBottomNavForChat = isMessagesRoute && showMobileHeader === false

  // Esconder navegação inferior quando:
  // - teclado está aberto na página de mensagens
  // - existe overlay full-screen aberto (ex.: comentários)
  const hideBottomNav =
    (keyboardVisible && isMessagesRoute) || overlayOpen || shouldHideBottomNavForChat

  // Hide/show bottom nav on scroll (mobile):
  // - scroll down -> hide
  // - scroll up -> show
  // - near top -> keep visible
  // Keep chat/messages behavior unchanged (disable scroll-hide there).
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Preserve chat/messages behavior: don't auto-hide on scroll there.
    if (isMessagesRoute) {
      setBottomNavVisible(true)
      return
    }

    const TOP_Y_PX = 24
    const DELTA_PX = 10

    const readScrollY = (ev) => {
      const t = ev?.target
      if (t && t instanceof HTMLElement) {
        const st = Number(t.scrollTop)
        if (Number.isFinite(st)) return Math.max(0, st)
      }

      const doc = Number(document.scrollingElement?.scrollTop)
      if (Number.isFinite(doc)) return Math.max(0, doc)

      const win = Number(window.scrollY)
      if (Number.isFinite(win)) return Math.max(0, win)

      return 0
    }

    lastScrollYRef.current = readScrollY()
    setBottomNavVisible(true)

    const onScroll = (ev) => {
      if (scrollRafRef.current) return

      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = 0

        const y = readScrollY(ev)
        const prevY = lastScrollYRef.current
        const delta = y - prevY
        lastScrollYRef.current = y

        if (y <= TOP_Y_PX) {
          setBottomNavVisible(true)
          return
        }

        if (Math.abs(delta) < DELTA_PX) return

        const nextVisible = delta < 0
        setBottomNavVisible((prev) => (prev === nextVisible ? prev : nextVisible))
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true })
      if (scrollRafRef.current) window.cancelAnimationFrame(scrollRafRef.current)
      scrollRafRef.current = 0
    }
  }, [isMessagesRoute, location.pathname])

  const navItems = [
    { path: '/', icon: <Home size={20} />, label: 'Início' },
    { path: '/explore', icon: <Search size={20} />, label: 'Explorar' },
    {
      path: '/messages',
      icon: <MessageSquare size={20} />,
      label: 'Mensagens',
    },
    {
      path: '/work-requests',
      icon: <FileText size={20} />,
      label: 'Solicitações',
    },
    {
      path: '/work-timer/sample-job-123',
      icon: <Timer size={20} />,
      label: 'Cronômetro',
    },
    { path: '/wallet', icon: <WalletIcon size={20} />, label: 'Carteira' },
  ]

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen)
  }

  const preloadPath = useCallback((path) => {
    const p = String(path || '')
    const promise = preloadRoute(p)
    if (promise && typeof promise.catch === 'function') promise.catch(() => {})
  }, [])

  // Warm up the main tabs in the background so the first navigation feels instant.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const schedule =
      window.requestIdleCallback ||
      ((cb) => setTimeout(() => cb({ timeRemaining: () => 0 }), 900))

    const cancel = window.cancelIdleCallback || clearTimeout

    const id = schedule(() => {
      preloadMainTabs().catch(() => {})
    })

    return () => cancel(id)
  }, [])

  const isNavItemActive = (itemPath) => {
    if (itemPath.includes(':jobId')) {
      const baseItemPath = itemPath.substring(0, itemPath.indexOf('/:'))
      const currentBasePath = location.pathname.substring(
        0,
        location.pathname.lastIndexOf('/')
      )
      return currentBasePath === baseItemPath
    }
    return location.pathname === itemPath
  }

  return (
    <>
      {/* Desktop Navigation */}
      <div className="hidden md:flex flex-col h-screen w-64 border-r border-border bg-card p-4 fixed left-0 top-0">
        <Link to="/" className="flex items-center gap-2 mb-8 px-2">
          <div className="w-10 h-10 rounded-full joby-gradient flex items-center justify-center">
            <Briefcase size={20} className="text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">JOBY</h1>
        </Link>

        <nav className="flex-1">
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={
                    item.path.includes(':jobId')
                      ? item.path.replace(':jobId', 'sample-job-123')
                      : item.path
                  }
                  onMouseEnter={() => preloadPath(item.path)}
                  onPointerDown={() => preloadPath(item.path)}
                  className={() =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors relative text-sm ${
                      isNavItemActive(item.path)
                        ? 'text-primary font-semibold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`
                  }
                >
                  {isNavItemActive(item.path) && (
                    <motion.div
                      layoutId="activeNavDesktop"
                      className="absolute inset-0 bg-primary/10 rounded-lg"
                      initial={false}
                      transition={{
                        type: 'spring',
                        stiffness: 300,
                        damping: 30,
                      }}
                    />
                  )}
                  <span className="relative z-10">
                    <span className="relative inline-flex">
                      {item.icon}
                      {item.path === '/messages'
                        ? renderBadge(unreadMessages)
                        : item.path === '/work-requests'
                        ? renderBadge(pendingWorkRequests)
                        : null}
                    </span>
                  </span>
                  <span className="relative z-10">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-auto pt-4 border-t border-border flex items-center justify-between">
          <Link
            to={`/profile/${user?.id || '1'}`}
            className="flex items-center gap-2 p-2 h-auto"
          >
            <div className="h-9 w-9 rounded-full overflow-hidden bg-primary flex items-center justify-center flex-shrink-0">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={user?.name}
                  className="h-full w-full object-cover"
                  loading="eager"
                />
              ) : (
                <span className="text-sm font-bold text-primary-foreground">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              )}
            </div>
            <div className="text-left">
              <p className="text-sm font-medium leading-none">
                {user?.name || 'Usuário'}
              </p>
              <p className="text-xs text-muted-foreground leading-none mt-0.5">
                {user?.profession || 'Profissional'}
              </p>
            </div>
          </Link>
          <div className="flex items-center">
            <Link
              to="/notifications"
              className="relative p-2 cursor-pointer text-muted-foreground hover:text-foreground flex items-center justify-center"
              aria-label="Notificações"
            >
              <Bell size={20} />
              {renderBadge(alertCount)}
            </Link>
            <Link
              to="/settings"
              className="p-2 cursor-pointer text-muted-foreground hover:text-foreground flex items-center justify-center"
              aria-label="Configurações"
            >
              <Settings size={20} />
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Bottom Bar */}
      {!hideBottomNav && (
        <div
          className={`joby-bottom-nav safeBottomNav md:hidden fixed bottom-0 left-0 right-0 z-50 transform-gpu ${
            uiReady ? 'transition-[transform,opacity] duration-300 ease-in-out' : ''
          } ${
            bottomNavVisible
              ? 'translate-y-0 opacity-100 pointer-events-auto'
              : 'translate-y-[120%] opacity-0 pointer-events-none'
          }`}
          style={{ willChange: 'transform, opacity' }}
        >
          <div className="mx-3 mb-2 rounded-2xl border border-border/70 bg-background/95 backdrop-blur-sm shadow-lg">
            <nav className="flex items-center justify-between h-14 px-2">
              {navItems.slice(0, 4).map(
                (
                  item // Show first 4 items in bottom bar
                ) => {
                  const isActive = isNavItemActive(item.path)
                  const badge =
                    item.path === '/messages'
                      ? renderBadge(unreadMessages)
                      : item.path === '/work-requests'
                      ? renderBadge(pendingWorkRequests)
                      : null

                  return (
                    <NavLink
                      key={item.path}
                      to={
                        item.path.includes(':jobId')
                          ? item.path.replace(':jobId', 'sample-job-123')
                          : item.path
                      }
                      onPointerDown={() => preloadPath(item.path)}
                      className={() =>
                        `flex items-center justify-center p-1 flex-1 h-full ${
                          isActive ? 'text-primary-foreground' : 'text-muted-foreground'
                        }`
                      }
                    >
                      {isActive ? (
                        <span className="joby-gradient inline-flex w-full max-w-full min-w-0 items-center justify-center gap-2 rounded-full px-3 py-2 shadow-sm">
                          <span className="relative inline-flex">
                            {item.icon}
                            {badge}
                          </span>
                          <span className="min-w-0 text-[0.7rem] font-semibold leading-none whitespace-nowrap truncate">
                            {item.label}
                          </span>
                        </span>
                      ) : (
                        <span className="flex flex-col items-center justify-center gap-1">
                          <span className="relative inline-flex">
                            {item.icon}
                            {badge}
                          </span>
                          <span className="text-[0.6rem] leading-none">{item.label}</span>
                        </span>
                      )}
                    </NavLink>
                  )
                }
              )}
              <button
                onClick={toggleMobileMenu}
                className={`flex items-center justify-center p-1 flex-1 h-full ${
                  mobileMenuOpen ? 'text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {mobileMenuOpen ? (
                  <span className="joby-gradient inline-flex w-full max-w-full min-w-0 items-center justify-center gap-2 rounded-full px-3 py-2 shadow-sm">
                    <Menu size={20} />
                    <span className="min-w-0 text-[0.7rem] font-semibold leading-none whitespace-nowrap truncate">Menu</span>
                  </span>
                ) : (
                  <span className="flex flex-col items-center justify-center gap-1">
                    <Menu size={20} />
                    <span className="text-[0.6rem] leading-none">Menu</span>
                  </span>
                )}
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Mobile Header (fixed apenas no Início e em Mensagens) */}
      {shouldRenderFixedMobileHeader && (
        <div
          ref={mobileHeaderRef}
          className={`mobile-header-joby safeHeader md:hidden fixed top-0 left-0 right-0 bg-background border-b border-border z-[70] flex items-center justify-between px-4 pb-2 transform-gpu ${
            uiReady ? 'transition-[transform,opacity] duration-150 ease-out' : ''
          } ${
            showMobileHeader
              ? 'translate-y-0 opacity-100 pointer-events-auto'
              : '-translate-y-full opacity-0 pointer-events-none'
          }`}
          style={{ willChange: 'transform, opacity' }}
        >
          <Link to="/" className="flex items-center gap-1.5">
            <div className="w-8 h-8 rounded-full joby-gradient flex items-center justify-center">
              <Briefcase size={16} className="text-primary-foreground" />
            </div>
            <h1 className="text-base font-bold text-foreground">JOBY</h1>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to="/notifications"
              className="relative h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Notificações"
            >
              <span className="relative inline-flex translate-y-[1px]">
                <Bell size={18} />
                {renderBadge(alertCount)}
              </span>
            </Link>

            <Link
              to={`/profile/${user?.id || '1'}`}
              className="h-9 w-9 cursor-pointer rounded-full overflow-hidden bg-primary flex items-center justify-center"
              aria-label="Meu perfil"
            >
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={user?.name}
                  className="h-full w-full object-cover"
                  loading="eager"
                />
              ) : (
                <span className="text-xs font-bold text-primary-foreground">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              )}
            </Link>
          </div>
        </div>
      )}

      {/* Mobile Menu Overlay (Drawer style) */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={toggleMobileMenu}
            className="fixed inset-0 bg-black/80 backdrop-blur-[2px] z-[9990] md:hidden"
            style={{ willChange: 'opacity', backfaceVisibility: 'hidden' }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{
              duration: 0.25,
              ease: [0.4, 0, 0.2, 1],
            }}
            className="fixed bottom-0 left-0 right-0 bg-card z-[9991] md:hidden rounded-t-2xl shadow-2xl p-4 pb-6 border-t border-border"
            style={{
              maxHeight: '70vh',
              display: 'flex',
              flexDirection: 'column',
              willChange: 'transform, opacity',
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Menu</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMobileMenu}
                className="text-muted-foreground"
              >
                <X size={24} />
              </Button>
            </div>

            <nav className="flex-1 overflow-y-auto scrollbar-hide">
              <ul className="space-y-1.5">
                {/* Perfil */}
                <li>
                  <NavLink
                    to={`/profile/${user?.id || '1'}`}
                    className={() =>
                      `flex items-center gap-3.5 px-3 py-3 rounded-lg transition-colors text-sm ${
                        isNavItemActive(`/profile/${user?.id || '1'}`)
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`
                    }
                    onClick={toggleMobileMenu}
                  >
                    <User size={20} />
                    <span>Meu Perfil</span>
                  </NavLink>
                </li>

                {/* Notificações */}
                <li>
                  <NavLink
                    to="/notifications"
                    className={({ isActive }) =>
                      `flex items-center justify-between gap-3.5 px-3 py-3 rounded-lg transition-colors text-sm ${
                        isActive
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`
                    }
                    onClick={toggleMobileMenu}
                  >
                    <div className="flex items-center gap-3.5">
                      <span className="relative inline-flex">
                        <Bell size={20} />
                        {renderBadge(alertCount)}
                      </span>
                      <span>Notificações</span>
                    </div>
                    {alertCount > 0 ? (
                      <span className="text-[10px] font-semibold text-red-500">
                        {getBadgeLabel(alertCount)}
                      </span>
                    ) : null}
                  </NavLink>
                </li>

                {/* Carteira */}
                <li>
                  <NavLink
                    to="/wallet"
                    className={({ isActive }) =>
                      `flex items-center gap-3.5 px-3 py-3 rounded-lg transition-colors text-sm ${
                        isActive
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`
                    }
                    onClick={toggleMobileMenu}
                  >
                    <WalletIcon size={20} />
                    <span>Carteira</span>
                  </NavLink>
                </li>

                {/* Cronômetro */}
                <li>
                  <NavLink
                    to="/work-timer/current"
                    className={() =>
                      `flex items-center gap-3.5 px-3 py-3 rounded-lg transition-colors text-sm ${
                        isNavItemActive('/work-timer/:jobId')
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`
                    }
                    onClick={toggleMobileMenu}
                  >
                    <Timer size={20} />
                    <span>Cronômetro</span>
                  </NavLink>
                </li>

                {/* Configurações */}
                <li>
                  <NavLink
                    to="/settings"
                    className={({ isActive }) =>
                      `flex items-center gap-3.5 px-3 py-3 rounded-lg transition-colors text-sm ${
                        isActive
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`
                    }
                    onClick={toggleMobileMenu}
                  >
                    <Settings size={20} />
                    <span>Configurações</span>
                  </NavLink>
                </li>
              </ul>
            </nav>

            <Button
              variant="destructive"
              className="mt-6 w-full gap-2"
              onClick={() => {
                logout()
                toggleMobileMenu()
              }}
            >
              <LogOut size={18} />
              Sair da conta
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default Navigation
