# Relatório de otimização de recursos (Vercel / Supabase)

Data de referência: maio/2026.

## Contexto

Objetivo: reduzir **invocações de rotas `/api`** na Vercel e **chamadas ao backend/Supabase** causadas por polling agressivo e por views mantidas montadas em segundo plano (**KeepAlive**), sem alterar o comportamento visual ou fluxos de negócio.

## Principais fontes de consumo identificadas

| Área | Problema |
|------|-----------|
| **Pátio + Laboratório** | Duas instâncias de `PatioView` montadas após visita às duas abas; cada uma fazia refresh da lista (~15s) e lembretes (~12s) mesmo quando o utilizador estava no Início ou noutra área. |
| **Central de notificações** | Dois intervalos (rápido ~8s e completo ~45s) multiplicando chamadas por sessão aberta. |
| **Badge Orçamentos (Home)** | `usePatioBudgetsHubNotifier` com poll ~22s em todas as abas. |
| **Hub de orçamentos** | Intervalo de backup (além do Realtime) corria mesmo com a aba Orçamentos inativa. |
| **Agenda / Recepção** | Modal de detalhe da agenda e histórico da receção com intervalos de ~12s; com KeepAlive, faziam pedidos em segundo plano. |

## Alterações aplicadas

### 1. `PatioView.tsx`

- Nova prop **`isAppTabActive`** (default `true`): quando `false`, **não** inicia intervalos de lista nem de lembretes.
- Intervalos aumentados para **90s** (lista) e **90s** (lembretes), respeitando o mínimo pedido de 60s e reduzindo frequência face a 15s/12s.
- Uso de **`fetchDataRef`** para o efeito periódico não depender de identidade instável de `fetchData`.

### 2. `App.tsx`

- Passa **`isAppTabActive`** conforme o tab atual (`userTab` ou `currentTab`): `patio` / `laboratorio`.
- Passa **`isReceptionTabActive`** e **`isAgendaTabActive`** para pausar polling em segundo plano.

### 3. `NotificationCenter.tsx`

- `POLL_QUICK_MS`: **60s** (antes 8s).
- `POLL_FULL_MS`: **120s** (antes 45s).

### 4. `usePatioBudgetsHubNotifier.ts` + `App.tsx`

- Default e uso de **`pollMs`: 60s** (antes 22s).

### 5. `BudgetsHubView.tsx`

- Intervalo de backup só corre quando **`isHubTabActive`** é verdadeiro (aba Orçamentos visível).

### 6. `usePatioBudgetsHubLiveSync.ts`

- Fallback de poll alinhado a **120s** (antes 90s), consistente com Realtime + menos pressão na API.

### 7. `AgendaView.tsx`

- Prop **`isAgendaTabActive`**; refresh do modal de detalhe em **60s** e só com aba Agenda ativa.

### 8. `ReceptionView.tsx`

- Prop **`isReceptionTabActive`**; polling do histórico em **60s** e só com aba Recepção ativa.

### 9. `useServiceOrderLiveSync.ts`

- Já utilizava fallback **120s**; mantido.

## Estimativa de redução (ordem de grandeza)

Valores **indicativos** por utilizador ativo e por hora, assumindo visita prévia a várias abas (KeepAlive) e documento visível:

| Métrica | Antes (exemplo) | Depois (exemplo) |
|---------|------------------|------------------|
| Poll Pátio (lista), aba inativa mas montada | ~240 GET/h por instância | **0** |
| Poll notificações (rápido + completo) | ~(450 + 80) ≈ **530** GET/h | ~(60 + 30) ≈ **90** GET/h |
| Notifier agregado orçamentos | ~164 GET/h | **60** GET/h |
| Intervalos 12s (agenda/recepção) em segundo plano | até **300** GET/h cada | **0** em aba inativa; **60** GET/h quando ativo + modal/histórico aberto |

Em cenários típicos (utilizador maioritariamente no Início ou numa única aba após ter navegado), a redução das **invocações `/api`** pode situar-se na ordem de **60–85%** para esses endpoints periódicos, dependendo de quantas abas ficam “visitadas” e do tempo em segundo plano.

## O que não foi alterado neste ciclo

- **Migrar em massa** `apiService` → cliente Supabase no browser continua sujeito a **RLS**, políticas e revisão por endpoint; não foi feito refactor global para não arriscar regressões de segurança ou de permissões.
- Rotas `/api` necessárias para **OpenAI**, webhooks, segredos ou lógica sensível mantêm-se no servidor.

## Verificação recomendada

- Testar navegação entre Início, Pátio, Laboratório, Orçamentos, Agenda e Recepção.
- Confirmar que listas atualizam ao voltar à aba (primeiro load ao ativar `isAppTabActive`) e que sons/notificações continuam aceitáveis com intervalos mais longos.
