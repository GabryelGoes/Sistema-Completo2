/**
 * Selftest Fase 2 — carreira / competências.
 * npm run test:quality-radar-career
 */
import {
  readinessAgainstRequirements,
  scoreOrUnrated,
  DEFAULT_COMPETENCIES,
  DEFAULT_CAREER_LEVELS,
} from '../services/qualityRadar/careerDefaults.js';
import { canAccessQualityRadar } from '../services/qualityRadar/access.js';

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

console.log('Quality Radar career (phase 2) selftest\n');

console.log('1) Ausência de nota ≠ zero');
assert(scoreOrUnrated(null) === null, 'null permanece null');
assert(scoreOrUnrated(undefined) === null, 'undefined → null');
assert(scoreOrUnrated(0) === null, '0 inválido → null');
assert(scoreOrUnrated(3) === 3, '3 válido');
assert(scoreOrUnrated(6) === null, '6 inválido');

console.log('\n2) Prontidão para nível exige notas reais');
{
  const reqs = [
    { competencyCode: 'freios_conv', minLevel: 3 },
    { competencyCode: 'seguranca', minLevel: 3 },
  ];
  const unrated = readinessAgainstRequirements({
    requirements: reqs,
    scoresByCode: {},
  });
  assert(unrated.ready === false, 'sem notas → não pronto');
  assert(unrated.missing.length === 2, '2 requisitos faltando');
  assert(unrated.missing.every((m) => m.current === null), 'faltas com current null');

  const partial = readinessAgainstRequirements({
    requirements: reqs,
    scoresByCode: { freios_conv: 4, seguranca: null },
  });
  assert(partial.ready === false, 'uma nota null bloqueia');
  assert(partial.met === 1, '1 requisito ok');

  const ready = readinessAgainstRequirements({
    requirements: reqs,
    scoresByCode: { freios_conv: 4, seguranca: 3 },
  });
  assert(ready.ready === true, 'todos avaliados e ok');
  assert(ready.missing.length === 0, 'sem faltas');
}

console.log('\n3) Catálogo padrão');
assert(DEFAULT_COMPETENCIES.filter((c) => c.kind === 'technical').length === 10, '10 técnicas');
assert(DEFAULT_COMPETENCIES.filter((c) => c.kind === 'professional').length === 10, '10 profissionais');
assert(DEFAULT_CAREER_LEVELS.length === 5, '5 níveis');
assert(
  DEFAULT_COMPETENCIES.every((c) => c.rubrics.length === 5),
  'rubrica 1–5 em todas'
);

console.log('\n4) ACL gerencial');
assert(
  canAccessQualityRadar({
    role: 'user',
    userId: 't',
    permissions: { access_patio: true },
  }) === false,
  'técnico sem radar não acessa'
);
assert(
  canAccessQualityRadar({
    role: 'user',
    userId: 'g',
    permissions: { access_radar_qualidade: true },
  }) === true,
  'gestão acessa'
);

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
process.exit(failed > 0 ? 1 : 0);
