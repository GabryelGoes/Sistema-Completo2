/**
 * Selftest: botão Melhorar no diagnóstico + níveis de correção.
 * npm run test:budget-diagnosis-improve
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { improveTextWithOpenAi, isAiImproveTextConfigured } from "../services/aiTextImprove.ts";
import {
  buildAiImproveSystemPrompt,
  normalizeAiImproveTextLevel,
} from "../utils/aiImproveTextLevel.ts";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed += 1;
    console.log(`  OK  ${msg}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${msg}`);
  }
}

console.log("budgetDiagnosisImprove selftest\n");

const api = readFileSync(join(process.cwd(), "apiApp.ts"), "utf8");
const client = readFileSync(join(process.cwd(), "services/apiService.ts"), "utf8");
const btn = readFileSync(join(process.cwd(), "components/ui/AiImproveTextButton.tsx"), "utf8");
const touch = readFileSync(
  join(process.cwd(), "components/budget/PatioBudgetRequestTouchForm.tsx"),
  "utf8"
);
const prefs = readFileSync(join(process.cwd(), "components/BudgetPreferencesModal.tsx"), "utf8");
const levelUtil = readFileSync(join(process.cwd(), "utils/aiImproveTextLevel.ts"), "utf8");

assert(api.includes('/api/ai/improve-text'), "rota improve-text registrada");
assert(api.includes("ai_improve_text_level"), "settings persistem nível");
assert(client.includes("improveTextWithAi"), "cliente improveTextWithAi");
assert(client.includes("aiImproveTextLevel"), "cliente lê/grava nível");
assert(btn.includes("Desfazer"), "botão oferecee desfazer");
assert(btn.includes("Melhorar"), "botão oferecee melhorar");
assert(touch.includes("AiImproveTextButton"), "form touch usa o botão");
assert(touch.includes('kind="budget_diagnosis"'), "kind budget_diagnosis no diagnóstico");
assert(prefs.includes("Melhoria de texto (IA)"), "ajustes de orçamentos têm nível");
assert(prefs.includes("AI_IMPROVE_TEXT_LEVELS"), "modal usa níveis");
assert(levelUtil.includes("Organize melhor as ideias"), "prompt médio organiza ideias");
assert(levelUtil.includes("Explique com mais clareza"), "prompt forte explica melhor");

assert(normalizeAiImproveTextLevel("forte") === "strong", "normaliza forte→strong");
assert(normalizeAiImproveTextLevel("leve") === "light", "normaliza leve→light");
assert(normalizeAiImproveTextLevel(null) === "balanced", "default balanced");

const strong = buildAiImproveSystemPrompt("budget_diagnosis", "strong");
assert(/Reorganize as ideias/i.test(strong), "prompt strong reorganiza");
assert(/Não invente/i.test(strong), "prompt strong não inventa");

const prevKey = process.env.OPENAI_API_KEY;
delete process.env.OPENAI_API_KEY;
assert(!isAiImproveTextConfigured(), "sem chave = não configurado");
try {
  await improveTextWithOpenAi({ text: "teste", kind: "budget_diagnosis" });
  assert(false, "sem chave deve falhar");
} catch (err) {
  assert(
    err instanceof Error && /OPENAI_API_KEY/i.test(err.message),
    "erro sem OPENAI_API_KEY"
  );
}
if (prevKey != null) process.env.OPENAI_API_KEY = prevKey;

try {
  process.env.OPENAI_API_KEY = "sk-test";
  await improveTextWithOpenAi({ text: "   ", kind: "budget_diagnosis", level: "strong" });
  assert(false, "texto vazio deve falhar");
} catch (err) {
  assert(
    err instanceof Error && /Informe um texto/i.test(err.message),
    "rejeita texto vazio"
  );
} finally {
  if (prevKey != null) process.env.OPENAI_API_KEY = prevKey;
  else delete process.env.OPENAI_API_KEY;
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
