-- Limpar notificações de teste (rode no SQL Editor como owner/service role)
-- Apaga todas as notificações marcadas com data.is_test = true

delete from public.notifications
where coalesce((data->>'is_test')::boolean, false) = true;

-- (Opcional) Remover policy DEV de insert
-- drop policy if exists "notifications_insert_own_dev" on public.notifications;
