export const getMutedPreference = () => {
  // Intencionalmente não persistimos preferências de áudio.
  // Ao recarregar a página, o som volta ao padrão da sessão.
  return null
}

export const setMutedPreference = () => {
  // no-op: não persistir
}

export const getInitialMuted = ({ defaultMuted = false } = {}) => {
  const pref = getMutedPreference()
  if (typeof pref === 'boolean') return pref
  return !!defaultMuted
}

// Try to play with the desired mute state.
// If autoplay with sound is blocked, can optionally fall back to muted and retry once.
export const attemptPlayWithMuteFallback = async (el, { muted, allowFallback = true } = {}) => {
  if (!el) return { ok: false, muted: true, fellBack: false }

  const tryPlay = async (nextMuted) => {
    el.muted = !!nextMuted
    await el.play()
    return { ok: true, muted: !!el.muted }
  }

  try {
    const res = await tryPlay(!!muted)
    return { ...res, fellBack: false }
  } catch {
    if (allowFallback && !muted) {
      try {
        const res = await tryPlay(true)
        return { ...res, fellBack: true }
      } catch {
        // ignore
      }
    }

    return { ok: false, muted: !!el.muted, fellBack: false }
  }
}
