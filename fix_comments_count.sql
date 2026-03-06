-- Fix/backfill comments_count for videos/photos
-- Idempotent: safe to run multiple times.

-- 1) Ensure columns exist and are non-null with default 0
ALTER TABLE IF EXISTS public.videos
	ADD COLUMN IF NOT EXISTS comments_count integer;

ALTER TABLE IF EXISTS public.photos
	ADD COLUMN IF NOT EXISTS comments_count integer;

UPDATE public.videos SET comments_count = COALESCE(comments_count, 0) WHERE comments_count IS NULL;
UPDATE public.photos SET comments_count = COALESCE(comments_count, 0) WHERE comments_count IS NULL;

ALTER TABLE public.videos ALTER COLUMN comments_count SET DEFAULT 0;
ALTER TABLE public.videos ALTER COLUMN comments_count SET NOT NULL;

ALTER TABLE public.photos ALTER COLUMN comments_count SET DEFAULT 0;
ALTER TABLE public.photos ALTER COLUMN comments_count SET NOT NULL;

-- 2) Backfill exact counts from comments table
UPDATE public.videos v
SET comments_count = COALESCE(x.cnt, 0)
FROM (
	SELECT video_id, COUNT(*)::int AS cnt
	FROM public.comments
	WHERE video_id IS NOT NULL
	GROUP BY video_id
) x
WHERE v.id = x.video_id;

UPDATE public.videos v
SET comments_count = 0
WHERE NOT EXISTS (
	SELECT 1 FROM public.comments c WHERE c.video_id = v.id
);

UPDATE public.photos p
SET comments_count = COALESCE(x.cnt, 0)
FROM (
	SELECT photo_id, COUNT(*)::int AS cnt
	FROM public.comments
	WHERE photo_id IS NOT NULL
	GROUP BY photo_id
) x
WHERE p.id = x.photo_id;

UPDATE public.photos p
SET comments_count = 0
WHERE NOT EXISTS (
	SELECT 1 FROM public.comments c WHERE c.photo_id = p.id
);

-- 3) Triggers to keep counts updated on future inserts/deletes
CREATE OR REPLACE FUNCTION public.update_video_comments_count()
RETURNS TRIGGER AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		IF NEW.video_id IS NOT NULL THEN
			UPDATE public.videos
			SET comments_count = comments_count + 1
			WHERE id = NEW.video_id;
		END IF;
		RETURN NEW;
	ELSIF TG_OP = 'DELETE' THEN
		IF OLD.video_id IS NOT NULL THEN
			UPDATE public.videos
			SET comments_count = GREATEST(0, comments_count - 1)
			WHERE id = OLD.video_id;
		END IF;
		RETURN OLD;
	END IF;
	RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS video_comments_count_trigger ON public.comments;
DROP TRIGGER IF EXISTS video_comments_count_trigger_ins ON public.comments;
DROP TRIGGER IF EXISTS video_comments_count_trigger_del ON public.comments;

CREATE TRIGGER video_comments_count_trigger_ins
AFTER INSERT ON public.comments
FOR EACH ROW
WHEN (NEW.video_id IS NOT NULL)
EXECUTE FUNCTION public.update_video_comments_count();

CREATE TRIGGER video_comments_count_trigger_del
AFTER DELETE ON public.comments
FOR EACH ROW
WHEN (OLD.video_id IS NOT NULL)
EXECUTE FUNCTION public.update_video_comments_count();

CREATE OR REPLACE FUNCTION public.update_photo_comments_count()
RETURNS TRIGGER AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		IF NEW.photo_id IS NOT NULL THEN
			UPDATE public.photos
			SET comments_count = comments_count + 1
			WHERE id = NEW.photo_id;
		END IF;
		RETURN NEW;
	ELSIF TG_OP = 'DELETE' THEN
		IF OLD.photo_id IS NOT NULL THEN
			UPDATE public.photos
			SET comments_count = GREATEST(0, comments_count - 1)
			WHERE id = OLD.photo_id;
		END IF;
		RETURN OLD;
	END IF;
	RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS photo_comments_count_trigger ON public.comments;
DROP TRIGGER IF EXISTS photo_comments_count_trigger_ins ON public.comments;
DROP TRIGGER IF EXISTS photo_comments_count_trigger_del ON public.comments;

CREATE TRIGGER photo_comments_count_trigger_ins
AFTER INSERT ON public.comments
FOR EACH ROW
WHEN (NEW.photo_id IS NOT NULL)
EXECUTE FUNCTION public.update_photo_comments_count();

CREATE TRIGGER photo_comments_count_trigger_del
AFTER DELETE ON public.comments
FOR EACH ROW
WHEN (OLD.photo_id IS NOT NULL)
EXECUTE FUNCTION public.update_photo_comments_count();

-- 4) Sanity check (optional): show the top 10 videos by comments_count
-- SELECT id, comments_count FROM public.videos ORDER BY comments_count DESC NULLS LAST LIMIT 10;
