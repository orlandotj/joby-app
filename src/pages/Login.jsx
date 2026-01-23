import React, { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Briefcase, AlertCircle, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { supabase } from '@/lib/supabaseClient'

const Login = () => {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorInfo, setErrorInfo] = useState(null)
  const [failCount, setFailCount] = useState(0)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [, setCooldownTick] = useState(0)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSending, setResetSending] = useState(false)
  const { login, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const isEmailLike = useMemo(() => {
    const v = String(identifier ?? '').trim()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  }, [identifier])

  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))

  useEffect(() => {
    if (cooldownSeconds <= 0) return
    const id = setInterval(() => setCooldownTick((t) => t + 1), 250)
    return () => clearInterval(id)
  }, [cooldownSeconds])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorInfo(null)

    if (cooldownSeconds > 0) return

    const result = await login(identifier, password)

    // Se falhou e é erro de conta não encontrada, mostrar sugestão
    if (!result.success) {
      setFailCount((c) => {
        const next = c + 1
        const backoff = [0, 2, 5, 10, 20, 30][Math.min(next, 5)]
        if (backoff > 0) setCooldownUntil(Date.now() + backoff * 1000)
        return next
      })

      if (
        result.errorType === 'Conta não encontrada' ||
        result.errorType === 'Credenciais inválidas'
      ) {
        setErrorInfo({
          type: result.errorType,
          message: result.error,
          showCreateAccount: result.errorType === 'Conta não encontrada' && isEmailLike,
        })
      }
    } else {
      setFailCount(0)
      setCooldownUntil(0)
    }
  }

  const openReset = () => {
    try {
      const raw = String(identifier ?? '').trim()
      const candidate = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : ''
      setResetEmail(candidate)
    } catch {
      setResetEmail('')
    }
    setResetOpen(true)
  }

  const handleSendReset = async (e) => {
    e?.preventDefault?.()
    const email = String(resetEmail ?? '').trim()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({
        variant: 'destructive',
        title: 'Email inválido',
        description: 'Informe um email válido para recuperar sua senha.',
      })
      return
    }

    setResetSending(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) throw error

      // Mensagem neutra (boa prática): não confirma se o email existe.
      toast({
        title: 'Email enviado',
        description:
          'Se o email existir, você receberá um link para redefinir sua senha.',
      })
      setResetOpen(false)
    } catch (err) {
      const msg = String(err?.message || err)
      toast({
        variant: 'destructive',
        title: 'Não foi possível enviar',
        description: msg,
      })
    } finally {
      setResetSending(false)
    }
  }

  if (isAuthenticated) {
    return <Navigate to="/" />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: 'spring',
              stiffness: 260,
              damping: 20,
              delay: 0.2,
            }}
            className="w-16 h-16 rounded-full joby-gradient flex items-center justify-center mb-4 shadow-lg"
          >
            <Briefcase size={32} className="text-primary-foreground" />
          </motion.div>
          <h1 className="text-3xl font-bold text-foreground">JOBY</h1>
          <p className="text-muted-foreground mt-1">
            Conectando profissionais e clientes
          </p>
        </div>

        <div className="bg-card border border-border/50 rounded-xl shadow-2xl p-6 sm:p-8">
          <h2 className="text-xl font-semibold mb-6 text-center text-foreground">
            Entrar na sua conta
          </h2>

          {/* Alert de erro com sugestão */}
          {errorInfo && errorInfo.showCreateAccount && (
            <Alert className="mb-4 border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900">
              <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <AlertTitle className="text-orange-800 dark:text-orange-300">
                Conta não encontrada
              </AlertTitle>
              <AlertDescription className="text-orange-700 dark:text-orange-400">
                Não existe uma conta com o email <strong>{identifier}</strong>.
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-900/30"
                  onClick={() => navigate('/register', { state: { email: identifier } })}
                >
                  <UserPlus size={16} className="mr-2" />
                  Criar conta agora
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">Nome de usuário ou e-mail</Label>
                <Input
                  id="identifier"
                  type="text"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="Digite seu nome de usuário ou e-mail"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  className="bg-background/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-background/50"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={loading || cooldownSeconds > 0}
              >
                {loading
                  ? 'Entrando...'
                  : cooldownSeconds > 0
                  ? `Aguarde ${cooldownSeconds}s`
                  : 'Entrar'}
              </Button>
            </div>
          </form>

          <div className="mt-6 text-center text-sm space-y-3">
            <Dialog open={resetOpen} onOpenChange={setResetOpen}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  onClick={openReset}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Esqueceu sua senha?
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Recuperar senha</DialogTitle>
                  <DialogDescription>
                    Informe seu email e enviaremos um link de redefinição.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSendReset} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="resetEmail">Email</Label>
                    <Input
                      id="resetEmail"
                      type="email"
                      placeholder="seu@email.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                    />
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setResetOpen(false)}
                      disabled={resetSending}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={resetSending}>
                      {resetSending ? 'Enviando...' : 'Enviar link'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <p className="text-muted-foreground">
              Não tem uma conta?{' '}
              <Link
                to="/register"
                className="text-primary hover:underline font-medium"
              >
                Cadastre-se
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          © {new Date().getFullYear()} JOBY. Todos os direitos reservados.
        </p>
      </motion.div>
    </div>
  )
}

export default Login
