-- ============================================
-- JOBY - SERVICE CHAT (MESSAGES.request_id)
-- Objetivo: separar chat normal de chat de solicitações (bookings)
-- Execute no Supabase SQL Editor.
-- ============================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS request_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE;

-- Para filtrar conversas normais (request_id IS NULL) e chats por solicitação
CREATE INDEX IF NOT EXISTS idx_messages_request_id ON public.messages(request_id);
CREATE INDEX IF NOT EXISTS idx_messages_request_conversation
  ON public.messages(request_id, sender_id, receiver_id, created_at DESC);
