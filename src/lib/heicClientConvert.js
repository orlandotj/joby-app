import heic2any from 'heic2any'
import { createObjectUrlPreview, revokeObjectUrlIfNeeded } from '@/lib/filePreviewUrl'

const HEIC_PREVIEW_SUPPORT_KEY = 'joby.heic_preview_supported'

export const isHeicLikeFile = (file) => {
  const type = String(file?.type || '').toLowerCase().trim()
  if (
    type === 'image/heic' ||
    type === 'image/heif' ||
    type === 'image/heic-sequence' ||
    type === 'image/heif-sequence'
  ) {
    return true
  }

  const name = String(file?.name || '').toLowerCase()
  return name.endsWith('.heic') || name.endsWith('.heif')
}

export const convertHeicToJpegFile = async (file, { quality = 0.92 } = {}) => {
  const blobOrBlobs = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality,
  })

  const blob = Array.isArray(blobOrBlobs) ? blobOrBlobs?.[0] : blobOrBlobs
  if (!blob || !(blob instanceof Blob) || !blob.size) {
    const err = new Error('Falha ao converter HEIC para JPEG.')
    err.code = 'HEIC_CONVERT_FAILED'
    throw err
  }

  const baseName = String(file?.name || 'image').replace(/\.[^/.]+$/, '')
  const outName = `${baseName || 'image'}-converted.jpg`

  return new File([blob], outName, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

export const getCachedHeicPreviewSupported = () => {
  try {
    const raw = localStorage.getItem(HEIC_PREVIEW_SUPPORT_KEY)
    if (raw === '1') return true
    if (raw === '0') return false
    return null
  } catch {
    return null
  }
}

export const setCachedHeicPreviewSupported = (value) => {
  try {
    localStorage.setItem(HEIC_PREVIEW_SUPPORT_KEY, value ? '1' : '0')
  } catch {
    // ignore
  }
}

const probeHeicPreviewSupportedRaw = async (file) => {
  // Best-effort: try decoding without relying on <img> rendering.
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file)
      try {
        bmp?.close?.()
      } catch {
        // ignore
      }
      return true
    } catch {
      // ignore
    }
  }

  const url = URL.createObjectURL(file)
  try {
    await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(true)
      img.onerror = () => reject(new Error('IMG_DECODE_FAILED'))
      img.src = url
    })
    return true
  } catch {
    return false
  } finally {
    try {
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    }
  }
}

// Probes AND caches result. Returns: true/false.
export const probeHeicPreviewSupported = async (file) => {
  const cached = getCachedHeicPreviewSupported()
  if (cached === true || cached === false) return cached

  const supported = await probeHeicPreviewSupportedRaw(file)
  setCachedHeicPreviewSupported(supported)
  return supported
}

export const createPreviewUrl = (file, previousUrl = '') => {
  return createObjectUrlPreview(file, previousUrl)
}

export const revokePreviewUrlIfNeeded = (url) => {
  revokeObjectUrlIfNeeded(url)
}

/**
 * HEIC flow helper (client-first):
 * - Uses opIdRef to guard against race conditions.
 * - Shows immediate preview (original) unless cached preview support is false.
 * - If HEIC and supported: converts in background and swaps preview to JPEG.
 * - If HEIC and unsupported (cached): converts BEFORE preview.
 *
 * Returns: { file: File, previewUrl: string, wasHeic: boolean } or null if canceled.
 */
export const runHeicFlow = async (
  file,
  { opIdRef, previousPreviewUrl = '', setPreviewUrl, setIsConverting } = {}
) => {
  if (!(file instanceof File)) return null
  if (!opIdRef || typeof opIdRef !== 'object') return null

  const nextOpId = (Number(opIdRef.current) || 0) + 1
  opIdRef.current = nextOpId
  const opId = nextOpId

  const wasHeic = isHeicLikeFile(file)
  let workingFile = file
  let currentPreviewUrl = String(previousPreviewUrl || '')

  const safeSetPreviewUrl = (url) => {
    if (typeof setPreviewUrl !== 'function') return
    setPreviewUrl(url)
  }

  const safeSetIsConverting = (value) => {
    if (typeof setIsConverting !== 'function') return
    setIsConverting(!!value)
  }

  const ensureNotCanceled = () => opIdRef.current === opId

  if (wasHeic) {
    const cachedSupport = getCachedHeicPreviewSupported()

    // Known unsupported: convert first, then preview.
    if (cachedSupport === false) {
      safeSetIsConverting(true)
      try {
        workingFile = await convertHeicToJpegFile(file)
        if (!ensureNotCanceled()) return null

        try {
          currentPreviewUrl = createPreviewUrl(workingFile, currentPreviewUrl)
          if (currentPreviewUrl) safeSetPreviewUrl(currentPreviewUrl)
        } catch {
          // ignore
        }

        return { file: workingFile, previewUrl: currentPreviewUrl, wasHeic }
      } finally {
        if (ensureNotCanceled()) safeSetIsConverting(false)
      }
    }

    // Support unknown/true: preview immediately, convert in background.
    try {
      currentPreviewUrl = createPreviewUrl(file, currentPreviewUrl)
      if (currentPreviewUrl) safeSetPreviewUrl(currentPreviewUrl)
    } catch {
      // ignore
    }

    // Cache probe in background if not known.
    if (cachedSupport === null) {
      probeHeicPreviewSupported(file).catch(() => {})
    }

    safeSetIsConverting(true)
    try {
      workingFile = await convertHeicToJpegFile(file)
      if (!ensureNotCanceled()) return null

      try {
        const convertedUrl = createPreviewUrl(workingFile, currentPreviewUrl)
        if (convertedUrl) {
          currentPreviewUrl = convertedUrl
          safeSetPreviewUrl(convertedUrl)
        }
      } catch {
        // ignore
      }

      return { file: workingFile, previewUrl: currentPreviewUrl, wasHeic }
    } finally {
      if (ensureNotCanceled()) safeSetIsConverting(false)
    }
  }

  // Non-HEIC: just preview immediately.
  try {
    currentPreviewUrl = createPreviewUrl(file, currentPreviewUrl)
    if (currentPreviewUrl) safeSetPreviewUrl(currentPreviewUrl)
  } catch {
    // ignore
  }

  return { file: workingFile, previewUrl: currentPreviewUrl, wasHeic }
}
