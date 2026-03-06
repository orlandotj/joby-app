-- Adds public thumbnail URL support for videos
-- Run this in Supabase SQL Editor (or your migration pipeline).

alter table public.videos
  add column if not exists thumbnail_url text;
