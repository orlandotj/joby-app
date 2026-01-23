-- ========================================
-- JOBY APP - SUPABASE COMPLETE SETUP (V2)
-- Compatível com:
-- - Nickname (@username) + dados pessoais privados
-- - Login por nickname (resolve_login_email)
-- - CPF/CNPJ obrigatório para oferecer serviços (services + availability + explore + bookings)
--
-- Execute no SQL Editor do Supabase.
-- Ordem recomendada (fresh DB): este arquivo sozinho.
-- Ordem recomendada (DB existente): rode os scripts de migração do repo (setup_*.sql).
-- ========================================

-- ========================================
-- 1. EXTENSIONS
-- ========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- 2. TABLES
-- ========================================

-- PROFILES (público via grants por coluna; privado via RPC)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Público (identidade)
  username TEXT,
  username_normalized TEXT,
  username_confirmed BOOLEAN NOT NULL DEFAULT false,

  -- Privado (não dar GRANT SELECT)
  full_name TEXT,
  birth_date DATE,
  is_pj BOOLEAN NOT NULL DEFAULT false,
  cpf TEXT,
  cnpj TEXT,

  -- Público (perfil)
  name TEXT, -- legado (não usar como público; mantido p/ compatibilidade)
  profession TEXT,
  bio TEXT,
  avatar TEXT,
  cover_image TEXT,
  location TEXT,
  areas TEXT,

  hourly_rate NUMERIC(10,2),
  daily_rate NUMERIC(10,2),
  event_rate NUMERIC(10,2),
  emergency_rate NUMERIC(10,2),

  phone TEXT,
  whatsapp TEXT,

  rating NUMERIC(3,2) DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  total_jobs INTEGER DEFAULT 0,
  is_professional BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  can_offer_service BOOLEAN GENERATED ALWAYS AS (
    ((NOT is_pj) AND cpf IS NOT NULL) OR
    (is_pj AND cnpj IS NOT NULL)
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_profiles_profession ON public.profiles(profession);
CREATE INDEX IF NOT EXISTS idx_profiles_location ON public.profiles(location);
CREATE INDEX IF NOT EXISTS idx_profiles_is_professional ON public.profiles(is_professional);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_normalized_key ON public.profiles(username_normalized);

-- SERVICES
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  unit TEXT NOT NULL,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_user_id ON public.services(user_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON public.services(category);
CREATE INDEX IF NOT EXISTS idx_services_is_active ON public.services(is_active);

-- VIDEOS
CREATE TABLE IF NOT EXISTS public.videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  thumbnail TEXT,
  duration INTEGER,
  video_type TEXT DEFAULT 'short',
  likes INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_user_id ON public.videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_video_type ON public.videos(video_type);
CREATE INDEX IF NOT EXISTS idx_videos_is_public ON public.videos(is_public);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON public.videos(created_at DESC);

-- PHOTOS
CREATE TABLE IF NOT EXISTS public.photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT,
  likes INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photos_user_id ON public.photos(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_created_at ON public.photos(created_at DESC);

-- REVIEWS
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(professional_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_professional_id ON public.reviews(professional_id);

-- BOOKINGS
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending',
  scheduled_date TIMESTAMPTZ,
  scheduled_time TEXT,
  duration INTEGER,
  location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_professional_id ON public.bookings(professional_id);
CREATE INDEX IF NOT EXISTS idx_bookings_client_id ON public.bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_date ON public.bookings(scheduled_date);

-- MESSAGES
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON public.messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(sender_id, receiver_id, created_at DESC);

-- FOLLOWS
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows(following_id);

-- VIDEO LIKES
CREATE TABLE IF NOT EXISTS public.video_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_video_likes_user_id ON public.video_likes(user_id);

-- PHOTO LIKES
CREATE TABLE IF NOT EXISTS public.photo_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  photo_id UUID NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(photo_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_photo_likes_user_id ON public.photo_likes(user_id);

-- COMMENTS
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE,
  photo_id UUID REFERENCES public.photos(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (
    (video_id IS NOT NULL AND photo_id IS NULL) OR
    (video_id IS NULL AND photo_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_comments_video_id ON public.comments(video_id);
CREATE INDEX IF NOT EXISTS idx_comments_photo_id ON public.comments(photo_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments(user_id);

-- AVAILABILITY
CREATE TABLE IF NOT EXISTS public.availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, day_of_week, start_time)
);

CREATE INDEX IF NOT EXISTS idx_availability_user_id ON public.availability(user_id);

-- ========================================
-- 3. FUNCTIONS
-- ========================================

-- Normalize username (removes '@' + spaces)
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

-- Trigger: keep username fields consistent
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

-- Username availability
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

-- Resolve nickname -> email (for login). Only if username_confirmed.
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

  IF v IS NULL OR v = '' OR length(v) < 3 OR length(v) > 30 OR v !~ '^[a-z0-9._]+$' OR v ~ '^\\.' OR v ~ '\\.$' OR v ~ '\\.\\.' THEN
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

-- Private profile RPC
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
    p.areas,
    p.updated_at,
    p.created_at
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
END;
$fn$;

-- updated_at helper
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_services_updated_at ON public.services;
CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_videos_updated_at ON public.videos;
CREATE TRIGGER update_videos_updated_at
  BEFORE UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bookings_updated_at ON public.bookings;
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  display_name text;
  uname text;
BEGIN
  display_name := COALESCE(NEW.raw_user_meta_data->>'name', 'Usuário');
  uname := 'user_' || left(replace(NEW.id::text, '-', ''), 8);

  INSERT INTO public.profiles (id, username, username_normalized, full_name, name, profession, created_at)
  VALUES (
    NEW.id,
    uname,
    lower(uname),
    display_name,
    display_name,
    COALESCE(NEW.raw_user_meta_data->>'profession', ''),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update profile rating (supports DELETE)
CREATE OR REPLACE FUNCTION update_profile_rating()
RETURNS TRIGGER AS $$
DECLARE
  target_id uuid;
BEGIN
  target_id := COALESCE(NEW.professional_id, OLD.professional_id);

  UPDATE public.profiles
  SET
    rating = (SELECT AVG(r.rating) FROM public.reviews r WHERE r.professional_id = target_id),
    total_reviews = (SELECT COUNT(*) FROM public.reviews r WHERE r.professional_id = target_id)
  WHERE id = target_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_rating_after_review ON public.reviews;
CREATE TRIGGER update_rating_after_review
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION update_profile_rating();

-- Likes counters
CREATE OR REPLACE FUNCTION update_video_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos SET likes = likes + 1 WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos SET likes = likes - 1 WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_video_likes ON public.video_likes;
CREATE TRIGGER update_video_likes
  AFTER INSERT OR DELETE ON public.video_likes
  FOR EACH ROW EXECUTE FUNCTION update_video_likes_count();

CREATE OR REPLACE FUNCTION update_photo_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.photos SET likes = likes + 1 WHERE id = NEW.photo_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.photos SET likes = likes - 1 WHERE id = OLD.photo_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_photo_likes ON public.photo_likes;
CREATE TRIGGER update_photo_likes
  AFTER INSERT OR DELETE ON public.photo_likes
  FOR EACH ROW EXECUTE FUNCTION update_photo_likes_count();

-- When docs removed, disable active offers
CREATE OR REPLACE FUNCTION public.trg_profiles_disable_offers_when_docs_removed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF (OLD.can_offer_service IS DISTINCT FROM NEW.can_offer_service)
     AND OLD.can_offer_service = true
     AND NEW.can_offer_service = false THEN

    UPDATE public.services
    SET is_active = false, updated_at = now()
    WHERE user_id = NEW.id AND is_active = true;

    UPDATE public.availability
    SET is_available = false
    WHERE user_id = NEW.id AND is_available = true;
  END IF;

  RETURN NEW;
END;
$fn$;

DO $do$
BEGIN
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

-- ========================================
-- 4. RLS POLICIES
-- ========================================

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Public read policy (rows). Column-level GRANT controls what is visible.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_select_public'
  ) THEN
    CREATE POLICY profiles_select_public
      ON public.profiles
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_insert_own'
  ) THEN
    CREATE POLICY profiles_insert_own
      ON public.profiles
      FOR INSERT
      WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_update_own'
  ) THEN
    CREATE POLICY profiles_update_own
      ON public.profiles
      FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END;
$do$;

-- Column-level privileges: only safe columns are selectable publicly
DO $do$
DECLARE
  col text;
  cols text[] := ARRAY[
    'id','username','username_confirmed','can_offer_service',
    'name','profession','bio','avatar','cover_image','location','areas',
    'created_at','updated_at','rating','total_reviews','is_professional'
  ];
BEGIN
  REVOKE ALL ON public.profiles FROM anon, authenticated;
  GRANT INSERT, UPDATE ON public.profiles TO authenticated;

  FOREACH col IN ARRAY cols LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles' AND column_name=col
    ) THEN
      EXECUTE format('GRANT SELECT (%I) ON public.profiles TO anon, authenticated', col);
    END IF;
  END LOOP;

  GRANT EXECUTE ON FUNCTION public.check_username_available(text, uuid) TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.get_my_profile_private() TO authenticated;
END;
$do$;

-- SERVICES
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
DO $do$
BEGIN
  -- SELECT
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='services' AND policyname='services_select_public_or_owner') THEN
    CREATE POLICY services_select_public_or_owner
      ON public.services
      FOR SELECT
      USING (
        (
          is_active = true
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = services.user_id AND p.can_offer_service = true
            LIMIT 1
          )
        )
        OR user_id = auth.uid()
      );
  END IF;

  -- INSERT
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='services' AND policyname='services_insert_owner_with_docs') THEN
    CREATE POLICY services_insert_owner_with_docs
      ON public.services
      FOR INSERT
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.can_offer_service = true
          LIMIT 1
        )
      );
  END IF;

  -- UPDATE
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='services' AND policyname='services_update_owner_with_docs') THEN
    CREATE POLICY services_update_owner_with_docs
      ON public.services
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.can_offer_service = true
          LIMIT 1
        )
      );
  END IF;

  -- DELETE
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='services' AND policyname='services_delete_owner') THEN
    CREATE POLICY services_delete_owner
      ON public.services
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END;
$do$;

-- BOOKINGS
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bookings' AND policyname='bookings_select_own') THEN
    CREATE POLICY bookings_select_own
      ON public.bookings
      FOR SELECT
      USING (auth.uid() = professional_id OR auth.uid() = client_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bookings' AND policyname='bookings_insert_client_only_if_prof_can_offer') THEN
    CREATE POLICY bookings_insert_client_only_if_prof_can_offer
      ON public.bookings
      FOR INSERT
      WITH CHECK (
        auth.uid() = client_id
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = bookings.professional_id AND p.can_offer_service = true
          LIMIT 1
        )
        AND EXISTS (
          SELECT 1 FROM public.services s
          WHERE s.id = bookings.service_id
            AND s.user_id = bookings.professional_id
            AND s.is_active = true
          LIMIT 1
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bookings' AND policyname='bookings_update_owner_enforce_prof_docs') THEN
    CREATE POLICY bookings_update_owner_enforce_prof_docs
      ON public.bookings
      FOR UPDATE
      USING (auth.uid() = professional_id OR auth.uid() = client_id)
      WITH CHECK (
        (auth.uid() = client_id)
        OR (
          auth.uid() = professional_id
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = bookings.professional_id AND p.can_offer_service = true
            LIMIT 1
          )
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bookings' AND policyname='bookings_delete_client') THEN
    CREATE POLICY bookings_delete_client
      ON public.bookings
      FOR DELETE
      USING (auth.uid() = client_id);
  END IF;
END;
$do$;

-- AVAILABILITY
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='availability' AND policyname='availability_select_public') THEN
    CREATE POLICY availability_select_public
      ON public.availability
      FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='availability' AND policyname='availability_manage_owner_with_docs') THEN
    CREATE POLICY availability_manage_owner_with_docs
      ON public.availability
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND p.can_offer_service = true
          LIMIT 1
        )
      );
  END IF;
END;
$do$;

-- Other tables (basic RLS similar to legacy setup)
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='videos' AND policyname='videos_select_auth') THEN
    CREATE POLICY videos_select_auth ON public.videos
      FOR SELECT USING (auth.uid() IS NOT NULL AND (is_public = true OR user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='videos' AND policyname='videos_insert_owner') THEN
    CREATE POLICY videos_insert_owner ON public.videos
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='videos' AND policyname='videos_update_owner') THEN
    CREATE POLICY videos_update_owner ON public.videos
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='videos' AND policyname='videos_delete_owner') THEN
    CREATE POLICY videos_delete_owner ON public.videos
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END; $do$;

ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='photos' AND policyname='photos_select_auth') THEN
    CREATE POLICY photos_select_auth ON public.photos
      FOR SELECT USING (auth.uid() IS NOT NULL AND (is_public = true OR user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='photos' AND policyname='photos_insert_owner') THEN
    CREATE POLICY photos_insert_owner ON public.photos
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='photos' AND policyname='photos_update_owner') THEN
    CREATE POLICY photos_update_owner ON public.photos
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='photos' AND policyname='photos_delete_owner') THEN
    CREATE POLICY photos_delete_owner ON public.photos
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END; $do$;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname='reviews_select_public') THEN
    CREATE POLICY reviews_select_public ON public.reviews
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname='reviews_insert_client') THEN
    CREATE POLICY reviews_insert_client ON public.reviews
      FOR INSERT WITH CHECK (auth.uid() = client_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname='reviews_update_client') THEN
    CREATE POLICY reviews_update_client ON public.reviews
      FOR UPDATE USING (auth.uid() = client_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname='reviews_delete_client') THEN
    CREATE POLICY reviews_delete_client ON public.reviews
      FOR DELETE USING (auth.uid() = client_id);
  END IF;
END; $do$;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_select_own') THEN
    CREATE POLICY messages_select_own ON public.messages
      FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_insert_sender') THEN
    CREATE POLICY messages_insert_sender ON public.messages
      FOR INSERT WITH CHECK (auth.uid() = sender_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='messages' AND policyname='messages_update_own') THEN
    CREATE POLICY messages_update_own ON public.messages
      FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
  END IF;
END; $do$;

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='follows' AND policyname='follows_select_public') THEN
    CREATE POLICY follows_select_public ON public.follows
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='follows' AND policyname='follows_insert_owner') THEN
    CREATE POLICY follows_insert_owner ON public.follows
      FOR INSERT WITH CHECK (auth.uid() = follower_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='follows' AND policyname='follows_delete_owner') THEN
    CREATE POLICY follows_delete_owner ON public.follows
      FOR DELETE USING (auth.uid() = follower_id);
  END IF;
END; $do$;

ALTER TABLE public.video_likes ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='video_likes' AND policyname='video_likes_select_public') THEN
    CREATE POLICY video_likes_select_public ON public.video_likes
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='video_likes' AND policyname='video_likes_insert_owner') THEN
    CREATE POLICY video_likes_insert_owner ON public.video_likes
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='video_likes' AND policyname='video_likes_delete_owner') THEN
    CREATE POLICY video_likes_delete_owner ON public.video_likes
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END; $do$;

ALTER TABLE public.photo_likes ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='photo_likes' AND policyname='photo_likes_select_public') THEN
    CREATE POLICY photo_likes_select_public ON public.photo_likes
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='photo_likes' AND policyname='photo_likes_insert_owner') THEN
    CREATE POLICY photo_likes_insert_owner ON public.photo_likes
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='photo_likes' AND policyname='photo_likes_delete_owner') THEN
    CREATE POLICY photo_likes_delete_owner ON public.photo_likes
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END; $do$;

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comments' AND policyname='comments_select_public') THEN
    CREATE POLICY comments_select_public ON public.comments
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comments' AND policyname='comments_insert_owner') THEN
    CREATE POLICY comments_insert_owner ON public.comments
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comments' AND policyname='comments_update_owner') THEN
    CREATE POLICY comments_update_owner ON public.comments
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comments' AND policyname='comments_delete_owner') THEN
    CREATE POLICY comments_delete_owner ON public.comments
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END; $do$;

-- ========================================
-- 5. VIEWS
-- ========================================

-- Feed de vídeos (não usa name; expõe username)
CREATE OR REPLACE VIEW public.videos_feed AS
SELECT
  v.*,
  p.username as user_username,
  p.profession as user_profession,
  p.avatar as user_avatar
FROM public.videos v
JOIN public.profiles p ON v.user_id = p.id
WHERE v.is_public = true
ORDER BY v.created_at DESC;

GRANT SELECT ON public.videos_feed TO anon, authenticated;

-- Profissionais populares (colunas explícitas; nunca p.*)
CREATE OR REPLACE VIEW public.popular_professionals AS
SELECT
  p.id,
  p.username,
  p.profession,
  p.bio,
  p.avatar,
  p.location,
  p.rating,
  p.total_reviews,
  p.is_professional,
  COUNT(DISTINCT f.follower_id) as followers_count,
  COUNT(DISTINCT v.id) as videos_count
FROM public.profiles p
LEFT JOIN public.follows f ON p.id = f.following_id
LEFT JOIN public.videos v ON p.id = v.user_id
WHERE p.is_professional = true
GROUP BY p.id, p.username, p.profession, p.bio, p.avatar, p.location, p.rating, p.total_reviews, p.is_professional
ORDER BY followers_count DESC, p.rating DESC;

GRANT SELECT ON public.popular_professionals TO anon, authenticated;

-- Explore (somente quem pode oferecer)
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
  AND p.can_offer_service = true;

GRANT SELECT ON public.explore_profiles TO anon, authenticated;

-- ========================================
-- SETUP COMPLETE (V2)
-- ========================================
