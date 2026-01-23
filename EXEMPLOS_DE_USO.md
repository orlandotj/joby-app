# 📚 EXEMPLOS DE USO - JOBY APP

Este arquivo contém exemplos práticos de como usar as funcionalidades do Supabase no app.

## 🔐 AUTENTICAÇÃO

### Registrar Novo Usuário

```javascript
import { supabase } from '@/lib/supabaseClient'

// No componente
const handleRegister = async (name, email, password, profession) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, profession },
    },
  })

  if (error) {
    console.error('Erro no registro:', error.message)
    return
  }

  console.log('Usuário criado:', data.user)
  // O perfil será criado automaticamente pelo trigger
}
```

### Fazer Login

```javascript
const handleLogin = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    console.error('Erro no login:', error.message)
    return
  }

  console.log('Usuário logado:', data.user)
}
```

### Recuperar Senha

```javascript
const handleResetPassword = async (email) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'http://localhost:5173/reset-password',
  })

  if (error) {
    console.error('Erro:', error.message)
    return
  }

  console.log('Email enviado!')
}
```

### Logout

```javascript
const handleLogout = async () => {
  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error('Erro:', error.message)
    return
  }

  console.log('Logout realizado')
}
```

---

## 👤 PERFIS

### Buscar Perfil do Usuário Logado

```javascript
const getMyProfile = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Erro:', error.message)
    return null
  }

  return data
}
```

### Buscar Perfil por ID

```javascript
const getProfileById = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  return error ? null : data
}
```

### Atualizar Perfil

```javascript
const updateProfile = async (updates) => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('profiles')
    .update({
      name: updates.name,
      bio: updates.bio,
      profession: updates.profession,
      hourly_rate: updates.hourlyRate,
      location: updates.location,
      phone: updates.phone,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select()
    .single()

  if (error) {
    console.error('Erro:', error.message)
    return null
  }

  return data
}
```

### Buscar Profissionais por Profissão

```javascript
const searchProfessionals = async (profession, location = null) => {
  let query = supabase
    .from('profiles')
    .select('*')
    .eq('is_professional', true)
    .order('rating', { ascending: false })

  if (profession) {
    query = query.eq('profession', profession)
  }

  if (location) {
    query = query.ilike('location', `%${location}%`)
  }

  const { data, error } = await query

  return error ? [] : data
}
```

---

## 📸 UPLOAD DE ARQUIVOS

### Upload de Foto de Perfil

```javascript
const uploadProfilePhoto = async (file) => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const fileExt = file.name.split('.').pop()
  const fileName = `${user.id}/avatar-${Date.now()}.${fileExt}`

  // Upload para storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('profile-photos')
    .upload(fileName, file, { upsert: true })

  if (uploadError) {
    console.error('Erro no upload:', uploadError.message)
    return null
  }

  // Obter URL pública
  const { data: urlData } = supabase.storage
    .from('profile-photos')
    .getPublicUrl(fileName)

  // Atualizar perfil com nova URL
  await supabase
    .from('profiles')
    .update({ avatar: urlData.publicUrl })
    .eq('id', user.id)

  return urlData.publicUrl
}
```

### Upload de Vídeo

```javascript
const uploadVideo = async (file, title, description) => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const fileExt = file.name.split('.').pop()
  const fileName = `${user.id}/video-${Date.now()}.${fileExt}`

  // Upload do vídeo
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('videos')
    .upload(fileName, file)

  if (uploadError) {
    console.error('Erro no upload:', uploadError.message)
    return null
  }

  // Obter URL
  const { data: urlData } = supabase.storage
    .from('videos')
    .getPublicUrl(fileName)

  // Criar registro na tabela
  const { data, error } = await supabase
    .from('videos')
    .insert({
      user_id: user.id,
      title,
      description,
      url: urlData.publicUrl,
      video_type: 'short',
    })
    .select()
    .single()

  return error ? null : data
}
```

### Upload de Foto

```javascript
const uploadPhoto = async (file, caption) => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const fileExt = file.name.split('.').pop()
  const fileName = `${user.id}/photo-${Date.now()}.${fileExt}`

  // Upload
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('photos')
    .upload(fileName, file)

  if (uploadError) return null

  const { data: urlData } = supabase.storage
    .from('photos')
    .getPublicUrl(fileName)

  // Criar registro
  const { data, error } = await supabase
    .from('photos')
    .insert({
      user_id: user.id,
      url: urlData.publicUrl,
      caption,
    })
    .select()
    .single()

  return error ? null : data
}
```

---

## 🎥 VÍDEOS

### Buscar Feed de Vídeos

```javascript
const getVideosFeed = async (limit = 20, offset = 0) => {
  const { data, error } = await supabase
    .from('videos')
    .select(
      `
      *,
      profiles:user_id (
        id,
        name,
        profession,
        avatar
      )
    `
    )
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  return error ? [] : data
}
```

### Buscar Vídeos do Usuário

```javascript
const getUserVideos = async (userId) => {
  const { data, error } = await supabase
    .from('videos')
    .select('*')
    .eq('user_id', userId)
    .eq('is_public', true)
    .order('created_at', { ascending: false })

  return error ? [] : data
}
```

### Curtir Vídeo

```javascript
const likeVideo = async (videoId) => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase.from('video_likes').insert({
    video_id: videoId,
    user_id: user.id,
  })

  // O contador será atualizado automaticamente pelo trigger

  return !error
}
```

### Descurtir Vídeo

```javascript
const unlikeVideo = async (videoId) => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('video_likes')
    .delete()
    .eq('video_id', videoId)
    .eq('user_id', user.id)

  return !error
}
```

---

## 💼 SERVIÇOS

### Criar Serviço

```javascript
const createService = async (service) => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('services')
    .insert({
      user_id: user.id,
      title: service.title,
      description: service.description,
      price: service.price,
      unit: service.unit, // 'hora', 'dia', 'evento'
      category: service.category,
    })
    .select()
    .single()

  return error ? null : data
}
```

### Buscar Serviços do Profissional

```javascript
const getProfessionalServices = async (professionalId) => {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('user_id', professionalId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  return error ? [] : data
}
```

### Atualizar Serviço

```javascript
const updateService = async (serviceId, updates) => {
  const { data, error } = await supabase
    .from('services')
    .update(updates)
    .eq('id', serviceId)
    .select()
    .single()

  return error ? null : data
}
```

### Deletar Serviço

```javascript
const deleteService = async (serviceId) => {
  const { error } = await supabase.from('services').delete().eq('id', serviceId)

  return !error
}
```

---

## 📅 AGENDAMENTOS

### Criar Agendamento

```javascript
const createBooking = async (booking) => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      professional_id: booking.professionalId,
      client_id: user.id,
      service_id: booking.serviceId,
      scheduled_date: booking.date,
      scheduled_time: booking.time,
      duration: booking.duration,
      total_price: booking.price,
      location: booking.location,
      notes: booking.notes,
      status: 'pending',
    })
    .select()
    .single()

  return error ? null : data
}
```

### Buscar Agendamentos do Cliente

```javascript
const getMyBookings = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      *,
      professional:professional_id (
        id,
        name,
        profession,
        avatar
      ),
      service:service_id (
        title,
        description
      )
    `
    )
    .eq('client_id', user.id)
    .order('scheduled_date', { ascending: false })

  return error ? [] : data
}
```

### Buscar Agendamentos do Profissional

```javascript
const getProfessionalBookings = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('bookings')
    .select(
      `
      *,
      client:client_id (
        id,
        name,
        avatar
      ),
      service:service_id (
        title
      )
    `
    )
    .eq('professional_id', user.id)
    .order('scheduled_date', { ascending: false })

  return error ? [] : data
}
```

### Atualizar Status do Agendamento

```javascript
const updateBookingStatus = async (bookingId, status) => {
  // status: 'pending', 'accepted', 'rejected', 'completed', 'cancelled'

  const { data, error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', bookingId)
    .select()
    .single()

  return error ? null : data
}
```

---

## 💬 MENSAGENS

### Enviar Mensagem

```javascript
const sendMessage = async (receiverId, content) => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('messages')
    .insert({
      sender_id: user.id,
      receiver_id: receiverId,
      content,
    })
    .select()
    .single()

  return error ? null : data
}
```

### Buscar Conversas

```javascript
const getConversations = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Buscar últimas mensagens de cada conversa
  const { data, error } = await supabase
    .from('messages')
    .select(
      `
      *,
      sender:sender_id (id, name, avatar),
      receiver:receiver_id (id, name, avatar)
    `
    )
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .order('created_at', { ascending: false })

  if (error) return []

  // Agrupar por conversa
  const conversations = {}
  data.forEach((msg) => {
    const otherId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id
    if (!conversations[otherId]) {
      conversations[otherId] = {
        userId: otherId,
        user: msg.sender_id === user.id ? msg.receiver : msg.sender,
        lastMessage: msg.content,
        timestamp: msg.created_at,
        unread: msg.receiver_id === user.id && !msg.is_read,
      }
    }
  })

  return Object.values(conversations)
}
```

### Buscar Mensagens da Conversa

```javascript
const getMessages = async (otherUserId) => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(
      `and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`
    )
    .order('created_at', { ascending: true })

  return error ? [] : data
}
```

### Marcar Mensagens como Lidas

```javascript
const markMessagesAsRead = async (senderId) => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('sender_id', senderId)
    .eq('receiver_id', user.id)
    .eq('is_read', false)

  return !error
}
```

### Subscrever a Novas Mensagens (Real-time)

```javascript
const subscribeToMessages = (callback) => {
  const { data: { user } } = await supabase.auth.getUser()

  const subscription = supabase
    .channel('messages')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${user.id}`
      },
      (payload) => {
        callback(payload.new)
      }
    )
    .subscribe()

  return subscription
}

// Uso:
const subscription = subscribeToMessages((newMessage) => {
  console.log('Nova mensagem:', newMessage)
  // Atualizar UI
})

// Limpar quando não precisar mais:
// subscription.unsubscribe()
```

---

## ⭐ AVALIAÇÕES

### Criar Avaliação

```javascript
const createReview = async (professionalId, rating, comment) => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('reviews')
    .insert({
      professional_id: professionalId,
      client_id: user.id,
      rating, // 1 a 5
      comment,
    })
    .select()
    .single()

  // O rating do perfil será atualizado automaticamente pelo trigger

  return error ? null : data
}
```

### Buscar Avaliações do Profissional

```javascript
const getProfessionalReviews = async (professionalId) => {
  const { data, error } = await supabase
    .from('reviews')
    .select(
      `
      *,
      client:client_id (
        id,
        name,
        avatar
      )
    `
    )
    .eq('professional_id', professionalId)
    .order('created_at', { ascending: false })

  return error ? [] : data
}
```

---

## 👥 SEGUIR/SEGUIDORES

### Seguir Profissional

```javascript
const followProfessional = async (professionalId) => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase.from('follows').insert({
    follower_id: user.id,
    following_id: professionalId,
  })

  return !error
}
```

### Deixar de Seguir

```javascript
const unfollowProfessional = async (professionalId) => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('following_id', professionalId)

  return !error
}
```

### Verificar se Está Seguindo

```javascript
const isFollowing = async (professionalId) => {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', user.id)
    .eq('following_id', professionalId)
    .single()

  return !!data
}
```

### Buscar Seguidores

```javascript
const getFollowers = async (userId) => {
  const { data, error } = await supabase
    .from('follows')
    .select(
      `
      follower:follower_id (
        id,
        name,
        profession,
        avatar
      )
    `
    )
    .eq('following_id', userId)

  return error ? [] : data.map((f) => f.follower)
}
```

### Buscar Seguindo

```javascript
const getFollowing = async (userId) => {
  const { data, error } = await supabase
    .from('follows')
    .select(
      `
      following:following_id (
        id,
        name,
        profession,
        avatar
      )
    `
    )
    .eq('follower_id', userId)

  return error ? [] : data.map((f) => f.following)
}
```

---

## 🔔 NOTIFICAÇÕES (Real-time)

### Subscrever a Novos Seguidores

```javascript
const subscribeToNewFollowers = (callback) => {
  const { data: { user } } = await supabase.auth.getUser()

  const subscription = supabase
    .channel('new_followers')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'follows',
        filter: `following_id=eq.${user.id}`
      },
      (payload) => {
        callback(payload.new)
      }
    )
    .subscribe()

  return subscription
}
```

### Subscrever a Novos Agendamentos

```javascript
const subscribeToNewBookings = (callback) => {
  const { data: { user } } = await supabase.auth.getUser()

  const subscription = supabase
    .channel('new_bookings')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'bookings',
        filter: `professional_id=eq.${user.id}`
      },
      (payload) => {
        callback(payload.new)
      }
    )
    .subscribe()

  return subscription
}
```

---

## 🔍 BUSCA E FILTROS

### Busca Avançada de Profissionais

```javascript
const searchProfessionalsAdvanced = async (filters) => {
  let query = supabase.from('profiles').select('*').eq('is_professional', true)

  if (filters.profession) {
    query = query.eq('profession', filters.profession)
  }

  if (filters.location) {
    query = query.ilike('location', `%${filters.location}%`)
  }

  if (filters.minRating) {
    query = query.gte('rating', filters.minRating)
  }

  if (filters.maxPrice) {
    query = query.lte('hourly_rate', filters.maxPrice)
  }

  query = query.order('rating', { ascending: false })

  const { data, error } = await query

  return error ? [] : data
}
```

---

## 🛡️ DICAS DE SEGURANÇA

1. **Sempre validar dados do usuário antes de salvar**
2. **Nunca confiar em dados do front-end**
3. **Usar RLS para proteger dados sensíveis**
4. **Limitar tamanho de uploads**
5. **Sanitizar inputs para prevenir XSS**
6. **Usar rate limiting em APIs**

---

**Desenvolvido para JOBY App** 🚀
