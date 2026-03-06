import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabaseClient'

const SESSION_VIEWED_VIDEOS_KEY = 'joby:session:viewedVideos:v1'
const SESSION_VIEWED_PHOTOS_KEY = 'joby:session:viewedPhotos:v1'

export function hasSessionViewedVideo(videoId) {
  try {
    if (!videoId) return false
    if (typeof sessionStorage === 'undefined') return false
    const raw = sessionStorage.getItem(SESSION_VIEWED_VIDEOS_KEY)
    if (!raw) return false
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return false
    return arr.includes(String(videoId))
  } catch {
    return false
  }
}

export function markSessionViewedVideo(videoId) {
  try {
    if (!videoId) return
    if (typeof sessionStorage === 'undefined') return
    const id = String(videoId)
    const raw = sessionStorage.getItem(SESSION_VIEWED_VIDEOS_KEY)
    const arr = raw ? JSON.parse(raw) : []
    const set = new Set(Array.isArray(arr) ? arr.map(String) : [])
    set.add(id)
    sessionStorage.setItem(SESSION_VIEWED_VIDEOS_KEY, JSON.stringify(Array.from(set)))
  } catch {
    // ignore
  }
}

export function hasSessionViewedPhoto(photoId) {
  try {
    if (!photoId) return false
    if (typeof sessionStorage === 'undefined') return false
    const raw = sessionStorage.getItem(SESSION_VIEWED_PHOTOS_KEY)
    if (!raw) return false
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return false
    return arr.includes(String(photoId))
  } catch {
    return false
  }
}

export function markSessionViewedPhoto(photoId) {
  try {
    if (!photoId) return
    if (typeof sessionStorage === 'undefined') return
    const id = String(photoId)
    const raw = sessionStorage.getItem(SESSION_VIEWED_PHOTOS_KEY)
    const arr = raw ? JSON.parse(raw) : []
    const set = new Set(Array.isArray(arr) ? arr.map(String) : [])
    set.add(id)
    sessionStorage.setItem(SESSION_VIEWED_PHOTOS_KEY, JSON.stringify(Array.from(set)))
  } catch {
    // ignore
  }
}

const isFunctionMissing = (error) => {
  const msg = String(error?.message || '').toLowerCase()
  return msg.includes('function') && msg.includes('does not exist')
}

export async function incrementVideoView(videoId) {
  try {
    const { data, error } = await supabase.rpc('increment_video_view', {
      p_video_id: videoId,
    })

    if (error) {
      if (isFunctionMissing(error)) return { views: null, error: null, notConfigured: true }
      throw error
    }

    // RPC pode retornar bigint/número
    return { views: data == null ? null : Number(data), error: null }
  } catch (error) {
    log.error('VIEWS', 'Erro ao incrementar view do vídeo:', error)
    return { views: null, error }
  }
}

export async function incrementPhotoView(photoId) {
  try {
    const { data, error } = await supabase.rpc('increment_photo_view', {
      p_photo_id: photoId,
    })

    if (error) {
      if (isFunctionMissing(error)) return { views: null, error: null, notConfigured: true }
      throw error
    }

    return { views: data == null ? null : Number(data), error: null }
  } catch (error) {
    log.error('VIEWS', 'Erro ao incrementar view da foto:', error)
    return { views: null, error }
  }
}
