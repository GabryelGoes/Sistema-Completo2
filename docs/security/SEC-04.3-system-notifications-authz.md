# SEC-04.3 — Autorização das configurações globais de notificações

**Projeto:** GabryelGoes/Sistema-Completo2  
**Fase:** SEC-04.3  
**Selftest:** `npm run test:sec043-system-notifications-authz`  
**Pré-requisitos:** SEC-04.1 (#210), SEC-04.2 (#214)

---

## 1. Resumo

Protege **somente** a administração global:

- `GET /api/workshop/system-notifications`
- `PUT /api/workshop/system-notifications`

| Operação | Antes | Depois |
| --- | --- | --- |
| GET | qualquer autenticado (enumerava users) | **G \| F \| `access_notificacoes_sistema`** |
| PUT privilegio | G \| F | **G \| F \| `access_notificacoes_sistema`** |
| PUT legado senha | autenticado + senha Gerência | **preservado** (sessão obrigatória) |
| Inbox `/api/notifications*` | — | **inalterado** |
| Família SEC-03 `notifications` | off | **inalterado** |
| Workshop-settings G0–G3 | 04.2 | **inalterado** |

---

## 2. Matriz implementada

| Perfil | GET | PUT sem senha | PUT + senha Gerência válida | PUT + senha inválida |
| --- | --- | --- | --- | --- |
| Gerência | ✅ | ✅ | ✅ (senha validada se enviada) | ❌ 403 |
| `full_access` | ✅ | ✅ | ✅ / ❌ se senha errada | ❌ |
| `access_notificacoes_sistema` | ✅ | ✅ | idem | ❌ |
| Sem chave (sessão ok) | ❌ 403 | ❌ 403 | ✅ legado | ❌ 403 |
| Lookup fail / outra oficina | ❌ 403 | ❌ 403* | ✅ legado* | ❌ |
| Sem sessão | ❌ 401 | ❌ 401 | ❌ 401 (não eleva) | ❌ 401 |

\*PUT: elevação por senha exige sessão autenticada válida; não concede `full_access` permanente.

GET negado **não** devolve `availableUsers` / configuração parcial.

---

## 3. Arquivos

| Arquivo | Mudança |
| --- | --- |
| `utils/systemNotificationsAuthz.ts` | **novo** — decisões puras |
| `apiApp.ts` | wire GET/PUT antes de listar/upsert |
| `scripts/sec043SystemNotificationsAuthz.selftest.ts` | **novo** |
| `scripts/sec041WorkshopAdminSettings.selftest.ts` | alinhado a 04.3 |
| `package.json` | script npm |
| `docs/security/SEC-04.3-system-notifications-authz.md` | este doc |

Frontend: sem redesign — modal já gated por `resolveAjustesVisibility.notificacoes_sistema`; erros 403 já tratados.

---

## 4. Risco residual (senha legada)

A senha da Gerência no body do PUT continua como **elevação explícita temporária** para quem não tem a chave.  
Riscos: quem conhece a senha altera routing de alertas; senha no body (não na URL).  
Logs: `kind=sec04_system_notifications` com `passwordProvided` boolean — **nunca** o valor.  
Remoção definitiva = decisão futura (N3), **não** feita nesta fase.

---

## 5. Rollout / rollback

**Antes:** selftests 04.3/04.2/04.1, secrets, sec03, lint; smoke G / F / N / P0.  
**Impacto:** staff autenticado sem chave deixa de **ler** a config (novo 403 no GET).  
**Rollback:** reverter PR; não reabrir GET amplo via flag. Alternativa ops: conceder `access_notificacoes_sistema`.

---

## 6. Não testado

- HTTP live Express + `verifyAdmin` com hash real de produção.  
- Upsert integração Supabase.  
- Exploração em produção (**proibida**).

---

## 7. Resultados desta entrega

| Comando | Resultado |
| --- | --- |
| `test:sec043-system-notifications-authz` | **36 ok, 0 falhas** |
| `test:sec042-workshop-settings-authz` | **53 ok** |
| `test:sec041-workshop-admin-settings` | **84 ok, 3 pending** |
| `test:workshop-settings-secrets` | **41 ok** |
| `test:sec03-authorization` | **27 ok** |
| `npm run lint` | **verde** |
