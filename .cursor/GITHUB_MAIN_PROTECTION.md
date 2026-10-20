# Proteção da branch `main` (ativação manual no GitHub)

O token dos agentes Cursor **não tem permissão de administração** neste repositório (`Resource not accessible by integration` / 403 nas APIs de branch protection, rulesets e settings). Ative as proteções abaixo com uma conta **Admin** do repo.

## Caminho na UI

**Settings → Rules → Rulesets** (recomendado)  
ou **Settings → Branches → Branch protection rules**

## Ruleset recomendado (nome sugerido: `Protect main`)

- **Target:** Branch  
- **Enforcement:** Active  
- **Include:** `refs/heads/main`

### Rules

1. **Restrict deletions** — impede apagar `main`.
2. **Block force pushes** (`non_fast_forward`) — impede force push na `main`.
3. **Require a pull request before merging**
   - Required approvals: `0` (ou `1` se quiser review humano).
   - Opcional: dismiss stale reviews.
4. **Require status checks to pass**
   - Require branches to be up to date: **sim**.
   - Checks a exigir (conforme já observados no repo):
     - `Vercel`
     - (opcional) `Vercel Preview Comments` / `Vercel Deployments – Gabryel's projects`

## Settings → General → Pull Requests

- **Allow merge commits:** habilitado (preserva histórico).
- **Allow squash merging:** desabilitado **ou** usar com cuidado — evitar em integrações grandes/históricas.
- **Allow rebase merging:** opcional; se habilitado, não reescreve a `main` via force.
- **Automatically delete head branches:** manter **desligado** se quiser preservar branches antigas `cursor/*` (pedido operacional atual).

## Verificação após ativar

```bash
gh api repos/GabryelGoes/Sistema-Completo2/branches/main/protection
# ou
gh api repos/GabryelGoes/Sistema-Completo2/rulesets
```

Tentar push direto na `main` deve falhar; merge só via PR com checks verdes.