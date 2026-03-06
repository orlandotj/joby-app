-- JOBY: Campos de endereço no profile (CEP + mapa)
-- Objetivo: salvar endereço detalhado + lat/lng e manter "location" (Cidade, UF).
-- Script idempotente.

DO $do$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.profiles não existe. Crie profiles antes de rodar este script.';
  END IF;

  -- Campos principais
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_cep text';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_street text';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_number text';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_complement text';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_neighborhood text';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_city text';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_state text';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_lat double precision';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_lng double precision';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_formatted text';

  -- Extra útil
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_source text';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address_updated_at timestamptz';

  -- Normalizar CEP (remove não-dígitos)
  EXECUTE $$
    UPDATE public.profiles
    SET address_cep = NULLIF(regexp_replace(address_cep, '\\D', '', 'g'), '')
    WHERE address_cep IS NOT NULL
  $$;

  -- Check simples do CEP (8 dígitos) sem quebrar quem ainda não tem
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_address_cep_check') THEN
    EXECUTE $$
      ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_address_cep_check
      CHECK (address_cep IS NULL OR address_cep ~ '^[0-9]{8}$')
    $$;
  END IF;

  -- Se já tiver cidade/UF, preenche location (Cidade, UF)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='location'
  ) THEN
    EXECUTE $$
      UPDATE public.profiles
      SET location = NULLIF(trim(
        COALESCE(NULLIF(address_city,''), '') ||
        CASE WHEN NULLIF(address_city,'') IS NOT NULL AND NULLIF(address_state,'') IS NOT NULL THEN ', ' ELSE '' END ||
        COALESCE(NULLIF(address_state,''), '')
      ), '')
      WHERE (location IS NULL OR location = '')
        AND (NULLIF(address_city,'') IS NOT NULL OR NULLIF(address_state,'') IS NOT NULL)
    $$;
  END IF;

  -- Índices úteis
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_profiles_address_city ON public.profiles(address_city)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_profiles_address_state ON public.profiles(address_state)';
END;
$do$;

-- Trigger: sempre que mexer no endereço, atualiza location + timestamps
CREATE OR REPLACE FUNCTION public.trg_profiles_address_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Normaliza CEP
  IF NEW.address_cep IS NOT NULL THEN
    NEW.address_cep := NULLIF(regexp_replace(NEW.address_cep, '\\D', '', 'g'), '');
  END IF;

  -- Atualiza location (Cidade, UF) se existir a coluna
  BEGIN
    NEW.location := NULLIF(trim(
      COALESCE(NULLIF(NEW.address_city,''), '') ||
      CASE WHEN NULLIF(NEW.address_city,'') IS NOT NULL AND NULLIF(NEW.address_state,'') IS NOT NULL THEN ', ' ELSE '' END ||
      COALESCE(NULLIF(NEW.address_state,''), '')
    ), '');
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  NEW.address_updated_at := now();
  RETURN NEW;
END;
$fn$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_profiles_address_sync') THEN
    CREATE TRIGGER trg_profiles_address_sync
      BEFORE INSERT OR UPDATE OF
        address_cep,
        address_street,
        address_number,
        address_complement,
        address_neighborhood,
        address_city,
        address_state,
        address_lat,
        address_lng,
        address_formatted,
        address_source
      ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_profiles_address_sync();
  END IF;
END;
$do$;

-- Permissões: manter padrão do projeto (SELECT por coluna para anon/authenticated)
DO $do$
DECLARE
  col text;
  cols text[] := ARRAY[
    'address_cep',
    'address_street',
    'address_number',
    'address_complement',
    'address_neighborhood',
    'address_city',
    'address_state',
    'address_lat',
    'address_lng',
    'address_formatted',
    'address_source',
    'address_updated_at'
  ];
BEGIN
  FOREACH col IN ARRAY cols LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles' AND column_name=col
    ) THEN
      EXECUTE format('GRANT SELECT (%I) ON public.profiles TO anon, authenticated', col);
    END IF;
  END LOOP;
END;
$do$;
