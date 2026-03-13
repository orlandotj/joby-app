import { log } from '@/lib/logger'

export const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

export function assertStripePublishableKey() {
  const key = String(stripePublishableKey || '').trim()
  if (!key) {
    const message =
      'Configuração Stripe ausente: defina VITE_STRIPE_PUBLISHABLE_KEY no .env (frontend).'
    log.error('STRIPE', message)
    throw new Error(message)
  }

  // Safety check: this must NEVER be a secret key.
  if (key.startsWith('sk_') || key.startsWith('rk_') || key.startsWith('whsec_')) {
    const message =
      'Chave Stripe inválida no frontend: use apenas a publishable key (pk_...) em VITE_STRIPE_PUBLISHABLE_KEY.'
    log.error('STRIPE', message)
    throw new Error(message)
  }

  return key
}
