-- ========================================
-- SETUP (JOBY): SERVICE REQUESTS + MEDIA
-- Execute este script no Supabase SQL Editor
-- ========================================

begin;

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- 1) Tables
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  professional_id uuid null references auth.users(id) on delete set null,
  status text not null default 'pending',
  notes text null,
  created_at timestamptz default now()
);

create table if not exists public.service_request_media (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  bucket_id text not null default 'photos',
  object_path text not null,
  media_type text not null,
  caption text null,
  created_at timestamptz default now()
);

create table if not exists public.service_request_media_comments (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.service_request_media(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  created_at timestamptz default now()
);

create index if not exists idx_service_requests_client_id on public.service_requests(client_id);
create index if not exists idx_service_requests_professional_id on public.service_requests(professional_id);
create index if not exists idx_service_request_media_request_id on public.service_request_media(request_id);
create index if not exists idx_service_request_media_uploader_id on public.service_request_media(uploader_id);
create index if not exists idx_service_request_media_comments_media_id on public.service_request_media_comments(media_id);
create index if not exists idx_service_request_media_comments_sender_id on public.service_request_media_comments(sender_id);

-- 2) RLS
alter table public.service_requests enable row level security;
alter table public.service_request_media enable row level security;
alter table public.service_request_media_comments enable row level security;

-- Policies (service_requests)
drop policy if exists "Client can view own service requests" on public.service_requests;
create policy "Client can view own service requests"
on public.service_requests
for select
to authenticated
using (client_id = auth.uid());

drop policy if exists "Professional can view assigned service requests" on public.service_requests;
create policy "Professional can view assigned service requests"
on public.service_requests
for select
to authenticated
using (professional_id = auth.uid());

drop policy if exists "Client can create service requests" on public.service_requests;
create policy "Client can create service requests"
on public.service_requests
for insert
to authenticated
with check (client_id = auth.uid());

-- Policies (service_request_media)
drop policy if exists "Client can attach media to own request" on public.service_request_media;
create policy "Client can attach media to own request"
on public.service_request_media
for insert
to authenticated
with check (
  uploader_id = auth.uid()
  and exists (
    select 1
    from public.service_requests r
    where r.id = request_id and r.client_id = auth.uid()
  )
);

drop policy if exists "Client and assigned professional can view request media" on public.service_request_media;
create policy "Client and assigned professional can view request media"
on public.service_request_media
for select
to authenticated
using (
  exists (
    select 1
    from public.service_requests r
    where r.id = request_id
      and (r.client_id = auth.uid() or r.professional_id = auth.uid())
  )
);

-- Optional DELETE (client can delete while pending)
drop policy if exists "Client can delete own request media while pending" on public.service_request_media;
create policy "Client can delete own request media while pending"
on public.service_request_media
for delete
to authenticated
using (
  uploader_id = auth.uid()
  and exists (
    select 1
    from public.service_requests r
    where r.id = request_id and r.client_id = auth.uid() and r.status = 'pending'
  )
);

-- Policies (service_request_media_comments)
drop policy if exists "Client and assigned professional can view media comments" on public.service_request_media_comments;
create policy "Client and assigned professional can view media comments"
on public.service_request_media_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.service_request_media m
    join public.service_requests r on r.id = m.request_id
    where m.id = media_id
      and (r.client_id = auth.uid() or r.professional_id = auth.uid())
  )
);

drop policy if exists "Client and assigned professional can add media comments" on public.service_request_media_comments;
create policy "Client and assigned professional can add media comments"
on public.service_request_media_comments
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.service_request_media m
    join public.service_requests r on r.id = m.request_id
    where m.id = media_id
      and (r.client_id = auth.uid() or r.professional_id = auth.uid())
  )
);

commit;
