# SEC-04.2 — Proteção das configurações administrativas (não-secretas)

**Projeto:** GabryelGoes/Sistema-Completo2  
**Fase:** SEC-04.2  
**Base:** `origin/main` (pós SEC-04.1)  
**Selftests:** `npm run test:sec042-workshop-settings-authz` · `npm run test:sec041-workshop-admin-settings`

---

## 1. Resumo das proteções

| Superfície | Antes | Depois |
| --- | --- | --- |
| PUT `/api/workshop-settings` G0/G1 | Gerência-only | **inalterado** (Gerência-only) |
| PUT G2 (`labProductKinds`, `labQuickServices`) | qualquer autenticado | **G \| F \| L \| V** |
| PUT G3 (`labelTemplates`, AI, appearance) | qualquer autenticado | **G \| F \| S** |
| Payload misto | podia gravar G2+G3 juntos sem chave | **403 atômico** se qualquer grupo falhar (antes de upsert) |
| POST `/api/workshop-admin/photo` | qualquer autenticado | **só Gerência** (antes do multer/Storage) |
| POST `/api/lab-product-kinds/:id/photo` | qualquer autenticado | **política G2** (antes do multer/Storage) |
| `labelTemplatesSync` auto-upload | tentava PUT sem chave | engole 403, mantém local, sem loop |
| GET settings / leitura etiquetas | qualquer autenticado | **inalterado** |
| system-notifications | — | **não alterado** (04.3) |
| Famílias SEC-03 modes | — | **não alterados** |

Implementação: guards explícitos no handler (`utils/workshopSettingsAuthz.ts` + `loadWorkshopSettingsActor` em `apiApp.ts`). Sem nova família SEC-03.

---

## 2. Matriz de autorização final

| Perfil | G0 | G1 | G2 | G3 | Admin photo | Lab photo |
| --- | --- | --- | --- | --- | --- | --- |
| Gerência (`auth.r=admin`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `full_access` | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| `access_settings` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `access_laboratorio` | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| `access_servicos_oficina` | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| sem chaves / lookup fail / outra oficina | ❌* | ❌* | ❌ | ❌ | ❌ | ❌ |
| sem sessão | 401 | 401 | 401 | 401 | 401 | 401 |

\*G0/G1 já negavam non-admin; lookup fail também nega G2/G3.

---

## 3. Arquivos modificados

| Arquivo | Mudança |
| --- | --- |
| `utils/workshopSettingsAuthz.ts` | **novo** — funções puras G0–G3 + uploads |
| `apiApp.ts` | wire PUT settings + auth antes de multer nos POSTs de foto |
| `utils/labelTemplatesSync.ts` | compat: auto-upload engole 403 |
| `scripts/sec042WorkshopSettingsAuthz.selftest.ts` | **novo** |
| `scripts/sec041WorkshopAdminSettings.selftest.ts` | atualizado ao contrato 04.2 |
| `package.json` | script `test:sec042-workshop-settings-authz` |
| `docs/security/SEC-04.2-workshop-settings-authz.md` | este documento |

**Não** modificados: `authorizationPolicy.ts`, `authorizeRequest.ts`, system-notifications, secrets hashing, UI hub, DB/RLS.

---

## 4. Evidência: negação sem gravação

1. `authorizeWorkshopSettingsWrite` / uploads rodam **antes** de montar `updates` ou chamar Storage.  
2. Selftest cobre mistos → `ok === false` (nenhum upsert no caminho deny).  
3. Admin/lab photo: middleware **antes** de `upload.single("file")`.  
4. Risco residual **RISK-PARTIAL**: se a authz passar e o loop de upsert falhar no meio, chaves anteriores do **mesmo** request autorizado ainda podem ter sido gravadas — **não** é bypass de authz; atomicidade de persistência permanece fora do escopo (documentado).

---

## 5. Compatibilidade das etiquetas

- GET `/api/workshop-settings` continua para qualquer sessão → leitura/uso de templates OK.  
- `syncLabelTemplatesFromServer`: se remoto tem templates → baixa; se vazio e local tem dados → tenta PUT; 403 → mantém local e marca `lastSyncedAt` (sem retry agressivo).  
- `persistLabelTemplatesToServer` (editor) ainda propaga erro se G3 negar — esperado.  
- Sem mudança Niimbot/DPI/QR/margens.

---

## 6. Perfis que podem passar a receber 403

- User autenticado **sem** `access_settings` / lab / serviços / full ao PUT G2/G3 (antes passava).  
- Qualquer non-Gerência em `POST /api/workshop-admin/photo`.  
- User sem política G2 em foto de tipo de peça.  
- Boot sync de etiquetas: silencioso (sem toast loop).

Fluxos afetados: LabProductTypes/QuickServices, Budget AI level, Label editor save, auto-migrate labels, AdminProfile photo upload (já era Gerência na UI).

---

## 7. Rollout / rollback

**Antes de produção:** rodar selftests 04.1/04.2, secrets, sec03-authorization, lint; smoke Gerência + user com `access_settings` + user lab.

**Logs:** `kind=sec04_workshop_settings` com `ok`, `role`, `groups`, `reason`, `denied` — sem body/secrets.

**Rollback:** reverter o PR. **Não** reintroduzir “qualquer autenticado escreve” via flag ampla. Se precisar liberar operação legítima: conceder a chave `access_*` correta.

---

## 8. Não testado

- HTTP live Express com multer + Storage real.  
- Produção / RLS.  
- Persistência parcial sob falha de upsert intermediário.  
- SEC-04.3 (notificações).

---

## 9. Como rodar

```bash
npm run test:sec042-workshop-settings-authz
npm run test:sec041-workshop-admin-settings
npm run test:workshop-settings-secrets
npm run test:sec03-authorization
npm run lint
```

## 10. Resultados desta entrega

| Comando | Resultado |
| --- | --- |
| `test:sec042-workshop-settings-authz` | **53 ok, 0 falhas** |
| `test:sec041-workshop-admin-settings` | **84 ok, 0 falhas, 5 pending** (04.3/04.4/persistência) |
| `test:workshop-settings-secrets` | **41 ok** |
| `test:sec03-authorization` | **27 ok** |
| `npm run lint` | **verde** |

**HTTP live / Storage real / produção:** não executados (mocks + inspeção estática + selftests).
