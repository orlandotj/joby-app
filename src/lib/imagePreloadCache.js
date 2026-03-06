const imageCache = new Map()
const inFlight = new Map()

export function preloadImage(url) {
  if (!url) return Promise.resolve(null)

  if (imageCache.has(url)) {
    return Promise.resolve(url)
  }

  if (inFlight.has(url)) {
    return inFlight.get(url)
  }

  const promise = new Promise((resolve, reject) => {
    try {
      const img = new Image()
      img.decoding = 'async'
      img.loading = 'eager'

      img.onload = () => {
        imageCache.set(url, url)
        inFlight.delete(url)
        resolve(url)
      }

      img.onerror = (err) => {
        inFlight.delete(url)
        reject(err)
      }

      img.src = url
    } catch (err) {
      inFlight.delete(url)
      reject(err)
    }
  })

  inFlight.set(url, promise)
  return promise
}

export function isImageCached(url) {
  if (!url) return false
  return imageCache.has(url)
}
