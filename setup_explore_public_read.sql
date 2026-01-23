-- JOBY — Explore (Public Search) permissions
-- Run this in Supabase SQL Editor.
-- Goal: make Explore "Pessoas / Serviços / Publicações" work for anon/authenticated
-- without exposing sensitive columns like CPF/CNPJ (restrict via column privileges).

-- IMPORTANT
-- 1) If you already have different privacy rules, adapt the USING() expressions.
-- 2) Column-level GRANT is the safest way to avoid exposing private fields.

begin;

-- Ensure schema usage
grant usage on schema public to anon, authenticated;

-- ----------
-- PROFILES
-- ----------
-- Enable RLS (idempotent)
alter table if exists public.profiles enable row level security;

-- Allow reading rows (column-level GRANT below will control what can be selected)
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public
  on public.profiles
  for select
  using (true);

-- Grant only safe columns to anon/authenticated
-- Adjust the list if your app uses other fields in Explore.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(c.column_name), ', ')
    into cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'profiles'
    and c.column_name = any(array[
      'id',
      'username',
      'name',
      'avatar',
      'profession',
      'bio',
      'location',
      'rating',
      'is_verified',
      'can_offer_service',
      'created_at'
    ]);

  if cols is not null and cols <> '' then
    execute format('grant select (%s) on public.profiles to anon, authenticated', cols);
  end if;
end $$;

-- ----------
-- SERVICES
-- ----------
alter table if exists public.services enable row level security;

-- Public can view active services; owners can view their own.
drop policy if exists services_select_public_or_owner on public.services;
create policy services_select_public_or_owner
  on public.services
  for select
  using (
    is_active = true
    or user_id = auth.uid()
  );

-- Grant safe columns
-- (the UI embeds user via user_id -> profiles; that requires profiles SELECT as above)
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(c.column_name), ', ')
    into cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'services'
    and c.column_name = any(array[
      'id',
      'user_id',
      'title',
      'description',
      'category',
      'price',
      'price_unit',
      'image',
      'is_active',
      'created_at'
    ]);

  if cols is not null and cols <> '' then
    execute format('grant select (%s) on public.services to anon, authenticated', cols);
  end if;
end $$;

-- ----------
-- VIDEOS
-- ----------
alter table if exists public.videos enable row level security;

-- Public can view public posts; owners can view their own.
drop policy if exists videos_select_public_or_owner on public.videos;
create policy videos_select_public_or_owner
  on public.videos
  for select
  using (
    (coalesce(is_public, false) = true)
    or user_id = auth.uid()
  );

-- Grant only columns used by Explore (and typical feeds)
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(c.column_name), ', ')
    into cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'videos'
    and c.column_name = any(array[
      'id',
      'user_id',
      'url',
      'title',
      'description',
      'thumbnail',
      'video_type',
      'views',
      'likes',
      'comments_count',
      'created_at',
      'is_public',
      'provider'
    ]);

  if cols is not null and cols <> '' then
    execute format('grant select (%s) on public.videos to anon, authenticated', cols);
  end if;
end $$;

-- ----------
-- PHOTOS
-- ----------
alter table if exists public.photos enable row level security;

-- Public can view public posts; owners can view their own.
drop policy if exists photos_select_public_or_owner on public.photos;
create policy photos_select_public_or_owner
  on public.photos
  for select
  using (
    (coalesce(is_public, false) = true)
    or user_id = auth.uid()
  );

-- Grant only columns used by Explore (provider is optional; script grants it only if it exists)
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(c.column_name), ', ')
    into cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'photos'
    and c.column_name = any(array[
      'id',
      'user_id',
      'url',
      'caption',
      'likes',
      'comments_count',
      'created_at',
      'is_public',
      'provider'
    ]);

  if cols is not null and cols <> '' then
    execute format('grant select (%s) on public.photos to anon, authenticated', cols);
  end if;
end $$;

commit;
