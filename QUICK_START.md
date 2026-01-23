# ⚡ QUICK START - Configuração Rápida do Supabase

## 📝 CHECKLIST (15 minutos)

### 1️⃣ Criar Projeto (2 min)

```
1. Acesse: https://supabase.com
2. Crie conta e novo projeto
3. Anote: URL e ANON KEY
```

### 2️⃣ Executar SQL (1 min)

```
1. Vá em: SQL Editor
2. Cole o conteúdo de: supabase_complete_setup.sql
3. Clique: Run
```

### 3️⃣ Configurar Autenticação (2 min)

```
1. Vá em: Authentication > Providers
2. Ative: Email
3. Desative: Confirm email (APENAS para testes)
4. Em URL Configuration > Redirect URLs, adicione:
   http://localhost:5173/**
```

### 4️⃣ Criar Storage Buckets (5 min)

```
1. Vá em: Storage > New Bucket
2. Crie os seguintes buckets (todos PUBLIC):
   ✅ profile-photos
   ✅ videos
   ✅ photos
   ✅ thumbnails
```

### 5️⃣ Configurar .env (1 min)

```
Crie arquivo .env na raiz:

VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_KEY=SUA_CHAVE_ANON
SUPABASE_KEY=SUA_CHAVE_ANON
```

### 6️⃣ Testar Setup (2 min)

```powershell
# Instalar dependências (se ainda não instalou)
npm install

# Testar configuração
node test_supabase_setup.mjs

# Se tudo OK, iniciar app
npm run dev
```

### 7️⃣ Criar Conta de Teste (2 min)

```
1. Abra: http://localhost:5173
2. Vá em: Register
3. Crie uma conta
4. Faça login
5. Teste as funcionalidades
```

---

## 🎯 ONDE OBTER AS CHAVES

### No Supabase Dashboard:

```
Settings (⚙️) > API

📋 Project URL:
   https://xxxxxxxxxxxx.supabase.co

📋 anon/public key:
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 🚨 RESOLUÇÃO RÁPIDA DE PROBLEMAS

### ❌ "relation profiles does not exist"

```
Solução: Execute o SQL script completo novamente
```

### ❌ "Failed to upload file"

```
Solução: Crie os buckets de storage (passo 4)
```

### ❌ "Invalid API key"

```
Solução: Verifique se copiou a chave correta no .env
```

### ❌ Email de confirmação não chega

```
Solução: Desative "Confirm email" em Authentication > Providers
(Apenas para desenvolvimento)
```

### ❌ "CORS blocked"

```
Solução: Adicione http://localhost:5173/** em:
Authentication > URL Configuration > Redirect URLs
```

---

## 📦 ESTRUTURA DO BANCO

### Tabelas Criadas:

```
✅ profiles         - Perfis de usuários
✅ services         - Serviços oferecidos
✅ videos           - Vídeos publicados
✅ photos           - Fotos publicadas
✅ messages         - Chat/mensagens
✅ bookings         - Agendamentos
✅ reviews          - Avaliações
✅ follows          - Seguidores
✅ video_likes      - Curtidas em vídeos
✅ photo_likes      - Curtidas em fotos
✅ comments         - Comentários
✅ availability     - Disponibilidade
```

### Storage Buckets:

```
✅ profile-photos   - Fotos de perfil e capa
✅ videos           - Vídeos longos e curtos
✅ photos           - Fotos do portfólio
✅ thumbnails       - Miniaturas dos vídeos
```

---

## 🔐 SEGURANÇA

### ✅ Já Configurado:

- [x] RLS ativado em todas as tabelas
- [x] Políticas de acesso por usuário
- [x] Trigger para criar perfil automaticamente
- [x] Relacionamentos com CASCADE delete

### ⚠️ Antes de Produção:

- [ ] Ativar confirmação de email
- [ ] Configurar SMTP customizado
- [ ] Revisar políticas de storage
- [ ] Adicionar rate limiting
- [ ] Configurar backup automático

---

## 📱 FUNCIONALIDADES DISPONÍVEIS

### ✅ Pronto para Usar:

- Cadastro e login de usuários
- Perfis com foto e capa
- Upload de vídeos
- Upload de fotos
- Sistema de mensagens
- Agendamento de serviços
- Avaliações e reviews
- Sistema de seguir/seguidores
- Curtidas e comentários
- Disponibilidade de agenda

---

## 🚀 COMANDOS ÚTEIS

```powershell
# Testar configuração do Supabase
node test_supabase_setup.mjs

# Iniciar app em desenvolvimento
npm run dev

# Build para produção
npm run build

# Preview do build
npm run preview

# Build Android
npm run build:android
```

---

## 📚 DOCUMENTAÇÃO COMPLETA

Para instruções detalhadas, consulte:

- 📖 `GUIA_CONFIGURACAO_SUPABASE.md` - Guia completo passo a passo
- 📄 `supabase_complete_setup.sql` - Script SQL comentado
- 🧪 `test_supabase_setup.mjs` - Script de testes

---

## 🎉 PRONTO!

Após seguir estes passos, você terá:

- ✅ Banco de dados completo
- ✅ Autenticação funcionando
- ✅ Storage configurado
- ✅ App rodando localmente

**Divirta-se desenvolvendo! 🚀**

---

**Desenvolvido para JOBY App**
