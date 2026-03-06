-- Photo posts: progressive image derivatives (thumb + full)
-- Safe to run multiple times.

alter table public.photos
  add column if not exists image_full_url text,
  add column if not exists image_thumb_url text,
  add column if not exists width_full integer,
  add column if not exists height_full integer,
  add column if not exists width_thumb integer,
  add column if not exists height_thumb integer;
