import {
  getQualityRadarPeople,
  getSystemUsersDirectory,
  getWorkshopTechnicians,
  type SystemUserDirectoryEntry,
} from '../services/apiService';
import { normalizeQualityRadarPersonKey } from './qualityRadarNormalize';
import {
  buildUnifiedPeople,
  type ConfirmedPersonLink,
} from '../services/qualityRadar/identity';

export { normalizeQualityRadarPersonKey } from './qualityRadarNormalize';

/** Prefixo no valor do select para técnicos da tabela workshop_technicians. */
export const QUALITY_RADAR_WT_PREFIX = 'wt:';
/** Prefixo para usuários do sistema (workshop_system_users). */
export const QUALITY_RADAR_SU_PREFIX = 'su:';
/** Prefixo para vínculo confirmado WT+SU. */
export const QUALITY_RADAR_LINK_PREFIX = 'link:';

export type QualityRadarTechnicianOption = {
  /** Valor do select (`link:…`, `wt:uuid` ou `su:uuid`). */
  id: string;
  name: string;
  workshopTechnicianId: string | null;
  systemUserId: string | null;
  jobTitle?: string | null;
  source: 'linked' | 'workshop_technician' | 'system_user';
  /** Outros cadastros com o mesmo nome normalizado — NÃO unidos automaticamente. */
  possibleDuplicateIds?: string[];
  hasLogin?: boolean;
  hasWorkshopTechnician?: boolean;
  isTechnicianFlag?: boolean;
  isManagerial?: boolean;
  isActive?: boolean;
  professionalRole?: string;
  sector?: string;
  incomplete?: boolean;
  incompleteReasons?: string[];
};

function systemUserDisplayName(u: SystemUserDirectoryEntry): string {
  const display = (u.display_name || '').trim();
  const username = (u.username || '').trim();
  if (display) return display;
  return username;
}

/**
 * Lista unificada com identidade estável.
 * Preferência: endpoint /quality-radar/people (links confirmados).
 * Fallback local: NÃO une por nome — só por links vazios (mostra WT e SU separados).
 */
function mapUnifiedOption(p: {
  id: string;
  name: string;
  workshopTechnicianId: string | null;
  systemUserId: string | null;
  jobTitle?: string | null;
  source: 'linked' | 'workshop_technician' | 'system_user';
  possibleDuplicateIds?: string[];
  hasLogin?: boolean;
  hasWorkshopTechnician?: boolean;
  isTechnicianFlag?: boolean;
  isManagerial?: boolean;
  isActive?: boolean;
  professionalRole?: string;
  sector?: string;
  incomplete?: boolean;
  incompleteReasons?: string[];
}): QualityRadarTechnicianOption {
  return {
    id: p.id,
    name: p.name,
    workshopTechnicianId: p.workshopTechnicianId,
    systemUserId: p.systemUserId,
    jobTitle: p.jobTitle,
    source: p.source,
    possibleDuplicateIds: p.possibleDuplicateIds ?? [],
    hasLogin: p.hasLogin,
    hasWorkshopTechnician: p.hasWorkshopTechnician,
    isTechnicianFlag: p.isTechnicianFlag,
    isManagerial: p.isManagerial,
    isActive: p.isActive,
    professionalRole: p.professionalRole,
    sector: p.sector,
    incomplete: p.incomplete,
    incompleteReasons: p.incompleteReasons,
  };
}

export async function getQualityRadarTechnicianOptions(): Promise<QualityRadarTechnicianOption[]> {
  try {
    const people = await getQualityRadarPeople();
    // length > 0: lista vazia força fallback (API ok mas fontes falharam parcialmente)
    // length >= 0 era bug: tratava erro/vazio como sucesso e engolia o fallback
    if (Array.isArray(people?.people) && people.people.length > 0) {
      return people.people.map(mapUnifiedOption);
    }
    if (Array.isArray(people?.people) && people.people.length === 0) {
      // API respondeu mas sem gente — ainda tenta fallback local
      if (people.queryErrors?.technicians || people.queryErrors?.systemUsers) {
        // continua para fallback
      } else {
        return [];
      }
    }
  } catch {
    // fallback abaixo (migration pendente ou rede)
  }

  const [workshop, systemUsers] = await Promise.all([
    getWorkshopTechnicians(),
    getSystemUsersDirectory(),
  ]);
  const links: ConfirmedPersonLink[] = [];
  const unified = buildUnifiedPeople({
    workshopTechnicians: workshop.map((t) => ({ id: t.id, name: t.name })),
    systemUsers: systemUsers.map((u) => ({
      id: u.id,
      display_name: u.display_name,
      username: u.username,
      job_title: u.job_title,
      is_technician: u.is_technician,
      professional_role: u.professional_role,
      sector: u.sector,
      is_managerial: u.is_managerial,
      is_active: u.is_active,
      full_name: u.full_name,
    })),
    links,
  });
  return unified.map(mapUnifiedOption);
}

export function resolveQualityRadarTechnicianPayload(
  selectValue: string,
  options: QualityRadarTechnicianOption[]
): { technicianId: string | null; systemUserId: string | null; technicianName: string } {
  const opt = options.find((o) => o.id === selectValue);
  if (!opt) {
    return { technicianId: null, systemUserId: null, technicianName: '' };
  }
  return {
    technicianId: opt.workshopTechnicianId,
    systemUserId: opt.systemUserId,
    technicianName: opt.name,
  };
}

/** Valor do select ao editar uma ocorrência existente. */
export function qualityRadarTechnicianSelectValue(
  technicianId: string | null | undefined,
  technicianName: string | null | undefined,
  options: QualityRadarTechnicianOption[],
  systemUserId?: string | null
): string {
  if (technicianId && systemUserId) {
    const link = options.find(
      (o) =>
        o.workshopTechnicianId === technicianId && o.systemUserId === systemUserId
    );
    if (link) return link.id;
  }
  if (systemUserId) {
    const su = `${QUALITY_RADAR_SU_PREFIX}${systemUserId}`;
    if (options.some((o) => o.id === su || o.systemUserId === systemUserId)) {
      const hit = options.find((o) => o.systemUserId === systemUserId);
      if (hit) return hit.id;
    }
  }
  if (technicianId) {
    const wt = `${QUALITY_RADAR_WT_PREFIX}${technicianId}`;
    if (options.some((o) => o.id === wt || o.workshopTechnicianId === technicianId)) {
      const hit = options.find((o) => o.workshopTechnicianId === technicianId);
      if (hit) return hit.id;
    }
  }
  // Fallback legado: só por nome quando a ocorrência não tem UUID estável.
  const nameNorm = normalizeQualityRadarPersonKey(technicianName ?? '');
  if (!nameNorm) return '';
  const byName = options.filter(
    (o) => normalizeQualityRadarPersonKey(o.name) === nameNorm
  );
  // Se houver ambiguidade (2+), não escolhe automaticamente.
  if (byName.length === 1) return byName[0].id;
  return '';
}

/** Converte valor do filtro da listagem para parâmetro da API. */
export function qualityRadarTechnicianFilterParam(
  selectValue: string
): { technicianId?: string; technicianSystemUserId?: string } {
  if (!selectValue) return {};
  if (selectValue.startsWith(QUALITY_RADAR_LINK_PREFIX)) {
    // link:wtId:suId
    const parts = selectValue.split(':');
    const wtId = parts[1];
    const suId = parts[2];
    if (wtId && suId) return { technicianId: wtId, technicianSystemUserId: suId };
  }
  if (selectValue.startsWith(QUALITY_RADAR_SU_PREFIX)) {
    return { technicianSystemUserId: selectValue.slice(QUALITY_RADAR_SU_PREFIX.length) };
  }
  if (selectValue.startsWith(QUALITY_RADAR_WT_PREFIX)) {
    return { technicianId: selectValue.slice(QUALITY_RADAR_WT_PREFIX.length) };
  }
  return { technicianId: selectValue };
}

/** @deprecated Prefer getQualityRadarTechnicianOptions — mantido para testes legados. */
export function systemUserDisplayNameForTest(u: SystemUserDirectoryEntry): string {
  return systemUserDisplayName(u);
}
