-- ========================================
-- CONFIGURAÇÃO DE MENSAGENS, COMENTÁRIOS E ANEXOS
-- ========================================

-- 1. Adicionar coluna de anexo na tabela messages (se não existir)
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS attachment_url TEXT,
ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS attachment_name TEXT;

-- 2. Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_comments_video_id ON public.comments(video_id);
CREATE INDEX IF NOT EXISTS idx_comments_photo_id ON public.comments(photo_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON public.comments(created_at DESC);

-- ========================================
-- ROW LEVEL SECURITY (RLS) - MESSAGES
-- ========================================

-- Habilitar RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Política: usuários podem ver mensagens que enviaram ou receberam
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
CREATE POLICY "Users can view their own messages" ON public.messages
  FOR SELECT
  USING (
    auth.uid() = sender_id OR 
    auth.uid() = receiver_id
  );

-- Política: usuários podem enviar mensagens
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages" ON public.messages
  FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Política: usuários podem atualizar mensagens que receberam (marcar como lida)
DROP POLICY IF EXISTS "Users can update received messages" ON public.messages;
CREATE POLICY "Users can update received messages" ON public.messages
  FOR UPDATE
  USING (auth.uid() = receiver_id);

-- Política: usuários podem deletar mensagens que enviaram
DROP POLICY IF EXISTS "Users can delete sent messages" ON public.messages;
CREATE POLICY "Users can delete sent messages" ON public.messages
  FOR DELETE
  USING (auth.uid() = sender_id);

-- ========================================
-- ROW LEVEL SECURITY (RLS) - COMMENTS
-- ========================================

-- Habilitar RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Política: todos podem ver comentários
DROP POLICY IF EXISTS "Anyone can view comments" ON public.comments;
CREATE POLICY "Anyone can view comments" ON public.comments
  FOR SELECT
  USING (true);

-- Política: usuários autenticados podem criar comentários
DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.comments;
CREATE POLICY "Authenticated users can create comments" ON public.comments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política: usuários podem deletar seus próprios comentários
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.comments;
CREATE POLICY "Users can delete their own comments" ON public.comments
  FOR DELETE
  USING (auth.uid() = user_id);

-- Política: usuários podem atualizar seus próprios comentários
DROP POLICY IF EXISTS "Users can update their own comments" ON public.comments;
CREATE POLICY "Users can update their own comments" ON public.comments
  FOR UPDATE
  USING (auth.uid() = user_id);

-- ========================================
-- ROW LEVEL SECURITY (RLS) - LIKES
-- ========================================

-- Video Likes
ALTER TABLE public.video_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view video likes" ON public.video_likes;
CREATE POLICY "Anyone can view video likes" ON public.video_likes
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can like videos" ON public.video_likes;
CREATE POLICY "Users can like videos" ON public.video_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike videos" ON public.video_likes;
CREATE POLICY "Users can unlike videos" ON public.video_likes
  FOR DELETE
  USING (auth.uid() = user_id);

-- Photo Likes
ALTER TABLE public.photo_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view photo likes" ON public.photo_likes;
CREATE POLICY "Anyone can view photo likes" ON public.photo_likes
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can like photos" ON public.photo_likes;
CREATE POLICY "Users can like photos" ON public.photo_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike photos" ON public.photo_likes;
CREATE POLICY "Users can unlike photos" ON public.photo_likes
  FOR DELETE
  USING (auth.uid() = user_id);

-- ========================================
-- FUNÇÕES ÚTEIS
-- ========================================

-- Função para contar mensagens não lidas
CREATE OR REPLACE FUNCTION count_unread_messages(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF auth.uid() <> user_uuid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.messages
    WHERE receiver_id = auth.uid()
    AND is_read = false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Função para obter conversas do usuário
CREATE OR REPLACE FUNCTION get_user_conversations(user_uuid UUID)
RETURNS TABLE (
  other_user_id UUID,
  last_message TEXT,
  last_message_time TIMESTAMPTZ,
  unread_count INTEGER
) AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF auth.uid() <> user_uuid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH conversations AS (
    SELECT 
      CASE 
        WHEN sender_id = auth.uid() THEN receiver_id
        ELSE sender_id
      END as contact_id,
      content,
      created_at,
      CASE WHEN receiver_id = auth.uid() AND is_read = false THEN 1 ELSE 0 END as is_unread
    FROM public.messages
    WHERE sender_id = auth.uid() OR receiver_id = auth.uid()
  ),
  latest_messages AS (
    SELECT DISTINCT ON (contact_id)
      contact_id,
      content,
      created_at
    FROM conversations
    ORDER BY contact_id, created_at DESC
  )
  SELECT 
    lm.contact_id as other_user_id,
    lm.content as last_message,
    lm.created_at as last_message_time,
    COALESCE(SUM(c.is_unread)::INTEGER, 0) as unread_count
  FROM latest_messages lm
  LEFT JOIN conversations c ON c.contact_id = lm.contact_id
  GROUP BY lm.contact_id, lm.content, lm.created_at
  ORDER BY lm.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Função para marcar mensagens como lidas
CREATE OR REPLACE FUNCTION mark_messages_as_read(
  sender_uuid UUID,
  receiver_uuid UUID
)
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF auth.uid() <> receiver_uuid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.messages
  SET is_read = true
  WHERE sender_id = sender_uuid
  AND receiver_id = auth.uid()
  AND is_read = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ========================================
-- TRIGGERS PARA ATUALIZAR CONTADORES
-- ========================================

-- Trigger para atualizar views_count em videos
CREATE OR REPLACE FUNCTION increment_video_views()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.videos
  SET views_count = views_count + 1
  WHERE id = NEW.video_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar likes_count em videos
CREATE OR REPLACE FUNCTION update_video_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos
    SET likes_count = likes_count + 1
    WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos
    SET likes_count = GREATEST(0, likes_count - 1)
    WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS video_likes_count_trigger ON public.video_likes;
CREATE TRIGGER video_likes_count_trigger
AFTER INSERT OR DELETE ON public.video_likes
FOR EACH ROW
EXECUTE FUNCTION update_video_likes_count();

-- Trigger para atualizar comments_count em videos
CREATE OR REPLACE FUNCTION update_video_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos
    SET comments_count = comments_count + 1
    WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos
    SET comments_count = GREATEST(0, comments_count - 1)
    WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS video_comments_count_trigger ON public.comments;
CREATE TRIGGER video_comments_count_trigger
AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW
WHEN (NEW.video_id IS NOT NULL OR OLD.video_id IS NOT NULL)
EXECUTE FUNCTION update_video_comments_count();

-- Trigger similar para photos
CREATE OR REPLACE FUNCTION update_photo_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.photos
    SET likes_count = likes_count + 1
    WHERE id = NEW.photo_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.photos
    SET likes_count = GREATEST(0, likes_count - 1)
    WHERE id = OLD.photo_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS photo_likes_count_trigger ON public.photo_likes;
CREATE TRIGGER photo_likes_count_trigger
AFTER INSERT OR DELETE ON public.photo_likes
FOR EACH ROW
EXECUTE FUNCTION update_photo_likes_count();

CREATE OR REPLACE FUNCTION update_photo_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.photos
    SET comments_count = comments_count + 1
    WHERE id = NEW.photo_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.photos
    SET comments_count = GREATEST(0, comments_count - 1)
    WHERE id = OLD.photo_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS photo_comments_count_trigger ON public.comments;
CREATE TRIGGER photo_comments_count_trigger
AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW
WHEN (NEW.photo_id IS NOT NULL OR OLD.photo_id IS NOT NULL)
EXECUTE FUNCTION update_photo_comments_count();

-- ========================================
-- GRANTS
-- ========================================

GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
