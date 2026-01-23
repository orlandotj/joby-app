import React, { useState, useEffect, useRef } from 'react'

const LazyImage = ({ src, alt, className, placeholder = '' }) => {
  const [imageSrc, setImageSrc] = useState(placeholder || null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const imgRef = useRef(null)

  useEffect(() => {
    let observer
    const currentImg = imgRef.current

    // reset state when src changes
    setHasError(false)
    setIsLoading(true)

    // If src is empty, don't render broken image.
    if (!src) {
      setImageSrc(placeholder || null)
      setIsLoading(false)
      return
    }

    if (currentImg && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const img = new Image()
              img.src = src
              img.onload = () => {
                setImageSrc(src)
                setIsLoading(false)
              }
              img.onerror = () => {
                setHasError(true)
                setIsLoading(false)
              }
              observer.unobserve(currentImg)
            }
          })
        },
        {
          rootMargin: '50px',
        }
      )

      observer.observe(currentImg)
    } else {
      // Fallback para navegadores sem IntersectionObserver
      const img = new Image()
      img.src = src
      img.onload = () => {
        setImageSrc(src)
        setIsLoading(false)
      }
      img.onerror = () => {
        setHasError(true)
        setIsLoading(false)
      }
    }

    return () => {
      if (observer && currentImg) {
        observer.unobserve(currentImg)
      }
    }
  }, [src])

  // Skeleton/placeholder while loading or if error
  const showSkeleton = isLoading || hasError || !imageSrc

  return (
    <div ref={imgRef} className={`relative ${className}`}>
      {showSkeleton && (
        <div
          className={`absolute inset-0 rounded-none bg-muted/40 ${
            isLoading ? 'animate-pulse' : ''
          }`}
        />
      )}
      {imageSrc && !hasError && (
        <img
          src={imageSrc}
          alt={alt}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setHasError(true)
            setIsLoading(false)
          }}
        />
      )}
    </div>
  )
}

export default LazyImage
