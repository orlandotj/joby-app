import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search,
  Send,
  Phone,
  Video,
  MoreVertical,
  MessageSquare,
  CalendarDays,
  DollarSign,
  ShieldCheck,
  AlertTriangle,
  MapPin,
  Briefcase,
  Camera,
  Clock3,
  Hourglass,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
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
import { Card } from '@/components/ui/card'
import ConversationList from '@/components/messages/ConversationList'
import ContactList from '@/components/messages/ContactList'
import ChatHeader from '@/components/messages/ChatHeader'
import MessageBubble from '@/components/messages/MessageBubble'
import MessageInput from '@/components/messages/MessageInput'
import EmptyChat from '@/components/messages/EmptyChat'
import LoadingSpinner from '@/components/messages/LoadingSpinner'
import TypingIndicator from '@/components/messages/TypingIndicator'
import BookingModal from '@/components/booking/BookingModal'
import ErrorState from '@/components/ui/ErrorState'
import EmptyState from '@/components/ui/EmptyState'
import PageSkeleton from '@/components/ui/PageSkeleton'
import PullToRefresh from '@/components/ui/PullToRefresh'
import { markNotificationsReadByType } from '@/services/notificationService'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/components/ui/use-toast'
import { getProfileDisplayName } from '@/lib/profileDisplay'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { log } from '@/lib/logger'
import { useMobileHeader } from '@/contexts/MobileHeaderContext'
import {
  subscribeToMessages,
  sendMessage,
  uploadMessageAttachment,
  sendTypingIndicator,
  stopTypingIndicator,
  subscribeToTyping,
} from '@/services/messageService'

const CircleAvatar = ({
  src,
  alt,
  fallback,
  wrapperClassName = '',
  imgClassName = 'h-full w-full object-cover',
  fallbackClassName = 'text-sm font-bold text-muted-foreground',
}) => {
  const resolved = useResolvedStorageUrl(src)
  const safeSrc = String(resolved || '').trim()
  const letter = String(fallback || 'U').slice(0, 1).toUpperCase()

  return (
    <div
      className={
        wrapperClassName ||
        'h-12 w-12 rounded-full overflow-hidden bg-muted/40 border border-border/50 shrink-0 flex items-center justify-center'
      }
    >
      {safeSrc ? (
        <img src={safeSrc} alt={alt || ''} className={imgClassName} />
      ) : (
        <span className={fallbackClassName}>{letter}</span>
      )}
    </div>
  )
}

const Messages = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { toast } = useToast()
  const { setShowMobileHeader, showMobileHeader } = useMobileHeader()
  const [serviceChatBooking, setServiceChatBooking] = useState(null)
  const [serviceChatLoading, setServiceChatLoading] = useState(false)
  const [mobileTopTab, setMobileTopTab] = useState('conversas')
  const [serviceRequestsTab, setServiceRequestsTab] = useState('all')
  const [serviceRequests, setServiceRequests] = useState([])
  const [serviceRequestsLoading, setServiceRequestsLoading] = useState(false)
  const [openServiceRequestMenuId, setOpenServiceRequestMenuId] = useState(null)
  const [serviceRequestConfirmOpen, setServiceRequestConfirmOpen] = useState(false)
  const [serviceRequestConfirmTarget, setServiceRequestConfirmTarget] = useState(null)
  const [conversations, setConversations] = useState([])
  const [activeConversation, setActiveConversation] = useState(null)
  const [conversationConfirmOpen, setConversationConfirmOpen] = useState(false)
  const [conversationConfirmTarget, setConversationConfirmTarget] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [isDesktopViewport, setIsDesktopViewport] = useState(false)
  const [mobileComposerHeight, setMobileComposerHeight] = useState(0)
  const [resetTick, setResetTick] = useState(0)
  const typingTimeoutRef = useRef(null)
  const typingChannelRef = useRef(null)
  const messagesEndRef = useRef(null)
  const messagesScrollRef = useRef(null)
  const mobileComposerRef = useRef(null)
  const didJustOpenConversationRef = useRef(false)
  const activeConversationRef = useRef(null)
  const stickToBottomRef = useRef(true)
  const prevKeyboardHeightRef = useRef(0)
  const pendingScrollToBottomRef = useRef(false)
  const pendingKeyboardOpenScrollRef = useRef(false)
  const viewportRafRef = useRef(null)
  const lastKeyboardHeightRef = useRef(0)

  const openConversationSeqRef = useRef(0)
  const openConversationLatestRef = useRef({ seq: 0, key: '' })
  const openConversationInFlightByKeyRef = useRef(new Map())

  const loadConversationsSeqRef = useRef(0)

  const markReadDisabledRef = useRef(false)
  const markReadStateByKeyRef = useRef(new Map())

  useEffect(() => {
    if (import.meta.env.DEV) log.debug('MESSAGES', 'mount Messages')
    return () => {
      if (import.meta.env.DEV) log.debug('MESSAGES', 'unmount Messages')
    }
  }, [])

  useEffect(() => {
    return () => {
      markReadDisabledRef.current = true
      try {
        const state = markReadStateByKeyRef.current
        for (const v of state.values()) {
          if (v?.timerId) {
            try {
              window.clearTimeout(v.timerId)
            } catch {
              // ignore
            }
          }
        }
        state.clear()
      } catch {
        // ignore
      }
    }
  }, [])

  useEffect(() => {
    const handler = () => setResetTick((v) => v + 1)
    window.addEventListener('supabase:reset', handler)
    return () => {
      window.removeEventListener('supabase:reset', handler)
    }
  }, [])

  useEffect(() => {
    if (!openServiceRequestMenuId) return

    const handlePointerDown = (ev) => {
      const target = ev?.target
      const menuRoot = target?.closest?.('[data-service-request-menu-root]')
      const menuId = menuRoot?.getAttribute?.('data-service-request-menu-root')
      if (menuId && String(menuId) === String(openServiceRequestMenuId)) return
      setOpenServiceRequestMenuId(null)
    }

    document.addEventListener('mousedown', handlePointerDown, true)
    return () => document.removeEventListener('mousedown', handlePointerDown, true)
  }, [openServiceRequestMenuId])

  const formatTime = (d) =>
    new Date(d || Date.now()).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })

  const toFriendlyErrorMessagePtBR = (raw) => {
    const msg = String(raw || '').trim()
    const lower = msg.toLowerCase()
    if (!lower) return ''
    if (lower.includes('timeout') || lower.includes('time out')) {
      return 'Sem conexão ou servidor lento. Tente novamente.'
    }
    return msg
  }

  const formatCurrencyBRL = (value) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return 'R$ --'
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
  }

  const formatTimeAgoPtBR = (dateLike) => {
    const d = dateLike ? new Date(dateLike) : null
    const ts = d && !Number.isNaN(d.getTime()) ? d.getTime() : null
    if (!ts) return ''

    const diffMs = Math.max(0, Date.now() - ts)
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin <= 0) return 'agora'
    if (diffMin < 60) return `${diffMin} minutos atrás`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH} horas atrás`
    const diffD = Math.floor(diffH / 24)
    return `${diffD} dias atrás`
  }

  const getServiceRequestBucket = (status) => {
    const s = String(status || '').toLowerCase()
    if (s === 'pending') return 'pending'
    if (['accepted', 'confirmed', 'in_progress', 'ongoing', 'started'].includes(s)) return 'in_progress'
    if (['archived', 'finalized', 'finalised', 'completed', 'done', 'cancelled', 'canceled', 'rejected', 'finished'].includes(s)) return 'finalized'
    return 'in_progress'
  }

  const pickNumber = (...candidates) => {
    for (const c of candidates) {
      const n = Number(c)
      if (Number.isFinite(n) && n > 0) return n
    }
    return null
  }

  const isMissingColumn = (err, column) => {
    const code = String(err?.code || '')
    if (code !== '42703') return false
    const msg = String(err?.message || '').toLowerCase()
    const col = String(column || '').toLowerCase()
    if (!msg.includes('column') || !msg.includes('does not exist')) return false
    return col ? msg.includes(col) : true
  }

  const isMissingRelationship = (err) => {
    const msg = String(err?.message || '').toLowerCase()
    return msg.includes('could not find') && msg.includes('relationship')
  }

  const getConversationKey = (otherUserId, serviceRequestId) =>
    `${String(otherUserId || '').trim()}::${String(serviceRequestId || '').trim()}`

  const markConversationAsReadNow = async ({ senderId, serviceRequestId }) => {
    if (markReadDisabledRef.current) return
    if (!user?.id) return

    const otherId = String(senderId || '').trim()
    const req = String(serviceRequestId || '').trim()
    if (!otherId) return

    // latest-wins: only mark if this conversation is still the active one
    const current = activeConversationRef.current
    const currentOtherId = String(current?.user?.id || '').trim()
    const currentReq = String(current?.serviceRequestId || '').trim()
    if (currentOtherId !== otherId) return
    if (currentReq !== req) return

    try {
      const now = new Date().toISOString()

      // Preferir RPC (SECURITY DEFINER) quando NÃO for chat de solicitação.
      // No modo service, a RPC marcaria mensagens fora da solicitação.
      if (!req) {
        try {
          await supabase.rpc('mark_messages_as_read', {
            sender_uuid: otherId,
            receiver_uuid: user.id,
          })
        } catch (_e) {
          // segue com update direto
        }
      }

      // Tentativa 1: schema com read_at + is_read
      let q = supabase
        .from('messages')
        .update({ is_read: true, read_at: now })
        .eq('receiver_id', user.id)
        .eq('sender_id', otherId)
        .or('is_read.is.null,is_read.eq.false')
        .is('read_at', null)

      q = req ? q.eq('request_id', req) : q.is('request_id', null)

      let res = await q

      if (res?.error) {
        const code = String(res.error?.code || '')
        // Fallback: schema só com read_at
        if (code === '42703') {
          let q2 = supabase
            .from('messages')
            .update({ read_at: now })
            .eq('receiver_id', user.id)
            .eq('sender_id', otherId)
            .is('read_at', null)

          q2 = req ? q2.eq('request_id', req) : q2.is('request_id', null)
          res = await q2
        }
      }

      if (res?.error) {
        // Fallback: schema só com is_read
        let q3 = supabase
          .from('messages')
          .update({ is_read: true })
          .eq('receiver_id', user.id)
          .eq('sender_id', otherId)
          .or('is_read.is.null,is_read.eq.false')

        q3 = req ? q3.eq('request_id', req) : q3.is('request_id', null)
        res = await q3
      }

      // Se o schema não tem request_id, tenta novamente sem filtrar
      if (res?.error && isMissingColumn(res.error, 'request_id')) {
        res = await supabase
          .from('messages')
          .update({ is_read: true })
          .eq('receiver_id', user.id)
          .eq('sender_id', otherId)
          .or('is_read.is.null,is_read.eq.false')
      }

      if (res?.error) log.error('MESSAGES', 'Erro ao marcar como lido', res.error)

      try {
        window.dispatchEvent(new CustomEvent('messages:changed'))
      } catch (_e) {
        // ignore
      }
    } catch (_e) {
      // best-effort
    }
  }

  const scheduleMarkConversationAsRead = ({ senderId, serviceRequestId }) => {
    if (markReadDisabledRef.current) return
    if (!user?.id) return

    const otherId = String(senderId || '').trim()
    const req = String(serviceRequestId || '').trim()
    if (!otherId) return

    const key = getConversationKey(otherId, req)
    const state = markReadStateByKeyRef.current

    const existing = state.get(key) || {
      timerId: null,
      inFlight: null,
      pending: false,
      lastArgs: { senderId: otherId, serviceRequestId: req },
    }

    existing.lastArgs = { senderId: otherId, serviceRequestId: req }

    if (existing.inFlight) {
      existing.pending = true
      state.set(key, existing)
      return
    }

    if (existing.timerId) {
      state.set(key, existing)
      return
    }

    existing.timerId = window.setTimeout(() => {
      const current = state.get(key)
      if (!current) return

      current.timerId = null
      if (current.inFlight) {
        current.pending = true
        state.set(key, current)
        return
      }

      current.inFlight = (async () => {
        await markConversationAsReadNow(current.lastArgs)
      })()

      state.set(key, current)

      void current.inFlight.then(
        () => {
          const after = state.get(key)
          if (!after) return
          after.inFlight = null
          const rerun = after.pending
          after.pending = false
          if (!rerun) {
            state.delete(key)
            return
          }
          state.set(key, after)
          scheduleMarkConversationAsRead(after.lastArgs)
        },
        () => {
          const after = state.get(key)
          if (!after) return
          after.inFlight = null
          const rerun = after.pending
          after.pending = false
          if (!rerun) {
            state.delete(key)
            return
          }
          state.set(key, after)
          scheduleMarkConversationAsRead(after.lastArgs)
        }
      )
    }, 200)

    state.set(key, existing)
  }

  const getBookingStatusLabel = (status) => {
    const s = String(status || '').toLowerCase()
    if (s === 'pending') return 'Pendente'
    if (s === 'accepted' || s === 'confirmed') return 'Aceita'
    if (s === 'rejected') return 'Recusada'
    if (s === 'archived' || s === 'finalized' || s === 'finalised') return 'Arquivada'
    if (s === 'cancelled' || s === 'canceled') return 'Cancelada'
    if (s === 'completed' || s === 'done') return 'Concluída'
    return s ? s : '-'
  }

  const performArchiveServiceRequest = async (booking) => {
    const bookingId = booking?.id
    if (!bookingId) return

    setServiceRequests((prev) =>
      (prev || []).map((b) => (String(b?.id) === String(bookingId) ? { ...b, status: 'archived' } : b))
    )

    try {
      const { error } = await supabase.from('bookings').update({ status: 'archived' }).eq('id', bookingId)
      if (error) throw error
      toast({ title: 'Solicitação arquivada' })
    } catch (e) {
      log.error('REQUESTS', 'archive_failed', {
        traceId: bookingId ? `requests:${bookingId}` : null,
        userId: user?.id || null,
        bookingId: bookingId || null,
        error: e,
      })
      toast({
        variant: 'destructive',
        title: 'Não foi possível arquivar',
        description: String(e?.message || 'Tente novamente.'),
      })
      loadServiceRequests()
    }
  }

  const performDeleteServiceRequest = async (booking) => {
    const bookingId = booking?.id
    if (!bookingId) return

    setServiceRequests((prev) => (prev || []).filter((b) => String(b?.id) !== String(bookingId)))

    try {
      const msgRes = await supabase.from('messages').delete().eq('request_id', bookingId)
      if (msgRes?.error && !isMissingColumn(msgRes.error, 'request_id')) {
        throw msgRes.error
      }

      const delRes = await supabase.from('bookings').delete().eq('id', bookingId)
      if (delRes?.error) throw delRes.error

      if (String(activeConversation?.serviceRequestId || '') === String(bookingId)) {
        setActiveConversation(null)
        setMessages([])
        setServiceChatBooking(null)
        navigate(location.pathname, { replace: true })
      }

      toast({ title: 'Solicitação apagada' })
    } catch (e) {
      log.error('REQUESTS', 'delete_failed', {
        traceId: bookingId ? `requests:${bookingId}` : null,
        userId: user?.id || null,
        bookingId: bookingId || null,
        error: e,
      })
      toast({
        variant: 'destructive',
        title: 'Não foi possível apagar',
        description: String(e?.message || 'Tente novamente.'),
      })
      loadServiceRequests()
    }
  }

  const archiveServiceRequest = (booking) => {
    const bookingId = booking?.id
    if (!bookingId) return
    setServiceRequestConfirmTarget({ kind: 'archive', booking })
    setServiceRequestConfirmOpen(true)
  }

  const deleteServiceRequest = (booking) => {
    const bookingId = booking?.id
    if (!bookingId) return
    setServiceRequestConfirmTarget({ kind: 'delete', booking })
    setServiceRequestConfirmOpen(true)
  }

  const getServiceChatParams = () => {
    const params = new URLSearchParams(location.search)
    return {
      mode: params.get('mode') || '',
      requestId: params.get('request') || params.get('booking') || '',
      serviceUserId: params.get('serviceUser') || '',
    }
  }

  const loadServiceRequests = async () => {
    if (!user?.id) return
    setServiceRequestsLoading(true)
    try {
      const selectVariants = [
        `
          id,
          status,
          created_at,
          scheduled_date,
          client_id,
          professional_id,
          client:client_id(id, username, name, avatar),
          professional:professional_id(id, username, name, avatar),
          service:service_id(title, price, price_unit)
        `,
        `
          id,
          status,
          created_at,
          scheduled_date,
          client_id,
          professional_id,
          client:client_id(id, username, name, avatar),
          professional:professional_id(id, username, name, avatar),
          service:service_id(title)
        `,
        `
          id,
          status,
          created_at,
          scheduled_date,
          client_id,
          professional_id
        `,
        // Fallback para schemas antigos que usam start_date no lugar de scheduled_date
        `
          id,
          status,
          created_at,
          start_date,
          client_id,
          professional_id,
          client:client_id(id, username, name, avatar),
          professional:professional_id(id, username, name, avatar),
          service:service_id(title, price, price_unit)
        `,
        `
          id,
          status,
          created_at,
          start_date,
          client_id,
          professional_id
        `,
      ]

      let lastError = null
      let data = null
      for (const sel of selectVariants) {
        const wantsStartDate = String(sel || '').includes('start_date')
        if (wantsStartDate && lastError && !isMissingColumn(lastError, 'scheduled_date')) {
          continue
        }

        const res = await supabase
          .from('bookings')
          .select(sel)
          .or(`client_id.eq.${user.id},professional_id.eq.${user.id}`)
          .order('created_at', { ascending: false })

        if (!res?.error) {
          data = res?.data || []
          lastError = null
          break
        }
        lastError = res.error
        // tenta próximo select quando schema diverge
        const code = String(res.error?.code || '')
        if (!['42703', 'PGRST116', 'PGRST200'].includes(code)) break
      }
      if (lastError) throw lastError
      setServiceRequests(Array.isArray(data) ? data : [])
    } catch (e) {
      log.error('REQUESTS', 'load_failed_messages', {
        traceId: null,
        userId: user?.id || null,
        bookingId: null,
        error: e,
      })
      setServiceRequests([])
    } finally {
      setServiceRequestsLoading(false)
    }
  }

  const openServiceRequestChat = async (booking) => {
    if (!booking?.id || !user?.id) return

    const otherProfile =
      booking.client_id === user.id ? booking.professional : booking.client
    const otherUserId = String(otherProfile?.id || '').trim()
    if (!otherUserId) return

    const conversation = {
      id: otherUserId,
      user: otherProfile || { id: otherUserId },
      serviceRequestId: String(booking.id),
      lastMessage: '',
      timestamp: '',
      unread: 0,
      pinned: false,
      blocked: false,
    }

    // Primeiro define conversa ativa e carrega mensagens (sem mexer na URL)
    await openConversation(conversation, { updateUrl: false })

    // Depois atualiza a URL para o modo especial
    const params = new URLSearchParams(location.search)
    params.set('chat', otherUserId)
    params.set('mode', 'service')
    params.set('request', String(booking.id))
    params.set('serviceUser', otherUserId)
    navigate(
      {
        pathname: location.pathname,
        search: `?${params.toString()}`,
      },
      { replace: false }
    )
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const mq = window.matchMedia('(min-width: 768px)')
    const apply = () => setIsDesktopViewport(!!mq.matches)

    apply()
    if (mq.addEventListener) {
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }

    // Safari antigo
    mq.addListener(apply)
    return () => mq.removeListener(apply)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isDesktopViewport) {
      setMobileComposerHeight(0)
      return
    }

    const el = mobileComposerRef.current
    if (!el) return

    const measure = () => {
      const h = Number(el.offsetHeight || 0)
      if (Number.isFinite(h) && h > 0) setMobileComposerHeight(h)
    }

    measure()

    if (typeof window.ResizeObserver !== 'undefined') {
      const ro = new window.ResizeObserver(() => measure())
      ro.observe(el)
      window.addEventListener('resize', measure)
      return () => {
        ro.disconnect()
        window.removeEventListener('resize', measure)
      }
    }

    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [isDesktopViewport])

  useEffect(() => {
    activeConversationRef.current = activeConversation
  }, [activeConversation])

  // No mobile: quando uma conversa está aberta, esconder o header global (JOBY)
  // para ficar apenas o ChatHeader da conversa (como na imagem).
  // Não depende de scroll (evita bugs com teclado/visualViewport).
  useEffect(() => {
    if (isDesktopViewport) return
    if (activeConversation) {
      setShowMobileHeader(false)
      return
    }
    setShowMobileHeader(true)
    return () => {
      // Garantia: ao sair da tela, não deixar o header preso oculto.
      setShowMobileHeader(true)
    }
  }, [activeConversation, isDesktopViewport, setShowMobileHeader])

  // Detectar altura REAL do teclado usando visualViewport
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return

    const compute = () => {
      // Android/Chrome: visualViewport pode ter offsetTop > 0.
      const visibleBottom = Number(vv.height || 0) + Number(vv.offsetTop || 0)
      const raw = Math.max(0, window.innerHeight - visibleBottom)
      const rounded = Math.max(0, Math.round(raw))

      const prev = lastKeyboardHeightRef.current
      // Evita "tremor": só atualiza se mudou o suficiente.
      if (Math.abs(rounded - prev) < 2) return

      lastKeyboardHeightRef.current = rounded
      setKeyboardHeight(rounded)
    }

    const schedule = () => {
      if (viewportRafRef.current != null) return
      viewportRafRef.current = window.requestAnimationFrame(() => {
        viewportRafRef.current = null
        compute()
      })
    }

    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    schedule() // inicial

    return () => {
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
      if (viewportRafRef.current != null) {
        window.cancelAnimationFrame(viewportRafRef.current)
        viewportRafRef.current = null
      }
    }
  }, [])

  // Scroll para o topo ao montar o componente
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const isMessageRead = (m) => {
    if (!m) return false
    // Schema novo: read_at
    if (m.read_at) return true
    // Schema antigo: is_read
    return m.is_read === true
  }

  const scrollToBottom = (behavior = 'auto') => {
    const el = messagesScrollRef.current
    if (el) {
      try {
        const top = el.scrollHeight
        if (behavior === 'smooth' && el.scrollTo) {
          el.scrollTo({ top, behavior: 'smooth' })
        } else {
          el.scrollTop = top
        }
      } catch (_e) {
        el.scrollTop = el.scrollHeight
      }
    }

    const end = messagesEndRef.current
    if (end?.scrollIntoView) {
      try {
        end.scrollIntoView({ behavior, block: 'end' })
      } catch (_e) {
        // ignore
      }
    }
  }

  const scrollToBottomAfterLayout = (behavior = 'auto') => {
    if (typeof window === 'undefined' || !window.requestAnimationFrame) {
      setTimeout(() => scrollToBottom(behavior), 0)
      return
    }

    // Duplo RAF: garante que o DOM + layout do input fixo (mobile) já estabilizaram.
    window.requestAnimationFrame(() => {
      scrollToBottom(behavior)
      window.requestAnimationFrame(() => scrollToBottom(behavior))
    })

    // Android: o teclado anima e o viewport muda em etapas.
    // Esse reforço garante que o "grudar no fim" fique perfeito.
    setTimeout(() => scrollToBottom(behavior), 80)
  }

  const isNearBottom = () => {
    const el = messagesScrollRef.current
    if (!el) return true
    const threshold = 48
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    return distance <= threshold
  }

  useEffect(() => {
    const el = messagesScrollRef.current
    if (!el) return

    const onScroll = () => {
      stickToBottomRef.current = isNearBottom()
    }

    // Inicial
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [activeConversation?.user?.id])

  useEffect(() => {
    if (isDesktopViewport) return

    const prev = prevKeyboardHeightRef.current
    prevKeyboardHeightRef.current = keyboardHeight

    // Quando o teclado abre (altura sobe) e o usuário está no fim,
    // mantemos a conversa ancorada no último item (WhatsApp-like).
    if (keyboardHeight > prev && stickToBottomRef.current) {
      scrollToBottomAfterLayout('auto')
    }

    // Primeira abertura do teclado: às vezes o scroll roda antes do keyboardHeight atualizar.
    // Aqui garantimos um segundo scroll assim que o keyboardHeight sair de 0.
    if (prev <= 0 && keyboardHeight > 0 && pendingKeyboardOpenScrollRef.current) {
      pendingKeyboardOpenScrollRef.current = false
      pendingScrollToBottomRef.current = false
      scrollToBottomAfterLayout('auto')
    }
  }, [keyboardHeight, isDesktopViewport])



  // Comportamento tipo apps grandes: ao abrir Mensagens, considera notificações de mensagem como lidas.
  // Assim o badge e a lista de notificações não ficam persistindo após o usuário ver as conversas.
  useEffect(() => {
    ;(async () => {
      try {
        if (!user?.id) return
        await markNotificationsReadByType({ userId: user.id, type: 'message' })
      } catch (_e) {
        // silencioso: não quebrar a tela
      }
    })()
  }, [user?.id])

  // Limpa o badge de Mensagens: marca mensagens recebidas como lidas.
  // Suporta schemas com `read_at` e/ou `is_read`.
  useEffect(() => {
    ;(async () => {
      try {
        if (!user?.id) return

        const now = new Date().toISOString()

        const isPermissionDenied = (err) => {
          const code = String(err?.code || '')
          const status = Number(err?.status || err?.statusCode || 0)
          const msg = String(err?.message || err || '').toLowerCase()
          return code === '42501' || status === 403 || msg.includes('permission denied')
        }

        // Tentativa 1: schema com read_at + is_read
        let res = await supabase
          .from('messages')
          .update({ is_read: true, read_at: now })
          .eq('receiver_id', user.id)
          .is('read_at', null)

        if (res?.error) {
          const code = String(res.error?.code || '')
          // Fallback: schema só com read_at
          if (code === '42703') {
            res = await supabase
              .from('messages')
              .update({ read_at: now })
              .eq('receiver_id', user.id)
              .is('read_at', null)
          }
        }

        if (res?.error) {
          // Fallback: schema só com is_read
          res = await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('receiver_id', user.id)
            .eq('is_read', false)
        }

        // Fallback final: se UPDATE estiver bloqueado (RLS), usar RPC SECURITY DEFINER por remetente.
        if (res?.error && isPermissionDenied(res.error)) {
          // Pega remetentes com mensagens não lidas
          const sendersRes = await supabase
            .from('messages')
            .select('sender_id')
            .eq('receiver_id', user.id)
            .eq('is_read', false)
            .limit(500)

          if (!sendersRes?.error) {
            const senders = Array.from(
              new Set((sendersRes.data || []).map((r) => String(r?.sender_id || '')).filter(Boolean))
            )

            for (const senderId of senders) {
              await supabase.rpc('mark_messages_as_read', {
                sender_uuid: senderId,
                receiver_uuid: user.id,
              })
            }
          }
        }

        try {
          window.dispatchEvent(new CustomEvent('messages:changed'))
        } catch (_e) {
          // ignore
        }
      } catch (_e) {
        // silencioso
      }
    })()
  }, [user?.id])
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)
  const [selectedProfessional, setSelectedProfessional] = useState(null)

  // Verificar se foi passado um usuário para iniciar conversa
  useEffect(() => {
    if (location.state?.startConversationWith) {
      const userToMessage = location.state.startConversationWith

      const serviceChat = location.state?.serviceChat
      const requestIdFromState = String(serviceChat?.requestId || '').trim()

      // Normalizar id (alguns lugares podem enviar user_id)
      const otherUserId = String(userToMessage?.id || userToMessage?.user_id || '').trim()
      if (!otherUserId) {
        // Limpar o state para não repetir ao navegar de volta
        navigate(location.pathname, { replace: true, state: {} })
        return
      }

      // Abrir a conversa via querystring (?chat=) para evitar que o effect de URL
      // limpe o activeConversation quando não há chatId.
      const params = new URLSearchParams(location.search)
      if (params.get('chat') !== otherUserId) {
        params.set('chat', otherUserId)
      }

      // Modo especial (quando veio de "Detalhes da solicitação")
      if (requestIdFromState) {
        params.set('mode', 'service')
        params.set('request', requestIdFromState)
        params.set('serviceUser', otherUserId)
      }

      navigate(
        {
          pathname: location.pathname,
          search: `?${params.toString()}`,
        },
        { replace: true, state: {} }
      )

      return
    }
  }, [location.state, conversations])

  // Carregar informações da solicitação quando estiver no modo service
  useEffect(() => {
    if (!user?.id) return

    const { mode, requestId, serviceUserId } = getServiceChatParams()
    const isServiceMode = mode === 'service' && !!requestId

    if (!isServiceMode) {
      setServiceChatBooking(null)
      setServiceChatLoading(false)
      return
    }

    // Se o chat atual não for o do modo especial, não busca (evita vazamento para outras conversas)
    if (activeConversation?.user?.id && serviceUserId && activeConversation.user.id !== serviceUserId) {
      setServiceChatBooking(null)
      setServiceChatLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        setServiceChatLoading(true)
        // Prefer: buscar booking + service
        const withScheduled =
          'id, status, scheduled_date, scheduled_time, client_id, professional_id, service:service_id(title, price, price_unit)'
        const withStart =
          'id, status, start_date, scheduled_time, client_id, professional_id, service:service_id(title, price, price_unit)'
        const simpleScheduled = 'id, status, scheduled_date, scheduled_time, client_id, professional_id'
        const simpleStart = 'id, status, start_date, scheduled_time, client_id, professional_id'

        let res = await supabase.from('bookings').select(withScheduled).eq('id', requestId).single()

        // Se a relação service falhar, tenta sem relacionamento
        if (res?.error && isMissingRelationship(res.error)) {
          res = await supabase.from('bookings').select(simpleScheduled).eq('id', requestId).single()
        }

        // Se scheduled_date não existe, tenta start_date
        if (res?.error && isMissingColumn(res.error, 'scheduled_date')) {
          res = await supabase.from('bookings').select(withStart).eq('id', requestId).single()
          if (res?.error && isMissingRelationship(res.error)) {
            res = await supabase.from('bookings').select(simpleStart).eq('id', requestId).single()
          }
        }

        if (cancelled) return
        setServiceChatBooking(res?.data || null)
      } catch (_e) {
        if (!cancelled) setServiceChatBooking(null)
      } finally {
        if (!cancelled) setServiceChatLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [location.search, user?.id, activeConversation?.user?.id])

  useEffect(() => {
    if (!user?.id) return
    loadServiceRequests()
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    loadConversations()
  }, [user?.id])

  // Inbox realtime: atualiza lista de conversas e, se estiver no chat aberto, adiciona a mensagem sem precisar recarregar.
  useEffect(() => {
    if (!user?.id) return

    const client = supabase
    const channelName = `inbox:${user.id}`

    const existingChannel = client
      .getChannels()
      .find((ch) => ch.topic === `realtime:${channelName}`)
    if (existingChannel) {
      try {
        existingChannel.unsubscribe?.()
      } catch {
        // ignore
      }
      client.removeChannel(existingChannel)
    }

    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`,
        },
        async (payload) => {
          const msg = payload.new
          const otherUserId = msg.sender_id

          // Não misturar mensagens de solicitações na lista de conversas normal
          const reqId = String(msg?.request_id || '').trim()
          if (reqId) return

          // Se o chat com esse usuário estiver aberto, adiciona a mensagem no chat
          const current = activeConversationRef.current
          if (current?.user?.id === otherUserId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev
              const formattedMsg = {
                id: msg.id,
                sender: 'them',
                text: msg.content,
                read_at: isMessageRead(msg) ? true : null,
                attachment_url: msg.attachment_url || null,
                attachment_type: msg.attachment_type || null,
                attachment_name: msg.attachment_name || null,
                mime_type: msg.mime_type || null,
                attachment_size: msg.attachment_size || null,
                thumb_url: msg.thumb_url || null,
                duration: msg.duration || null,
                timestamp: new Date(msg.created_at).toLocaleTimeString(
                  'pt-BR',
                  {
                    hour: '2-digit',
                    minute: '2-digit',
                  }
                ),
              }
              return [...prev, formattedMsg]
            })

            // P2: não marcar como lida aqui para evitar duplicação com subscribeToMessages
            // quando o chat está aberto.
          }

          // Atualiza a lista de conversas (lastMessage/unread) sem recarregar a página
          setConversations((prev) => {
            const timestamp = new Date(msg.created_at).toLocaleTimeString(
              'pt-BR',
              {
                hour: '2-digit',
                minute: '2-digit',
              }
            )

            const isChatOpen =
              activeConversationRef.current?.user?.id === otherUserId
            const incrementUnread = !isChatOpen && !isMessageRead(msg)

            const existing = prev.find((c) => c.user?.id === otherUserId)
            if (existing) {
              return prev.map((c) =>
                c.user?.id === otherUserId
                  ? {
                      ...c,
                      lastMessage: msg.content,
                      timestamp,
                      unread: isChatOpen
                        ? 0
                        : incrementUnread
                        ? (c.unread || 0) + 1
                        : c.unread,
                    }
                  : c
              )
            }

            // Nova conversa: busca perfil mínimo do remetente
            ;(async () => {
              const { data: profileData } = await supabase
                .from('profiles')
                .select('id, username, name, avatar, profession')
                .eq('id', otherUserId)
                .single()

              setConversations((curr) => {
                if (curr.some((c) => c.user?.id === otherUserId)) return curr
                return [
                  {
                    id: otherUserId,
                    user: profileData || { id: otherUserId },
                    lastMessage: msg.content,
                    timestamp,
                    unread: incrementUnread ? 1 : 0,
                    pinned: false,
                    blocked: false,
                  },
                  ...curr,
                ]
              })
            })()

            return prev
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${user.id}`,
        },
        (payload) => {
          const msg = payload.new
          const otherUserId = msg.receiver_id

          setConversations((prev) => {
            const timestamp = new Date(msg.created_at).toLocaleTimeString(
              'pt-BR',
              {
                hour: '2-digit',
                minute: '2-digit',
              }
            )
            const existing = prev.find((c) => c.user?.id === otherUserId)
            if (!existing) return prev
            return prev.map((c) =>
              c.user?.id === otherUserId
                ? { ...c, lastMessage: msg.content, timestamp }
                : c
            )
          })
        }
      )
      .subscribe()

    return () => {
      try {
        channel.unsubscribe?.()
      } catch {
        // ignore
      }
      client.removeChannel(channel)
    }
  }, [user?.id, resetTick])

  const loadConversations = async () => {
    const userId = user?.id
    const seq = ++loadConversationsSeqRef.current
    const isStale = () =>
      loadConversationsSeqRef.current !== seq || user?.id !== userId

    if (!userId) {
      if (!isStale()) {
        setLoadError('Sessão expirada. Faça login novamente.')
        setConversations([])
        setLoading(false)
      }
      return
    }

    setLoading(true)
    if (!isStale()) setLoadError(null)
    try {
      // Buscar conversas do usuário (últimas mensagens com cada contato)
      const select = `
          *,
          sender:profiles!sender_id(id, username, name, profession, avatar),
          receiver:profiles!receiver_id(id, username, name, profession, avatar)
        `

      let messagesData = null
      let messagesError = null

      // Preferir ignorar chats de solicitação (request_id IS NULL)
      const res = await supabase
        .from('messages')
        .select(select)
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .is('request_id', null)
        .order('created_at', { ascending: false })

      messagesData = res?.data
      messagesError = res?.error

      // Fallback para schema sem request_id
      if (messagesError && isMissingColumn(messagesError, 'request_id')) {
        const res2 = await supabase
          .from('messages')
          .select(select)
          .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
          .order('created_at', { ascending: false })

        messagesData = res2?.data
        messagesError = res2?.error
      }

      if (messagesError) throw messagesError

      // Agrupar mensagens por conversa
      const conversationsMap = new Map()

      messagesData?.forEach((msg) => {
        const otherUser = msg.sender_id === userId ? msg.receiver : msg.sender
        const conversationId = otherUser?.id
        if (!conversationId) return

        const unreadForMe = msg.receiver_id === userId && !isMessageRead(msg)

        if (!conversationsMap.has(conversationId)) {
          conversationsMap.set(conversationId, {
            id: conversationId,
            user: otherUser || { id: conversationId, name: '' },
            lastMessage: msg.content,
            timestamp: new Date(msg.created_at).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            unread: unreadForMe ? 1 : 0,
            pinned: false,
            blocked: false,
          })
        } else {
          // Incrementar contador de não lidas
          if (unreadForMe) {
            conversationsMap.get(conversationId).unread++
          }
        }
      })

      if (!isStale()) {
        setConversations(Array.from(conversationsMap.values()))
      }
    } catch (error) {
      log.error('MESSAGES', 'Erro ao carregar conversas', error)
      if (!isStale()) {
        setLoadError(String(error?.message || error || 'Erro desconhecido.'))
        setConversations([])
      }
    } finally {
      if (!isStale()) setLoading(false)
    }
  }

  const openConversation = async (conversation, { updateUrl = true } = {}) => {
    const otherUserId = conversation?.user?.id
    if (!otherUserId) return

    const serviceRequestId = String(conversation?.serviceRequestId || '').trim()

    const conversationKey = getConversationKey(otherUserId, serviceRequestId)
    // latest-wins: só incrementa quando muda de conversa (A->A não deve invalidar o próprio fetch)
    const latest = openConversationLatestRef.current || { seq: 0, key: '' }
    const seq =
      latest.key === conversationKey ? latest.seq : (openConversationSeqRef.current += 1)
    if (latest.key !== conversationKey) {
      openConversationLatestRef.current = { seq, key: conversationKey }
    }

    const isStale = () =>
      openConversationLatestRef.current.seq !== seq ||
      openConversationLatestRef.current.key !== conversationKey

    // Zera unread imediatamente (UX + evita "travado em não lidas" quando RLS impede UPDATE)
    setConversations((prev) =>
      prev.map((c) => (c?.user?.id === otherUserId ? { ...c, unread: 0 } : c))
    )

    setActiveConversation(conversation)
    activeConversationRef.current = conversation
    setMessages([])
    setIsTyping(false)
    didJustOpenConversationRef.current = true

    if (updateUrl) {
      const params = new URLSearchParams(location.search)
      if (params.get('chat') !== otherUserId) {
        params.set('chat', otherUserId)
        navigate(
          {
            pathname: location.pathname,
            search: `?${params.toString()}`,
          },
          { replace: false }
        )
      }
    }

    // Dedupe APENAS da fase assíncrona (fetch + pós-processamento + mark-as-read)
    const inFlightMap = openConversationInFlightByKeyRef.current
    const existingEntry = inFlightMap.get(conversationKey)
    if (existingEntry?.promise && existingEntry.seq === seq) return existingEntry.promise

    const run = async () => {
      try {
      // Buscar todas as mensagens dessa conversa
      let conversationMessages = null
      let error = null

      if (serviceRequestId) {
        const res = await supabase
          .from('messages')
          .select('*')
          .or(
            `and(sender_id.eq.${user.id},receiver_id.eq.${conversation.user.id}),and(sender_id.eq.${conversation.user.id},receiver_id.eq.${user.id})`
          )
          .eq('request_id', serviceRequestId)
          .order('created_at', { ascending: true })

        conversationMessages = res?.data
        error = res?.error

        // Fallback para schema sem request_id (não dá para separar)
        if (error && isMissingColumn(error, 'request_id')) {
          const res2 = await supabase
            .from('messages')
            .select('*')
            .or(
              `and(sender_id.eq.${user.id},receiver_id.eq.${conversation.user.id}),and(sender_id.eq.${conversation.user.id},receiver_id.eq.${user.id})`
            )
            .order('created_at', { ascending: true })
          conversationMessages = res2?.data
          error = res2?.error
        }
      } else {
        const res = await supabase
          .from('messages')
          .select('*')
          .or(
            `and(sender_id.eq.${user.id},receiver_id.eq.${conversation.user.id}),and(sender_id.eq.${conversation.user.id},receiver_id.eq.${user.id})`
          )
          .is('request_id', null)
          .order('created_at', { ascending: true })

        conversationMessages = res?.data
        error = res?.error

        // Fallback para schema sem request_id
        if (error && isMissingColumn(error, 'request_id')) {
          const res2 = await supabase
            .from('messages')
            .select('*')
            .or(
              `and(sender_id.eq.${user.id},receiver_id.eq.${conversation.user.id}),and(sender_id.eq.${conversation.user.id},receiver_id.eq.${user.id})`
            )
            .order('created_at', { ascending: true })
          conversationMessages = res2?.data
          error = res2?.error
        }
      }

      if (error) throw error

      // Formatar mensagens
      const formattedMessages = (conversationMessages || []).map((msg) => ({
        id: msg.id,
        sender: msg.sender_id === user.id ? 'me' : 'them',
        text: msg.content,
        read_at: isMessageRead(msg) ? true : null,
        attachment_url: msg.attachment_url || null,
        attachment_type: msg.attachment_type || null,
        attachment_name: msg.attachment_name || null,
        mime_type: msg.mime_type || null,
        attachment_size: msg.attachment_size || null,
        thumb_url: msg.thumb_url || null,
        duration: msg.duration || null,
        timestamp: new Date(msg.created_at).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }))

      if (isStale()) return

      setMessages(formattedMessages)

      pendingScrollToBottomRef.current = true

      // UX tipo WhatsApp: ao abrir a conversa, ir direto para a última mensagem.
      // Fazemos após setMessages para garantir que o DOM já tenha renderizado.
      scrollToBottomAfterLayout('auto')

      if (isStale()) return

      // UI: manter comportamento anterior (limpar badge imediatamente ao abrir)
      setConversations((prev) =>
        prev.map((c) => (c?.user?.id === otherUserId ? { ...c, unread: 0 } : c))
      )

      scheduleMarkConversationAsRead({ senderId: otherUserId, serviceRequestId })
    } catch (error) {
      log.error('MESSAGES', 'Erro ao carregar mensagens', error)
    }
    }

    const promise = run()
    inFlightMap.set(conversationKey, { promise, seq })
    void promise.finally(() => {
      const curr = inFlightMap.get(conversationKey)
      if (curr?.promise === promise) inFlightMap.delete(conversationKey)
    })

    return promise
  }

  const handleSelectConversation = async (conversation) => {
    return openConversation(conversation, { updateUrl: true })
  }

  // Suporte ao botão Voltar do navegador/celular: /messages?chat=<id>
  // - Com ?chat: abre conversa
  // - Sem ?chat: mostra lista (não volta para Início)
  useEffect(() => {
    if (!user?.id) return

    const params = new URLSearchParams(location.search)
    const chatId = params.get('chat')
    const mode = params.get('mode') || ''
    const requestId = params.get('request') || params.get('booking') || ''
    const serviceUser = params.get('serviceUser') || ''
    const isServiceChat =
      mode === 'service' &&
      !!requestId &&
      (!serviceUser || serviceUser === chatId)

    if (!chatId) {
      if (activeConversation) {
        setActiveConversation(null)
        setMessages([])
        setIsTyping(false)
      }
      return
    }

    if (activeConversation?.user?.id === chatId) return

    const existing = conversations.find((c) => c?.user?.id === chatId)
    if (existing) {
      const next = isServiceChat
        ? { ...existing, serviceRequestId: String(requestId) }
        : existing
      openConversation(next, { updateUrl: false })
      return
    }

    ;(async () => {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, username, name, avatar, profession')
        .eq('id', chatId)
        .single()

      const newConversation = {
        id: chatId,
        user: profileData || { id: chatId },
        ...(isServiceChat ? { serviceRequestId: String(requestId) } : {}),
        lastMessage: '',
        timestamp: '',
        unread: 0,
        pinned: false,
        blocked: false,
      }

      openConversation(newConversation, { updateUrl: false })
    })()
  }, [location.search, user?.id, conversations])

  // Subscrever a mensagens + typing com cleanup correto ao trocar de conversa
  useEffect(() => {
    if (!user?.id || !activeConversation?.user?.id) return

    const otherUserId = activeConversation.user.id
    const serviceRequestId = String(activeConversation?.serviceRequestId || '').trim()

    const unsubscribeMessages = subscribeToMessages(
      user.id,
      otherUserId,
      (newMessage, event) => {
        // Proteção extra: se o usuário trocou de conversa, ignore eventos antigos
        const current = activeConversationRef.current
        if (!current?.user?.id || current.user.id !== otherUserId) return

        // Separação de chats (quando existir request_id)
        if (serviceRequestId) {
          const msgReq = String(newMessage?.request_id || '').trim()
          if (msgReq && msgReq !== serviceRequestId) return
        } else {
          const msgReq = String(newMessage?.request_id || '').trim()
          if (msgReq) return
        }

        if (event === 'UPDATE') {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === newMessage.id
                ? { ...msg, read_at: isMessageRead(newMessage) ? true : null }
                : msg
            )
          )
          return
        }

        // Se o usuário está no fim do chat, manter ancorado no fim ao chegar nova mensagem.
        const isMine = newMessage.sender_id === user.id
        pendingScrollToBottomRef.current = isMine ? true : !!stickToBottomRef.current

        setMessages((prev) => {
          // 1) Se já existe por id, não duplica.
          if (prev.some((msg) => msg.id === newMessage.id)) return prev

          const formattedMsg = {
            id: newMessage.id,
            sender: isMine ? 'me' : 'them',
            text: newMessage.content,
            read_at: isMessageRead(newMessage) ? true : null,
            attachment_url: newMessage.attachment_url || null,
            attachment_type: newMessage.attachment_type || null,
            attachment_name: newMessage.attachment_name || null,
            mime_type: newMessage.mime_type || null,
            attachment_size: newMessage.attachment_size || null,
            thumb_url: newMessage.thumb_url || null,
            duration: newMessage.duration || null,
            timestamp: formatTime(newMessage.created_at),
          }

          // 2) Se for minha mensagem, tenta substituir uma otimista equivalente.
          if (isMine) {
            const nowMs = Date.now()
            for (let i = prev.length - 1; i >= 0; i -= 1) {
              const m = prev[i]
              if (!m || m.sender !== 'me' || !m._optimistic) continue
              if (String(m.text || '') !== String(newMessage.content || '')) continue
              const createdMs = Number(m._optimistic_created_ms || 0)
              if (createdMs && Math.abs(nowMs - createdMs) > 20000) continue

              const next = prev.slice()
              next[i] = { ...formattedMsg }
              return next
            }
          }

          return [...prev, formattedMsg]
        })

        // Se eu recebi a mensagem, marco como lida
        if (newMessage.sender_id !== user.id) {
          const otherId = otherUserId

          // Zerar contador localmente (não depender do backend)
          setConversations((prev) =>
            prev.map((c) => (c?.user?.id === otherId ? { ...c, unread: 0 } : c))
          )

          scheduleMarkConversationAsRead({ senderId: otherId, serviceRequestId })
        }
      }
    )

    const unsubscribeTyping = subscribeToTyping(user.id, (typing) => {
      setIsTyping(typing)
    })

    return () => {
      unsubscribeMessages()
      unsubscribeTyping()
    }
  }, [user?.id, activeConversation?.user?.id, resetTick])

  // Auto-scroll para última mensagem
  useEffect(() => {
    if (messagesEndRef.current) {
      const shouldStick =
        didJustOpenConversationRef.current ||
        pendingScrollToBottomRef.current ||
        stickToBottomRef.current

      if (!shouldStick) return

      // Com teclado aberto no Android, scroll suave costuma parar no meio.
      const behavior =
        didJustOpenConversationRef.current || keyboardHeight > 0 ? 'auto' : 'smooth'

      didJustOpenConversationRef.current = false
      pendingScrollToBottomRef.current = false
      scrollToBottomAfterLayout(behavior)
    }
  }, [messages, isTyping, keyboardHeight])

  const handleTyping = async () => {
    if (!activeConversation) return

    // Limpar timeout anterior
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Enviar sinal de digitação
    if (!typingChannelRef.current) {
      typingChannelRef.current = await sendTypingIndicator(
        activeConversation.user.id,
        { senderId: user?.id || null }
      )
    }

    // Parar de enviar após 3 segundos de inatividade
    typingTimeoutRef.current = setTimeout(async () => {
      if (typingChannelRef.current) {
        await stopTypingIndicator(typingChannelRef.current)
        typingChannelRef.current = null
      }
    }, 3000)
  }

  const handleSendMessage = async (messageText) => {
    if (messageText.trim() === '' || !activeConversation) return
    if (!activeConversation?.user?.id) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível enviar',
        description: 'Conversa inválida (destinatário ausente).',
      })
      return { ok: false, error: 'Missing receiver id' }
    }

    // Parar indicador de digitação (não bloquear o envio/UX aguardando rede)
    try {
      if (typingChannelRef.current) {
        const ch = typingChannelRef.current
        typingChannelRef.current = null
        Promise.resolve(stopTypingIndicator(ch)).catch(() => {})
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    } catch (_e) {
      // ignore
    }

    const otherId = activeConversation.user.id
    const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const optimisticTimestamp = formatTime(Date.now())

    // Otimista: adiciona localmente IMEDIATO (percepção de velocidade tipo WhatsApp)
    pendingScrollToBottomRef.current = true
    setConversations((prev) => {
      if (!otherId) return prev

      const existing = prev.find((c) => c.user?.id === otherId)
      if (!existing) return prev

      const next = prev.map((c) =>
        c.user?.id === otherId
          ? { ...c, lastMessage: messageText, timestamp: optimisticTimestamp, unread: 0 }
          : c
      )

      const updated = next.find((c) => c.user?.id === otherId)
      return updated ? [updated, ...next.filter((c) => c.user?.id !== otherId)] : next
    })

    setMessages((prev) => {
      // Evitar inserir duas vezes se usuário clicar muito rápido
      const last = prev[prev.length - 1]
      if (last?.sender === 'me' && last?._optimistic && last?.text === messageText) return prev

      const formattedMsg = {
        id: tempId,
        sender: 'me',
        text: messageText,
        read_at: null,
        timestamp: optimisticTimestamp,
        _optimistic: true,
        _optimistic_created_ms: Date.now(),
      }
      return [...prev, formattedMsg]
    })

    try {
      const { data, error } = await sendMessage({
        receiverId: otherId,
        content: messageText,
        requestId: activeConversation?.serviceRequestId || null,
      })

      if (error) {
        const msg = String(error?.message || error)
        toast({
          variant: 'destructive',
          title: 'Erro ao enviar mensagem',
          description: msg,
        })
        // rollback do otimista
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        return { ok: false, error }
      }

      // Confirmação: troca o tempId pelo id real (sem duplicar se o realtime chegar junto)
      if (data) {
        const realId = data.id
        const timestamp = formatTime(data.created_at)

        setConversations((prev) => {
          if (!otherId) return prev
          const existing = prev.find((c) => c.user?.id === otherId)
          if (!existing) return prev
          return prev.map((c) =>
            c.user?.id === otherId ? { ...c, lastMessage: data.content, timestamp } : c
          )
        })

        setMessages((prev) => {
          let next = prev

          // Se já existe a mensagem real (por realtime), remove o temp.
          if (next.some((m) => m.id === realId)) {
            return next.filter((m) => m.id !== tempId)
          }

          next = next.map((m) => {
            if (m.id !== tempId) return m
            return {
              ...m,
              id: realId,
              text: data.content,
              timestamp,
              read_at: isMessageRead(data) ? true : null,
              attachment_url: data.attachment_url || null,
              attachment_type: data.attachment_type || null,
              attachment_name: data.attachment_name || null,
              _optimistic: false,
            }
          })

          return next
        })

        didJustOpenConversationRef.current = false
      }
      return { ok: true }
    } catch (error) {
      log.error('MESSAGES', 'Erro ao enviar mensagem', error)
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar mensagem',
        description: String(error?.message || error),
      })
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      return { ok: false, error }
    }
  }

  const sendAttachmentInternal = async ({ file, tempId, description, durationSec = null }) => {
    if (!activeConversation?.user?.id) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível enviar arquivo',
        description: 'Abra uma conversa antes de anexar um arquivo.',
      })
      return { ok: false }
    }

    const mime = String(file?.type || '').toLowerCase()
    const isImage = mime.startsWith('image/')
    const isPdf = mime === 'application/pdf'
    const isVideo = mime.startsWith('video/')

    if (!isImage && !isPdf && !isVideo) {
      toast({
        variant: 'destructive',
        title: 'Tipo não suportado',
        description: 'Envie Foto (imagem), Vídeo ou Documento (PDF).',
      })
      return { ok: false }
    }

    try {
      // Bubble local: Enviando...
      setMessages((prev) =>
        prev.some((m) => m.id === tempId)
          ? prev.map((m) => (m.id === tempId ? { ...m, _send_state: 'sending' } : m))
          : [
              ...prev,
              {
                id: tempId,
                sender: 'me',
                text: String(description || '').trim(),
                read_at: null,
                attachment_url: null,
                attachment_type: isVideo ? 'video' : isImage ? 'image' : 'pdf',
                attachment_name: file?.name || 'Arquivo',
                mime_type: mime || null,
                attachment_size: Number(file?.size || 0) || 0,
                thumb_url: null,
                duration: isVideo ? (Number.isFinite(Number(durationSec)) ? Math.round(Number(durationSec)) : null) : null,
                timestamp: formatTime(new Date().toISOString()),
                _optimistic: true,
                _optimistic_created_ms: Date.now(),
                _send_state: 'sending',
                _retry_file: file,
              },
            ]
      )

      pendingScrollToBottomRef.current = true

      const up = await uploadMessageAttachment(file, {
        otherUserId: activeConversation.user.id,
        durationSec,
      })
      if (up?.error || !up?.url) {
        throw up?.error || new Error('Falha no upload do anexo.')
      }

      const { data, error } = await sendMessage({
        receiverId: activeConversation.user.id,
        content: String(description || '').trim(),
        requestId: activeConversation?.serviceRequestId || null,
        attachmentUrl: up.url,
        attachmentType: up.attachmentType,
        attachmentName: up.name || file.name,
        mimeType: up.mimeType,
        attachmentSize: up.size,
        thumbUrl: up.thumbUrl || null,
        duration: up.duration || (Number.isFinite(Number(durationSec)) ? Math.round(Number(durationSec)) : null),
      })

      if (error) throw error

      if (data) {
        setMessages((prev) => {
          // Se realtime chegou junto, remove o temp.
          if (prev.some((m) => m.id === data.id)) {
            return prev.filter((m) => m.id !== tempId)
          }

          const formattedMsg = {
            id: data.id,
            sender: 'me',
            text: data.content,
            read_at: isMessageRead(data) ? true : null,
            attachment_url: data.attachment_url || null,
            attachment_type: data.attachment_type || null,
            attachment_name: data.attachment_name || null,
            mime_type: data.mime_type || null,
            attachment_size: data.attachment_size || null,
            thumb_url: data.thumb_url || null,
            duration: data.duration || null,
            timestamp: new Date(data.created_at).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          }

          return prev.map((m) => (m.id === tempId ? formattedMsg : m))
        })
      }

      return { ok: true }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar arquivo',
        description: String(err?.message || err),
      })

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, _send_state: 'failed' } : m))
      )
      return { ok: false, error: err }
    }
  }

  const handleSendFile = (file, opts = {}) => {
    // Passo 1: Foto + PDF via Supabase Storage (fluxo único e confiável)
    return (async () => {
      if (!activeConversation?.user?.id) {
        toast({
          variant: 'destructive',
          title: 'Não foi possível enviar arquivo',
          description: 'Abra uma conversa antes de anexar um arquivo.',
        })
        return { ok: false }
      }

      const tempId = `temp-attach-${Date.now()}-${Math.random().toString(16).slice(2)}`
      return await sendAttachmentInternal({
        file,
        tempId,
        description: opts?.description,
        durationSec: opts?.durationSec,
      })
    })()
  }

  const retrySendAttachment = async (tempId) => {
    const current = messages.find((m) => m?.id === tempId)
    const file = current?._retry_file
    if (!file) return
    await sendAttachmentInternal({ file, tempId, description: current?.text })
  }

  const filteredConversations = conversations
    .filter(
      (conv) =>
        !conv.blocked &&
        ((conv.user?.username || conv.user?.name || '')
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
          String(conv.lastMessage || '').toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return 0
    })

  const openBookingModal = (professional) => {
    setSelectedProfessional(professional)
    setIsBookingModalOpen(true)
  }

  const closeBookingModal = () => {
    setIsBookingModalOpen(false)
    setSelectedProfessional(null)
  }

  const handleViewProfile = (userId) => {
    navigate(`/profile/${userId}`)
  }

  const handleBackToContacts = () => {
    setActiveConversation(null)
    setMessages([])
    navigate({ pathname: location.pathname, search: '' }, { replace: true })
  }

  const handleReportActive = () => {
    if (!activeConversation) return
    const label = getProfileDisplayName(activeConversation.user)
    alert(
      `Denúncia enviada para ${label}. Obrigado por avisar!`
    )
  }

  const handleBlockActive = () => {
    if (!activeConversation) return
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id ? { ...c, blocked: true } : c
      )
    )
    setActiveConversation(null)
    setMessages([])
  }

  const handleTogglePinActive = () => {
    if (!activeConversation) return
    const isPinnedNext = !activeConversation.pinned
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id ? { ...c, pinned: isPinnedNext } : c
      )
    )
    setActiveConversation((prev) =>
      prev ? { ...prev, pinned: isPinnedNext } : prev
    )
  }

  const performDeleteConversationMessages = async (target) => {
    if (!target?.conversationId || !target?.otherUserId) return
    if (!user?.id) return
    if (String(activeConversation?.id || '') !== String(target.conversationId)) return

    try {
      // Deletar todas as mensagens da conversa no Supabase
      const { error } = await supabase
        .from('messages')
        .delete()
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${target.otherUserId}),and(sender_id.eq.${target.otherUserId},receiver_id.eq.${user.id})`
        )

      if (error) throw error

      // Limpar mensagens localmente mas manter a conversa aberta
      setMessages([])

      // Atualizar a conversa na lista para remover a última mensagem
      setConversations((prev) =>
        prev.map((c) =>
          c.id === target.conversationId
            ? { ...c, lastMessage: '', unread: 0 }
            : c
        )
      )

      alert('Mensagens apagadas com sucesso!')
    } catch (error) {
      log.error('MESSAGES', 'Erro ao apagar mensagens', error)
      alert('Erro ao apagar mensagens. Tente novamente.')
    }
  }

  const performArchiveConversation = (target) => {
    if (!target?.conversationId) return
    if (String(activeConversation?.id || '') !== String(target.conversationId)) return

    // Remover conversa da lista
    setConversations((prev) => prev.filter((c) => c.id !== target.conversationId))
    setActiveConversation(null)
    setMessages([])

    alert(`Conversa com ${target.label || 'este contato'} arquivada!`)
  }

  const handleDeleteConversation = () => {
    if (!activeConversation) return

    const label = getProfileDisplayName(activeConversation.user)
    setConversationConfirmTarget({
      kind: 'delete_messages',
      conversationId: activeConversation.id,
      otherUserId: activeConversation.user?.id,
      label,
    })
    setConversationConfirmOpen(true)
  }

  const handleArchiveConversation = () => {
    if (!activeConversation) return

    const label = getProfileDisplayName(activeConversation.user)
    setConversationConfirmTarget({
      kind: 'archive_conversation',
      conversationId: activeConversation.id,
      otherUserId: activeConversation.user?.id,
      label,
    })
    setConversationConfirmOpen(true)
  }

  const handleMuteConversation = () => {
    if (!activeConversation) return

    const isMutedNext = !activeConversation.muted
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id ? { ...c, muted: isMutedNext } : c
      )
    )
    setActiveConversation((prev) =>
      prev ? { ...prev, muted: isMutedNext } : prev
    )

    alert(isMutedNext ? 'Notificações silenciadas' : 'Notificações ativadas')
  }

  const CHAT_COMPOSER_FALLBACK_PX = 15
  const chatBottomPadding = (() => {
    if (isDesktopViewport) return '16px'

    const bottomOffset = keyboardHeight > 0 ? keyboardHeight : 0
    const composerPx = Math.max(CHAT_COMPOSER_FALLBACK_PX, Number(mobileComposerHeight || 0))
    return `calc(${bottomOffset}px + ${composerPx}px + env(safe-area-inset-bottom))`
  })()

  return (
    <div
      className={`h-full w-full flex flex-col overflow-hidden ${
        !isDesktopViewport && activeConversation ? '-mt-12' : ''
      }`}
    >
      {/* Card principal ocupa toda a tela */}
      <Card className="flex-1 border-0 md:border md:border-border/50 rounded-none md:rounded-lg shadow-none md:shadow-sm flex flex-col overflow-hidden">
        <div className="grid md:grid-cols-[320px_1fr] h-full overflow-hidden">
          {/* Sidebar - Lista de Conversas - Desktop */}
          <div className="border-r border-border/50 hidden md:flex flex-col bg-card h-full overflow-hidden">
            {/* Barra de busca - altura fixa */}
            <div className="p-3 border-b border-border/50 flex-shrink-0 h-[60px]">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"
                  size={16}
                />
                <Input
                  placeholder="Buscar conversas..."
                  className="pl-9 py-2 h-9 bg-background/50 border-border/70 focus:border-primary"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Lista de conversas - área rolável */}
            <PullToRefresh
              onRefresh={loadConversations}
              threshold={70}
              spinnerText="Atualizando…"
              className="flex-1 overflow-y-auto"
              style={{ height: 'calc(100% - 60px)' }}
            >
              {loading ? (
                <PageSkeleton title="Carregando conversas…" />
              ) : loadError ? (
                <ErrorState
                  title="Erro ao carregar conversas"
                  message={toFriendlyErrorMessagePtBR(loadError)}
                  onRetry={() => loadConversations()}
                />
              ) : filteredConversations.length === 0 ? (
                <EmptyState
                  title="Sem conversas"
                  message="Nenhuma conversa encontrada."
                />
              ) : (
                <ConversationList
                  conversations={filteredConversations}
                  activeConversation={activeConversation}
                  onSelectConversation={handleSelectConversation}
                />
              )}
            </PullToRefresh>
          </div>

          {/* Área de Chat Principal */}
          <div className="flex flex-col h-full w-full bg-background overflow-hidden">
            {activeConversation ? (
              <>
                {/* Header do Chat - Altura fixa 64px */}
                <div className="flex-shrink-0 z-20 bg-card border-b border-border/50 h-16">
                  <ChatHeader
                    user={activeConversation.user}
                    onViewProfile={handleViewProfile}
                    onHireClick={() =>
                      openBookingModal(activeConversation.user)
                    }
                    onBack={handleBackToContacts}
                    onReportClick={handleReportActive}
                    onBlockClick={handleBlockActive}
                    onTogglePin={handleTogglePinActive}
                    isPinned={!!activeConversation.pinned}
                    onDeleteConversation={handleDeleteConversation}
                    onArchiveConversation={handleArchiveConversation}
                    onMuteConversation={handleMuteConversation}
                    isMuted={!!activeConversation.muted}
                  />
                </div>

                {/* Área de Mensagens - Rolável, preenche o espaço restante */}
                <div
                  ref={messagesScrollRef}
                  className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 sm:px-4 bg-gradient-to-b from-background to-muted/10"
                  style={{
                    WebkitOverflowScrolling: 'touch',
                    paddingTop: '8px',
                    paddingBottom: chatBottomPadding,
                    scrollPaddingBottom: chatBottomPadding,
                  }}
                >
                  {(() => {
                    const { mode, requestId, serviceUserId } = getServiceChatParams()
                    const isServiceChatActive =
                      mode === 'service' &&
                      !!requestId &&
                      (!serviceUserId || serviceUserId === activeConversation?.user?.id)

                    const booking = serviceChatBooking
                    const total =
                      pickNumber(
                        booking?.total_price,
                        booking?.total_amount,
                        booking?.total_value,
                        booking?.totalPrice,
                        booking?.service_price,
                        booking?.service_amount,
                        booking?.service_value,
                        booking?.service?.price,
                        booking?.service?.amount,
                        booking?.service?.value
                      ) || null
                    const dateRaw = booking?.scheduled_date || booking?.start_date || null
                    const dateText = dateRaw
                      ? new Date(dateRaw).toLocaleDateString('pt-BR')
                      : '-'
                    const statusText = getBookingStatusLabel(booking?.status)
                    const serviceTitle = String(booking?.service?.title || '').trim()

                    const avatar =
                      String(activeConversation?.user?.avatar || '').trim() ||
                      ''
                    const displayName = getProfileDisplayName(activeConversation.user)

                    const requestTitle = serviceTitle
                      ? serviceTitle
                      : 'Serviço'

                    const isClientView =
                      String(booking?.client_id || '').trim() &&
                      String(user?.id || '').trim() &&
                      String(booking?.client_id || '') === String(user?.id || '')

                    const clientStatusText = (() => {
                      const bucket = getServiceRequestBucket(booking?.status)
                      if (bucket === 'pending') return 'Aguardando confirmação'
                      return statusText
                    })()

                    const packageText = (() => {
                      const title = String(serviceTitle || '').trim().toLowerCase()
                      if (!title.includes('pacote')) return ''

                      const raw = String(serviceTitle || '').trim()
                      const matchDays = raw.match(/(\d+)\s*(dia|dias)/i)
                      if (matchDays?.[1]) return `${matchDays[1]} dias`

                      const after = raw.split(/pacote\s*/i)[1]
                      const cleaned = String(after || '').trim()
                      return cleaned ? cleaned : ''
                    })()

                    const readyMessageText = (() => {
                      if (packageText) {
                        return `Confirma por favor se você consegue fazer o serviço no período de ${packageText}.\n\nSe precisar de mais detalhes eu posso enviar aqui.`
                      }
                      return 'Confirma por favor se você consegue fazer o serviço.\n\nSe precisar de mais detalhes eu posso enviar aqui.'
                    })()

                    const quickQuestions = [
                      { label: 'Qual é o endereço exato?', Icon: MapPin, text: 'Qual é o endereço exato?' },
                      {
                        label: 'Tem material no local?',
                        Icon: Briefcase,
                        text: 'Tem material no local?',
                      },
                      {
                        label: 'Precisa levar ferramentas?',
                        Icon: Briefcase,
                        text: 'Precisa levar ferramentas?',
                      },
                      {
                        label: 'Pode mandar fotos do serviço?',
                        Icon: Camera,
                        text: 'Pode mandar fotos do serviço?',
                      },
                      {
                        label: 'Existe estacionamento?',
                        Icon: null,
                        text: 'Existe estacionamento?',
                      },
                    ]

                    return (
                      <>
                        {isServiceChatActive ? (
                          <div className="pt-2 pb-2 space-y-3">
                            {isClientView ? (
                              <>
                                <Card className="rounded-2xl border-border/60 shadow-md p-4">
                                  <div className="flex items-start gap-3">
                                    <CircleAvatar
                                      src={avatar}
                                      alt={displayName}
                                      fallback={String(displayName || 'U').slice(0, 1)}
                                      wrapperClassName="h-14 w-14 rounded-full overflow-hidden bg-muted/40 border border-border/40 shrink-0 flex items-center justify-center"
                                      fallbackClassName="text-sm font-bold text-muted-foreground"
                                    />

                                    <div className="min-w-0 flex-1">
                                      <div className="text-lg font-semibold text-foreground">Solicitação enviada</div>

                                      <div className="mt-3 rounded-2xl border border-border/60 bg-background/60 p-3">
                                        <div className="flex items-stretch gap-3">
                                          <div className="min-w-0 flex-1 space-y-3">
                                            <div className="flex items-center gap-2 text-muted-foreground">
                                              <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                                              <span className="text-sm">Profissional</span>
                                            </div>

                                            {packageText ? (
                                              <div className="flex items-center gap-2 text-muted-foreground">
                                                <Clock3 className="h-4 w-4 shrink-0" />
                                                <span className="text-sm">Pacote:</span>
                                                <span className="text-sm font-semibold text-foreground">{packageText}</span>
                                              </div>
                                            ) : null}

                                            <div className="flex items-center gap-2 text-muted-foreground">
                                              <Clock3 className="h-4 w-4 shrink-0" />
                                              <span className="text-sm">Status</span>
                                              <span className="text-sm font-semibold text-foreground">{clientStatusText}</span>
                                            </div>
                                          </div>

                                          <div className="w-px bg-border/60" />

                                          <div className="shrink-0 flex flex-col items-end justify-between gap-3">
                                            <div className="flex items-center gap-2 text-muted-foreground">
                                              <DollarSign className="h-4 w-4 text-orange-500" />
                                              <span className="text-sm">Total</span>
                                              <span className="text-base font-semibold text-foreground">
                                                {total != null ? formatCurrencyBRL(total) : 'R$ --'}
                                              </span>
                                            </div>

                                            <button
                                              type="button"
                                              className="h-10 px-5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white text-sm font-semibold shadow-sm hover:from-orange-600 hover:to-orange-600"
                                              onClick={() => navigate(`/work-requests/${booking?.id}`)}
                                            >
                                              Ver detalhes
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </Card>

                                <Card className="rounded-2xl border-border/60 shadow-md p-4">
                                  <div className="flex items-start gap-3">
                                    <div className="h-10 w-10 rounded-2xl border border-border/60 bg-background flex items-center justify-center shrink-0">
                                      <ShieldCheck className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-base font-semibold text-foreground">
                                        Sua solicitação foi enviada.
                                      </div>
                                      <div className="mt-2 text-sm text-muted-foreground">
                                        Use este chat para tirar dúvidas e alinhar detalhes.
                                        O profissional só será pago após aceitar a solicitação.
                                      </div>
                                    </div>
                                  </div>
                                </Card>

                                <Card className="rounded-2xl border-border/60 shadow-md p-4 bg-muted/10">
                                  <div className="space-y-3">
                                    <div className="text-base font-semibold text-foreground">Olá! Tudo bem? 😊</div>
                                    <div className="text-sm text-muted-foreground whitespace-pre-line">{readyMessageText}</div>
                                    <button
                                      type="button"
                                      className="h-11 px-5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white text-sm font-semibold shadow-sm hover:from-orange-600 hover:to-orange-600"
                                      onClick={() =>
                                        handleSendMessage?.(
                                          `Olá! Tudo bem? 😊\n\n${readyMessageText}`
                                        )
                                      }
                                    >
                                      Enviar mensagem pronta
                                    </button>
                                  </div>
                                </Card>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {[
                                    { label: 'Você consegue confirmar hoje?', text: 'Você consegue confirmar hoje?', Icon: Clock3 },
                                    { label: 'Qual melhor horário?', text: 'Qual melhor horário?', Icon: MessageSquare },
                                    { label: 'Posso mandar fotos do local?', text: 'Posso mandar fotos do local?', Icon: Camera },
                                    { label: 'Tem alguma dúvida?', text: 'Tem alguma dúvida?', Icon: MessageSquare },
                                    { label: 'O endereço é este...', text: 'O endereço é este...', Icon: MapPin },
                                  ].map((q) => (
                                    <Button
                                      key={q.label}
                                      type="button"
                                      variant="outline"
                                      className="h-11 rounded-full justify-start px-4 shadow-sm"
                                      onClick={() => handleSendMessage?.(q.text)}
                                    >
                                      <q.Icon className="h-4 w-4 mr-2 text-muted-foreground" />
                                      {q.label}
                                    </Button>
                                  ))}
                                </div>

                                <Card className="rounded-2xl border-border/60 shadow-md p-4">
                                  <div className="space-y-2 text-sm">
                                    <div className="flex items-start gap-2 text-muted-foreground">
                                      <AlertTriangle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                                      <div>Evite enviar telefone antes da aceitação.</div>
                                    </div>
                                    <div className="flex items-start gap-2 text-muted-foreground">
                                      <ShieldCheck className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
                                      <div>O JOBY protege seu pagamento.</div>
                                    </div>
                                  </div>
                                </Card>
                              </>
                            ) : (
                              <>
                                <Card className="rounded-2xl border-border/60 shadow-md p-4">
                                  <div className="flex items-start gap-3">
                                    <CircleAvatar
                                      src={avatar}
                                      alt={displayName}
                                      fallback={String(displayName || 'U').slice(0, 1)}
                                      wrapperClassName="h-14 w-14 rounded-full overflow-hidden bg-muted/40 border border-border/40 shrink-0 flex items-center justify-center"
                                      fallbackClassName="text-sm font-bold text-muted-foreground"
                                    />

                                    <div className="min-w-0 flex-1">
                                      <div className="text-base font-semibold text-foreground whitespace-normal break-words">
                                        Solicitação: {requestTitle}
                                      </div>

                                      <div className="mt-3 rounded-2xl border border-border/60 bg-background/60 p-3">
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="flex items-center gap-2 text-muted-foreground">
                                            <CalendarDays className="h-4 w-4" />
                                            <span>Data</span>
                                            <span className="font-semibold text-foreground">{dateText}</span>
                                          </div>

                                          <div className="flex items-center gap-2 text-muted-foreground justify-end">
                                            <DollarSign className="h-4 w-4" />
                                            <span>Total</span>
                                            <span className="font-semibold text-foreground">
                                              {total != null ? formatCurrencyBRL(total) : 'R$ --'}
                                            </span>
                                          </div>

                                          <div className="flex items-center gap-2 text-muted-foreground">
                                            <span>Status</span>
                                            <span className="font-semibold text-foreground">{statusText}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </Card>

                                <Card className="rounded-2xl border-border/60 shadow-md p-4">
                                  <div className="flex items-start gap-3">
                                    <div className="h-10 w-10 rounded-2xl border border-border/60 bg-background flex items-center justify-center shrink-0">
                                      <ShieldCheck className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm font-semibold text-foreground">@Joby</div>
                                      <div className="text-sm text-muted-foreground">Profissional</div>
                                      <div className="mt-3 rounded-2xl bg-muted/30 border border-border/60 p-3 text-sm text-muted-foreground">
                                        Use este chat para tirar dúvidas e alinhar detalhes antes da aceitação.
                                      </div>
                                    </div>
                                  </div>
                                </Card>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {quickQuestions.map((q) => (
                                    <Button
                                      key={q.label}
                                      type="button"
                                      variant="outline"
                                      className="h-11 rounded-full justify-start px-4 shadow-sm"
                                      onClick={() => handleSendMessage?.(q.text)}
                                    >
                                      {q.Icon ? (
                                        <q.Icon className="h-4 w-4 mr-2 text-muted-foreground" />
                                      ) : (
                                        <MessageSquare className="h-4 w-4 mr-2 text-muted-foreground" />
                                      )}
                                      {q.label}
                                    </Button>
                                  ))}
                                </div>

                                <Card className="rounded-2xl border-border/60 shadow-md p-4">
                                  <div className="space-y-2 text-sm">
                                    <div className="flex items-start gap-2 text-muted-foreground">
                                      <AlertTriangle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                                      <div>Evite compartilhar telefone antes de aceitar.</div>
                                    </div>
                                    <div className="flex items-start gap-2 text-muted-foreground">
                                      <ShieldCheck className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
                                      <div>O JOBY protege seu pagamento.</div>
                                    </div>
                                  </div>
                                </Card>
                              </>
                            )}
                          </div>
                        ) : null}

                        {messages.length > 0 ? (
                          <div
                            className={
                              isServiceChatActive
                                ? 'pb-0'
                                : 'min-h-full flex flex-col justify-end pb-0'
                            }
                          >
                            <div className="space-y-2 sm:space-y-3">
                              {messages.map((msg) => (
                                <MessageBubble
                                  key={msg.id}
                                  message={msg}
                                  layout={isServiceChatActive ? 'field' : 'bubble'}
                                  onRetry={
                                    msg?.sender === 'me' && msg?._send_state === 'failed'
                                      ? () => retrySendAttachment(msg.id)
                                      : undefined
                                  }
                                />
                              ))}
                              {isTyping && <TypingIndicator user={activeConversation.user} />}
                              <div ref={messagesEndRef} className="h-px" />
                            </div>
                          </div>
                        ) : isServiceChatActive ? (
                          <div ref={messagesEndRef} className="h-px" />
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-center px-4">
                            <MessageSquare size={48} className="text-muted-foreground/30 mb-4" />
                            <p className="text-sm text-muted-foreground font-medium mb-1">
                              Nenhuma mensagem ainda
                            </p>
                            <p className="text-xs text-muted-foreground/70">
                              Comece a conversa enviando uma mensagem
                            </p>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>

                {/* Input de Mensagem - Dentro da área de chat APENAS NO DESKTOP */}
                <div className="hidden md:flex flex-shrink-0 border-t border-border/50 bg-card">
                  <MessageInput
                    onSendMessage={handleSendMessage}
                    onSendFile={handleSendFile}
                    onTyping={handleTyping}
                  />
                </div>
              </>
            ) : (
              /* Tela vazia no desktop / Lista de Contatos no mobile */
              <div className="h-full overflow-y-auto">
                {/* No desktop, mostrar mensagem para selecionar conversa */}
                <div className="hidden md:flex h-full flex-col items-center justify-center text-center px-4">
                  <MessageSquare
                    size={64}
                    className="text-muted-foreground/20 mb-4"
                  />
                  <p className="text-lg text-muted-foreground font-medium mb-2">
                    Selecione uma conversa
                  </p>
                  <p className="text-sm text-muted-foreground/70">
                    Escolha uma conversa na lista ao lado para começar
                  </p>
                </div>

                {/* No mobile, mostrar lista de contatos */}
                <div className="md:hidden">
                  <div className="px-4 pt-4">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        className={
                          mobileTopTab === 'conversas'
                            ? 'relative px-4 py-2 rounded-full bg-muted/40 text-foreground font-semibold'
                            : 'relative px-4 py-2 rounded-full text-muted-foreground font-medium'
                        }
                        onClick={() => setMobileTopTab('conversas')}
                      >
                        Conversas
                        {mobileTopTab === 'conversas' ? (
                          <span className="absolute left-4 right-4 -bottom-2 h-1 rounded-full bg-primary" />
                        ) : null}
                      </button>

                      <button
                        type="button"
                        className={
                          mobileTopTab === 'solicitacoes'
                            ? 'relative px-4 py-2 rounded-full bg-muted/40 text-foreground font-semibold'
                            : 'relative px-4 py-2 rounded-full text-muted-foreground font-medium'
                        }
                        onClick={() => setMobileTopTab('solicitacoes')}
                      >
                        Solicitações
                        {mobileTopTab === 'solicitacoes' ? (
                          <span className="absolute left-4 right-4 -bottom-2 h-1 rounded-full bg-primary" />
                        ) : null}
                      </button>

                      <button
                        type="button"
                        className={
                          mobileTopTab === 'finalizadas'
                            ? 'relative px-4 py-2 rounded-full bg-muted/40 text-foreground font-semibold'
                            : 'relative px-4 py-2 rounded-full text-muted-foreground font-medium'
                        }
                        onClick={() => {
                          setMobileTopTab('finalizadas')
                          setServiceRequestsTab('all')
                        }}
                      >
                        Arquivadas
                        {mobileTopTab === 'finalizadas' ? (
                          <span className="absolute left-4 right-4 -bottom-2 h-1 rounded-full bg-primary" />
                        ) : null}
                      </button>
                    </div>
                  </div>

                  {mobileTopTab === 'conversas' ? (
                    <div className="mt-2">
                      <ContactList
                        conversations={filteredConversations}
                        onSelectConversation={handleSelectConversation}
                        onViewProfile={handleViewProfile}
                        onHireClick={openBookingModal}
                      />
                    </div>
                  ) : (
                    <div className="px-4 pt-4 pb-6">
                      {mobileTopTab === 'solicitacoes' ? (
                        <div className="rounded-full border border-border/60 bg-muted/20 p-1 flex items-center gap-1">
                          <button
                            type="button"
                            className={
                              serviceRequestsTab === 'all'
                                ? 'flex-1 h-10 rounded-full bg-background shadow-sm text-primary font-semibold text-sm'
                                : 'flex-1 h-10 rounded-full text-muted-foreground font-medium text-sm'
                            }
                            onClick={() => setServiceRequestsTab('all')}
                          >
                            Todas
                          </button>
                          <button
                            type="button"
                            className={
                              serviceRequestsTab === 'sent'
                                ? 'flex-1 h-10 rounded-full bg-background shadow-sm text-foreground font-semibold text-sm'
                                : 'flex-1 h-10 rounded-full text-muted-foreground font-medium text-sm'
                            }
                            onClick={() => setServiceRequestsTab('sent')}
                          >
                            Enviadas
                          </button>
                          <button
                            type="button"
                            className={
                              serviceRequestsTab === 'received'
                                ? 'flex-1 h-10 rounded-full bg-background shadow-sm text-foreground font-semibold text-sm'
                                : 'flex-1 h-10 rounded-full text-muted-foreground font-medium text-sm'
                            }
                            onClick={() => setServiceRequestsTab('received')}
                          >
                            Recebidas
                          </button>
                        </div>
                      ) : null}

                      <Card className="mt-4 rounded-none border-0 shadow-none bg-transparent overflow-visible">
                        {serviceRequestsLoading ? (
                          <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
                        ) : (() => {
                          const isArchivedView = mobileTopTab === 'finalizadas'

                          const rows = (serviceRequests || [])
                            .filter((b) => {
                              const bucket = getServiceRequestBucket(b?.status)
                              return isArchivedView ? bucket === 'finalized' : bucket !== 'finalized'
                            })
                            .filter((b) => {
                              if (isArchivedView) return true
                              const sentByMe = String(b?.client_id || '') === String(user?.id || '')
                              if (serviceRequestsTab === 'sent') return sentByMe
                              if (serviceRequestsTab === 'received') return !sentByMe
                              return true
                            })
                            .map((b) => {
                              const otherProfile =
                                b?.client_id === user?.id ? b?.professional : b?.client
                              const otherName = getProfileDisplayName(otherProfile || {})
                              const otherRoleLabel =
                                b?.client_id === user?.id ? 'Profissional' : 'Cliente'
                              const handle = otherProfile?.username
                                ? `@${otherProfile.username}`
                                : otherName
                              const title = String(b?.service?.title || 'Serviço').trim()

                              const total =
                                pickNumber(
                                  b?.total_price,
                                  b?.total_amount,
                                  b?.total_value,
                                  b?.totalPrice,
                                  b?.service_price,
                                  b?.service_amount,
                                  b?.service_value,
                                  b?.service?.price,
                                  b?.service?.amount,
                                  b?.service?.value
                                ) || 0

                              const previewFromConv =
                                conversations.find((c) => c?.user?.id === otherProfile?.id)?.lastMessage ||
                                'Olá! Este chat é para tirar dúvidas e alinhar detalhes antes da aceitação.'

                              const when = formatTimeAgoPtBR(b?.created_at)
                              const statusLabel = getBookingStatusLabel(b?.status)

                              const avatarUrl = String(otherProfile?.avatar || '').trim()
                              const initial = String(handle || 'U')
                                .replace('@', '')
                                .slice(0, 1)
                                .toUpperCase()

                              return {
                                key: String(b?.id || Math.random()),
                                booking: b,
                                avatarUrl,
                                initial,
                                displayName: otherName,
                                roleLabel: otherRoleLabel,
                                handle,
                                title,
                                statusLabel,
                                total,
                                when,
                                preview: previewFromConv,
                              }
                            })

                          if (rows.length === 0) {
                            return (
                              <div className="p-4 text-sm text-muted-foreground">
                                Nenhuma solicitação aqui.
                              </div>
                            )
                          }

                          return (
                            <div className="p-4 space-y-3">
                              {rows.map((row, idx) => (
                                <div
                                  key={row.key}
                                  className="w-full text-left p-4 rounded-2xl border border-border/50 bg-background/70 shadow-sm flex items-start gap-3"
                                >
                                  <CircleAvatar
                                    src={row.avatarUrl}
                                    alt={row.handle}
                                    fallback={row.initial}
                                    wrapperClassName="h-12 w-12 rounded-full overflow-hidden bg-muted/40 border border-border/50 shrink-0 flex items-center justify-center"
                                    fallbackClassName="text-base font-semibold text-muted-foreground"
                                  />

                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-sm font-semibold text-foreground truncate">
                                          {row.displayName || row.handle}
                                        </div>
                                        <div className="text-sm text-muted-foreground truncate">{row.roleLabel || ''}</div>

                                        <div className="mt-2 flex items-center gap-2 min-w-0">
                                          <Briefcase className="h-4 w-4 text-primary shrink-0" />
                                          <div className="text-sm text-muted-foreground truncate">
                                            {(() => {
                                              const t = String(row.title || '').trim()
                                              const lower = t.toLowerCase()
                                              if (lower.startsWith('pacote ')) {
                                                const rest = t.slice(7).trim()
                                                return (
                                                  <>
                                                    <span>Pacote </span>
                                                    <span className="font-semibold text-foreground">{rest}</span>
                                                  </>
                                                )
                                              }
                                              return t
                                            })()}
                                          </div>
                                        </div>

                                        <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                                          <Hourglass className="h-4 w-4 text-muted-foreground shrink-0" />
                                          <div className="truncate">
                                            {row.when ? `${row.when}: ` : ''}
                                            {row.preview}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="shrink-0 text-right">
                                        <div
                                          className="flex justify-end relative -mt-1"
                                          data-service-request-menu-root={String(row.booking?.id || row.key)}
                                        >
                                          <button
                                            type="button"
                                            className="h-10 w-10 rounded-full flex items-center justify-center bg-muted/20 border border-border/60 hover:bg-muted/30"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setOpenServiceRequestMenuId((prev) =>
                                                String(prev || '') === String(row.booking?.id)
                                                  ? null
                                                  : String(row.booking?.id)
                                              )
                                            }}
                                            aria-label="Ações"
                                          >
                                            <MoreVertical className="h-5 w-5 text-foreground/80" />
                                          </button>

                                          {String(openServiceRequestMenuId || '') === String(row.booking?.id) ? (
                                            <div className="absolute right-0 top-10 w-40 rounded-xl border border-border bg-background shadow-md overflow-hidden z-50">
                                              <button
                                                type="button"
                                                className="w-full px-4 py-3 text-sm text-foreground text-left hover:bg-muted/40"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setOpenServiceRequestMenuId(null)
                                                  archiveServiceRequest(row.booking)
                                                }}
                                                disabled={
                                                  String(row.booking?.status || '').toLowerCase() === 'archived' ||
                                                  String(row.booking?.status || '').toLowerCase() === 'finalized' ||
                                                  String(row.booking?.status || '').toLowerCase() === 'finalised'
                                                }
                                              >
                                                Arquivar
                                              </button>
                                              <div className="h-px bg-border/60" />
                                              <button
                                                type="button"
                                                className="w-full px-4 py-3 text-sm text-destructive text-left hover:bg-muted/40"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setOpenServiceRequestMenuId(null)
                                                  deleteServiceRequest(row.booking)
                                                }}
                                              >
                                                Apagar
                                              </button>
                                            </div>
                                          ) : null}
                                        </div>

                                        <div className="text-lg font-semibold text-foreground leading-tight mt-2">
                                          {formatCurrencyBRL(row.total)}
                                        </div>
                                      </div>
                                    </div>

                                    {(() => {
                                      const bucket = getServiceRequestBucket(row.booking?.status)
                                      const waitingText = bucket === 'pending' ? 'Aguardando resposta' : row.statusLabel
                                      const StatusIcon = bucket === 'pending' ? Clock3 : Hourglass

                                      if (bucket === 'pending') {
                                        return (
                                          <div className="mt-3">
                                            <button
                                              type="button"
                                              className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-orange-500 text-white text-sm font-semibold shadow-sm hover:bg-orange-600"
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                openServiceRequestChat(row.booking)
                                              }}
                                            >
                                              Ver conversa
                                            </button>
                                          </div>
                                        )
                                      }

                                      return (
                                        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                                          <StatusIcon className="h-4 w-4 shrink-0" />
                                          <span className="font-medium">{waitingText}</span>
                                        </div>
                                      )
                                    })()}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                      </Card>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Input de Mensagem - Fixo na parte inferior APENAS NO MOBILE */}
      {activeConversation && (
        <div
          className="md:hidden"
          ref={mobileComposerRef}
          onFocusCapture={() => {
            if (!isDesktopViewport && stickToBottomRef.current) {
              pendingKeyboardOpenScrollRef.current = true
              pendingScrollToBottomRef.current = true
              scrollToBottomAfterLayout('auto')
            }
          }}
          style={{
            position: 'fixed',
            bottom:
              keyboardHeight > 0
                ? `${keyboardHeight}px`
                : showMobileHeader === false
                  ? 'calc(env(safe-area-inset-bottom) + 0px)'
                  : '64px',
            left: 0,
            right: 0,
            zIndex: 50,
          }}
        >
          <MessageInput
            onSendMessage={handleSendMessage}
            onSendFile={handleSendFile}
            onTyping={handleTyping}
          />
        </div>
      )}

      {/* Modal de Agendamento */}
      <BookingModal
        isOpen={isBookingModalOpen}
        setIsOpen={setIsBookingModalOpen}
        professional={selectedProfessional}
      />

      <AlertDialog
        open={serviceRequestConfirmOpen}
        onOpenChange={(open) => {
          setServiceRequestConfirmOpen(open)
          if (!open) setServiceRequestConfirmTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {serviceRequestConfirmTarget?.kind === 'delete'
                ? 'Apagar solicitação?'
                : 'Arquivar solicitação?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {serviceRequestConfirmTarget?.kind === 'delete'
                ? 'Isso apaga a solicitação e remove a conversa associada. Essa ação não pode ser desfeita.'
                : 'A solicitação será movida para arquivadas. Você pode desfazer alterando o status depois.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={
                serviceRequestConfirmTarget?.kind === 'delete'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : undefined
              }
              onClick={async () => {
                const target = serviceRequestConfirmTarget
                if (!target?.booking) return

                setServiceRequestConfirmOpen(false)
                setServiceRequestConfirmTarget(null)

                if (target.kind === 'delete') return performDeleteServiceRequest(target.booking)
                return performArchiveServiceRequest(target.booking)
              }}
            >
              {serviceRequestConfirmTarget?.kind === 'delete' ? 'Apagar' : 'Arquivar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={conversationConfirmOpen}
        onOpenChange={(open) => {
          setConversationConfirmOpen(open)
          if (!open) setConversationConfirmTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {conversationConfirmTarget?.kind === 'delete_messages'
                ? 'Apagar mensagens?'
                : 'Arquivar conversa?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {conversationConfirmTarget?.kind === 'delete_messages'
                ? `Deseja realmente apagar todas as mensagens com ${conversationConfirmTarget?.label || 'este contato'}? Esta ação não pode ser desfeita.`
                : `Deseja arquivar a conversa com ${conversationConfirmTarget?.label || 'este contato'}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={
                conversationConfirmTarget?.kind === 'delete_messages'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : undefined
              }
              onClick={() => {
                const target = conversationConfirmTarget
                if (!target) return

                setConversationConfirmOpen(false)
                setConversationConfirmTarget(null)

                if (target.kind === 'delete_messages') return performDeleteConversationMessages(target)
                return performArchiveConversation(target)
              }}
            >
              {conversationConfirmTarget?.kind === 'delete_messages'
                ? 'Apagar mensagens'
                : 'Arquivar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default Messages
