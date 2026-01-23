const compactFormatter = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
})

export function asInt(value, fallback = 0) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

export function formatCompactNumber(value) {
  const n = asInt(value, 0)
  if (n < 1000) return String(n)
  return compactFormatter.format(n)
}
