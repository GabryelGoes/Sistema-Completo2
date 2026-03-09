<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/67c0ea68-fb2c-42a0-be95-90debf466d17

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy na Vercel (login Gerência e Técnicos)

Para o login e a API funcionarem no deploy, configure no projeto Vercel as **variáveis de ambiente**:

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `SUPABASE_URL` | Sim | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Chave "service role" do Supabase (APIs) |
| `WORKSHOP_ID` | Sim | ID da oficina (UUID em `workshops`) |
| `ADMIN_PASSWORD` | Não | Senha da Gerência (se não definida no Supabase, usa a padrão) |

Em **Vercel → Project → Settings → Environment Variables**, adicione essas variáveis e faça um novo deploy. Sem elas, as chamadas a `/api/auth/admin` e `/api/auth/patio` falham e o login não funciona.
