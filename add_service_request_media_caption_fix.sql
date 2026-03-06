-- JOBY (fix): adiciona coluna caption em service_request_media (se estiver faltando)
-- Resolve 400/42703 "column service_request_media.caption does not exist".
-- Script idempotente.

DO $do$
BEGIN
  IF to_regclass('public.service_request_media') IS NULL THEN
    RAISE NOTICE 'Tabela public.service_request_media não existe (rode setup_service_requests_and_media.sql primeiro).';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.service_request_media ADD COLUMN IF NOT EXISTS caption text';

  -- Se o projeto estiver usando GRANT por coluna, garante leitura do caption.
  BEGIN
    EXECUTE 'GRANT SELECT (caption) ON public.service_request_media TO authenticated';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$do$;
