-- Verificar serviços criados
SELECT 
    id,
    user_id,
    title,
    price,
    price_unit,
    category,
    is_active,
    created_at
FROM public.services
ORDER BY created_at DESC
LIMIT 5;

-- Verificar políticas RLS
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename = 'services';
