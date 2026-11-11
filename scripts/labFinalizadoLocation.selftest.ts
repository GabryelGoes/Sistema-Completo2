/**
 * Selftest: localização Oficina↔Laboratório liberada em Finalizado.
 * npm run test:lab-finalizado-location
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

console.log("labFinalizadoLocation selftest\n");

const api = readFileSync(join(process.cwd(), "apiApp.ts"), "utf8");

const saidaIdx = api.indexOf('app.post("/api/service-orders/:id/oficina-saida"');
const retornoIdx = api.indexOf('app.post("/api/service-orders/:id/oficina-retorno"');
assert(saidaIdx > 0, "rota oficina-saida existe");
assert(retornoIdx > 0, "rota oficina-retorno existe");

const saidaBlock = api.slice(saidaIdx, saidaIdx + 2500);
const retornoBlock = api.slice(retornoIdx, retornoIdx + 2500);

assert(
  saidaBlock.includes("prevStatus === CANCELLED_STATUS") &&
    !saidaBlock.includes('prevStatus === CANCELLED_STATUS || prevStatus === "FINALIZADO"'),
  "saída bloqueia só CANCELLED"
);
assert(
  retornoBlock.includes("prevStatus === CANCELLED_STATUS") &&
    !retornoBlock.includes('prevStatus === CANCELLED_STATUS || prevStatus === "FINALIZADO"'),
  "retorno bloqueia só CANCELLED"
);
assert(
  saidaBlock.includes("Finalizado ainda pode") || saidaBlock.includes("Arquivada/entregue"),
  "comentário explica regra de saída"
);
assert(
  !/if \(prevStatus === CANCELLED_STATUS \|\| prevStatus === \"FINALIZADO\"\)/.test(
    saidaBlock + retornoBlock
  ),
  "não resta bloqueio conjunto CANCELLED||FINALIZADO nas rotas"
);

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
