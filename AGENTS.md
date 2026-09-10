# AGENTS.md

## Cursor Cloud specific instructions

### O que é este projeto
App de gestão de oficina ("Rei do ABS"): frontend React + Vite e API Express, servidos **juntos** pelo mesmo processo (`tsx server.ts`). É um único serviço em desenvolvimento.

### Rodar (dev)
- Instalar deps: `npm install` (já feito pelo update script no boot).
- Subir tudo (frontend + API): `npm run dev` → escuta em `http://localhost:3000` (Vite em middleware do Express; sem porta separada para a API).
- Lint: `npm run lint` (é `tsc --noEmit`). Atenção: hoje ele **reporta erros de tipos pré-existentes** no código do repo — não é um gate limpo e esses erros não são causados pela configuração do ambiente.
- Build de produção: `npm run build` (Vite). Não é usado em dev.

### Node
`package.json` exige `node 24.x`. O `node` padrão do PATH da VM (`/exec-daemon/node`) é a v22 e tem precedência. Para casar com o engine, use o Node 24 do nvm antes de rodar dev/lint, ex.: `export PATH="/home/ubuntu/.nvm/versions/node/v24.20.0/bin:$PATH"` (a v24 já está instalada via nvm). O app roda com essa v24.

### Backend / dados (importante)
- O app conecta a um projeto **Supabase hospedado**. **Não existe stack local do Supabase viável**: as migrations em `supabase/migrations/` são apenas `ALTER`/adições incrementais e **não criam** as tabelas base (`workshops`, `service_orders`, `customers`, ...), então `supabase start` / `supabase db reset` a partir das migrations **falha** (FKs para tabelas inexistentes). Para dados reais é preciso um projeto Supabase já provisionado.
- Para habilitar dados, preencha no `.env` (gitignored): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKSHOP_ID` e `ADMIN_PASSWORD`. Veja `.env.example` e `README.md` para a lista completa.

### Fallback de desenvolvimento (sem Supabase)
Mesmo sem Supabase configurado, o servidor **sobe** (apenas emite avisos) e é possível autenticar como Gerência: usuário `Gerência`, senha = `ADMIN_PASSWORD` (padrão `admin` em dev). Isso renderiza o hub de módulos, mas os módulos que leem dados dependem do Supabase.
