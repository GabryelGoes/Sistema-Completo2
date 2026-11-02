import {
  getSystemUsersDirectory,
  getWorkshopTechnicians,
  type SystemUserDirectoryEntry,
} from '../services/apiService';
import { normalizeQualityRadarPersonKey } from './qualityRadarNormalize';

export { normalizeQualityRadarPersonKey } from './qualityRadarNormalize';

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
  jobTitle?: string | null;
  source: 'workshop_technician' | 'system_user';
};

function systemUserDisplayName(u: SystemUserDirectoryEntry): string {
  const display = (u.display_name || '').trim();
  const username = (u.username || '').trim();
  if (display) return display;
  return username;
}

/**
 * Lista unificada: técnicos cadastrados em Administração + usuários do sistema.
 * Evita duplicar a mesma pessoa (nome equivalente, inclusive com/sem acento).
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
    const key = normalizeQualityRadarPersonKey(name);
    const prev = byKey.get(key);
    // Se já houver WT com o mesmo nome normalizado, mantém o primeiro (evita duplicata).
    if (prev?.workshopTechnicianId) continue;
    byKey.set(key, {
      id: `${QUALITY_RADAR_WT_PREFIX}${t.id}`,
      name: prev?.name || name,
      workshopTechnicianId: t.id,
      systemUserId: prev?.systemUserId ?? null,
      jobTitle: prev?.jobTitle ?? null,
      source: 'workshop_technician',
    });
  }

  for (const u of systemUsers) {
    const name = systemUserDisplayName(u);
    if (!name) continue;
    const key = normalizeQualityRadarPersonKey(name);
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, {
        ...existing,
        jobTitle: existing.jobTitle || u.job_title || null,
        systemUserId: existing.systemUserId ?? u.id,
      });
      continue;
    }
    byKey.set(key, {
      id: `${QUALITY_RADAR_SU_PREFIX}${u.id}`,
      name,
      workshopTechnicianId: null,
      systemUserId: u.id,
      jobTitle: u.job_title,
      source: 'system_user',
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
  const nameNorm = normalizeQualityRadarPersonKey(technicianName ?? '');
  if (!nameNorm) return '';
  const byName = options.find((o) => normalizeQualityRadarPersonKey(o.name) === nameNorm);
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
