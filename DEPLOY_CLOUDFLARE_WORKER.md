# 🚀 Deploy do Cloudflare Worker - Upload de Vídeos R2

Este Worker também expõe a API de anexos de solicitações (`/api/service-attachments/*`).

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
| Secret | `SUPABASE_URL` | sua URL do projeto (ex: `https://xxxxx.supabase.co`) |
| Secret | `SUPABASE_SERVICE_ROLE_KEY` | sua `service_role` key do Supabase |
| Secret | `R2_ACCOUNT_ID` | seu Account ID do Cloudflare |
| Secret | `R2_PUBLIC_URL` | (opcional) URL pública customizada do R2 |

**OU via CLI:**

```bash
cd worker
wrangler secret put SUPABASE_URL
# Cole sua URL (ex: https://xxxxx.supabase.co)

wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Cole sua service_role key (NUNCA no frontend)

wrangler secret put R2_ACCOUNT_ID
# Cole seu Account ID do Cloudflare
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

Opcional (recomendado): valide as rotas publicadas do Worker:

1. Acesse `https://joby-r2-videos.<account>.workers.dev/health`
2. Confirme que aparecem as rotas:
	- `POST /api/images/normalize`
	- `POST /api/service-attachments/upload`
	- `POST /api/service-attachments/signed-urls`
	- `POST /api/service-attachments/signed-url`

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

### Erro: `404 Not found` em `/api/service-attachments/signed-url`
- Isso quase sempre indica que o Worker publicado não está com a versão do código que contém essas rotas.
- Rode `cd worker && npm run deploy` e valide novamente em `/health`.

### Erro: `{"error":"Not found"}` em `/api/images/normalize`
- Valide primeiro em `/health` se aparece `POST /api/images/normalize`.
- Se não aparecer, o Worker publicado está desatualizado: rode `cd worker && npm run deploy`.
- Se aparecer e mesmo assim falhar, valide se o frontend está apontando para o Worker certo (env `VITE_WORKER_API_URL` / `VITE_CLOUDFLARE_WORKER_URL`).

### Ainda está lento para carregar thumbnails
- Garanta que o Worker publicado mostra `POST /api/service-attachments/signed-urls` em `/health`.
- Esse endpoint batch reduz drasticamente o número de chamadas para assinar URLs.

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
