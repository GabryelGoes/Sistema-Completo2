/**
 * PR-B: shell de coluna opaco só com opaquePaint (smartphone).
 * npm run test:patio-board-glass-card
 */
import { getPatioBoardColumnShellClass } from "../utils/patioBoardGlassCard.js";

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

console.log("patioBoardGlassCard selftest\n");

const tabletMobile = getPatioBoardColumnShellClass(false);
assert(tabletMobile.includes("backdrop-blur-md"), "tablet/mobile legado mantém backdrop-blur");
assert(!tabletMobile.includes("bg-zinc-100 transition-[background-color]"), "legado não usa ramo opaco");

const phone = getPatioBoardColumnShellClass(false, { opaquePaint: true });
assert(!phone.includes("backdrop-blur"), "smartphone: sem backdrop-blur");
assert(phone.includes("bg-zinc-100"), "smartphone: fundo opaco claro");
assert(phone.includes("dark:bg-zinc-900"), "smartphone: fundo opaco escuro");
assert(phone.includes("motion-reduce:transition-none"), "smartphone: respeita reduced-motion");

const pc = getPatioBoardColumnShellClass(true);
assert(pc.includes("bg-zinc-100/90"), "PC inalterado");
assert(!pc.includes("backdrop-blur-md"), "PC já era sem blur md");

const pcOpaqueIgnored = getPatioBoardColumnShellClass(true, { opaquePaint: true });
assert(pcOpaqueIgnored === pc, "opaquePaint não altera ramo PC");

console.log(`\nresultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
