/**
 * Selftest Memória Permanente RDA (sem banco).
 * npm run test:rda-knowledge
 */
import {
  applyApproveToHeader,
  applyProposeRevisionToHeader,
  canManageRdaKnowledge,
  canProposeRdaKnowledge,
  citationKindForItem,
  concurrencyAllowsUpdate,
  findKnowledgeConflicts,
  isOfficialRetrievalEligible,
  looksLikePermanentGuidance,
  normalizeKnowledgeKey,
} from '../services/rdaIntelligence/index.js';
import type { RdaAuthContext } from '../services/rdaIntelligence/types.js';

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

console.log('RDA knowledge memory selftest\n');

console.log('1) Permissões');
{
  const admin: RdaAuthContext = { role: 'admin' };
  const full: RdaAuthContext = {
    role: 'user',
    userId: 'u1',
    permissions: { full_access: true },
  };
  const tech: RdaAuthContext = {
    role: 'user',
    userId: 'u2',
    permissions: { access_patio: true },
  };
  const radar: RdaAuthContext = {
    role: 'user',
    userId: 'u3',
    permissions: { access_radar_qualidade: true },
  };
  const none: RdaAuthContext = { role: 'user', userId: 'u4', permissions: {} };
  assert(canManageRdaKnowledge(admin), 'admin gerencia');
  assert(canManageRdaKnowledge(full), 'full_access gerencia');
  assert(!canManageRdaKnowledge(tech), 'técnico não aprova/purge');
  assert(canProposeRdaKnowledge(radar), 'radar pode propor');
  assert(canProposeRdaKnowledge(tech), 'pátio pode propor');
  assert(!canProposeRdaKnowledge(none), 'sem perms não propõe');
}

console.log('\n2) Retrieval oficial');
{
  assert(
    isOfficialRetrievalEligible({ lifecycle: 'approved', approvedVersion: 2 }),
    'aprovado com versão'
  );
  assert(
    isOfficialRetrievalEligible({ lifecycle: 'pending_approval', approvedVersion: 1 }),
    'pendente de revisão ainda serve aprovada vigente'
  );
  assert(
    !isOfficialRetrievalEligible({ lifecycle: 'pending_approval', approvedVersion: 0 }),
    'pendente sem aprovada NÃO é oficial'
  );
  assert(
    !isOfficialRetrievalEligible({ lifecycle: 'draft', approvedVersion: 0 }),
    'rascunho não oficial'
  );
  assert(
    !isOfficialRetrievalEligible({ lifecycle: 'retired', approvedVersion: 3 }),
    'retirado não oficial'
  );
  assert(
    citationKindForItem({ lifecycle: 'approved', approvedVersion: 1, category: 'operational_rule' }) ===
      'official_rule',
    'citação regra oficial'
  );
  assert(
    citationKindForItem({
      lifecycle: 'pending_approval',
      approvedVersion: 0,
      category: 'managerial_guidance',
    }) === 'pending_approval',
    'citação pendente'
  );
}

console.log('\n3) Versionamento / concorrência');
{
  const base = {
    currentVersion: 1,
    approvedVersion: 1,
    pendingVersion: null as number | null,
    lifecycle: 'approved',
  };
  const rev = applyProposeRevisionToHeader(base);
  assert(rev.ok === true && rev.ok && rev.pendingVersion === 2, 'revisão cria pending v2');
  assert(rev.ok === true && rev.ok && rev.approvedVersion === 1, 'aprovada vigente intacta');
  const dup = applyProposeRevisionToHeader({
    ...base,
    pendingVersion: 2,
    currentVersion: 2,
    lifecycle: 'pending_approval',
  });
  assert(dup.ok === false && dup.ok === false && dup.code === 'RDA_KNOWLEDGE_PENDING_EXISTS', 'bloqueia 2ª proposta');
  const ap = applyApproveToHeader({
    approvedVersion: 1,
    pendingVersion: 2,
    lifecycle: 'pending_approval',
  });
  assert(ap.ok === true && ap.ok && ap.approvedVersion === 2 && ap.pendingVersion === null, 'approve promove pending');
  assert(concurrencyAllowsUpdate('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'), 'lock ok');
  assert(!concurrencyAllowsUpdate('2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'), 'lock conflito');
  assert(concurrencyAllowsUpdate('x', null), 'sem expected = permite');
}

console.log('\n4) Exclusão / restauração (contrato lógico)');
{
  // Purge exige retired + confirm key (testado via códigos das RPCs / UI)
  const retiredPropose = applyProposeRevisionToHeader({
    currentVersion: 2,
    approvedVersion: 2,
    pendingVersion: null,
    lifecycle: 'retired',
  });
  assert(
    retiredPropose.ok === false && retiredPropose.code === 'RDA_KNOWLEDGE_RETIRED',
    'retirado não recebe proposta sem restore'
  );
}

console.log('\n5) Detecção de orientação + conflitos');
{
  assert(
    looksLikePermanentGuidance(
      'RDA, sempre que um veículo estiver aguardando peças por mais de dois dias, quero que ele seja sinalizado.'
    ),
    'detecta orientação permanente'
  );
  assert(!looksLikePermanentGuidance('qual a OS da placa ABC1D23?'), 'não detecta pergunta comum');
  const conflicts = findKnowledgeConflicts([
    {
      knowledgeKey: 'a',
      title: 'Espera peças',
      content: 'Nunca deixar veículo aguardando peças sem sinalizar na home.',
    },
    {
      knowledgeKey: 'b',
      title: 'Espera peças 2',
      content: 'Sempre sinalizar veículo aguardando peças na home após dois dias.',
    },
  ]);
  assert(conflicts.length >= 1, 'sinaliza possível inconsistência sempre/nunca');
  assert(normalizeKnowledgeKey(' Espera Peças 2d ') === 'espera_pecas_2d', 'normaliza key');
}

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
process.exit(failed > 0 ? 1 : 0);
