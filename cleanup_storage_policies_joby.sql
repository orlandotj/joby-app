-- ========================================
-- JOBY: CLEANUP + POLICIES (STORAGE PRIVATE)
-- Execute no Supabase SQL Editor
--
-- Se aparecer: ERROR 42501: must be owner of relation storage.objects
-- rode como o role dono da tabela (normalmente: supabase_storage_admin).
-- ========================================

begin;

-- Diagnóstico rápido
select current_user as current_user, session_user as session_user;
select schemaname, tablename, tableowner
from pg_tables
where schemaname = 'storage' and tablename = 'objects';

-- 1) Remover policies públicas que tornam o bucket efetivamente público via anon key
-- (ajuste a lista se você tiver mais policies "public".)
drop policy if exists "Allow public to view photos" on storage.objects;
drop policy if exists "Allow public to view videos" on storage.objects;
drop policy if exists "Allow public access to view images 1oj01fe_0" on storage.objects;
drop policy if exists "Allow public access to view images ijvnt4_0" on storage.objects;
drop policy if exists "Allow public to view photos" on storage.objects;
drop policy if exists "Allow public to view videos" on storage.objects;

-- 2) Garantir RLS ligado (normalmente já está)
alter table if exists storage.objects enable row level security;

-- 3) Limpar policies antigas do mesmo “modelo Joby” (se existirem)
drop policy if exists "Authenticated can read photos" on storage.objects;
drop policy if exists "Authenticated can read videos" on storage.objects;
drop policy if exists "Authenticated can read profile-photos" on storage.objects;

drop policy if exists "Users can upload to photos" on storage.objects;
drop policy if exists "Users can update own photos" on storage.objects;
drop policy if exists "Users can delete own photos" on storage.objects;

drop policy if exists "Users can upload to videos" on storage.objects;
drop policy if exists "Users can update own videos" on storage.objects;
drop policy if exists "Users can delete own videos" on storage.objects;

drop policy if exists "Users can upload to profile-photos" on storage.objects;
drop policy if exists "Users can update own profile-photos" on storage.objects;
drop policy if exists "Users can delete own profile-photos" on storage.objects;

-- 4) READ: usuários logados podem ler metadata (necessário para createSignedUrl em bucket PRIVATE)
create policy "Authenticated can read photos"
on storage.objects
for select
to authenticated
using (bucket_id = 'photos');

create policy "Authenticated can read videos"
on storage.objects
for select
to authenticated
using (bucket_id = 'videos');

create policy "Authenticated can read profile-photos"
on storage.objects
for select
to authenticated
using (bucket_id = 'profile-photos');

-- 5) WRITE: uploads/apagar apenas do próprio usuário
-- Paths aceitos no bucket photos:
-- - <uid>/...
-- - message-attachments/<uid>/...
-- - service-images/<uid>-...
-- - booking-attachments/<uid>/... (se você ainda usar)
-- - service-attachments/<uid>/<request_id>/...
create policy "Users can upload to photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'photos'
  and (
    name like auth.uid() || '/%'
    or name like 'message-attachments/' || auth.uid() || '/%'
    or name like 'booking-attachments/' || auth.uid() || '/%'
    or name like 'service-attachments/' || auth.uid() || '/%'
    or name like 'service-images/' || auth.uid() || '-%'
  )
);

create policy "Users can update own photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'photos'
  and (
    name like auth.uid() || '/%'
    or name like 'message-attachments/' || auth.uid() || '/%'
    or name like 'booking-attachments/' || auth.uid() || '/%'
    or name like 'service-attachments/' || auth.uid() || '/%'
    or name like 'service-images/' || auth.uid() || '-%'
  )
)
with check (
  bucket_id = 'photos'
  and (
    name like auth.uid() || '/%'
    or name like 'message-attachments/' || auth.uid() || '/%'
    or name like 'booking-attachments/' || auth.uid() || '/%'
    or name like 'service-attachments/' || auth.uid() || '/%'
    or name like 'service-images/' || auth.uid() || '-%'
  )
);

create policy "Users can delete own photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'photos'
  and (
    name like auth.uid() || '/%'
    or name like 'message-attachments/' || auth.uid() || '/%'
    or name like 'booking-attachments/' || auth.uid() || '/%'
    or name like 'service-attachments/' || auth.uid() || '/%'
    or name like 'service-images/' || auth.uid() || '-%'
  )
);

-- Bucket videos (se usar Supabase vídeos; no JOBY os vídeos do feed vão pro Worker/R2)
create policy "Users can upload to videos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'videos'
  and name like auth.uid() || '/%'
);

create policy "Users can update own videos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'videos'
  and name like auth.uid() || '/%'
)
with check (
  bucket_id = 'videos'
  and name like auth.uid() || '/%'
);

create policy "Users can delete own videos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'videos'
  and name like auth.uid() || '/%'
);

-- profile-photos
create policy "Users can upload to profile-photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (
    name like 'avatar/' || auth.uid() || '-%'
    or name like 'cover/' || auth.uid() || '-%'
  )
);

create policy "Users can update own profile-photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (
    name like 'avatar/' || auth.uid() || '-%'
    or name like 'cover/' || auth.uid() || '-%'
  )
)
with check (
  bucket_id = 'profile-photos'
  and (
    name like 'avatar/' || auth.uid() || '-%'
    or name like 'cover/' || auth.uid() || '-%'
  )
);

create policy "Users can delete own profile-photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (
    name like 'avatar/' || auth.uid() || '-%'
    or name like 'cover/' || auth.uid() || '-%'
  )
);

commit;
