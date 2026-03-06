const DEFAULT_JPEG_QUALITY = 0.92

const clampPositiveInt = (n, fallback = 1) => {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v <= 0) return fallback
  return v
}

const toJpegFileName = (name) => {
  const base = String(name || 'image').replace(/\.[^/.]+$/, '')
  return `${base || 'image'}-resized.jpg`
}

const canvasToBlob = (canvas, { type = 'image/jpeg', quality = DEFAULT_JPEG_QUALITY } = {}) => {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Falha ao gerar JPEG (toBlob retornou vazio).'))
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
  // Best-effort: preserve EXIF orientation when the browser supports it.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        bitmap,
        close: () => {
          try {
            bitmap?.close?.()
          } catch {
            // ignore
          }
        },
      }
    } catch {
      // ignore
    }

    try {
      const bitmap = await createImageBitmap(file)
      return {
        bitmap,
        close: () => {
          try {
            bitmap?.close?.()
          } catch {
            // ignore
          }
        },
      }
    } catch {
      // ignore
    }
  }

  // Fallback for older browsers.
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

/**
 * resizeImageClient
 * - If image is already within maxDimension, returns the original File.
 * - If bigger, resizes on a canvas preserving aspect ratio, exports JPEG (quality 0.92)
 * - Best-effort EXIF orientation preservation (via createImageBitmap({imageOrientation:'from-image'}) when supported)
 */
export const resizeImageClient = async (file, { maxDimension } = {}) => {
  if (!(file instanceof File)) throw new Error('Arquivo inválido para resize.')

  const maxDimRaw = Number(maxDimension)
  const maxDim = Number.isFinite(maxDimRaw) && maxDimRaw > 0 ? Math.floor(maxDimRaw) : 0
  if (!maxDim) return file

  const { bitmap, close } = await loadBitmapBestEffort(file)

  try {
    const srcW = clampPositiveInt(bitmap?.width ?? bitmap?.naturalWidth, null)
    const srcH = clampPositiveInt(bitmap?.height ?? bitmap?.naturalHeight, null)

    if (!srcW || !srcH) return file

    const srcMax = Math.max(srcW, srcH)
    if (srcMax <= maxDim) return file

    const scale = maxDim / srcMax
    const outW = Math.max(1, Math.round(srcW * scale))
    const outH = Math.max(1, Math.round(srcH * scale))

    // Hard cap to avoid unexpected memory usage if dimensions are bogus.
    const MAX_OUTPUT_PIXELS = 20_000_000
    if (outW * outH > MAX_OUTPUT_PIXELS) {
      const err = new Error('Imagem muito grande para redimensionar com segurança.')
      err.code = 'RESIZE_TOO_LARGE'
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

    const blob = await canvasToBlob(canvas, { type: 'image/jpeg', quality: DEFAULT_JPEG_QUALITY })

    return new File([blob], toJpegFileName(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } finally {
    try {
      close?.()
    } catch {
      // ignore
    }
  }
}
