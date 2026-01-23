import { supabase } from '@/lib/supabaseClient'

const isUniqueViolation = (error) => {
  const code = String(error?.code || '')
  return code === '23505' || code === '409'
}

/**
 * Adicionar comentário em vídeo ou foto
 */
export const addComment = async ({
  videoId = null,
  photoId = null,
  content,
}) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    if (!videoId && !photoId) {
      throw new Error('Deve fornecer videoId ou photoId')
    }

    const { data, error } = await supabase
      .from('comments')
      .insert({
        user_id: user.id,
        video_id: videoId,
        photo_id: photoId,
        content,
      })
      .select(
        `
        *,
        user:profiles(id, name, avatar, profession)
      `
      )
      .single()

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Erro ao adicionar comentário:', error)
    return { data: null, error }
  }
}

/**
 * Buscar comentários de um vídeo
 */
export const getVideoComments = async (videoId) => {
  try {
    const { data, error } = await supabase
      .from('comments')
      .select(
        `
        *,
        user:profiles(id, name, avatar, profession)
      `
      )
      .eq('video_id', videoId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Erro ao buscar comentários:', error)
    return { data: null, error }
  }
}

/**
 * Buscar comentários de uma foto
 */
export const getPhotoComments = async (photoId) => {
  try {
    const { data, error } = await supabase
      .from('comments')
      .select(
        `
        *,
        user:profiles(id, name, avatar, profession)
      `
      )
      .eq('photo_id', photoId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Erro ao buscar comentários:', error)
    return { data: null, error }
  }
}

/**
 * Deletar comentário
 */
export const deleteComment = async (commentId) => {
  try {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)

    if (error) throw error
    return { error: null }
  } catch (error) {
    console.error('Erro ao deletar comentário:', error)
    return { error }
  }
}

/**
 * Atualizar comentário
 */
export const updateComment = async (commentId, content) => {
  try {
    const { data, error } = await supabase
      .from('comments')
      .update({ content })
      .eq('id', commentId)
      .select(
        `
        *,
        user:profiles(id, name, avatar, profession)
      `
      )
      .single()

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Erro ao atualizar comentário:', error)
    return { data: null, error }
  }
}

/**
 * Dar like em vídeo
 */
export const likeVideo = async (videoId) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data, error } = await supabase
      .from('video_likes')
      .insert({
        video_id: videoId,
        user_id: user.id,
      })
      .select()
      .single()

    if (error) {
      // Se já curtiu, tratamos como sucesso idempotente
      if (isUniqueViolation(error)) return { data: null, error: null, alreadyLiked: true }
      throw error
    }
    return { data, error: null }
  } catch (error) {
    console.error('Erro ao dar like:', error)
    return { data: null, error }
  }
}

/**
 * Remover like de vídeo
 */
export const unlikeVideo = async (videoId) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { error } = await supabase
      .from('video_likes')
      .delete()
      .eq('video_id', videoId)
      .eq('user_id', user.id)

    if (error) throw error
    return { error: null }
  } catch (error) {
    console.error('Erro ao remover like:', error)
    return { error }
  }
}

/**
 * Verificar se usuário deu like em vídeo
 */
export const checkVideoLike = async (videoId) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { liked: false, error: null }

    const { data, error } = await supabase
      .from('video_likes')
      .select('id')
      .eq('video_id', videoId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error
    return { liked: !!data, error: null }
  } catch (error) {
    console.error('Erro ao verificar like:', error)
    return { liked: false, error }
  }
}

/**
 * Dar like em foto
 */
export const likePhoto = async (photoId) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data, error } = await supabase
      .from('photo_likes')
      .insert({
        photo_id: photoId,
        user_id: user.id,
      })
      .select()
      .single()

    if (error) {
      if (isUniqueViolation(error)) return { data: null, error: null, alreadyLiked: true }
      throw error
    }
    return { data, error: null }
  } catch (error) {
    console.error('Erro ao dar like:', error)
    return { data: null, error }
  }
}

/**
 * Contagem real de likes (fonte da verdade: tabelas *_likes)
 */
export const getVideoLikesCount = async (videoId) => {
  try {
    const { count, error } = await supabase
      .from('video_likes')
      .select('id', { count: 'exact', head: true })
      .eq('video_id', videoId)

    if (error) throw error
    return { count: Number(count || 0), error: null }
  } catch (error) {
    console.error('Erro ao contar likes do vídeo:', error)
    return { count: null, error }
  }
}

export const getPhotoLikesCount = async (photoId) => {
  try {
    const { count, error } = await supabase
      .from('photo_likes')
      .select('id', { count: 'exact', head: true })
      .eq('photo_id', photoId)

    if (error) throw error
    return { count: Number(count || 0), error: null }
  } catch (error) {
    console.error('Erro ao contar likes da foto:', error)
    return { count: null, error }
  }
}

/**
 * Remover like de foto
 */
export const unlikePhoto = async (photoId) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { error } = await supabase
      .from('photo_likes')
      .delete()
      .eq('photo_id', photoId)
      .eq('user_id', user.id)

    if (error) throw error
    return { error: null }
  } catch (error) {
    console.error('Erro ao remover like:', error)
    return { error }
  }
}

/**
 * Verificar se usuário deu like em foto
 */
export const checkPhotoLike = async (photoId) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { liked: false, error: null }

    const { data, error } = await supabase
      .from('photo_likes')
      .select('id')
      .eq('photo_id', photoId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error
    return { liked: !!data, error: null }
  } catch (error) {
    console.error('Erro ao verificar like:', error)
    return { liked: false, error }
  }
}

/**
 * Subscrever a novos comentários em tempo real
 */
export const subscribeToComments = (videoId, photoId, callback) => {
  const filter = videoId
    ? `video_id=eq.${videoId}`
    : photoId
    ? `photo_id=eq.${photoId}`
    : null

  if (!filter) return null

  const subscription = supabase
    .channel('comments')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'comments',
        filter,
      },
      async (payload) => {
        // Buscar dados completos do comentário com perfil do usuário
        const { data } = await supabase
          .from('comments')
          .select(
            `
            *,
            user:profiles(id, name, avatar, profession)
          `
          )
          .eq('id', payload.new.id)
          .single()

        if (data) callback(data)
      }
    )
    .subscribe()

  return subscription
}
