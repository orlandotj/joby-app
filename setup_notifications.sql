-- Tabela de notificações (JOBY)
-- Objetivo: centralizar eventos importantes para o usuário (profissional/cliente)
-- - solicitações de serviço
-- - mensagens
-- - pagamentos
-- - avaliações
-- - avisos do sistema

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  title text,
  body text,
  data jsonb not null default '{}'::jsonb,
  action_url text,
  is_read boolean not null default false,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_is_read_idx
  on public.notifications (user_id, is_read);

create index if not exists notifications_user_archived_idx
  on public.notifications (user_id, archived_at);

-- RLS
alter table public.notifications enable row level security;

-- Usuário lê apenas as próprias notificações
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications
  for select
  using (auth.uid() = user_id);

-- Usuário pode marcar como lida (update) apenas as próprias
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Usuário pode apagar (delete) apenas as próprias
drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications
  for delete
  using (auth.uid() = user_id);

-- Grants (RLS ainda controla o acesso por linha)
grant select, update, delete on public.notifications to authenticated;
grant select on public.notifications to anon;

-- Inserts devem ser feitos pelo backend/worker (service role).
-- Se você também quiser permitir inserts do client (não recomendado), descomente:
-- drop policy if exists "notifications_insert_own" on public.notifications;
-- create policy "notifications_insert_own"
--   on public.notifications
--   for insert
--   with check (auth.uid() = user_id);
