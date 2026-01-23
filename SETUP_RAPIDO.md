# 🚀 Setup Rápido - Cloudflare Worker + Frontend

## Passo 1: Criar arquivo `.env`

Na **raiz do projeto** (mesmo nível do `package.json`), crie o arquivo `.env`:

```bash
# Windows (PowerShell)
New-Item -Path .env -ItemType File -Force

# Linux/Mac
touch .env
```

**Conteúdo do `.env`:**
```env
VITE_CLOUDFLARE_WORKER_URL=http://localhost:8787
```

## Passo 2: Reiniciar o Vite

**PARE** o servidor atual (se estiver rodando):
- Pressione `Ctrl+C` no terminal

**RODE novamente:**
```bash
npm run dev
```

## Passo 3: Rodar o Worker em outro terminal

Abra um **novo terminal** e execute:

```bash
cd worker
npx wrangler dev
```

O Worker deve iniciar em `http://localhost:8787`

## ✅ Verificação

1. **Worker rodando:**
   - Terminal mostra: `Listening on http://localhost:8787`
   - Abrir no navegador: `http://localhost:8787/video/test` (deve retornar 404, mas não erro de conexão)

2. **Frontend rodando:**
   - Console do browser **NÃO** deve mostrar:
     ```
     ❌ VARIÁVEL DE AMBIENTE FALTANDO: VITE_CLOUDFLARE_WORKER_URL
     ```

3. **Teste de upload:**
   - Tentar fazer upload de um vídeo
   - Deve funcionar sem erros

## 🐛 Troubleshooting

### Worker não inicia
- Verificar se está na pasta `worker/`
- Verificar se `wrangler` está instalado: `npm install -g wrangler`
- Verificar se `wrangler.toml` existe

### Frontend ainda mostra erro de variável
- Verificar se `.env` está na raiz (mesmo nível do `package.json`)
- Verificar se variável está correta: `VITE_CLOUDFLARE_WORKER_URL`
- **REINICIAR** o servidor (`npm run dev`)

### Upload falha
- Verificar se Worker está rodando (`http://localhost:8787`)
- Verificar console do browser para erros
- Verificar logs do Worker no terminal
