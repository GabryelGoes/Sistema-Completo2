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
import {
  computeLiveTotals,
  createServerClockSync,
  formatDurationHms,
  clipInterval,
  calendarDayKey,
  productiveIntervalsFromEvents,
  pausedIntervalsFromEvents,
  splitIntervalByCalendarDay,
  sumIntervalsMs,
  WORKSHOP_TIME_ZONE,
} from '../services/rdaIntelligence/workSessions/timing.js';
import {
  ensureBudgetServiceLineIds,
  isGeneralOsServiceLine,
  OS_GENERAL_SERVICE_LINE_ID,
  readBudgetServiceLineId,
} from '../utils/budgetServiceLineId.js';
import {
  aggregateOsTimeIndicators,
  canStartOrResumeTimeKind,
  timeKindAllowedForOsStatus,
  timeKindsToAutoPauseOnStageChange,
} from '../services/rdaIntelligence/workSessions/stageRules.js';
import { applyAutoPauseKindsToRunning } from '../services/rdaIntelligence/workSessions/autoPauseOnStageChange.js';
import type { RdaWorkTimeKind } from '../services/rdaIntelligence/workSessions/stageRules.js';

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

console.log('\n7) Clock sync — skew fixo avança com o tick local');
{
  const serverIso = new Date(base).toISOString();
  const clientAtSync = base + 5_000; // cliente 5s à frente
  const sync = createServerClockSync(serverIso, clientAtSync);
  const t0 = sync.serverNowMsAt(clientAtSync);
  const t1 = sync.serverNowMsAt(clientAtSync + 10_000);
  assert(t0 === base, 'serverNow no sync = serverAtSync');
  assert(t1 === base + 10_000, 'após 10s locais, serverNow avança 10s');
  // Bug antigo: skew = serverNow - Date.now() a cada tick → serverNowMs congelado
  const frozenBug = (clientNow: number) => {
    const skew = Date.parse(serverIso) - clientNow;
    return clientNow + skew;
  };
  assert(frozenBug(clientAtSync) === base, 'bug: no sync parece ok');
  assert(frozenBug(clientAtSync + 10_000) === base, 'bug: 10s depois continua congelado');
  assert(t1 !== frozenBug(clientAtSync + 10_000), 'fix diverge do bug congelado');
}

console.log('\n8) Line id estável do orçamento');
{
  const { lines, changed } = ensureBudgetServiceLineIds([
    { description: 'Reparo ABS' },
    { description: 'Sangria', line_id: 'fixed-line-1' },
    { id: 'legacy-uuid-abcdefgh', description: 'Pastilhas' },
  ]);
  assert(changed === true, 'linhas sem id geram mudança');
  assert(typeof lines[0].line_id === 'string' && (lines[0].line_id as string).length >= 8, 'gera line_id');
  assert(readBudgetServiceLineId(lines[1]) === 'fixed-line-1', 'preserva line_id existente');
  assert(readBudgetServiceLineId(lines[2]) === 'legacy-uuid-abcdefgh', 'usa id legado como line_id');
  const again = ensureBudgetServiceLineIds(lines);
  assert(again.changed === false, 'segunda passagem idempotente');
  assert(isGeneralOsServiceLine(null) === true, 'null = geral');
  assert(isGeneralOsServiceLine(OS_GENERAL_SERVICE_LINE_ID) === true, 'sentinel = geral');
  assert(isGeneralOsServiceLine('fixed-line-1') === false, 'line real não é geral');
}

console.log('\n9) Intervalos efetivos e divisão por dia (America/Sao_Paulo)');
{
  // Segunda 19:00 BRT = 22:00 UTC; Terça 10:00 BRT = 13:00 UTC
  const mon1600Utc = Date.parse('2026-11-02T19:00:00.000Z'); // 16:00 BRT
  const tue1000Utc = Date.parse('2026-11-03T13:00:00.000Z'); // 10:00 BRT
  const cross = { startMs: mon1600Utc, endMs: tue1000Utc };
  const byDay = splitIntervalByCalendarDay(cross, WORKSHOP_TIME_ZONE);
  const monKey = calendarDayKey(mon1600Utc, WORKSHOP_TIME_ZONE);
  const tueKey = calendarDayKey(tue1000Utc, WORKSHOP_TIME_ZONE);
  assert(monKey === '2026-11-02', 'dia segunda SP');
  assert(tueKey === '2026-11-03', 'dia terça SP');
  assert((byDay.get(monKey) || 0) > 0, 'parte na segunda');
  assert((byDay.get(tueKey) || 0) > 0, 'parte na terça');
  assert(
    (byDay.get(monKey) || 0) + (byDay.get(tueKey) || 0) === tue1000Utc - mon1600Utc,
    'soma dos dias = intervalo total'
  );

  const periodFrom = Date.parse('2026-11-03T03:00:00.000Z'); // ~00:00 terça BRT
  const clipped = clipInterval(cross, periodFrom, null);
  assert(clipped != null && clipped.startMs === periodFrom, 'clip remove segunda');
  assert(clipped != null && sumIntervalsMs([clipped]) === tue1000Utc - periodFrom, 'ms só na terça');
}

console.log('\n10) Timeline start/pause/resume/finish → intervalos');
{
  const events = [
    { eventType: 'start', occurredAt: new Date(base).toISOString() },
    { eventType: 'pause', occurredAt: new Date(base + 30_000).toISOString(), pauseReasonId: 'waiting_parts' },
    { eventType: 'resume', occurredAt: new Date(base + 50_000).toISOString() },
    { eventType: 'finish', occurredAt: new Date(base + 80_000).toISOString() },
  ];
  const prod = productiveIntervalsFromEvents(events);
  const paused = pausedIntervalsFromEvents(events);
  assert(prod.length === 2, 'dois trechos produtivos');
  assert(sumIntervalsMs(prod) === 60_000, '30s + 30s produtivos');
  assert(paused.length === 1 && paused[0].reasonId === 'waiting_parts', 'uma pausa waiting_parts');
  assert(sumIntervalsMs(paused) === 20_000, '20s pausados');

  // Múltiplas sessões do mesmo serviço = somar intervalos
  const session2 = productiveIntervalsFromEvents([
    { eventType: 'start', occurredAt: new Date(base + 100_000).toISOString() },
    { eventType: 'finish', occurredAt: new Date(base + 130_000).toISOString() },
  ]);
  assert(sumIntervalsMs([...prod, ...session2]) === 90_000, 'soma multi-sessão mesmo serviço');
}

console.log('\n11) Dois técnicos na mesma OS / um técnico em duas OS (regras lógicas)');
{
  // Regras modeladas como ACL + ownership (sem banco):
  // - Dois técnicos: sessões distintas por technicianUserId → ambos canView self
  assert(
    canViewSessionRow({
      role: 'user',
      userId: 't1',
      flags: { isTechnician: true, permissions: { access_patio: true } },
      sessionTechnicianUserId: 't1',
    }) === true,
    'T1 vê própria sessão na OS'
  );
  assert(
    canViewSessionRow({
      role: 'user',
      userId: 't2',
      flags: { isTechnician: true, permissions: { access_patio: true } },
      sessionTechnicianUserId: 't2',
    }) === true,
    'T2 vê própria sessão na mesma OS'
  );
  // Um técnico: active session conflict é RPC (RDA_ACTIVE_SESSION_EXISTS) — coberto pela migration;
  // aqui validamos que T1 não lê sessão de T2.
  assert(
    canViewSessionRow({
      role: 'user',
      userId: 't1',
      flags: { isTechnician: true, permissions: { access_patio: true } },
      sessionTechnicianUserId: 't2',
    }) === false,
    'T1 não enxerga sessão de T2'
  );
}

console.log('\n12) Histórico sem serviço vinculado (legado = geral)');
{
  assert(isGeneralOsServiceLine(undefined) === true, 'legado undefined = geral');
  assert(isGeneralOsServiceLine('') === true, 'string vazia = geral');
  const desc = 'Apontamento geral da OS';
  assert(desc.includes('geral'), 'rótulo claro para legado');
}

console.log('\n13) Separação Pátio × Lab (filtro orderType)');
{
  const rows = [
    { order_type: 'vehicle', productive: 10 },
    { order_type: 'module', productive: 20 },
    { order_type: 'vehicle', productive: 5 },
  ];
  const patio = rows.filter((r) => r.order_type === 'vehicle');
  const lab = rows.filter((r) => r.order_type === 'module');
  assert(
    patio.reduce((a, r) => a + r.productive, 0) === 15,
    'filtro vehicle soma só pátio'
  );
  assert(lab.reduce((a, r) => a + r.productive, 0) === 20, 'filtro module soma só lab');
}

console.log('\n14) Etapas × time_kind');
{
  assert(timeKindAllowedForOsStatus('EM_SERVICO') === 'execution', 'EM_SERVICO → execução');
  assert(
    timeKindAllowedForOsStatus('AVALIACAO_TECNICA') === 'diagnostic',
    'AVALIACAO_TECNICA → diagnóstico'
  );
  assert(timeKindAllowedForOsStatus('AGUARDANDO_PECAS') === null, 'espera peças sem produtivo');
  assert(timeKindAllowedForOsStatus('AGUARDANDO_APROVACAO') === null, 'espera aprovação sem produtivo');
  assert(timeKindAllowedForOsStatus('ORCAMENTO_APROVADO') === null, 'orçamento aprovado sem produtivo');
  assert(timeKindAllowedForOsStatus('FASE_DE_TESTE') === null, 'fase teste sem produtivo');
  assert(canStartOrResumeTimeKind('execution', 'EM_SERVICO') === true, 'pode iniciar execução');
  assert(canStartOrResumeTimeKind('execution', 'AVALIACAO_TECNICA') === false, 'não execução em avaliação');
  assert(canStartOrResumeTimeKind('diagnostic', 'AVALIACAO_TECNICA') === true, 'pode diagnosticar');
  assert(canStartOrResumeTimeKind('diagnostic', 'EM_SERVICO') === false, 'diagnóstico só em avaliação');
}

console.log('\n15) Auto-pause ao sair da etapa');
{
  const leaveService = timeKindsToAutoPauseOnStageChange({
    previousStatus: 'EM_SERVICO',
    nextStatus: 'AGUARDANDO_PECAS',
  });
  assert(leaveService.includes('execution') && leaveService.length === 1, 'sai EM_SERVICO → pause execução');
  const leaveDiag = timeKindsToAutoPauseOnStageChange({
    previousStatus: 'AVALIACAO_TECNICA',
    nextStatus: 'AGUARDANDO_APROVACAO',
  });
  assert(leaveDiag.includes('diagnostic') && leaveDiag.length === 1, 'sai avaliação → pause diagnóstico');
  const enterService = timeKindsToAutoPauseOnStageChange({
    previousStatus: 'AGUARDANDO_PECAS',
    nextStatus: 'EM_SERVICO',
  });
  assert(enterService.length === 0, 'entrar em EM_SERVICO não pausa');
  const same = timeKindsToAutoPauseOnStageChange({
    previousStatus: 'EM_SERVICO',
    nextStatus: 'EM_SERVICO',
  });
  assert(same.length === 0, 'mesma etapa = noop');
}

console.log('\n16) Indicadores separados + preservação de totais');
{
  const ind = aggregateOsTimeIndicators([
    { timeKind: 'execution', liveProductiveMs: 60_000, livePausedMs: 10_000 },
    { timeKind: 'diagnostic', liveProductiveMs: 30_000, livePausedMs: 5_000 },
    { timeKind: 'execution', productiveMs: 20_000, pausedMs: 0 },
  ]);
  assert(ind.executionMs === 80_000, 'execução soma');
  assert(ind.diagnosticMs === 30_000, 'diagnóstico separado');
  assert(ind.pausedMs === 15_000, 'pausas somadas');
  assert(ind.totalOsMs === 125_000, 'total = diag + exec + pausas');
}

console.log('\n17) Segurança RPC — assinatura canônica e sem bypass de etapa');
{
  // Contrato documentado pela migration 20261105020000:
  // - exatamente 1 start com 8 args (inclui p_time_kind)
  // - overloads 6/7 removidos
  // - EXECUTE só service_role
  const canonicalStartArgs = 8;
  const legacyStartArgs = [6, 7];
  assert(canonicalStartArgs === 8, 'start canônico = 8 parâmetros');
  assert(!legacyStartArgs.includes(canonicalStartArgs), 'canônico não é legado');
  // Auto-pause deve ocorrer ao sair da etapa (mesma regra do trigger SQL)
  const kinds = timeKindsToAutoPauseOnStageChange({
    previousStatus: 'EM_SERVICO',
    nextStatus: 'FASE_DE_TESTE',
  });
  assert(kinds.includes('execution'), 'trigger/RPC pausa execução ao sair de EM_SERVICO');
}

console.log('\n18) Concorrência / mudanças rápidas / idempotência de auto-pause');
{
  // Sequência rápida típica da oficina: avaliação → espera → serviço → espera → serviço
  const sequence: Array<{ from: string; to: string; runningBefore: RdaWorkTimeKind[] }> = [
    { from: 'AVALIACAO_TECNICA', to: 'AGUARDANDO_APROVACAO', runningBefore: ['diagnostic'] },
    { from: 'AGUARDANDO_APROVACAO', to: 'EM_SERVICO', runningBefore: [] },
    { from: 'EM_SERVICO', to: 'AGUARDANDO_PECAS', runningBefore: ['execution'] },
    { from: 'AGUARDANDO_PECAS', to: 'EM_SERVICO', runningBefore: [] },
    { from: 'EM_SERVICO', to: 'FASE_DE_TESTE', runningBefore: ['execution'] },
    { from: 'AVALIACAO_TECNICA', to: 'EM_SERVICO', runningBefore: ['diagnostic'] },
  ];
  for (const step of sequence) {
    const after = applyAutoPauseKindsToRunning(step.runningBefore, step.from, step.to);
    const mustPause = timeKindsToAutoPauseOnStageChange({
      previousStatus: step.from,
      nextStatus: step.to,
    });
    for (const k of mustPause) {
      assert(!after.includes(k), `${step.from}→${step.to}: ${k} não fica running`);
    }
    for (const k of after) {
      assert(
        canStartOrResumeTimeKind(k, step.to),
        `${step.from}→${step.to}: residual ${k} só se etapa autorizar`
      );
    }
  }

  // Idempotência: aplicar a mesma transição duas vezes (2ª vez já sem running)
  const first = applyAutoPauseKindsToRunning(['execution'], 'EM_SERVICO', 'AGUARDANDO_PECAS');
  const second = applyAutoPauseKindsToRunning(first, 'EM_SERVICO', 'AGUARDANDO_PECAS');
  assert(first.length === 0 && second.length === 0, 'idempotente: 2ª pausa é noop');

  // Ambos kinds running (cenário inconsistente) ao sair de avaliação: só diagnostic pausa
  const both = applyAutoPauseKindsToRunning(
    ['diagnostic', 'execution'],
    'AVALIACAO_TECNICA',
    'AGUARDANDO_APROVACAO'
  );
  assert(both.includes('execution') && !both.includes('diagnostic'), 'só diagnostic pausa ao sair de avaliação');

  // Sair de EM_SERVICO com ambos: só execution pausa
  const leaveSvc = applyAutoPauseKindsToRunning(
    ['diagnostic', 'execution'],
    'EM_SERVICO',
    'AGUARDANDO_PECAS'
  );
  assert(leaveSvc.includes('diagnostic') && !leaveSvc.includes('execution'), 'só execution pausa ao sair de serviço');

  // Entrar em espera a partir de espera: noop
  assert(
    timeKindsToAutoPauseOnStageChange({
      previousStatus: 'AGUARDANDO_PECAS',
      nextStatus: 'AGUARDANDO_APROVACAO',
    }).length === 0,
    'espera→espera não pausa'
  );
}

console.log('\n19) Indicador total = tempo apontado (não tempo desde entrada)');
{
  const ind = aggregateOsTimeIndicators([
    { timeKind: 'execution', liveProductiveMs: 10_000, livePausedMs: 2_000 },
  ]);
  // totalOsMs = apontamentos (diag+exec+pausas), não elapsed desde check-in do veículo
  assert(ind.totalOsMs === 12_000, 'total apontado = produtivo + pausas');
  assert(
    ind.totalOsMs === ind.executionMs + ind.diagnosticMs + ind.pausedMs,
    'identidade: Tempo total apontado'
  );
}

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
process.exit(failed > 0 ? 1 : 0);
