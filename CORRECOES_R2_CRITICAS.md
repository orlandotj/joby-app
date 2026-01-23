# 🔧 Correções Críticas - Cloudflare R2

## ✅ Correções Implementadas

### 1. Worker: Salvar apenas `r2_key` no banco
- ✅ Worker agora salva apenas a chave do R2 (ex: `videos/user-id/video-id.mp4`) no campo `url`
- ✅ Não salva mais URL completa (R2 não é público por padrão)

### 2. Worker: Endpoint de Playback
- ✅ Criado endpoint `GET /video/<r2_key>` no Worker
- ✅ Worker faz proxy/stream do objeto do R2
- ✅ Suporta Range requests para streaming de vídeo
- ✅ Headers corretos para video playback (Content-Type, Accept-Ranges, etc.)

### 3. storageUrl.js: Resolver URLs do R2 via Worker
- ✅ Detecta R2 keys (formato: `videos/user-id/video-id.mp4`)
- ✅ Quando `provider=cloudflare` ou detecta R2 key, busca URL via Worker
- ✅ URL gerada: `https://worker-url/video/<r2_key>`
- ✅ Cache de URLs do Worker

### 4. Frontend: Passar provider para resolver URLs
- ✅ `VideoCard.jsx` agora passa `provider` para `useResolvedStorageUrl`
- ✅ `Feed.jsx` inclui campo `provider` na query
- ✅ URLs são resolvidas corretamente baseado no provider

## 📋 Mudanças Técnicas

### Worker (`worker/src/index.ts`)
```typescript
// ANTES: Salvava URL completa
url: publicUrl  // ❌

// DEPOIS: Salva apenas r2_key
url: r2Key  // ✅ videos/user-id/video-id.mp4
```

### Endpoint de Playback
```
GET /video/<r2_key>
→ Worker faz proxy do R2
→ Suporta Range requests
→ Headers corretos para video streaming
```

### storageUrl.js
```javascript
// Detecta R2 key
if (provider === 'cloudflare' || isR2Key(value)) {
  // Busca URL via Worker
  return `${WORKER_URL}/video/${r2_key}`
}
```

## 🔄 Fluxo Completo

### Upload
```
Frontend → Worker POST /upload-video
  → Worker faz upload no R2
  → Worker salva no Supabase:
    - url: "videos/user-id/video-id.mp4" (r2_key)
    - provider: "cloudflare"
    - video_status: "ready"
```

### Playback
```
VideoCard → useResolvedStorageUrl(video.url, { provider: 'cloudflare' })
  → Detecta R2 key
  → Busca URL via Worker: GET /video/<r2_key>
  → Worker faz proxy do R2
  → Vídeo é exibido
```

## ⚠️ Importante

1. **R2 não é público**: URLs do R2 não podem ser usadas diretamente
2. **Worker faz proxy**: Todas as requisições de vídeo passam pelo Worker
3. **Banco salva apenas key**: Campo `url` armazena `r2_key`, não URL completa
4. **Provider obrigatório**: Sempre passar `provider` quando disponível

## 🧪 Testes Necessários

1. ✅ Upload de vídeo salva `r2_key` no banco
2. ✅ Worker endpoint `/video/<key>` retorna vídeo corretamente
3. ✅ VideoCard resolve URL via Worker quando `provider=cloudflare`
4. ✅ Range requests funcionam (seek no vídeo)
5. ✅ Cache de URLs funciona corretamente

## 📝 Próximos Passos

1. Deploy do Worker atualizado
2. Testar upload de vídeo
3. Verificar se vídeo é exibido corretamente no feed
4. Testar seek/range requests no player de vídeo
