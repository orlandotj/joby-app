export const isUuid = (value) => {
  if (typeof value !== 'string') return false
  const v = value.trim()
  // UUID v1-v5 (common Postgres uuid input)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}
