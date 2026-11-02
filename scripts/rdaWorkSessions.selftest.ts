/**
 * Selftest das regras de tempo RDA (sem banco).
 * npm run test:rda-work-sessions
 */
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

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
process.exit(failed > 0 ? 1 : 0);
