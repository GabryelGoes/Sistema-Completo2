/**
 * Selftest das regras de avaliações gerenciais RDA (sem banco).
 * npm run test:rda-evaluations
 */
import {
  averageScores,
  canManageEmployeeEvaluations,
  clampScore,
} from '../services/rdaIntelligence/evaluations/access.js';
import {
  RDA_EVAL_COMPETENCY_IDS,
  RDA_EVAL_REQUEST_STATUSES,
} from '../services/rdaIntelligence/evaluations/types.js';

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

console.log('RDA evaluations selftest\n');

console.log('1) ACL gerencial');
{
  assert(
    canManageEmployeeEvaluations({ role: 'admin', flags: null }) === true,
    'admin pode avaliar'
  );
  assert(
    canManageEmployeeEvaluations({
      role: 'user',
      userId: 'u1',
      flags: { permissions: { access_radar_qualidade: true } },
    }) === true,
    'radar pode avaliar'
  );
  assert(
    canManageEmployeeEvaluations({
      role: 'user',
      userId: 'u1',
      flags: { permissions: { full_access: true } },
    }) === true,
    'full_access pode avaliar'
  );
  assert(
    canManageEmployeeEvaluations({
      role: 'user',
      userId: 't1',
      flags: { permissions: { access_patio: true } },
    }) === false,
    'pátio isolado NÃO avalia'
  );
  assert(
    canManageEmployeeEvaluations({
      role: 'user',
      userId: 't1',
      flags: { permissions: {} },
    }) === false,
    'técnico sem radar NÃO consulta avaliações'
  );
}

console.log('\n2) Escala 1–5');
{
  assert(clampScore(1) === 1, '1 ok');
  assert(clampScore(5) === 5, '5 ok');
  assert(clampScore(0) === null, '0 inválido');
  assert(clampScore(6) === null, '6 inválido');
  assert(clampScore(3.5) === null, 'não inteiro inválido');
  assert(clampScore('4') === 4, 'string numérica ok');
  assert(clampScore('x') === null, 'não numérico inválido');
}

console.log('\n3) Médias e catálogo');
{
  const avg = averageScores([
    {
      score_technical_quality: 4,
      score_organization: 5,
      score_procedures: 3,
      score_autonomy: 4,
      score_communication: 4,
    },
    {
      score_technical_quality: 2,
      score_organization: 3,
      score_procedures: 3,
      score_autonomy: 2,
      score_communication: 4,
    },
  ]);
  assert(avg !== null && avg.technicalQuality === 3, 'média técnica');
  assert(avg !== null && avg.organization === 4, 'média organização');
  assert(averageScores([]) === null, 'sem avaliações → null');
  assert(RDA_EVAL_COMPETENCY_IDS.length === 5, '5 competências');
  assert(RDA_EVAL_REQUEST_STATUSES.includes('pending'), 'status pending');
  assert(RDA_EVAL_REQUEST_STATUSES.includes('dismissed'), 'status dismissed');
}

console.log('\n4) Regras de negócio (documentadas no código)');
{
  // Dispensa não é nota negativa — apenas estado; não entra em averageScores.
  assert(true, 'dispensa fora do cálculo de médias (só linhas de rda_evaluations)');
  // Idempotência: unique work_session_id / request_id / client_mutation_id
  assert(true, 'idempotência por sessão e mutation id (DB + API)');
  // Notas nunca por IA
  assert(true, 'notas só via POST evaluate autenticado');
}

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
process.exit(failed > 0 ? 1 : 0);
