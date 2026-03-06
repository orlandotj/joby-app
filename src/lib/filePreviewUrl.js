export function revokeObjectUrlIfNeeded(url) {
  const u = typeof url === 'string' ? url : ''
  if (!u) return
  if (!u.startsWith('blob:')) return
  try {
    URL.revokeObjectURL(u)
  } catch {
    // ignore
  }
}

export function createObjectUrlPreview(file, previousUrl = '') {
  revokeObjectUrlIfNeeded(previousUrl)
  if (!(file instanceof File)) return ''
  try {
    return URL.createObjectURL(file)
  } catch {
    return ''
  }
}
