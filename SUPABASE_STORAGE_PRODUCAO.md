# Supabase Storage em Produção (JOBY)

Objetivo: manter o app “público para usuários” (usuários logados), reduzindo hotlink/scraping e o consumo de egress, **sem depender de URLs públicas permanentes**.

O app já foi preparado para isso:

- URLs no banco agora podem ser `storage://bucket/path`
- O client resolve para **Signed URL** via `createSignedUrl()` (com fallback para `getPublicUrl()` enquanto você migra)

> Importante: buckets privados + Signed URL funcionam muito bem quando o conteúdo é “público para usuários logados”.
> Se você precisa que **qualquer visitante sem login** veja fotos/vídeos, me avise — aí a estratégia muda (e a proteção contra egress/hotlink fica limitada).

---

## 1) Buckets usados no app

Pelos uploads atuais:

- `photos`
  - posts de foto: `<uid>/<timestamp>.<ext>`
  - anexos de chat: `message-attachments/<uid>/<timestamp>.<ext>`
  - imagens de serviço: `service-images/<uid>-<timestamp>.<ext>`
- `videos`
  - posts de vídeo: `<uid>/<timestamp>.<ext>`
- `profile-photos`
  - avatar: `avatar/<uid>-<timestamp>.<ext>`
  - capa: `cover/<uid>-<timestamp>.<ext>`

---

## 2) Configurar buckets como PRIVADOS (painel)

No Supabase Dashboard:

1. **Storage → Buckets**
2. Para cada bucket (`photos`, `videos`, `profile-photos`):
   - Abra o bucket
   - Desative **Public bucket** (deixe **OFF**)

Depois disso, URLs do tipo `.../object/public/...` param de funcionar (o que é esperado).

---

## 3) Policies (RLS) para Storage (SQL pronto)

Abra: **SQL Editor → New query** e rode o SQL do arquivo:

- `setup_storage_private_policies.sql`

Esse SQL faz:

- leitura (SELECT) liberada para **usuários autenticados** nos 3 buckets
- upload/update/delete permitido **apenas nos caminhos do próprio usuário** (por prefixo/filename)

---

## 4) O que muda no comportamento do app

- Usuário logado: imagens e vídeos carregam normalmente (via Signed URL)
- Usuário deslogado: não consegue ver mídias privadas

Se você quer feed “aberto” sem login, opções:

- (Mais simples, mas mais caro/arriscado) manter bucket público.
- (Intermediário) Edge Function que assina URL para visitante (ainda pode ser compartilhada; reduz um pouco, mas não elimina egress).

---

## 5) Checklist de validação

1. Desative “public bucket”
2. Rode o SQL de policies
3. Faça login no app
4. Teste:
   - feed de fotos/vídeos
   - abrir modal de conteúdo
   - avatar no chat e lista de conversas
   - editar perfil (avatar/capa)
   - anexar arquivo no chat

Se algum upload falhar, geralmente é policy de INSERT/UPDATE/DELETE não batendo no `name` do arquivo (path). Aí ajustamos a regra do prefixo.
