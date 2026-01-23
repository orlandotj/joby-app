# 🧪 Testes Finais - Checklist

## Teste 1: Worker Local (wrangler dev)

### Passos:
1. Abrir terminal na pasta `worker/`
2. Executar: `wrangler dev`
3. Worker deve iniciar em `http://localhost:8787`
4. Abrir no navegador: `http://localhost:8787/video/videos/test-user/test-video.mp4`
   - Se o vídeo existir no R2: deve fazer streaming
   - Se não existir: deve retornar 404 JSON

### Resultado Esperado:
- ✅ Worker responde na rota `/video/<r2_key>`
- ✅ Headers corretos: `Content-Type: video/mp4`
- ✅ Suporta Range requests (HTTP 206)

---

## Teste 2: Frontend + Worker Local

### Configuração:
1. Criar/editar `.env` na raiz do projeto:
   ```env
   VITE_CLOUDFLARE_WORKER_URL=http://localhost:8787
   ```

2. **REINICIAR** o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

### Teste de Upload:
1. Abrir app no navegador
2. Tentar fazer upload de um vídeo
3. Verificar:
   - ✅ Upload funciona (envia para Worker)
   - ✅ Worker salva no R2
   - ✅ Worker salva metadados no Supabase (tabela `videos`)
   - ✅ Campo `url` no banco contém apenas `r2_key` (ex: `videos/user-id/video-id.mp4`)
   - ✅ Campo `provider` = `'cloudflare_r2'`

### Teste de Playback:
1. Após upload, vídeo deve aparecer no feed
2. Verificar:
   - ✅ URL resolvida via Worker: `http://localhost:8787/video/<r2_key>`
   - ✅ Vídeo toca no browser
   - ✅ Seek funciona (Range requests)

### Teste de Placeholder:
1. **Desabilitar Worker** (parar `wrangler dev`)
2. Recarregar página com vídeos
3. Verificar:
   - ✅ **NÃO** renderiza `<video src="">`
   - ✅ Mostra placeholder: "Vídeo não disponível"
   - ✅ Mensagem: "Verifique a configuração do Worker"

---

## ✅ Checklist de Validação

### Worker:
- [ ] `wrangler dev` inicia sem erros
- [ ] Rota `GET /video/<key>` responde
- [ ] Headers corretos (`Content-Type`, `Accept-Ranges`)
- [ ] Range requests funcionam (HTTP 206)

### Frontend - Upload:
- [ ] Variável `VITE_CLOUDFLARE_WORKER_URL` configurada
- [ ] Servidor reiniciado após configurar `.env`
- [ ] Upload funciona
- [ ] Metadados salvos no Supabase (tabela `videos`)
- [ ] Campo `url` contém apenas `r2_key`

### Frontend - Playback:
- [ ] Vídeo aparece no feed
- [ ] URL resolvida corretamente (`http://localhost:8787/video/...`)
- [ ] Vídeo toca no browser
- [ ] Seek funciona

### Frontend - Placeholder:
- [ ] Quando Worker não está disponível
- [ ] **NÃO** renderiza `<video src="">`
- [ ] Mostra placeholder com mensagem

---

## 🐛 Troubleshooting

### Worker não inicia:
- Verificar se `wrangler` está instalado: `npm install -g wrangler`
- Verificar se está na pasta `worker/`
- Verificar `wrangler.toml` está correto

### Upload falha:
- Verificar `VITE_CLOUDFLARE_WORKER_URL` no `.env`
- **REINICIAR** servidor após mudar `.env`
- Verificar console do browser para erros
- Verificar logs do Worker (`wrangler dev` mostra logs)

### Vídeo não toca:
- Verificar URL no console: deve ser `http://localhost:8787/video/...`
- Verificar se Worker está rodando
- Verificar se vídeo existe no R2 bucket
- Verificar console do browser para erros CORS

### Placeholder não aparece:
- Verificar se `videoSrc` está vazio (`''`)
- Verificar console para erros de renderização
- Verificar se componente está renderizando condicionalmente

---

## 📝 Notas

- **IMPORTANTE**: Sempre reiniciar servidor após mudar `.env`
- Worker local: `http://localhost:8787`
- Frontend deve apontar para Worker local durante testes
- Em produção, usar URL do Worker deployado
