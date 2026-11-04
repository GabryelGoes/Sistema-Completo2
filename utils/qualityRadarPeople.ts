import type { QualityIncident, QualityRecognition } from '../services/apiService';
import { normalizeQualityRadarPersonKey } from './qualityRadarNormalize';
import type { QualityRadarTechnicianOption } from './qualityRadarTechnicians';
import { isProvenMechanicFault } from '../services/qualityRadar/identity';

/** Ocorrências associadas a um funcionário por IDs estáveis (não só nome). */
export function incidentsForEmployee(
  incidents: QualityIncident[],
  employee: QualityRadarTechnicianOption
): QualityIncident[] {
  const nameKey = normalizeQualityRadarPersonKey(employee.name);
  return incidents.filter((inc) => {
    if (inc.deletedAt) return false;
    if (
      employee.workshopTechnicianId &&
      inc.technicianId &&
      inc.technicianId === employee.workshopTechnicianId
    ) {
      return true;
    }
    if (
      employee.systemUserId &&
      inc.systemUserId &&
      inc.systemUserId === employee.systemUserId
    ) {
      return true;
    }
    // Legado sem UUID: só casa por nome se NÃO houver ambiguidade de IDs no próprio registro.
    if (!inc.technicianId && !inc.systemUserId) {
      return normalizeQualityRadarPersonKey(inc.technicianName || '') === nameKey;
    }
    return false;
  });
}

export function recognitionsForEmployee(
  recognitions: QualityRecognition[],
  employee: QualityRadarTechnicianOption
): QualityRecognition[] {
  const nameKey = normalizeQualityRadarPersonKey(employee.name);
  return recognitions.filter((r) => {
    if (r.deletedAt) return false;
    if (
      employee.workshopTechnicianId &&
      r.technicianId &&
      r.technicianId === employee.workshopTechnicianId
    ) {
      return true;
    }
    if (employee.systemUserId && r.systemUserId && r.systemUserId === employee.systemUserId) {
      return true;
    }
    if (!r.technicianId && !r.systemUserId) {
      return normalizeQualityRadarPersonKey(r.personName || '') === nameKey;
    }
    return false;
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

/** Só erros comprovados — não conta investigação / fator externo como “dificuldade”. */
export function provenFaultIncidents(incidents: QualityIncident[]): QualityIncident[] {
  return incidents.filter((i) => isProvenMechanicFault(i.faultAttribution));
}

export function investigationIncidents(incidents: QualityIncident[]): QualityIncident[] {
  return incidents.filter(
    (i) => !i.faultAttribution || i.faultAttribution === 'investigacao'
  );
}
