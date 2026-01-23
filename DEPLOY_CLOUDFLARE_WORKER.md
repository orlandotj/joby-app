# 🚀 Deploy do Cloudflare Worker - Upload de Vídeos R2

## 📋 Checklist Pré-Deploy

- [ ] Wrangler CLI instalado
- [ ] Login no Cloudflare feito
- [ ] R2 Bucket `videos-joby` criado
- [ ] Tabela `videos` no Supabase com campos Cloudflare (executar `migrate_videos_to_cloudflare.sql`)

## 🔧 Passo a Passo

### 1. Instalar Wrangler CLI

```bash
npm install -g wrangler
```

### 2. Fazer Login no Cloudflare

```bash
wrangler login
```

Isso abrirá o navegador para autenticação.

### 3. Navegar para a pasta do Worker

```bash
cd worker
```

### 4. Instalar Dependências

```bash
npm install
```

### 5. Configurar Secrets no Cloudflare Dashboard

**IMPORTANTE:** Configure as secrets ANTES do deploy.

1. Acesse: [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Vá em: **Workers & Pages** → **Create application** → **Create Worker**
3. Nome: `joby-r2-videos`
4. Depois de criar, vá em: **Settings** → **Variables and Secrets**
5. Adicione as seguintes **Secrets** (não Variables):

| Tipo | Nome | Valor |
|------|------|-------|
| Secret | `SUPABASE_URL` | `https://zkmgjgostowsllmdrrjd.supabase.co` |
| Secret | `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprbWdqZ29zdG93c2xsbWRycmpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc1OTc1OCwiZXhwIjoyMDgxMzM1NzU4fQ.uf3BuL95LjFsymn6Q6Ha5ddMkzK6xrVKbVb8pLa73Vo` |
| Secret | `R2_ACCOUNT_ID` | `d527e6bb0b0350f8dc39481ebdc27398` |
| Secret | `R2_PUBLIC_URL` | (opcional) URL pública customizada do R2 |

**OU via CLI:**

```bash
cd worker
wrangler secret put SUPABASE_URL
# Cole: https://zkmgjgostowsllmdrrjd.supabase.co

wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Cole: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprbWdqZ29zdG93c2xsbWRycmpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTc1OTc1OCwiZXhwIjoyMDgxMzM1NzU4fQ.uf3BuL95LjFsymn6Q6Ha5ddMkzK6xrVKbVb8pLa73Vo

wrangler secret put R2_ACCOUNT_ID
# Cole: d527e6bb0b0350f8dc39481ebdc27398
```

### 6. Verificar R2 Bucket Binding

O `wrangler.toml` já está configurado com o binding do bucket `videos-joby`.

Se o bucket ainda não existir, crie via Dashboard:
1. **R2** → **Create bucket**
2. Nome: `videos-joby`
3. Location: escolha a mais próxima

### 7. Deploy do Worker

```bash
npm run deploy
```

Ou:

```bash
wrangler deploy
```

### 8. Obter URL do Worker

Após o deploy, você receberá uma URL como:
```
https://joby-r2-videos.<account>.workers.dev
```

**Copie essa URL!** Você precisará dela no próximo passo.

### 9. Configurar Variável de Ambiente no Frontend

Crie ou edite o arquivo `.env` na raiz do projeto:

```env
VITE_CLOUDFLARE_WORKER_URL=https://joby-r2-videos.<account>.workers.dev
```

**Substitua** `<account>` pela sua conta Cloudflare.

### 10. Executar Migração no Supabase

Execute o SQL em `migrate_videos_to_cloudflare.sql` no Supabase SQL Editor para adicionar os campos necessários na tabela `videos`.

### 11. Testar

1. Reinicie o servidor de desenvolvimento do frontend
2. Tente fazer upload de um vídeo
3. Verifique se o vídeo aparece no R2 bucket
4. Verifique se os metadados foram salvos no Supabase

## 🔍 Troubleshooting

### Erro: "Bucket not found"
- Verifique se o bucket `videos-joby` existe no R2
- Verifique se o binding está correto no `wrangler.toml`

### Erro: "Unauthorized" ao salvar no Supabase
- Verifique se a `SUPABASE_SERVICE_ROLE_KEY` está correta
- Verifique se a URL do Supabase está correta

### Erro: CORS no frontend
- O Worker já tem CORS configurado
- Verifique se a URL do Worker está correta no `.env`

### Vídeo não aparece no feed
- Verifique se a migração SQL foi executada
- Verifique se o campo `url` na tabela `videos` contém a URL do R2
- Verifique se o `storageUrl.js` está retornando URLs do R2 corretamente

## 📝 Notas Importantes

- ✅ Fotos continuam usando Supabase Storage (não mudou)
- ✅ Apenas vídeos usam Cloudflare R2
- ✅ O Worker faz upload + salva metadados automaticamente
- ✅ URLs do R2 são públicas (não precisam de signed URLs)

## 🔐 Segurança

- Secrets nunca devem ser commitadas no Git
- Use sempre Secrets no Cloudflare Dashboard
- Service Role Key do Supabase só deve estar no Worker (nunca no frontend)
