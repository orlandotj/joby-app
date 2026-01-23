import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CreditCard,
  CheckCircle,
  Loader2,
  Copy,
  QrCode,
  Info,
  ShieldCheck,
  ShoppingCart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { useAuth } from '@/contexts/AuthContext'

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

const Payment = () => {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast } = useToast()

  const handleBack = () => {
    const idx = window.history.state?.idx
    const canGoBack =
      typeof idx === 'number' ? idx > 0 : window.history.length > 1
    if (canGoBack) navigate(-1)
    else navigate('/work-requests', { replace: true })
  }

  const [jobDetails, setJobDetails] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('pix')
  const [isLoading, setIsLoading] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [appFeePercentage] = useState(0.1) // 10%

  // Credit Card State
  const [cardName, setCardName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')

  useEffect(() => {
    // Mock fetching job details and calculated hours from WorkTimer
    setTimeout(() => {
      const mockWorkedHours = 3.5 // Example, would come from WorkTimer state or backend
      const mockProfessionalPricePerHour = 100
      const subtotal = mockWorkedHours * mockProfessionalPricePerHour
      const appFee = subtotal * appFeePercentage
      const totalAmount = subtotal + appFee

      setJobDetails({
        id: jobId,
        professionalName: 'Carlos Silva', // Mocked data
        workedHours: mockWorkedHours,
        pricePerHour: mockProfessionalPricePerHour,
        subtotal: subtotal,
        appFee: appFee,
        totalAmount: totalAmount,
      })
    }, 500)
  }, [jobId, appFeePercentage])

  const handlePayment = async (e) => {
    e.preventDefault()
    setIsLoading(true)

    // Simulate payment processing
    setTimeout(() => {
      setIsLoading(false)
      if (paymentMethod === 'pix') {
        // Simulate PIX payment success after some time (e.g., user scans QR code)
        toast({
          title: 'Aguardando pagamento PIX',
          description: 'Copie o código ou escaneie o QR Code para pagar.',
        })
        // For demo, automatically confirm after a few seconds
        setTimeout(() => {
          setPaymentSuccess(true)
          toast({
            title: 'Pagamento PIX Confirmado!',
            description: 'Obrigado por usar o JOBY.',
            className: 'bg-green-500 text-white',
          })
        }, 7000)
      } else if (paymentMethod === 'credit_card') {
        if (!cardName || !cardNumber || !cardExpiry || !cardCvv) {
          toast({
            title: 'Erro no Formulário',
            description: 'Por favor, preencha todos os campos do cartão.',
            variant: 'destructive',
          })
          return
        }
        // Simulate card payment success
        setPaymentSuccess(true)
        toast({
          title: 'Pagamento Confirmado!',
          description: 'Obrigado por usar o JOBY.',
          className: 'bg-green-500 text-white',
        })
      }
    }, 2000)
  }

  const handleCopyPixCode = () => {
    navigator.clipboard.writeText(
      '00020126330014BR.GOV.BCB.PIX01111234567890905204000053039865802BR5913CARLOS DA SILVA6009SAO PAULO62070503***6304E2B3'
    )
    toast({
      title: 'Código PIX Copiado!',
      description: 'Cole o código no seu app de banco para pagar.',
    })
  }

  if (!jobDetails) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin h-12 w-12 text-primary" />
      </div>
    )
  }

  if (paymentSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center justify-center text-center p-6 min-h-[60vh]"
      >
        <CheckCircle className="w-24 h-24 text-green-500 mb-6" />
        <h1 className="text-3xl font-bold text-foreground mb-3">
          Pagamento Confirmado!
        </h1>
        <p className="text-muted-foreground mb-8 max-w-md">
          Obrigado por usar o JOBY. Seu pagamento foi processado com sucesso. Um
          recibo foi enviado para seu e-mail e está disponível em "Meus
          Serviços".
        </p>
        <Button
          onClick={() => navigate('/')}
          className="joby-gradient text-primary-foreground"
        >
          Voltar para o Início
        </Button>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-2xl mx-auto"
    >
      <Card className="shadow-xl border-border/50">
        <CardHeader className="bg-gradient-to-r from-primary to-trust-blue text-primary-foreground p-6 rounded-t-lg">
          <div className="flex items-center gap-3">
            <CreditCard size={32} />
            <CardTitle className="text-2xl">Pagamento do Serviço</CardTitle>
          </div>
          <CardDescription className="text-primary-foreground/80 mt-1">
            Finalize o pagamento para o serviço prestado por{' '}
            {jobDetails.professionalName}.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <Card className="bg-muted/30 dark:bg-muted/10">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShoppingCart size={20} className="text-primary" /> Resumo do
                Serviço
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Profissional:</span>
                <span className="font-medium">
                  {jobDetails.professionalName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Horas Trabalhadas:
                </span>
                <span className="font-medium">
                  {jobDetails.workedHours.toFixed(2)}h
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor por Hora:</span>
                <span className="font-medium">
                  {formatCurrency(jobDetails.pricePerHour)}
                </span>
              </div>
              <hr className="my-1 border-border/50" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-medium">
                  {formatCurrency(jobDetails.subtotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Taxa do Aplicativo ({appFeePercentage * 100}%):
                </span>
                <span className="font-medium">
                  {formatCurrency(jobDetails.appFee)}
                </span>
              </div>
              <hr className="my-2 border-border/50" />
              <div className="flex justify-between text-xl font-bold text-primary">
                <span>Valor Final a Pagar:</span>
                <span>{formatCurrency(jobDetails.totalAmount)}</span>
              </div>
            </CardContent>
          </Card>

          <Tabs
            value={paymentMethod}
            onValueChange={setPaymentMethod}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 gap-2">
              <TabsTrigger value="pix" className="gap-2">
                <QrCode size={18} /> PIX
              </TabsTrigger>
              <TabsTrigger value="credit_card" className="gap-2">
                <CreditCard size={18} /> Cartão de Crédito
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pix" className="mt-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center space-y-4 p-4 border border-dashed border-border/70 rounded-lg bg-muted/20"
              >
                <img
                  alt="QR Code para pagamento PIX"
                  className="mx-auto w-48 h-48 bg-white p-2 rounded-md shadow-md"
                  src="https://images.unsplash.com/photo-1595079676339-1534801ad6cf"
                />
                <p className="text-sm text-muted-foreground">
                  Escaneie o QR Code com o app do seu banco.
                </p>
                <Button
                  onClick={handleCopyPixCode}
                  variant="outline"
                  className="w-full gap-2"
                >
                  <Copy size={16} /> Copiar Código PIX
                </Button>
                <p className="text-xs text-muted-foreground">
                  <code>
                    00020126330014BR.GOV.BCB.PIX01111234567890905204000053039865802BR5913CARLOS
                    DA SILVA6009SAO PAULO62070503***6304E2B3
                  </code>
                </p>
                <div className="flex items-center justify-center text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 p-2 rounded-md">
                  <Info size={14} className="mr-1.5" />A confirmação do
                  pagamento PIX pode levar alguns instantes.
                </div>
              </motion.div>
            </TabsContent>

            <TabsContent value="credit_card" className="mt-6">
              <motion.form
                onSubmit={handlePayment}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <div>
                  <Label htmlFor="cardName">Nome no Cartão</Label>
                  <Input
                    id="cardName"
                    placeholder="Como está no cartão"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    required
                    className="bg-background/50"
                  />
                </div>
                <div>
                  <Label htmlFor="cardNumber">Número do Cartão</Label>
                  <Input
                    id="cardNumber"
                    placeholder="0000 0000 0000 0000"
                    value={cardNumber}
                    onChange={(e) =>
                      setCardNumber(
                        e.target.value
                          .replace(/\D/g, '')
                          .replace(/(\d{4})(?=\d)/g, '$1 ')
                          .trim()
                          .slice(0, 19)
                      )
                    }
                    required
                    className="bg-background/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cardExpiry">Validade (MM/AA)</Label>
                    <Input
                      id="cardExpiry"
                      placeholder="MM/AA"
                      value={cardExpiry}
                      onChange={(e) =>
                        setCardExpiry(
                          e.target.value
                            .replace(/\D/g, '')
                            .replace(/(\d{2})(?=\d)/g, '$1/')
                            .slice(0, 5)
                        )
                      }
                      required
                      className="bg-background/50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cardCvv">CVV</Label>
                    <Input
                      id="cardCvv"
                      placeholder="123"
                      value={cardCvv}
                      onChange={(e) =>
                        setCardCvv(
                          e.target.value.replace(/\D/g, '').slice(0, 3)
                        )
                      }
                      required
                      className="bg-background/50"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full joby-gradient text-primary-foreground gap-2"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <CreditCard size={18} />
                  )}
                  Pagar {formatCurrency(jobDetails.totalAmount)} com Cartão
                </Button>
              </motion.form>
            </TabsContent>
          </Tabs>

          {paymentMethod === 'pix' && !isLoading && (
            <Button
              onClick={handlePayment}
              className="w-full mt-4 joby-gradient text-primary-foreground gap-2"
            >
              Já realizei o pagamento PIX
            </Button>
          )}
        </CardContent>
        <CardFooter className="p-6 border-t border-border/50">
          <div className="flex items-center text-sm text-muted-foreground">
            <ShieldCheck size={18} className="text-green-500 mr-2" />
            <span>
              Pagamento seguro e processado via parceiros confiáveis. Seus dados
              estão protegidos.
            </span>
          </div>
        </CardFooter>
      </Card>

      <div className="mt-6 text-center">
        <Button variant="outline" onClick={handleBack}>
          Voltar
        </Button>
      </div>
    </motion.div>
  )
}

export default Payment
