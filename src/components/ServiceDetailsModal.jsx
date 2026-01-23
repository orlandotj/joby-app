import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { motion } from 'framer-motion'
import {
  X,
  Clock,
  MapPin,
  Home,
  AlertCircle,
  Calendar,
  Star,
  MessageSquare,
  Percent,
  Truck,
  TrendingUp,
  Briefcase,
  Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/components/ui/use-toast'
import { useResolvedStorageUrl } from '@/lib/storageUrl'
import { formatPriceUnit } from '@/lib/priceUnit'

const ServiceDetailsModal = ({ isOpen, onClose, service, professional }) => {
  const { user: currentUser } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [customSchedule, setCustomSchedule] = useState('')

  const serviceImageSrc = useResolvedStorageUrl(service?.image || '')
  const professionalAvatarSrc = useResolvedStorageUrl(
    professional?.avatar || ''
  )

  // Travar scroll do fundo quando modal abrir
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen || !service) return null

  const hasOpenSchedule =
    !service.availableHours || service.availableHours.length === 0

  const handleRequestService = () => {
    if (!currentUser) {
      toast({
        title: 'Login Necessário',
        description: 'Você precisa estar logado para solicitar serviços.',
        variant: 'destructive',
      })
      navigate('/login')
      return
    }

    if (hasOpenSchedule && !customSchedule.trim()) {
      toast({
        title: 'Horário Necessário',
        description: 'Por favor, informe quando você precisa do serviço.',
        variant: 'destructive',
      })
      return
    }

    // Navegar para página de confirmação
    onClose()
    navigate('/service-confirmation', {
      state: {
        service: service,
        professional: professional,
        schedule: customSchedule,
      },
    })
  }

  const handleMessageClick = () => {
    if (!currentUser) {
      toast({
        title: 'Login Necessário',
        description: 'Você precisa estar logado para enviar mensagens.',
        variant: 'destructive',
      })
      navigate('/login')
      return
    }
    toast({
      title: 'Mensagem iniciada',
      description: `Você iniciou uma conversa com ${professional.name} sobre ${service.title}.`,
      duration: 3000,
    })
    navigate(`/messages`)
    onClose()
  }

  if (!isOpen || !service) return null

  const modalContent = (
    // 1️⃣ OVERLAY - Trava o fundo e centraliza tudo
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm"
      style={{
        display: 'grid',
        placeItems: 'center',
        padding: '16px',
        overflow: 'hidden',
      }}
      onClick={onClose}
    >
      {/* 2️⃣ CONTAINER DO MODAL - O "quadrado" */}
      <div
        className="w-full max-w-md bg-card rounded-2xl shadow-xl overflow-hidden"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Fixo */}
        <div className="border-b border-border">
          {/* Imagem de Capa (se houver) */}
          {serviceImageSrc && (
            <div className="w-full h-40 overflow-hidden">
              <img
                src={serviceImageSrc}
                alt={service.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Informações do Serviço */}
          <div className="p-4">
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-foreground mb-1">
                  {service.title}
                </h2>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-orange-500">
                    R$ {service.price}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    / {formatPriceUnit(service.price_unit || service.priceUnit)}
                  </span>
                </div>
              </div>

              {/* Botão Fechar */}
              <button
                onClick={onClose}
                className="flex-shrink-0 p-2 hover:bg-muted rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* 3️⃣ CONTEÚDO COM SCROLL - Só essa parte rola */}
        <div
          className="p-4 overflow-y-auto space-y-4"
          style={{
            maxHeight: 'calc(90vh - 220px)',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
          }}
        >
          {/* Profissional */}
          {professional && (
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage
                      src={professionalAvatarSrc}
                      alt={professional.name}
                    />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {professional.name?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">
                      {professional.name}
                    </h3>
                    <p className="text-sm text-primary">
                      {professional.profession}
                    </p>
                  </div>
                  {professional.rating && (
                    <div className="flex items-center gap-1 text-yellow-500">
                      <Star size={16} fill="currentColor" />
                      <span className="text-sm font-medium">
                        {professional.rating}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Descrição */}
          {service.description && (
            <div>
              <h3 className="font-semibold text-foreground mb-2">
                Sobre o Serviço
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {service.description}
              </p>
            </div>
          )}

          {/* Informações Principais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Área de Atuação */}
            {service.workArea && (
              <Card className="bg-muted/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <MapPin size={20} className="text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground mb-1">
                        Área de Atuação
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {service.workArea}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Duração */}
            {service.duration && (
              <Card className="bg-muted/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Clock size={20} className="text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground mb-1">
                        Duração Estimada
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {service.duration}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Horários Disponíveis */}
          {service.availableHours && service.availableHours.length > 0 ? (
            <div>
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <Calendar size={18} />
                Horários Disponíveis
              </h3>
              <div className="flex flex-wrap gap-2">
                {service.availableHours.map((hour, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="px-3 py-1.5"
                  >
                    {hour}
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <Calendar size={18} className="text-primary" />
                {professional?.isOwnProfile
                  ? 'Horários em Aberto'
                  : 'Quando você precisa do serviço?'}
              </h3>
              {professional?.isOwnProfile ? (
                <p className="text-sm text-muted-foreground">
                  Você não definiu horários fixos. Os clientes poderão solicitar
                  horários personalizados.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-3">
                    O profissional aceita solicitações personalizadas. Informe o
                    horário, dia ou período desejado.
                  </p>
                  <Textarea
                    value={customSchedule}
                    onChange={(e) => setCustomSchedule(e.target.value)}
                    placeholder="Ex: Segunda-feira às 14h, Todos os sábados pela manhã, Durante 3 meses, etc."
                    className="min-h-[80px]"
                  />
                </>
              )}
            </div>
          )}

          {/* Tipos de Atendimento e Taxas */}
          {(service.homeService ||
            service.emergencyService ||
            service.travelFee) && (
            <div>
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp size={18} className="text-primary" />
                Tipos de Atendimento e Taxas
              </h3>
              <div className="space-y-3">
                {/* Atendimento a Domicílio */}
                {service.homeService && (
                  <Card className="bg-gradient-to-r from-blue-500/10 to-primary/10 border-primary/30">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/20 rounded-lg">
                          <Home size={20} className="text-primary" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-foreground mb-1">
                            Atendimento a Domicílio
                          </h4>
                          <p className="text-sm text-muted-foreground mb-2">
                            Profissional se desloca até o local do cliente
                          </p>
                          {service.homeServiceFee && (
                            <div className="flex items-center gap-2 text-sm">
                              <Percent size={16} className="text-primary" />
                              <span className="font-semibold text-primary">
                                +{service.homeServiceFee}% sobre o valor base
                              </span>
                            </div>
                          )}
                        </div>
                        <Badge className="bg-primary text-primary-foreground">
                          Disponível
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Atendimento de Emergência */}
                {service.emergencyService && (
                  <Card className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border-red-500/30">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-red-500/20 rounded-lg">
                          <AlertCircle size={20} className="text-red-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-foreground mb-1">
                            Atendimento de Emergência
                          </h4>
                          <p className="text-sm text-muted-foreground mb-2">
                            Disponibilidade para urgências 24 horas
                          </p>
                          {service.emergencyServiceFee && (
                            <div className="flex items-center gap-2 text-sm">
                              <Percent size={16} className="text-red-600" />
                              <span className="font-semibold text-red-600">
                                +{service.emergencyServiceFee}% taxa de
                                emergência
                              </span>
                            </div>
                          )}
                        </div>
                        <Badge className="bg-red-600 text-white">
                          Urgência
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Taxa de Deslocamento */}
                {service.travelFee && (
                  <Card className="bg-gradient-to-r from-green-500/10 to-teal-500/10 border-green-500/30">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-green-500/20 rounded-lg">
                          <Truck size={20} className="text-green-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-foreground mb-1">
                            Taxa de Deslocamento
                          </h4>
                          <p className="text-sm text-muted-foreground mb-2">
                            Cobrada para cobrir custos de transporte
                          </p>
                          <div className="flex items-center gap-2 text-sm">
                            <Percent size={16} className="text-green-600" />
                            <span className="font-semibold text-green-600">
                              +{service.travelFee}% taxa de deslocamento
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* Exemplo de Cálculo com Taxas */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <h4 className="font-semibold text-foreground mb-3">
                Cálculo de Valores
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">Valor Base:</span>
                  <span className="font-semibold">R$ {service.price}</span>
                </div>
                {service.homeService && service.homeServiceFee && (
                  <div className="flex justify-between items-center py-1 border-t border-border/50">
                    <span className="text-muted-foreground">
                      Com atendimento a domicílio (+{service.homeServiceFee}%):
                    </span>
                    <span className="font-semibold text-blue-600">
                      R${' '}
                      {(
                        parseFloat(service.price) *
                        (1 + parseFloat(service.homeServiceFee) / 100)
                      ).toFixed(2)}
                    </span>
                  </div>
                )}
                {service.emergencyService && service.emergencyServiceFee && (
                  <div className="flex justify-between items-center py-1 border-t border-border/50">
                    <span className="text-muted-foreground">
                      Com atendimento de emergência (+
                      {service.emergencyServiceFee}%):
                    </span>
                    <span className="font-semibold text-red-600">
                      R${' '}
                      {(
                        parseFloat(service.price) *
                        (1 + parseFloat(service.emergencyServiceFee) / 100)
                      ).toFixed(2)}
                    </span>
                  </div>
                )}
                {service.travelFee && (
                  <div className="flex justify-between items-center py-1 border-t border-border/50">
                    <span className="text-muted-foreground">
                      Taxa de deslocamento (+{service.travelFee}%):
                    </span>
                    <span className="font-semibold text-green-600">
                      R${' '}
                      {(
                        parseFloat(service.price) *
                        (parseFloat(service.travelFee) / 100)
                      ).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
              {service.workArea && (
                <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50">
                  <MapPin size={12} className="inline mr-1" />
                  Atua em: {service.workArea}
                  {service.duration && ` • Duração: ${service.duration}`}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Botões de Ação */}
          {!professional?.isOwnProfile && (
            <div className="flex gap-3 pt-4 border-t border-border">
              <Button
                onClick={handleRequestService}
                className="flex-1 joby-gradient text-primary-foreground"
              >
                <Briefcase size={18} className="mr-2" />
                Confirmar solicitação
              </Button>
              <Button
                onClick={handleMessageClick}
                variant="outline"
                className="flex-1"
              >
                <Send size={18} className="mr-2" />
                Mensagem
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )

  // Renderizar usando Portal diretamente no body
  return ReactDOM.createPortal(modalContent, document.body)
}

export default ServiceDetailsModal
