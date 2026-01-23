import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs } from '@/components/ui/tabs'
import { SwipeTabsList } from '@/components/SwipeTabs'
import { useSwipeTabs } from '@/hooks/useSwipeTabs'
import { TabTransition } from '@/components/TabTransition'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { formatPriceUnit } from '@/lib/priceUnit'
import {
  Briefcase,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  CheckCircle2,
  Ban,
  Hourglass,
} from 'lucide-react'

const WorkRequests = () => {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('recebidos')
  const [activeStatus, setActiveStatus] = useState('all')
  const [viewedStatuses, setViewedStatuses] = useState(new Set())
  const [requestsRecebidos, setRequestsRecebidos] = useState([])
  const [requestsEnviados, setRequestsEnviados] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const TAB_ORDER = ['recebidos', 'enviados']
  const swipeTabs = useSwipeTabs({
    tabs: TAB_ORDER,
    value: activeTab,
    onValueChange: setActiveTab,
  })

  // Scroll para o topo ao montar o componente
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    if (user) {
      loadRequests()
    } else if (!authLoading) {
      setLoading(false)
    }
  }, [user, authLoading])

  const loadRequests = async () => {
    if (!user?.id) return
    setLoading(true)
    setLoadError(null)
    try {
      // Carregar solicitações recebidas (onde o usuário é o profissional)
      const { data: recebidas, error: errorRecebidas } = await supabase
        .from('bookings')
        .select(
          `
          *,
          client:client_id(name, avatar),
          service:service_id(title, price, price_unit)
        `
        )
        .eq('professional_id', user.id)
        .order('created_at', { ascending: false })

      if (errorRecebidas) throw errorRecebidas

      // Carregar solicitações enviadas (onde o usuário é o cliente)
      const { data: enviadas, error: errorEnviadas } = await supabase
        .from('bookings')
        .select(
          `
          *,
          professional:professional_id(name, profession, avatar),
          service:service_id(title, price, price_unit)
        `
        )
        .eq('client_id', user.id)
        .order('created_at', { ascending: false })

      if (errorEnviadas) throw errorEnviadas

      // Formatar solicitações recebidas
      const formattedRecebidas =
        recebidas?.map((booking) => ({
          id: booking.id,
          title: booking.service?.title || 'Serviço',
          clientName: booking.client?.name,
          status: booking.status,
          statusLabel: getStatusLabel(booking.status),
          type: formatPriceUnit(booking.service?.price_unit || 'hora', { prefix: true }),
          date: booking.scheduled_date
            ? new Date(booking.scheduled_date).toLocaleDateString('pt-BR')
            : '-',
          value: booking.total_price || 0,
        })) || []

      // Formatar solicitações enviadas
      const formattedEnviadas =
        enviadas?.map((booking) => ({
          id: booking.id,
          title: booking.service?.title || 'Serviço',
          clientName: booking.professional?.name,
          status: booking.status,
          statusLabel: getStatusLabel(booking.status),
          type: formatPriceUnit(booking.service?.price_unit || 'hora', { prefix: true }),
          date: booking.scheduled_date
            ? new Date(booking.scheduled_date).toLocaleDateString('pt-BR')
            : '-',
          value: booking.total_price || 0,
        })) || []

      setRequestsRecebidos(formattedRecebidas)
      setRequestsEnviados(formattedEnviadas)
    } catch (error) {
      console.error('Erro ao carregar solicitações:', error)
      setLoadError(
        import.meta.env.DEV
          ? String(error?.message || error)
          : 'Não foi possível carregar suas solicitações agora.'
      )
      setRequestsRecebidos([])
      setRequestsEnviados([])
    } finally {
      setLoading(false)
    }
  }

  const getStatusLabel = (status) => {
    const labels = {
      pending: 'Pendente',
      accepted: 'Aceita',
      rejected: 'Recusada',
      completed: 'Concluída',
      cancelled: 'Cancelada',
    }
    return labels[status] || status
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-150px)]">
        <motion.div
          animate={{ rotate: 360, scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
          className="w-12 h-12 rounded-full joby-gradient"
        />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-150px)] px-4">
        <Card className="p-6 max-w-md w-full text-center">
          <p className="text-muted-foreground mb-4">
            Você precisa estar logado para ver seus serviços.
          </p>
          <Button onClick={() => navigate('/login')} className="w-full">
            Ir para Login
          </Button>
        </Card>
      </div>
    )
  }

  const statusCards = [
    {
      id: 'pending',
      label: 'Pendentes',
      count: 3,
      icon: Hourglass,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      id: 'rejected',
      label: 'Recusadas',
      count: 2,
      icon: XCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
    },
    {
      id: 'accepted',
      label: 'Aceitas',
      count: 1,
      icon: CheckCircle,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
    {
      id: 'completed',
      label: 'Concluídas',
      count: 10,
      icon: CheckCircle2,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      id: 'cancelled',
      label: 'Canceladas',
      count: 0,
      icon: Ban,
      color: 'text-gray-500',
      bgColor: 'bg-gray-500/10',
    },
  ]

  // Função para contar solicitações por status
  const getStatusCount = (status) => {
    const requests =
      activeTab === 'recebidos' ? requestsRecebidos : requestsEnviados
    return requests.filter((req) => req.status === status).length
  }

  // Atualizar contagens dinamicamente
  const statusCardsWithCounts = statusCards.map((card) => ({
    ...card,
    count: getStatusCount(card.id),
  }))

  // Função para filtrar solicitações
  const getFilteredRequests = () => {
    const requests =
      activeTab === 'recebidos' ? requestsRecebidos : requestsEnviados
    if (activeStatus === 'all') return requests
    return requests.filter((req) => req.status === activeStatus)
  }

  // Função para lidar com clique no card de status
  const handleStatusClick = (statusId) => {
    if (activeStatus === statusId) {
      // Se já está ativo, desativa (mostra todos)
      setActiveStatus('all')
    } else {
      // Ativa o filtro e marca como visualizado
      setActiveStatus(statusId)
      setViewedStatuses(
        (prev) => new Set([...prev, `${activeTab}-${statusId}`])
      )
    }
  }

  // Verifica se o status foi visualizado
  const isStatusViewed = (statusId) => {
    return viewedStatuses.has(`${activeTab}-${statusId}`)
  }

  const filteredRequests = getFilteredRequests()

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto py-6 px-4 max-w-5xl touch-pan-y"
      {...swipeTabs.containerProps}
    >
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <Briefcase size={32} className="text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Meus Serviços</h1>
        </div>
        <p className="text-muted-foreground">
          Visualize os serviços que você contratou e os serviços em que foi
          contratado.
        </p>
      </div>

      {/* Abas Recebidos e Enviados */}
      <div className="mb-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <SwipeTabsList
            tabs={[
              { value: 'recebidos', label: 'Recebidos' },
              { value: 'enviados', label: 'Enviados' },
            ]}
            listClassName="w-full max-w-md"
            triggerClassName="flex-1"
          />
        </Tabs>
      </div>

      <TabTransition value={activeTab} order={TAB_ORDER}>
        <>
          {/* Cards de Status */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {statusCardsWithCounts.map((status) => {
              const IconComponent = status.icon
              const isActive = activeStatus === status.id
              const showBadge = status.count > 0 && !isStatusViewed(status.id)

              return (
                <Card
                  key={status.id}
                  onClick={() => handleStatusClick(status.id)}
                  className={`p-3 cursor-pointer hover:shadow-md transition-all relative ${
                    isActive ? 'border-primary border-2 shadow-lg' : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <IconComponent
                      className={`w-5 h-5 ${status.color} ${
                        isActive ? 'scale-110' : ''
                      } transition-transform`}
                    />
                    <p
                      className={`text-sm font-medium ${
                        isActive
                          ? 'text-foreground font-semibold'
                          : 'text-foreground'
                      }`}
                    >
                      {status.label}
                    </p>
                  </div>
                  {showBadge && (
                    <Badge
                      variant="secondary"
                      className="absolute -top-2 -right-2 h-6 w-6 flex items-center justify-center p-0 rounded-full bg-primary text-primary-foreground animate-pulse"
                    >
                      {status.count}
                    </Badge>
                  )}
                </Card>
              )
            })}
          </div>

          {/* Lista de Solicitações */}
          <div className="space-y-3 mb-8">
            {loadError && (
              <Card className="p-4 border-destructive/40">
                <p className="text-sm text-destructive">{loadError}</p>
                <div className="mt-3">
                  <Button variant="outline" onClick={loadRequests}>
                    Tentar novamente
                  </Button>
                </div>
              </Card>
            )}

            {filteredRequests.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">
                  {activeStatus === 'all'
                    ? 'Nenhuma solicitação encontrada.'
                    : `Nenhuma solicitação ${statusCardsWithCounts
                        .find((s) => s.id === activeStatus)
                        ?.label.toLowerCase()} encontrada.`}
                </p>
              </Card>
            ) : (
              filteredRequests.map((request) => {
                const statusColor =
                  request.status === 'pending'
                    ? 'bg-blue-500/10 text-blue-600'
                    : request.status === 'completed'
                      ? 'bg-green-500/10 text-green-600'
                      : 'bg-red-500/10 text-red-600'

                const StatusIcon =
                  request.status === 'pending'
                    ? Hourglass
                    : request.status === 'completed'
                      ? CheckCircle2
                      : XCircle

                return (
                  <Card
                    key={request.id}
                    className="p-4 border-border hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-foreground mb-0.5">
                          {request.title}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {request.clientName}
                        </p>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`${statusColor} hover:opacity-80 flex items-center gap-1 px-2 py-0.5 text-xs`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {request.statusLabel}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                      <span>
                        {request.type} • {request.date}
                      </span>
                      <span className="text-xl font-bold text-foreground">
                        R$ {request.value.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </Card>
                )
              })
            )}
          </div>

          {/* Dicas para Profissionais */}
          <Card className="p-6 bg-muted/50">
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold mb-3 text-foreground">
                  Dicas para Profissionais:
                </h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>
                      Responda às solicitações em até 24 horas para manter boa
                      reputação
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>
                      Seja claro sobre disponibilidade e condições de trabalho
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        </>
      </TabTransition>
    </motion.div>
  )
}

export default WorkRequests
