/**
 * Selftest do hub Radar (Fase 1).
 * Rode: npm run test:quality-radar-hub
 */
import { normalizeQualityRadarPersonKey } from '../utils/qualityRadarNormalize.js';
import {
  buildUnifiedPeople,
  isProvenMechanicFault,
  suggestPersonLinkPairs,
} from '../services/qualityRadar/identity.js';
import { canAccessQualityRadar } from '../services/qualityRadar/access.js';
import {
  incidentsForEmployee,
  investigationIncidents,
  provenFaultIncidents,
  recognitionsForEmployee,
} from '../utils/qualityRadarPeople.js';
import type { QualityIncident, QualityRecognition } from '../services/apiService.js';
import type { QualityRadarTechnicianOption } from '../utils/qualityRadarTechnicians.js';

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

console.log('1) Dedupe por nome (acentos) — só chave, sem unir IDs');
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

console.log('\n2) Filtro local não altera dataset base');
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

console.log('\n3) Identidade — não une por nome sem link');
{
  const people = buildUnifiedPeople({
    workshopTechnicians: [
      { id: 'wt1', name: 'Gabryel' },
      { id: 'wt2', name: 'João' },
    ],
    systemUsers: [
      { id: 'su1', display_name: 'Gabryel', job_title: 'Mecânico' },
      { id: 'su2', display_name: 'Maria', username: 'maria' },
    ],
    links: [],
  });
  assert(people.length === 4, '4 cadastros separados sem link');
  const gab = people.filter((p) => normalizeQualityRadarPersonKey(p.name) === 'gabryel');
  assert(gab.length === 2, 'dois Gabryel sem união');
  assert(
    gab.every((p) => p.possibleDuplicateIds.length === 1),
    'cada um marca o outro como possível duplicata'
  );
  const suggestions = suggestPersonLinkPairs(people);
  assert(suggestions.length === 1, 'uma sugestão WT↔SU para Gabryel');
  assert(suggestions[0].workshopTechnicianId === 'wt1', 'sugestão aponta wt1');
}

console.log('\n4) Identidade — link confirmado une');
{
  const people = buildUnifiedPeople({
    workshopTechnicians: [{ id: 'wt1', name: 'Gabryel' }],
    systemUsers: [{ id: 'su1', display_name: 'Gabryel', job_title: 'Mecânico' }],
    links: [{ workshopTechnicianId: 'wt1', systemUserId: 'su1' }],
  });
  assert(people.length === 1, 'um perfil após vínculo');
  assert(people[0].source === 'linked', 'source linked');
  assert(people[0].workshopTechnicianId === 'wt1' && people[0].systemUserId === 'su1', 'ambos IDs');
  assert(people[0].possibleDuplicateIds.length === 0, 'sem duplicata após link');
  assert(people[0].hasLogin === true && people[0].hasWorkshopTechnician === true, 'flags link');
}

console.log('\n4b) SU não técnico também entra na unificação');
{
  const people = buildUnifiedPeople({
    workshopTechnicians: [],
    systemUsers: [
      { id: 'su1', display_name: 'Admin Office', is_technician: false, professional_role: 'administrativo' },
    ],
    links: [],
  });
  assert(people.length === 1, 'administrativo listado');
  assert(people[0].isTechnicianFlag === false, 'não técnico');
}

console.log('\n5) ACL Radar');
{
  assert(canAccessQualityRadar({ role: 'admin' }) === true, 'admin');
  assert(
    canAccessQualityRadar({
      role: 'user',
      userId: 'u1',
      permissions: { access_radar_qualidade: true },
    }) === true,
    'radar permission'
  );
  assert(
    canAccessQualityRadar({
      role: 'user',
      userId: 'u2',
      permissions: { access_patio: true },
    }) === false,
    'pátio sem radar'
  );
  assert(
    canAccessQualityRadar({
      role: 'user',
      userId: 'u3',
      permissions: { full_access: true },
    }) === true,
    'full_access'
  );
}

console.log('\n6) Ocorrências por ID estável + atribuição');
{
  const emp: QualityRadarTechnicianOption = {
    id: 'link:wt1:su1',
    name: 'Gabryel',
    workshopTechnicianId: 'wt1',
    systemUserId: 'su1',
    source: 'linked',
  };
  const other: QualityRadarTechnicianOption = {
    id: 'su:su2',
    name: 'Gabryel', // mesmo nome, pessoa diferente
    workshopTechnicianId: null,
    systemUserId: 'su2',
    source: 'system_user',
  };
  const incidents = [
    {
      id: 'i1',
      technicianId: 'wt1',
      systemUserId: 'su1',
      technicianName: 'Gabryel',
      faultAttribution: 'erro_comprovado',
      status: 'aberta',
      category: 'montagem',
      deletedAt: null,
    },
    {
      id: 'i2',
      technicianId: null,
      systemUserId: 'su2',
      technicianName: 'Gabryel',
      faultAttribution: 'investigacao',
      status: 'em_analise',
      category: 'diagnostico',
      deletedAt: null,
    },
    {
      id: 'i3',
      technicianId: 'wt1',
      systemUserId: null,
      technicianName: 'Gabryel',
      faultAttribution: 'fator_externo',
      status: 'resolvida',
      category: 'peca_material',
      deletedAt: null,
    },
  ] as unknown as QualityIncident[];

  const forEmp = incidentsForEmployee(incidents, emp);
  assert(forEmp.map((i) => i.id).sort().join(',') === 'i1,i3', 'emp vê i1+i3 por WT/SU');
  const forOther = incidentsForEmployee(incidents, other);
  assert(forOther.map((i) => i.id).join(',') === 'i2', 'outro Gabryel não herda i1');
  assert(isProvenMechanicFault('erro_comprovado') === true, 'erro comprovado');
  assert(isProvenMechanicFault('investigacao') === false, 'investigação não é culpa');
  assert(isProvenMechanicFault('fator_externo') === false, 'fator externo não é culpa');
  assert(provenFaultIncidents(forEmp).length === 1, 'só 1 comprovado em emp');
  assert(investigationIncidents(forOther).length === 1, 'investigação no outro');
}

console.log('\n7) Reconhecimentos por ID');
{
  const emp: QualityRadarTechnicianOption = {
    id: 'su:su1',
    name: 'Maria',
    workshopTechnicianId: null,
    systemUserId: 'su1',
    source: 'system_user',
  };
  const rows = [
    {
      id: 'r1',
      technicianId: null,
      systemUserId: 'su1',
      personName: 'Maria',
      deletedAt: null,
      category: 'iniciativa',
    },
    {
      id: 'r2',
      technicianId: null,
      systemUserId: 'su9',
      personName: 'Maria',
      deletedAt: null,
      category: 'colaboracao',
    },
  ] as unknown as QualityRecognition[];
  const mine = recognitionsForEmployee(rows, emp);
  assert(mine.length === 1 && mine[0].id === 'r1', 'reconhecimento só pelo systemUserId');
}

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
if (failed > 0) process.exit(1);
process.exit(0);
