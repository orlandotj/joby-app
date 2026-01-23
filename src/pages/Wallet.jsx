import React, { useState } from 'react'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Wallet as WalletIconLucide,
  PlusCircle,
  MinusCircle,
  ListChecks,
  CreditCard,
  Banknote,
  Info,
  ShieldCheck,
  AlertTriangle,
  Download,
  Upload,
  CheckCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react'

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

const Wallet = () => {
  const { toast } = useToast()
  const [saldoDisponivel] = useState(0)
  const [saldoEmUso] = useState(0)
  const [activeTab, setActiveTab] = useState('history')

  const totalSaldo = saldoDisponivel + saldoEmUso

  const mockTransactions = [
    {
      id: 't1',
      type: 'Adição',
      method: 'PIX',
      amount: 200.0,
      date: '2025-05-28',
      status: 'Concluído',
      icon: <PlusCircle className="text-green-500" />,
    },
    {
      id: 't2',
      type: 'Pagamento',
      service: 'Pintura Quarto',
      amount: -75.0,
      date: '2025-05-27',
      status: 'Concluído',
      icon: <CheckCircle className="text-blue-500" />,
    },
    {
      id: 't3',
      type: 'Saque',
      method: 'Transferência Bancária',
      amount: -100.0,
      date: '2025-05-26',
      status: 'Pendente',
      icon: <RefreshCw className="text-yellow-500 animate-spin" />,
    },
    {
      id: 't4',
      type: 'Adição',
      method: 'Cartão de Crédito',
      amount: 50.0,
      date: '2025-05-25',
      status: 'Concluído',
      icon: <PlusCircle className="text-green-500" />,
    },
    {
      id: 't5',
      type: 'Cancelamento',
      service: 'Limpeza Escritório',
      amount: 30.0,
      date: '2025-05-24',
      status: 'Reembolsado',
      icon: <XCircle className="text-red-500" />,
    },
  ]

  const handleAddBalance = () => {
    toast({
      title: 'Adicionar Saldo',
      description: 'Funcionalidade de adicionar saldo em desenvolvimento.',
    })
  }

  const handleWithdrawBalance = () => {
    toast({
      title: 'Sacar Saldo',
      description: 'Funcionalidade de sacar saldo em desenvolvimento.',
    })
  }

  const handleViewStatement = () => {
    toast({
      title: 'Ver Extrato',
      description: 'Funcionalidade de extrato completo em desenvolvimento.',
    })
  }

  return (
    <TooltipProvider>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="container mx-auto py-4 px-2 sm:px-4 max-w-4xl"
      >
        <header className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <WalletIconLucide size={32} className="text-primary" />
            <h1 className="text-3xl font-bold text-foreground">
              Carteira & Pagamentos
            </h1>
          </div>
          <p className="text-muted-foreground">
            Gerencie seu saldo, métodos de pagamento e histórico de transações.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Saldo Section */}
          <Card className="md:col-span-3 shadow-lg border-border/50 bg-gradient-to-br from-primary/5 via-card to-card">
            <CardHeader>
              <CardTitle className="text-xl">Resumo de Saldo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">
                    💰 Saldo Disponível
                  </span>
                  <Tooltip delayDuration={100}>
                    <TooltipTrigger asChild>
                      <Info
                        size={14}
                        className="cursor-help text-muted-foreground/70"
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Valor que você pode usar para contratar serviços.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-2xl font-bold text-green-500">
                  {formatCurrency(saldoDisponivel)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">🔒 Saldo em Uso</span>
                  <Tooltip delayDuration={100}>
                    <TooltipTrigger asChild>
                      <Info
                        size={14}
                        className="cursor-help text-muted-foreground/70"
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Valor reservado para serviços em andamento.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-lg font-medium text-yellow-500">
                  {formatCurrency(saldoEmUso)}
                </span>
              </div>
              <hr className="my-2 border-border/70" />
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold">
                  🧮 Total em Carteira
                </span>
                <span className="text-2xl font-bold text-primary">
                  {formatCurrency(totalSaldo)}
                </span>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-border/50">
              <Button
                onClick={handleAddBalance}
                className="joby-gradient text-primary-foreground flex-1 gap-2"
              >
                <PlusCircle size={18} /> Adicionar Saldo
              </Button>
              <Button
                onClick={handleWithdrawBalance}
                variant="outline"
                className="flex-1 gap-2"
              >
                <Upload size={18} /> Sacar Saldo
              </Button>
              <Button
                onClick={handleViewStatement}
                variant="outline"
                className="flex-1 gap-2"
              >
                <ListChecks size={18} /> Ver Extrato Completo
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Payment Methods & Instructions */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="shadow-md border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">Métodos de Pagamento</CardTitle>
                <CardDescription>
                  Adicione e gerencie seus cartões e contas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-center space-x-3 p-4 border border-dashed rounded-md bg-muted/30">
                  <CreditCard size={24} className="text-blue-500" />
                  <Banknote size={24} className="text-green-500" />
                  {/* Add more icons for other payment methods */}
                </div>
                <Button variant="outline" className="w-full gap-2">
                  <PlusCircle size={18} /> Adicionar Forma de Pagamento
                </Button>
                <p className="text-xs text-muted-foreground p-2 bg-primary/5 rounded-md border border-primary/20">
                  <Info size={14} className="inline mr-1 mb-0.5 text-primary" />
                  Escolha seu método preferido para adicionar saldo.
                  Recomendamos manter saldo para contratações imediatas.
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-md border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">
                  Saldo Mínimo para Contratar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-md">
                  <AlertTriangle
                    size={16}
                    className="inline mr-1.5 mb-0.5 text-amber-600"
                  />
                  <span className="font-medium">Atenção:</span> Você só poderá
                  contratar se tiver o valor mínimo na carteira. O valor será
                  bloqueado até a conclusão do serviço.
                </div>
                <ul className="list-disc list-inside text-muted-foreground space-y-1 pl-1">
                  <li>
                    <span className="font-medium">Por Hora:</span> Mínimo de 1
                    hora de saldo.
                  </li>
                  <li>
                    <span className="font-medium">Por Diária:</span> Valor fixo
                    da diária.
                  </li>
                  <li>
                    <span className="font-medium">Por Evento:</span> Valor total
                    do agendamento.
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="shadow-md border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">
                  Instruções Importantes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  📌{' '}
                  <span className="font-semibold text-foreground">
                    Saldo obrigatório:
                  </span>{' '}
                  O JOBY trabalha com pagamentos antecipados. Mantenha saldo
                  suficiente.
                </p>
                <p>
                  🔐{' '}
                  <span className="font-semibold text-foreground">
                    Segurança garantida:
                  </span>{' '}
                  Seu saldo é protegido. Em caso de problema, use o sistema de
                  disputa.
                </p>
                <p>
                  📆{' '}
                  <span className="font-semibold text-foreground">
                    Agendamentos futuros:
                  </span>{' '}
                  O saldo será reservado no momento do agendamento.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Transaction History */}
          <div className="lg:col-span-2">
            <Card className="shadow-lg border-border/50 min-h-[400px]">
              <CardHeader>
                <CardTitle className="text-xl">
                  Histórico de Transações Recentes
                </CardTitle>
                <CardDescription>
                  Acompanhe suas últimas movimentações.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-5 gap-2 mb-4">
                    <TabsTrigger value="all">Todas</TabsTrigger>
                    <TabsTrigger value="additions">📥 Adições</TabsTrigger>
                    <TabsTrigger value="withdrawals">📤 Saques</TabsTrigger>
                    <TabsTrigger value="payments">✅ Pagamentos</TabsTrigger>
                    <TabsTrigger value="others">Outras</TabsTrigger>
                  </TabsList>
                  <TabsContent value="all">
                    {mockTransactions.length > 0 ? (
                      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                        {mockTransactions.map((tx) => (
                          <motion.div
                            key={tx.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3 }}
                            className="flex items-center justify-between p-3 bg-card hover:bg-muted/50 rounded-lg border border-border/30 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              {tx.icon}
                              <div>
                                <p className="font-medium text-sm text-foreground">
                                  {tx.type}{' '}
                                  {tx.method
                                    ? `(${tx.method})`
                                    : tx.service
                                    ? `(${tx.service})`
                                    : ''}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {tx.date} - {tx.status}
                                </p>
                              </div>
                            </div>
                            <div
                              className={`text-sm font-semibold ${
                                tx.amount > 0
                                  ? 'text-green-500'
                                  : 'text-red-500'
                              }`}
                            >
                              {formatCurrency(tx.amount)}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-8">
                        Nenhuma transação encontrada.
                      </p>
                    )}
                  </TabsContent>
                  {/* Implement other TabsContent similarly, filtering mockTransactions */}
                  <TabsContent value="additions">
                    <p className="text-center text-muted-foreground py-8">
                      Filtro de Adições em breve.
                    </p>
                  </TabsContent>
                  <TabsContent value="withdrawals">
                    <p className="text-center text-muted-foreground py-8">
                      Filtro de Saques em breve.
                    </p>
                  </TabsContent>
                  <TabsContent value="payments">
                    <p className="text-center text-muted-foreground py-8">
                      Filtro de Pagamentos em breve.
                    </p>
                  </TabsContent>
                  <TabsContent value="others">
                    <p className="text-center text-muted-foreground py-8">
                      Filtro de Outras transações em breve.
                    </p>
                  </TabsContent>
                </Tabs>
                <Button variant="link" className="mt-4 w-full text-primary">
                  Ver histórico completo
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="mt-8 shadow-md border-border/50">
          <CardFooter className="p-4">
            <div className="flex items-center text-xs text-muted-foreground">
              <ShieldCheck size={16} className="text-green-500 mr-2" />
              <span>
                Todas as transações são seguras e criptografadas. O JOBY utiliza
                parceiros de pagamento confiáveis.
              </span>
            </div>
          </CardFooter>
        </Card>
      </motion.div>
    </TooltipProvider>
  )
}

export default Wallet
