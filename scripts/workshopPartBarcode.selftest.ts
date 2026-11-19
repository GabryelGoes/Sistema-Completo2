/**
 * Selftest: heurística da pistola USB para códigos de estoque (incluindo curtos).
 */
import { isLikelyBarcodeWedgeKeystroke } from '../utils/workshopPartBarcode.ts';

let failed = 0;

function ok(name: string, cond: boolean) {
  if (cond) console.log(`  OK  ${name}`);
  else {
    failed += 1;
    console.log(`  FAIL  ${name}`);
  }
}

console.log('workshopPartBarcode selftest\n');

ok(
  'código curto 22390 (5 dígitos, ritmo pistola)',
  isLikelyBarcodeWedgeKeystroke({ elapsedMs: 120, length: 5 }) === true
);

ok(
  'código curto 4 dígitos rápido',
  isLikelyBarcodeWedgeKeystroke({ elapsedMs: 90, length: 4 }) === true
);

ok(
  'código curto lento demais (digitação)',
  isLikelyBarcodeWedgeKeystroke({ elapsedMs: 600, length: 5 }) === false
);

ok(
  'menos de 4 chars rejeitado',
  isLikelyBarcodeWedgeKeystroke({ elapsedMs: 40, length: 3 }) === false
);

ok(
  'EAN-13 típico',
  isLikelyBarcodeWedgeKeystroke({ elapsedMs: 400, length: 13 }) === true
);

ok(
  '6+ chars ritmo pistola',
  isLikelyBarcodeWedgeKeystroke({ elapsedMs: 200, length: 8 }) === true
);

if (failed) {
  console.error(`\nworkshopPartBarcode.selftest: ${failed} falha(s)`);
  process.exit(1);
}
console.log('\nworkshopPartBarcode.selftest: ok');
