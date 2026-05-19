import {
  getSystemUsersDirectory,
  getWorkshopTechnicians,
  type SystemUserDirectoryEntry,
} from '../services/apiService';

/** Prefixo no valor do select para técnicos da tabela workshop_technicians. */
export const QUALITY_RADAR_WT_PREFIX = 'wt:';
/** Prefixo para usuários do sistema (workshop_system_users). */
export const QUALITY_RADAR_SU_PREFIX = 'su:';

export type QualityRadarTechnicianOption = {
  /** Valor do select (`wt:uuid` ou `su:uuid`). */
  id: string;
  name: string;
  workshopTechnicianId: string | null;
  systemUserId: string | null;
};

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

function systemUserDisplayName(u: SystemUserDirectoryEntry): string {
  const display = (u.display_name || '').trim();
  const username = (u.username || '').trim();
  if (display) return display;
  return username;
}

/**
 * Lista unificada: técnicos cadastrados em Administração + todos os usuários do sistema.
 * Evita duplicar o mesmo nome quando já existe em workshop_technicians.
 */
export async function getQualityRadarTechnicianOptions(): Promise<QualityRadarTechnicianOption[]> {
  const [workshop, systemUsers] = await Promise.all([
    getWorkshopTechnicians(),
    getSystemUsersDirectory(),
  ]);

  const byKey = new Map<string, QualityRadarTechnicianOption>();

  for (const t of workshop) {
    const name = (t.name || '').trim();
    if (!name) continue;
    const key = normalizeName(name);
    byKey.set(key, {
      id: `${QUALITY_RADAR_WT_PREFIX}${t.id}`,
      name,
      workshopTechnicianId: t.id,
      systemUserId: null,
    });
  }

  for (const u of systemUsers) {
    const name = systemUserDisplayName(u);
    if (!name) continue;
    const key = normalizeName(name);
    if (byKey.has(key)) continue;
    byKey.set(key, {
      id: `${QUALITY_RADAR_SU_PREFIX}${u.id}`,
      name,
      workshopTechnicianId: null,
      systemUserId: u.id,
    });
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function resolveQualityRadarTechnicianPayload(
  selectValue: string,
  options: QualityRadarTechnicianOption[]
): { technicianId: string | null; technicianName: string } {
  const opt = options.find((o) => o.id === selectValue);
  if (!opt) {
    return { technicianId: null, technicianName: '' };
  }
  return {
    technicianId: opt.workshopTechnicianId,
    technicianName: opt.name,
  };
}

/** Valor do select ao editar uma ocorrência existente. */
export function qualityRadarTechnicianSelectValue(
  technicianId: string | null | undefined,
  technicianName: string | null | undefined,
  options: QualityRadarTechnicianOption[]
): string {
  if (technicianId) {
    const wt = `${QUALITY_RADAR_WT_PREFIX}${technicianId}`;
    if (options.some((o) => o.id === wt)) return wt;
  }
  const nameNorm = normalizeName(technicianName ?? '');
  if (!nameNorm) return '';
  const byName = options.find((o) => normalizeName(o.name) === nameNorm);
  return byName?.id ?? '';
}

/** Converte valor do filtro da listagem para parâmetro da API. */
export function qualityRadarTechnicianFilterParam(
  selectValue: string
): { technicianId?: string; technicianSystemUserId?: string } {
  if (!selectValue) return {};
  if (selectValue.startsWith(QUALITY_RADAR_SU_PREFIX)) {
    return { technicianSystemUserId: selectValue.slice(QUALITY_RADAR_SU_PREFIX.length) };
  }
  if (selectValue.startsWith(QUALITY_RADAR_WT_PREFIX)) {
    return { technicianId: selectValue.slice(QUALITY_RADAR_WT_PREFIX.length) };
  }
  return { technicianId: selectValue };
}
