-- JOBY (fix): ampliar GRANT SELECT (por coluna) em public.profiles
-- Resolve 403/42501 "permission denied for table profiles" quando o front seleciona colunas
-- como full_name, is_verified, experience_start_year, joby_since_year, address_*.
-- Script idempotente e conservador: só adiciona GRANTs em colunas existentes.

DO $do$
DECLARE
  col text;
  cols text[] := ARRAY[
    -- identidade / exibição
    'id','username','username_confirmed','username_normalized',
    'name','full_name','display_name',

    -- perfil público
    'profession','bio','avatar','cover_image','location','areas',
    'created_at','updated_at',
    'rating','total_reviews','is_professional','is_verified',

    -- campos usados no app
    'experience_start_year','joby_since_year',

    -- endereço (público no app)
    'address_cep','address_street','address_number','address_complement',
    'address_neighborhood','address_city','address_state',
    'address_lat','address_lng','address_formatted',
    'address_source','address_updated_at',

    -- flags usadas em joins/listas
    'can_offer_service'
  ];
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.profiles não existe.';
  END IF;

  -- Em setups com REVOKE ALL, garantir que authenticated ainda consegue editar o próprio profile
  BEGIN
    EXECUTE 'GRANT INSERT, UPDATE ON public.profiles TO authenticated';
  EXCEPTION WHEN insufficient_privilege THEN
    -- ignore (ex: sem permissão para conceder)
    NULL;
  END;

  -- Concede SELECT somente nas colunas listadas (se existirem)
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
