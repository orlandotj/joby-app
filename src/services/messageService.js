import { log } from '@/lib/logger'
import { safeGetUser, supabase } from '@/lib/supabaseClient'
import { optimizeImageFile } from '@/lib/imageOptimize'
import { normalizeImage, NormalizeImageError } from '@/services/imageNormalizeService'

const getChannelByName = (channelName, client = supabase) => {
  const expectedTopic = channelName.startsWith('realtime:')
    ? channelName
    : `realtime:${channelName}`
  return client.getChannels().find((ch) => ch.topic === expectedTopic)
}

/**
 * Enviar uma nova mensagem
 */
export const sendMessage = async ({
  receiverId,
  content,
  requestId = null,
  attachmentUrl = null,
  attachmentType = null,
  attachmentName = null,
  mimeType = null,
  attachmentSize = null,
  thumbUrl = null,
  duration = null,
}) => {
  try {
    const {
      data: { user },
    } = await safeGetUser()
    if (!user) throw new Error('Usuário não autenticado')

    const safeReceiverId = String(receiverId || '').trim()
    if (!safeReceiverId) throw new Error('Destinatário inválido')

    const deriveFallbackName = (u) => {
      const meta = u?.user_metadata || {}
      const fromMeta = String(meta.name || meta.full_name || meta.display_name || '').trim()
      if (fromMeta) return fromMeta
      const email = String(u?.email || '').trim()
      if (email && email.includes('@')) return email.split('@')[0]
      return 'Usuário'
    }

    const text = String(content ?? '').trim()
    const hasAttachments = Boolean(attachmentUrl || attachmentType || attachmentName)
    if (!text && !hasAttachments) throw new Error('Mensagem vazia')

    const isMissingColumnError = (err, column = null) => {
      const msg = String(err?.message || '').toLowerCase()
      if (!msg.includes('column') || !msg.includes('does not exist')) return false
      if (!column) return true
      return msg.includes(String(column).toLowerCase())
    }

    const isMissingRelationshipError = (err) => {
      const msg = String(err?.message || '').toLowerCase()
      return (
        msg.includes('could not find') && msg.includes('relationship')
      )
    }

    const insertMessage = async (payload) => {
      // Fluxo único e confiável: inserir 1x (sem embeds), depois tentar enriquecer (best-effort).
      let base = await supabase.from('messages').insert(payload).select('*').single()

      // Fallback: schemas sem coluna request_id
      if (base?.error && isMissingColumnError(base.error, 'request_id')) {
        const { request_id: _ignore, ...withoutRequestId } = payload || {}
        base = await supabase.from('messages').insert(withoutRequestId).select('*').single()
      }

      if (base?.error) return base

      try {
        const enriched = await supabase
          .from('messages')
          .select(
            `
            *,
            sender:profiles!sender_id(id, username, name, avatar, profession),
            receiver:profiles!receiver_id(id, username, name, avatar, profession)
          `
          )
          .eq('id', base.data.id)
          .single()

        if (!enriched?.error) return enriched
        if (isMissingRelationshipError(enriched.error)) return base
        return base
      } catch (_e) {
        return base
      }
    }

    // IMPORTANTE: não bloquear envio por falta de profile.
    // (O ambiente pode ter RLS/GRANT restritivo em public.profiles.)

    const safeRequestId = String(requestId || '').trim()

    const basePayload = {
      sender_id: user.id,
      receiver_id: safeReceiverId,
      content: text,
      // Em alguns schemas existe `is_read`, em outros só `read_at`.
      // Vamos tentar `is_read` e fazer fallback se a coluna não existir.
      is_read: false,
    }

    // Mensagens de solicitação (chat separado por booking)
    if (safeRequestId) {
      basePayload.request_id = safeRequestId
    }

    // Blindagem: se faltar a linha em `profiles` para ESTE usuário,
    // o FK `messages.sender_id -> profiles.id` pode bloquear o envio.
    // Tentamos criar um profile mínimo (best-effort) sem impedir quem já está ok.
    try {
      const existingProfile = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

      if (!existingProfile?.data?.id) {
        await supabase
          .from('profiles')
          .insert({
            id: user.id,
            name: deriveFallbackName(user),
          })
      }
    } catch (_e) {
      // ignore (RLS/schema pode variar)
    }

    // Se o destinatário não tiver profile, o FK também impede o envio.
    // Só validamos (não podemos criar profiles de outros via RLS).
    try {
      const receiverProfile = await supabase
        .from('profiles')
        .select('id')
        .eq('id', safeReceiverId)
        .maybeSingle()
      if (!receiverProfile?.data?.id) {
        throw new Error(
          'O destinatário ainda não tem perfil (profiles). Peça para ele completar/cadastrar o perfil.'
        )
      }
    } catch (e) {
      // Se esse erro for por falta real do profile, estoura.
      const msg = String(e?.message || '')
      if (msg.includes('destinatário') || msg.includes('profiles')) throw e
    }

    const extendedPayload = {
      ...basePayload,
      attachment_url: attachmentUrl,
      attachment_type: attachmentType,
      attachment_name: attachmentName,
      mime_type: mimeType,
      attachment_size: attachmentSize,
      thumb_url: thumbUrl,
      duration,
    }

    const stripIsRead = (payload) => {
      const next = { ...payload }
      delete next.is_read
      return next
    }

    const stripAttachments = (payload) => {
      const next = { ...payload }
      delete next.attachment_url
      delete next.attachment_type
      delete next.attachment_name
      delete next.mime_type
      delete next.attachment_size
      delete next.thumb_url
      delete next.duration
      return next
    }

    const basePayloadWithAttachmentContent = hasAttachments && attachmentUrl
      ? {
          ...basePayload,
          content: `${basePayload.content}\n\n${String(attachmentUrl).trim()}`.trim(),
        }
      : basePayload

    const initialPayload = hasAttachments ? extendedPayload : basePayload

    // 1) Tentativa principal
    let res = await insertMessage(initialPayload)

    // 2) Fallback: coluna is_read não existe
    if (res?.error && isMissingColumnError(res.error, 'is_read')) {
      res = await insertMessage(stripIsRead(initialPayload))
    }

    // 3) Se falhou por coluna inexistente e estamos enviando anexo,
    // NÃO fazer fallback que perde o anexo. Falha explícita para corrigir o schema.
    if (res?.error && isMissingColumnError(res.error) && hasAttachments) {
      throw new Error(
        'Banco sem colunas de anexo (messages). Rode a migration de anexos do chat (attachment_url/type/name + mime_type + attachment_size).' 
      )
    }

    // 4) Fallback legado (somente para mensagens sem anexo): remover campos extras.
    if (res?.error && isMissingColumnError(res.error) && !hasAttachments) {
      res = await insertMessage(stripAttachments(stripIsRead(initialPayload)))
    }

    if (res.error) {
      const code = String(res.error?.code || '')
      if (code === '23503') {
        // FK violation (bem provável profiles faltando)
        throw new Error(
          'Não foi possível enviar: falta perfil (profiles) para algum usuário. Faça login novamente ou complete o cadastro/perfil.'
        )
      }
      throw res.error
    }
    return { data: res.data, error: null }
  } catch (error) {
    log.error('MESSAGES', 'Erro ao enviar mensagem:', error)
    return { data: null, error }
  }
}

/**
 * Buscar conversas do usuário
 */
export const getUserConversations = async () => {
  try {
    const {
      data: { user },
    } = await safeGetUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data, error } = await supabase.rpc('get_user_conversations', {
      user_uuid: user.id,
    })

    if (error) throw error

    // Buscar dados dos contatos
    if (data && data.length > 0) {
      const contactIds = data.map((conv) => conv.other_user_id)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, name, avatar, profession')
        .in('id', contactIds)

      if (profilesError) throw profilesError

      // Combinar dados
      const conversationsWithProfiles = data.map((conv) => ({
        ...conv,
        contact: profiles.find((p) => p.id === conv.other_user_id),
      }))

      return { data: conversationsWithProfiles, error: null }
    }

    return { data: [], error: null }
  } catch (error) {
    log.error('MESSAGES', 'Erro ao buscar conversas:', error)
    return { data: null, error }
  }
}

/**
 * Buscar mensagens entre dois usuários
 */
export const getConversationMessages = async (otherUserId) => {
  try {
    const {
      data: { user },
    } = await safeGetUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data, error } = await supabase
      .from('messages')
      .select(
        `
        *,
        sender:profiles!sender_id(id, username, name, avatar, profession),
        receiver:profiles!receiver_id(id, username, name, avatar, profession)
      `
      )
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`
      )
      .order('created_at', { ascending: true })

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    log.error('MESSAGES', 'Erro ao buscar mensagens:', error)
    return { data: null, error }
  }
}

/**
 * Marcar mensagens como lidas
 */
export const markMessagesAsRead = async (senderId) => {
  try {
    const {
      data: { user },
    } = await safeGetUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { error } = await supabase.rpc('mark_messages_as_read', {
      sender_uuid: senderId,
      receiver_uuid: user.id,
    })

    if (error) throw error
    return { error: null }
  } catch (error) {
    log.error('MESSAGES', 'Erro ao marcar mensagens como lidas:', error)
    return { error }
  }
}

/**
 * Contar mensagens não lidas
 */
export const countUnreadMessages = async () => {
  try {
    const {
      data: { user },
    } = await safeGetUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data, error } = await supabase.rpc('count_unread_messages', {
      user_uuid: user.id,
    })

    if (error) throw error
    return { count: data || 0, error: null }
  } catch (error) {
    log.error('MESSAGES', 'Erro ao contar mensagens não lidas:', error)
    return { count: 0, error }
  }
}

/**
 * Fazer upload de anexo para mensagem
 */
export const uploadMessageAttachment = async (file) => {
  try {
    const {
      data: { user },
    } = await safeGetUser()
    if (!user) throw new Error('Usuário não autenticado')

    if (!file) throw new Error('Arquivo inválido')

    const mime = String(file.type || '').toLowerCase()
    const nameLower = String(file?.name || '').toLowerCase()
    const extFromName = (() => {
      const raw = String(file?.name || '').split('.').pop() || ''
      const safe = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
      return safe || null
    })()

    const isPdf = mime === 'application/pdf' || extFromName === 'pdf'

    const IMAGE_EXTS = new Set([
      'jpg',
      'jpeg',
      'png',
      'webp',
      'gif',
      'heic',
      'heif',
      'avif',
      'bmp',
      'tif',
      'tiff',
    ])

    const isLikelyImage = mime.startsWith('image/') || (!!extFromName && IMAGE_EXTS.has(extFromName))

    // Passo 1 (MVP): apenas Foto + PDF
    if (!isLikelyImage && !isPdf) {
      throw new Error('Tipo de arquivo não suportado. Envie Foto ou PDF.')
    }

    const attachmentType = isLikelyImage ? 'image' : 'pdf'

    const isGif =
      mime === 'image/gif' ||
      nameLower.endsWith('.gif') ||
      extFromName === 'gif'

    const MAX_IMAGE_INPUT_BYTES = 30 * 1024 * 1024
    const MAX_PDF_BYTES = 10 * 1024 * 1024

    const canUploadOriginalAsLastResort = () => {
      // Minimal safety: require it to look like an image by mime or extension.
      return isLikelyImage && !isPdf
    }

    const mimeFromExt = (ext) => {
      const e = String(ext || '').toLowerCase()
      if (e === 'jpg' || e === 'jpeg') return 'image/jpeg'
      if (e === 'png') return 'image/png'
      if (e === 'webp') return 'image/webp'
      return null
    }

    const extFromMime = (t) => {
      const tt = String(t || '').toLowerCase()
      if (tt === 'image/webp') return 'webp'
      if (tt === 'image/png') return 'png'
      if (tt === 'image/jpg' || tt === 'image/jpeg') return 'jpg'
      if (tt === 'application/pdf') return 'pdf'
      return null
    }

    const getUploadExt = ({ fileToUpload, isImageUpload, isPdfUpload }) => {
      if (isPdfUpload) return 'pdf'
      if (isImageUpload) {
        const fromMime = extFromMime(fileToUpload?.type)
        if (fromMime) return fromMime
        // Last-resort fallback.
        if (extFromName) return extFromName
        return 'bin'
      }
      return 'bin'
    }

    const getUploadContentType = ({ fileToUpload, isImageUpload, isPdfUpload }) => {
      const direct = String(fileToUpload?.type || '').toLowerCase()
      if (direct) return direct
      if (isPdfUpload) return 'application/pdf'
      if (isImageUpload) {
        const inferred = mimeFromExt(getUploadExt({ fileToUpload, isImageUpload, isPdfUpload }))
        return inferred || 'application/octet-stream'
      }
      return 'application/octet-stream'
    }

    const originalSize = Number(file?.size || 0) || 0
    let optimized = false
    let newSize = originalSize
    let fileToUpload = file

    if (isLikelyImage && !isPdf) {

      if (originalSize > MAX_IMAGE_INPUT_BYTES) {
        throw new Error('Imagem muito grande. Tente outra (máx. 30MB).')
      }

      try {
        const { file: optimizedFile } = await optimizeImageFile(file, { kind: 'photo' })
        if (optimizedFile?.size && optimizedFile.size > 0) {
          // Always use WEBP output when optimization succeeds.
          fileToUpload = optimizedFile
          optimized = true
          newSize = Number(optimizedFile.size || 0) || 0
        }
      } catch (err) {
        const isUnsupportedClient =
          err?.code === 'IMAGE_TYPE_NOT_ALLOWED' || err?.code === 'GIF_NOT_SUPPORTED'

        if (isUnsupportedClient) {
          try {
            const normalized = await normalizeImage({ file, context: 'chat_image', target: 'webp' })
            const storageRef = normalized?.result?.url
            if (!storageRef || !String(storageRef).startsWith('storage://')) {
              throw new Error('Resposta inválida do servidor ao normalizar imagem.')
            }

            return {
              url: String(storageRef),
              attachmentType,
              mimeType: String(normalized?.result?.contentType || mime || 'application/octet-stream'),
              name: file?.name || null,
              size: Number(normalized?.result?.bytes || 0) || Number(file?.size || 0) || 0,
              optimized: false,
              originalSize: originalSize,
              newSize: Number(normalized?.result?.bytes || 0) || originalSize,
              error: null,
              warnings: normalized?.warnings || [],
            }
          } catch (e) {
            const status = e instanceof NormalizeImageError ? e.status : 0
            const msg =
              status === 415
                ? 'Esse formato não pode ser convertido no servidor no momento.'
                : e?.message || 'Falha ao converter a imagem no servidor.'

            // Last resort: upload original if it still looks like an image.
            if (!canUploadOriginalAsLastResort()) {
              throw new Error(msg)
            }

            fileToUpload = file
            optimized = false
            newSize = originalSize
          }
        }

        // Unexpected optimization error: safe fallback to original file.
        try {
          if (import.meta.env.DEV) {
            log.warn('MESSAGES', 'message_attachment_image_optimize_failed', err)
          }
        } catch {
          // ignore
        }

        fileToUpload = file
        optimized = false
        newSize = originalSize
      }
    }

    if (isPdf) {
      if (originalSize > MAX_PDF_BYTES) {
        throw new Error('Arquivo muito grande. Máximo 10MB.')
      }
    }

    const safeExt = getUploadExt({ fileToUpload, isImageUpload: isLikelyImage, isPdfUpload: isPdf })
    const objectPath = `message-attachments/${user.id}/${Date.now()}.${safeExt}`

    // Reusar o mesmo padrão que já está estável no feed: Supabase Storage upload direto.
    const { error } = await supabase.storage
      .from('photos')
      .upload(objectPath, fileToUpload, {
        cacheControl: '3600',
        upsert: false,
        contentType: getUploadContentType({
          fileToUpload,
          isImageUpload: isLikelyImage,
          isPdfUpload: isPdf,
        }),
      })

    if (error) throw error

    const storageRef = `storage://photos/${objectPath}`

    return {
      // IMPORTANT: store the stable reference, not an expiring URL.
      // The UI will resolve this to a signed URL on demand so it works “pra sempre”.
      url: storageRef,
      attachmentType,
      mimeType: getUploadContentType({
        fileToUpload,
        isImageUpload: isLikelyImage,
        isPdfUpload: isPdf,
      }),
      name: file?.name || null,
      size: Number(fileToUpload?.size || 0) || 0,
      optimized: isLikelyImage && !isPdf ? optimized : false,
      originalSize: isLikelyImage && !isPdf ? originalSize : Number(file?.size || 0) || 0,
      newSize: isLikelyImage && !isPdf ? newSize : Number(fileToUpload?.size || 0) || 0,
      error: null,
    }
  } catch (error) {
    log.error('MESSAGES', 'Erro ao fazer upload de anexo:', error)
    return { url: null, error }
  }
}

/**
 * Deletar mensagem
 */
export const deleteMessage = async (messageId) => {
  try {
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)

    if (error) throw error
    return { error: null }
  } catch (error) {
    log.error('MESSAGES', 'Erro ao deletar mensagem:', error)
    return { error }
  }
}

/**
 * Subscrever a novas mensagens em tempo real
 */
export const subscribeToMessages = (currentUserId, otherUserId, callback) => {
  const channelName = `messages:${currentUserId}:${otherUserId}`
  const client = supabase

  // Remover canal existente para evitar múltiplos subscribes
  const existingChannel = getChannelByName(channelName, client)
  if (existingChannel) {
    try {
      // Best-effort: evita eventos ainda chegando após troca rápida.
      existingChannel.unsubscribe?.()
    } catch (_e) {
      // ignore
    }
    client.removeChannel(existingChannel)
  }

  const subscription = client.channel(channelName)

  const isRelationshipMissing = (err) => {
    const msg = String(err?.message || '').toLowerCase()
    return msg.includes('could not find') && msg.includes('relationship')
  }

  const emitInsert = async (payload) => {
    const isReceived =
      payload.new.receiver_id === currentUserId &&
      payload.new.sender_id === otherUserId
    const isSent =
      payload.new.sender_id === currentUserId &&
      payload.new.receiver_id === otherUserId
    if (!isReceived && !isSent) return

    // Best-effort: tentar trazer join do remetente; se falhar, usa payload.new.
    try {
      const res = await supabase
        .from('messages')
        .select(
          `
          *,
          sender:profiles!sender_id(id, username, name, avatar, profession),
          receiver:profiles!receiver_id(id, username, name, avatar, profession)
        `
        )
        .eq('id', payload.new.id)
        .single()

      if (res?.error) {
        if (isRelationshipMissing(res.error)) {
          const simple = await supabase.from('messages').select('*').eq('id', payload.new.id).single()
          callback(simple?.data || payload.new)
          return
        }
        callback(payload.new)
        return
      }

      callback(res.data || payload.new)
    } catch (_e) {
      callback(payload.new)
    }
  }

  const emitUpdate = (payload) => {
    const isRelevant =
      (payload.new.sender_id === currentUserId &&
        payload.new.receiver_id === otherUserId) ||
      (payload.new.receiver_id === currentUserId &&
        payload.new.sender_id === otherUserId)
    if (!isRelevant) return

    // Suportar schemas com `is_read` e/ou `read_at`.
    // Em caso de UPDATE, sempre emitimos e deixamos o consumidor normalizar.
    callback(payload.new, 'UPDATE')
  }

  // INSERT (recebidas)
  subscription.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `receiver_id=eq.${currentUserId}`,
    },
    emitInsert
  )

  // INSERT (enviadas)
  subscription.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `sender_id=eq.${currentUserId}`,
    },
    emitInsert
  )

  // UPDATE (recebidas)
  subscription.on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages',
      filter: `receiver_id=eq.${currentUserId}`,
    },
    emitUpdate
  )

  // UPDATE (enviadas)
  subscription.on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages',
      filter: `sender_id=eq.${currentUserId}`,
    },
    emitUpdate
  )

  subscription.subscribe()

  return () => {
    try {
      subscription.unsubscribe?.()
    } catch (_e) {
      // ignore
    }
    client.removeChannel(subscription)
  }
}

/**
 * Enviar sinal de que o usuário está digitando
 */
export const sendTypingIndicator = async (receiverId, { senderId } = {}) => {
  try {
    const providedSenderId = String(senderId || '').trim()
    let effectiveSenderId = providedSenderId

    if (!effectiveSenderId) {
      const {
        data: { user },
      } = await safeGetUser()
      effectiveSenderId = String(user?.id || '').trim()
    }

    if (!effectiveSenderId) return

    const channelName = `typing:${receiverId}`

    // Buscar ou criar canal
    let channel = getChannelByName(channelName)

    if (!channel) {
      channel = supabase.channel(channelName)
      await channel.subscribe()
    }

    await channel.track({
      user_id: effectiveSenderId,
      typing: true,
      timestamp: new Date().toISOString(),
    })

    return channel
  } catch (error) {
    log.error('MESSAGES', 'Erro ao enviar indicador de digitação:', error)
  }
}

/**
 * Parar de enviar sinal de digitação
 */
export const stopTypingIndicator = async (channel) => {
  try {
    if (channel) {
      await channel.untrack()
      // Não chame subscribe() novamente no mesmo channel instance.
      // Mantemos o canal ativo e só removemos a presença.
    }
  } catch (error) {
    log.error('MESSAGES', 'Erro ao parar indicador de digitação:', error)
  }
}

/**
 * Subscrever ao status de digitação
 */
export const subscribeToTyping = (currentUserId, callback) => {
  const channelName = `typing:${currentUserId}`
  const client = supabase

  // Remover canal existente para evitar múltiplos subscribes
  const existingChannel = getChannelByName(channelName, client)
  if (existingChannel) {
    client.removeChannel(existingChannel)
  }

  const channel = client.channel(channelName)

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const typingUsers = Object.values(state).flat()
      const isTyping = typingUsers.length > 0
      callback(isTyping, typingUsers[0])
    })
    .subscribe()

  return () => {
    client.removeChannel(channel)
  }
}
