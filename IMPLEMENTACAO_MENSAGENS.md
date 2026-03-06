# 🚀 GUIA DE IMPLEMENTAÇÃO - MENSAGENS E COMENTÁRIOS REAIS

## 📋 Passo 1: Executar SQL no Supabase

1. Acesse seu projeto no Supabase: https://supabase.com/dashboard
2. Vá em **SQL Editor** no menu lateral
3. Clique em **New Query**
4. Copie todo o conteúdo do arquivo `setup_messages_comments.sql`
5. Cole no editor e clique em **Run** (ou pressione Ctrl+Enter)
6. Verifique se apareceu "Success. No rows returned" - isso é normal!

## ✅ O que foi configurado:

### Tabelas atualizadas:

- ✅ `messages` - com suporte a anexos (attachment_url, attachment_type, attachment_name)
- ✅ `comments` - comentários em fotos e vídeos
- ✅ `video_likes` e `photo_likes` - sistema de likes
- ✅ Índices para performance otimizada

### Segurança (RLS):

- ✅ Usuários só veem suas próprias mensagens
- ✅ Todos podem ver comentários públicos
- ✅ Apenas donos podem deletar seus comentários
- ✅ Sistema de likes protegido

### Funções úteis criadas:

- ✅ `count_unread_messages()` - conta mensagens não lidas
- ✅ `get_user_conversations()` - lista todas as conversas
- ✅ `mark_messages_as_read()` - marca mensagens como lidas

### Triggers automáticos:

- ✅ Atualiza `likes_count` automaticamente
- ✅ Atualiza `comments_count` automaticamente
- ✅ Mantém contadores sempre corretos

## 📁 Arquivos criados:

### 1. `src/services/messageService.js`

Funções para:

- ✉️ Enviar mensagens
- 📎 Enviar anexos (imagens, arquivos)
- 💬 Buscar conversas
- 👀 Marcar como lido
- 🔔 Tempo real (realtime subscriptions)

### 2. Comentários e Likes (novo padrão)

Arquivos:

- `src/lib/commentApi.js`
- `src/hooks/useComments.js`
- `src/contexts/LikesContext.jsx` (likes em vídeos/fotos)

Comentários (inclui likes em comentários) oferece:

- 💬 Adicionar comentários
- 🗑️ Deletar comentários
- ✏️ Editar comentários

Likes em **vídeos/fotos** seguem o padrão de Like Global consistente via `LikesContext`.

## 🔧 Como usar nos componentes:

### Exemplo 1: Enviar mensagem

\`\`\`javascript
import { sendMessage } from '@/services/messageService'

const handleSend = async () => {
const { data, error } = await sendMessage({
receiverId: 'uuid-do-destinatario',
content: 'Olá! Como vai?'
})

if (error) {
console.error('Erro:', error)
} else {
console.log('Mensagem enviada:', data)
}
}
\`\`\`

### Exemplo 2: Enviar mensagem com anexo

\`\`\`javascript
import { uploadMessageAttachment, sendMessage } from '@/services/messageService'

const handleSendWithFile = async (file) => {
// 1. Upload do arquivo
const { url, type, name, error: uploadError } = await uploadMessageAttachment(file)

if (uploadError) {
console.error('Erro no upload:', uploadError)
return
}

// 2. Enviar mensagem com anexo
const { data, error } = await sendMessage({
receiverId: 'uuid-do-destinatario',
content: 'Confira este arquivo!',
attachmentUrl: url,
attachmentType: type,
attachmentName: name
})

if (error) {
console.error('Erro:', error)
} else {
console.log('Mensagem com anexo enviada:', data)
}
}
\`\`\`

### Exemplo 3: Adicionar comentário

\`\`\`javascript
import { useComments } from '@/hooks/useComments'

const Example = ({ contentId, contentType }) => {
	const { postComment } = useComments({ contentId, contentType, enabled: true })

	const handleComment = async () => {
		const { error } = await postComment({ content: 'Muito bom!' })
		if (error) console.error('Erro:', error)
	}

	return null
}
\`\`\`

### Exemplo 4: Dar like

\`\`\`javascript
import { useLikes } from '@/contexts/LikesContext'

const Example = ({ contentId, contentType }) => {
	const likes = useLikes()
	const isLiked = likes.isLiked(contentType, contentId)

	const handleLike = async () => {
		const { error } = await likes.toggleLike(contentType, contentId)
		if (error) console.error('Erro:', error)
	}

	return null
}
\`\`\`

### Exemplo 5: Tempo real (realtime)

\`\`\`javascript
import { subscribeToMessages } from '@/services/messageService'
import { useEffect } from 'react'

useEffect(() => {
const subscription = subscribeToMessages(otherUserId, (newMessage) => {
console.log('Nova mensagem recebida:', newMessage)
// Adicionar à lista de mensagens
setMessages(prev => [...prev, newMessage])
})

return () => {
subscription?.unsubscribe()
}
}, [otherUserId])
\`\`\`

## 🎯 Próximos passos:

1. ✅ Execute o SQL no Supabase
2. 📝 Atualize os componentes existentes para usar os services
3. 🧪 Teste enviando mensagens e comentários
4. 🔔 Implemente notificações em tempo real

## 🆘 Troubleshooting:

### Erro: "permission denied"

- Verifique se o RLS foi aplicado corretamente
- Confirme que o usuário está autenticado

### Erro: "relation does not exist"

- Execute o SQL completo do arquivo `supabase_complete_setup.sql` primeiro
- Depois execute o `setup_messages_comments.sql`

### Mensagens não aparecem em tempo real

- Verifique se o Realtime está habilitado no Supabase
- Vá em Database → Replication → habilite as tabelas messages e comments

## 📱 Storage (Anexos):

Para anexos funcionarem, configure o bucket no Supabase:

1. Vá em **Storage** no Supabase
2. O bucket `photos` já deve existir
3. Adicione policy para `message-attachments` (modo recomendado: "pra sempre" via signed URL sob demanda):

\`\`\`sql
-- Permitir upload
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'photos' AND (storage.foldername(name))[1] = 'message-attachments');

-- Permitir leitura (usuários autenticados)
CREATE POLICY "Authenticated users can read attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'photos' AND (storage.foldername(name))[1] = 'message-attachments');
\`\`\`

---

**✨ Tudo pronto! Agora você tem um sistema completo de mensagens, comentários e likes funcionando com Supabase!**
