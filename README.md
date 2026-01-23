# 🚀 JOBY - Plataforma de Conexão entre Profissionais e Clientes

Aplicativo mobile e web para conectar profissionais autônomos com clientes, permitindo compartilhamento de portfólio, agendamento de serviços, chat e pagamentos.

## 📱 Funcionalidades

### ✅ Implementadas

- 🔐 **Autenticação completa** (cadastro, login, recuperação de senha)
- 👤 **Perfis personalizados** (foto, capa, bio, portfólio)
- 🎥 **Feed de vídeos** (shorts e vídeos longos)
- 📸 **Galeria de fotos** do portfólio
- 💼 **Catálogo de serviços** com preços
- 💬 **Sistema de mensagens** em tempo real
- 📅 **Agendamento de serviços**
- ⭐ **Avaliações e reviews**
- 👥 **Sistema de seguir/seguidores**
- 🔍 **Busca e exploração** de profissionais
- 💰 **Carteira digital**
- ⏱️ **Timer de trabalho**

### 🎨 Design

- Interface moderna e responsiva
- Tema escuro/claro
- Animações suaves com Framer Motion
- Components reutilizáveis com shadcn/ui
- Design mobile-first

## 🛠️ Tecnologias

### Frontend

- **React 18** + **Vite**
- **TailwindCSS** para estilização
- **Framer Motion** para animações
- **React Router** para navegação
- **shadcn/ui** para componentes
- **Lucide React** para ícones

### Backend

- **Supabase**
  - PostgreSQL Database
  - Authentication
  - Storage
  - Real-time subscriptions
  - Row Level Security (RLS)

### Mobile

- **Capacitor** para compilação Android/iOS

## 🚀 Início Rápido

### 1. Pré-requisitos

```bash
Node.js 18+
npm ou yarn
Conta no Supabase (gratuita)
```

### 2. Instalação

```bash
# Clone o repositório
git clone <seu-repo>
cd "app joby 01 - editando"

# Instale as dependências
npm install
```

### 3. Configurar Supabase

#### Opção A: Quick Start (15 minutos)

```bash
# Siga o guia rápido
Ver arquivo: QUICK_START.md
```

#### Opção B: Guia Completo

```bash
# Siga o guia detalhado
Ver arquivo: GUIA_CONFIGURACAO_SUPABASE.md
```

**Resumo:**

1. Crie um projeto no [Supabase](https://supabase.com)
2. Execute o script SQL: `supabase_complete_setup.sql`
3. Configure autenticação e storage
4. Copie URL e KEY para o `.env`

### 4. Configurar Variáveis de Ambiente

```bash
# Crie o arquivo .env na raiz
cp .env.example .env

# Edite o .env com suas credenciais
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_KEY=sua_chave_anon
```

### 5. Testar Configuração

```bash
# Execute o script de teste
node test_supabase_setup.mjs
```

### 6. Iniciar o App

```bash
# Modo desenvolvimento
npm run dev

# Acessar em: http://localhost:5173
```

## 📂 Estrutura do Projeto

```
app joby 01 - editando/
├── src/
│   ├── components/      # Componentes reutilizáveis
│   │   ├── ui/         # Componentes base (shadcn/ui)
│   │   ├── booking/    # Sistema de agendamentos
│   │   ├── messages/   # Sistema de chat
│   │   └── explore/    # Exploração de profissionais
│   ├── contexts/       # Context API (Auth, Theme)
│   ├── hooks/          # Custom hooks
│   ├── layouts/        # Layouts da aplicação
│   ├── lib/           # Utilitários e configurações
│   ├── pages/         # Páginas da aplicação
│   └── assets/        # Imagens e recursos
├── android/           # Configuração Android (Capacitor)
├── public/           # Arquivos públicos
├── supabase_complete_setup.sql  # Script de setup do banco
├── GUIA_CONFIGURACAO_SUPABASE.md  # Guia completo
├── QUICK_START.md    # Guia rápido
└── test_supabase_setup.mjs  # Script de teste
```

## 🗄️ Estrutura do Banco de Dados

### Tabelas Principais

- **profiles** - Perfis dos usuários
- **services** - Serviços oferecidos
- **videos** - Vídeos do portfólio
- **photos** - Fotos do portfólio
- **messages** - Sistema de chat
- **bookings** - Agendamentos
- **reviews** - Avaliações
- **follows** - Seguidores

### Storage Buckets

- **profile-photos** - Fotos de perfil e capa
- **videos** - Vídeos do portfólio
- **photos** - Fotos do portfólio
- **thumbnails** - Miniaturas dos vídeos

## 🔐 Segurança

- ✅ Row Level Security (RLS) ativado
- ✅ Políticas de acesso por usuário
- ✅ Autenticação segura com JWT
- ✅ Validação de dados no backend
- ✅ Sanitização de inputs
- ✅ CORS configurado

## 📱 Build para Android

### Preparar ambiente

```bash
# Instalar Java 17
# Ver: BUILD_ANDROID.md

# Sincronizar com Capacitor
npx cap sync android

# Abrir no Android Studio
npx cap open android
```

### Build APK

```bash
# Via script PowerShell
.\set_java_env_and_build.ps1

# Ou manualmente
cd android
.\gradlew assembleDebug
```

O APK será gerado em:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

## 🧪 Testes

```bash
# Testar configuração do Supabase
node test_supabase_setup.mjs

# Testar cadastro
node scripts/test-signup.mjs
```

## 📝 Scripts Disponíveis

```json
{
  "dev": "vite", // Modo desenvolvimento
  "build": "vite build", // Build produção
  "preview": "vite preview", // Preview do build
  "build:android": "npm run build && npx cap sync android"
}
```

## 🌍 Deploy

### Frontend (Vercel/Netlify)

```bash
# Build
npm run build

# Configure variáveis de ambiente:
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_KEY=sua_chave_anon

# Deploy
vercel deploy --prod
# ou
netlify deploy --prod
```

### Mobile (Play Store/App Store)

1. Build release no Android Studio
2. Assinar APK/AAB
3. Enviar para as lojas

## 🐛 Solução de Problemas

### Erro: "relation profiles does not exist"

**Solução:** Execute o script SQL completo

### Erro: "Failed to upload file"

**Solução:** Crie os buckets de storage no Supabase

### Erro: "CORS blocked"

**Solução:** Adicione URLs em Authentication > URL Configuration

### Email de confirmação não chega

**Solução:** Configure SMTP ou desative confirmação para testes

Ver mais em: `GUIA_CONFIGURACAO_SUPABASE.md`

## 📚 Documentação Adicional

- [QUICK_START.md](QUICK_START.md) - Início rápido (15 min)
- [GUIA_CONFIGURACAO_SUPABASE.md](GUIA_CONFIGURACAO_SUPABASE.md) - Guia completo
- [BUILD_ANDROID.md](BUILD_ANDROID.md) - Build Android
- [SECURITY.md](SECURITY.md) - Práticas de segurança
- [SUPABASE_SETUP.md](SUPABASE_SETUP.md) - Setup básico (legado)

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📄 Licença

Este projeto é privado e proprietário.

## 👥 Equipe

- **Desenvolvimento**: [Seu Nome]
- **Design**: [Designer]
- **Backend**: Supabase

## 📞 Suporte

- Email: suporte@joby.app
- Discord: [Link do servidor]
- Documentação: [Link da doc]

## 🎯 Roadmap

### Em Desenvolvimento

- [ ] Sistema de pagamentos (Stripe/Mercado Pago)
- [ ] Notificações push
- [ ] Chamadas de vídeo
- [ ] Sistema de cupons e promoções

### Futuro

- [ ] App iOS
- [ ] Painel administrativo
- [ ] Analytics e métricas
- [ ] Sistema de recomendações
- [ ] API pública

## 🌟 Features Destacadas

### 🎥 Feed de Vídeos

Profissionais podem postar vídeos curtos (tipo TikTok) mostrando seu trabalho

### 💼 Catálogo de Serviços

Preços por hora, dia, evento ou emergência

### 📅 Agendamento Inteligente

Sistema de calendário com disponibilidade

### 💬 Chat em Tempo Real

Mensagens instantâneas entre clientes e profissionais

### ⭐ Sistema de Avaliações

Reviews e ratings para construir reputação

### 🔍 Busca Avançada

Filtros por profissão, localização, preço e avaliação

## 🎨 Capturas de Tela

[Adicionar screenshots aqui]

## 📈 Status do Projeto

![Status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-proprietary-red)

---

**Desenvolvido com ❤️ para conectar profissionais e clientes**

_Última atualização: Dezembro 2025_
