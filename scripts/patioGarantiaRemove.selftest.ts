/**
 * Selftest: retirada da etiqueta Garantia no pátio.
 * npm run test:patio-garantia-remove
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

console.log("patioGarantiaRemove selftest\n");

const badge = readFileSync(
  join(process.cwd(), "components/patio/PatioGarantiaTagBadge.tsx"),
  "utf8"
);
const patio = readFileSync(
  join(process.cwd(), "components/views/PatioView.tsx"),
  "utf8"
);
const hero = readFileSync(
  join(process.cwd(), "components/patio/PatioOsModalTouchVehicleHero.tsx"),
  "utf8"
);

assert(badge.includes("Retirar a etiqueta de garantia?"), "janelinha pergunta retirada");
assert(badge.includes("onConfirmRemove"), "confirmação chama callback");
assert(badge.includes("Cancelar"), "botão cancelar");
assert(badge.includes("Retirar"), "botão retirar");
assert(patio.includes("PatioGarantiaTagBadge"), "pátio usa badge clicável");
assert(patio.includes("handleRemoveGarantia(card)"), "cartão do board remove por card");
assert(hero.includes("onConfirmRemoveGarantia"), "header touch conecta retirada");
assert(hero.includes("PatioGarantiaTagBadge"), "header touch usa badge");

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
