import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/components/ui/use-toast'

const parseHashParams = (hash) => {
  const raw = String(hash || '')
  const h = raw.startsWith('#') ? raw.slice(1) : raw
  const params = new URLSearchParams(h)
  const out = {}
  for (const [k, v] of params.entries()) out[k] = v
  return out
}

const getAuthIntentFromUrl = (url) => {
  try {
    const u = new URL(url)
    const qType = u.searchParams.get('type')
    if (qType) return qType

    const hash = parseHashParams(u.hash)
    const hType = hash.type
    if (hType) return hType
  } catch {
    // ignore
  }
  return ''
}

const clearSensitiveUrl = (pathname = '/auth/callback') => {
  try {
    window.history.replaceState({}, document.title, pathname)
  } catch {
    // ignore
  }
}

const AuthCallback = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [status, setStatus] = useState('loading') // loading | ok | error
  const [errorMessage, setErrorMessage] = useState('')

  const fullUrl = useMemo(() => {
    try {
      return window.location.href
    } catch {
      const qs = location.search || ''
      const hash = location.hash || ''
      return `${location.pathname || '/auth/callback'}${qs}${hash}`
    }
  }, [location.hash, location.pathname, location.search])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setStatus('loading')
      setErrorMessage('')

      try {
        const u = new URL(fullUrl, window.location.origin)
        const code = u.searchParams.get('code')
        const intent = getAuthIntentFromUrl(fullUrl)
        const isRecovery = intent === 'recovery'

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        } else {
          const hash = parseHashParams(u.hash)
          const access_token = hash.access_token
          const refresh_token = hash.refresh_token

          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token })
            if (error) throw error
          }
        }

        clearSensitiveUrl('/auth/callback')

        if (cancelled) return
        setStatus('ok')

        if (isRecovery) {
          navigate('/reset-password', { replace: true })
        } else {
          navigate('/', { replace: true })
        }
      } catch (err) {
        const msg = String(err?.message || err || 'Falha ao processar autenticação.')
        try {
          clearSensitiveUrl('/auth/callback')
        } catch {
          // ignore
        }

        if (cancelled) return
        setStatus('error')
        setErrorMessage(msg)

        toast({
          variant: 'destructive',
          title: 'Não foi possível concluir',
          description: msg,
        })
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [fullUrl, navigate, toast])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md bg-card border border-border/50 rounded-xl p-6">
        {status === 'loading' ? (
          <div className="flex items-center gap-3 text-foreground">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <div>
              <div className="font-semibold">Concluindo autenticação</div>
              <div className="text-sm text-muted-foreground">Aguarde um instante…</div>
            </div>
          </div>
        ) : status === 'error' ? (
          <div>
            <div className="font-semibold text-foreground">Erro ao concluir</div>
            <div className="text-sm text-muted-foreground mt-2">{errorMessage}</div>
            <div className="text-sm text-muted-foreground mt-4">
              Você pode tentar novamente abrindo o link do email mais recente.
            </div>
          </div>
        ) : (
          <div className="text-foreground">Redirecionando…</div>
        )}
      </div>
    </div>
  )
}

export default AuthCallback
