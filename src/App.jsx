import React, { useState, useEffect, lazy, Suspense } from 'react'
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { log } from '@/lib/logger'

// Layouts (lazy para reduzir o bundle inicial)
const MainLayout = lazy(() => import('@/layouts/MainLayout'))

// Páginas principais (lazy para reduzir o chunk principal)
const Feed = lazy(() => import('@/pages/Feed'))
const Login = lazy(() => import('@/pages/Login'))

// Páginas com lazy loading
const Profile = lazy(() => import('@/pages/Profile'))
const Explore = lazy(() => import('@/pages/Explore'))
const Messages = lazy(() => import('@/pages/Messages'))
const Register = lazy(() => import('@/pages/Register'))
const NotFound = lazy(() => import('@/pages/NotFound'))
const WorkTimer = lazy(() => import('@/pages/WorkTimer'))
const Wallet = lazy(() => import('@/pages/Wallet'))
const ProfessionalAvailability = lazy(() =>
  import('@/pages/ProfessionalAvailability')
)
const WorkRequests = lazy(() => import('@/pages/WorkRequests'))
const ProfileEdit = lazy(() => import('@/pages/ProfileEdit'))
const Settings = lazy(() => import('@/pages/Settings'))
const DebugSupabase = lazy(() => import('@/pages/DebugSupabase'))
const TermsOfService = lazy(() => import('@/pages/TermsOfService'))
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'))
const ServiceConfirmation = lazy(() => import('@/pages/ServiceConfirmation'))
const Notifications = lazy(() => import('@/pages/Notifications'))

// Context
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { LikesProvider } from '@/contexts/LikesContext'
import { CommentsMetaProvider } from '@/contexts/CommentsMetaContext'

// Loading component para Suspense
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
)

const RedirectToMeEdit = () => {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const dest = `/me/edit${location.search || ''}`
    try {
      if (import.meta.env.DEV) log.debug('NAV', dest, 'app:redirect_profile_edit', new Error().stack)
    } catch {
      // ignore
    }
    navigate(dest, { replace: true })
  }, [location.search, navigate])

  return null
}

function App() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Rápido check de inicialização
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-background">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center"
        >
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
            className="w-16 h-16 rounded-full joby-gradient mb-4"
          />
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-2xl font-bold text-primary"
          >
            JOBY
          </motion.h1>
        </motion.div>
      </div>
    )
  }

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <AuthProvider>
          <LikesProvider>
            <CommentsMetaProvider>
              <AnimatePresence mode="wait">
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/debug-supabase" element={<DebugSupabase />} />
                    <Route path="/" element={<MainLayout />}>
                      <Route index element={<Feed />} />
                      <Route path="explore" element={<Explore />} />
                      <Route path="profile/edit" element={<RedirectToMeEdit />} />
                      <Route path="profile/:id" element={<Profile />} />
                      <Route path="profile/:id/edit" element={<RedirectToMeEdit />} />
                      <Route path="me/edit" element={<ProfileEdit />} />
                      <Route path="settings" element={<Settings />} />
                      <Route path="terms" element={<TermsOfService />} />
                      <Route path="/termos" element={<TermsOfService />} />
                      <Route path="privacy" element={<PrivacyPolicy />} />
                      <Route path="messages" element={<Messages />} />
                      <Route
                        path="service-confirmation"
                        element={<ServiceConfirmation />}
                      />
                      <Route path="work-timer/:jobId" element={<WorkTimer />} />
                      <Route path="wallet" element={<Wallet />} />
                      <Route
                        path="my-availability"
                        element={<ProfessionalAvailability />}
                      />
                      <Route path="work-requests" element={<WorkRequests />} />
                      <Route
                        path="work-requests/:requestId"
                        element={<WorkRequests />}
                      />
                      <Route path="notifications" element={<Notifications />} />
                    </Route>
                    <Route path="/404" element={<NotFound />} />
                    <Route path="*" element={<Navigate to="/404" replace />} />
                  </Routes>
                </Suspense>
              </AnimatePresence>
              <Toaster />
            </CommentsMetaProvider>
          </LikesProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  )
}

export default App
