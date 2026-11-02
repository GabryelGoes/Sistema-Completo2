/**
 * Selftest do provider OpenAI (sem chave real — mock de fetch).
 * npm run test:rda-llm
 */
import { OpenAiRdaProvider } from "../services/rdaIntelligence/providers/openai.js";
import { RdaProviderDisabledError } from "../services/rdaIntelligence/providers/types.js";

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

console.log("RDA LLM provider selftest\n");

const provider = new OpenAiRdaProvider();

process.env.OPENAI_API_KEY = "";
process.env.RDA_ALLOW_LLM_CALLS = "false";
assert(provider.isConfigured() === false, "sem key → not configured");

process.env.OPENAI_API_KEY = "sk-test";
assert(provider.isConfigured() === true, "com key → configured");

try {
  await provider.complete({ messages: [{ role: "user", content: "oi" }] });
  assert(false, "deveria bloquear sem ALLOW");
} catch (e) {
  assert(e instanceof RdaProviderDisabledError, "bloqueio RDA_ALLOW_LLM_CALLS");
}

process.env.RDA_ALLOW_LLM_CALLS = "true";
const originalFetch = globalThis.fetch;
let called = false;
globalThis.fetch = (async () => {
  called = true;
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content: "resposta real mock" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      model: "gpt-4o-mini",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}) as typeof fetch;

const result = await provider.complete({
  messages: [{ role: "user", content: "teste" }],
});
assert(called, "fetch chamado");
assert(result.content === "resposta real mock", "conteúdo do modelo");
assert(result.usage?.totalTokens === 15, "usage tokens");
assert(result.provider === "openai", "provider id");

globalThis.fetch = originalFetch;
delete process.env.OPENAI_API_KEY;
process.env.RDA_ALLOW_LLM_CALLS = "false";

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
process.exit(failed > 0 ? 1 : 0);
