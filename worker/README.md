# Cloudflare Worker - R2 Vídeos + Anexos de Solicitação

Worker serverless para:
- Upload/stream de vídeos no Cloudflare R2
- API de anexos de solicitações (`service-attachments`) usando Supabase Storage (bucket privado) + signed URLs

## 📋 Pré-requisitos

1. Conta Cloudflare com Workers ativo
2. Wrangler CLI instalado: `npm install -g wrangler`
3. R2 Bucket criado: `videos-joby`
4. Credenciais R2 configuradas

## 🚀 Deploy

### 1. Instalar dependências

```bash
cd worker
npm install
```

### 2. Fazer login no Cloudflare

```bash
wrangler login
```

### 3. Configurar Secrets

Configure as seguintes secrets no Cloudflare Dashboard:

**Via Dashboard:**
1. Acesse: Workers & Pages → `joby-r2-videos` → Settings → Variables
2. Adicione as seguintes secrets:

| Nome | Valor | Descrição |
|------|-------|-----------|
| `SUPABASE_URL` | `https://zkmgjgostowsllmdrrjd.supabase.co` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | Service Role Key do Supabase |
| `R2_ACCOUNT_ID` | `d527e6bb0b0350f8dc39481ebdc27398` | Account ID da Cloudflare |

**Via CLI (alternativa):**

```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_PUBLIC_URL  # opcional
```

### 4. Deploy

```bash
npm run deploy
```

Após o deploy, você receberá uma URL como:
```
https://joby-r2-videos.<account>.workers.dev
```

## 📡 Endpoints

### GET `/health`

Retorna status e lista de rotas disponíveis. Use isso para validar se o Worker publicado está atualizado.

### POST `/api/images/normalize`

Normaliza imagens enviadas pelo app (fallback server-side quando a otimização client-side falha).

- Auth: `Authorization: Bearer <supabase_jwt>`
- Body: `multipart/form-data`
  - `file` (obrigatório)
  - `context` (obrigatório): `post_photo` | `profile_avatar` | `profile_cover` | `service_cover` | `chat_image`
  - `target` (opcional): `webp` | `jpeg`

Observações:
- O limite varia por contexto (ex.: avatar pode ser menor do que outros contextos).
- Use `/health` para confirmar se o Worker publicado já contém essa rota.

### POST `/upload-video`

Upload de vídeo para R2 e salvar metadados no Supabase.

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  - `video`: File (obrigatório)
  - `userId`: string (obrigatório) - UUID do usuário
  - `title`: string (obrigatório) - Título do vídeo
  - `description`: string (opcional) - Descrição
  - `postId`: string (opcional) - UUID do post
  - `videoType`: 'short' | 'long' (opcional, default: 'short')

**Response (200):**
```json
{
  "success": true,
  "videoId": "uuid-do-video",
  "r2Key": "videos/user-id/video-id.mp4",
  "videoPlaybackUrl": "https://worker-url/video/videos/user-id/video-id.mp4",
  "metadata": { ... }
}
```

### GET `/video/<r2_key>`

Proxy/stream de vídeo do R2. Usado pelo frontend para playback.

**Parâmetros:**
- `r2_key`: Chave do objeto no R2 (ex: `videos/user-id/video-id.mp4`)

**Response (200/206):**
- Stream do vídeo com headers corretos para playback
- Suporta Range requests (HTTP 206 Partial Content)
- Headers: `Content-Type`, `Accept-Ranges`, `Content-Length`, `Cache-Control`

**Exemplo:**
```
GET /video/videos/abc123/xyz789.mp4
→ Retorna o vídeo como stream
```

**Response (400/500):**
```json
{
  "error": "Error message",
  "details": "..."
}
```

### POST `/api/service-attachments/upload`

Upload de anexo (imagem/vídeo) para uma solicitação de serviço.

- Auth: `Authorization: Bearer <supabase_jwt>`
- Body: `multipart/form-data`
  - `requestId` (obrigatório)
  - `file` (obrigatório)
  - `caption` (opcional)

Observações:
- O Worker valida se o usuário autenticado é o `client_id` do `service_request`.
- O arquivo vai para o Supabase Storage (bucket `photos`) em um path `service-attachments/...`.

### POST `/api/service-attachments/signed-url`

Gera uma signed URL temporária para baixar/visualizar o anexo.

- Auth: `Authorization: Bearer <supabase_jwt>`
- Body: JSON `{ "mediaId": "..." }`

Observações:
- O Worker valida permissão: `client_id` ou `professional_id` do request.
- Retorna `{ signedUrl }` com expiração curta.

## 🔒 Segurança

- ✅ CORS habilitado
- ✅ Validação de tipo de arquivo
- ✅ Validação de tamanho (max 200MB)
- ✅ Service Role Key do Supabase (não exposta no frontend)

## 📝 Notas

- O Worker usa o binding `VIDEOS_BUCKET` configurado no `wrangler.toml`
- Vídeos são salvos em: `videos/{userId}/{videoId}.mp4`
- Metadados são salvos na tabela `videos` do Supabase
- Campo `url` no banco armazena apenas o `r2_key` (não URL completa)
- Status inicial: `ready` (R2 não precisa processamento)
- **R2 não é público**: Todas as requisições de vídeo passam pelo Worker (proxy)

## ✅ Dica de validação (evitar 404)

Se você receber `404 {"error":"Not found"}` em `/api/service-attachments/...` ou `/api/images/normalize`, normalmente significa que o Worker publicado está desatualizado.

1. Abra `https://<seu-worker>.workers.dev/health`
2. Confirme que aparecem as rotas:
  - `POST /api/images/normalize`
  - `POST /api/service-attachments/upload`
  - `POST /api/service-attachments/signed-url`
3. Se não aparecer, rode o deploy novamente: `cd worker && npm run deploy`
