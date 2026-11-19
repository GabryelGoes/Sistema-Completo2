/**
 * Selftest: parse de QR de OS do lab com leituras deformadas por layout de teclado HID.
 */
import {
  buildLabOsQrPayload,
  isLabOsQrPayload,
  parseLabOsQrPayload,
} from '../utils/labOsQrCode.ts';

const UUID = '1111e5ae-fc2a-49f7-ae90-90724c168f7d';
let failed = 0;

function ok(name: string, cond: boolean) {
  if (cond) {
    console.log(`  OK  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}`);
  }
}

console.log('labOsQrCode selftest\n');

ok('build canônico', buildLabOsQrPayload(UUID) === `RDA-OS:${UUID}`);
ok('parse canônico', parseLabOsQrPayload(`RDA-OS:${UUID}`) === UUID);

ok(
  'pistola US→layout estranho (; e >)',
  parseLabOsQrPayload(`RDA;OS>${UUID.replace(/-/g, ';')}`) === UUID
);

ok(
  'pistola US + SO ABNT2 (: → Ç, hífens intactos)',
  parseLabOsQrPayload(`RDA-OSÇ${UUID}`) === UUID
);

ok(
  'pistola US + SO ABNT2 (ç minúsculo)',
  parseLabOsQrPayload(`RDA-OSç${UUID}`) === UUID
);

ok('isLabOsQrPayload com Ç', isLabOsQrPayload(`RDA-OSÇ${UUID}`));
ok('rejeita lixo', parseLabOsQrPayload('ABC123') == null);

if (failed) {
  console.error(`\nlabOsQrCode.selftest: ${failed} falha(s)`);
  process.exit(1);
}
console.log('\nlabOsQrCode.selftest: ok');
