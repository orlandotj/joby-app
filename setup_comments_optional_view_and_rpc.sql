-- ========================================
-- OPTIONAL: View for comments + user fields, and RPC to toggle likes
-- Requires: setup_comments_youtube_sheet.sql already applied
-- ========================================

-- 1) View: comments enriched with public profile fields
-- Note: This view respects RLS on underlying tables.
CREATE OR REPLACE VIEW public.comments_with_user AS
SELECT
  c.id,
  c.user_id,
  c.video_id,
  c.photo_id,
  c.parent_id,
  c.content,
  c.created_at,
  c.updated_at,
  c.replies_count,
  c.likes_count,
  p.username,
  p.name,
  p.avatar,
  p.profession
FROM public.comments c
JOIN public.profiles p ON p.id = c.user_id;

GRANT SELECT ON public.comments_with_user TO anon, authenticated;

-- 2) RPC: toggle like for a comment
-- Returns current state and updated likes_count.
CREATE OR REPLACE FUNCTION public.toggle_comment_like(p_comment_id uuid)
RETURNS TABLE(
  liked boolean,
  likes_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_liked boolean;
  v_count integer;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.comment_likes
    WHERE comment_id = p_comment_id
      AND user_id = v_uid
  ) THEN
    DELETE FROM public.comment_likes
    WHERE comment_id = p_comment_id
      AND user_id = v_uid;

    v_liked := false;
  ELSE
    INSERT INTO public.comment_likes (comment_id, user_id)
    VALUES (p_comment_id, v_uid)
    ON CONFLICT (comment_id, user_id) DO NOTHING;

    v_liked := true;
  END IF;

  SELECT c.likes_count
  INTO v_count
  FROM public.comments c
  WHERE c.id = p_comment_id;

  RETURN QUERY SELECT v_liked, COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_comment_like(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_comment_like(uuid) TO authenticated;
