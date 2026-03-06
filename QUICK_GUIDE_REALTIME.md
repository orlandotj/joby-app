# 🚀 Guia Rápido: Sistema de Mensagens e Comentários em Tempo Real

## 📋 Pré-requisitos

- Projeto Supabase configurado
- Bucket `photos` criado no Storage
- Tabelas básicas criadas (profiles, videos, photos, messages, comments, etc.)

## 🔧 Passo 1: Executar SQL no Supabase

1. Acesse o **Supabase Dashboard**
2. Vá em **SQL Editor**
3. Clique em **New Query**
4. Cole todo o conteúdo do arquivo `setup_complete_realtime.sql`
5. Clique em **Run** (ou pressione Ctrl+Enter)
6. Verifique se todas as queries foram executadas com sucesso

### ✅ Verificar Instalação

Ao final do script, você verá 4 queries de verificação que mostrarão:

- ✓ Colunas de anexo adicionadas à tabela messages
- ✓ 3 funções criadas (count_unread_messages, get_user_conversations, mark_messages_as_read)
- ✓ 4 triggers criados (likes e comments para videos e photos)
- ✓ Políticas de storage criadas
- ✓ Tabelas habilitadas para Realtime

## 📱 Passo 2: Usar os Serviços no Frontend

### Importar Serviços

```javascript
// Para mensagens
import {
  sendMessage,
  getUserConversations,
  getConversationMessages,
  markMessagesAsRead,
  uploadMessageAttachment,
  subscribeToMessages,
} from '@/services/messageService'

// Para comentários (inclui likes em comentários e realtime)
import { useComments } from '@/hooks/useComments'

// Para likes em vídeos/fotos (Like Global consistente)
import { useLikes } from '@/contexts/LikesContext'
```

### Exemplo: Enviar Mensagem Simples

```javascript
const handleSendMessage = async () => {
  const { data, error } = await sendMessage({
    receiverId: 'uuid-do-destinatario',
    content: 'Olá! Como vai?',
  })

  if (error) {
    console.error('Erro:', error)
  } else {
    console.log('Mensagem enviada:', data)
  }
}
```

### Exemplo: Enviar Mensagem com Anexo

```javascript
const handleSendWithAttachment = async (file) => {
  // 1. Fazer upload do arquivo
  const { data: uploadData, error: uploadError } =
    await uploadMessageAttachment(file)

  if (uploadError) {
    console.error('Erro no upload:', uploadError)
    return
  }

  // 2. Enviar mensagem com URL do anexo
  const { data, error } = await sendMessage({
    receiverId: 'uuid-do-destinatario',
    content: 'Enviou um arquivo',
    attachmentUrl: uploadData.url,
    attachmentType: file.type.startsWith('image') ? 'image' : 'document',
    attachmentName: file.name,
  })

  if (error) {
    console.error('Erro:', error)
  } else {
    console.log('Mensagem com anexo enviada:', data)
  }
}
```

### Exemplo: Adicionar Comentário

```javascript
const CommentsExample = ({ contentId, contentType }) => {
  const { comments, postComment, toggleLike: toggleCommentLike } = useComments({
    contentId,
    contentType, // 'video' | 'photo'
    enabled: true,
  })

  const handleAddComment = async () => {
    const { error } = await postComment({ content: 'Adorei esse conteúdo!' })
    if (error) console.error('Erro:', error)
  }

  return null
}
```

### Exemplo: Dar Like (vídeo/foto)

```javascript
const LikeExample = ({ contentId, contentType }) => {
  const likes = useLikes()

  const isLiked = likes.isLiked(contentType, contentId)
  const count = likes.getCount(contentType, contentId) // number | null

  const handleToggle = async () => {
    const { error } = await likes.toggleLike(contentType, contentId)
    if (error) console.error('Erro ao curtir:', error)
  }

  return null
}
```
```

### Exemplo: Dar Like em Vídeo

```javascript
const handleLikeVideo = async () => {
  // Verificar se já deu like
  const { data: alreadyLiked } = await checkVideoLike('uuid-do-video')

  if (alreadyLiked) {
    // Remover like
    await unlikeVideo('uuid-do-video')
  } else {
    // Adicionar like
    await likeVideo('uuid-do-video')
  }
}
```

### Exemplo: Subscrever a Mensagens em Tempo Real

```javascript
useEffect(() => {
  const unsubscribe = subscribeToMessages(
    currentUserId,
    otherUserId,
    (newMessage) => {
      console.log('Nova mensagem recebida:', newMessage)
      setMessages((prev) => [...prev, newMessage])
    }
  )

  return () => unsubscribe() // Limpar ao desmontar
}, [currentUserId, otherUserId])
```

### Exemplo: Subscrever a Comentários em Tempo Real

```javascript
useEffect(() => {
  const unsubscribe = subscribeToComments(
    videoId, // ou photoId
    (newComment) => {
      console.log('Novo comentário:', newComment)
      setComments((prev) => [newComment, ...prev])
    }
  )

  return () => unsubscribe()
}, [videoId])
```

## 🎯 Componentes Já Atualizados

### ✅ ContentViewModal.jsx

Este componente já está **100% integrado** com os serviços:

- ✅ Carrega comentários reais do Supabase
- ✅ Adiciona comentários com `addComment()`
- ✅ Deleta comentários com `deleteComment()`
- ✅ Like/Unlike de vídeos e fotos
- ✅ Subscrição em tempo real para novos comentários
- ✅ UI com loading states e botão de deletar

**Use este componente como referência** para implementar em outras partes do app!

## 📝 Próximos Passos

### 1. Página de Mensagens

Crie `src/pages/Messages.jsx`:

```javascript
import { useState, useEffect } from 'react'
import {
  getUserConversations,
  getConversationMessages,
  sendMessage,
} from '@/services/messageService'

function Messages() {
  const [conversations, setConversations] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])

  useEffect(() => {
    loadConversations()
  }, [])

  const loadConversations = async () => {
    const { data } = await getUserConversations()
    if (data) setConversations(data)
  }

  const loadMessages = async (otherUserId) => {
    const { data } = await getConversationMessages(otherUserId)
    if (data) setMessages(data)
  }

  // ... resto da implementação
}
```

### 2. Seção de Comentários no Perfil

Atualize `src/pages/Profile.jsx` para usar `getVideoComments` e `getPhotoComments` ao invés de dados mockados.

### 3. Notificações de Mensagens

Use `count_unread_messages()` no header da aplicação:

```javascript
const { data: unreadCount } = await supabase.rpc('count_unread_messages', {
  user_uuid: currentUser.id,
})
```

## 🐛 Troubleshooting

### Erro: "relation does not exist"

- Verifique se todas as tabelas foram criadas com `supabase_complete_setup.sql`

### Erro: "permission denied for table"

- Execute o script SQL completo novamente para criar as políticas RLS

### Mensagens não aparecem em tempo real

- Vá em **Database → Replication** no Supabase
- Habilite as tabelas: `messages`, `comments`, `video_likes`, `photo_likes`

### Upload de arquivo falha

- Verifique se o bucket `photos` existe
- Verifique se as políticas de storage foram criadas
- Tamanho máximo: 10MB

## 📚 Estrutura de Dados

### Message

```javascript
{
  id: 'uuid',
  sender_id: 'uuid',
  receiver_id: 'uuid',
  content: 'texto da mensagem',
  attachment_url: 'https://...',
  attachment_type: 'image', // ou 'video', 'document'
  attachment_name: 'arquivo.jpg',
  read_at: null, // ou timestamp
  created_at: 'timestamp',
  sender: { name, avatar }, // join automático
  receiver: { name, avatar }
}
```

### Comment

```javascript
{
  id: 'uuid',
  user_id: 'uuid',
  video_id: 'uuid', // ou null
  photo_id: 'uuid', // ou null
  text: 'comentário',
  created_at: 'timestamp',
  user: { name, avatar } // join automático
}
```

## 🎉 Pronto!

Agora você tem um sistema completo de mensagens e comentários em tempo real! 🚀

Para mais detalhes, veja:

- `IMPLEMENTACAO_MENSAGENS.md` - Guia completo
- `src/services/messageService.js` - Código fonte
- `src/lib/commentApi.js` e `src/hooks/useComments.js` - Comentários e likes em comentários
- `src/contexts/LikesContext.jsx` - Likes global (vídeo/foto)
- `src/components/ContentViewModal.jsx` - Exemplo de implementação
