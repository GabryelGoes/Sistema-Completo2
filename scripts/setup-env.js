/**
 * Preenche o .env com os 3 valores obrigatórios do Supabase.
 * Uso (cole os valores do outro PC ou do painel Supabase):
 *
 *   node scripts/setup-env.js "https://SEU_PROJETO.supabase.co" "eyJhbGc..." "uuid-da-oficina"
 *
 * Ou execute sem argumentos e digite quando pedir.
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ENV_PATH = path.join(__dirname, "..", ".env");

function getArg(n) {
  const a = process.argv[n + 1];
  return a && a.trim();
}

function question(rl, msg) {
  return new Promise((resolve) => rl.question(msg, (answer) => resolve((answer || "").trim())));
}

async function main() {
  const url = getArg(0);
  const key = getArg(1);
  const workshopId = getArg(2);

  let supabaseUrl = url;
  let serviceRoleKey = key;
  let workshopIdVal = workshopId;

  if (!supabaseUrl || !serviceRoleKey || !workshopIdVal) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log("Preencha os 3 valores (ou copie do .env do outro PC):\n");
    if (!supabaseUrl) supabaseUrl = await question(rl, "SUPABASE_URL (ex: https://xxx.supabase.co): ");
    if (!serviceRoleKey) serviceRoleKey = await question(rl, "SUPABASE_SERVICE_ROLE_KEY: ");
    if (!workshopIdVal) workshopIdVal = await question(rl, "WORKSHOP_ID (UUID da oficina): ");
    rl.close();
  }

  if (!supabaseUrl || !serviceRoleKey || !workshopIdVal) {
    console.error("Faltam valores. Uso: node scripts/setup-env.js \"URL\" \"SERVICE_ROLE_KEY\" \"WORKSHOP_ID\"");
    process.exit(1);
  }

  const envContent = `# Gerado/atualizado por scripts/setup-env.js. Nunca commite .env.

# --- Trello / Atlassian ---
VITE_TRELLO_API_KEY=sua_api_key_aqui
VITE_TRELLO_TOKEN=seu_token_aqui
VITE_TRELLO_LIST_ID=id_da_lista_principal
VITE_TRELLO_AGENDAMENTO_LIST_ID=id_da_lista_agendamento

# --- Supabase ---
SUPABASE_URL=${supabaseUrl}
SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}
SUPABASE_VEHICLE_PHOTOS_BUCKET=vehicle-photos

# --- Oficina e auth ---
WORKSHOP_ID=${workshopIdVal}
ADMIN_PASSWORD=senha_gerencia

# --- Gemini (opcional) ---
GEMINI_API_KEY=sua_chave_gemini
`;

  fs.writeFileSync(ENV_PATH, envContent, "utf8");
  console.log(".env atualizado com SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e WORKSHOP_ID.");
  console.log("Reinicie o servidor (npm run dev) para os avisos sumirem.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
