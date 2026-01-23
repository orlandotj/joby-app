import { supabase } from '@/lib/supabaseClient'

const getChannelByName = (channelName) => {
  const expectedTopic = channelName.startsWith('realtime:')
    ? channelName
    : `realtime:${channelName}`
  return supabase.getChannels().find((ch) => ch.topic === expectedTopic)
}

/**
 * Enviar uma nova mensagem
 */
export const sendMessage = async ({
  receiverId,
  content,
  attachmentUrl = null,
  attachmentType = null,
  attachmentName = null,
}) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: user.id,
        receiver_id: receiverId,
        content,
        attachment_url: attachmentUrl,
        attachment_type: attachmentType,
        attachment_name: attachmentName,
      })
      .select(
        `
        *,
        sender:profiles!sender_id(id, name, avatar, profession),
        receiver:profiles!receiver_id(id, name, avatar, profession)
      `
      )
      .single()

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error)
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
    } = await supabase.auth.getUser()
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
        .select('id, name, avatar, profession')
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
    console.error('Erro ao buscar conversas:', error)
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
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data, error } = await supabase
      .from('messages')
      .select(
        `
        *,
        sender:profiles!sender_id(id, name, avatar, profession),
        receiver:profiles!receiver_id(id, name, avatar, profession)
      `
      )
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`
      )
      .order('created_at', { ascending: true })

    if (error) throw error
    return { data, error: null }
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error)
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
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { error } = await supabase.rpc('mark_messages_as_read', {
      sender_uuid: senderId,
      receiver_uuid: user.id,
    })

    if (error) throw error
    return { error: null }
  } catch (error) {
    console.error('Erro ao marcar mensagens como lidas:', error)
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
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data, error } = await supabase.rpc('count_unread_messages', {
      user_uuid: user.id,
    })

    if (error) throw error
    return { count: data || 0, error: null }
  } catch (error) {
    console.error('Erro ao contar mensagens não lidas:', error)
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
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    // Validar tamanho (máx 10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('Arquivo muito grande. Máximo 10MB.')
    }

    const fileExt = file.name.split('.').pop()
    const fileName = `${user.id}/${Date.now()}.${fileExt}`

    const { data, error } = await supabase.storage
      .from('photos')
      .upload(`message-attachments/${fileName}`, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) throw error

    const storageRef = `storage://photos/message-attachments/${fileName}`

    return {
      url: storageRef,
      type: file.type,
      name: file.name,
      error: null,
    }
  } catch (error) {
    console.error('Erro ao fazer upload de anexo:', error)
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
    console.error('Erro ao deletar mensagem:', error)
    return { error }
  }
}

/**
 * Subscrever a novas mensagens em tempo real
 */
export const subscribeToMessages = (currentUserId, otherUserId, callback) => {
  const channelName = `messages:${currentUserId}:${otherUserId}`

  // Remover canal existente para evitar múltiplos subscribes
  const existingChannel = getChannelByName(channelName)
  if (existingChannel) {
    supabase.removeChannel(existingChannel)
  }

  const subscription = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      },
      async (payload) => {
        // Chamar callback se for mensagem relevante para esta conversa
        const isReceived =
          payload.new.receiver_id === currentUserId &&
          payload.new.sender_id === otherUserId
        const isSent =
          payload.new.sender_id === currentUserId &&
          payload.new.receiver_id === otherUserId

        if (isReceived || isSent) {
          // Buscar dados completos da mensagem com join
          const { data } = await supabase
            .from('messages')
            .select(
              `
              *,
              sender:profiles!sender_id(id, name, avatar, profession)
            `
            )
            .eq('id', payload.new.id)
            .single()

          callback(data || payload.new)
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
      },
      (payload) => {
        // Atualizar status de leitura das mensagens
        const isRelevant =
          (payload.new.sender_id === currentUserId &&
            payload.new.receiver_id === otherUserId) ||
          (payload.new.receiver_id === currentUserId &&
            payload.new.sender_id === otherUserId)

        if (isRelevant && payload.new.read_at) {
          callback(payload.new, 'UPDATE')
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(subscription)
  }
}

/**
 * Enviar sinal de que o usuário está digitando
 */
export const sendTypingIndicator = async (receiverId) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const channelName = `typing:${receiverId}`

    // Buscar ou criar canal
    let channel = getChannelByName(channelName)

    if (!channel) {
      channel = supabase.channel(channelName)
      await channel.subscribe()
    }

    await channel.track({
      user_id: user.id,
      typing: true,
      timestamp: new Date().toISOString(),
    })

    return channel
  } catch (error) {
    console.error('Erro ao enviar indicador de digitação:', error)
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
    console.error('Erro ao parar indicador de digitação:', error)
  }
}

/**
 * Subscrever ao status de digitação
 */
export const subscribeToTyping = (currentUserId, callback) => {
  const channelName = `typing:${currentUserId}`

  // Remover canal existente para evitar múltiplos subscribes
  const existingChannel = getChannelByName(channelName)
  if (existingChannel) {
    supabase.removeChannel(existingChannel)
  }

  const channel = supabase.channel(channelName)

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const typingUsers = Object.values(state).flat()
      const isTyping = typingUsers.length > 0
      callback(isTyping, typingUsers[0])
    })
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
