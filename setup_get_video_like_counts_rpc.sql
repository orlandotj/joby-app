-- RPC: get_video_like_counts(video_ids uuid[]) -> (video_id, likes_count)
-- Objetivo: retornar o TOTAL REAL de likes (COUNT em public.video_likes) em lote.
-- Execute no SQL Editor do Supabase.

CREATE OR REPLACE FUNCTION public.get_video_like_counts(video_ids uuid[])
RETURNS TABLE(video_id uuid, likes_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT vl.video_id, COUNT(*)::int AS likes_count
  FROM public.video_likes vl
  WHERE vl.video_id = ANY(video_ids)
  GROUP BY vl.video_id;
$$;

REVOKE ALL ON FUNCTION public.get_video_like_counts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_video_like_counts(uuid[]) TO authenticated;
