-- ============================================
-- SETUP COMPLETO: MENSAGENS, COMENTÁRIOS E STORAGE
-- Execute este script no Supabase SQL Editor
-- ============================================

-- PARTE 1: ATUALIZAR TABELA DE MENSAGENS
-- ============================================

-- Adicionar coluna read_at para controle de leitura
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Adicionar colunas de anexo à tabela messages
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS attachment_url TEXT,
ADD COLUMN IF NOT EXISTS attachment_type TEXT,
ADD COLUMN IF NOT EXISTS attachment_name TEXT;

-- Adicionar comentários para documentação
COMMENT ON COLUMN messages.read_at IS 'Timestamp de quando a mensagem foi lida';
COMMENT ON COLUMN messages.attachment_url IS 'URL do arquivo anexado (imagem, vídeo, documento)';
COMMENT ON COLUMN messages.attachment_type IS 'Tipo do anexo: image, video, document';
COMMENT ON COLUMN messages.attachment_name IS 'Nome original do arquivo';

-- ============================================
-- PARTE 2: POLÍTICAS RLS PARA MENSAGENS
-- ============================================

-- Remover políticas antigas se existirem (forçar remoção)
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can view their own messages" ON messages;
  DROP POLICY IF EXISTS "Users can view their messages" ON messages;
  DROP POLICY IF EXISTS "Users can send messages" ON messages;
  DROP POLICY IF EXISTS "Users can update their own messages" ON messages;
  DROP POLICY IF EXISTS "Users can update their messages" ON messages;
  DROP POLICY IF EXISTS "Users can delete their own messages" ON messages;
  DROP POLICY IF EXISTS "Users can delete their messages" ON messages;
EXCEPTION 
  WHEN undefined_object THEN NULL;
END $$;

-- Política: Usuários podem ver mensagens onde são remetente ou destinatário
CREATE POLICY "Users can view their messages"
ON messages FOR SELECT
USING (
  auth.uid() = sender_id OR 
  auth.uid() = receiver_id
);

-- Política: Usuários podem enviar mensagens
CREATE POLICY "Users can send messages"
ON messages FOR INSERT
WITH CHECK (auth.uid() = sender_id);

-- Política: Usuários podem atualizar suas próprias mensagens (marcar como lida)
CREATE POLICY "Users can update their messages"
ON messages FOR UPDATE
USING (
  auth.uid() = sender_id OR 
  auth.uid() = receiver_id
);

-- Política: Usuários podem deletar suas próprias mensagens
CREATE POLICY "Users can delete their messages"
ON messages FOR DELETE
USING (auth.uid() = sender_id);

-- ============================================
-- PARTE 3: POLÍTICAS RLS PARA COMENTÁRIOS
-- ============================================

-- Remover políticas antigas se existirem
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Anyone can view comments" ON comments;
  DROP POLICY IF EXISTS "Authenticated users can create comments" ON comments;
  DROP POLICY IF EXISTS "Users can update their own comments" ON comments;
  DROP POLICY IF EXISTS "Users can update their comments" ON comments;
  DROP POLICY IF EXISTS "Users can delete their own comments" ON comments;
  DROP POLICY IF EXISTS "Users can delete their comments" ON comments;
EXCEPTION 
  WHEN undefined_object THEN NULL;
END $$;

-- Política: Qualquer pessoa pode ver comentários
CREATE POLICY "Anyone can view comments"
ON comments FOR SELECT
USING (true);

-- Política: Usuários autenticados podem criar comentários
CREATE POLICY "Authenticated users can create comments"
ON comments FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Política: Usuários podem atualizar seus próprios comentários
CREATE POLICY "Users can update their comments"
ON comments FOR UPDATE
USING (auth.uid() = user_id);

-- Política: Usuários podem deletar seus próprios comentários
CREATE POLICY "Users can delete their comments"
ON comments FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- PARTE 4: POLÍTICAS RLS PARA LIKES
-- ============================================

-- Video Likes
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Anyone can view video likes" ON video_likes;
  DROP POLICY IF EXISTS "Users can like videos" ON video_likes;
  DROP POLICY IF EXISTS "Users can unlike videos" ON video_likes;
EXCEPTION 
  WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Anyone can view video likes"
ON video_likes FOR SELECT
USING (true);

CREATE POLICY "Users can like videos"
ON video_likes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike videos"
ON video_likes FOR DELETE
USING (auth.uid() = user_id);

-- Photo Likes
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Anyone can view photo likes" ON photo_likes;
  DROP POLICY IF EXISTS "Users can like photos" ON photo_likes;
  DROP POLICY IF EXISTS "Users can unlike photos" ON photo_likes;
EXCEPTION 
  WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Anyone can view photo likes"
ON photo_likes FOR SELECT
USING (true);

CREATE POLICY "Users can like photos"
ON photo_likes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike photos"
ON photo_likes FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- PARTE 5: FUNÇÕES SQL
-- ============================================

-- Função para contar mensagens não lidas
CREATE OR REPLACE FUNCTION count_unread_messages(user_uuid UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF auth.uid() <> user_uuid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM messages
    WHERE receiver_id = auth.uid()
    AND read_at IS NULL
  );
END;
$$;

-- Função para buscar conversas do usuário
CREATE OR REPLACE FUNCTION get_user_conversations(user_uuid UUID)
RETURNS TABLE (
  other_user_id UUID,
  other_user_name TEXT,
  other_user_avatar TEXT,
  last_message TEXT,
  last_message_time TIMESTAMPTZ,
  unread_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF auth.uid() <> user_uuid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH user_messages AS (
    SELECT 
      CASE 
        WHEN m.sender_id = auth.uid() THEN m.receiver_id
        ELSE m.sender_id
      END AS other_id,
      m.content,
      m.created_at,
      CASE 
        WHEN m.receiver_id = auth.uid() AND m.read_at IS NULL THEN 1
        ELSE 0
      END AS is_unread
    FROM messages m
    WHERE m.sender_id = auth.uid() OR m.receiver_id = auth.uid()
  ),
  conversation_info AS (
    SELECT 
      um.other_id,
      MAX(um.created_at) AS last_time,
      SUM(um.is_unread)::INTEGER AS unread
    FROM user_messages um
    GROUP BY um.other_id
  )
  SELECT 
    ci.other_id,
    p.name,
    p.avatar,
    (
      SELECT content 
      FROM user_messages 
      WHERE other_id = ci.other_id 
      ORDER BY created_at DESC 
      LIMIT 1
    ) AS last_msg,
    ci.last_time,
    ci.unread
  FROM conversation_info ci
  JOIN profiles p ON p.id = ci.other_id
  ORDER BY ci.last_time DESC;
END;
$$;

-- Função para marcar mensagens como lidas
CREATE OR REPLACE FUNCTION mark_messages_as_read(
  sender_uuid UUID,
  receiver_uuid UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF auth.uid() <> receiver_uuid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE messages
  SET read_at = NOW()
  WHERE sender_id = sender_uuid 
    AND receiver_id = auth.uid()
    AND read_at IS NULL;
END;
$$;

-- ============================================
-- PARTE 6: TRIGGERS PARA CONTADORES AUTOMÁTICOS
-- ============================================

-- Trigger para atualizar likes_count em videos
CREATE OR REPLACE FUNCTION update_video_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE videos 
    SET likes_count = likes_count + 1 
    WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE videos 
    SET likes_count = GREATEST(0, likes_count - 1) 
    WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS video_likes_count_trigger ON video_likes;
CREATE TRIGGER video_likes_count_trigger
AFTER INSERT OR DELETE ON video_likes
FOR EACH ROW EXECUTE FUNCTION update_video_likes_count();

-- Trigger para atualizar likes_count em photos
CREATE OR REPLACE FUNCTION update_photo_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE photos 
    SET likes_count = likes_count + 1 
    WHERE id = NEW.photo_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE photos 
    SET likes_count = GREATEST(0, likes_count - 1) 
    WHERE id = OLD.photo_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS photo_likes_count_trigger ON photo_likes;
CREATE TRIGGER photo_likes_count_trigger
AFTER INSERT OR DELETE ON photo_likes
FOR EACH ROW EXECUTE FUNCTION update_photo_likes_count();

-- Trigger para atualizar comments_count em videos
CREATE OR REPLACE FUNCTION update_video_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.video_id IS NOT NULL THEN
    UPDATE videos 
    SET comments_count = comments_count + 1 
    WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' AND OLD.video_id IS NOT NULL THEN
    UPDATE videos 
    SET comments_count = GREATEST(0, comments_count - 1) 
    WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS video_comments_count_trigger ON comments;
CREATE TRIGGER video_comments_count_trigger
AFTER INSERT OR DELETE ON comments
FOR EACH ROW 
EXECUTE FUNCTION update_video_comments_count();

-- Trigger para atualizar comments_count em photos
CREATE OR REPLACE FUNCTION update_photo_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.photo_id IS NOT NULL THEN
    UPDATE photos 
    SET comments_count = comments_count + 1 
    WHERE id = NEW.photo_id;
  ELSIF TG_OP = 'DELETE' AND OLD.photo_id IS NOT NULL THEN
    UPDATE photos 
    SET comments_count = GREATEST(0, comments_count - 1) 
    WHERE id = OLD.photo_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS photo_comments_count_trigger ON comments;
CREATE TRIGGER photo_comments_count_trigger
AFTER INSERT OR DELETE ON comments
FOR EACH ROW 
EXECUTE FUNCTION update_photo_comments_count();

-- ============================================
-- PARTE 7: STORAGE POLICIES
-- ============================================

-- Remover políticas antigas de storage se existirem
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload message attachments" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can view message attachments" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete their message attachments" ON storage.objects;
  DROP POLICY IF EXISTS "Users can upload service images" ON storage.objects;
  DROP POLICY IF EXISTS "Anyone can view service images" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete their service images" ON storage.objects;
EXCEPTION 
  WHEN undefined_object THEN NULL;
END $$;

-- Política: Usuários autenticados podem fazer upload de anexos de mensagens
CREATE POLICY "Authenticated users can upload message attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photos' 
  AND (storage.foldername(name))[1] = 'message-attachments'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- Política: Qualquer pessoa pode visualizar anexos de mensagens (se tiver o link)
CREATE POLICY "Anyone can view message attachments"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'photos' 
  AND (storage.foldername(name))[1] = 'message-attachments'
);

-- Política: Usuários podem deletar seus próprios anexos
CREATE POLICY "Users can delete their message attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'photos' 
  AND (storage.foldername(name))[1] = 'message-attachments'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- Política: Usuários podem fazer upload de imagens de serviços
CREATE POLICY "Users can upload service images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photos' 
  AND (storage.foldername(name))[1] = 'service-images'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- Política: Qualquer pessoa pode visualizar imagens de serviços
CREATE POLICY "Anyone can view service images"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'photos' 
  AND (storage.foldername(name))[1] = 'service-images'
);

-- Política: Usuários podem deletar suas próprias imagens de serviços
CREATE POLICY "Users can delete their service images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'photos' 
  AND (storage.foldername(name))[1] = 'service-images'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- ============================================
-- PARTE 8: HABILITAR REALTIME
-- ============================================

-- Habilitar realtime para as tabelas (se ainda não estiverem)
DO $$ 
BEGIN
  -- Tentar adicionar messages
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  EXCEPTION 
    WHEN duplicate_object THEN NULL;
  END;

  -- Tentar adicionar comments
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE comments;
  EXCEPTION 
    WHEN duplicate_object THEN NULL;
  END;

  -- Tentar adicionar video_likes
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE video_likes;
  EXCEPTION 
    WHEN duplicate_object THEN NULL;
  END;

  -- Tentar adicionar photo_likes
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE photo_likes;
  EXCEPTION 
    WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ============================================
-- VERIFICAÇÃO
-- ============================================

-- Verificar se as colunas foram adicionadas
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'messages' 
AND column_name IN ('attachment_url', 'attachment_type', 'attachment_name');

-- Verificar funções
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name IN (
  'count_unread_messages', 
  'get_user_conversations', 
  'mark_messages_as_read'
);

-- Verificar triggers
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE trigger_name LIKE '%likes_count%' 
   OR trigger_name LIKE '%comments_count%';

-- Verificar políticas de storage
SELECT policyname, tablename 
FROM pg_policies 
WHERE schemaname = 'storage';

-- Verificar realtime
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';

-- ============================================
-- FIM DO SCRIPT
-- ============================================
