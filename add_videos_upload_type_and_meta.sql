-- Adds JOBY upload_type + basic video metadata
-- Run this in Supabase SQL Editor (idempotent).

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS upload_type text,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer;

-- Safe constraint: allows existing rows (NULL), restricts new non-null values.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'videos_upload_type_check'
  ) THEN
    ALTER TABLE public.videos
      ADD CONSTRAINT videos_upload_type_check
      CHECK (upload_type IS NULL OR upload_type IN ('short-video', 'long-video'));
  END IF;
END;
$do$;
