import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'

const safeTrim = (v) => String(v || '').trim()

const isNativeCapacitor = () => {
  try {
    return Boolean(Capacitor?.isNativePlatform?.())
  } catch {
    return false
  }
}

const buildWebSharePayload = ({ title, text, url }) => {
  const cleanUrl = safeTrim(url)
  const cleanTitle = safeTrim(title)
  const cleanText = safeTrim(text)

  if (!cleanUrl) {
    throw new Error('share_missing_url')
  }

  // Preferir title + url. Se não houver título confiável, usar text + url.
  // Se não houver nenhum dos dois, compartilhar apenas a URL.
  if (cleanTitle) {
    return { title: cleanTitle, url: cleanUrl }
  }
  if (cleanText) {
    return { text: cleanText, url: cleanUrl }
  }
  return { url: cleanUrl }
}

/**
 * shareContent({ title, text, url })
 *
 * Behavior:
 * - Capacitor native: Share.share()
 * - Web: navigator.share() -> clipboard -> prompt
 *
 * Returns: { method: 'native' | 'web-share' | 'clipboard' | 'prompt' }
 */
export async function shareContent({ title, text, url }) {
  const payload = buildWebSharePayload({ title, text, url })

  if (isNativeCapacitor()) {
    await Share.share(payload)
    return { method: 'native' }
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share(payload)
      return { method: 'web-share' }
    }
  } catch {
    // ignore: fallback abaixo
  }

  const cleanUrl = safeTrim(payload?.url)
  try {
    if (cleanUrl && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(cleanUrl)
      return { method: 'clipboard' }
    }
  } catch {
    // ignore: fallback abaixo
  }

  try {
    if (cleanUrl && typeof window !== 'undefined' && typeof window.prompt === 'function') {
      window.prompt('Copie o link:', cleanUrl)
      return { method: 'prompt' }
    }
  } catch {
    // ignore
  }

  throw new Error('share_failed')
}
