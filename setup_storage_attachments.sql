-- ========================================
-- CONFIGURAÇÃO DO STORAGE PARA ANEXOS
-- ========================================

-- 1. Criar políticas para o bucket 'photos' - pasta 'message-attachments'

-- Permitir que usuários autenticados façam upload de anexos
DROP POLICY IF EXISTS "Authenticated users can upload message attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload message attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photos' AND 
  (storage.foldername(name))[1] = 'message-attachments' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

DROP POLICY IF EXISTS "Anyone can view message attachments" ON storage.objects;
CREATE POLICY "Anyone can view message attachments"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'photos' AND 
  (storage.foldername(name))[1] = 'message-attachments'
);
-- Para funcionar "pra sempre" (sem expirar link) mantendo bucket PRIVATE,
-- o app gera signed URL sob demanda. Para isso, o usuário LOGADO precisa poder
-- ler metadata do objeto (storage.objects) dessa pasta.
DROP POLICY IF EXISTS "Authenticated users can read message attachments" ON storage.objects;
CREATE POLICY "Authenticated users can read message attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'photos' AND
  (storage.foldername(name))[1] = 'message-attachments'
);

-- OPÇÃO (menos segura): liberar leitura pública por link.
-- Use apenas se você realmente quiser que qualquer pessoa com o link baixe.
-- DROP POLICY IF EXISTS "Anyone can view message attachments" ON storage.objects;
-- CREATE POLICY "Anyone can view message attachments"
-- ON storage.objects FOR SELECT
-- TO public
-- USING (
--   bucket_id = 'photos' AND
--   (storage.foldername(name))[1] = 'message-attachments'
-- );

-- Permitir que usuários deletem seus próprios anexos
DROP POLICY IF EXISTS "Users can delete their own message attachments" ON storage.objects;
CREATE POLICY "Users can delete their own message attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'photos' AND 
  (storage.foldername(name))[1] = 'message-attachments' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- 2. Criar políticas para o bucket 'photos' - pasta 'booking-attachments'

DROP POLICY IF EXISTS "Authenticated users can upload booking attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload booking attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photos' AND
  (storage.foldername(name))[1] = 'booking-attachments' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- Para signed URLs funcionar em bucket PRIVATE, permitir leitura de metadata
DROP POLICY IF EXISTS "Authenticated users can read booking attachments" ON storage.objects;
CREATE POLICY "Authenticated users can read booking attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'photos' AND
  (storage.foldername(name))[1] = 'booking-attachments'
);

DROP POLICY IF EXISTS "Users can delete their own booking attachments" ON storage.objects;
CREATE POLICY "Users can delete their own booking attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'photos' AND
  (storage.foldername(name))[1] = 'booking-attachments' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- 3. Criar políticas para o bucket 'photos' - pasta 'service-attachments'

DROP POLICY IF EXISTS "Authenticated users can upload service attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload service attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photos' AND
  (storage.foldername(name))[1] = 'service-attachments' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- Para signed URLs funcionar em bucket PRIVATE, permitir leitura de metadata
DROP POLICY IF EXISTS "Authenticated users can read service attachments" ON storage.objects;
CREATE POLICY "Authenticated users can read service attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'photos' AND
  (storage.foldername(name))[1] = 'service-attachments'
);

DROP POLICY IF EXISTS "Users can delete their own service attachments" ON storage.objects;
CREATE POLICY "Users can delete their own service attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'photos' AND
  (storage.foldername(name))[1] = 'service-attachments' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- Atualizar políticas existentes para service-images (caso ainda não tenha)
DROP POLICY IF EXISTS "Authenticated users can upload service images" ON storage.objects;
CREATE POLICY "Authenticated users can upload service images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photos' AND 
  (storage.foldername(name))[1] = 'service-images'
);

DROP POLICY IF EXISTS "Anyone can view service images" ON storage.objects;
CREATE POLICY "Anyone can view service images"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'photos' AND 
  (storage.foldername(name))[1] = 'service-images'
);

-- ========================================
-- VERIFICAÇÃO
-- ========================================

-- Ver todas as políticas do storage
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY tablename, policyname;
