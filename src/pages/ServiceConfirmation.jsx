import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle, Clock, Home, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const ServiceConfirmation = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { service, professional, schedule, bookingId } = location.state || {}

  // Se não tiver dados, redirecionar
  if (!service || !professional) {
    React.useEffect(() => {
      navigate('/')
    }, [navigate])
    return null
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md my-auto"
      >
        <Card className="shadow-2xl border-2 border-green-500/20">
          <CardContent className="p-8 text-center">
            {/* Ícone de Sucesso */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 mb-6"
            >
              <CheckCircle size={48} className="text-green-500" />
            </motion.div>

            {/* Título */}
            <h1 className="text-2xl font-bold text-foreground mb-3">
              Solicitação Enviada!
            </h1>

            {/* Mensagem de Agradecimento */}
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Obrigado por solicitar o serviço{' '}
              <span className="font-semibold text-foreground">
                "{service.title}"
              </span>{' '}
              com{' '}
              <span className="font-semibold text-foreground">
                {professional.name}
              </span>
              .
            </p>

            {/* Alerta */}
            <Card className="bg-orange-500/10 border-orange-500/30 mb-6">
              <CardContent className="p-4">
                <div className="flex items-start gap-3 text-left">
                  <Clock
                    size={20}
                    className="text-orange-500 flex-shrink-0 mt-0.5"
                  />
                  <div>
                    <h3 className="font-semibold text-foreground text-sm mb-1">
                      Aguarde a confirmação
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Fique atento! O profissional receberá sua solicitação e
                      entrará em contato em breve para confirmar os detalhes do
                      serviço.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Detalhes da Solicitação */}
            {schedule && (
              <div className="text-left mb-6 p-4 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">
                  Horário solicitado:
                </p>
                <p className="text-sm font-medium text-foreground">
                  {schedule}
                </p>
              </div>
            )}

            {/* Botões de Ação */}
            <div className="space-y-3">
              <Button
                onClick={() => navigate('/')}
                className="w-full joby-gradient text-white"
              >
                <Home size={18} className="mr-2" />
                Voltar para Início
              </Button>
              <Button
                onClick={() => {
                  if (bookingId && professional?.id) {
                    const qs = new URLSearchParams({
                      mode: 'service',
                      request: String(bookingId),
                      serviceUser: String(professional.id),
                    })
                    navigate(`/messages?${qs.toString()}`)
                    return
                  }
                  navigate('/messages')
                }}
                variant="outline"
                className="w-full"
              >
                <MessageSquare size={18} className="mr-2" />
                Ver Mensagens
              </Button>
            </div>

            {/* Informação Adicional */}
            <p className="text-xs text-muted-foreground mt-6">
              Você pode acompanhar o status da solicitação na seção{' '}
              <span className="font-medium text-foreground">
                "Meus Serviços"
              </span>
              .
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

export default ServiceConfirmation
