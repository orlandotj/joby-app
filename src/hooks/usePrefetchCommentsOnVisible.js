import { useEffect, useRef } from 'react'
import { prefetchComments, prefetchCommentsCount } from '@/hooks/useComments'
import { useCommentsMeta } from '@/contexts/CommentsMetaContext'

const runIdle = (fn) => {
  if (typeof window === 'undefined') return
  const ric = window.requestIdleCallback
  if (typeof ric === 'function') {
    ric(() => fn(), { timeout: 1200 })
    return
  }
  setTimeout(() => fn(), 250)
}

/**
 * Prefetch comments when a target element becomes visible.
 * Best-effort and deduped by the underlying comments cache.
 */
export const usePrefetchCommentsOnVisible = ({
  targetRef,
  contentId,
  contentType,
  sort = 'new',
  enabled = true,
  root = null,
  rootMargin = '200px',
  threshold = 0.15,
} = {}) => {
  const hasTriggeredRef = useRef(false)
  const commentsMeta = useCommentsMeta()

  const runPrefetch = () => {
    ;(async () => {
      const countRes = await prefetchCommentsCount({ contentId, contentType })
      const total = Number(countRes?.totalCount)
      if (Number.isFinite(total)) commentsMeta.setCount(contentType, contentId, total)
    })()

    // Warm the list in background for instant opening.
    runIdle(() => {
      void prefetchComments({ contentId, contentType, sort })
    })
  }

  useEffect(() => {
    if (!enabled) return
    if (!contentId || !contentType) return
    if (!targetRef?.current) return
    if (hasTriggeredRef.current) return

    const el = targetRef.current
    if (!el) return

    if (typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
      hasTriggeredRef.current = true
      runPrefetch()
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries?.[0]
        if (!entry?.isIntersecting) return
        hasTriggeredRef.current = true
        observer.disconnect()
        runPrefetch()
      },
      { root, rootMargin, threshold }
    )

    observer.observe(el)

    return () => {
      try {
        observer.disconnect()
      } catch {
        // ignore
      }
    }
  }, [commentsMeta, contentId, contentType, enabled, root, rootMargin, sort, targetRef, threshold])
}
