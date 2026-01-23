import { supabase } from '@/lib/supabaseClient'

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
    console.error('Erro ao incrementar view do vídeo:', error)
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
    console.error('Erro ao incrementar view da foto:', error)
    return { views: null, error }
  }
}
