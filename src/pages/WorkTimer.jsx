import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import {
  Timer,
  Play,
  Pause,
  StopCircle,
  AlertTriangle,
  CheckCircle,
  Hourglass,
  UserCheck,
  UserX,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0')
  const m = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

const WorkTimer = () => {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user } = useAuth()

  const [jobDetails, setJobDetails] = useState(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [isActive, setIsActive] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [startTime, setStartTime] = useState(null)
  const [pauseBuffer, setPauseBuffer] = useState(0)
  const [lastPauseTime, setLastPauseTime] = useState(null)
  const [totalPauses, setTotalPauses] = useState(0)
  const [pauseHistory, setPauseHistory] = useState([])

  const [clientAuthorizedStart, setClientAuthorizedStart] = useState(false)
  const [professionalReadyToStart, setProfessionalReadyToStart] =
    useState(false)
  const [allowProfessionalSoloStart, setAllowProfessionalSoloStart] =
    useState(false)

  // Novas variáveis para controle de pagamento
  const [currentEarnings, setCurrentEarnings] = useState(0)
  const [paymentType, setPaymentType] = useState('hourly') // hourly, daily, event
  const [paymentRate, setPaymentRate] = useState(0)
  const [totalValue, setTotalValue] = useState(0)

  useEffect(() => {
    setTimeout(() => {
      const mockJob = {
        id: jobId,
        clientName: 'Ana Beatriz',
        professionalName: 'Carlos Alberto',
        service: 'Consultoria de Marketing Digital',
        paymentType: 'hourly', // hourly, daily, event
        hourlyRate: 75,
        dailyRate: 450,
        eventValue: 1200,
        status: 'Agendado',
        professionalId: 'prof123',
        clientId: 'client456',
        clientAllowsSoloStart: false,
        minimumPauseInterval: 30, // minutos
        maximumWorkTime: 480, // 8 horas em minutos
        breakReminder: 240, // 4 horas em minutos
      }

      setJobDetails(mockJob)
      setAllowProfessionalSoloStart(mockJob.clientAllowsSoloStart)
      setPaymentType(mockJob.paymentType)

      // Configurar taxa baseada no tipo de pagamento
      switch (mockJob.paymentType) {
        case 'hourly':
          setPaymentRate(mockJob.hourlyRate)
          break
        case 'daily':
          setPaymentRate(mockJob.dailyRate)
          break
        case 'event':
          setTotalValue(mockJob.eventValue)
          break
      }

      const savedTimerState = localStorage.getItem(`timerState_${jobId}`)
      if (savedTimerState) {
        const parsedState = JSON.parse(savedTimerState)
        setElapsedTime(parsedState.elapsedTime || 0)
        setIsActive(parsedState.isActive || false)
        setIsPaused(parsedState.isPaused || false)
        setStartTime(
          parsedState.startTime ? new Date(parsedState.startTime) : null
        )
        setPauseBuffer(parsedState.pauseBuffer || 0)
        setClientAuthorizedStart(parsedState.clientAuthorizedStart || false)
        setProfessionalReadyToStart(
          parsedState.professionalReadyToStart || false
        )
      }
    }, 500)
  }, [jobId])

  useEffect(() => {
    if (jobDetails) {
      const timerState = {
        elapsedTime,
        isActive,
        isPaused,
        startTime: startTime ? startTime.toISOString() : null,
        pauseBuffer,
        clientAuthorizedStart,
        professionalReadyToStart,
      }
      localStorage.setItem(`timerState_${jobId}`, JSON.stringify(timerState))
    }
  }, [
    elapsedTime,
    isActive,
    isPaused,
    startTime,
    pauseBuffer,
    clientAuthorizedStart,
    professionalReadyToStart,
    jobId,
    jobDetails,
  ])

  useEffect(() => {
    let interval = null
    if (isActive && !isPaused) {
      interval = setInterval(() => {
        const now = new Date()
        const secondsSinceStart = Math.floor((now - startTime) / 1000)
        const newElapsedTime = pauseBuffer + secondsSinceStart
        setElapsedTime(newElapsedTime)

        // Atualizar ganhos em tempo real para pagamento por hora
        if (paymentType === 'hourly') {
          const hours = newElapsedTime / 3600
          setCurrentEarnings(hours * paymentRate)
        }

        // Verificar tempo máximo de trabalho
        const totalMinutes = newElapsedTime / 60
        if (totalMinutes >= jobDetails?.maximumWorkTime) {
          toast({
            title: 'Alerta de Tempo Máximo',
            description: 'Você atingiu o tempo máximo recomendado de trabalho.',
            variant: 'warning',
          })
        }

        // Lembrete de pausa
        if (totalMinutes % jobDetails?.breakReminder === 0) {
          toast({
            title: 'Lembrete de Pausa',
            description: 'Considere fazer uma pausa para descanso.',
            variant: 'default',
          })
        }
      }, 1000)
    } else {
      clearInterval(interval)
    }
    return () => clearInterval(interval)
  }, [
    isActive,
    isPaused,
    startTime,
    pauseBuffer,
    paymentType,
    paymentRate,
    jobDetails,
  ])

  const canStartTimer = useCallback(() => {
    if (allowProfessionalSoloStart && professionalReadyToStart) return true
    return clientAuthorizedStart && professionalReadyToStart
  }, [
    allowProfessionalSoloStart,
    clientAuthorizedStart,
    professionalReadyToStart,
  ])

  const handleStart = () => {
    if (!canStartTimer()) {
      toast({
        title: 'Aguardando Autorização',
        description:
          'Ambas as partes precisam confirmar o início ou o cliente permitir início solo.',
        variant: 'default',
      })
      return
    }
    if (!isActive) {
      setPauseBuffer(0)
      setElapsedTime(0)
    }
    setStartTime(new Date())
    setIsActive(true)
    setIsPaused(false)
    setJobDetails((prev) => ({ ...prev, status: 'Em Andamento' }))
    toast({
      title: 'Serviço Iniciado!',
      description: 'O cronômetro está contando.',
      variant: 'success',
    })
  }

  const handlePauseResume = () => {
    if (!isActive) return

    const now = new Date()

    if (isPaused) {
      // Verificar intervalo mínimo de pausa
      if (lastPauseTime) {
        const pauseDuration = Math.floor((now - lastPauseTime) / (1000 * 60)) // em minutos
        if (pauseDuration < jobDetails.minimumPauseInterval) {
          toast({
            title: 'Intervalo Mínimo Não Atingido',
            description: `É necessário aguardar pelo menos ${jobDetails.minimumPauseInterval} minutos entre pausas.`,
            variant: 'destructive',
          })
          return
        }
      }

      setStartTime(now)
      setIsPaused(false)
      setPauseHistory((prev) => [
        ...prev,
        {
          start: lastPauseTime,
          end: now,
          duration: Math.floor((now - lastPauseTime) / (1000 * 60)),
        },
      ])
      toast({
        title: 'Serviço Retomado!',
        description: 'O cronômetro voltou a contar.',
        variant: 'success',
      })
    } else {
      const secondsSinceStart = Math.floor((now - startTime) / 1000)
      setPauseBuffer((prev) => prev + secondsSinceStart)
      setIsPaused(true)
      setLastPauseTime(now)
      setTotalPauses((prev) => prev + 1)
      toast({
        title: 'Serviço Pausado',
        description: 'O cronômetro está pausado.',
        variant: 'default',
      })
    }
  }

  const calculatePayment = () => {
    switch (paymentType) {
      case 'hourly':
        const hours = elapsedTime / 3600 // converter segundos para horas
        return hours * paymentRate

      case 'daily':
        const totalMinutes = elapsedTime / 60 // converter segundos para minutos
        // Se trabalhou menos de 2h ou mais de 12h, gera alerta
        if (totalMinutes < 120 || totalMinutes > 720) {
          toast({
            title: 'Alerta de Tempo Irregular',
            description:
              'O tempo trabalhado está muito abaixo ou acima do esperado para uma diária.',
            variant: 'warning',
          })
        }
        return paymentRate // valor fixo da diária

      case 'event':
        return totalValue // valor fixo do evento
    }
  }

  const handleStop = () => {
    const finalPayment = calculatePayment()

    setIsActive(false)
    setIsPaused(false)
    setJobDetails((prev) => ({ ...prev, status: 'Concluído' }))

    const summary = {
      totalTime: formatTime(elapsedTime),
      totalPauses,
      pauseHistory,
      payment: finalPayment,
    }

    if (import.meta.env.DEV) {
      console.log('Job Summary:', summary)
    }

    toast({
      title: 'Serviço Finalizado!',
      description: `Tempo total: ${formatTime(
        elapsedTime
      )}. Valor: ${formatCurrency(finalPayment)}.`,
      variant: 'success',
      duration: 7000,
    })

    localStorage.removeItem(`timerState_${jobId}`)
  }

  const handleClientAuthorize = () => {
    setClientAuthorizedStart(true)
    toast({
      title: 'Cliente Autorizou',
      description: 'Aguardando profissional para iniciar.',
      variant: 'success',
    })
    if (professionalReadyToStart) handleStart()
  }

  const handleProfessionalReady = () => {
    setProfessionalReadyToStart(true)
    toast({
      title: 'Profissional Pronto',
      description: 'Aguardando cliente para iniciar ou início solo.',
      variant: 'success',
    })
    if (clientAuthorizedStart || allowProfessionalSoloStart) handleStart()
  }

  const toggleAllowSoloStart = () => {
    if (user?.id === jobDetails?.clientId) {
      setAllowProfessionalSoloStart((prev) => !prev)
      toast({
        title: 'Configuração Alterada',
        description: `Início solo pelo profissional ${
          !allowProfessionalSoloStart ? 'permitido' : 'não permitido'
        }.`,
      })
    }
  }

  if (!jobDetails) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-150px)]">
        <Hourglass className="h-12 w-12 animate-spin text-primary" />
      </div>
    )
  }

  const isClient = user?.id === jobDetails.clientId
  const isProfessional = user?.id === jobDetails.professionalId
  const calculatedAmount = calculatePayment()

  const getPaymentTypeLabel = () => {
    switch (paymentType) {
      case 'hourly':
        return 'Por Hora'
      case 'daily':
        return 'Diária'
      case 'event':
        return 'Evento/Projeto'
      default:
        return 'Não definido'
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto py-4 px-2 sm:px-4 max-w-lg"
    >
      <Card className="shadow-xl border-border/50">
        <CardHeader className="text-center">
          <Timer size={48} className="mx-auto text-primary mb-2" />
          <CardTitle className="text-2xl">Cronômetro do Serviço</CardTitle>
          <CardDescription>{jobDetails.service}</CardDescription>
          <div className="text-sm text-muted-foreground pt-1">
            <p>Cliente: {jobDetails.clientName}</p>
            <p>Profissional: {jobDetails.professionalName}</p>
          </div>
        </CardHeader>
        <CardContent className="text-center">
          <div className="text-6xl font-mono font-bold my-6 text-foreground tabular-nums">
            {formatTime(elapsedTime)}
          </div>

          {/* Informações de Pagamento */}
          <div className="mb-4 p-3 bg-muted/30 rounded-lg">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Tipo:</span>
                <p className="font-semibold">{getPaymentTypeLabel()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {paymentType === 'hourly'
                    ? 'Taxa/Hora:'
                    : paymentType === 'daily'
                    ? 'Valor Diária:'
                    : 'Valor Total:'}
                </span>
                <p className="font-semibold">
                  {formatCurrency(
                    paymentType === 'event' ? totalValue : paymentRate
                  )}
                </p>
              </div>
              {paymentType === 'hourly' && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Valor Atual:</span>
                  <p className="font-bold text-primary text-lg">
                    {formatCurrency(currentEarnings)}
                  </p>
                </div>
              )}
              {totalPauses > 0 && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Pausas:</span>
                  <p className="font-semibold">{totalPauses} pausa(s)</p>
                </div>
              )}
            </div>
          </div>

          <div className="mb-6 space-y-3">
            {!isActive && !clientAuthorizedStart && isClient && (
              <Button
                onClick={handleClientAuthorize}
                size="lg"
                className="w-full joby-gradient text-primary-foreground gap-2"
              >
                <UserCheck size={20} /> Autorizar Início (Cliente)
              </Button>
            )}
            {!isActive && clientAuthorizedStart && isClient && (
              <p className="text-green-600 flex items-center justify-center gap-2">
                <CheckCircle size={18} /> Você autorizou o início. Aguardando
                profissional.
              </p>
            )}

            {!isActive && !professionalReadyToStart && isProfessional && (
              <Button
                onClick={handleProfessionalReady}
                size="lg"
                className="w-full joby-gradient text-primary-foreground gap-2"
              >
                <UserCheck size={20} /> Estou Pronto para Iniciar (Profissional)
              </Button>
            )}
            {!isActive && professionalReadyToStart && isProfessional && (
              <p className="text-green-600 flex items-center justify-center gap-2">
                <CheckCircle size={18} /> Você está pronto. Aguardando cliente
                ou início solo.
              </p>
            )}

            {isClient && !isActive && (
              <div className="flex items-center justify-center space-x-2 pt-2">
                <Switch
                  id="allowSoloStart"
                  checked={allowProfessionalSoloStart}
                  onCheckedChange={toggleAllowSoloStart}
                  disabled={isActive}
                />
                <Label
                  htmlFor="allowSoloStart"
                  className="text-xs text-muted-foreground"
                >
                  Permitir que o profissional inicie sozinho
                </Label>
              </div>
            )}

            {isActive ? (
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={handlePauseResume}
                  variant="outline"
                  size="lg"
                  className="flex-1 gap-2"
                >
                  {isPaused ? <Play size={20} /> : <Pause size={20} />}
                  {isPaused ? 'Retomar' : 'Pausar'}
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="lg"
                      className="flex-1 gap-2"
                    >
                      <StopCircle size={20} /> Finalizar
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Finalizar Serviço?</DialogTitle>
                      <DialogDescription>
                        Tem certeza que deseja finalizar o serviço? O tempo
                        total registrado é de{' '}
                        <strong>{formatTime(elapsedTime)}</strong>. O valor
                        calculado é{' '}
                        <strong>{formatCurrency(calculatedAmount)}</strong>.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline">Cancelar</Button>
                      <Button variant="destructive" onClick={handleStop}>
                        Confirmar Finalização
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            ) : (
              clientAuthorizedStart &&
              professionalReadyToStart &&
              jobDetails.status !== 'Concluído' && (
                <Button
                  onClick={handleStart}
                  size="lg"
                  className="w-full joby-gradient text-primary-foreground gap-2"
                >
                  <Play size={20} /> Iniciar Serviço
                </Button>
              )
            )}
          </div>

          {jobDetails.status === 'Concluído' && (
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-md text-sm text-green-700 flex items-center gap-2">
              <CheckCircle size={20} />
              <p>Serviço concluído! Tempo total: {formatTime(elapsedTime)}.</p>
            </div>
          )}

          <div className="mt-6 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md text-xs text-amber-700">
            <div className="flex items-start gap-2">
              <AlertTriangle size={28} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold mb-0.5">Regras do Cronômetro:</p>
                <ul className="list-disc list-inside pl-1">
                  <li>
                    {paymentType === 'hourly'
                      ? 'Pagamento calculado por tempo trabalhado'
                      : paymentType === 'daily'
                      ? 'Valor fixo da diária, cronômetro para controle'
                      : 'Valor fixo do evento, cronômetro para registro'}
                  </li>
                  <li>
                    Intervalo mínimo entre pausas:{' '}
                    {jobDetails.minimumPauseInterval} minutos
                  </li>
                  <li>Todas as ações são registradas para transparência</li>
                  <li>Em caso de divergência, utilize o suporte JOBY</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="text-center block">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {paymentType === 'hourly' &&
                `Taxa: ${formatCurrency(paymentRate)}/hora`}
              {paymentType === 'daily' &&
                `Diária: ${formatCurrency(paymentRate)}`}
              {paymentType === 'event' &&
                `Evento: ${formatCurrency(totalValue)}`}
            </p>
            {isActive && !isPaused && paymentType === 'hourly' && (
              <p className="text-sm text-primary font-semibold">
                Valor acumulado: {formatCurrency(currentEarnings)}
              </p>
            )}
            {jobDetails.status === 'Concluído' && (
              <p className="text-lg text-green-600 font-bold">
                Valor final: {formatCurrency(calculatedAmount)}
              </p>
            )}
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  )
}

export default WorkTimer
