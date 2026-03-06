const clampPositiveInt = (n, fallback = 1) => {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v <= 0) return fallback
  return v
}

const isGifFile = (file) => {
  const name = String(file?.name || '').toLowerCase()
  const type = String(file?.type || '').toLowerCase()
  return type === 'image/gif' || name.endsWith('.gif')
}

const isAllowedImageFile = (file) => {
  const name = String(file?.name || '').toLowerCase()
  const type = String(file?.type || '').toLowerCase()
  if (type.startsWith('image/')) return true
  return (
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.webp')
  )
}

const canvasToBlob = (canvas, { type, quality } = {}) => {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Falha ao gerar imagem (toBlob retornou vazio).'))
          resolve(blob)
        },
        type,
        quality
      )
    } catch (e) {
      reject(e)
    }
  })
}

const loadBitmapBestEffort = async (file) => {
  if (typeof createImageBitmap === 'function') {
    // Best-effort: preserve EXIF orientation when supported.
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { bitmap, close: () => bitmap?.close?.() }
    } catch {
      // ignore
    }

    try {
      const bitmap = await createImageBitmap(file)
      return { bitmap, close: () => bitmap?.close?.() }
    } catch {
      // ignore
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'

    await new Promise((resolve, reject) => {
      img.onload = () => resolve(true)
      img.onerror = () => reject(new Error('Falha ao carregar imagem.'))
      img.src = objectUrl
    })

    return {
      bitmap: img,
      close: () => {
        try {
          URL.revokeObjectURL(objectUrl)
        } catch {
          // ignore
        }
      },
    }
  } catch (e) {
    try {
      URL.revokeObjectURL(objectUrl)
    } catch {
      // ignore
    }
    throw e
  }
}

const drawPhotoToCanvas = ({ bitmap, targetMaxSide }) => {
  const srcW = clampPositiveInt(bitmap?.width ?? bitmap?.naturalWidth, 1)
  const srcH = clampPositiveInt(bitmap?.height ?? bitmap?.naturalHeight, 1)

  const srcMaxSide = Math.max(srcW, srcH)
  const outMaxSide = Math.min(clampPositiveInt(targetMaxSide, srcMaxSide), srcMaxSide)
  const scale = outMaxSide / srcMaxSide

  const outW = clampPositiveInt(srcW * scale, 1)
  const outH = clampPositiveInt(srcH * scale, 1)

  // Hard cap to avoid runaway memory usage.
  const MAX_OUTPUT_PIXELS = 20_000_000
  if (outW * outH > MAX_OUTPUT_PIXELS) {
    const err = new Error('Imagem muito grande para processar com segurança.')
    err.code = 'DERIVATIVE_TOO_LARGE'
    throw err
  }

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const err = new Error('Canvas 2D não suportado neste navegador.')
    err.code = 'CANVAS_NOT_SUPPORTED'
    throw err
  }

  ctx.imageSmoothingEnabled = true
  try {
    ctx.imageSmoothingQuality = 'high'
  } catch {
    // ignore
  }

  ctx.drawImage(bitmap, 0, 0, outW, outH)
  return { canvas, width: outW, height: outH }
}

const makeOutFileName = ({ originalName, kind, ext }) => {
  const base = String(originalName || 'image').replace(/\.[^/.]+$/, '') || 'image'
  const safeKind = String(kind || 'out').replace(/[^a-z0-9_-]/gi, '') || 'out'
  const safeExt = String(ext || 'webp').replace(/[^a-z0-9]/gi, '') || 'webp'
  return `${base}-${safeKind}.${safeExt}`
}

const encodeToTarget = async ({
  canvas,
  originalName,
  kind,
  preferType,
  fallbackType,
  targetBytes,
  hardMaxBytes,
  maxAttempts,
}) => {
  const attemptLimit = Math.max(1, Math.min(6, clampPositiveInt(maxAttempts, 6)))
  const target = Math.max(1, clampPositiveInt(targetBytes, 1))
  const hardMax = Math.max(target, clampPositiveInt(hardMaxBytes, target))

  // Quality schedule: starts high, ends at a safe minimum.
  const qualities = [0.88, 0.82, 0.76, 0.7, 0.62, 0.54, 0.46, 0.4]

  const tryTypes = [preferType, fallbackType].filter(Boolean)

  let best = null

  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    const q = qualities[Math.min(attempt, qualities.length - 1)]

    for (const type of tryTypes) {
      let blob
      try {
        blob = await canvasToBlob(canvas, { type, quality: q })
      } catch {
        blob = null
      }

      if (!blob || !blob.size) continue

      if (!best || blob.size < best.blob.size) {
        best = { blob, type, quality: q }
      }

      // Good enough: hit target (or at least within hard max if target isn't reachable quickly).
      if (blob.size <= target) {
        const ext = type === 'image/jpeg' ? 'jpg' : 'webp'
        return {
          file: new File([blob], makeOutFileName({ originalName, kind, ext }), {
            type,
            lastModified: Date.now(),
          }),
          bytes: blob.size,
          contentType: type,
          quality: q,
          metTarget: true,
          metHardMax: blob.size <= hardMax,
        }
      }

      if (blob.size <= hardMax) {
        // Within hard max; keep looking for target but we can stop early on later attempts.
        // Continue to next attempt for potential smaller output.
      }
    }
  }

  if (best && best.blob) {
    const ext = best.type === 'image/jpeg' ? 'jpg' : 'webp'
    return {
      file: new File([best.blob], makeOutFileName({ originalName, kind, ext }), {
        type: best.type,
        lastModified: Date.now(),
      }),
      bytes: best.blob.size,
      contentType: best.type,
      quality: best.quality,
      metTarget: best.blob.size <= target,
      metHardMax: best.blob.size <= hardMax,
    }
  }

  throw new Error('Falha ao gerar derivativo da imagem.')
}

/**
 * createImageDerivatives
 * - Generates two client-side derivatives for photo posts: thumb + full.
 * - WEBP preferred; JPEG fallback.
 * - Attempts to meet byte targets with a small quality loop (<= 6 attempts).
 *
 * @param {File} file
 * @param {{
 *  fullMaxDim?: number,
 *  thumbMaxDim?: number,
 *  fullTargetBytes?: number,
 *  fullHardMaxBytes?: number,
 *  thumbTargetBytes?: number,
 *  thumbHardMaxBytes?: number,
 *  maxAttempts?: number,
 * }} opts
 */
export const createImageDerivatives = async (
  file,
  {
    fullMaxDim = 2048,
    thumbMaxDim = 400,
    fullTargetBytes = 700 * 1024,
    fullHardMaxBytes = 1200 * 1024,
    thumbTargetBytes = 80 * 1024,
    thumbHardMaxBytes = 120 * 1024,
    maxAttempts = 6,
  } = {}
) => {
  if (!(file instanceof File)) throw new Error('Arquivo inválido para gerar derivativos.')

  if (isGifFile(file)) {
    const err = new Error('GIF não suportado. Envie JPG, PNG ou WEBP.')
    err.code = 'GIF_NOT_SUPPORTED'
    throw err
  }

  if (!isAllowedImageFile(file)) {
    const err = new Error('Formato inválido. Envie JPG, PNG ou WEBP.')
    err.code = 'IMAGE_TYPE_NOT_ALLOWED'
    throw err
  }

  const { bitmap, close } = await loadBitmapBestEffort(file)

  try {
    const originalWidth = clampPositiveInt(bitmap?.width ?? bitmap?.naturalWidth, null)
    const originalHeight = clampPositiveInt(bitmap?.height ?? bitmap?.naturalHeight, null)

    if (!originalWidth || !originalHeight) {
      throw new Error('Não foi possível ler as dimensões da imagem.')
    }

    const { canvas: fullCanvas, width: fullW, height: fullH } = drawPhotoToCanvas({
      bitmap,
      targetMaxSide: fullMaxDim,
    })

    const { canvas: thumbCanvas, width: thumbW, height: thumbH } = drawPhotoToCanvas({
      bitmap,
      targetMaxSide: thumbMaxDim,
    })

    const fullEncoded = await encodeToTarget({
      canvas: fullCanvas,
      originalName: file.name,
      kind: 'full',
      preferType: 'image/webp',
      fallbackType: 'image/jpeg',
      targetBytes: fullTargetBytes,
      hardMaxBytes: fullHardMaxBytes,
      maxAttempts,
    })

    const thumbEncoded = await encodeToTarget({
      canvas: thumbCanvas,
      originalName: file.name,
      kind: 'thumb',
      preferType: 'image/webp',
      fallbackType: 'image/jpeg',
      targetBytes: thumbTargetBytes,
      hardMaxBytes: thumbHardMaxBytes,
      maxAttempts,
    })

    return {
      original: {
        width: originalWidth,
        height: originalHeight,
        bytes: Number(file.size) || 0,
        contentType: file.type || '',
      },
      full: {
        file: fullEncoded.file,
        width: fullW,
        height: fullH,
        bytes: fullEncoded.bytes,
        contentType: fullEncoded.contentType,
        metTarget: fullEncoded.metTarget,
        metHardMax: fullEncoded.metHardMax,
      },
      thumb: {
        file: thumbEncoded.file,
        width: thumbW,
        height: thumbH,
        bytes: thumbEncoded.bytes,
        contentType: thumbEncoded.contentType,
        metTarget: thumbEncoded.metTarget,
        metHardMax: thumbEncoded.metHardMax,
      },
    }
  } finally {
    try {
      close?.()
    } catch {
      // ignore
    }
  }
}
