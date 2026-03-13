import { supabase } from '@/lib/supabaseClient'

class PaymentsBackendError extends Error {
  constructor(message, { code, details, status } = {}) {
    super(message)
    this.name = 'PaymentsBackendError'
    this.code = code
    this.details = details
    this.status = status
  }
}

const normalizeInvokeError = (err) => {
  if (!err) return null

  // supabase-js functions errors can vary; normalize to a stable shape
  const message =
    String(err?.message || err?.error || '') ||
    'Falha ao chamar backend de pagamentos.'

  return new PaymentsBackendError(message, {
    code: err?.code,
    details: err?.details,
    status: err?.status,
  })
}

async function invokeStripeAction(action, payload) {
  const { data, error } = await supabase.functions.invoke('stripe', {
    body: {
      action,
      payload: payload ?? {},
    },
  })

  if (error) throw normalizeInvokeError(error)
  return data
}

export async function createPaymentIntent({
  amount,
  currency = 'brl',
  captureMethod,
  metadata,
} = {}) {
  return invokeStripeAction('create_payment_intent', {
    amount,
    currency,
    capture_method: captureMethod,
    metadata,
  })
}

export async function getOrCreateCustomer({ email, name, metadata } = {}) {
  return invokeStripeAction('get_or_create_customer', {
    email,
    name,
    metadata,
  })
}

export async function createCheckoutSession({
  amountCents,
  currency = 'brl',
} = {}) {
  return invokeStripeAction('create_checkout_session', {
    amount_cents: amountCents,
    currency,
  })
}

// Future stubs (Connect)
export async function createConnectAccount(_input) {
  return invokeStripeAction('create_connect_account', _input)
}

export async function createAccountLink(_input) {
  return invokeStripeAction('create_account_link', _input)
}

export async function createTransfer(_input) {
  return invokeStripeAction('create_transfer', _input)
}

export { PaymentsBackendError }
