-- ============================================
-- JOBY - CHAT ATTACHMENTS METADATA (MESSAGES)
-- Objetivo: garantir colunas necessárias para anexos no chat.
-- Execute no Supabase SQL Editor.
-- ============================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size BIGINT,
  ADD COLUMN IF NOT EXISTS thumb_url TEXT,
  ADD COLUMN IF NOT EXISTS duration INTEGER;
