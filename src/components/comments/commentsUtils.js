export const formatTimeAgoPtBR = (dateInput) => {
  const date = dateInput ? new Date(dateInput) : null
  if (!date || Number.isNaN(date.getTime())) return ''

  const diffMs = Date.now() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)

  if (diffSeconds < 60) return 'agora'

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes} min`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} h`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays} d`

  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks < 4) return `${diffWeeks} sem`

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths} m`

  const diffYears = Math.floor(diffDays / 365)
  return `${diffYears} a`
}
