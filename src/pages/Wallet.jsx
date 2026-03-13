import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
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
  ListChecks,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Info,
  ShieldCheck,
  Upload,
  RefreshCw,
} from 'lucide-react'
import JobyPageHeader from '@/components/JobyPageHeader'
import { tabsGrid5 } from '@/design/tabTokens'
import { supabase } from '@/lib/supabaseClient'
import PageSkeleton from '@/components/ui/PageSkeleton'
import ErrorState from '@/components/ui/ErrorState'
import EmptyState from '@/components/ui/EmptyState'
import PullToRefresh from '@/components/ui/PullToRefresh'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { createCheckoutSession } from '@/services/payments/paymentsBackend'

const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

const TOPUP_MIN_CENTS = 1_000 // R$ 10,00
const TOPUP_MAX_CENTS = 100_000 // R$ 1.000,00

const formatCurrencyFromCents = (cents) => {
  const n = Number(cents)
  const safeCents = Number.isFinite(n) ? n : 0
  return formatCurrency(safeCents / 100)
}

const normalizeWalletSummaryRow = (data) => {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') {
    return { available_cents: 0, held_cents: 0, currency: 'brl' }
  }
  const available = Number(row.available_cents)
  const held = Number(row.held_cents)
  const currency = String(row.currency || 'brl').trim().toLowerCase() || 'brl'
  return {
    available_cents: Number.isFinite(available) ? Math.trunc(available) : 0,
    held_cents: Number.isFinite(held) ? Math.trunc(held) : 0,
    currency,
  }
}

const parseBRLToCents = (input) => {
  const raw = String(input || '').trim()
  if (!raw) return null

  const cleaned = raw.replace(/[^\d.,]/g, '')
  if (!cleaned) return null

  let normalized = cleaned
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.')
  }

  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

const normalizeStatementEntry = (e) => {
  const id = String(e?.id || '').trim()
  const createdAt = e?.created_at ? new Date(e.created_at) : null
  const createdAtMs =
    createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.getTime() : 0
  const dateLabel = createdAtMs
    ? new Date(createdAtMs).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

  const direction = String(e?.direction || '').trim().toLowerCase()
  const amountCentsRaw = Number(e?.amount_cents)
  const amountCents = Number.isFinite(amountCentsRaw)
    ? Math.trunc(amountCentsRaw)
    : 0
  const signedCents =
    direction === 'debit' ? -Math.abs(amountCents) : Math.abs(amountCents)

  const purpose = String(e?.purpose || '').trim()
  const kind = String(e?.kind || '').trim()
  const bucket = String(e?.bucket || '').trim()

  let label = 'Movimentação'
  if (purpose === 'wallet_topup' || kind === 'wallet_topup_succeeded') {
    label = 'Adição de saldo'
  } else if (purpose === 'booking_payment' || kind.startsWith('booking_payment')) {
    if (kind === 'booking_payment_succeeded' && bucket === 'held') {
      label = 'Pagamento reservado'
    } else if (kind === 'booking_payment_released' && bucket === 'available') {
      label = 'Pagamento liberado'
    } else if (kind === 'booking_payment_released' && bucket === 'held') {
      label = 'Liberação de pagamento'
    } else {
      label = 'Pagamento'
    }
  } else if (kind) {
    label = kind.replace(/_/g, ' ')
  }

  let statusLabel = 'Concluído'
  if (bucket === 'held') statusLabel = 'Em uso'
  if (kind === 'booking_payment_succeeded') statusLabel = 'Reservado'
  if (kind === 'booking_payment_released' && bucket === 'available') statusLabel = 'Liberado'

  return {
    id: id || `${createdAtMs}-${purpose}-${kind}-${amountCents}`,
    createdAtMs,
    dateLabel,
    purpose,
    kind,
    bucket,
    direction,
    amount_cents: signedCents,
    currency: String(e?.currency || 'brl').trim().toLowerCase() || 'brl',
    booking_id: e?.booking_id ?? null,
    stripe_payment_intent_id: e?.stripe_payment_intent_id ?? null,
    label,
    statusLabel,
  }
}

const Wallet = () => {
  const { toast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const [summary, setSummary] = useState({
    available_cents: 0,
    held_cents: 0,
    currency: 'brl',
  })
  const [statement, setStatement] = useState([])

  const [inProgress, setInProgress] = useState([])
  const [inProgressError, setInProgressError] = useState('')

  const [activeTab, setActiveTab] = useState('all')

  const saldoDisponivelCents = summary.available_cents
  const saldoEmUsoCents = summary.held_cents
  const totalSaldoCents = saldoDisponivelCents + saldoEmUsoCents

  const [addBalanceOpen, setAddBalanceOpen] = useState(false)
  const [addBalanceValue, setAddBalanceValue] = useState('')
  const [creatingCheckout, setCreatingCheckout] = useState(false)

  const [statementOpen, setStatementOpen] = useState(false)

  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawValue, setWithdrawValue] = useState('')
  const [creatingWithdraw, setCreatingWithdraw] = useState(false)
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false)

  const [servicesExpanded, setServicesExpanded] = useState(false)
  const [activityExpanded, setActivityExpanded] = useState(true)

  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleOpenStatement = () => {
    setActiveTab('all')
    setStatementOpen(true)
  }

  const refreshWallet = useCallback(async () => {
    setErrorMessage('')
    setInProgressError('')

    const summaryReq = supabase.rpc('get_wallet_summary')
    const statementReq = supabase.rpc('get_wallet_statement', { p_limit: 50 })
    const inProgressReq = supabase.rpc('get_wallet_in_progress_services', {
      p_limit: 12,
    })

    const [summaryRes, statementRes] = await Promise.all([
      summaryReq,
      statementReq,
    ])

    const inProgressRes = await inProgressReq

    if (summaryRes?.error) throw summaryRes.error
    if (statementRes?.error) throw statementRes.error

    setSummary(normalizeWalletSummaryRow(summaryRes?.data))
    setStatement(Array.isArray(statementRes?.data) ? statementRes.data : [])

    if (inProgressRes?.error) {
      setInProgress([])
      setInProgressError(
        String(
          inProgressRes.error?.message ||
            'Falha ao carregar serviços em andamento.'
        )
      )
    } else {
      setInProgress(Array.isArray(inProgressRes?.data) ? inProgressRes.data : [])
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      try {
        await refreshWallet()
      } catch (err) {
        if (cancelled) return
        setErrorMessage(
          String(err?.message || 'Falha ao carregar dados da carteira.')
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [refreshWallet])

  const transactions = useMemo(() => {
    const arr = Array.isArray(statement) ? statement : []
    return arr
      .map(normalizeStatementEntry)
      .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0))
  }, [statement])

  const isAddition = useCallback((t) => t?.purpose === 'wallet_topup', [])
  const isPayment = useCallback((t) => t?.purpose === 'booking_payment', [])

  const transactionsByTab = useMemo(() => {
    if (activeTab === 'all') return transactions
    if (activeTab === 'additions') return transactions.filter(isAddition)
    if (activeTab === 'payments') return transactions.filter(isPayment)
    if (activeTab === 'withdrawals') return []
    if (activeTab === 'others') {
      return transactions.filter((t) => !isAddition(t) && !isPayment(t))
    }
    return transactions
  }, [activeTab, isAddition, isPayment, transactions])

  const recentTransactions = useMemo(() => {
    return transactions.slice(0, 5)
  }, [transactions])

  const inProgressByRole = useMemo(() => {
    const arr = Array.isArray(inProgress) ? inProgress : []
    const client = []
    const professional = []
    for (const row of arr) {
      const role = String(row?.role || '').trim().toLowerCase()
      if (role === 'client') client.push(row)
      else if (role === 'professional') professional.push(row)
    }
    return { client, professional }
  }, [inProgress])

  useEffect(() => {
    const params = new URLSearchParams(location.search || '')
    const topup = String(params.get('topup') || '').trim().toLowerCase()
    if (!topup) return

    setAddBalanceOpen(false)
    setAddBalanceValue('')

    if (topup === 'success') {
      toast({
        title: 'Pagamento recebido',
        description:
          'O saldo pode levar alguns instantes para aparecer após a confirmação do webhook.',
      })
    } else if (topup === 'cancel') {
      toast({
        title: 'Pagamento cancelado',
        description: 'Você pode tentar novamente quando quiser.',
        variant: 'destructive',
      })
    }

    void (async () => {
      try {
        await refreshWallet()
      } catch {
        // ignore
      }
    })()

    try {
      params.delete('topup')
      const nextSearch = params.toString()
      navigate(
        {
          pathname: location.pathname || '/wallet',
          search: nextSearch ? `?${nextSearch}` : '',
        },
        { replace: true }
      )
    } catch {
      // ignore
    }
  }, [location.pathname, location.search, navigate, refreshWallet, toast])

  const canSubmitTopup = useMemo(() => {
    const cents = parseBRLToCents(addBalanceValue)
    if (!Number.isFinite(cents) || !cents) return false
    return cents >= TOPUP_MIN_CENTS && cents <= TOPUP_MAX_CENTS
  }, [addBalanceValue])

  const handleCreateTopupCheckout = async () => {
    const cents = parseBRLToCents(addBalanceValue)
    if (!Number.isFinite(cents) || !cents) {
      toast({
        title: 'Valor inválido',
        description: 'Informe um valor válido.',
        variant: 'destructive',
      })
      return
    }
    if (cents < TOPUP_MIN_CENTS || cents > TOPUP_MAX_CENTS) {
      toast({
        title: 'Valor fora do limite',
        description: `O valor deve ser entre ${formatCurrencyFromCents(
          TOPUP_MIN_CENTS
        )} e ${formatCurrencyFromCents(TOPUP_MAX_CENTS)}.`,
        variant: 'destructive',
      })
      return
    }

    setCreatingCheckout(true)
    try {
      const res = await createCheckoutSession({
        amountCents: cents,
        currency: 'brl',
      })
      const url = String(res?.checkout_session?.url || '').trim()
      if (!url) throw new Error('Checkout não retornou uma URL válida.')
      window.location.assign(url)
    } catch (err) {
      toast({
        title: 'Não foi possível iniciar o pagamento',
        description: String(err?.message || 'Tente novamente em instantes.'),
        variant: 'destructive',
      })
    } finally {
      setCreatingCheckout(false)
    }
  }

  const canSubmitWithdraw = useMemo(() => {
    const cents = parseBRLToCents(withdrawValue)
    if (!Number.isFinite(cents) || !cents) return false
    if (cents <= 0) return false
    return cents <= saldoDisponivelCents
  }, [saldoDisponivelCents, withdrawValue])

  const withdrawConfirmCents = useMemo(() => parseBRLToCents(withdrawValue), [withdrawValue])
  const withdrawConfirmLabel = withdrawConfirmCents
    ? formatCurrencyFromCents(withdrawConfirmCents)
    : null

  const handleCreateWithdrawRequest = async () => {
    const cents = parseBRLToCents(withdrawValue)
    if (!Number.isFinite(cents) || !cents || cents <= 0) {
      toast({
        title: 'Valor inválido',
        description: 'Informe um valor válido para saque.',
        variant: 'destructive',
      })
      return
    }
    if (cents > saldoDisponivelCents) {
      toast({
        title: 'Saldo insuficiente',
        description: 'O valor do saque não pode ultrapassar o saldo disponível.',
        variant: 'destructive',
      })
      return
    }

    setCreatingWithdraw(true)
    try {
      const res = await supabase
        .from('withdraw_requests')
        .insert({ amount_cents: cents, currency: 'brl' })
      if (res?.error) throw res.error

      toast({
        title: 'Saque solicitado',
        description:
          'Sua solicitação foi registrada e será processada manualmente.',
      })
      setWithdrawOpen(false)
      setWithdrawValue('')
    } catch (err) {
      toast({
        title: 'Não foi possível solicitar o saque',
        description: String(err?.message || 'Tente novamente em instantes.'),
        variant: 'destructive',
      })
    } finally {
      setCreatingWithdraw(false)
    }
  }

  const renderTransactionsList = (items, emptyTitle, emptyMessage) => {
    if (!items || items.length === 0) {
      return <EmptyState title={emptyTitle} message={emptyMessage} />
    }

    return (
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
        {items.map((tx) => (
          <motion.div
            key={tx.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-between p-3 bg-card hover:bg-muted/50 rounded-lg border border-border/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              {tx.amount_cents >= 0 ? (
                <PlusCircle className="text-green-500" />
              ) : (
                <Upload className="text-red-500" />
              )}
              <div>
                <p className="font-medium text-sm text-foreground">{tx.label}</p>
                <p className="text-xs text-muted-foreground">
                  {tx.dateLabel} - {tx.statusLabel}
                </p>
              </div>
            </div>
            <div
              className={`text-sm font-semibold ${
                tx.amount_cents > 0 ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {formatCurrencyFromCents(tx.amount_cents)}
            </div>
          </motion.div>
        ))}
      </div>
    )
  }

  return (
    <TooltipProvider>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full pb-4"
      >
        <JobyPageHeader
          icon={
            <WalletIconLucide size={23} className="text-primary-foreground" />
          }
          title="Carteira e Pagamentos"
          subtitle="Gerencie seu saldo, pagamentos e histórico de transações"
        />

        <PullToRefresh
          onRefresh={async () => {
            setIsRefreshing(true)
            try {
              await refreshWallet()
            } catch (err) {
              toast({
                title: 'Falha ao atualizar',
                description: String(err?.message || 'Tente novamente.'),
                variant: 'destructive',
              })
            } finally {
              setIsRefreshing(false)
            }
          }}
          isRefreshing={isRefreshing}
        >
          {loading ? (
            <PageSkeleton title="Carregando carteira…" />
          ) : errorMessage ? (
            <ErrorState
              title="Não foi possível carregar sua carteira"
              message={errorMessage}
              onRetry={async () => {
                setLoading(true)
                setErrorMessage('')
                try {
                  await refreshWallet()
                } catch (err) {
                  setErrorMessage(
                    String(err?.message || 'Falha ao carregar dados da carteira.')
                  )
                } finally {
                  setLoading(false)
                }
              }}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Card className="md:col-span-3 shadow-lg border-border/50 bg-gradient-to-br from-primary/5 via-card to-card">
                  <CardHeader>
                    <CardTitle className="text-xl">Resumo de Saldo</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">💰 Saldo Disponível</span>
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
                        {formatCurrencyFromCents(saldoDisponivelCents)}
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
                        {formatCurrencyFromCents(saldoEmUsoCents)}
                      </span>
                    </div>
                    <hr className="my-2 border-border/70" />
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-semibold">
                        🧮 Total em Carteira
                      </span>
                      <span className="text-2xl font-bold text-primary">
                        {formatCurrencyFromCents(totalSaldoCents)}
                      </span>
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-border/50">
                    <Button
                      onClick={() => setAddBalanceOpen(true)}
                      className="joby-gradient text-primary-foreground flex-1 gap-2"
                      disabled={creatingCheckout}
                    >
                      {creatingCheckout ? (
                        <RefreshCw size={18} className="animate-spin" />
                      ) : (
                        <PlusCircle size={18} />
                      )}{' '}
                      Adicionar Saldo
                    </Button>
                    <Button
                      onClick={() => setWithdrawOpen(true)}
                      variant="outline"
                      className="flex-1 gap-2"
                      disabled={saldoDisponivelCents <= 0}
                    >
                      <Upload size={18} /> Solicitar Saque
                    </Button>
                    <Button
                      onClick={handleOpenStatement}
                      variant="outline"
                      className="flex-1 gap-2"
                    >
                      <ListChecks size={18} /> Ver Extrato Completo
                    </Button>
                  </CardFooter>
                </Card>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <Card className="shadow-lg border-border/50">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setServicesExpanded((prev) => !prev)}
                      aria-expanded={servicesExpanded}
                    >
                      <CardHeader className="flex flex-row items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="mt-0.5 h-9 w-9 rounded-xl bg-primary/10 border border-border/50 flex items-center justify-center shrink-0">
                            <ListChecks className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-xl">Serviços em andamento</CardTitle>
                            <CardDescription>
                              Valores em uso (reservados) e serviços ativos.
                            </CardDescription>
                          </div>
                        </div>

                        {servicesExpanded ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                        )}
                      </CardHeader>
                    </button>

                    <AnimatePresence initial={false}>
                      {servicesExpanded ? (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <CardContent className="space-y-4 pt-0">
                            {inProgressError ? (
                              <div className="text-sm text-muted-foreground">
                                {inProgressError}
                              </div>
                            ) : null}

                            <div className="space-y-2">
                              <p className="text-sm font-semibold">Como cliente</p>
                              {inProgressByRole.client.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  Nenhum serviço em andamento como cliente.
                                </p>
                              ) : (
                                <div className="space-y-3">
                                  {inProgressByRole.client.map((row) => {
                                    const date = row?.updated_at
                                      ? new Date(row.updated_at)
                                      : null
                                    const dateLabel =
                                      date && !Number.isNaN(date.getTime())
                                        ? date.toLocaleString('pt-BR', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })
                                        : '—'
                                    return (
                                      <div
                                        key={`${row.booking_id}-${row.role}`}
                                        className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-card"
                                      >
                                        <div>
                                          <p className="text-sm font-medium">
                                            {row?.service_title || 'Serviço'}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            Profissional:{' '}
                                            {row?.counterparty_name || '—'} •{' '}
                                            {dateLabel}
                                          </p>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-sm font-semibold text-yellow-500">
                                            {formatCurrencyFromCents(row?.amount_cents)}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            Reservado
                                          </p>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>

                            <div className="space-y-2">
                              <p className="text-sm font-semibold">Como profissional</p>
                              {inProgressByRole.professional.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  Nenhum serviço em andamento como profissional.
                                </p>
                              ) : (
                                <div className="space-y-3">
                                  {inProgressByRole.professional.map((row) => {
                                    const date = row?.updated_at
                                      ? new Date(row.updated_at)
                                      : null
                                    const dateLabel =
                                      date && !Number.isNaN(date.getTime())
                                        ? date.toLocaleString('pt-BR', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })
                                        : '—'
                                    return (
                                      <div
                                        key={`${row.booking_id}-${row.role}`}
                                        className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-card"
                                      >
                                        <div>
                                          <p className="text-sm font-medium">
                                            {row?.service_title || 'Serviço'}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            Cliente: {row?.counterparty_name || '—'} •{' '}
                                            {dateLabel}
                                          </p>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-sm font-semibold text-yellow-500">
                                            {formatCurrencyFromCents(row?.amount_cents)}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            A receber
                                          </p>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </Card>

                  <Card className="shadow-lg border-border/50">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setActivityExpanded((prev) => !prev)}
                      aria-expanded={activityExpanded}
                    >
                      <CardHeader className="flex flex-row items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="mt-0.5 h-9 w-9 rounded-xl bg-primary/10 border border-border/50 flex items-center justify-center shrink-0">
                            <WalletIconLucide className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-xl">Atividade recente</CardTitle>
                            <CardDescription>
                              Últimas movimentações da sua carteira.
                            </CardDescription>
                          </div>
                        </div>

                        {activityExpanded ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                        )}
                      </CardHeader>
                    </button>

                    <AnimatePresence initial={false}>
                      {activityExpanded ? (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <CardContent className="pt-0">
                            {renderTransactionsList(
                              recentTransactions,
                              'Nenhuma movimentação encontrada',
                              'Quando você adicionar saldo ou receber pagamentos, suas movimentações aparecem aqui.'
                            )}
                          </CardContent>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </Card>
                </div>

                <div className="lg:col-span-1 space-y-6">
                  <Card className="shadow-md border-border/50">
                    <CardHeader>
                      <CardTitle className="text-lg">Métodos de pagamento</CardTitle>
                      <CardDescription>
                        Nesta fase, o saldo é adicionado via Checkout da Stripe.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-center space-x-3 p-4 border border-dashed rounded-md bg-muted/30">
                        <CreditCard size={24} className="text-muted-foreground" />
                      </div>
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => setAddBalanceOpen(true)}
                      >
                        <PlusCircle size={18} /> Adicionar saldo
                      </Button>
                      <p className="text-xs text-muted-foreground p-2 bg-primary/5 rounded-md border border-primary/20">
                        <Info size={14} className="inline mr-1 mb-0.5 text-primary" />
                        Não salvamos cartões no app nesta fase.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="shadow-md border-border/50">
                    <CardHeader>
                      <CardTitle className="text-lg">Como funciona</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-muted-foreground">
                      <p>
                        <span className="font-semibold text-foreground">Saldo disponível</span>{' '}
                        é o valor que você pode sacar.
                      </p>
                      <p>
                        <span className="font-semibold text-foreground">Saldo em uso</span>{' '}
                        é o valor reservado para serviços em andamento.
                      </p>
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
            </>
          )}
        </PullToRefresh>
      </motion.div>

      <Dialog
        open={addBalanceOpen}
        onOpenChange={(open) => {
          setAddBalanceOpen(open)
          if (!open) setAddBalanceValue('')
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar saldo</DialogTitle>
            <DialogDescription>
              Informe o valor entre {formatCurrencyFromCents(TOPUP_MIN_CENTS)} e{' '}
              {formatCurrencyFromCents(TOPUP_MAX_CENTS)}. O saldo só aparece após a
              confirmação do webhook da Stripe.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="topup_amount">Valor</Label>
            <Input
              id="topup_amount"
              placeholder="Ex: 25,00"
              value={addBalanceValue}
              onChange={(e) => setAddBalanceValue(e.target.value)}
              inputMode="decimal"
              disabled={creatingCheckout}
            />
            <p className="text-xs text-muted-foreground">
              Mínimo {formatCurrencyFromCents(TOPUP_MIN_CENTS)} • Máximo{' '}
              {formatCurrencyFromCents(TOPUP_MAX_CENTS)}
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddBalanceOpen(false)}
              disabled={creatingCheckout}
            >
              Cancelar
            </Button>
            <Button
              className="joby-gradient text-primary-foreground"
              onClick={handleCreateTopupCheckout}
              disabled={!canSubmitTopup || creatingCheckout}
            >
              {creatingCheckout ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : null}{' '}
              Ir para pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statementOpen} onOpenChange={setStatementOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>Extrato</DialogTitle>
            <DialogDescription>
              Veja todas as movimentações registradas na sua carteira.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={`${tabsGrid5} mb-4`}>
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="additions">📥 Adições</TabsTrigger>
              <TabsTrigger value="withdrawals" disabled>
                📤 Saques
              </TabsTrigger>
              <TabsTrigger value="payments">✅ Pagamentos</TabsTrigger>
              <TabsTrigger value="others">Outras</TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              {renderTransactionsList(
                transactionsByTab,
                'Nenhuma movimentação encontrada',
                'Quando você adicionar saldo ou receber pagamentos, suas movimentações aparecem aqui.'
              )}
            </TabsContent>
            <TabsContent value="additions">
              {renderTransactionsList(
                transactionsByTab,
                'Sem adições',
                'Nenhuma adição de saldo encontrada.'
              )}
            </TabsContent>
            <TabsContent value="payments">
              {renderTransactionsList(
                transactionsByTab,
                'Sem pagamentos',
                'Nenhum pagamento encontrado.'
              )}
            </TabsContent>
            <TabsContent value="others">
              {renderTransactionsList(
                transactionsByTab,
                'Sem outras movimentações',
                'Nenhuma movimentação encontrada.'
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStatementOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={withdrawOpen}
        onOpenChange={(open) => {
          setWithdrawOpen(open)
          if (!open) {
            setWithdrawValue('')
            setWithdrawConfirmOpen(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar saque</DialogTitle>
            <DialogDescription>
              Saques são registrados no sistema e processados manualmente nesta fase.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="withdraw_amount">Valor</Label>
            <Input
              id="withdraw_amount"
              placeholder="Ex: 50,00"
              value={withdrawValue}
              onChange={(e) => setWithdrawValue(e.target.value)}
              inputMode="decimal"
              disabled={creatingWithdraw}
            />
            <p className="text-xs text-muted-foreground">
              Disponível para saque: {formatCurrencyFromCents(saldoDisponivelCents)}
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWithdrawOpen(false)}
              disabled={creatingWithdraw}
            >
              Cancelar
            </Button>
            <Button
              className="joby-gradient text-primary-foreground"
              onClick={() => setWithdrawConfirmOpen(true)}
              disabled={!canSubmitWithdraw || creatingWithdraw}
            >
              {creatingWithdraw ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : null}{' '}
              Solicitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={withdrawConfirmOpen} onOpenChange={setWithdrawConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar solicitação de saque?</AlertDialogTitle>
            <AlertDialogDescription>
              <div>
                Você está prestes a registrar um saque
                {withdrawConfirmLabel ? ` de ${withdrawConfirmLabel}` : ''}.
              </div>
              <div className="mt-2">
                Essa ação cria uma solicitação no sistema e será processada manualmente nesta fase.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creatingWithdraw}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={creatingWithdraw}
              onClick={(e) => {
                if (!canSubmitWithdraw || creatingWithdraw) {
                  e.preventDefault()
                  return
                }
                handleCreateWithdrawRequest()
              }}
            >
              Confirmar saque
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}

export default Wallet
