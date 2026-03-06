-- RPC: get_photo_like_counts(photo_ids uuid[]) -> (photo_id, likes_count)
-- Objetivo: retornar o TOTAL REAL de likes (COUNT em public.photo_likes) em lote.
-- Execute no SQL Editor do Supabase.

CREATE OR REPLACE FUNCTION public.get_photo_like_counts(photo_ids uuid[])
RETURNS TABLE(photo_id uuid, likes_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pl.photo_id, COUNT(*)::int AS likes_count
  FROM public.photo_likes pl
  WHERE pl.photo_id = ANY(photo_ids)
  GROUP BY pl.photo_id;
$$;

REVOKE ALL ON FUNCTION public.get_photo_like_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_photo_like_counts(uuid[]) TO authenticated;
