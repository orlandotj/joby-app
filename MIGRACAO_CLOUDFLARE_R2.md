# 🎥 Migração de Vídeos para Cloudflare R2 - Resumo

## ✅ O que foi implementado

### 1. Cloudflare Worker (`worker/`)
- ✅ Worker serverless para upload de vídeos no R2
- ✅ Upload direto do frontend → Worker → R2
- ✅ Salvamento automático de metadados no Supabase
- ✅ Validação de tipo e tamanho de arquivo
- ✅ CORS configurado

### 2. Frontend (`src/`)
- ✅ Serviço `cloudflareService.js` para comunicação com Worker
- ✅ `UploadDialog.jsx` atualizado: vídeos usam R2, fotos continuam no Supabase
- ✅ `storageUrl.js` atualizado para suportar URLs públicas do R2
- ✅ `VideoCard.jsx` já compatível (usa `useResolvedStorageUrl`)

### 3. Banco de Dados
- ✅ SQL de migração: `migrate_videos_to_cloudflare.sql`
- ✅ Campos adicionados na tabela `videos`:
  - `cloudflare_video_uid` (TEXT)
  - `provider` (TEXT: 'supabase' | 'cloudflare')
  - `video_status` (TEXT: 'uploading' | 'processing' | 'ready' | 'error')

### 4. Documentação
- ✅ `DEPLOY_CLOUDFLARE_WORKER.md` - Guia completo de deploy
- ✅ `worker/README.md` - Documentação do Worker

## 📋 Próximos Passos (Você precisa fazer)

### 1. Executar Migração SQL
```sql
-- Execute migrate_videos_to_cloudflare.sql no Supabase SQL Editor
```

### 2. Deploy do Worker
Siga o guia em `DEPLOY_CLOUDFLARE_WORKER.md`:
1. Instalar Wrangler CLI
2. Fazer login no Cloudflare
3. Configurar Secrets no Dashboard
4. Deploy: `cd worker && npm install && npm run deploy`
5. Copiar URL do Worker

### 3. Configurar Frontend
Criar arquivo `.env` na raiz:
```env
VITE_CLOUDFLARE_WORKER_URL=https://joby-r2-videos.<account>.workers.dev
```

### 4. Testar
1. Reiniciar servidor de desenvolvimento
2. Fazer upload de um vídeo
3. Verificar se aparece no R2 bucket
4. Verificar se metadados foram salvos no Supabase

## 🔄 Fluxo de Upload

### Vídeos (Cloudflare R2)
```
Frontend → Worker → R2 Bucket
                ↓
            Supabase (metadados)
```

### Fotos (Supabase Storage)
```
Frontend → Supabase Storage
       ↓
   Supabase (metadados)
```

## 📁 Estrutura de Arquivos

```
worker/
  ├── src/
  │   └── index.ts          # Worker principal
  ├── wrangler.toml          # Configuração do Worker
  ├── package.json
  ├── tsconfig.json
  └── README.md

src/
  ├── services/
  │   └── cloudflareService.js  # Serviço de upload
  ├── components/
  │   ├── UploadDialog.jsx      # Atualizado para usar Worker
  │   └── VideoCard.jsx         # Já compatível
  └── lib/
      └── storageUrl.js         # Suporta URLs do R2

migrate_videos_to_cloudflare.sql  # Migração do banco
DEPLOY_CLOUDFLARE_WORKER.md       # Guia de deploy
```

## 🔐 Secrets Necessárias (Cloudflare Dashboard)

| Secret | Valor |
|--------|-------|
| `SUPABASE_URL` | `https://zkmgjgostowsllmdrrjd.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` (Service Role Key) |
| `R2_ACCOUNT_ID` | `d527e6bb0b0350f8dc39481ebdc27398` |
| `R2_PUBLIC_URL` | (opcional) URL pública customizada |

## ⚠️ Importante

- ✅ **Fotos**: Continuam usando Supabase Storage (não mudou)
- ✅ **Vídeos**: Agora usam Cloudflare R2 (gratuito)
- ✅ **Metadados**: Sempre salvos no Supabase (tabela `videos`)
- ✅ **URLs do R2**: Públicas, não precisam de signed URLs
- ✅ **Worker**: Serverless, escala automaticamente

## 🐛 Troubleshooting

### Vídeo não faz upload
- Verificar se Worker está deployado
- Verificar URL no `.env`
- Verificar logs do Worker: `wrangler tail`

### Metadados não salvam
- Verificar Service Role Key
- Verificar se migração SQL foi executada
- Verificar logs do Worker

### Vídeo não aparece no feed
- Verificar se URL do R2 está salva no campo `url` da tabela `videos`
- Verificar se `storageUrl.js` está retornando URLs do R2 corretamente

## 📚 Referências

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
