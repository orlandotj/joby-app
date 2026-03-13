import { loadStripe } from '@stripe/stripe-js'
import { assertStripePublishableKey } from '@/lib/stripeEnv'

let stripePromise = null

export function getStripe() {
  if (stripePromise) return stripePromise
  const publishableKey = assertStripePublishableKey()
  stripePromise = loadStripe(publishableKey)
  return stripePromise
}
