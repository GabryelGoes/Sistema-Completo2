# SEC-04.4 — Alinhamento frontend/backend

**Projeto:** GabryelGoes/Sistema-Completo2  
**Fase:** SEC-04.4  
**Base `origin/main`:** `1a593cf` (SEC-04.3 #215)  
**Selftest:** `npm run test:sec044-frontend-alignment`  
**Pré-requisitos:** SEC-04.1 (#210), SEC-04.2 (#214), SEC-04.3 (#215)

---

## 1. Resumo executivo

Corrige inconsistências de **interface** entre o hub de Ajustes e as regras de autorização já implementadas no servidor (SEC-04.2 / SEC-04.3):

- Modais de Laboratório (tipos/rápidos), Editor de etiquetas, Notificações globais e Senhas operacionais passam a **montar por `ajustesVisibility`**, fora do gate genérico `!isTechnician` (elimina clique morto).
- Ao **perder a permissão**, o modal correspondente é fechado e desmontado.
- Senhas operacionais (G0/G1): formulários editáveis **somente Gerência**; `full_access` / `access_change_passwords` veem estado read-only. Troca da própria senha (perfil) permanece intacta.
- Erros HTTP tipados (`ApiHttpError`): 401 sessão, 403 sem permissão (sem logout), rede, 5xx.
- Sync de etiquetas: diferencia 403 vs rede; preserva cache local; não loopa upload automático após 403; não declara sync remoto quando só salvou local.

**Não** alterou: auth/sessões, guards de servidor, permissões concedidas, DB/RLS, SEC-03, inbox `/api/notifications`, RDA, design visual.

---

## 2. Matriz interface × permissão × endpoint

| Item UI (hub) | Visibilidade | Mount FE | Endpoint(s) | Quem grava no servidor |
| --- | --- | --- | --- | --- |
| Tipos de peças (Lab) | G \| F \| `access_laboratorio` \| `access_servicos_oficina` | `lab_tipos` | `PUT /workshop-settings` (G2) | G \| F \| lab \| serviços |
| Serviços rápidos (Lab) | idem | `lab_rapidos` | `PUT /workshop-settings` (G2) | idem |
| Editor de etiquetas | G \| F \| `access_settings` | `etiquetas` | GET/PUT `workshop-settings` (G3) | G \| F \| settings |
| Notificações globais | G \| F \| `access_notificacoes_sistema` | `notificacoes_sistema` | GET/PUT `/workshop/system-notifications` | G \| F \| notif (+ legado senha) |
| Senhas operacionais | G \| F \| `access_change_passwords` | `senhas` | `PUT /workshop-settings` (G0/G1) | **somente Gerência** (`auth.r===admin`) |
| Serviços oficina / checklists / prefs orç. | chaves próprias | visibility | settings G2 / locais | conforme SEC-04.2 |
| RDA / Usuários / Peças | full / admin | **ainda** sob `!isTechnician` | — | fora do escopo 04.4 |

G = Gerência · F = `full_access`.  
Frontend **não** trata F como Gerência para secrets.

---

## 3. Inconsistências corrigidas

1. Técnico com `access_laboratorio` / `access_servicos_oficina` via tile, mas modal não montava (`!isTechnician`) → clique morto.
2. Técnico com `access_settings` / `access_notificacoes_sistema` idem para etiquetas (notif já estava fora; mantido).
3. Modal de senhas editável para quem só podia abrir o tile, sem poder gravar G0/G1.
4. Erros de `workshop-settings` / system-notifications sem `status` tipado (difícil distinguir 403 vs rede).
5. Sync de etiquetas: catch genérico; upload automático podia “parecer” ok; fechamento engolia erro de persist.
6. Mensagem de subtítulo do editor afirmava sync multi-dispositivo após só cache local.

---

## 4. Arquivos alterados

| Arquivo | Mudança |
| --- | --- |
| `components/views/HomeView.tsx` | mounts por visibility; close on revoke; guards em `openAjustesItem` |
| `components/ChangePasswordsModal.tsx` | `allowSecretWrites`; read-only; `formatApiFailureMessage` |
| `App.tsx` | `ChangePasswordsModal` limited → `allowSecretWrites={false}` |
| `components/LabelTemplatesEditorModal.tsx` | status de sync; erros 403/rede; `remoteSaved` |
| `utils/labelTemplatesSync.ts` | status tipado; `autoUploadDenied`; persist result |
| `utils/apiHttpError.ts` | **novo** — `ApiHttpError` + formatters |
| `services/apiService.ts` | `throwIfNotOk` em settings + system-notifications |
| `components/SystemNotificationsModal.tsx` | mensagens HTTP padronizadas |
| `components/LabProductTypesModal.tsx` / `LabQuickServicesModal.tsx` | mensagens HTTP |
| `utils/sec044FrontendAlignment.ts` | **novo** — helpers de matriz |
| `scripts/sec044FrontendAlignment.selftest.ts` | **novo** |
| `package.json` | script npm |
| `docs/security/SEC-04.4-frontend-alignment.md` | este doc |

---

## 5. Testes executados

- `npm run test:sec044-frontend-alignment`
- `npm run test:sec041-workshop-admin-settings`
- `npm run test:sec042-workshop-settings-authz`
- `npm run test:sec043-system-notifications-authz`
- `npm run lint` (`tsc --noEmit`)

Contas/dados fictícios nos selftests. Sem alteração de produção.

---

## 6. Evidência de ausência de ampliação de permissões

- Nenhum guard de `apiApp.ts` / `workshopSettingsAuthz` / `systemNotificationsAuthz` alterado.
- `canWriteOperationalSecrets` exige Gerência; selftest cobre F ≠ G.
- Mounts seguem `resolveAjustesVisibility` (já alinhado a SEC-04.1/04.2/04.3).
- `shouldClearSession(403)` permanece falso para 403 genérico.

---

## 7. Desktop / tablet / mobile

Sem redesign: mesmos shells iOS/Ajustes PC. Mudanças são condicionais de mount e textos de estado/erro. Layouts Pátio/Lab/Estoque e identidade amarelo/preto/branco **não** foram tocados.

---

## 8. Limitações / não testados

- Smoke HTTP live com tokens reais de produção.
- Impressão física Niimbot / Bluetooth.
- Fluxo completo de troca de senha própria em UI (preservado; não retestado E2E nesta fase).
- Regressão visual pixel-a-pixel mobile/tablet (apenas inspeção de código + lint).

---

## 9. Rollback

Reverter o PR / branch `cursor/sec-04-4-frontend-alignment-e087`.  
Não há migration. Backend SEC-04.2/04.3 permanece válido independentemente deste FE.

---

## 10. Fora de escopo (não iniciado)

SEC-05, SEC-06, inbox notifications family, alteração de permissões concedidas, merge automático.
