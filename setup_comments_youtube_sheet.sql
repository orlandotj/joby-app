-- ========================================
-- COMMENTS v2 (YouTube-style): replies + likes
-- Works as a migration on top of existing public.comments
-- ========================================

-- 0) Safety: ensure extension for uuid if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1) Add columns to support replies + counters
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS replies_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON public.comments(created_at DESC);

-- Backfill for existing rows
UPDATE public.comments
SET updated_at = COALESCE(updated_at, created_at)
WHERE updated_at IS NULL;

-- 2) comment_likes table
CREATE TABLE IF NOT EXISTS public.comment_likes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id ON public.comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id ON public.comment_likes(user_id);

-- Backfill likes_count based on existing likes (if any)
UPDATE public.comments c
SET likes_count = COALESCE(x.cnt, 0)
FROM (
  SELECT comment_id, COUNT(*)::int AS cnt
  FROM public.comment_likes
  GROUP BY comment_id
) x
WHERE c.id = x.comment_id;

-- 3) updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comments_updated_at ON public.comments;
CREATE TRIGGER trg_comments_updated_at
BEFORE UPDATE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 4) replies_count trigger (counts direct children)
CREATE OR REPLACE FUNCTION public.update_comment_replies_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_id IS NOT NULL THEN
      UPDATE public.comments
      SET replies_count = replies_count + 1
      WHERE id = NEW.parent_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.parent_id IS NOT NULL THEN
      UPDATE public.comments
      SET replies_count = GREATEST(0, replies_count - 1)
      WHERE id = OLD.parent_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_comments_replies_count ON public.comments;
CREATE TRIGGER trg_comments_replies_count
AFTER INSERT OR DELETE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.update_comment_replies_count();

-- Backfill replies_count based on existing replies (if any)
UPDATE public.comments c
SET replies_count = COALESCE(x.cnt, 0)
FROM (
  SELECT parent_id, COUNT(*)::int AS cnt
  FROM public.comments
  WHERE parent_id IS NOT NULL
  GROUP BY parent_id
) x
WHERE c.id = x.parent_id;

-- 5) likes_count trigger
CREATE OR REPLACE FUNCTION public.update_comment_likes_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.comments
    SET likes_count = likes_count + 1
    WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.comments
    SET likes_count = GREATEST(0, likes_count - 1)
    WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_likes_count ON public.comment_likes;
CREATE TRIGGER trg_comment_likes_count
AFTER INSERT OR DELETE ON public.comment_likes
FOR EACH ROW
EXECUTE FUNCTION public.update_comment_likes_count();

-- 6) RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

-- COMMENTS policies
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='comments' AND policyname='comments_select_all'
  ) THEN
    CREATE POLICY comments_select_all ON public.comments
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='comments' AND policyname='comments_insert_owner'
  ) THEN
    CREATE POLICY comments_insert_owner ON public.comments
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='comments' AND policyname='comments_update_owner'
  ) THEN
    CREATE POLICY comments_update_owner ON public.comments
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='comments' AND policyname='comments_delete_owner'
  ) THEN
    CREATE POLICY comments_delete_owner ON public.comments
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $do$;

-- COMMENT_LIKES policies
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='comment_likes' AND policyname='comment_likes_select_all'
  ) THEN
    CREATE POLICY comment_likes_select_all ON public.comment_likes
      FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='comment_likes' AND policyname='comment_likes_insert_owner'
  ) THEN
    CREATE POLICY comment_likes_insert_owner ON public.comment_likes
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='comment_likes' AND policyname='comment_likes_delete_owner'
  ) THEN
    CREATE POLICY comment_likes_delete_owner ON public.comment_likes
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $do$;

-- 7) Grants (optional; many setups already grant these)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.comments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT SELECT ON public.comment_likes TO anon, authenticated;
GRANT INSERT, DELETE ON public.comment_likes TO authenticated;
