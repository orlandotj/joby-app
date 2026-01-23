-- JOBY: CPF/CNPJ obrigatório para OFERECER serviços
-- Regras:
-- - Usuário só pode ofertar/ter serviços visíveis e ajustar disponibilidade se can_offer_service=true.
-- - Contratar/usar app continua livre.
--
-- Este script é idempotente e pode ser rodado após o schema base (services/bookings/profiles).

DO $do$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Tabela public.profiles não existe.';
  END IF;

  -- Garantir que o campo calculado exista (caso o setup de username ainda não tenha sido rodado)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='can_offer_service'
  ) THEN
    -- Dependências mínimas
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles' AND column_name='cpf'
    ) THEN
      EXECUTE 'ALTER TABLE public.profiles ADD COLUMN cpf text';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles' AND column_name='cnpj'
    ) THEN
      EXECUTE 'ALTER TABLE public.profiles ADD COLUMN cnpj text';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles' AND column_name='is_pj'
    ) THEN
      EXECUTE 'ALTER TABLE public.profiles ADD COLUMN is_pj boolean NOT NULL DEFAULT false';
    END IF;

    EXECUTE $$
      ALTER TABLE public.profiles
      ADD COLUMN can_offer_service boolean
      GENERATED ALWAYS AS (
        ((NOT is_pj) AND cpf IS NOT NULL) OR
        (is_pj AND cnpj IS NOT NULL)
      ) STORED
    $$;
  END IF;
END;
$do$;

-- SERVICES: exigir can_offer_service para INSERT/UPDATE e para SELECT público
DO $do$
DECLARE
  polname text;
  p record;
BEGIN
  IF to_regclass('public.services') IS NULL THEN
    -- Sem tabela de serviços, nada a fazer.
    RETURN;
  END IF;

  -- Garantir RLS
  EXECUTE 'ALTER TABLE public.services ENABLE ROW LEVEL SECURITY';

  -- Importante: policies em Postgres são permissivas (OR). Para garantir enforcement,
  -- removemos policies existentes e recriamos o conjunto mínimo.
  FOR p IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname='public' AND tablename='services'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.services', p.policyname);
  END LOOP;

  -- SELECT (público): somente serviços ativos de quem pode oferecer; dono sempre vê os próprios
  polname := 'services_select_public_or_owner';
  EXECUTE format($sql$
    CREATE POLICY %I ON public.services
    FOR SELECT
    USING (
      (
        is_active = true
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = services.user_id
            AND p.can_offer_service = true
          LIMIT 1
        )
      )
      OR user_id = auth.uid()
    )
  $sql$, polname);

  -- INSERT (dono + docs)
  polname := 'services_insert_owner_with_docs';
  EXECUTE format($sql$
    CREATE POLICY %I ON public.services
    FOR INSERT
    WITH CHECK (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.can_offer_service = true
        LIMIT 1
      )
    )
  $sql$, polname);

  -- UPDATE (dono + docs)
  polname := 'services_update_owner_with_docs';
  EXECUTE format($sql$
    CREATE POLICY %I ON public.services
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.can_offer_service = true
        LIMIT 1
      )
    )
  $sql$, polname);

  -- DELETE: dono pode apagar mesmo sem docs
  polname := 'services_delete_owner';
  EXECUTE format($sql$
    CREATE POLICY %I ON public.services
    FOR DELETE
    USING (auth.uid() = user_id)
  $sql$, polname);
END;
$do$;

-- BOOKINGS: exigir que o profissional tenha can_offer_service=true para criação
DO $do$
DECLARE
  polname text;
  p record;
BEGIN
  IF to_regclass('public.bookings') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY';

  FOR p IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname='public' AND tablename='bookings'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.bookings', p.policyname);
  END LOOP;

  polname := 'bookings_insert_client_only_if_prof_can_offer';
  EXECUTE format($sql$
    CREATE POLICY %I ON public.bookings
    FOR INSERT
    WITH CHECK (
      auth.uid() = client_id
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = bookings.professional_id
          AND p.can_offer_service = true
        LIMIT 1
      )
      AND EXISTS (
        SELECT 1
        FROM public.services s
        WHERE s.id = bookings.service_id
          AND s.user_id = bookings.professional_id
          AND s.is_active = true
        LIMIT 1
      )
    )
  $sql$, polname);

  -- UPDATE: se quem está atualizando é o profissional, exigir can_offer_service=true
  polname := 'bookings_update_owner_enforce_prof_docs';
  EXECUTE format($sql$
    CREATE POLICY %I ON public.bookings
    FOR UPDATE
    USING (auth.uid() = professional_id OR auth.uid() = client_id)
    WITH CHECK (
      (auth.uid() = client_id)
      OR (
        auth.uid() = professional_id
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = bookings.professional_id
            AND p.can_offer_service = true
          LIMIT 1
        )
      )
    )
  $sql$, polname);

  -- SELECT: manter compatível com base (somente envolvidos)
  polname := 'bookings_select_own';
  EXECUTE format($sql$
    CREATE POLICY %I ON public.bookings
    FOR SELECT
    USING (auth.uid() = professional_id OR auth.uid() = client_id)
  $sql$, polname);

  -- DELETE: cliente pode remover a própria solicitação (se a app usar delete)
  polname := 'bookings_delete_client';
  EXECUTE format($sql$
    CREATE POLICY %I ON public.bookings
    FOR DELETE
    USING (auth.uid() = client_id)
  $sql$, polname);
END;
$do$;

-- VIEW pública para Explore (colunas explícitas, nunca inclui dados privados)
DO $do$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $$
    CREATE OR REPLACE VIEW public.explore_profiles AS
    SELECT
      p.id,
      p.username,
      p.profession,
      p.avatar,
      p.bio,
      p.rating,
      p.total_reviews,
      p.location,
      p.is_professional
    FROM public.profiles p
    WHERE p.is_professional = true
      AND p.can_offer_service = true
  $$;

  EXECUTE 'GRANT SELECT ON public.explore_profiles TO anon, authenticated';
END;
$do$;

-- AVAILABILITY (tabela): exigir can_offer_service para gerenciar disponibilidade
DO $do$
DECLARE
  polname text;
  p record;
BEGIN
  IF to_regclass('public.availability') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY';

  FOR p IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname='public' AND tablename='availability'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.availability', p.policyname);
  END LOOP;

  -- SELECT público
  polname := 'availability_select_public';
  EXECUTE format($sql$
    CREATE POLICY %I ON public.availability
    FOR SELECT
    USING (true)
  $sql$, polname);

  -- ALL (insert/update/delete): dono + docs
  polname := 'availability_manage_owner_with_docs';
  EXECUTE format($sql$
    CREATE POLICY %I ON public.availability
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.can_offer_service = true
        LIMIT 1
      )
    )
  $sql$, polname);
END;
$do$;

-- (Opcional recomendado) Ao perder docs, desativar serviços e disponibilidade ativa
DO $do$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RETURN;
  END IF;

  CREATE OR REPLACE FUNCTION public.trg_profiles_disable_offers_when_docs_removed()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $fn$
  BEGIN
    -- Quando o usuário perde o direito de ofertar, desativa tudo que já estava ativo
    IF (OLD.can_offer_service IS DISTINCT FROM NEW.can_offer_service)
       AND OLD.can_offer_service = true
       AND NEW.can_offer_service = false THEN

      IF to_regclass('public.services') IS NOT NULL THEN
        UPDATE public.services
        SET is_active = false,
            updated_at = now()
        WHERE user_id = NEW.id
          AND is_active = true;
      END IF;

      IF to_regclass('public.availability') IS NOT NULL THEN
        UPDATE public.availability
        SET is_available = false
        WHERE user_id = NEW.id
          AND is_available = true;
      END IF;
    END IF;

    RETURN NEW;
  END;
  $fn$;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_profiles_disable_offers_when_docs_removed'
  ) THEN
    CREATE TRIGGER trg_profiles_disable_offers_when_docs_removed
      AFTER UPDATE OF cpf, cnpj, is_pj ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_profiles_disable_offers_when_docs_removed();
  END IF;
END;
$do$;
