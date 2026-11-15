# SEC-04.1 — Contratos de autorização (workshop admin settings)

**Projeto:** GabryelGoes/Sistema-Completo2  
**Fase:** SEC-04.1 (somente contratos + selftests; **sem** mudança funcional)  
**Base:** `origin/main` @ tip da branch deste PR  
**Selftest:** `npm run test:sec041-workshop-admin-settings` → `scripts/sec041WorkshopAdminSettings.selftest.ts`  
**Escopo explícito:** não altera handlers, SEC-03 modes, UI, banco, RLS, secrets policy nem permissões concedidas.

---

## 1. Endpoints revalidados (fonte de verdade no tip)

| Método | Path | Arquivo | Linha (aprox.) |
| --- | --- | --- | --- |
| GET | `/api/workshop-settings` | `apiApp.ts` | ~3348 |
| GET | `/api/workshop/system-notifications` | `apiApp.ts` | ~3396 |
| PUT | `/api/workshop/system-notifications` | `apiApp.ts` | ~3462 |
| PUT | `/api/workshop-settings` | `apiApp.ts` | ~3551 |
| POST | `/api/workshop-admin/photo` | `apiApp.ts` | ~13856 |
| POST | `/api/lab-product-kinds/:kindId/photo` | `apiApp.ts` | ~13918 |

**AuthN (todas):** middleware global `/api/*` — sessão inválida → `401` `session_invalid` (`apiApp.ts` ~1609–1658). Rotas **não** estão em `isPublicApiRoute`.

**AuthZ SEC-03:** nenhuma família cobre `/api/workshop-settings`, `/api/workshop/system-notifications`, `/api/workshop-admin` ou `/api/lab-product-kinds`. Família `notifications` (mode `off`) só prefixa `/api/notifications` (inbox).

**Whitelist PUT settings:** `utils/workshopSettingsSecrets.ts` → `WORKSHOP_SETTINGS_WRITE_KEYS` / `pickWorkshopSettingsWrite` (campos desconhecidos ignorados).

---

## 2. Grupos de campos

| Grupo | Campos (payload) | Keys DB |
| --- | --- | --- |
| **G0** Secrets | `adminPassword`, `patioPin`, `vehicleDeletePassword`, `stockGuardPassword` | `admin_password`, `patio_pin`, `vehicle_delete_password`, `stock_guard_password` |
| **G1** Admin controls | `adminDisplayName`, `adminPhotoUrl`, `patioLoginEnabled`, `technicianAccessReception`, `technicianAccessAgenda`, `technicianAccessPatio` | `admin_display_name`, `admin_photo_url`, `patio_login_enabled`, `technician_access_*` |
| **G2** Lab catalog | `labProductKinds`, `labQuickServices` | `lab_product_kinds`, `lab_quick_services` |
| **G3** Settings ops | `labelTemplates`, `aiImproveTextLevel`, `appAppearance` | `label_templates`, `ai_improve_text_level`, `app_appearance` |
| **Notif** | `adminNotificationTypes`, `subscribers`, `commentPopupRecipientIds` (+ `adminPassword` elevação) | `system_notifications_*`, `comment_popup_recipient_ids` |
| **Uploads** | multipart file | atualiza `admin_photo_url` ou merge em `lab_product_kinds` |

---

## 3. Matriz CONTRATO ATUAL × CONTRATO PROPOSTO

Legenda: **G** Gerência (`auth.r=admin`) · **F** `full_access` · **S** `access_settings` · **L** `access_laboratorio` · **V** `access_servicos_oficina` · **N** `access_notificacoes_sistema` · **P0** user sem chaves · **ST** system user + `is_technician` · **∅** sem sessão.

### 3.1 G0 — Segredos

| Operação | Atual | Proposto (04.2+) |
| --- | --- | --- |
| PUT secret efetivo | só **G**; demais **403** | **igual** (preservar) |
| PUT secret vazio/ausente | não regrava; não dispara 403 | igual |
| GET valores | nunca retornados; só flags `*Configured` | igual (flags: opcional restringir depois) |
| Confirmação extra | sessão admin basta | igual nesta fase |

### 3.2 G1 — Campos administrativos

| Operação | Atual | Proposto |
| --- | --- | --- |
| PUT G1 | só **G** (`touchesSensitive`) | **igual** |
| GET G1 | qualquer autenticado | manter leitura ops (CommentPopUp etc.) |
| `POST /api/workshop-admin/photo` | **qualquer autenticado** (gap) | só **G** (alinhar ao PUT) |

### 3.3 G2 — Lab kinds / quick services

| Operação | Atual | Proposto |
| --- | --- | --- |
| PUT G2 | qualquer autenticado | **G \| F \| L \| V** |
| GET G2 | qualquer autenticado | manter (boot/dashboard) |
| `POST …/lab-product-kinds/:id/photo` | qualquer autenticado | mesma política G2 |

### 3.4 G3 — labels / AI / appearance

| Operação | Atual | Proposto |
| --- | --- | --- |
| PUT G3 | qualquer autenticado | **G \| F \| S** |
| GET G3 | qualquer autenticado | manter (sync etiquetas) |
| Auto-upload labels no boot | qualquer auth se remoto vazio | só atores G3 |

### 3.5 Notificações (config global)

| Operação | Atual | Proposto (04.3) |
| --- | --- | --- |
| GET `/api/workshop/system-notifications` | qualquer autenticado; devolve users + routing | **G \| F \| N** |
| PUT | **G \| F \| verifyAdmin(senha)**; **não** consulta `access_notificacoes_sistema` | **G \| F \| N**; senha break-glass = decisão N3 do plano SEC-04 |
| Prefs locais (banners) | device-local | fora do servidor |

### 3.6 Perfis × escrita (resumo)

| Perfil | G0 atual | G1 atual | G2 atual | G3 atual | Notif PUT atual | Admin photo atual | Lab photo atual |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| F | ❌ | ❌ | ✅ | ✅ | ✅ | ✅* | ✅* |
| S | ❌ | ❌ | ✅* | ✅* | ❌† | ✅* | ✅* |
| L / V | ❌ | ❌ | ✅* | ✅* | ❌† | ✅* | ✅* |
| N | ❌ | ❌ | ✅* | ✅* | ❌† (só senha G) | ✅* | ✅* |
| P0 / ST | ❌ | ❌ | ✅* | ✅* | ❌† | ✅* | ✅* |
| ∅ | 401 | 401 | 401 | 401 | 401 | 401 | 401 |

\* = autenticado sem checagem de chave (gap documentado).  
† = sem `full_access`/admin; senha Gerência válida ainda eleva no PUT notif.

**Proposto:** células `*` passam a 403 sem a chave do grupo; N PUT passa a honrar `access_notificacoes_sistema` (e N3).

---

## 4. Comportamentos ATUAIS que o selftest A fixa (regressão)

1. Rotas listadas **não** são públicas → conceito 401 sem sessão (middleware; mock/contrato no selftest).  
2. `rejectCredentialChange` / G0: non-admin + secret efetivo → rejeita.  
3. G1 `touchesSensitive` espelhado no contrato de teste + presença no `apiApp.ts`.  
4. Comentário/código: lab/labels/appearance seguem para usuários autenticados.  
5. PUT system-notifications: admin / full_access / verifyAdmin; ausência de `access_notificacoes_sistema` no handler.  
6. GET system-notifications monta `availableUsers` / `fullAccessUsers`.  
7. Uploads admin/lab **sem** `isAdminRequest` / sem chaves `access_*` no handler.  
8. SEC-03: modes enforce existentes preservados no tip; **sem** família `workshop_admin_settings`.  
9. Whitelist ignora campos desconhecidos; vazios de secret não planejam write.  
10. Upserts usam `workshop_id: WORKSHOP_ID` (isolamento single-tenant por env).

---

## 5. Casos FUTUROS (SEC-04.2 / 04.3) — selftest B, não falham

Marcados `PENDING` no selftest; **não** afirmam proteção já existente:

- G2/G3 deny-by-default por chave.  
- Payload misto atômico por autorização **antes** de qualquer upsert.  
- Photo routes alinhadas a G1/G2.  
- GET/PUT notif exigindo `access_notificacoes_sistema`.  
- Permissão removida após login → 403 no próximo PUT.  
- Falha de lookup de permissões → deny (padrão SEC-03 enforce).  
- Restringir GET flags de secrets / enumeração de users.

---

## 6. Riscos técnicos (documentados; sem correção nesta fase)

| ID | Risco | Nota |
| --- | --- | --- |
| RISK-PARTIAL | PUT settings faz upsert **por chave em loop**; erro no meio pode deixar writes anteriores gravados | Atomicidade de **persistência** ≠ atomicidade de **autorização**; exige análise separada (fora 04.1) |
| RISK-AUTHZ-ORDER | Futuro: rejeição por autorização deve ocorrer **antes** de qualquer escrita | 04.2 |
| RISK-NOTIF-PASSWORD | Não remover elevação por senha Gerência no PUT notif sem decisão explícita (N3) | 04.3 |
| RISK-PHOTO-BYPASS | Uploads contornam G1/G2 do PUT | 04.2 |
| RISK-LABEL-BOOT | `labelTemplatesSync` pode PUT sem chave | 04.2 + 04.4 |
| RISK-LOGS | Selftests/logs **não** imprimem secrets, tokens, CPF nem payloads sensíveis | obrigatório |

---

## 7. O que esta fase **não** faz

- Não modifica `apiApp.ts`, `authorizationPolicy.ts`, `authorizeRequest.ts`.  
- Não cria/ativa família SEC-03.  
- Não inicia SEC-04.2/04.3/04.4.  
- Não altera produção nem explora ambiente real.

---

## 8. Como rodar

```bash
export PATH="/home/ubuntu/.nvm/versions/node/v24.20.0/bin:$PATH"  # se necessário
npm run test:sec041-workshop-admin-settings
npm run test:workshop-settings-secrets
npm run test:sec03-authorization
npm run lint
```

**HTTP live / produção:** não executado. Cenários de middleware 401 reais dependem do servidor; o selftest 04.1 cobre contrato via funções puras + inspeção estática do tip.

---

## 9. Resultado dos testes (esta entrega)

| Comando | Resultado |
| --- | --- |
| `npm run test:sec041-workshop-admin-settings` | **72 ok, 0 falhas, 15 pending** |
| `npm run test:workshop-settings-secrets` | **41 ok, 0 falhas** |
| `npm run test:sec03-authorization` | **27 ok, 0 falhas** |
| `npm run lint` (`tsc --noEmit`) | **verde** |

### Evidência de zero alteração funcional

Diff vs `origin/main` limitado a:

- `docs/security/SEC-04.1-authorization-contracts.md` (novo)
- `scripts/sec041WorkshopAdminSettings.selftest.ts` (novo)
- `package.json` (apenas script `test:sec041-workshop-admin-settings`)

**Não** alterados: `apiApp.ts`, `authorizationPolicy.ts`, `authorizeRequest.ts`, UI, migrations, RLS, flags SEC-03.

### Inventário de arquivos

| Arquivo | Ação |
| --- | --- |
| `scripts/sec041WorkshopAdminSettings.selftest.ts` | criado |
| `docs/security/SEC-04.1-authorization-contracts.md` | criado |
| `package.json` | +1 npm script |

### Não testado nesta fase (explícito)

- HTTP live contra servidor Express (AuthN 401 real de middleware).
- Produção / Supabase real / RLS live.
- Exploração de bypass em ambiente real (**proibida**).
- Persistência parcial sob falha de rede (apenas documentado RISK-PARTIAL).
