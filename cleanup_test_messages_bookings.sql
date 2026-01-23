-- Limpeza de dados de teste (Mensagens + Bookings)
-- Execute no Supabase SQL Editor quando quiser apagar de vez.

-- Mensagens de teste (criados pelo app):
DELETE FROM public.messages
WHERE content ILIKE '[TEST]%'
  AND sender_id = receiver_id;

-- Solicitações (bookings) de teste (criados pelo app):
DELETE FROM public.bookings
WHERE notes ILIKE '[TEST]%'
  AND client_id = professional_id;
