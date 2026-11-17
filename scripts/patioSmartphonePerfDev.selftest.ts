/**
 * Selftest do harness DEV do Pátio (PR-A). Sem HTTP / sem PII.
 * npm run test:patio-smartphone-perf-dev
 */
import {
  isPatioSmartphonePerfDevEnabled,
  patioPerfGetEvents,
  patioPerfMark,
  patioPerfNoteBoardCommit,
  patioPerfResetForTests,
} from "../utils/patioSmartphonePerfDev.js";

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

console.log("patioSmartphonePerfDev selftest\n");

patioPerfResetForTests();
assert(isPatioSmartphonePerfDevEnabled() === false, "sem flag DEV → desligado (produção/selftest)");
patioPerfMark("enter", { cardCount: 12, detail: "should-not-log-pii" });
assert(patioPerfGetEvents().length === 0, "mark sem flag não acumula eventos");
patioPerfNoteBoardCommit(99);
assert(patioPerfGetEvents().length === 0, "board_commit sem flag é no-op");

console.log(`\nresultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
