# JOBY — Regras de estabilidade de boot, concorrência e overlays

## 1) Objetivo
Este documento existe para evitar regressões em fluxos assíncronos do app (boot de telas, concorrência de requests, loading incoerente e commits stale).
A regra central é: a UI deve sempre refletir o “último estado válido” da navegação atual (latest-wins), sem permitir que respostas antigas sobrescrevam telas/estados novos.
Também define a separação correta entre overlay/scroll lock e o comportamento de esconder a bottom nav.

## 2) Regras obrigatórias

### 2.1 Request antiga nunca pode
Uma operação/request stale nunca pode:
- commitar dados (`setState` de payload)
- desligar loading/spinner (`setLoading(false)` / `setRefreshing(false)`)
- limpar erro (`setError('')`)
- trocar estado visual (ex.: liberar skeleton, abrir/fechar seções)

Em termos práticos: qualquer bloco que faz commits visíveis após `await` precisa de guard (latest-wins / `isStale()` / `cancelled`).

### 2.2 Use latest-wins quando houver concorrência
Quando existe risco de múltiplas execuções concorrentes (navegação rápida, refresh em paralelo, retry, focus/resume):
- usar `seq`/contador em `useRef` e um `isStale()` para proteger commits
- em effects, também usar `cancelled` para evitar commits após unmount

### 2.3 Evite `await` entre commits do “estado inicial visível”
- Não espalhar commits visíveis em etapas com `await` no meio (isso cria “estado parcial” e facilita regressões).
- Se uma tela precisa de vários blocos para parecer pronta: aplicar em lote o bloco principal, ou segurar o loading até o bloco principal ficar pronto.

### 2.4 Single-flight: refresh não pode ser perdido
Quando existe single-flight (uma operação “em voo” por vez):
- se chegar um novo refresh enquanto há in-flight, registrar `pending rerun` e executar novamente quando o in-flight terminar
- nunca “dropar” um refresh quando o último estado importa

### 2.5 Overlays: separar semântica (scroll lock vs hide nav)
- `joby-overlay-open` significa apenas: overlay ativo / scroll lock
- `joby-overlay-hide-nav` significa apenas: esconder bottom nav

`navMode`:
- `dim` = não esconde bottom nav (pode travar scroll se `lockScroll=true`)
- `hide` = esconde bottom nav (e pode travar scroll se `lockScroll=true`)

### 2.6 Skeleton/loading inicial
- O skeleton/loading inicial só deve sair quando o bloco principal da tela estiver pronto.
- Blocos secundários podem chegar depois, desde que não quebrem a coerência visual e estejam protegidos contra stale.

## 3) Padrões já aplicados no projeto
- Explore → evitar estado parcial no boot
- Messages → latest-wins na inbox
- WorkRequests → `pending refresh` (single-flight sem perder refresh)
- WorkTimer → guards contra loading/commits stale
- Wallet → latest-wins dentro do refresh (evitar invalidar callers)
- Profile → guard tardio após `Promise.all` para impedir commits stale
- Overlay/Nav → separar `overlay-open` (scroll lock) de `hide-nav` (bottom nav)

## 4) Checklist para novas telas
Antes de mergear uma nova tela/fluxo assíncrono:
- Existe risco de request stale (navegação/refresh/retry concorrente)?
- Uma request antiga pode desligar loading / limpar erro / commitar payload?
- Existe `await` entre commits visíveis do estado inicial?
- Um refresh pode ser perdido durante in-flight?
- O skeleton sai cedo demais (antes do bloco principal estar pronto)?
- Algum overlay está escondendo a bottom nav sem intenção (`navMode` errado / classe global errada)?

## 5) Anti-padrões
Não fazer:
- Usar a mesma classe global para scroll lock e hide nav (mistura semânticas e causa regressões)
- Deixar request antiga desligar loading da tela nova
- Liberar UI parcial “sem querer” (commits em etapas com `await` no meio)
- Descartar refresh durante in-flight quando o estado final importa
