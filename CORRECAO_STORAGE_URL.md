# 🔧 Correção: ERR_UNKNOWN_URL_SCHEME com storage://

## Problema Identificado

Alguns componentes estavam recebendo `storage://` diretamente como `src`, causando erro:
```
ERR_UNKNOWN_URL_SCHEME: storage://profile-photos/avatars/...
```

## ✅ Correções Aplicadas

### 1. `useResolvedStorageUrl` - Nunca retorna storage://

**Arquivo:** `src/lib/storageUrl.js`

**Mudanças:**
- ✅ Inicializa com string vazia se input for `storage://`
- ✅ Durante resolução, mantém vazio até resolver para URL válida
- ✅ Última verificação: nunca retorna `storage://` diretamente
- ✅ Se receber `storage://` após resolução, retorna string vazia

**Comportamento:**
```javascript
// ANTES (❌):
useResolvedStorageUrl('storage://photos/image.jpg')
// → Retorna 'storage://photos/image.jpg' temporariamente
// → Componente renderiza <img src="storage://..."> → ERRO

// DEPOIS (✅):
useResolvedStorageUrl('storage://photos/image.jpg')
// → Retorna '' temporariamente (enquanto resolve)
// → Depois retorna 'https://...supabase.co/...' (URL válida)
// → Componente renderiza <img src="https://..."> → OK
```

### 2. Componentes já usando `useResolvedStorageUrl`

Todos os componentes que usam `AvatarImage` já estão corretos:
- ✅ `ProfileHeader.jsx` - linha 48
- ✅ `Navigation.jsx` - linha 37
- ✅ `VideoCard.jsx` - linha 51
- ✅ `ContentViewModal.jsx` - linhas 53, 100, 102
- ✅ `ConversationList.jsx` - linha 7
- ✅ `ContactList.jsx` - linha 15
- ✅ `ChatHeader.jsx` - linha 40
- ✅ `TypingIndicator.jsx` - linha 6
- ✅ `ProfessionalCard.jsx` - linha 10
- ✅ `EditableAvatar.jsx` - linha 13

## 🧪 Teste

1. Abrir console do browser
2. Verificar se **NÃO** aparece mais:
   ```
   ERR_UNKNOWN_URL_SCHEME: storage://...
   ```
3. Avatares devem carregar normalmente (mesmo que demore um pouco para resolver)

## 📝 Nota

Se um avatar não aparecer:
- Verificar se URL foi resolvida corretamente (console)
- Verificar se Supabase Storage está acessível
- Verificar se bucket está público ou se signed URL está funcionando
