-- ========================================
-- DEBUG PHOTOS - Verificar dados de fotos
-- ========================================

-- 1. Verificar estrutura da tabela photos
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'photos'
ORDER BY ordinal_position;

-- 2. Contar total de fotos
SELECT 
    COUNT(*) as total_photos,
    COUNT(CASE WHEN is_public = true THEN 1 END) as public_photos,
    COUNT(CASE WHEN is_public = false THEN 1 END) as private_photos
FROM public.photos;

-- 3. Ver todas as fotos com informações do usuário
SELECT 
    ph.id,
    ph.user_id,
    p.name as user_name,
    ph.caption,
    ph.url,
    ph.views,
    ph.likes,
    ph.is_public,
    ph.created_at
FROM public.photos ph
LEFT JOIN public.profiles p ON ph.user_id = p.id
ORDER BY ph.created_at DESC
LIMIT 20;

-- 4. Ver fotos agrupadas por usuário
SELECT 
    p.id as user_id,
    p.name as user_name,
    COUNT(ph.id) as total_photos,
    COUNT(CASE WHEN ph.is_public = true THEN 1 END) as public_photos
FROM public.profiles p
LEFT JOIN public.photos ph ON p.id = ph.user_id
GROUP BY p.id, p.name
HAVING COUNT(ph.id) > 0
ORDER BY total_photos DESC;

-- 5. Verificar se há fotos com URLs inválidas ou campos nulos
SELECT 
    id,
    user_id,
    caption,
    CASE 
        WHEN url IS NULL THEN 'URL é NULL'
        WHEN url = '' THEN 'URL está vazia'
        WHEN url NOT LIKE 'http%' THEN 'URL não começa com http'
        ELSE 'URL parece OK'
    END as url_status,
    CASE 
        WHEN views IS NULL THEN 'views é NULL'
        ELSE 'views OK'
    END as views_status,
    is_public,
    created_at
FROM public.photos
ORDER BY created_at DESC
LIMIT 20;

-- 6. Verificar RLS policies da tabela photos
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'photos';

-- 7. Testar query exata que o app usa (substitua USER_ID pelo ID do usuário)
-- IMPORTANTE: Substitua 'USER_ID_AQUI' pelo ID real do usuário
SELECT id, url, caption, views, likes, created_at
FROM public.photos
WHERE user_id = 'USER_ID_AQUI'
AND is_public = true
ORDER BY created_at DESC
LIMIT 12;

-- 8. Ver últimas fotos criadas (para debug)
SELECT 
    ph.id,
    ph.user_id,
    p.name as user_name,
    ph.caption,
    LEFT(ph.url, 50) || '...' as url_preview,
    ph.views,
    ph.is_public,
    ph.created_at,
    EXTRACT(EPOCH FROM (NOW() - ph.created_at))/60 as minutes_ago
FROM public.photos ph
LEFT JOIN public.profiles p ON ph.user_id = p.id
ORDER BY ph.created_at DESC
LIMIT 10;
