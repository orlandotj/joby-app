-- Adiciona campos extras no perfil para exibição no card do modal de serviço.
-- Execute no SQL Editor do Supabase.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS experience_start_year INTEGER;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS joby_since_year INTEGER;

-- Preenche automaticamente o ano "No JOBY desde" a partir do created_at (se ainda não estiver setado)
UPDATE public.profiles
SET joby_since_year = EXTRACT(YEAR FROM created_at)::int
WHERE joby_since_year IS NULL
  AND created_at IS NOT NULL;

-- Se o seu projeto usa privilégio por coluna (REVOKE ALL + GRANT SELECT(col)...),
-- é obrigatório liberar leitura dessas colunas novas para anon/authenticated.
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='experience_start_year'
  ) THEN
    EXECUTE 'GRANT SELECT (experience_start_year) ON public.profiles TO anon, authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='joby_since_year'
  ) THEN
    EXECUTE 'GRANT SELECT (joby_since_year) ON public.profiles TO anon, authenticated';
  END IF;
END;
$do$;
