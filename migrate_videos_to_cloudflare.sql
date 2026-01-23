-- Migração: Adicionar campos Cloudflare R2 na tabela videos
-- Execute este SQL no Supabase SQL Editor

-- Adicionar campos para Cloudflare R2
ALTER TABLE public.videos
ADD COLUMN IF NOT EXISTS cloudflare_video_uid TEXT,
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'supabase' CHECK (provider IN ('supabase', 'cloudflare_r2')),
ADD COLUMN IF NOT EXISTS video_status TEXT DEFAULT 'ready' CHECK (video_status IN ('uploading', 'processing', 'ready', 'error'));

-- Criar índice para busca rápida por status
CREATE INDEX IF NOT EXISTS idx_videos_status ON public.videos(video_status);
CREATE INDEX IF NOT EXISTS idx_videos_provider ON public.videos(provider);
CREATE INDEX IF NOT EXISTS idx_videos_cloudflare_uid ON public.videos(cloudflare_video_uid) WHERE cloudflare_video_uid IS NOT NULL;

-- Comentários para documentação
COMMENT ON COLUMN public.videos.cloudflare_video_uid IS 'UID do vídeo no Cloudflare R2 (ex: uuid do vídeo)';
COMMENT ON COLUMN public.videos.provider IS 'Provedor de armazenamento: supabase ou cloudflare_r2';
COMMENT ON COLUMN public.videos.video_status IS 'Status do processamento: uploading, processing, ready, error';
COMMENT ON COLUMN public.videos.url IS 'Quando provider=cloudflare: armazena o r2_key (ex: videos/user-id/video-id.mp4). Quando provider=supabase: armazena storage://bucket/path ou URL pública.';
