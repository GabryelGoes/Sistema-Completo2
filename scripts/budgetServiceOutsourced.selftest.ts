/**
 * Selftest: etiqueta Terceirizado nos serviços do orçamento.
 * npm run test:budget-service-outsourced
 */
import {
  applyOutsourcedTextReplace,
  BUDGET_OUTSOURCED_SERVICE_LABEL,
  descriptionHasOutsourcedWord,
  findOutsourcedWordInDescription,
  isBudgetOutsourcedSuggestion,
  resolveOutsourcedServiceDescription,
  shouldOfferOutsourcedTextReplace,
  stripOutsourcedWordFromDescription,
} from "../utils/budgetServiceOutsourced.js";

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

console.log("budgetServiceOutsourced selftest\n");

console.log("1) Detecção da palavra");
{
  assert(descriptionHasOutsourcedWord("Retífica motor terceirizado"), "detecta no fim");
  assert(descriptionHasOutsourcedWord("Terceirizado"), "detecta sozinha");
  assert(descriptionHasOutsourcedWord("serviço TERCEIRIZADO agora"), "case-insensitive");
  assert(!descriptionHasOutsourcedWord("serviço interno"), "não inventa");
  const m = findOutsourcedWordInDescription("abc Terceirizado xyz");
  assert(!!m && m.matched.toLowerCase().includes("terceiriz"), "match retorna trecho");
}

console.log("\n2) Substituição / strip");
{
  assert(
    stripOutsourcedWordFromDescription("Retífica motor terceirizado") === "Retífica motor",
    "remove palavra no fim"
  );
  const solo = applyOutsourcedTextReplace("terceirizado");
  assert(solo.outsourced === true, "solo → outsourced");
  assert(
    solo.description === BUDGET_OUTSOURCED_SERVICE_LABEL,
    "solo não esvazia a descrição"
  );
  const mid = applyOutsourcedTextReplace("Pintura terceirizado completa");
  assert(mid.outsourced === true, "meio → outsourced");
  assert(!/terceirizado/i.test(mid.description), "meio remove a palavra");
  assert(mid.description.includes("Pintura"), "meio preserva resto");
}

console.log("\n3) Dica iOS e persistência");
{
  assert(
    shouldOfferOutsourcedTextReplace({
      description: "serviço terceirizado",
      outsourced: false,
    }),
    "oferece dica"
  );
  assert(
    !shouldOfferOutsourcedTextReplace({
      description: "serviço terceirizado",
      outsourced: true,
    }),
    "não oferecece se já tem etiqueta"
  );
  assert(
    !shouldOfferOutsourcedTextReplace({
      description: "serviço terceirizado",
      dismissed: true,
    }),
    "respeita dismiss"
  );
  assert(
    resolveOutsourcedServiceDescription({ description: "", outsourced: true }) ===
      BUDGET_OUTSOURCED_SERVICE_LABEL,
    "save fallback para linha terceirizada vazia"
  );
  assert(
    resolveOutsourcedServiceDescription({
      description: "Retífica",
      outsourced: true,
    }) === "Retífica",
    "save preserva descrição"
  );
}

console.log("\n4) Sugestão de catálogo");
{
  assert(
    isBudgetOutsourcedSuggestion({
      id: "x",
      name: "Terceirizado",
    }),
    "nome Terceirizado no catálogo"
  );
  assert(
    !isBudgetOutsourcedSuggestion({ id: "y", name: "Alinhamento" }),
    "serviço normal"
  );
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
