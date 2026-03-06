import { safeGetUser, supabase } from '@/lib/supabaseClient'

const PROFILES_SELECT = 'id, name, avatar, profession, username'
const PROFILES_SELECT_VARIANTS = [
  PROFILES_SELECT,
  'id, username, name, avatar, profession',
  'id, username, name, avatar',
  'id, name, avatar',
  'id, username',
  'id',
]

let cachedFeatures = null

const isMissingColumnError = (error, columnName) => {
  const code = String(error?.code || '')
  const msg = String(error?.message || error || '').toLowerCase()
  if (code === '42703') return true
  return msg.includes('column') && msg.includes('does not exist') && msg.includes(String(columnName || '').toLowerCase())
}

const isMissingRelationError = (error, tableName) => {
  const msg = String(error?.message || '')
  return msg.toLowerCase().includes('does not exist') && msg.toLowerCase().includes(tableName.toLowerCase())
}

const isPermissionDeniedError = (error) => {
  const code = String(error?.code || '')
  const status = Number(error?.status || error?.statusCode || 0)
  const msg = String(error?.message || error || '').toLowerCase()
  return code === '42501' || status === 403 || msg.includes('permission denied')
}

const isForeignKeyViolation = (error) => String(error?.code || '') === '23503'

const ensureOwnProfileExists = async (user) => {
  const userId = user?.id
  if (!userId) return

  try {
    const existing = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle()
    if (!existing?.error && existing?.data?.id) return
  } catch {
    // ignore
  }

  const fallbackName =
    String(user?.user_metadata?.name || user?.user_metadata?.full_name || '').trim() ||
    (String(user?.email || '').split('@')[0] || '').trim() ||
    'Usuário'

  const attempts = [
    { id: userId, name: fallbackName },
    { id: userId, username: fallbackName, name: fallbackName },
    { id: userId },
  ]

  let lastErr = null
  for (const payload of attempts) {
    const r = await supabase.from('profiles').upsert(payload, { onConflict: 'id' }).select('id').maybeSingle()
    if (!r.error) return
    lastErr = r.error
    const msg = String(r.error?.message || '').toLowerCase()
    const missingColumn = msg.includes('column') && msg.includes('does not exist')
    if (!missingColumn) break
  }

  if (lastErr) throw lastErr
}

const fetchProfileById = async (id) => {
  if (!id) return null
  for (const select of PROFILES_SELECT_VARIANTS) {
    const r = await supabase.from('profiles').select(select).eq('id', id).maybeSingle()
    if (!r.error) return r.data || null
    const msg = String(r.error?.message || '').toLowerCase()
    const missingColumn = msg.includes('column') && msg.includes('does not exist')
    if (!missingColumn) return null
  }
  return null
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

  async getCommentLikeCounts(commentIds) {
    try {
      const ids = Array.isArray(commentIds) ? commentIds.filter(Boolean) : []
      if (!ids.length) return { data: new Map(), error: null }

      const { data, error } = await supabase.rpc('get_comment_like_counts', { comment_ids: ids })

      if (error) return { data: new Map(), error }

      const map = new Map()
      for (const row of data || []) {
        if (row?.comment_id) map.set(row.comment_id, Number(row.likes_count) || 0)
      }
      return { data: map, error: null }
    } catch (error) {
      return { data: new Map(), error }
    }
  },

  async listComments({ videoId = null, photoId = null, parentId = null, limit = 20, offset = 0, sort = 'new' }) {
    if (!videoId && !photoId) {
      return { data: null, error: new Error('Deve fornecer videoId ou photoId') }
    }

    const baseQuery = (select) => {
      let q = supabase.from('comments').select(select).range(offset, offset + limit - 1)
      q = videoId ? q.eq('video_id', videoId) : q.eq('photo_id', photoId)
      return q
    }

    const run = async (select) => {
      let q = baseQuery(select)

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

      return await q
    }

    // Attempt 1: with profile embed
    let { data, error } = await run(`*, user:profiles(${PROFILES_SELECT})`)

    // If join is blocked or missing, fall back to no embed.
    if (error && (isPermissionDeniedError(error) || isMissingRelationError(error, 'profiles'))) {
      ;({ data, error } = await run('*'))
    }

    // Fallback for older schemas (no parent_id / likes_count)
    if (error && (isMissingColumnError(error, 'parent_id') || isMissingColumnError(error, 'likes_count'))) {
      // Retry without filtering/sorting by optional columns.
      let q2 = baseQuery(error && (isPermissionDeniedError(error) || isMissingRelationError(error, 'profiles')) ? '*' : `*, user:profiles(${PROFILES_SELECT})`).order(
        'created_at',
        { ascending: false }
      )
      q2 = videoId ? q2.eq('video_id', videoId) : q2.eq('photo_id', photoId)
      ;({ data, error } = await q2)

      // If embed still fails, final fallback is plain '*'
      if (error && (isPermissionDeniedError(error) || isMissingRelationError(error, 'profiles'))) {
        ;({ data, error } = await baseQuery('*').order('created_at', { ascending: false }))
      }
    }

    return { data, error }
  },

  async getTotalCommentsCount({ videoId = null, photoId = null } = {}) {
    try {
      if (!videoId && !photoId) return { count: 0, error: null }

      let q = supabase.from('comments').select('id', { count: 'exact' }).range(0, 0)
      q = videoId ? q.eq('video_id', videoId) : q.eq('photo_id', photoId)

      const { count, error } = await q
      if (error) return { count: 0, error }
      return { count: Number(count) || 0, error: null }
    } catch (error) {
      return { count: 0, error }
    }
  },

  async addComment({ videoId = null, photoId = null, parentId = null, content }) {
    try {
      const {
        data: { user },
      } = await safeGetUser()
      if (!user) throw new Error('Usuário não autenticado')

      if (!videoId && !photoId) throw new Error('Deve fornecer videoId ou photoId')

      const basePayload = {
        user_id: user.id,
        video_id: videoId,
        photo_id: photoId,
        content,
      }

      // Prefer parent_id (current schema). We'll retry other patterns only if needed.
      const candidates = []
      if (parentId) {
        candidates.push({ ...basePayload, parent_id: parentId })
        // Common legacy alternatives (just in case)
        candidates.push({ ...basePayload, parent_comment_id: parentId })
        candidates.push({ ...basePayload, reply_to_id: parentId })
        candidates.push({ ...basePayload, reply_to_comment_id: parentId })
      } else {
        candidates.push({ ...basePayload })
      }

      const insertPlain = async (payload) =>
        await supabase.from('comments').insert(payload).select('*').single()

      let last = null
      for (const payload of candidates) {
        // Ensure profile exists if schema has FK to public.profiles.
        try {
          await ensureOwnProfileExists(user)
        } catch {
          // ignore
        }

        const r = await insertPlain(payload)
        last = r
        if (!r.error) {
          const profile = await fetchProfileById(user.id)
          const enriched = profile ? { ...r.data, user: profile } : r.data
          return { data: enriched, error: null }
        }

        // If reply column is missing, try next candidate (or return unsupported).
        const triedReplyField = parentId && Object.keys(payload).some((k) => String(k).toLowerCase().includes('parent') || String(k).toLowerCase().includes('reply'))
        if (triedReplyField) {
          const missingReplyColumn =
            isMissingColumnError(r.error, 'parent_id') ||
            isMissingColumnError(r.error, 'parent_comment_id') ||
            isMissingColumnError(r.error, 'reply_to_id') ||
            isMissingColumnError(r.error, 'reply_to_comment_id')

          if (missingReplyColumn) continue
        }

        // FK violation: attempt profile creation once and retry same payload.
        if (isForeignKeyViolation(r.error)) {
          await ensureOwnProfileExists(user)
          const r2 = await insertPlain(payload)
          if (!r2.error) {
            const profile = await fetchProfileById(user.id)
            const enriched = profile ? { ...r2.data, user: profile } : r2.data
            return { data: enriched, error: null }
          }
          last = r2
        }

        // Permission denied won't be fixed by trying other columns.
        if (isPermissionDeniedError(r.error)) break
      }

      if (last?.error && parentId && (isMissingColumnError(last.error, 'parent_id') || isMissingColumnError(last.error, 'parent_comment_id'))) {
        return { data: null, error: new Error('Respostas não suportadas neste schema.') }
      }

      return { data: null, error: last?.error || new Error('Falha ao inserir comentário') }
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
      } = await safeGetUser()
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
      } = await safeGetUser()
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
      } = await safeGetUser()
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
