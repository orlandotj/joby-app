-- ========================================
-- SETUP: BOOKING ATTACHMENTS (FOTOS/VÍDEOS)
-- Execute este script no Supabase SQL Editor
-- ========================================

begin;

create table if not exists public.booking_attachments (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  media_type text not null check (media_type in ('photo', 'video')),
  url text not null,
  file_name text,
  mime_type text,
  file_size bigint,
  created_at timestamptz default now()
);

create index if not exists idx_booking_attachments_booking_id on public.booking_attachments(booking_id);
create index if not exists idx_booking_attachments_uploader_id on public.booking_attachments(uploader_id);

alter table public.booking_attachments enable row level security;

drop policy if exists "Users can view booking attachments" on public.booking_attachments;
create policy "Users can view booking attachments"
on public.booking_attachments
for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and (b.client_id = auth.uid() or b.professional_id = auth.uid())
  )
);

drop policy if exists "Clients can add booking attachments" on public.booking_attachments;
create policy "Clients can add booking attachments"
on public.booking_attachments
for insert
to authenticated
with check (
  uploader_id = auth.uid()
  and exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and b.client_id = auth.uid()
  )
);

drop policy if exists "Users can delete own booking attachments" on public.booking_attachments;
create policy "Users can delete own booking attachments"
on public.booking_attachments
for delete
to authenticated
using (
  uploader_id = auth.uid()
  and exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and b.client_id = auth.uid()
  )
);

commit;
