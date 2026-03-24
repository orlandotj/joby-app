# ⚙️ Configuração de Variáveis de Ambiente

## 🔴 IMPORTANTE: Variável Obrigatória

### VITE_CLOUDFLARE_WORKER_URL

**Localização:** Arquivo `.env` na **raiz do projeto** (mesmo nível do `package.json`)

**Formato:**
```env
VITE_CLOUDFLARE_WORKER_URL=http://localhost:8787
```

**Para desenvolvimento local:**
```env
VITE_CLOUDFLARE_WORKER_URL=http://localhost:8787
```

**Para produção:**
```env
VITE_CLOUDFLARE_WORKER_URL=https://joby-r2-videos.<account>.workers.dev
```

## 🎥 Upload de Vídeo (Faststart / server na porta 8788)

O upload de vídeo via Faststart roda no servidor local (porta **8788**) e usa um arquivo de ambiente próprio:

- **Arquivo:** `server/.env` (separado do `.env` da raiz)
- **Base:** copie `server/.env.example` → `server/.env`

### CORS no desenvolvimento (403 rápido)

Em desenvolvimento local, o upload pode exigir `CORS_ORIGINS` com os origins do app, por exemplo:

- `http://localhost:5173` (e também 5174/5175 se o Vite mudar)
- `http://127.0.0.1:5173` (e 5174/5175)
- `http://SEU_IP:5173` (para testar no celular na LAN)

Depois de mudar `server/.env`, reinicie o stack com:

```bash
npm run dev:reset
```

## ⚠️ ATENÇÃO: Reiniciar Servidor

**Após criar ou modificar o arquivo `.env`:**

1. **PARE** o servidor de desenvolvimento (`Ctrl+C`)
2. **REINICIE** o servidor:
   ```bash
   npm run dev
   ```

**Por quê?**
- Vite carrega variáveis de ambiente apenas na inicialização
- Mudanças no `.env` não são detectadas em tempo real
- Sempre reinicie após modificar `.env`

## 📝 Passo a Passo

### 1. Criar arquivo `.env`

Na raiz do projeto (mesmo nível do `package.json`):

```bash
# Windows (PowerShell)
New-Item -Path .env -ItemType File

# Linux/Mac
touch .env
```

### 2. Adicionar variável

Abra o arquivo `.env` e adicione:

```env
VITE_CLOUDFLARE_WORKER_URL=http://localhost:8787
```

### 3. Reiniciar servidor

```bash
# Parar servidor atual (Ctrl+C)
# Depois:
npm run dev
```

### 4. Verificar

No console do browser, você **NÃO** deve ver:
```
❌ VARIÁVEL DE AMBIENTE FALTANDO: VITE_CLOUDFLARE_WORKER_URL
```

## 🐛 Troubleshooting

### Erro persiste após configurar `.env`

1. ✅ Verificar se arquivo está na raiz (mesmo nível do `package.json`)
2. ✅ Verificar se nome da variável está correto: `VITE_CLOUDFLARE_WORKER_URL`
3. ✅ **REINICIAR** o servidor (`npm run dev`)
4. ✅ Verificar se não há espaços extras: `VITE_CLOUDFLARE_WORKER_URL=http://localhost:8787`

### Variável não é carregada

- Verificar se começa com `VITE_` (obrigatório para Vite)
- Verificar se não há aspas desnecessárias
- Verificar se URL está correta (com `http://` ou `https://`)

## 📚 Referências

- [Vite - Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
