-- ========================================
-- VERIFICAR CONFIGURAÇÃO DE SERVIÇOS
-- ========================================

-- 1. Ver todos os serviços criados
SELECT 
    id,
    user_id,
    title,
    price,
    price_unit,
    category,
    is_active,
    views,
    bookings_count,
    created_at
FROM public.services
ORDER BY created_at DESC;

-- 2. Verificar políticas RLS da tabela services
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
WHERE tablename = 'services';

-- 3. Verificar se RLS está habilitado
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE tablename = 'services';

-- 4. Testar query pública (como se fosse usuário não autenticado)
-- Esta query simula o que acontece quando alguém tenta ver serviços
SELECT 
    s.id,
    s.title,
    s.price,
    s.price_unit,
    s.category,
    s.is_active,
    p.name as professional_name
FROM public.services s
JOIN public.profiles p ON s.user_id = p.id
WHERE s.is_active = true
ORDER BY s.created_at DESC;

-- 5. Verificar se o serviço tem is_active = true
SELECT 
    COUNT(*) as total_services,
    COUNT(*) FILTER (WHERE is_active = true) as active_services,
    COUNT(*) FILTER (WHERE is_active = false) as inactive_services
FROM public.services;

-- 6. Ver detalhes completos do último serviço criado
SELECT *
FROM public.services
ORDER BY created_at DESC
LIMIT 1;
