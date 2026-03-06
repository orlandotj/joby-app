const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const waitForEvent = (el, eventName, { timeoutMs = 8000 } = {}) => {
  return new Promise((resolve, reject) => {
    let done = false
    let timeout = null

    const cleanup = () => {
      if (timeout) clearTimeout(timeout)
      el.removeEventListener(eventName, onEvent)
      el.removeEventListener('error', onError)
    }

    const onEvent = () => {
      if (done) return
      done = true
      cleanup()
      resolve()
    }

    const onError = () => {
      if (done) return
      done = true
      cleanup()
      reject(new Error(`Video error while waiting for ${eventName}`))
    }

    el.addEventListener(eventName, onEvent, { once: true })
    el.addEventListener('error', onError, { once: true })

    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        if (done) return
        done = true
        cleanup()
        reject(new Error(`Timeout waiting for ${eventName}`))
      }, timeoutMs)
    }
  })
}

const canvasToBlob = (canvas, { type = 'image/jpeg', quality = 0.82 } = {}) => {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Failed to create thumbnail blob'))
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

const waitForReadyState = (video, minState, { timeoutMs = 8000 } = {}) => {
  return new Promise((resolve, reject) => {
    if (Number(video?.readyState || 0) >= minState) return resolve()

    let done = false
    let timeout = null

    const cleanup = () => {
      if (timeout) clearTimeout(timeout)
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('canplay', onLoaded)
      video.removeEventListener('error', onError)
    }

    const onLoaded = () => {
      if (done) return
      if (Number(video?.readyState || 0) < minState) return
      done = true
      cleanup()
      resolve()
    }

    const onError = () => {
      if (done) return
      done = true
      cleanup()
      reject(new Error('Video error while waiting for decode'))
    }

    video.addEventListener('loadeddata', onLoaded)
    video.addEventListener('canplay', onLoaded)
    video.addEventListener('error', onError)

    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        if (done) return
        done = true
        cleanup()
        reject(new Error('Timeout waiting for video decode'))
      }, timeoutMs)
    }
  })
}

/**
 * Generate a JPEG thumbnail from the first frame of a local video file.
 * @param {File|Blob} file
 * @param {{ seekSeconds?: number, maxWidth?: number, quality?: number, timeoutMs?: number }} opts
 * @returns {Promise<Blob>}
 */
export async function generateFirstFrameThumbnailJpeg(
  file,
  { seekSeconds = 0.1, maxWidth = 640, quality = 0.8, timeoutMs = 12000 } = {}
) {
  if (!file) throw new Error('Missing video file')

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'

  const objectUrl = URL.createObjectURL(file)
  video.src = objectUrl

  try {
    await waitForEvent(video, 'loadedmetadata', { timeoutMs })

    const duration = Number(video.duration || 0)
    const safeSeek = duration > 0 ? clamp(seekSeconds, 0, Math.max(0, duration - 0.05)) : 0

    // Seek to a tiny offset to avoid black frames on some encoders
    video.currentTime = safeSeek
    await waitForEvent(video, 'seeked', { timeoutMs })

    // Ensure a decoded frame is available (helps avoid black thumbnails on some browsers)
    await waitForReadyState(video, 2, { timeoutMs })

    const vw = Number(video.videoWidth || 0)
    const vh = Number(video.videoHeight || 0)
    if (!vw || !vh) throw new Error('Invalid video dimensions')

    const outW = Math.min(maxWidth, vw)
    const outH = Math.round((outW / vw) * vh)

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas context not available')

    ctx.drawImage(video, 0, 0, outW, outH)

    const blob = await canvasToBlob(canvas, { type: 'image/jpeg', quality })
    return blob
  } finally {
    try {
      URL.revokeObjectURL(objectUrl)
    } catch {
      // ignore
    }

    try {
      video.removeAttribute('src')
      // eslint-disable-next-line no-unused-expressions
      video.load?.()
    } catch {
      // ignore
    }
  }
}
