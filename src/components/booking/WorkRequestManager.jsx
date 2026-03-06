import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import {
  Clock,
  CheckCircle,
  XCircle,
  User,
  Calendar,
  MapPin,
  DollarSign,
  AlertTriangle,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabaseClient'
import { log } from '@/lib/logger'

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

const WorkRequestManager = ({ userId, userType }) => {
  const { toast } = useToast()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRequests()
  }, [userId, userType])

  const loadRequests = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('bookings')
        .select(
          `
          *,
          client:client_id(id, name, avatar),
          professional:professional_id(id, name, profession, avatar),
          service:service_id(title, price, unit)
        `
        )
        .order('created_at', { ascending: false })

      // Filtrar por tipo de usuário
      if (userType === 'client') {
        query = query.eq('client_id', userId)
      } else if (userType === 'professional') {
        query = query.eq('professional_id', userId)
      }

      const { data, error } = await query

      if (error) throw error

      // Formatar dados para o formato esperado
      const formattedRequests =
        data?.map((booking) => ({
          id: booking.id,
          clientId: booking.client_id,
          professionalId: booking.professional_id,
          clientName: booking.client?.name,
          professionalName: booking.professional?.name,
          service: booking.service?.title,
          serviceType: booking.service?.unit || 'hourly',
          totalAmount: booking.total_price,
          date: new Date(booking.scheduled_date),
          time: booking.scheduled_time,
          location: booking.location,
          description: booking.notes,
          status: booking.status,
          createdAt: new Date(booking.created_at),
        })) || []

      setRequests(formattedRequests)
    } catch (error) {
      log.error('REQUESTS', 'Erro ao carregar solicitações:', error)
      setRequests([])
    } finally {
      setLoading(false)
    }
  }

  const handleApproveRequest = async (requestId) => {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'accepted' })
        .eq('id', requestId)

      if (error) throw error

      setRequests((prev) =>
        prev.map((req) =>
          req.id === requestId
            ? { ...req, status: 'accepted', approvedAt: new Date() }
            : req
        )
      )

      toast({
        title: 'Solicitação Aprovada!',
        description: 'O serviço foi confirmado. O chat está agora disponível.',
        variant: 'success',
      })
    } catch (error) {
      log.error('REQUESTS', 'Erro ao aprovar solicitação:', error)
      toast({
        title: 'Erro',
        description: 'Não foi possível aprovar a solicitação.',
        variant: 'destructive',
      })
    }
  }

  const handleRejectRequest = async (requestId) => {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'rejected' })
        .eq('id', requestId)

      if (error) throw error

      setRequests((prev) =>
        prev.map((req) =>
          req.id === requestId
            ? { ...req, status: 'rejected', rejectedAt: new Date() }
            : req
        )
      )

      toast({
        title: 'Solicitação Recusada',
        description: 'A solicitação foi recusada e o cliente foi notificado.',
        variant: 'default',
      })
    } catch (error) {
      log.error('REQUESTS', 'Erro ao recusar solicitação:', error)
      toast({
        title: 'Erro',
        description: 'Não foi possível recusar a solicitação.',
        variant: 'destructive',
      })
    }
  }

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { label: 'Pendente', variant: 'secondary', icon: Clock },
      approved: { label: 'Aprovado', variant: 'default', icon: CheckCircle },
      rejected: { label: 'Recusado', variant: 'destructive', icon: XCircle },
      active: { label: 'Em Andamento', variant: 'default', icon: Clock },
      completed: { label: 'Concluído', variant: 'default', icon: CheckCircle },
    }

    const config = statusConfig[status] || statusConfig.pending
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon size={12} />
        {config.label}
      </Badge>
    )
  }

  const getServiceTypeLabel = (type) => {
    const types = {
      hourly: 'Por Hora',
      daily: 'Diária',
      event: 'Evento/Projeto',
    }
    return types[type] || type
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-muted rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertTriangle
            size={48}
            className="mx-auto text-muted-foreground mb-4"
          />
          <h3 className="text-lg font-semibold mb-2">Nenhuma Solicitação</h3>
          <p className="text-muted-foreground">
            {userType === 'client'
              ? 'Você ainda não fez nenhuma solicitação de trabalho.'
              : 'Você não tem solicitações pendentes no momento.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">
        {userType === 'client'
          ? 'Minhas Solicitações'
          : 'Solicitações Recebidas'}
      </h2>

      {requests.map((request) => (
        <motion.div
          key={request.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{request.service}</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <User size={14} className="text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {userType === 'client'
                        ? request.professionalName
                        : request.clientName}
                    </span>
                  </div>
                </div>
                {getStatusBadge(request.status)}
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-muted-foreground" />
                  <span>
                    {format(request.date, 'dd/MM/yyyy', { locale: ptBR })} às{' '}
                    {request.time}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <DollarSign size={14} className="text-muted-foreground" />
                  <span>
                    {getServiceTypeLabel(request.serviceType)} -{' '}
                    {formatCurrency(request.totalAmount)}
                  </span>
                </div>

                <div className="flex items-start gap-2 md:col-span-2">
                  <MapPin size={14} className="text-muted-foreground mt-0.5" />
                  <span>{request.location}</span>
                </div>
              </div>

              {request.description && (
                <div className="p-3 bg-muted/30 rounded-md">
                  <p className="text-sm">{request.description}</p>
                </div>
              )}

              {request.serviceType === 'hourly' && request.estimatedHours && (
                <div className="text-sm text-muted-foreground">
                  <Clock size={14} className="inline mr-1" />
                  Duração estimada: {request.estimatedHours} hora(s)
                </div>
              )}

              {/* Ações para profissionais */}
              {userType === 'professional' && request.status === 'pending' && (
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => handleApproveRequest(request.id)}
                    className="flex-1 joby-gradient text-primary-foreground"
                  >
                    <CheckCircle size={16} className="mr-1" />
                    Aprovar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleRejectRequest(request.id)}
                    className="flex-1"
                  >
                    <XCircle size={16} className="mr-1" />
                    Recusar
                  </Button>
                </div>
              )}

              {/* Status para clientes */}
              {userType === 'client' && request.status === 'pending' && (
                <div className="text-sm text-muted-foreground bg-blue-50 p-2 rounded-md">
                  <Clock size={14} className="inline mr-1" />
                  Aguardando resposta do profissional...
                </div>
              )}

              {request.status === 'approved' && (
                <div className="text-sm text-green-700 bg-green-50 p-2 rounded-md">
                  <CheckCircle size={14} className="inline mr-1" />
                  Serviço confirmado! O chat está disponível e o cronômetro pode
                  ser ativado.
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}

export default WorkRequestManager
