-- RPC: criar notificação para o "outro lado" de uma reserva (booking)
--
-- Por padrão, a tabela public.notifications NÃO permite INSERT pelo client (RLS).
-- Este RPC (SECURITY DEFINER) permite que cliente/profissional criem uma notificação
-- para a outra parte, desde que ambos estejam ligados ao mesmo booking.
--
-- Uso no app (frontend): notificationService.createNotification({ bookingId, userId: <destinatário>, ... })
--
-- Execute este SQL no Supabase (SQL Editor) como owner (ex: postgres).

create or replace function public.create_notification_for_booking(
  p_booking_id uuid,
  p_to_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_action_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_professional_id uuid;
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select b.client_id, b.professional_id
    into v_client_id, v_professional_id
  from public.bookings b
  where b.id = p_booking_id;

  if v_client_id is null and v_professional_id is null then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  -- caller must be one of the booking parties
  if auth.uid() <> v_client_id and auth.uid() <> v_professional_id then
    raise exception 'NOT_ALLOWED';
  end if;

  -- recipient must be one of the booking parties
  if p_to_user_id <> v_client_id and p_to_user_id <> v_professional_id then
    raise exception 'INVALID_RECIPIENT';
  end if;

  -- do not allow notifying self via this RPC
  if p_to_user_id = auth.uid() then
    raise exception 'CANNOT_NOTIFY_SELF';
  end if;

  insert into public.notifications (user_id, type, title, body, data, action_url)
  values (
    p_to_user_id,
    coalesce(p_type, 'system'),
    nullif(coalesce(p_title, ''), ''),
    nullif(coalesce(p_body, ''), ''),
    coalesce(p_data, '{}'::jsonb),
    p_action_url
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.create_notification_for_booking(uuid, uuid, text, text, text, jsonb, text) to authenticated;
