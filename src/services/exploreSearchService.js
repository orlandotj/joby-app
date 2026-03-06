import { supabase } from '@/lib/supabaseClient'

const isMissingColumnError = (error) => {
  const msg = String(error?.message || error || '').toLowerCase()
  return msg.includes('column') && msg.includes('does not exist')
}

const isPermissionDeniedError = (error) => {
  const code = String(error?.code || '')
  const status = Number(error?.status || error?.statusCode || 0)
  const msg = String(error?.message || error || '').toLowerCase()
  return code === '42501' || status === 403 || msg.includes('permission denied')
}

const normalizeTerm = (term) => (term || '').trim()

const toIlike = (term) => `%${term}%`

async function trySelect(baseBuilder, selectVariants) {
  let last = null
  for (const select of selectVariants) {
    const res = await baseBuilder(select)
    if (!res?.error) return res
    last = res
    if (!isMissingColumnError(res.error)) break
  }
  return last
}

export function inferSearchIntent(rawTerm) {
  const term = normalizeTerm(rawTerm)
  if (!term) return { type: 'featured', term: '' }
  if (term.startsWith('@')) return { type: 'people', term: term.slice(1).trim() }
  if (term.split(/\s+/).length >= 3) return { type: 'posts', term }
  return { type: 'mixed', term }
}

export async function searchProfiles(rawTerm, { limit = 12 } = {}) {
  const intent = inferSearchIntent(rawTerm)
  const term = normalizeTerm(intent.term)

  const selectVariants = [
    'id, username, avatar, profession, bio, location, rating, is_verified, created_at, experience_start_year, joby_since_year',
    'id, username, avatar, profession, bio, location, rating, is_verified, created_at',
    'id, username, avatar, profession, bio, location, rating, created_at',
    'id, name, avatar, profession, bio, location, rating, is_verified, created_at, experience_start_year, joby_since_year',
    'id, name, avatar, profession, bio, location, rating, is_verified, created_at',
    'id, name, avatar, profession, bio, location, rating, created_at',
  ]

  const build = (select) => {
    let q = supabase.from('profiles').select(select).limit(limit)

    if (term) {
      if (intent.type === 'people') {
        q = q.ilike('username', toIlike(term))
      } else {
        q = q.or(
          `username.ilike.${toIlike(term)},profession.ilike.${toIlike(term)},bio.ilike.${toIlike(term)},location.ilike.${toIlike(term)}`
        )
      }
    }

    // Ordenação: verificado, rating, recente
    q = q.order('is_verified', { ascending: false, nullsFirst: false })
    q = q.order('rating', { ascending: false, nullsFirst: false })
    q = q.order('created_at', { ascending: false })

    return q
  }

  const res = await trySelect((select) => build(select), selectVariants)
  if (res?.error && isPermissionDeniedError(res.error)) {
    return { data: [], error: res.error, blocked: true }
  }
  return { data: res?.data || [], error: res?.error || null }
}

export async function searchServices(rawTerm, { limit = 12 } = {}) {
  const term = normalizeTerm(rawTerm)

  const selectVariants = [
    `id, title, description, category, price, price_unit, image, is_active, created_at, user:user_id(id, username, name, avatar, profession, rating, location, can_offer_service, is_verified, created_at, experience_start_year, joby_since_year)` ,
    `id, title, description, category, price, price_unit, image, is_active, created_at, user:user_id(id, username, name, avatar, profession, rating, location, can_offer_service, is_verified, created_at)` ,
    `id, title, description, category, price, price_unit, image, is_active, created_at, user:user_id(id, username, avatar, profession, rating, location, can_offer_service, is_verified, created_at, experience_start_year, joby_since_year)` ,
    `id, title, description, category, price, price_unit, image, is_active, created_at, user:user_id(id, username, avatar, profession, rating, location, can_offer_service, is_verified, created_at)` ,
    `id, title, description, category, price, price_unit, image, is_active, created_at, user:user_id(id, name, avatar, profession, rating, location, can_offer_service, is_verified, created_at, experience_start_year, joby_since_year)` ,
    `id, title, description, category, price, price_unit, image, is_active, created_at, user:user_id(id, name, avatar, profession, rating, location, can_offer_service, is_verified, created_at)` ,
  ]

  const build = (select) => {
    let q = supabase.from('services').select(select).limit(limit)

    if (term) {
      q = q.or(
        `title.ilike.${toIlike(term)},description.ilike.${toIlike(term)},category.ilike.${toIlike(term)}`
      )
    }

    // Ordenação: ativos primeiro, rating do profissional (quando disponível), preço (opcional), recente
    q = q.order('is_active', { ascending: false })

    // ordem por rating do profissional (foreignTable) pode variar por schema; se falhar, o caller ainda exibe resultados
    q = q.order('rating', { foreignTable: 'user', ascending: false, nullsFirst: false })
    q = q.order('created_at', { ascending: false })

    return q
  }

  const res = await trySelect((select) => build(select), selectVariants)

  // Se o embed do user falhar por permissão no profiles (RLS), fazemos fallback sem join.
  // Isso mantém a aba Publicações funcionando e permite listar serviços (sem profissional).
  if (res?.error && isPermissionDeniedError(res.error)) {
    const fallback = await supabase
      .from('services')
      .select('id, title, description, category, price, price_unit, image, is_active, created_at, user_id')
      .limit(limit)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false })

    return {
      data: fallback?.data || [],
      error: fallback?.error || res.error,
      blocked: true,
    }
  }

  const services = (res?.data || []).filter((s) => {
    const canOffer = s?.user?.can_offer_service
    return canOffer !== false
  })

  return { data: services, error: res?.error || null }
}

export async function searchVideos(rawTerm, { limit = 12, page = null } = {}) {
  const term = normalizeTerm(rawTerm)

  const base = (select, { orderCommentsCount } = {}) => {
    let q = supabase.from('videos').select(select).eq('is_public', true)

    if (typeof page === 'number' && Number.isFinite(page) && page >= 0) {
      const from = page * limit
      const to = from + limit - 1
      q = q.range(from, to)
    } else {
      q = q.limit(limit)
    }

    if (term) {
      q = q.or(`title.ilike.${toIlike(term)},description.ilike.${toIlike(term)}`)
    }

    q = q.order('views', { ascending: false, nullsFirst: false })
    q = q.order('likes', { ascending: false, nullsFirst: false })
    if (orderCommentsCount) {
      q = q.order('comments_count', { ascending: false, nullsFirst: false })
    }
    q = q.order('created_at', { ascending: false })

    return q
  }

  // IMPORTANT: don't depend on optional columns (provider/comments_count). We'll try the richest query first,
  // then progressively fall back removing joins and missing columns.
  const selectVariants = {
    withUser: {
      withCommentsCount: [
        `id, url, provider, title, description, thumbnail_url, thumbnail, video_type, views, likes, comments_count, created_at, user:user_id(id, username, name, avatar, profession, location)`,
        `id, url, provider, title, description, thumbnail, video_type, views, likes, comments_count, created_at, user:user_id(id, username, name, avatar, profession, location)`,
        `id, url, title, description, thumbnail_url, thumbnail, video_type, views, likes, comments_count, created_at, user:user_id(id, username, name, avatar, profession, location)`,
        `id, url, title, description, thumbnail, video_type, views, likes, comments_count, created_at, user:user_id(id, username, name, avatar, profession, location)`,
      ],
      withoutCommentsCount: [
        `id, url, provider, title, description, thumbnail_url, thumbnail, video_type, views, likes, created_at, user:user_id(id, username, name, avatar, profession, location)`,
        `id, url, provider, title, description, thumbnail, video_type, views, likes, created_at, user:user_id(id, username, name, avatar, profession, location)`,
        `id, url, title, description, thumbnail_url, thumbnail, video_type, views, likes, created_at, user:user_id(id, username, name, avatar, profession, location)`,
        `id, url, title, description, thumbnail, video_type, views, likes, created_at, user:user_id(id, username, name, avatar, profession, location)`,
      ],
    },
    withoutUser: {
      withCommentsCount: [
        `id, url, provider, title, description, thumbnail_url, thumbnail, video_type, views, likes, comments_count, created_at`,
        `id, url, provider, title, description, thumbnail, video_type, views, likes, comments_count, created_at`,
        `id, url, title, description, thumbnail_url, thumbnail, video_type, views, likes, comments_count, created_at`,
        `id, url, title, description, thumbnail, video_type, views, likes, comments_count, created_at`,
      ],
      withoutCommentsCount: [
        `id, url, provider, title, description, thumbnail_url, thumbnail, video_type, views, likes, created_at`,
        `id, url, provider, title, description, thumbnail, video_type, views, likes, created_at`,
        `id, url, title, description, thumbnail_url, thumbnail, video_type, views, likes, created_at`,
        `id, url, title, description, thumbnail, video_type, views, likes, created_at`,
      ],
    },
  }

  const tryQuery = async ({ includeUser, includeCommentsCount }) => {
    const variants = includeUser
      ? includeCommentsCount
        ? selectVariants.withUser.withCommentsCount
        : selectVariants.withUser.withoutCommentsCount
      : includeCommentsCount
      ? selectVariants.withoutUser.withCommentsCount
      : selectVariants.withoutUser.withoutCommentsCount

    const res = await trySelect(
      (select) => base(select, { orderCommentsCount: includeCommentsCount }),
      variants
    )

    // If includeUser was requested but RLS blocks the join, return as-is so caller can decide fallback.
    return res
  }

  // 1) Try with user + comments_count
  // 2) Then without comments_count
  // 3) If join is blocked (RLS), try without user (also tolerant to missing thumbnail_url)
  let res = await tryQuery({ includeUser: true, includeCommentsCount: true })
  if (res?.error && isMissingColumnError(res.error)) {
    res = await tryQuery({ includeUser: true, includeCommentsCount: false })
  }

  if (res?.error && isPermissionDeniedError(res.error)) {
    // Join blocked: retry without user embed
    const r1 = await tryQuery({ includeUser: false, includeCommentsCount: true })
    if (!r1?.error) {
      return { data: r1?.data || [], error: null, blocked: true }
    }

    // If comments_count doesn't exist (or other missing optional), drop it.
    const r2 = isMissingColumnError(r1?.error)
      ? await tryQuery({ includeUser: false, includeCommentsCount: false })
      : r1
    return { data: r2?.data || [], error: r2?.error || res.error, blocked: true }
  }

  return { data: res?.data || [], error: res?.error || null }
}

export async function searchPhotos(rawTerm, { limit = 12 } = {}) {
  const term = normalizeTerm(rawTerm)

  const base = (select, { orderCommentsCount } = {}) => {
    let q = supabase.from('photos').select(select).eq('is_public', true).limit(limit)

    if (term) {
      q = q.ilike('caption', toIlike(term))
    }

    q = q.order('likes', { ascending: false, nullsFirst: false })
    if (orderCommentsCount) {
      q = q.order('comments_count', { ascending: false, nullsFirst: false })
    }
    q = q.order('created_at', { ascending: false })

    return q
  }

  // IMPORTANT: don't depend on optional columns (provider/comments_count). We'll try the richest query first,
  // then progressively fall back removing joins and missing columns.
  const attempts = [
    () =>
      base(
        `id, url, image_full_url, image_thumb_url, width_full, height_full, width_thumb, height_thumb, caption, likes, comments_count, created_at, user:user_id(id, username, name, avatar, profession)`,
        { orderCommentsCount: true }
      ),
    () =>
      base(
        `id, url, image_full_url, image_thumb_url, width_full, height_full, width_thumb, height_thumb, caption, likes, comments_count, created_at`,
        { orderCommentsCount: true }
      ),
    () =>
      base(
        `id, url, image_full_url, image_thumb_url, width_full, height_full, width_thumb, height_thumb, caption, likes, created_at, user:user_id(id, username, name, avatar, profession)`,
        { orderCommentsCount: false }
      ),
    () =>
      base(
        `id, url, image_full_url, image_thumb_url, width_full, height_full, width_thumb, height_thumb, caption, likes, created_at`,
        { orderCommentsCount: false }
      ),
    () =>
      base(
        `id, url, caption, likes, comments_count, created_at, user:user_id(id, username, name, avatar, profession)`,
        { orderCommentsCount: true }
      ),
    () => base(`id, url, caption, likes, comments_count, created_at`, { orderCommentsCount: true }),
    () =>
      base(`id, url, caption, likes, created_at, user:user_id(id, username, name, avatar, profession)`, {
        orderCommentsCount: false,
      }),
    () => base(`id, url, caption, likes, created_at`, { orderCommentsCount: false }),
  ]

  let res = null
  for (const run of attempts) {
    const r = await run()
    if (!r?.error) {
      res = r
      break
    }
    res = r
    if (!isMissingColumnError(r.error)) break
  }

  if (!res) res = { data: [], error: null }
  if (res?.error && isPermissionDeniedError(res.error)) {
    const fallback = await supabase
      .from('photos')
      .select('id, url, caption, likes, comments_count, created_at')
      .eq('is_public', true)
      .limit(limit)
      .order('likes', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    return { data: fallback?.data || [], error: fallback?.error || res.error, blocked: true }
  }
  return { data: res?.data || [], error: res?.error || null }
}

export async function exploreSearch(rawTerm, { limits } = {}) {
  const term = normalizeTerm(rawTerm)
  const intent = inferSearchIntent(rawTerm)

  const l = {
    profiles: limits?.profiles ?? 8,
    services: limits?.services ?? 8,
    videos: limits?.videos ?? 10,
    photos: limits?.photos ?? 10,
  }

  // Se estiver vazio, retornamos "destaques" (sem filtro) com limites menores
  const effectiveTerm = term

  const [profiles, services, videos, photos] = await Promise.all([
    searchProfiles(effectiveTerm, { limit: l.profiles }),
    searchServices(effectiveTerm, { limit: l.services }),
    searchVideos(effectiveTerm, { limit: l.videos }),
    searchPhotos(effectiveTerm, { limit: l.photos }),
  ])

  const publications = [
    ...(videos.data || []).map((v) => ({ ...v, type: 'video' })),
    ...(photos.data || []).map((p) => ({ ...p, type: 'photo' })),
  ]

  return {
    intent,
    profiles: profiles.data || [],
    services: services.data || [],
    videos: videos.data || [],
    photos: photos.data || [],
    publications,
    errors: {
      profiles: profiles.error,
      services: services.error,
      videos: videos.error,
      photos: photos.error,
    },
  }
}
