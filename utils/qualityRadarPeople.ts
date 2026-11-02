import type { QualityIncident } from '../services/apiService';
import { normalizeQualityRadarPersonKey } from './qualityRadarNormalize';
import type { QualityRadarTechnicianOption } from './qualityRadarTechnicians';

/** Ocorrências associadas a um funcionário (por id WT ou nome normalizado). */
export function incidentsForEmployee(
  incidents: QualityIncident[],
  employee: QualityRadarTechnicianOption
): QualityIncident[] {
  const nameKey = normalizeQualityRadarPersonKey(employee.name);
  return incidents.filter((inc) => {
    if (employee.workshopTechnicianId && inc.technicianId === employee.workshopTechnicianId) {
      return true;
    }
    return normalizeQualityRadarPersonKey(inc.technicianName || '') === nameKey;
  });
}

export function openIncidentCount(incidents: QualityIncident[]): number {
  return incidents.filter((i) => ['aberta', 'em_analise', 'plano_acao'].includes(i.status)).length;
}

export function criticalIncidentCount(incidents: QualityIncident[]): number {
  return incidents.filter((i) => i.severity === 'critica').length;
}

export function reworkIncidentCount(incidents: QualityIncident[]): number {
  return incidents.filter((i) => i.category === 'retrabalho').length;
}
