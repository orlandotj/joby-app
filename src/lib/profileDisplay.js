export const getProfileUsername = (profile) => {
  const raw =
    profile?.username ??
    profile?.user_name ??
    profile?.nickname ??
    profile?.handle ??
    ''
  const s = String(raw || '').trim()
  return s
}

export const getProfileDisplayName = (profile) => {
  const username = getProfileUsername(profile)
  if (username) return `@${username}`

  const legacy =
    profile?.display_name ||
    profile?.name ||
    profile?.full_name ||
    profile?.nome ||
    profile?.email

  const s = String(legacy || '').trim()
  return s || 'usuário'
}

export const getProfileInitial = (profile) => {
  const d = getProfileDisplayName(profile)
  const c = String(d || '?').replace(/^@/, '').trim().charAt(0)
  return (c || '?').toUpperCase()
}
