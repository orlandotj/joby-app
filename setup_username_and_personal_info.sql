-- JOBY: Nickname (username) + Informações pessoais (Supabase)
-- Objetivo: username único (case-insensitive) e dados pessoais privados.
-- Este script é idempotente e tenta não quebrar instalações existentes.

-- Requisitos:
-- - tabela public.profiles já existe
-- - extensão pgcrypto geralmente já existe no Supabase

DO $do$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.profiles não existe. Crie profiles antes de rodar este script.';
  END IF;

  -- Novos campos
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username_normalized text';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_date date';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf text';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cnpj text';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_pj boolean NOT NULL DEFAULT false';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username_confirmed boolean NOT NULL DEFAULT false';
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()';

  -- Campo calculado: pode oferecer serviços?
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='can_offer_service'
  ) THEN
    EXECUTE $$
      ALTER TABLE public.profiles
      ADD COLUMN can_offer_service boolean
      GENERATED ALWAYS AS (
        ((NOT is_pj) AND cpf IS NOT NULL) OR
        (is_pj AND cnpj IS NOT NULL)
      ) STORED
    $$;
  END IF;

  -- Backfill: full_name (se houver coluna legacy "name")
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='name'
  ) THEN
    EXECUTE $$
      UPDATE public.profiles
      SET full_name = COALESCE(NULLIF(full_name, ''), NULLIF(name, ''), full_name)
      WHERE full_name IS NULL OR full_name = ''
    $$;
  END IF;

  -- Backfill: username (gerar placeholder único)
  EXECUTE $$
    UPDATE public.profiles
    SET username = COALESCE(NULLIF(username, ''), 'user_' || left(replace(id::text, '-', ''), 8))
    WHERE username IS NULL OR username = ''
  $$;

  -- Backfill: username_normalized
  EXECUTE $$
    UPDATE public.profiles
    SET username_normalized = COALESCE(NULLIF(username_normalized, ''), lower(username))
    WHERE username_normalized IS NULL OR username_normalized = ''
  $$;

  -- Backfill: username_confirmed (placeholder user_xxxxxxxx = false)
  EXECUTE $$
    UPDATE public.profiles
    SET username_confirmed = (
      username_normalized IS NOT NULL
      AND username_normalized !~ '^user_[0-9a-f]{8}$'
    )
    WHERE username_confirmed IS DISTINCT FROM (
      username_normalized IS NOT NULL
      AND username_normalized !~ '^user_[0-9a-f]{8}$'
    )
  $$;

  -- Backfill: full_name final (não deixar vazio)
  EXECUTE $$
    UPDATE public.profiles
    SET full_name = COALESCE(NULLIF(full_name, ''), 'Usuário')
    WHERE full_name IS NULL OR full_name = ''
  $$;

  -- Sanitização de CPF/CNPJ (remove não-dígitos e normaliza inválidos para NULL)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='cpf'
  ) THEN
    EXECUTE $$
      UPDATE public.profiles
      SET cpf = NULLIF(regexp_replace(cpf, '\\D', '', 'g'), '')
      WHERE cpf IS NOT NULL
    $$;
    EXECUTE $$
      UPDATE public.profiles
      SET cpf = NULL
      WHERE cpf IS NOT NULL AND cpf !~ '^[0-9]{11}$'
    $$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='cnpj'
  ) THEN
    EXECUTE $$
      UPDATE public.profiles
      SET cnpj = NULLIF(regexp_replace(cnpj, '\\D', '', 'g'), '')
      WHERE cnpj IS NOT NULL
    $$;
    EXECUTE $$
      UPDATE public.profiles
      SET cnpj = NULL
      WHERE cnpj IS NOT NULL AND cnpj !~ '^[0-9]{14}$'
    $$;
  END IF;

  -- Normalizar is_pj de acordo com o documento preenchido (evita violar o check de exclusividade)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='is_pj'
  ) THEN
    EXECUTE $$
      UPDATE public.profiles
      SET is_pj = true
      WHERE cnpj IS NOT NULL AND (cpf IS NULL)
    $$;
    EXECUTE $$
      UPDATE public.profiles
      SET is_pj = false
      WHERE cpf IS NOT NULL AND (cnpj IS NULL)
    $$;
    EXECUTE $$
      UPDATE public.profiles
      SET cpf = NULL
      WHERE is_pj = true AND cpf IS NOT NULL
    $$;
    EXECUTE $$
      UPDATE public.profiles
      SET cnpj = NULL
      WHERE is_pj = false AND cnpj IS NOT NULL
    $$;
  END IF;
END;
$do$;

-- Normalização (client e trigger usam o mesmo conceito)
CREATE OR REPLACE FUNCTION public.normalize_username(p_username text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(trim(coalesce(p_username, '')), '^@', ''),
      '\\s+',
      '',
      'g'
    )
  )
$$;

-- Trigger para manter username/username_normalized consistentes
CREATE OR REPLACE FUNCTION public.trg_profiles_username_normalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v text;
  raw_input text;
BEGIN
  raw_input := trim(coalesce(NEW.username, ''));

  v := public.normalize_username(
    COALESCE(
      NULLIF(NEW.username, ''),
      'user_' || left(replace(NEW.id::text, '-', ''), 8)
    )
  );

  -- Opcional: erro claro quando usuário informa um username inválido
  IF raw_input <> '' THEN
    IF v IS NULL OR v = '' THEN
      RAISE EXCEPTION 'Nickname inválido. Informe um nickname válido.';
    END IF;
    IF length(v) < 3 OR length(v) > 30 OR v !~ '^[a-z0-9._]+$' OR v ~ '^\\.' OR v ~ '\\.$' OR v ~ '\\.\\.' THEN
      RAISE EXCEPTION 'Nickname inválido. Use 3-30 caracteres: letras, números, ponto e underscore; sem ponto no começo/fim e sem dois pontos seguidos.';
    END IF;
  END IF;

  NEW.username := v;
  NEW.username_normalized := v;
  NEW.username_confirmed := (v IS NOT NULL AND v <> '' AND v !~ '^user_[0-9a-f]{8}$');
  NEW.updated_at := now();

  RETURN NEW;
END;
$fn$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_profiles_username_normalize'
  ) THEN
    CREATE TRIGGER trg_profiles_username_normalize
      BEFORE INSERT OR UPDATE OF username
      ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_profiles_username_normalize();
  END IF;
END;
$do$;

-- Constraints / índices
DO $do$
BEGIN
  -- Unicidade case-insensitive via username_normalized
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='profiles_username_normalized_key'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX profiles_username_normalized_key ON public.profiles (username_normalized)';
  END IF;

  -- Checks (permitindo NULL para birth_date/cpf/cnpj para não quebrar usuários existentes; o app exige no cadastro/edição)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_username_format_check'
  ) THEN
    EXECUTE $$
      ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_format_check
      CHECK (
        username_normalized IS NOT NULL
        AND username_normalized ~ '^[a-z0-9._]{3,30}$'
        AND username_normalized !~ '^\\.'
        AND username_normalized !~ '\\.$'
        AND username_normalized !~ '\\.\\.'
      )
    $$;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_birth_date_check'
  ) THEN
    EXECUTE $$
      ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_birth_date_check
      CHECK (birth_date IS NULL OR birth_date <= current_date)
    $$;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_cpf_check'
  ) THEN
    EXECUTE $$
      ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_cpf_check
      CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$')
    $$;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_cnpj_check'
  ) THEN
    EXECUTE $$
      ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_cnpj_check
      CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$')
    $$;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_pj_exclusive_check'
  ) THEN
    EXECUTE $$
      ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_pj_exclusive_check
      CHECK (
        (is_pj AND cpf IS NULL) OR
        (NOT is_pj AND cnpj IS NULL)
      )
    $$;
  END IF;
END;
$do$;

-- RPC: disponibilidade de nickname
CREATE OR REPLACE FUNCTION public.check_username_available(p_username text, p_exclude_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v text;
  v_exclude uuid;
BEGIN
  v := public.normalize_username(p_username);

  -- se não passa no regex básico, considera indisponível
  IF v IS NULL OR v = '' OR length(v) < 3 OR length(v) > 30 OR v !~ '^[a-z0-9._]+$' OR v ~ '^\\.' OR v ~ '\\.$' OR v ~ '\\.\\.' THEN
    RETURN false;
  END IF;

  v_exclude := COALESCE(p_exclude_user_id, auth.uid());

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.username_normalized = v
      AND (v_exclude IS NULL OR p.id <> v_exclude)
    LIMIT 1
  );
END;
$fn$;

-- RPC: resolver @username -> email (para login por nickname)
-- Observação: retorna email apenas se username_confirmed=true.
CREATE OR REPLACE FUNCTION public.resolve_login_email(p_login text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v text;
  out_email text;
BEGIN
  v := public.normalize_username(regexp_replace(coalesce(p_login, ''), '^@', ''));

  IF v IS NULL OR v = '' OR length(v) < 3 OR length(v) > 30 OR v !~ '^[a-z0-9._]+$' OR v ~ '^\.' OR v ~ '\.$' OR v ~ '\.\.' THEN
    RETURN NULL;
  END IF;

  SELECT u.email
  INTO out_email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.username_normalized = v
    AND p.username_confirmed = true
  LIMIT 1;

  RETURN out_email;
END;
$fn$;

-- RPC: perfil privado do próprio usuário
-- Observação: ao adicionar/remover colunas do RETURNS TABLE, o Postgres não permite alterar
-- o tipo de retorno com CREATE OR REPLACE. Por isso, fazemos DROP e recriamos.
DROP FUNCTION IF EXISTS public.get_my_profile_private();
CREATE OR REPLACE FUNCTION public.get_my_profile_private()
RETURNS TABLE (
  id uuid,
  username text,
  username_normalized text,
  full_name text,
  birth_date date,
  cpf text,
  cnpj text,
  is_pj boolean,
  profession text,
  bio text,
  avatar text,
  cover_image text,
  location text,
  address_cep text,
  address_street text,
  address_number text,
  address_complement text,
  address_neighborhood text,
  address_city text,
  address_state text,
  address_lat double precision,
  address_lng double precision,
  address_formatted text,
  address_source text,
  address_updated_at timestamptz,
  areas text,
  updated_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.username_normalized,
    p.full_name,
    p.birth_date,
    p.cpf,
    p.cnpj,
    p.is_pj,
    p.profession,
    p.bio,
    p.avatar,
    p.cover_image,
    p.location,
    p.address_cep,
    p.address_street,
    p.address_number,
    p.address_complement,
    p.address_neighborhood,
    p.address_city,
    p.address_state,
    p.address_lat,
    p.address_lng,
    p.address_formatted,
    p.address_source,
    p.address_updated_at,
    p.areas,
    p.updated_at,
    p.created_at
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
END;
$fn$;

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $do$
BEGIN
  -- SELECT público (linhas): todos podem ler (colunas são controladas por GRANT)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_select_public'
  ) THEN
    EXECUTE $$
      CREATE POLICY profiles_select_public
      ON public.profiles
      FOR SELECT
      USING (true)
    $$;
  END IF;

  -- INSERT/UPDATE apenas dono
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_insert_own'
  ) THEN
    EXECUTE $$
      CREATE POLICY profiles_insert_own
      ON public.profiles
      FOR INSERT
      WITH CHECK (auth.uid() = id)
    $$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_update_own'
  ) THEN
    EXECUTE $$
      CREATE POLICY profiles_update_own
      ON public.profiles
      FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id)
    $$;
  END IF;
END;
$do$;

-- Permissões (coluna a coluna para não expor full_name/birth_date/cpf/cnpj)
DO $do$
DECLARE
  col text;
  cols text[] := ARRAY[
    'id',
    'name',
    'username',
    'username_confirmed',
    'can_offer_service',
    'profession',
    'bio',
    'avatar',
    'cover_image',
    'location',
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
    'areas',
    'created_at',
    'updated_at',
    'rating',
    'total_reviews',
    'is_professional'
  ];
BEGIN
  -- Reset básico
  EXECUTE 'REVOKE ALL ON public.profiles FROM anon, authenticated';
  EXECUTE 'GRANT INSERT, UPDATE ON public.profiles TO authenticated';

  FOREACH col IN ARRAY cols LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles' AND column_name=col
    ) THEN
      EXECUTE format('GRANT SELECT (%I) ON public.profiles TO anon, authenticated', col);
    END IF;
  END LOOP;

  -- Funções
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.check_username_available(text, uuid) TO anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_my_profile_private() TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated';
END;
$do$;

-- Observação:
-- - O app deve usar @username como nome público.
-- - full_name/birth_date/cpf/cnpj são lidos apenas via RPC get_my_profile_private().
