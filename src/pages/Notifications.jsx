import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Bell,
  Heart,
  FileText,
  MessageSquare,
  MessageCircle,
  Star,
  UserPlus,
  Archive,
  Trash2,
  Wallet,
  Settings,
  AlertTriangle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

import { Badge } from '@/components/ui/badge'
import { Tabs } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import {
  listNotifications,
  archiveNotification,
  deleteNotification,
  markNotificationRead,
  markAllNotificationsRead,
  createNotification,
  subscribeToNotifications,
} from '@/services/notificationService'
import { supabase } from '@/lib/supabaseClient'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { getProfileDisplayName } from '@/lib/profileDisplay'
import { log } from '@/lib/logger'
import { useSwipeTabs } from '@/hooks/useSwipeTabs'
import { SwipeTabsList } from '@/components/SwipeTabs'
import { TabTransition } from '@/components/TabTransition'

const TYPE_META = {
  system: { label: 'Sistema', icon: Settings, badge: 'secondary' },
  work_request: { label: 'Solicitações', icon: FileText, badge: 'warning' },
  message: { label: 'Mensagens', icon: MessageSquare, badge: 'secondary' },
  payment: { label: 'Pagamentos', icon: Wallet, badge: 'success' },
  review: { label: 'Avaliações', icon: Star, badge: 'secondary' },
  like_aggregate_photo: { label: 'Curtidas', icon: Heart, badge: 'secondary' },
  like_aggregate_video: { label: 'Curtidas', icon: Heart, badge: 'secondary' },
  comment_aggregate_photo: { label: 'Comentários', icon: MessageCircle, badge: 'secondary' },
  comment_aggregate_video: { label: 'Comentários', icon: MessageCircle, badge: 'secondary' },
  follow_aggregate: { label: 'Seguidores', icon: UserPlus, badge: 'secondary' },
}

const AGGREGATE_TEXT = {
  like_aggregate_photo: {
    one: 'curtiu sua foto',
    two: 'curtiram sua foto',
    many: 'curtiram sua foto',
  },
  like_aggregate_video: {
    one: 'curtiu seu vídeo',
    two: 'curtiram seu vídeo',
    many: 'curtiram seu vídeo',
  },
  comment_aggregate_photo: {
    one: 'comentou na sua foto',
    two: 'comentaram na sua foto',
    many: 'comentaram na sua foto',
  },
  comment_aggregate_video: {
    one: 'comentou no seu vídeo',
    two: 'comentaram no seu vídeo',
    many: 'comentaram no seu vídeo',
  },
  follow_aggregate: {
    one: 'começou a seguir você',
    two: 'começaram a seguir você',
    many: 'começaram a seguir você',
  },
}

const isAggregateType = (type) => !!AGGREGATE_TEXT[type]

const safeActorsArray = (data) => {
  const raw = data?.actors
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String)
  return []
}

const safeActorsCount = (data, fallbackActorsLength = 0) => {
  const v = Number(data?.actors_count)
  return Number.isFinite(v) && v > 0 ? v : fallbackActorsLength
}

const buildAggregateTitle = ({ type, data, actorsById }) => {
  const cfg = AGGREGATE_TEXT[type]
  if (!cfg) return null

  const actors = safeActorsArray(data)
  const count = safeActorsCount(data, actors.length)
  const firstId = actors?.[0]
  const secondId = actors?.[1]
  const name1 = (firstId && actorsById?.[firstId]?.name) || 'Alguém'
  const name2 = secondId ? actorsById?.[secondId]?.name || 'outra pessoa' : 'outra pessoa'

  if (count <= 1) return `${name1} ${cfg.one}`
  if (count === 2) return `${name1} e ${name2} ${cfg.two}`

  const extra = Math.max(0, count - 2)
  return `${name1}, ${name2} e mais ${extra} ${cfg.many}`
}

const ActorAvatar = ({ profile, className = '' }) => {
  const name =
    profile?.name ||
    profile?.full_name ||
    profile?.nome ||
    profile?.username ||
    profile?.email ||
    'Usuário'
  const avatar = profile?.avatar || ''

  const avatarSrc = useResolvedStorageUrl(avatar)
  const fallbackLetter = String(name || '?').trim().charAt(0).toUpperCase() || '?'

  return (
    <Avatar className={className}>
      {avatarSrc ? <AvatarImage src={avatarSrc} alt={name || 'Avatar'} /> : null}
      <AvatarFallback className="text-[10px] font-semibold">{fallbackLetter}</AvatarFallback>
    </Avatar>
  )
}

const AvatarStack = ({ actorIds = [], actorsById = {} }) => {
  const ids = (actorIds || []).filter(Boolean).slice(0, 3)
  const p0 = actorsById[ids[0]]
  const p1 = actorsById[ids[1]]
  const p2 = actorsById[ids[2]]

  return (
    <div className="flex items-center gap-1 h-10">
      {p0 ? (
        <ActorAvatar profile={p0} className="h-7 w-7 ring-2 ring-background" />
      ) : (
        <Avatar className="h-7 w-7 ring-2 ring-background">
          <AvatarFallback className="text-[10px] font-semibold">?</AvatarFallback>
        </Avatar>
      )}
      {p1 ? <ActorAvatar profile={p1} className="h-7 w-7 ring-2 ring-background" /> : null}
      {p2 ? <ActorAvatar profile={p2} className="h-7 w-7 ring-2 ring-background" /> : null}
    </div>
  )
}

const formatWhen = (iso) => {
  try {
    return formatDistanceToNow(new Date(iso), {
      addSuffix: true,
      locale: ptBR,
    })
  } catch (_e) {
    return ''
  }
}

const Notifications = () => {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('all') // all | unread | archived
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [actorsById, setActorsById] = useState({})

  const [actionTarget, setActionTarget] = useState(null)
  const [actionOpen, setActionOpen] = useState(false)
  const [confirmingId, setConfirmingId] = useState(null)

  const mountedRef = useRef(false)
  const loadSeqRef = useRef(0)
  const didAutoMarkAllRef = useRef(false)

  const TAB_ORDER = ['all', 'unread', 'archived']
  const swipeTabs = useSwipeTabs({
    tabs: TAB_ORDER,
    value: activeTab,
    onValueChange: setActiveTab,
  })

  const userId = user?.id

  const load = async ({ silent = false } = {}) => {
    if (!userId) return

    const seq = ++loadSeqRef.current
    if (!silent) setLoading(true)
    setLoadError(null)

    try {
      const data = await listNotifications({
        userId,
        status: activeTab,
        limit: 80,
      })
      if (!mountedRef.current) return
      if (seq !== loadSeqRef.current) return
      setItems(data)
    } catch (error) {
      log.error('NOTIF', 'Erro ao carregar notificações', error)
      if (!mountedRef.current) return
      if (seq !== loadSeqRef.current) return
      setItems([])
      const raw = String(error?.message || error)
      const isMissingTable =
        raw.toLowerCase().includes('could not find the table') &&
        raw.toLowerCase().includes('public.notifications')
      setLoadError(
        isMissingTable
          ? 'Notificações ainda não estão configuradas no Supabase. Rode o script setup_notifications.sql e tente novamente.'
          : import.meta.env.DEV
            ? raw
            : 'Não foi possível carregar suas notificações agora.'
      )
    } finally {
      if (!mountedRef.current) return
      if (seq !== loadSeqRef.current) return
      // Mesmo em modo silencioso, se este foi o último load resolvido,
      // garantimos que o skeleton não fique preso.
      setLoading(false)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    window.scrollTo(0, 0)
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (userId) {
      load()
      const sub = subscribeToNotifications({
        userId,
        onChange: () => load({ silent: true }),
      })

      // Comportamento tipo Instagram/Facebook: ao abrir a tela,
      // marca como lidas (limpa badge) sem precisar clicar uma a uma.
      ;(async () => {
        try {
          if (didAutoMarkAllRef.current) return
          didAutoMarkAllRef.current = true

          await markAllNotificationsRead(userId)

          // Atualiza UI imediatamente: no "Não lidas" elas somem.
          setItems((prev) => {
            const next = prev.map((x) => (x?.is_read ? x : { ...x, is_read: true }))
            return activeTab === 'unread' ? [] : next
          })

          // Recarrega em background para garantir consistência (principalmente sem realtime).
          load({ silent: true })
        } catch (_e) {
          // ignore
        }
      })()

      return () => sub?.unsubscribe?.()
    }

    if (!authLoading) {
      setLoading(false)
      setItems([])
    }
  }, [userId, authLoading])

  useEffect(() => {
    if (userId) load()
  }, [activeTab])

  const handleOpen = async (n) => {
    if (!n) return

    try {
      if (!n.is_read) {
        await markNotificationRead({ id: n.id, userId })
        setItems((prev) => {
          if (activeTab === 'unread') return prev.filter((x) => x.id !== n.id)
          return prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
        })
      }
    } catch (_e) {
      // ignore
    }

    const actionUrl = n?.action_url
    if (actionUrl && typeof actionUrl === 'string') {
      const openContent = n?.data?.open_content
      const contentId = n?.data?.content_id
      const lastCommentId = n?.data?.last_comment_id

      if (openContent && contentId) {
        const params = new URLSearchParams()
        params.set('contentType', String(openContent))
        params.set('contentId', String(contentId))
        if (lastCommentId) params.set('commentId', String(lastCommentId))

        const withQuery =
          actionUrl + (actionUrl.includes('?') ? '&' : '?') + params.toString()
        navigate(withQuery)
        return
      }

      navigate(actionUrl)
      return
    }

    // fallback: se houver referência de entidade
    const bookingId = n?.data?.booking_id
    if (bookingId) {
      navigate('/work-requests')
      return
    }

    const conversationId = n?.data?.conversation_id
    if (conversationId) {
      navigate('/messages')
      return
    }
  }

  const handleMarkReadOptimistic = async (n) => {
    if (!n || !userId) return
    if (n.is_read) return

    // optimistic
    setItems((prev) => {
      if (activeTab === 'unread') return prev.filter((x) => x.id !== n.id)
      return prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
    })
    try {
      await markNotificationRead({ id: n.id, userId })
    } catch (e) {
      // rollback
      setItems((prev) => {
        // Se estava na aba "Não lidas", a notificação pode ter sido removida.
        // Recarrega silencioso pra recuperar a lista correta.
        load({ silent: true })
        return prev
      })
      log.error('NOTIF', 'Erro ao marcar como lida', e)
    }
  }

  const handleArchive = async (n) => {
    if (!n || !userId) return
    let removed = null
    let removedIndex = -1

    // optimistic remove
    setItems((prev) => {
      removedIndex = prev.findIndex((x) => x.id === n.id)
      removed = removedIndex >= 0 ? prev[removedIndex] : null
      return prev.filter((x) => x.id !== n.id)
    })

    try {
      await archiveNotification({ id: n.id, userId, archived: true })
    } catch (e) {
      // rollback
      if (removed) {
        setItems((prev) => {
          const next = [...prev]
          const idx = Math.min(Math.max(0, removedIndex), next.length)
          next.splice(idx, 0, removed)
          return next
        })
      }
      log.error('NOTIF', 'Erro ao arquivar notificação', e)
    }
  }

  const handleUnarchive = async (n) => {
    if (!n || !userId) return
    let removed = null
    let removedIndex = -1

    // optimistic remove
    setItems((prev) => {
      removedIndex = prev.findIndex((x) => x.id === n.id)
      removed = removedIndex >= 0 ? prev[removedIndex] : null
      return prev.filter((x) => x.id !== n.id)
    })

    try {
      await archiveNotification({ id: n.id, userId, archived: false })
    } catch (e) {
      // rollback
      if (removed) {
        setItems((prev) => {
          const next = [...prev]
          const idx = Math.min(Math.max(0, removedIndex), next.length)
          next.splice(idx, 0, removed)
          return next
        })
      }
      log.error('NOTIF', 'Erro ao desarquivar notificação', e)
    }
  }

  const handleDelete = async (n) => {
    if (!n || !userId) return
    let removed = null
    let removedIndex = -1

    // optimistic remove
    setItems((prev) => {
      removedIndex = prev.findIndex((x) => x.id === n.id)
      removed = removedIndex >= 0 ? prev[removedIndex] : null
      return prev.filter((x) => x.id !== n.id)
    })

    try {
      await deleteNotification({ id: n.id, userId })
    } catch (e) {
      // rollback
      if (removed) {
        setItems((prev) => {
          const next = [...prev]
          const idx = Math.min(Math.max(0, removedIndex), next.length)
          next.splice(idx, 0, removed)
          return next
        })
      }
      log.error('NOTIF', 'Erro ao apagar notificação', e)
    }
  }

  const isWorkTimerStart = (n) => String(n?.data?.kind || '') === 'work_timer_started'

  const handleConfirmWorkTimerStart = async (n) => {
    if (!n || !userId) return
    if (!isWorkTimerStart(n)) return
    if (n?.data?.confirmed_at) return

    const professionalId = n?.data?.professional_id
    const bookingId = n?.data?.booking_id
    const nowIso = new Date().toISOString()

    setConfirmingId(n.id)
    try {
      // 1) Update current notification with confirmation timestamp (if schema allows)
      let updated = false
      try {
        const payload = {
          is_read: true,
          read_at: nowIso,
          data: {
            ...(n?.data || {}),
            confirmed_at: nowIso,
            confirmed_by: userId,
          },
        }
        const { error } = await supabase
          .from('notifications')
          .update(payload)
          .eq('id', n.id)
          .eq('user_id', userId)

        if (!error) updated = true
      } catch (_e) {
        // ignore
      }

      if (!updated) {
        // Fallback: at least mark it as read
        try {
          await markNotificationRead({ id: n.id, userId })
        } catch (_e) {
          // ignore
        }
      }

      // 2) Notify professional for audit trail
      if (professionalId) {
        await createNotification({
          userId: professionalId,
          type: 'work_request',
          title: 'Início confirmado',
          body: 'O cliente confirmou o início do turno. (Registro)',
          actionUrl: n?.action_url || (bookingId ? `/work-timer/${bookingId}` : null),
          bookingId,
          data: {
            kind: 'work_timer_start_confirmed',
            booking_id: bookingId,
            client_id: userId,
            confirmed_at: nowIso,
          },
        })
      }

      // 3) Update UI
      setItems((prev) =>
        (prev || []).map((x) =>
          x.id === n.id
            ? {
                ...x,
                is_read: true,
                data: { ...(x?.data || {}), confirmed_at: nowIso, confirmed_by: userId },
              }
            : x
        )
      )
    } catch (e) {
      log.error('NOTIF', 'Erro ao confirmar início do turno', e)
    } finally {
      setConfirmingId(null)
    }
  }

  const openActions = (n) => {
    setActionTarget(n)
    setActionOpen(true)
  }

  const closeActions = () => {
    setActionOpen(false)
    setTimeout(() => setActionTarget(null), 150)
  }

  const actorIdsKey = useMemo(() => {
    const all = new Set()
    for (const n of items || []) {
      if (!isAggregateType(n?.type)) continue
      const actors = safeActorsArray(n?.data)
      for (const id of actors) all.add(String(id))
    }
    return Array.from(all).sort().join(',')
  }, [items])

  useEffect(() => {
    if (!actorIdsKey) return

    const ids = actorIdsKey.split(',').filter(Boolean)
    const missing = ids.filter((id) => !actorsById?.[id])
    if (missing.length === 0) return

    let cancelled = false

    const fetchProfiles = async (ids) => {
      const attempts = [
        'id,username,name,avatar',
        'id,username,full_name,avatar',
        'id,username,display_name,avatar',
        'id,username,name,avatar_url',
        'id,username,full_name,avatar_url',
        'id,username,display_name,avatar_url',
        'id,username,avatar',
        'id,username,avatar_url',
        'id,username',
      ]

      for (const select of attempts) {
        const { data, error } = await supabase.from('profiles').select(select).in('id', ids)
        if (!error) return data || []

        const msg = String(error?.message || error)
        const isMissingColumn =
          msg.toLowerCase().includes('column') && msg.toLowerCase().includes('does not exist')
        const code = String(error?.code || '')
        const status = Number(error?.status || error?.statusCode || 0)
        const isPermissionDenied =
          code === '42501' || status === 403 || msg.toLowerCase().includes('permission denied') || msg.toLowerCase().includes('insufficient privilege')
        if (!isMissingColumn && !isPermissionDenied) throw error
      }

      return []
    }

    ;(async () => {
      try {
        const data = await fetchProfiles(missing)
        if (cancelled) return

        setActorsById((prev) => {
          const next = { ...(prev || {}) }
          for (const p of data || []) {
            if (!p?.id) continue
            next[String(p.id)] = {
              ...p,
              name: getProfileDisplayName(p),
              avatar: p?.avatar || p?.avatar_url || '',
            }
          }
          return next
        })
      } catch (e) {
        // não bloquear a tela se não conseguir buscar perfis
        log.warn('NOTIF', 'Erro ao buscar perfis dos atores', e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [actorIdsKey, actorsById])


  const renderSkeleton = () => (
    <div className="space-y-3">
      {[...Array(7)].map((_, i) => (
        <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
      ))}
    </div>
  )

  const NotificationRow = ({ n }) => {
    const pressTimerRef = useRef(null)
    const pressStartRef = useRef(null)

    const meta = TYPE_META[n.type] || {
      label: n.type || 'Notificação',
      icon: Bell,
      badge: 'secondary',
    }

    const aggregateTitle = isAggregateType(n?.type)
      ? buildAggregateTitle({ type: n?.type, data: n?.data, actorsById })
      : null

    const actors = isAggregateType(n?.type) ? safeActorsArray(n?.data) : []
    const Icon = meta.icon

    const clearLongPress = () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current)
        pressTimerRef.current = null
      }
      pressStartRef.current = null
    }

    const startLongPress = (e) => {
      clearLongPress()
      pressStartRef.current = { x: e?.clientX, y: e?.clientY }
      pressTimerRef.current = setTimeout(() => openActions(n), 520)
    }

    const cancelIfMoved = (e) => {
      const start = pressStartRef.current
      if (!start) return
      const dx = Math.abs((e?.clientX || 0) - (start.x || 0))
      const dy = Math.abs((e?.clientY || 0) - (start.y || 0))
      if (dx > 10 || dy > 10) clearLongPress()
    }

    const onClickRow = () => {
      handleOpen(n)
    }

    return (
      <div className="w-full max-w-full">
        <Card
          className={
            'w-full max-w-full p-4 rounded-2xl transition-colors cursor-pointer select-none overflow-hidden ' +
            (n.is_read
              ? 'bg-card'
              : 'bg-primary/5 border-primary/20 hover:bg-primary/10')
          }
          onClick={onClickRow}
          onPointerDown={startLongPress}
          onPointerMove={cancelIfMoved}
          onPointerUp={clearLongPress}
          onPointerCancel={clearLongPress}
          onPointerLeave={clearLongPress}
        >
          <div className="flex gap-3 min-w-0 overflow-hidden">
            <div className="flex-shrink-0">
              {isAggregateType(n?.type) ? (
                <AvatarStack actorIds={actors} actorsById={actorsById} />
              ) : (
                <div
                  className={
                    'h-10 w-10 rounded-xl flex items-center justify-center ' +
                    (n.is_read ? 'bg-muted' : 'bg-primary/10')
                  }
                >
                  <Icon
                    size={18}
                    className={n.is_read ? 'text-muted-foreground' : 'text-primary'}
                  />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground leading-snug break-words line-clamp-2">
                    {aggregateTitle || n.title || meta.label}
                  </p>
                  {!aggregateTitle && n.body ? (
                    <p className="text-sm text-muted-foreground mt-0.5 break-words line-clamp-2">
                      {n.body}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto sm:justify-end">
                  {!n.is_read && (
                    <span className="h-2 w-2 rounded-full bg-primary" aria-label="Não lida" />
                  )}
                  <Badge variant={meta.badge} className="whitespace-nowrap">
                    {meta.label}
                  </Badge>
                </div>
              </div>

              <div className="mt-2 text-xs text-muted-foreground">
                {n.created_at ? formatWhen(n.created_at) : ''}
              </div>

              {isWorkTimerStart(n) && !n?.data?.confirmed_at ? (
                <div className="mt-3">
                  <Button
                    size="sm"
                    className="h-9 rounded-xl"
                    disabled={confirmingId === n.id}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleConfirmWorkTimerStart(n)
                    }}
                  >
                    {confirmingId === n.id ? 'Confirmando...' : 'Confirmar início'}
                  </Button>
                </div>
              ) : null}

              {isWorkTimerStart(n) && n?.data?.confirmed_at ? (
                <div className="mt-3 text-xs text-muted-foreground">
                  Início confirmado
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const renderEmpty = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="text-center py-12 px-4"
    >
      <Bell className="mx-auto text-muted-foreground mb-4 opacity-70" size={46} />
      <h3 className="text-xl font-semibold text-foreground mb-2">
        Nenhuma notificação
      </h3>
      <p className="text-muted-foreground max-w-md mx-auto">
        Quando houver novidades (curtidas, comentários, pagamentos, avaliações), elas aparecem aqui.
      </p>
    </motion.div>
  )

  const renderError = () => (
    <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5" />
        <div>
          <p className="font-medium">Erro ao carregar notificações</p>
          <p className="text-sm opacity-90">{loadError}</p>
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={() => load()}>
              Tentar novamente
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  const renderList = () => (
    <div className="space-y-3">
      {items.map((n) => (
        <NotificationRow key={n.id} n={n} />
      ))}
    </div>
  )

  if (authLoading) {
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

  return (
    <div className="pb-20 md:pb-4 touch-pan-y" {...swipeTabs.containerProps}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notificações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Central de alertas do seu perfil profissional.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <SwipeTabsList
            tabs={[
              { value: 'all', label: 'Todas' },
              { value: 'unread', label: 'Não lidas' },
              { value: 'archived', label: 'Arquivadas' },
            ]}
            listClassName="flex w-full overflow-x-auto gap-2 justify-start p-1"
            triggerClassName="text-xs sm:text-sm whitespace-nowrap"
          />
        </Tabs>
      </div>

      <div className="mt-5">
        <TabTransition value={activeTab} order={TAB_ORDER}>
          {loading
            ? renderSkeleton()
            : loadError
              ? renderError()
              : items.length === 0
                ? renderEmpty()
                : renderList()}
        </TabTransition>
      </div>

      <Dialog open={actionOpen} onOpenChange={(v) => (v ? setActionOpen(true) : closeActions())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ações</DialogTitle>
            <DialogDescription>
              Escolha o que fazer com esta notificação.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const n = actionTarget
                closeActions()
                if (n) handleMarkReadOptimistic(n)
              }}
            >
              Marcar como lida
            </Button>

            {activeTab === 'archived' ? (
              <Button
                variant="outline"
                onClick={() => {
                  const n = actionTarget
                  closeActions()
                  if (n) handleUnarchive(n)
                }}
              >
                <Archive className="mr-2" size={16} />
                Desarquivar
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  const n = actionTarget
                  closeActions()
                  if (n) handleArchive(n)
                }}
              >
                <Archive className="mr-2" size={16} />
                Arquivar
              </Button>
            )}

            <Button
              variant="destructive"
              onClick={() => {
                const n = actionTarget
                closeActions()
                if (n) handleDelete(n)
              }}
            >
              <Trash2 className="mr-2" size={16} />
              Apagar
            </Button>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeActions}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

export default Notifications
