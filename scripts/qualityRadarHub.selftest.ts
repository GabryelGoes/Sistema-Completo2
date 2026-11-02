/**
 * Selftest do hub Radar (validação Fase 1).
 * Rode: npm run test:quality-radar-hub
 */
import { normalizeQualityRadarPersonKey } from '../utils/qualityRadarNormalize.js';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed += 1;
    console.log(`  OK  ${msg}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${msg}`);
  }
}

console.log('Quality Radar hub selftest\n');

console.log('1) Dedupe por nome (acentos)');
assert(
  normalizeQualityRadarPersonKey('José Silva') === normalizeQualityRadarPersonKey('Jose Silva'),
  'José ≡ Jose'
);
assert(
  normalizeQualityRadarPersonKey('  ANA  ') === normalizeQualityRadarPersonKey('ana'),
  'trim + case'
);
assert(
  normalizeQualityRadarPersonKey('João') !== normalizeQualityRadarPersonKey('Joana'),
  'João ≠ Joana'
);

console.log('\n2) Filtro local não altera dataset base (modelo da Visão Geral)');
type Mini = { id: string; technicianName: string; status: string; severity: string };
const all: Mini[] = [
  { id: 'a', technicianName: 'Jose', status: 'aberta', severity: 'media' },
  { id: 'b', technicianName: 'Maria', status: 'resolvida', severity: 'critica' },
];
const openAll = all.filter((i) => ['aberta', 'em_analise', 'plano_acao'].includes(i.status)).length;
const filtered = all.filter(
  (i) =>
    normalizeQualityRadarPersonKey(i.technicianName) ===
    normalizeQualityRadarPersonKey('Maria')
);
assert(filtered.length === 1 && filtered[0].id === 'b', 'filtro isola Maria');
assert(openAll === 1, 'contagem do dataset completo permanece 1 aberto');
assert(all.length === 2, 'dataset base intacto');

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
if (failed > 0) process.exit(1);
process.exit(0);
