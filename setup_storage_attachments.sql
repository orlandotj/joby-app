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

-- Permitir que todos vejam anexos (mensagens são privadas, mas se alguém tiver o link pode ver)
DROP POLICY IF EXISTS "Anyone can view message attachments" ON storage.objects;
CREATE POLICY "Anyone can view message attachments"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'photos' AND 
  (storage.foldername(name))[1] = 'message-attachments'
);

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
