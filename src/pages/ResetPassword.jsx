import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { supabase } from '@/lib/supabaseClient'

const isStrongEnough = (password) => {
  const p = String(password || '')
  return p.length >= 6
}

const ResetPassword = () => {
  const navigate = useNavigate()
  const { toast } = useToast()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      setSessionReady(Boolean(session))
    })

    const run = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (cancelled) return
        setSessionReady(Boolean(data?.session))
      } catch {
        if (cancelled) return
        setSessionReady(false)
      }
    }

    void run()
    return () => {
      cancelled = true
      try {
        authListener?.subscription?.unsubscribe?.()
      } catch {
        // ignore
      }
    }
  }, [])

  const handleSubmit = async (e) => {
    e?.preventDefault?.()

    if (!sessionReady) {
      toast({
        variant: 'destructive',
        title: 'Sessão inválida',
        description:
          'Sua sessão de recuperação não foi encontrada ou expirou. Abra novamente o link do email de recuperação mais recente.',
      })
      return
    }

    const p = String(password || '')
    const c = String(confirm || '')

    if (!isStrongEnough(p)) {
      toast({
        variant: 'destructive',
        title: 'Senha fraca',
        description: 'A senha deve ter no mínimo 6 caracteres.',
      })
      return
    }

    if (p !== c) {
      toast({
        variant: 'destructive',
        title: 'Senhas diferentes',
        description: 'A confirmação não confere com a senha.',
      })
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: p })
      if (error) throw error

      toast({
        title: 'Senha atualizada',
        description: 'Sua senha foi redefinida com sucesso. Faça login novamente.',
      })

      navigate('/login', { replace: true })
    } catch (err) {
      const msg = String(err?.message || err || 'Não foi possível redefinir a senha.')
      toast({
        variant: 'destructive',
        title: 'Erro ao redefinir',
        description: msg,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md bg-card border border-border/50 rounded-xl p-6">
        <h1 className="text-xl font-semibold text-foreground">Redefinir senha</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Defina uma nova senha para sua conta.
        </p>

        {!sessionReady ? (
          <div className="mt-4 text-sm text-muted-foreground">
            Sua sessão de recuperação não foi encontrada ou expirou. Abra novamente o link do email de recuperação mais recente.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nova senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmar nova senha</Label>
            <Input
              id="confirm"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={saving || !sessionReady}>
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Salvando…
              </span>
            ) : (
              'Salvar nova senha'
            )}
          </Button>

          <div className="text-sm text-muted-foreground text-center">
            <Link to="/login" className="underline">
              Voltar ao login
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ResetPassword
