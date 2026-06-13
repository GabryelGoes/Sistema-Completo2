# RDA — Gestão da Oficina (Rei do ABS)

Sistema de gestão (recepção, pátio, laboratório, orçamentos, peças e TVs) com
frontend em React/Vite e API em Express + Supabase.

## Rodar localmente

**Pré-requisitos:** Node.js

1. Instale as dependências: `npm install`
2. Copie `.env.example` para `.env` e preencha as variáveis (Supabase, `WORKSHOP_ID`, `ADMIN_PASSWORD`, etc.).
3. Rode o app: `npm run dev`

## Segurança / autenticação

- Toda chamada à API (exceto `login`, `health` e o acompanhamento público do cliente)
  exige um **token de sessão** emitido no login e enviado como `Authorization: Bearer`.
  O token é assinado com HMAC usando `SESSION_SECRET` (ou, na ausência, derivado da
  `SUPABASE_SERVICE_ROLE_KEY`).
- A senha da **Gerência** é armazenada com hash (PBKDF2). Em **produção**, defina
  `ADMIN_PASSWORD` (não há mais fallback inseguro padrão).
- **RLS / Realtime:** os painéis de TV (`Patio-View`/`Laboratorio-View`) leem dados
  direto do Supabase com a **anon key** (Realtime). Por isso as policies para o papel
  `anon` em `service_orders`/`budgets`/`customers` são necessárias para a TV funcionar.
  Se for remover/restringir, valide antes que a TV continua atualizando.

## Deploy na Vercel (login Gerência e Técnicos)

Para o login e a API funcionarem no deploy, configure no projeto Vercel as **variáveis de ambiente**:

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `SUPABASE_URL` | Sim | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Chave "service role" do Supabase (APIs) |
| `WORKSHOP_ID` | Sim | ID da oficina (UUID em `workshops`) |
| `ADMIN_PASSWORD` | Sim (produção) | Senha da Gerência. Sem ela (e sem senha salva no banco) o login de Gerência é negado em produção |
| `SESSION_SECRET` | Recomendada | Segredo para assinar os tokens de sessão (HMAC). Se ausente, deriva da `SUPABASE_SERVICE_ROLE_KEY` |
| `PATIO_VIEW_ORIGINS` | Não | CORS: origens extras além de `https://patio-view.vercel.app` (separadas por vírgula) |

Em **Vercel → Project → Settings → Environment Variables**, adicione essas variáveis e faça um novo deploy. Sem elas, as chamadas a `/api/auth/admin` e `/api/auth/patio` falham e o login não funciona.

**Patio-View (TV do pátio)** — projeto separado no Vercel (`patio-view.vercel.app`). Ele chama a API no **domínio do app principal**. Se você mudou o domínio (ex.: para `sistema-rda.com`), atualize no **projeto Patio-View** a variável que define a URL da API (ex.: `VITE_API_URL` ou como estiver no código) para `https://sistema-rda.com`, faça novo deploy do Patio-View e redeploy do app principal se alterou CORS.
