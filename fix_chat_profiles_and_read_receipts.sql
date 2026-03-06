-- ============================================
-- JOBY - FIX CHAT (PROFILES + READ RECEIPTS)
-- Objetivo:
-- 1) Garantir que TODO usuário do auth tenha linha em public.profiles (evita FK bloqueando mensagens)
-- 2) Unificar mark_messages_as_read / count_unread_messages / get_user_conversations
--    para funcionar com schemas que usam `is_read` e/ou `read_at`.
--
-- Execute no Supabase SQL Editor (produção/staging) e rode inteiro.
-- ============================================

-- Helper: checar se uma coluna existe em public.messages
CREATE OR REPLACE FUNCTION public._messages_has_column(col_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'messages'
      AND column_name = col_name
  );
$$;

-- ============================================
-- 1) READ RECEIPTS COMPAT
-- ============================================
CREATE OR REPLACE FUNCTION public.mark_messages_as_read(
  sender_uuid UUID,
  receiver_uuid UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_is_read BOOLEAN;
  has_read_at BOOLEAN;
  set_clause TEXT := '';
  where_clause TEXT := '';
  sql_stmt TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF auth.uid() <> receiver_uuid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  has_is_read := public._messages_has_column('is_read');
  has_read_at := public._messages_has_column('read_at');

  IF NOT has_is_read AND NOT has_read_at THEN
    RETURN;
  END IF;

  IF has_is_read THEN
    set_clause := set_clause || 'is_read = TRUE';
    where_clause := where_clause || ' AND (is_read IS NULL OR is_read = FALSE)';
  END IF;

  IF has_read_at THEN
    IF set_clause <> '' THEN
      set_clause := set_clause || ', ';
    END IF;
    set_clause := set_clause || 'read_at = NOW()';
    where_clause := where_clause || ' AND read_at IS NULL';
  END IF;

  sql_stmt :=
    'UPDATE public.messages '
    || 'SET ' || set_clause || ' '
    || 'WHERE sender_id = $1 AND receiver_id = $2'
    || where_clause;

  EXECUTE sql_stmt USING sender_uuid, receiver_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_unread_messages(user_uuid UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_is_read BOOLEAN;
  has_read_at BOOLEAN;
  sql_stmt TEXT;
  result_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF auth.uid() <> user_uuid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  has_is_read := public._messages_has_column('is_read');
  has_read_at := public._messages_has_column('read_at');

  IF has_is_read AND has_read_at THEN
    sql_stmt :=
      'SELECT COUNT(*)::INTEGER FROM public.messages '
      || 'WHERE receiver_id = $1 '
      || 'AND read_at IS NULL '
      || 'AND (is_read IS NULL OR is_read = FALSE)';
  ELSIF has_read_at THEN
    sql_stmt :=
      'SELECT COUNT(*)::INTEGER FROM public.messages '
      || 'WHERE receiver_id = $1 '
      || 'AND read_at IS NULL';
  ELSIF has_is_read THEN
    sql_stmt :=
      'SELECT COUNT(*)::INTEGER FROM public.messages '
      || 'WHERE receiver_id = $1 '
      || 'AND (is_read IS NULL OR is_read = FALSE)';
  ELSE
    RETURN 0;
  END IF;

  EXECUTE sql_stmt INTO result_count USING user_uuid;
  RETURN COALESCE(result_count, 0);
END;
$$;

-- IMPORTANTE:
-- Em alguns ambientes já existe `get_user_conversations(uuid)` com OUT params diferentes
-- (ex: inclui other_user_name/avatar). Postgres NÃO permite CREATE OR REPLACE mudando
-- o rowtype de retorno; precisa dropar antes.
DROP FUNCTION IF EXISTS public.get_user_conversations(UUID);

-- Mantém a assinatura “curta” usada pelo app (o frontend busca profiles separado).
CREATE OR REPLACE FUNCTION public.get_user_conversations(user_uuid UUID)
RETURNS TABLE (
  other_user_id UUID,
  last_message TEXT,
  last_message_time TIMESTAMPTZ,
  unread_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_is_read BOOLEAN;
  has_read_at BOOLEAN;
  unread_expr TEXT;
  sql_stmt TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF auth.uid() <> user_uuid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  has_is_read := public._messages_has_column('is_read');
  has_read_at := public._messages_has_column('read_at');

  IF has_is_read AND has_read_at THEN
    unread_expr := '(m.receiver_id = auth.uid() AND m.read_at IS NULL AND (m.is_read IS NULL OR m.is_read = FALSE))';
  ELSIF has_read_at THEN
    unread_expr := '(m.receiver_id = auth.uid() AND m.read_at IS NULL)';
  ELSIF has_is_read THEN
    unread_expr := '(m.receiver_id = auth.uid() AND (m.is_read IS NULL OR m.is_read = FALSE))';
  ELSE
    unread_expr := 'FALSE';
  END IF;

  sql_stmt :=
    'WITH user_messages AS ( '
    || '  SELECT m.*, '
    || '    CASE WHEN m.sender_id = auth.uid() THEN m.receiver_id ELSE m.sender_id END AS other_id, '
    || '    CASE WHEN ' || unread_expr || ' THEN 1 ELSE 0 END AS is_unread '
    || '  FROM public.messages m '
    || '  WHERE m.sender_id = auth.uid() OR m.receiver_id = auth.uid() '
    || '), conv AS ( '
    || '  SELECT other_id, MAX(created_at) AS last_time, SUM(is_unread)::INTEGER AS unread '
    || '  FROM user_messages '
    || '  GROUP BY other_id '
    || ') '
    || 'SELECT '
    || '  c.other_id AS other_user_id, '
    || '  (SELECT content FROM user_messages um WHERE um.other_id = c.other_id ORDER BY created_at DESC LIMIT 1) AS last_message, '
    || '  c.last_time AS last_message_time, '
    || '  COALESCE(c.unread, 0) AS unread_count '
    || 'FROM conv c '
    || 'ORDER BY c.last_time DESC';

  RETURN QUERY EXECUTE sql_stmt;
END;
$$;

-- Versão opcional “full” (não conflita com a assinatura acima)
-- Útil se você tinha a função antiga retornando name/avatar e quer manter compat.
CREATE OR REPLACE FUNCTION public.get_user_conversations_full(user_uuid UUID)
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
DECLARE
  has_is_read BOOLEAN;
  has_read_at BOOLEAN;
  unread_expr TEXT;
  sql_stmt TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF auth.uid() <> user_uuid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  has_is_read := public._messages_has_column('is_read');
  has_read_at := public._messages_has_column('read_at');

  IF has_is_read AND has_read_at THEN
    unread_expr := '(m.receiver_id = auth.uid() AND m.read_at IS NULL AND (m.is_read IS NULL OR m.is_read = FALSE))';
  ELSIF has_read_at THEN
    unread_expr := '(m.receiver_id = auth.uid() AND m.read_at IS NULL)';
  ELSIF has_is_read THEN
    unread_expr := '(m.receiver_id = auth.uid() AND (m.is_read IS NULL OR m.is_read = FALSE))';
  ELSE
    unread_expr := 'FALSE';
  END IF;

  sql_stmt :=
    'WITH user_messages AS ( '
    || '  SELECT m.*, '
    || '    CASE WHEN m.sender_id = auth.uid() THEN m.receiver_id ELSE m.sender_id END AS other_id, '
    || '    CASE WHEN ' || unread_expr || ' THEN 1 ELSE 0 END AS is_unread '
    || '  FROM public.messages m '
    || '  WHERE m.sender_id = auth.uid() OR m.receiver_id = auth.uid() '
    || '), conv AS ( '
    || '  SELECT other_id, MAX(created_at) AS last_time, SUM(is_unread)::INTEGER AS unread '
    || '  FROM user_messages '
    || '  GROUP BY other_id '
    || ') '
    || 'SELECT '
    || '  c.other_id AS other_user_id, '
    || '  p.name AS other_user_name, '
    || '  p.avatar AS other_user_avatar, '
    || '  (SELECT content FROM user_messages um WHERE um.other_id = c.other_id ORDER BY created_at DESC LIMIT 1) AS last_message, '
    || '  c.last_time AS last_message_time, '
    || '  COALESCE(c.unread, 0) AS unread_count '
    || 'FROM conv c '
    || 'JOIN public.profiles p ON p.id = c.other_id '
    || 'ORDER BY c.last_time DESC';

  RETURN QUERY EXECUTE sql_stmt;
END;
$$;

-- ============================================
-- 2) PROFILES AUTO-CREATE + BACKFILL
-- ============================================
-- Observação: seu schema (supabase_complete_setup.sql) define profiles.name NOT NULL.
-- Então precisamos sempre preencher algum nome.

CREATE OR REPLACE FUNCTION public.handle_new_user_create_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fallback_name TEXT;
BEGIN
  fallback_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'Usuário'
  );

  INSERT INTO public.profiles (id, name)
  VALUES (NEW.id, fallback_name)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger em auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'on_auth_user_created_create_profile'
  ) THEN
    CREATE TRIGGER on_auth_user_created_create_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_create_profile();
  END IF;
END;
$$;

-- Backfill: cria profiles faltantes para usuários já existentes
INSERT INTO public.profiles (id, name)
SELECT
  u.id,
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'name', ''),
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    NULLIF(split_part(COALESCE(u.email, ''), '@', 1), ''),
    'Usuário'
  ) AS name
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
