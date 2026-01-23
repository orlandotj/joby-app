-- TESTE COMPLETO - TRIGGERS DE NOTIFICAÇÕES (JOBY)
-- Objetivo: validar (sem alterar estrutura) se os triggers de booking estão criando notificações.
-- Como usar (Supabase SQL Editor):
-- 1) Garanta que você já executou `setup_notifications.sql`.
-- 2) Garanta que você já executou `setup_notifications_triggers_optional.sql`.
-- 3) Substitua os UUIDs abaixo (professional/client) por usuários reais.
-- 4) Execute o arquivo inteiro.

DO $$
DECLARE
  v_professional uuid := '00000000-0000-0000-0000-000000000000';
  v_client uuid := '00000000-0000-0000-0000-000000000000';
  v_booking_id uuid;
BEGIN
  IF v_professional = '00000000-0000-0000-0000-000000000000'::uuid
     OR v_client = '00000000-0000-0000-0000-000000000000'::uuid
  THEN
    RAISE EXCEPTION 'Substitua v_professional e v_client por UUIDs reais (auth.users.id / profiles.id).';
  END IF;

  -- PASSO 1: cria booking (status pending)
  INSERT INTO public.bookings (professional_id, client_id, status)
  VALUES (v_professional, v_client, 'pending')
  RETURNING id INTO v_booking_id;

  RAISE NOTICE 'PASSO 1 OK - booking criada: %', v_booking_id;

  -- PASSO 2: altera status da mesma booking
  UPDATE public.bookings
  SET status = 'accepted'
  WHERE id = v_booking_id;

  RAISE NOTICE 'PASSO 2 OK - status alterado para accepted: %', v_booking_id;

  -- Checagem rápida (dentro do mesmo run) focada nessa booking
  RAISE NOTICE 'PASSO 3/4 (cheque manual): rode o SELECT no final do arquivo. booking_id=%', v_booking_id;
END $$;

-- PASSO 3: execute exatamente este SQL (como você pediu) e confira o resultado
select id, user_id, type, title, is_read, created_at
from public.notifications
order by created_at desc
limit 20;

-- (Opcional) Para isolar só as notificações da booking criada acima:
-- Copie o booking_id mostrado no NOTICE e cole aqui.
-- select id, user_id, type, title, is_read, created_at, data
-- from public.notifications
-- where data->>'booking_id' = 'COLE_AQUI_O_BOOKING_ID'
-- order by created_at desc;
