import { supabase } from '@/lib/supabaseClient'

const PROFILES_SELECT = 'id, name, avatar, profession, username'

let cachedFeatures = null

const isMissingColumnError = (error, columnName) => {
  const msg = String(error?.message || '')
  return msg.toLowerCase().includes(columnName.toLowerCase())
}

const isMissingRelationError = (error, tableName) => {
  const msg = String(error?.message || '')
  return msg.toLowerCase().includes('does not exist') && msg.toLowerCase().includes(tableName.toLowerCase())
}

export const commentApi = {
  async getFeatures() {
    if (cachedFeatures) return cachedFeatures

    const features = {
      replies: false,
      likes: false,
    }

    // Detect replies support (parent_id column)
    {
      const { error } = await supabase.from('comments').select('id,parent_id').limit(1)
      if (!error) features.replies = true
    }

    // Detect comment likes support (comment_likes table)
    {
      const { error } = await supabase.from('comment_likes').select('id').limit(1)
      if (!error) features.likes = true
    }

    cachedFeatures = features
    return features
  },

  async listComments({ videoId = null, photoId = null, parentId = null, limit = 20, offset = 0, sort = 'new' }) {
    if (!videoId && !photoId) {
      return { data: null, error: new Error('Deve fornecer videoId ou photoId') }
    }

    const baseQuery = () => {
      let q = supabase
        .from('comments')
        .select(`*, user:profiles(${PROFILES_SELECT})`)
        .range(offset, offset + limit - 1)

      q = videoId ? q.eq('video_id', videoId) : q.eq('photo_id', photoId)

      return q
    }

    // First try with replies filtering (if supported)
    let q = baseQuery()

    if (parentId === null) {
      q = q.is('parent_id', null)
    } else if (parentId) {
      q = q.eq('parent_id', parentId)
    }

    if (sort === 'top') {
      q = q.order('likes_count', { ascending: false }).order('created_at', { ascending: false })
    } else {
      q = q.order('created_at', { ascending: false })
    }

    let { data, error } = await q

    // Fallbacks for older schemas (no parent_id / likes_count)
    if (error && (isMissingColumnError(error, 'parent_id') || isMissingColumnError(error, 'likes_count'))) {
      let q2 = baseQuery().order('created_at', { ascending: false })
      ;({ data, error } = await q2)
    }

    return { data, error }
  },

  async addComment({ videoId = null, photoId = null, parentId = null, content }) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      if (!videoId && !photoId) throw new Error('Deve fornecer videoId ou photoId')

      const payload = {
        user_id: user.id,
        video_id: videoId,
        photo_id: photoId,
        content,
      }

      if (parentId) payload.parent_id = parentId

      let { data, error } = await supabase
        .from('comments')
        .insert(payload)
        .select(`*, user:profiles(${PROFILES_SELECT})`)
        .single()

      if (error && isMissingColumnError(error, 'parent_id')) {
        // Old schema: retry without parent_id (replies disabled)
        const { parent_id, ...fallbackPayload } = payload
        ;({ data, error } = await supabase
          .from('comments')
          .insert(fallbackPayload)
          .select(`*, user:profiles(${PROFILES_SELECT})`)
          .single())
      }

      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  },

  async deleteComment(commentId) {
    const { error } = await supabase.from('comments').delete().eq('id', commentId)
    return { error }
  },

  async getLikedCommentIds(commentIds) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return { data: [], error: null }

      const { data, error } = await supabase
        .from('comment_likes')
        .select('comment_id')
        .eq('user_id', user.id)
        .in('comment_id', commentIds)

      if (error) {
        if (isMissingRelationError(error, 'comment_likes')) {
          return { data: [], error: null, featureUnsupported: true }
        }
        return { data: [], error }
      }

      return { data: (data || []).map((r) => r.comment_id), error: null }
    } catch (error) {
      return { data: [], error }
    }
  },

  async likeComment(commentId) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      const { error } = await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: user.id })

      if (error) {
        if (isMissingRelationError(error, 'comment_likes')) {
          return { error: null, featureUnsupported: true }
        }
        return { error }
      }

      return { error: null }
    } catch (error) {
      return { error }
    }
  },

  async unlikeComment(commentId) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      const { error } = await supabase
        .from('comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', user.id)

      if (error) {
        if (isMissingRelationError(error, 'comment_likes')) {
          return { error: null, featureUnsupported: true }
        }
        return { error }
      }

      return { error: null }
    } catch (error) {
      return { error }
    }
  },
}
