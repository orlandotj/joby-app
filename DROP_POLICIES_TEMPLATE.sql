-- Cole este bloco antes de cada CREATE POLICY no seu supabase_complete_setup.sql

-- PROFILES
DROP POLICY IF EXISTS "Profiles: Anyone can view public profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles: Users can update own profile" ON public.profiles;

-- SERVICES
DROP POLICY IF EXISTS "Services: Anyone can view active services" ON public.services;
DROP POLICY IF EXISTS "Services: Users can insert own services" ON public.services;
DROP POLICY IF EXISTS "Services: Users can update own services" ON public.services;
DROP POLICY IF EXISTS "Services: Users can delete own services" ON public.services;

-- VIDEOS
DROP POLICY IF EXISTS "Videos: Only authenticated users can view videos" ON public.videos;
DROP POLICY IF EXISTS "Videos: Users can insert own videos" ON public.videos;
DROP POLICY IF EXISTS "Videos: Users can update own videos" ON public.videos;
DROP POLICY IF EXISTS "Videos: Users can delete own videos" ON public.videos;

-- PHOTOS
DROP POLICY IF EXISTS "Photos: Only authenticated users can view photos" ON public.photos;
DROP POLICY IF EXISTS "Photos: Users can insert own photos" ON public.photos;
DROP POLICY IF EXISTS "Photos: Users can update own photos" ON public.photos;
DROP POLICY IF EXISTS "Photos: Users can delete own photos" ON public.photos;

-- REVIEWS
DROP POLICY IF EXISTS "Reviews: Anyone can view reviews" ON public.reviews;
DROP POLICY IF EXISTS "Reviews: Authenticated users can insert reviews" ON public.reviews;
DROP POLICY IF EXISTS "Reviews: Users can update own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Reviews: Users can delete own reviews" ON public.reviews;

-- BOOKINGS
DROP POLICY IF EXISTS "Bookings: Users can view own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Bookings: Users can insert bookings" ON public.bookings;
DROP POLICY IF EXISTS "Bookings: Users can update own bookings" ON public.bookings;

-- MESSAGES
DROP POLICY IF EXISTS "Messages: Users can view own messages" ON public.messages;
DROP POLICY IF EXISTS "Messages: Users can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Messages: Users can update own messages" ON public.messages;

-- FOLLOWS
DROP POLICY IF EXISTS "Follows: Anyone can view follows" ON public.follows;
DROP POLICY IF EXISTS "Follows: Users can insert own follows" ON public.follows;
DROP POLICY IF EXISTS "Follows: Users can delete own follows" ON public.follows;

-- VIDEO LIKES
DROP POLICY IF EXISTS "Video Likes: Anyone can view likes" ON public.video_likes;
DROP POLICY IF EXISTS "Video Likes: Users can like videos" ON public.video_likes;
DROP POLICY IF EXISTS "Video Likes: Users can unlike videos" ON public.video_likes;

-- PHOTO LIKES
DROP POLICY IF EXISTS "Photo Likes: Anyone can view likes" ON public.photo_likes;
DROP POLICY IF EXISTS "Photo Likes: Users can like photos" ON public.photo_likes;
DROP POLICY IF EXISTS "Photo Likes: Users can unlike photos" ON public.photo_likes;

-- COMMENTS
DROP POLICY IF EXISTS "Comments: Anyone can view comments" ON public.comments;
DROP POLICY IF EXISTS "Comments: Authenticated users can insert comments" ON public.comments;
DROP POLICY IF EXISTS "Comments: Users can update own comments" ON public.comments;
DROP POLICY IF EXISTS "Comments: Users can delete own comments" ON public.comments;

-- AVAILABILITY
DROP POLICY IF EXISTS "Availability: Anyone can view availability" ON public.availability;
DROP POLICY IF EXISTS "Availability: Users can manage own availability" ON public.availability;
