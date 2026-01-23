# 🔧 TROUBLESHOOTING - Soluções para Problemas Comuns

## 🚨 PROBLEMAS DE CONEXÃO

### ❌ "Failed to fetch" ou "Network error"

**Sintomas:** App não conecta com Supabase

**Soluções:**

1. Verifique sua conexão com internet
2. Verifique se a URL no .env está correta
3. Tente acessar a URL diretamente no navegador
4. Desative VPN/Proxy temporariamente
5. Limpe cache do DNS:
   ```powershell
   ipconfig /flushdns
   ```

---

### ❌ "Invalid API key" ou "JWT expired"

**Sintomas:** Erro de autenticação

**Soluções:**

1. Verifique se copiou a chave ANON (não a service_role)
2. Verifique se não tem espaços extras no .env
3. Recarregue o servidor: Ctrl+C e `npm run dev` novamente
4. Regenere a chave no Supabase:
   - Settings → API → Regenerate anon key
5. Faça logout e login novamente no app

---

### ❌ "CORS policy blocked"

**Sintomas:** Requisições bloqueadas pelo navegador

**Soluções:**

1. Adicione a URL no Supabase:
   - Authentication → URL Configuration
   - Redirect URLs: `http://localhost:5173/**`
2. Verifique se está usando HTTPS em produção
3. Adicione o domínio de produção também

---

## 🗄️ PROBLEMAS COM BANCO DE DADOS

### ❌ "relation 'profiles' does not exist"

**Sintomas:** Tabela não encontrada

**Soluções:**

1. Execute o SQL script completo novamente
2. Verifique se o script foi executado com sucesso
3. Verifique em Table Editor se as tabelas existem
4. Execute linha por linha se necessário

---

### ❌ "new row violates row-level security policy"

**Sintomas:** Não consegue inserir/atualizar dados

**Soluções:**

1. Verifique se está logado
2. Verifique as políticas RLS:
   ```sql
   -- Ver políticas de uma tabela
   SELECT * FROM pg_policies WHERE tablename = 'profiles';
   ```
3. Verifique se auth.uid() retorna algo:
   ```sql
   SELECT auth.uid();
   ```
4. Re-execute a seção de RLS do script SQL

---

### ❌ "duplicate key value violates unique constraint"

**Sintomas:** Tentando criar registro duplicado

**Soluções:**

1. Use `upsert` ao invés de `insert`:
   ```javascript
   .upsert({ id: user.id, ...data })
   ```
2. Verifique se o ID já existe
3. Delete o registro antigo se necessário

---

## 📦 PROBLEMAS COM STORAGE

### ❌ "Bucket not found"

**Sintomas:** Erro ao fazer upload

**Soluções:**

1. Verifique se criou o bucket no Supabase
2. Verifique se o nome está correto (case-sensitive)
3. Crie o bucket:
   - Storage → New bucket
   - Nome exato: `profile-photos`, `videos`, `photos`, `thumbnails`
4. Marque como público

---

### ❌ "Failed to upload file"

**Sintomas:** Upload falha

**Soluções:**

1. Verifique o tamanho do arquivo (limite padrão: 50MB)
2. Verifique o tipo MIME do arquivo
3. Verifique as políticas do bucket:
   ```sql
   -- Ver políticas de storage
   SELECT * FROM storage.policies;
   ```
4. Configure políticas manualmente:
   - Storage → Bucket → Policies
   - Adicione política de INSERT para authenticated users

---

### ❌ "Public URL returns 404"

**Sintomas:** Arquivo foi enviado mas não aparece

**Soluções:**

1. Verifique se o bucket é público
2. Use o método correto:

   ```javascript
   const { data } = supabase.storage
     .from('bucket')
     .getPublicUrl('path/file.jpg')

   // Use: data.publicUrl
   ```

3. Aguarde alguns segundos (pode haver delay)
4. Verifique se o arquivo existe no bucket

---

## 🔐 PROBLEMAS COM AUTENTICAÇÃO

### ❌ Email de confirmação não chega

**Sintomas:** Usuário não recebe email

**Soluções (Desenvolvimento):**

1. Desative confirmação temporariamente:
   - Authentication → Providers → Email
   - Desative "Confirm email"
2. Confirme manualmente:
   - Authentication → Users
   - Clique no usuário → "Confirm email"

**Soluções (Produção):**

1. Configure SMTP customizado:
   - Settings → Auth → SMTP Settings
2. Verifique spam/lixeira
3. Use serviço de email confiável (SendGrid, Mailgun)

---

### ❌ "Email not confirmed"

**Sintomas:** Não consegue fazer login

**Soluções:**

1. Confirme o email manualmente no Supabase
2. Ou desative confirmação de email (apenas dev)
3. Reenvie email de confirmação:
   ```javascript
   const { error } = await supabase.auth.resend({
     type: 'signup',
     email: 'user@email.com',
   })
   ```

---

### ❌ "Invalid login credentials"

**Sintomas:** Senha ou email incorretos

**Soluções:**

1. Verifique se o email está correto
2. Verifique se a senha tem requisitos mínimos (6+ caracteres)
3. Use "Esqueci minha senha"
4. Verifique em Authentication → Users se o usuário existe

---

### ❌ "User already registered"

**Sintomas:** Email já cadastrado

**Soluções:**

1. Faça login ao invés de registrar
2. Use "Esqueci minha senha" se necessário
3. Ou delete o usuário no Supabase para testar

---

## 💻 PROBLEMAS COM O APP

### ❌ App não inicia ou tela branca

**Sintomas:** npm run dev não funciona

**Soluções:**

1. Limpe node_modules e reinstale:
   ```powershell
   rm -r node_modules
   npm install
   ```
2. Limpe cache do Vite:
   ```powershell
   rm -r .vite
   npm run dev
   ```
3. Verifique erros no console (F12)
4. Verifique se todas as dependências estão instaladas

---

### ❌ "Module not found"

**Sintomas:** Erro ao importar módulo

**Soluções:**

1. Instale a dependência faltando:
   ```powershell
   npm install [pacote]
   ```
2. Verifique o caminho do import
3. Verifique se usou @ corretamente (alias configurado)
4. Reinicie o servidor

---

### ❌ Componente não renderiza ou dá erro

**Sintomas:** Tela quebrada ou erro no console

**Soluções:**

1. Abra o console do navegador (F12)
2. Leia a mensagem de erro
3. Verifique se todos os props estão corretos
4. Verifique se o componente foi importado
5. Verifique se há erros de sintaxe

---

## 🎥 PROBLEMAS COM VÍDEOS

### ❌ Vídeo não reproduz

**Sintomas:** Player mostra erro ou não carrega

**Soluções:**

1. Verifique o formato do vídeo (MP4 recomendado)
2. Verifique o codec (H.264 recomendado)
3. Verifique se a URL está correta e acessível
4. Verifique tamanho (máximo 100MB por padrão)
5. Converta o vídeo se necessário:
   ```powershell
   ffmpeg -i input.mp4 -c:v libx264 -c:a aac output.mp4
   ```

---

### ❌ Upload de vídeo muito lento

**Sintomas:** Upload trava ou demora muito

**Soluções:**

1. Reduza o tamanho do vídeo
2. Comprima o vídeo antes de enviar
3. Verifique sua conexão de internet
4. Aumente o limite de timeout:
   ```javascript
   const { data, error } = await supabase.storage
     .from('videos')
     .upload(fileName, file, {
       upsert: true,
       contentType: 'video/mp4',
     })
   ```

---

## 📱 PROBLEMAS COM BUILD ANDROID

### ❌ Erro no Gradle Build

**Sintomas:** Build falha no Android

**Soluções:**

1. Verifique se Java 17 está instalado:
   ```powershell
   java -version
   ```
2. Limpe o build:
   ```powershell
   cd android
   .\gradlew clean
   ```
3. Sincronize novamente:
   ```powershell
   npx cap sync android
   ```
4. Verifique o arquivo BUILD_ANDROID.md

---

### ❌ APK não instala no celular

**Sintomas:** Erro ao instalar APK

**Soluções:**

1. Ative "Fontes desconhecidas" no Android
2. Verifique se o APK não está corrompido
3. Build novamente
4. Use modo release ao invés de debug

---

## 🔍 PROBLEMAS COM BUSCA/QUERIES

### ❌ Query retorna vazio

**Sintomas:** Busca não retorna resultados

**Soluções:**

1. Verifique se há dados na tabela
2. Verifique os filtros da query
3. Teste no SQL Editor primeiro:
   ```sql
   SELECT * FROM profiles WHERE profession = 'Eletricista';
   ```
4. Verifique RLS (pode estar bloqueando)
5. Adicione .select('\*') se faltou

---

### ❌ "Could not find relation"

**Sintomas:** Erro ao fazer JOIN

**Soluções:**

1. Verifique se as tabelas existem
2. Verifique a sintaxe do select:
   ```javascript
   .select(`
     *,
     profile:user_id (
       name,
       avatar
     )
   `)
   ```
3. Verifique se há foreign key configurada

---

## ⚡ PROBLEMAS DE PERFORMANCE

### ❌ App muito lento

**Sintomas:** Carregamento demorado

**Soluções:**

1. Adicione índices nas tabelas:
   ```sql
   CREATE INDEX idx_videos_user_id ON videos(user_id);
   ```
2. Limite resultados com .range() ou .limit()
3. Use select apenas dos campos necessários
4. Implemente paginação
5. Use cache quando possível

---

### ❌ Muitas requisições ao Supabase

**Sintomas:** Atingindo limite de requests

**Soluções:**

1. Implemente cache local (localStorage)
2. Use real-time subscriptions ao invés de polling
3. Agrupe requests quando possível
4. Implemente debounce em buscas

---

## 🧪 DEBUGGING

### Como debugar problemas:

1. **Console do Navegador (F12)**

   - Veja erros JavaScript
   - Veja network requests
   - Veja estado dos componentes

2. **Supabase Logs**

   - Vá em Logs no Supabase
   - Veja requisições em tempo real
   - Veja erros do banco

3. **Script de Teste**

   ```powershell
   node test_supabase_setup.mjs
   ```

4. **Testar Query Diretamente**

   - SQL Editor no Supabase
   - Execute queries manualmente
   - Veja resultados

5. **Console.log Estratégico**
   ```javascript
   console.log('User:', user)
   console.log('Data:', data)
   console.log('Error:', error)
   ```

---

## 📞 QUANDO PEDIR AJUDA

Se tentou todas as soluções e ainda não resolveu:

1. **Documente o erro:**

   - Print da tela
   - Mensagem completa do erro
   - Código que está tentando executar
   - O que já tentou

2. **Busque ajuda:**

   - Discord do Supabase
   - Stack Overflow
   - Documentação oficial
   - Issues no GitHub

3. **Informações úteis para compartilhar:**
   - Versão do Node.js
   - Versão do Supabase
   - Sistema operacional
   - Mensagem de erro completa
   - Código relevante

---

## ✅ CHECKLIST DE DIAGNÓSTICO

Quando algo não funcionar, siga esta ordem:

- [ ] Verifiquei o console do navegador (F12)
- [ ] Verifiquei se estou logado
- [ ] Verifiquei se o .env está correto
- [ ] Verifiquei se as tabelas existem
- [ ] Verifiquei se os buckets existem
- [ ] Verifiquei as políticas RLS
- [ ] Testei a query no SQL Editor
- [ ] Limpei cache e reiniciei o servidor
- [ ] Verifiquei a documentação
- [ ] Procurei por erros similares online

---

## 🎯 DICAS GERAIS

1. **Sempre leia a mensagem de erro completa**
2. **Teste uma coisa de cada vez**
3. **Use console.log para debugar**
4. **Consulte a documentação oficial**
5. **Mantenha o Supabase atualizado**
6. **Faça backups antes de mudanças grandes**
7. **Use Git para reverter mudanças**
8. **Teste em modo incógnito às vezes**

---

**Se nada disso resolver, entre em contato! 💪**

---

**JOBY App - Troubleshooting Guide**
_Última atualização: Dezembro 2025_
