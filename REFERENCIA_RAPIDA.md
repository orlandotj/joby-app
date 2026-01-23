# 🚀 JOBY APP - GUIA DE REFERÊNCIA RÁPIDA

## ⚡ SETUP EM 10 PASSOS

```
┌─────────────────────────────────────────────────────────────┐
│  1. CRIAR PROJETO SUPABASE                                  │
│     → https://supabase.com                                  │
│     → New Project → Nome: joby-app                          │
│     → Aguardar 2-3 minutos                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  2. EXECUTAR SQL                                            │
│     → SQL Editor → New Query                                │
│     → Colar: supabase_complete_setup.sql                    │
│     → Run (Ctrl+Enter)                                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  3. CONFIGURAR EMAIL AUTH                                   │
│     → Authentication → Providers → Email                    │
│     → Enable Email: ✅                                       │
│     → Confirm email: ❌ (para testes)                       │
│     → Save                                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  4. CONFIGURAR URLs                                         │
│     → Authentication → URL Configuration                    │
│     → Redirect URLs: http://localhost:5173/**               │
│     → Save                                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  5. CRIAR STORAGE BUCKETS (todos PUBLIC)                    │
│     → Storage → New Bucket                                  │
│     ✅ profile-photos                                        │
│     ✅ videos                                                │
│     ✅ photos                                                │
│     ✅ thumbnails                                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  6. COPIAR CHAVES                                           │
│     → Settings → API                                        │
│     → Copiar: Project URL                                   │
│     → Copiar: anon/public key                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  7. CRIAR .ENV                                              │
│     VITE_SUPABASE_URL=https://xxx.supabase.co               │
│     VITE_SUPABASE_KEY=eyJhbGc...                            │
│     SUPABASE_KEY=eyJhbGc...                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  8. TESTAR SETUP                                            │
│     → npm install                                           │
│     → node test_supabase_setup.mjs                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  9. INICIAR APP                                             │
│     → npm run dev                                           │
│     → http://localhost:5173                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  10. CRIAR CONTA DE TESTE                                   │
│      → Registrar nova conta                                 │
│      → Testar funcionalidades                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 ESTRUTURA DO BANCO DE DADOS

```
┌─────────────────┐
│    PROFILES     │ → Perfis dos usuários
├─────────────────┤
│ • id            │ (UUID, PK)
│ • name          │
│ • profession    │
│ • bio           │
│ • avatar        │
│ • cover_image   │
│ • rating        │
│ • is_professional│
└─────────────────┘
         │
         ├──────┐
         │      │
┌────────▼──┐  ┌▼─────────┐
│  SERVICES │  │  VIDEOS  │
├───────────┤  ├──────────┤
│ • id      │  │ • id     │
│ • user_id │  │ • user_id│
│ • title   │  │ • title  │
│ • price   │  │ • url    │
│ • unit    │  │ • likes  │
└───────────┘  └──────────┘
         │
         ├──────┐
         │      │
┌────────▼──┐  ┌▼─────────┐
│  BOOKINGS │  │ MESSAGES │
├───────────┤  ├──────────┤
│ • id      │  │ • id     │
│ • prof_id │  │ • sender │
│ • client  │  │ • receiver│
│ • date    │  │ • content│
│ • status  │  │ • is_read│
└───────────┘  └──────────┘
```

---

## 🎯 COMANDOS PRINCIPAIS

```powershell
# DESENVOLVIMENTO
npm install              # Instalar dependências
npm run dev             # Iniciar app (localhost:5173)
node test_supabase_setup.mjs  # Testar setup

# BUILD
npm run build           # Build para produção
npm run preview         # Preview do build

# ANDROID
npx cap sync android    # Sincronizar
npx cap open android    # Abrir Android Studio
.\gradlew assembleDebug # Build APK (dentro de android/)

# LIMPEZA
rm -r node_modules      # Limpar node_modules
npm install             # Reinstalar
rm -r .vite             # Limpar cache do Vite
```

---

## 🔐 POLÍTICAS RLS (Row Level Security)

```sql
-- Regra geral: Usuários só acessam seus próprios dados

PROFILES:     Todos veem | Só dono edita
SERVICES:     Todos veem ativos | Só dono edita/deleta
VIDEOS:       Todos veem públicos | Só dono edita/deleta
PHOTOS:       Todos veem públicas | Só dono edita/deleta
MESSAGES:     Só sender/receiver veem
BOOKINGS:     Só profissional/cliente veem
REVIEWS:      Todos veem | Cliente cria/edita próprias
FOLLOWS:      Todos veem | Usuário segue/para de seguir
```

---

## 📦 STORAGE BUCKETS

```
profile-photos/
├── {user_id}/
│   ├── avatar-{timestamp}.jpg
│   └── cover-{timestamp}.jpg

videos/
├── {user_id}/
│   ├── video-{timestamp}.mp4
│   └── ...

photos/
├── {user_id}/
│   ├── photo-{timestamp}.jpg
│   └── ...

thumbnails/
├── {video_id}/
│   └── thumb.jpg
```

---

## 💻 CÓDIGO ESSENCIAL

### Autenticação

```javascript
// Login
await supabase.auth.signInWithPassword({ email, password })

// Registro
await supabase.auth.signUp({
  email,
  password,
  options: { data: { name, profession } },
})

// Logout
await supabase.auth.signOut()

// Usuário atual
const {
  data: { user },
} = await supabase.auth.getUser()
```

### Queries Básicas

```javascript
// SELECT
const { data } = await supabase
  .from('profiles')
  .select('*')
  .eq('profession', 'Eletricista')

// INSERT
const { data } = await supabase
  .from('services')
  .insert({ user_id, title, price })
  .select()

// UPDATE
const { data } = await supabase
  .from('profiles')
  .update({ bio: 'Nova bio' })
  .eq('id', user.id)

// DELETE
await supabase.from('services').delete().eq('id', serviceId)
```

### Upload

```javascript
// Upload arquivo
const { data } = await supabase.storage
  .from('videos')
  .upload(`${userId}/video.mp4`, file)

// URL pública
const { data } = supabase.storage.from('videos').getPublicUrl('path/file.mp4')
```

### Real-time

```javascript
// Subscrever a mudanças
const subscription = supabase
  .channel('messages')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `receiver_id=eq.${userId}`,
    },
    (payload) => {
      console.log('Nova mensagem:', payload.new)
    }
  )
  .subscribe()

// Limpar
subscription.unsubscribe()
```

---

## 🚨 ERROS COMUNS E SOLUÇÕES

```
❌ "relation profiles does not exist"
✅ Execute o SQL script novamente

❌ "Invalid API key"
✅ Verifique .env e recarregue servidor

❌ "CORS blocked"
✅ Adicione URL em Authentication → URL Configuration

❌ "Bucket not found"
✅ Crie o bucket no Storage

❌ "RLS policy violated"
✅ Verifique se está logado e se RLS está correto

❌ Email não chega
✅ Desative "Confirm email" ou configure SMTP

❌ Upload falha
✅ Verifique tamanho, tipo MIME e políticas
```

---

## 📚 DOCUMENTAÇÃO

```
README.md                    → Visão geral do projeto
QUICK_START.md               → Setup rápido (15 min)
O_QUE_FAZER_NO_SUPABASE.md  → Lista executiva
GUIA_CONFIGURACAO_SUPABASE.md → Guia completo
EXEMPLOS_DE_USO.md          → Exemplos de código
TROUBLESHOOTING.md          → Solução de problemas
INDICE_DOCUMENTACAO.md      → Índice completo
```

---

## 🎯 CHECKLIST PRÉ-PRODUÇÃO

```
BANCO DE DADOS:
☐ Backup criado
☐ RLS revisado
☐ Índices otimizados

AUTENTICAÇÃO:
☐ Confirmação de email ativada
☐ SMTP configurado
☐ URLs de produção adicionadas
☐ Rate limiting configurado

STORAGE:
☐ Políticas revisadas
☐ Limites de tamanho ajustados
☐ CDN configurado (opcional)

CÓDIGO:
☐ Variáveis de ambiente configuradas
☐ Build testado
☐ Erros tratados
☐ Loading states implementados

SEGURANÇA:
☐ .env no .gitignore
☐ Secrets rotacionados
☐ 2FA ativado no Supabase
☐ Logs monitorados
```

---

## 📞 LINKS RÁPIDOS

```
Supabase Dashboard:  https://app.supabase.com
Documentação:        https://supabase.com/docs
Discord:            https://discord.supabase.com
GitHub:             https://github.com/supabase
Stack Overflow:     [supabase] tag
```

---

## 💡 DICAS FINAIS

```
✅ Sempre teste localmente primeiro
✅ Use git para versionar código
✅ Faça commits frequentes
✅ Documente mudanças importantes
✅ Teste em dispositivos reais
✅ Monitore uso do Supabase
✅ Faça backups regulares
✅ Peça ajuda quando necessário
```

---

**🚀 JOBY APP - Conectando Profissionais e Clientes**

_Imprimia esta página para referência rápida!_

---

_Última atualização: Dezembro 2025_
