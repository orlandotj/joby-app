-- RPC: get_comment_like_counts(comment_ids uuid[]) -> (comment_id, likes_count)
-- Objetivo: retornar o TOTAL REAL de likes (COUNT em public.comment_likes) em lote.
-- Execute no SQL Editor do Supabase.

CREATE OR REPLACE FUNCTION public.get_comment_like_counts(comment_ids uuid[])
RETURNS TABLE(comment_id uuid, likes_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cl.comment_id, COUNT(*)::int AS likes_count
  FROM public.comment_likes cl
  WHERE cl.comment_id = ANY(comment_ids)
  GROUP BY cl.comment_id;
$$;

REVOKE ALL ON FUNCTION public.get_comment_like_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_comment_like_counts(uuid[]) TO authenticated;
