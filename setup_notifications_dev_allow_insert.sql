-- DEV ONLY: permitir criar notificações de teste pelo app
-- Depois de testar, remova esta policy (ou deixe comentada) para produção.

alter table public.notifications enable row level security;

drop policy if exists "notifications_insert_own_dev" on public.notifications;
create policy "notifications_insert_own_dev"
  on public.notifications
  for insert
  with check (auth.uid() = user_id);
