-- ========================================
-- JOBY APP - SUPABASE COMPLETE SETUP
-- ========================================
-- Execute este script no SQL Editor do Supabase
-- Ordem: Tables → Storage → RLS Policies → Functions → Triggers

-- ========================================
-- 1. ENABLE UUID EXTENSION
-- ========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- 2. PROFILES TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  profession TEXT,
  bio TEXT,
  avatar TEXT,
  cover_image TEXT,
  age INTEGER,
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
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_profession ON public.profiles(profession);
CREATE INDEX IF NOT EXISTS idx_profiles_location ON public.profiles(location);
CREATE INDEX IF NOT EXISTS idx_profiles_is_professional ON public.profiles(is_professional);

-- ========================================
-- 3. SERVICES TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  unit TEXT NOT NULL, -- 'hora', 'dia', 'evento', 'emergencia'
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_user_id ON public.services(user_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON public.services(category);
CREATE INDEX IF NOT EXISTS idx_services_is_active ON public.services(is_active);
-- ========================================
CREATE TABLE IF NOT EXISTS public.videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  thumbnail TEXT,
  duration INTEGER, -- em segundos
  video_type TEXT DEFAULT 'short', -- 'short', 'long'
-- Remoção de policies antigas para evitar duplicidade

  likes INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_user_id ON public.videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_video_type ON public.videos(video_type);
CREATE INDEX IF NOT EXISTS idx_videos_is_public ON public.videos(is_public);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON public.videos(created_at DESC);

-- ========================================
-- 5. PHOTOS TABLE
-- SERVICES

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

-- VIDEOS

-- 6. REVIEWS TABLE
-- ========================================
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
-- PHOTOS


-- ========================================
-- 7. BOOKINGS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professional_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'completed', 'cancelled'
  scheduled_date TIMESTAMPTZ,
  scheduled_time TEXT,
  duration INTEGER, -- em minutos
-- REVIEWS

  location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_professional_id ON public.bookings(professional_id);
CREATE INDEX IF NOT EXISTS idx_bookings_client_id ON public.bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_date ON public.bookings(scheduled_date);
-- BOOKINGS

-- ========================================
-- 8. MESSAGES TABLE
-- ========================================
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

-- ========================================
-- 9. FOLLOWS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.follows (
-- FOLLOWS

  follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows(following_id);

-- VIDEO LIKES

-- 10. VIDEO LIKES TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.video_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, user_id)
);

-- PHOTO LIKES

CREATE INDEX IF NOT EXISTS idx_video_likes_user_id ON public.video_likes(user_id);

-- ========================================
-- 11. PHOTO LIKES TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.photo_likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  photo_id UUID NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(photo_id, user_id)
);

-- COMMENTS

CREATE INDEX IF NOT EXISTS idx_photo_likes_user_id ON public.photo_likes(user_id);

-- ========================================
-- 12. COMMENTS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
-- AVAILABILITY
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

-- ========================================
-- 13. AVAILABILITY TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Domingo
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, day_of_week, start_time)
);

CREATE INDEX IF NOT EXISTS idx_availability_user_id ON public.availability(user_id);

-- ========================================
-- RLS (ROW LEVEL SECURITY) POLICIES
-- ========================================

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles: Anyone can view public profiles" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Profiles: Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Profiles: Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- SERVICES
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Services: Anyone can view active services" ON public.services
  FOR SELECT USING (is_active = true OR user_id = auth.uid());

CREATE POLICY "Services: Users can insert own services" ON public.services
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Services: Users can update own services" ON public.services
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Services: Users can delete own services" ON public.services
  FOR DELETE USING (auth.uid() = user_id);

-- VIDEOS
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Videos: Only authenticated users can view videos" ON public.videos
  FOR SELECT USING (auth.uid() IS NOT NULL AND (is_public = true OR user_id = auth.uid()));

CREATE POLICY "Videos: Users can insert own videos" ON public.videos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Videos: Users can update own videos" ON public.videos
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Videos: Users can delete own videos" ON public.videos
  FOR DELETE USING (auth.uid() = user_id);

-- PHOTOS
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Photos: Only authenticated users can view photos" ON public.photos
  FOR SELECT USING (auth.uid() IS NOT NULL AND (is_public = true OR user_id = auth.uid()));

CREATE POLICY "Photos: Users can insert own photos" ON public.photos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Photos: Users can update own photos" ON public.photos
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Photos: Users can delete own photos" ON public.photos
  FOR DELETE USING (auth.uid() = user_id);

-- REVIEWS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews: Anyone can view reviews" ON public.reviews
  FOR SELECT USING (true);

CREATE POLICY "Reviews: Authenticated users can insert reviews" ON public.reviews
  FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Reviews: Users can update own reviews" ON public.reviews
  FOR UPDATE USING (auth.uid() = client_id);

CREATE POLICY "Reviews: Users can delete own reviews" ON public.reviews
  FOR DELETE USING (auth.uid() = client_id);

-- BOOKINGS
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bookings: Users can view own bookings" ON public.bookings
  FOR SELECT USING (auth.uid() = professional_id OR auth.uid() = client_id);

CREATE POLICY "Bookings: Users can insert bookings" ON public.bookings
  FOR INSERT WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Bookings: Users can update own bookings" ON public.bookings
  FOR UPDATE USING (auth.uid() = professional_id OR auth.uid() = client_id);

-- MESSAGES
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Messages: Users can view own messages" ON public.messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Messages: Users can insert messages" ON public.messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Messages: Users can update own messages" ON public.messages
  FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- FOLLOWS
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Follows: Anyone can view follows" ON public.follows
  FOR SELECT USING (true);

CREATE POLICY "Follows: Users can insert own follows" ON public.follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Follows: Users can delete own follows" ON public.follows
  FOR DELETE USING (auth.uid() = follower_id);

-- VIDEO LIKES
ALTER TABLE public.video_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Video Likes: Anyone can view likes" ON public.video_likes
  FOR SELECT USING (true);

CREATE POLICY "Video Likes: Users can like videos" ON public.video_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Video Likes: Users can unlike videos" ON public.video_likes
  FOR DELETE USING (auth.uid() = user_id);

-- PHOTO LIKES
ALTER TABLE public.photo_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Photo Likes: Anyone can view likes" ON public.photo_likes
  FOR SELECT USING (true);

CREATE POLICY "Photo Likes: Users can like photos" ON public.photo_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Photo Likes: Users can unlike photos" ON public.photo_likes
  FOR DELETE USING (auth.uid() = user_id);

-- COMMENTS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments: Anyone can view comments" ON public.comments
  FOR SELECT USING (true);

CREATE POLICY "Comments: Authenticated users can insert comments" ON public.comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Comments: Users can update own comments" ON public.comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Comments: Users can delete own comments" ON public.comments
  FOR DELETE USING (auth.uid() = user_id);

-- AVAILABILITY
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Availability: Anyone can view availability" ON public.availability
  FOR SELECT USING (true);

CREATE POLICY "Availability: Users can manage own availability" ON public.availability
  FOR ALL USING (auth.uid() = user_id);

-- ========================================
-- FUNCTIONS AND TRIGGERS
-- ========================================

-- Function to update updated_at timestamp
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

-- Function to create profile automatically on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, profession, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Usuário'),
    COALESCE(NEW.raw_user_meta_data->>'profession', ''),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update profile rating
CREATE OR REPLACE FUNCTION update_profile_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET 
    rating = (SELECT AVG(rating) FROM public.reviews WHERE professional_id = NEW.professional_id),
    total_reviews = (SELECT COUNT(*) FROM public.reviews WHERE professional_id = NEW.professional_id)
  WHERE id = NEW.professional_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_rating_after_review ON public.reviews;
CREATE TRIGGER update_rating_after_review
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION update_profile_rating();

-- Function to update video likes count
CREATE OR REPLACE FUNCTION update_video_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos
    SET likes = likes + 1
    WHERE id = NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos
    SET likes = likes - 1
    WHERE id = OLD.video_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_video_likes ON public.video_likes;
CREATE TRIGGER update_video_likes
  AFTER INSERT OR DELETE ON public.video_likes
  FOR EACH ROW EXECUTE FUNCTION update_video_likes_count();

-- Function to update photo likes count
CREATE OR REPLACE FUNCTION update_photo_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.photos
    SET likes = likes + 1
    WHERE id = NEW.photo_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.photos
    SET likes = likes - 1
    WHERE id = OLD.photo_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_photo_likes ON public.photo_likes;
CREATE TRIGGER update_photo_likes
  AFTER INSERT OR DELETE ON public.photo_likes
  FOR EACH ROW EXECUTE FUNCTION update_photo_likes_count();

-- ========================================
-- STORAGE BUCKETS (Execute via Supabase Dashboard)
-- ========================================
-- Você precisará criar estes buckets manualmente no Supabase Dashboard:
-- 1. profile-photos (public)
-- 2. videos (public)
-- 3. photos (public)
-- 4. thumbnails (public)

-- ========================================
-- VIEWS FOR COMMON QUERIES
-- ========================================

-- View para feed de vídeos com informações do usuário
CREATE OR REPLACE VIEW public.videos_feed AS
SELECT 
  v.*,
  p.name as user_name,
  p.profession as user_profession,
  p.avatar as user_avatar
FROM public.videos v
JOIN public.profiles p ON v.user_id = p.id
WHERE v.is_public = true
ORDER BY v.created_at DESC;

-- View para profissionais populares
CREATE OR REPLACE VIEW public.popular_professionals AS
SELECT 
  p.*,
  COUNT(DISTINCT f.id) as followers_count,
  COUNT(DISTINCT v.id) as videos_count
FROM public.profiles p
LEFT JOIN public.follows f ON p.id = f.following_id
LEFT JOIN public.videos v ON p.id = v.user_id
WHERE p.is_professional = true
GROUP BY p.id
ORDER BY followers_count DESC, p.rating DESC;

-- ========================================
-- SEED DATA FOR TESTING (OPTIONAL)
-- ========================================
-- Descomente as linhas abaixo se quiser dados de teste

-- INSERT INTO public.profiles (id, name, profession, bio, is_professional) VALUES
-- ('00000000-0000-0000-0000-000000000001', 'João Silva', 'Eletricista', 'Profissional com 10 anos de experiência', true),
-- ('00000000-0000-0000-0000-000000000002', 'Maria Santos', 'Pintor', 'Especialista em pintura residencial', true);

-- ========================================
-- SETUP COMPLETE!
-- ========================================
-- Próximos passos:
-- 1. Configure o Email Authentication no Supabase Dashboard
-- 2. Crie os Storage Buckets necessários
-- 3. Configure as variáveis de ambiente (.env)
-- 4. Teste o cadastro e login
