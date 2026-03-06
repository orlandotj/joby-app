-- Produção: Buckets privados + acesso controlado via RLS (Storage)
-- Projeto: JOBY
--
-- Requer:
-- - buckets photos/videos/profile-photos configurados como PRIVATE no Dashboard
-- - app usando createSignedUrl (já implementado no client)
--
-- Observação:
-- - Este modelo deixa o conteúdo “público para usuários autenticados”
-- - Se você quiser restringir por relacionamento (ex.: só participantes do chat), isso exige modelagem extra.

begin;

-- Garantir RLS habilitado (normalmente já vem habilitado)
alter table if exists storage.objects enable row level security;

-- Limpar policies antigas (opcional, mas recomendado para evitar conflito)
-- Ajuste/remova linhas se você quiser manter alguma policy existente.
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

-- =========================
-- READ: usuários logados podem ler (para Signed URL funcionar)
-- =========================
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

-- =========================
-- WRITE: uploads/apagar apenas do próprio usuário
-- Regras baseadas no padrão atual de paths do app:
-- photos/videos posts: <uid>/<timestamp>.<ext>
-- photos message attachments: message-attachments/<uid>/<timestamp>.<ext>
-- photos service images: service-images/<uid>-<timestamp>.<ext>
-- photos service request attachments: service-attachments/<uid>/<request_id>/<uuid>.<ext>
-- profile-photos avatar: avatar/<uid>-<timestamp>.<ext>
-- profile-photos cover: cover/<uid>-<timestamp>.<ext>
-- =========================

-- ---------
-- photos
-- ---------
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

-- ---------
-- videos
-- ---------
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

-- ---------
-- profile-photos
-- (usa upsert: true, então precisa insert + update)
-- ---------
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
