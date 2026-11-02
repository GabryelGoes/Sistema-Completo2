import type { QualityIncident } from '../services/apiService';
import type { QualityRadarTechnicianOption } from './qualityRadarTechnicians';

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

/** Ocorrências associadas a um funcionário (por id WT ou nome). */
export function incidentsForEmployee(
  incidents: QualityIncident[],
  employee: QualityRadarTechnicianOption
): QualityIncident[] {
  const nameKey = normalizeName(employee.name);
  return incidents.filter((inc) => {
    if (employee.workshopTechnicianId && inc.technicianId === employee.workshopTechnicianId) {
      return true;
    }
    return normalizeName(inc.technicianName || '') === nameKey;
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
