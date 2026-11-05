/**
 * Selftest identidade / funções / ACL (people identity).
 * Rode: npm run test:quality-radar-people
 */
import {
  buildPeopleDiagnostics,
  buildUnifiedPeople,
  peopleEligibleForWeeklyCycle,
  suggestPersonLinkPairs,
} from '../services/qualityRadar/identity.js';
import {
  canAccessQualityRadar,
  canManageSensitiveSettings,
  canViewTeamQualityReports,
} from '../services/qualityRadar/access.js';
import {
  PROFESSIONAL_ROLE_CODES,
  suggestedProfileForRole,
} from '../services/qualityRadar/professionalRoles.js';

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

console.log('Quality Radar people identity selftest\n');

console.log('1) Listagem completa — inclui SU não técnico e WT sem nome');
{
  const people = buildUnifiedPeople({
    workshopTechnicians: [
      { id: 'wt1', name: 'Carlos', is_active: true, sector: 'patio', professional_role: 'mecanico' },
      { id: 'wt-blank', name: '   ', is_active: true },
    ],
    systemUsers: [
      {
        id: 'su-tech',
        display_name: 'Ana',
        is_technician: true,
        professional_role: 'mecanico',
        sector: 'patio',
      },
      {
        id: 'su-recep',
        display_name: 'Beatriz',
        username: 'bia',
        is_technician: false,
        professional_role: 'recepcionista',
        sector: 'administrativo',
      },
      {
        id: 'su-inactive',
        display_name: 'Diego',
        is_technician: true,
        is_active: false,
      },
    ],
    links: [],
  });
  assert(people.length === 5, `5 cadastros (inclui recepção e placeholder): ${people.length}`);
  assert(
    people.some((p) => p.systemUserId === 'su-recep'),
    'recepcionista aparece na lista unificada'
  );
  assert(
    people.some((p) => p.workshopTechnicianId === 'wt-blank' && p.incomplete),
    'WT sem nome permanece com incomplete'
  );
  assert(
    people.find((p) => p.systemUserId === 'su-inactive')?.isActive === false,
    'inativo marcado'
  );
}

console.log('\n2) Falha de consulta refletida no diagnóstico');
{
  const people = buildUnifiedPeople({
    workshopTechnicians: [{ id: 'wt1', name: 'A' }],
    systemUsers: [],
    links: [],
  });
  const diag = buildPeopleDiagnostics({
    workshopTechnicians: [{ id: 'wt1', name: 'A' }],
    systemUsers: [],
    links: [],
    queryErrors: {
      technicians: null,
      systemUsers: 'column is_active does not exist',
      links: null,
    },
    people,
  });
  assert(diag.queryErrors.systemUsers !== null, 'erro de SU preservado');
  assert(diag.schemaHints.length >= 1, 'hint de migration');
  assert(diag.counts.systemUsers === 0, 'contagem SU=0');
  assert(diag.counts.workshopTechnicians === 1, 'contagem WT=1');
}

console.log('\n3) Usuário sem login técnico (só WT)');
{
  const people = buildUnifiedPeople({
    workshopTechnicians: [{ id: 'wt1', name: 'Só Pátio' }],
    systemUsers: [],
    links: [],
  });
  assert(people[0].hasLogin === false, 'sem login');
  assert(people[0].hasWorkshopTechnician === true, 'com WT');
  assert(people[0].incompleteReasons.includes('patio_sem_login'), 'razão patio_sem_login');
}

console.log('\n4) Vinculação só com link confirmado');
{
  const before = buildUnifiedPeople({
    workshopTechnicians: [{ id: 'wt1', name: 'João' }],
    systemUsers: [{ id: 'su1', display_name: 'João', is_technician: true }],
    links: [],
  });
  assert(before.length === 2, 'sem união automática');
  assert(suggestPersonLinkPairs(before).length === 1, 'sugestão existe');
  const after = buildUnifiedPeople({
    workshopTechnicians: [{ id: 'wt1', name: 'João' }],
    systemUsers: [{ id: 'su1', display_name: 'João', is_technician: true }],
    links: [{ workshopTechnicianId: 'wt1', systemUserId: 'su1' }],
  });
  assert(after.length === 1 && after[0].source === 'linked', 'unido só após link');
}

console.log('\n5) Duplicidade de nomes marcada, não unida');
{
  const people = buildUnifiedPeople({
    workshopTechnicians: [
      { id: 'wt1', name: 'José' },
      { id: 'wt2', name: 'Jose' },
    ],
    systemUsers: [],
    links: [],
  });
  assert(people.length === 2, 'dois cadastros');
  assert(
    people.every((p) => p.possibleDuplicateIds.length === 1),
    'cada um aponta o outro'
  );
}

console.log('\n6) ACL líder / gerente / mecânico — cargo não libera');
{
  assert(
    canAccessQualityRadar({
      role: 'user',
      userId: 'g1',
      permissions: {},
      professionalRole: 'gerente',
      isManagerial: true,
    }) === false,
    'gerente sem permission = sem Radar'
  );
  assert(
    canAccessQualityRadar({
      role: 'user',
      userId: 'l1',
      permissions: { access_radar_qualidade: true },
      professionalRole: 'lider_patio',
    }) === true,
    'líder com permission explícita'
  );
  assert(
    canAccessQualityRadar({
      role: 'user',
      userId: 'm1',
      permissions: { access_patio: true },
      professionalRole: 'mecanico',
    }) === false,
    'mecânico operacional sem Radar'
  );
  assert(
    canViewTeamQualityReports({
      role: 'user',
      userId: 'g2',
      permissions: { access_radar_qualidade: true },
    }) === true,
    'relatórios com radar'
  );
  assert(
    canManageSensitiveSettings({
      role: 'user',
      userId: 'g3',
      permissions: { access_radar_qualidade: true },
    }) === false,
    'Radar ≠ full_access settings'
  );
  assert(
    canManageSensitiveSettings({
      role: 'user',
      userId: 'a1',
      permissions: { full_access: true },
    }) === true,
    'full_access settings'
  );
}

console.log('\n7) Ciclo semanal — elegíveis e preservação de inativos fora');
{
  const people = buildUnifiedPeople({
    workshopTechnicians: [
      { id: 'wt1', name: 'Ativo WT' },
      { id: 'wt2', name: 'Inativo WT', is_active: false },
    ],
    systemUsers: [
      { id: 'su1', display_name: 'Tech', is_technician: true },
      { id: 'su2', display_name: 'Recep', is_technician: false, professional_role: 'recepcionista' },
    ],
    links: [],
  });
  const eligible = peopleEligibleForWeeklyCycle(people);
  assert(
    eligible.some((p) => p.workshopTechnicianId === 'wt1'),
    'WT ativo no ciclo'
  );
  assert(
    !eligible.some((p) => p.workshopTechnicianId === 'wt2'),
    'WT inativo fora do ciclo'
  );
  assert(
    eligible.some((p) => p.systemUserId === 'su1'),
    'SU técnico no ciclo'
  );
  assert(
    !eligible.some((p) => p.systemUserId === 'su2'),
    'recepção fora do ciclo sem is_technician'
  );
  // Histórico: pessoa inativa ainda existe na lista unificada
  assert(people.some((p) => p.workshopTechnicianId === 'wt2'), 'inativo preservado na unificação');
}

console.log('\n8) Catálogo de funções e perfil sugerido sem auto-apply');
{
  assert(PROFESSIONAL_ROLE_CODES.includes('mecanico'), 'mecanico no catálogo');
  assert(PROFESSIONAL_ROLE_CODES.includes('diretor'), 'diretor no catálogo');
  const profile = suggestedProfileForRole('gerente');
  assert(!!profile && profile.permissions.full_access === false, 'gerente sugerido sem full_access');
  assert(suggestedProfileForRole('') === null, 'sem função = sem perfil');
}

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
if (failed > 0) process.exit(1);
process.exit(0);
