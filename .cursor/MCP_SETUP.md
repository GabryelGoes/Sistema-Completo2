# Configuração do MCP Supabase

Para o assistente ter acesso direto ao seu projeto Supabase, conclua estes passos:

## 1. Editar `.cursor/mcp.json`

Substitua os placeholders:

- **`SEU_PROJECT_REF`**  
  O ref do projeto é a parte da URL antes de `.supabase.co`.  
  Ex.: se sua `SUPABASE_URL` é `https://abc123xyz.supabase.co`, use `abc123xyz`.

- **`SEU_ACCESS_TOKEN`**  
  Crie um **Personal Access Token** em:  
  [Supabase Dashboard → Account → Access Tokens](https://supabase.com/dashboard/account/tokens)  
  Crie um token com os escopos necessários (ex.: leitura/escrita do projeto).

## 2. Reiniciar o Cursor

Feche e abra o Cursor para que a configuração do MCP seja carregada.

## 3. Conferir

Em **Settings → Tools & MCP** (ou **Cursor Settings → MCP**), o servidor **supabase** deve aparecer como conectado.

**Importante:** Não commite o `mcp.json` com o token real. Use um arquivo local ou garanta que o token esteja apenas na sua máquina.
