const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

const DEFAULTS = {
  avatar: {
    outSize: 512,
    targetBytes: 300 * 1024,
    hardMaxBytes: 500 * 1024,
    startQuality: 0.82,
    minQuality: 0.55,
    qualityStep: 0.05,
    sizeSteps: [512, 448, 384],
  },
  photo: {
    maxSide: 1920,
    targetBytes: 900 * 1024,
    hardMaxBytes: Math.round(1.2 * 1024 * 1024),
    startQuality: 0.85,
    minQuality: 0.55,
    qualityStep: 0.05,
    maxSideSteps: [1920, 1600, 1400, 1200, 1080],
  },
}

const canvasToBlob = (canvas, { type, quality }) => {
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

const normalizeKind = (kind) => {
  if (kind === 'avatar' || kind === 'photo') return kind
  throw new Error('kind inválido (use "avatar" ou "photo").')
}

const isGifFile = (file) => {
  const name = String(file?.name || '')
  const t = String(file?.type || '').toLowerCase()
  return t === 'image/gif' || name.toLowerCase().endsWith('.gif')
}

const isAllowedImageFile = (file) => {
  const t = String(file?.type || '').toLowerCase()
  if (ALLOWED_IMAGE_TYPES.has(t)) return true
  // Some browsers may omit type; fallback to extension.
  const name = String(file?.name || '').toLowerCase()
  return name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp')
}

const loadImageBitmap = async (file) => {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return { bitmap, close: () => bitmap.close?.() }
  }

  // Fallback for older browsers.
  const objectUrl = URL.createObjectURL(file)
  const img = new Image()
  img.decoding = 'async'

  await new Promise((resolve, reject) => {
    img.onload = () => resolve()
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
}

const buildQualitySteps = ({ startQuality, minQuality, qualityStep }) => {
  const steps = []
  for (let q = startQuality; q >= minQuality - 1e-6; q -= qualityStep) {
    const qq = Math.max(minQuality, Math.min(0.95, Number(q)))
    const rounded = Math.round(qq * 100) / 100
    if (!steps.includes(rounded)) steps.push(rounded)
  }
  if (!steps.includes(minQuality)) steps.push(minQuality)
  return steps
}

const makeWebpFileName = (originalName) => {
  const name = String(originalName || 'image')
  const base = name.replace(/\.[^/.]+$/, '')
  return `${base}.webp`
}

const clampPositiveInt = (n, fallback) => {
  const v = Math.round(Number(n))
  return Number.isFinite(v) && v > 0 ? v : fallback
}

const drawAvatarToCanvas = ({ bitmap, outSize }) => {
  const srcW = clampPositiveInt(bitmap?.width ?? bitmap?.naturalWidth, 1)
  const srcH = clampPositiveInt(bitmap?.height ?? bitmap?.naturalHeight, 1)
  const side = Math.min(srcW, srcH)
  const sx = Math.max(0, Math.floor((srcW - side) / 2))
  const sy = Math.max(0, Math.floor((srcH - side) / 2))

  const canvas = document.createElement('canvas')
  canvas.width = outSize
  canvas.height = outSize

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D não suportado neste navegador.')

  ctx.imageSmoothingEnabled = true
  try {
    ctx.imageSmoothingQuality = 'high'
  } catch {
    // ignore
  }

  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, outSize, outSize)
  return canvas
}

const drawPhotoToCanvas = ({ bitmap, targetMaxSide }) => {
  const srcW = clampPositiveInt(bitmap?.width ?? bitmap?.naturalWidth, 1)
  const srcH = clampPositiveInt(bitmap?.height ?? bitmap?.naturalHeight, 1)
  const srcMaxSide = Math.max(srcW, srcH)

  const outMaxSide = Math.min(targetMaxSide, srcMaxSide)
  const scale = outMaxSide / srcMaxSide

  const outW = clampPositiveInt(srcW * scale, 1)
  const outH = clampPositiveInt(srcH * scale, 1)

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D não suportado neste navegador.')

  ctx.imageSmoothingEnabled = true
  try {
    ctx.imageSmoothingQuality = 'high'
  } catch {
    // ignore
  }

  ctx.drawImage(bitmap, 0, 0, outW, outH)
  return { canvas, width: outW, height: outH }
}

/**
 * Optimize an image File for upload.
 *
 * - Accepts JPEG/PNG/WEBP, blocks GIF.
 * - Converts to WEBP.
 * - Avatar: center square crop + resize (512x512).
 * - Photo: keep aspect ratio + resize to max 1920px on the largest side.
 *
 * Returns: { file: File, meta: { width,height,originalWidth,originalHeight,originalSize,newSize } }
 */
export const optimizeImageFile = async (file, { kind }) => {
  const normalizedKind = normalizeKind(kind)

  if (!(file instanceof File)) {
    throw new Error('Arquivo inválido.')
  }

  if (isGifFile(file)) {
    const err = new Error('GIF ainda não é suportado. Envie JPG, PNG ou WEBP.')
    err.code = 'GIF_NOT_SUPPORTED'
    throw err
  }

  if (!isAllowedImageFile(file)) {
    const err = new Error('Formato inválido. Envie JPG, PNG ou WEBP.')
    err.code = 'IMAGE_TYPE_NOT_ALLOWED'
    throw err
  }

  const originalSize = Number(file.size) || 0

  const cfg = DEFAULTS[normalizedKind]
  const qualitySteps = buildQualitySteps(cfg)

  const { bitmap, close } = await loadImageBitmap(file)

  try {
    const originalWidth = clampPositiveInt(bitmap?.width ?? bitmap?.naturalWidth, null)
    const originalHeight = clampPositiveInt(bitmap?.height ?? bitmap?.naturalHeight, null)

    if (!originalWidth || !originalHeight) {
      throw new Error('Não foi possível ler as dimensões da imagem.')
    }

    const targetBytes = cfg.targetBytes
    const hardMaxBytes = cfg.hardMaxBytes

    let best = null

    const consider = ({ blob, width, height, quality }) => {
      if (!blob) return
      if (!best || blob.size < best.blob.size) {
        best = { blob, width, height, quality }
      }
    }

    if (normalizedKind === 'avatar') {
      const sizeSteps = Array.from(new Set(cfg.sizeSteps)).filter((s) => Number.isFinite(s) && s > 0)
      for (const outSize of sizeSteps) {
        const canvas = drawAvatarToCanvas({ bitmap, outSize })

        for (const quality of qualitySteps) {
          const blob = await canvasToBlob(canvas, { type: 'image/webp', quality })
          consider({ blob, width: outSize, height: outSize, quality })
          if (blob.size <= targetBytes) {
            const outFile = new File([blob], makeWebpFileName(file.name), {
              type: 'image/webp',
              lastModified: Date.now(),
            })
            return {
              file: outFile,
              meta: {
                kind: normalizedKind,
                width: outSize,
                height: outSize,
                originalWidth,
                originalHeight,
                originalSize,
                newSize: blob.size,
                quality,
                metTarget: true,
                metHardMax: blob.size <= hardMaxBytes,
              },
            }
          }
        }

      }
    } else {
      const srcMaxSide = Math.max(originalWidth, originalHeight)
      const startMaxSide = Math.min(cfg.maxSide, srcMaxSide)
      const candidates = (cfg.maxSideSteps || [])
        .map((s) => Math.min(s, startMaxSide))
        .filter((s) => Number.isFinite(s) && s > 0)

      const maxSideSteps = Array.from(new Set([startMaxSide, ...candidates]))
        .filter((s) => Number.isFinite(s) && s > 0)
        .sort((a, b) => b - a)

      for (const maxSide of maxSideSteps) {
        const { canvas, width, height } = drawPhotoToCanvas({ bitmap, targetMaxSide: maxSide })

        for (const quality of qualitySteps) {
          const blob = await canvasToBlob(canvas, { type: 'image/webp', quality })
          consider({ blob, width, height, quality })
          if (blob.size <= targetBytes) {
            const outFile = new File([blob], makeWebpFileName(file.name), {
              type: 'image/webp',
              lastModified: Date.now(),
            })
            return {
              file: outFile,
              meta: {
                kind: normalizedKind,
                width,
                height,
                originalWidth,
                originalHeight,
                originalSize,
                newSize: blob.size,
                quality,
                metTarget: true,
                metHardMax: blob.size <= hardMaxBytes,
              },
            }
          }
        }

      }
    }

    if (!best?.blob) {
      throw new Error('Falha ao otimizar a imagem.')
    }

    const outFile = new File([best.blob], makeWebpFileName(file.name), {
      type: 'image/webp',
      lastModified: Date.now(),
    })

    return {
      file: outFile,
      meta: {
        kind: normalizedKind,
        width: best.width,
        height: best.height,
        originalWidth: clampPositiveInt(bitmap?.width ?? bitmap?.naturalWidth, null),
        originalHeight: clampPositiveInt(bitmap?.height ?? bitmap?.naturalHeight, null),
        originalSize,
        newSize: best.blob.size,
        quality: best.quality,
        metTarget: best.blob.size <= cfg.targetBytes,
        metHardMax: best.blob.size <= cfg.hardMaxBytes,
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
