-- ========================================
-- FIX PHOTOS TABLE - Adicionar coluna views
-- ========================================
-- Execute este script no SQL Editor do Supabase

-- Adicionar coluna views na tabela photos se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'photos' 
        AND column_name = 'views'
    ) THEN
        ALTER TABLE public.photos ADD COLUMN views INTEGER DEFAULT 0;
        RAISE NOTICE 'Coluna views adicionada à tabela photos';
    ELSE
        RAISE NOTICE 'Coluna views já existe na tabela photos';
    END IF;
END $$;

-- Atualizar índices se necessário
CREATE INDEX IF NOT EXISTS idx_photos_is_public ON public.photos(is_public);

-- Verificar estrutura da tabela photos
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'photos'
ORDER BY ordinal_position;

-- ========================================
-- VERIFICAÇÃO DOS BUCKETS DE STORAGE
-- ========================================
-- Execute no Supabase SQL Editor para verificar se os buckets existem

SELECT 
    name,
    public,
    file_size_limit,
    allowed_mime_types
FROM storage.buckets
WHERE name IN ('photos', 'videos', 'profile-photos', 'thumbnails');

-- ========================================
-- RLS POLICIES PARA STORAGE
-- ========================================

-- Policy para photos bucket
DO $$ 
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "Allow authenticated users to upload photos" ON storage.objects;
    DROP POLICY IF EXISTS "Allow public to view photos" ON storage.objects;
    
    -- Create new policies for photos bucket
    CREATE POLICY "Allow authenticated users to upload photos"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'photos');

    CREATE POLICY "Allow public to view photos"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'photos');

    CREATE POLICY "Allow users to update their own photos"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'photos' AND auth.uid()::text = (storage.foldername(name))[1]);

    CREATE POLICY "Allow users to delete their own photos"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'photos' AND auth.uid()::text = (storage.foldername(name))[1]);

    RAISE NOTICE 'Policies para photos criadas com sucesso';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao criar policies: %', SQLERRM;
END $$;

-- Policy para videos bucket
DO $$ 
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "Allow authenticated users to upload videos" ON storage.objects;
    DROP POLICY IF EXISTS "Allow public to view videos" ON storage.objects;
    
    -- Create new policies for videos bucket
    CREATE POLICY "Allow authenticated users to upload videos"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'videos');

    CREATE POLICY "Allow public to view videos"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'videos');

    CREATE POLICY "Allow users to update their own videos"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);

    CREATE POLICY "Allow users to delete their own videos"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'videos' AND auth.uid()::text = (storage.foldername(name))[1]);

    RAISE NOTICE 'Policies para videos criadas com sucesso';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao criar policies: %', SQLERRM;
END $$;

-- ========================================
-- INSTRUÇÕES
-- ========================================
-- 1. Execute este script no SQL Editor do Supabase
-- 2. Verifique se os buckets 'photos' e 'videos' existem no Storage
-- 3. Se não existirem, crie-os manualmente:
--    - Vá em Storage no Supabase Dashboard
--    - Crie bucket 'photos' (público)
--    - Crie bucket 'videos' (público)
-- 4. Após executar, tente fazer upload novamente

SELECT 'Script executado com sucesso! Verifique as mensagens acima.' as status;
