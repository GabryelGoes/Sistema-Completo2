/**
 * Selftest das regras de tempo RDA (sem banco).
 * npm run test:rda-work-sessions
 */
import {
  canAccessWorkSessionApis,
  canViewSessionRow,
  canViewWorkPerformanceSummary,
  resolveWorkSessionListScope,
} from '../services/rdaIntelligence/workSessions/access.js';
import { shouldRejectCrossTechnicianIdempotentReplay } from '../services/rdaIntelligence/workSessions/rpcOwnership.js';
import { computeLiveTotals, formatDurationHms } from '../services/rdaIntelligence/workSessions/timing.js';

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

console.log('RDA work sessions selftest\n');

const base = Date.parse('2026-11-01T12:00:00.000Z');

console.log('1) Live totals running');
{
  const live = computeLiveTotals({
    status: 'running',
    productiveMs: 60_000,
    pausedMs: 10_000,
    segmentStartedAt: new Date(base).toISOString(),
    currentPauseStartedAt: null,
    serverNowMs: base + 30_000,
  });
  assert(live.liveProductiveMs === 90_000, 'running soma segmento');
  assert(live.livePausedMs === 10_000, 'paused estático em running');
}

console.log('\n2) Live totals paused');
{
  const live = computeLiveTotals({
    status: 'paused',
    productiveMs: 90_000,
    pausedMs: 5_000,
    segmentStartedAt: null,
    currentPauseStartedAt: new Date(base).toISOString(),
    serverNowMs: base + 20_000,
  });
  assert(live.liveProductiveMs === 90_000, 'productive congelado em pause');
  assert(live.livePausedMs === 25_000, 'pause soma segmento');
}

console.log('\n3) Finished / format');
{
  const live = computeLiveTotals({
    status: 'finished',
    productiveMs: 120_000,
    pausedMs: 30_000,
    segmentStartedAt: new Date(base).toISOString(),
    currentPauseStartedAt: new Date(base).toISOString(),
    serverNowMs: base + 999_999,
  });
  assert(live.liveProductiveMs === 120_000, 'finished não soma segmento');
  assert(formatDurationHms(3661000) === '01:01:01', 'format H:M:S');
}

console.log('\n4) ACL — listagem e desempenho');
{
  const tech = {
    isTechnician: true,
    permissions: { access_patio: true },
  };
  const patioOnly = {
    isTechnician: false,
    permissions: { access_patio: true },
  };
  const radar = {
    isTechnician: false,
    permissions: { access_radar_qualidade: true },
  };
  const labOnly = {
    isTechnician: false,
    permissions: { access_laboratorio: true },
  };

  assert(
    canAccessWorkSessionApis({ role: 'admin', flags: null }) === true,
    'admin acessa APIs de tempo'
  );
  assert(
    canAccessWorkSessionApis({ role: 'user', userId: 't1', flags: tech }) === true,
    'técnico acessa APIs de tempo'
  );
  assert(
    canAccessWorkSessionApis({ role: 'user', userId: 'p1', flags: patioOnly }) === false,
    'pátio isolado NÃO acessa APIs de tempo'
  );
  assert(
    canAccessWorkSessionApis({ role: 'user', userId: 'l1', flags: labOnly }) === false,
    'lab isolado NÃO acessa APIs de tempo'
  );
  assert(
    canAccessWorkSessionApis({ role: 'user', userId: 'r1', flags: radar }) === true,
    'radar acessa APIs de tempo'
  );

  const techScope = resolveWorkSessionListScope({
    role: 'user',
    userId: 't1',
    flags: tech,
  });
  assert(techScope.allowed && techScope.scope === 'self', 'técnico lista só self');
  assert(
    techScope.allowed && techScope.scope === 'self' && techScope.selfUserId === 't1',
    'selfUserId do técnico'
  );

  const radarScope = resolveWorkSessionListScope({
    role: 'user',
    userId: 'r1',
    flags: radar,
  });
  assert(radarScope.allowed && radarScope.scope === 'all', 'radar lista all');

  const patioScope = resolveWorkSessionListScope({
    role: 'user',
    userId: 'p1',
    flags: patioOnly,
  });
  assert(!patioScope.allowed, 'pátio isolado sem listagem');

  assert(
    canViewWorkPerformanceSummary({ role: 'user', userId: 't1', flags: tech }) === false,
    'técnico comum sem resumo gerencial'
  );
  assert(
    canViewWorkPerformanceSummary({ role: 'user', userId: 'r1', flags: radar }) === true,
    'radar vê resumo gerencial'
  );
  assert(
    canViewSessionRow({
      role: 'user',
      userId: 't1',
      flags: tech,
      sessionTechnicianUserId: 't2',
    }) === false,
    'técnico não vê sessão alheia'
  );
  assert(
    canViewSessionRow({
      role: 'user',
      userId: 'r1',
      flags: radar,
      sessionTechnicianUserId: 't2',
    }) === true,
    'radar vê sessão alheia'
  );
}

console.log('\n5) Produtivo ≠ pausado (regressão conceitual)');
{
  const runningThen = computeLiveTotals({
    status: 'running',
    productiveMs: 0,
    pausedMs: 0,
    segmentStartedAt: new Date(base).toISOString(),
    currentPauseStartedAt: null,
    serverNowMs: base + 60_000,
  });
  const pausedThen = computeLiveTotals({
    status: 'paused',
    productiveMs: 60_000,
    pausedMs: 0,
    segmentStartedAt: null,
    currentPauseStartedAt: new Date(base + 60_000).toISOString(),
    serverNowMs: base + 90_000,
  });
  assert(runningThen.liveProductiveMs === 60_000, '1 min produtivo');
  assert(pausedThen.liveProductiveMs === 60_000, 'pausa não aumenta produtivo');
  assert(pausedThen.livePausedMs === 30_000, 'pausa conta só em pausedMs');
}

console.log('\n6) Ownership no replay idempotente');
{
  assert(
    shouldRejectCrossTechnicianIdempotentReplay({
      foundByMutation: true,
      sessionTechnicianUserId: 't1',
      actorTechnicianUserId: 't2',
    }) === true,
    'T2 reutilizando mutation de T1 → rejeitar'
  );
  assert(
    shouldRejectCrossTechnicianIdempotentReplay({
      foundByMutation: true,
      sessionTechnicianUserId: 't1',
      actorTechnicianUserId: 't1',
    }) === false,
    'T1 replaying própria mutation → ok'
  );
  assert(
    shouldRejectCrossTechnicianIdempotentReplay({
      foundByMutation: false,
      sessionTechnicianUserId: 't1',
      actorTechnicianUserId: 't2',
    }) === false,
    'sem mutation hit → segue fluxo normal'
  );
}

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
process.exit(failed > 0 ? 1 : 0);
