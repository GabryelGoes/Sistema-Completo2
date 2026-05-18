import type {
  QualityIncident,
  QualityIncidentCategory,
  QualityIncidentSeverity,
} from '../services/apiService';
import {
  QUALITY_CATEGORY_LABEL,
  QUALITY_SEVERITY_LABEL,
  type QualityIncidentStatus,
} from '../constants/qualityRadar';

export type TechnicianQualityRow = {
  technicianId: string | null;
  technicianName: string;
  total: number;
  open: number;
  critical: number;
  high: number;
  resolved: number;
  byCategory: Record<QualityIncidentCategory, number>;
  bySeverity: Record<QualityIncidentSeverity, number>;
  lastOccurredAt: string | null;
  recentTitles: string[];
};

export type QualityRadarReport = {
  from: string;
  to: string;
  totalIncidents: number;
  openIncidents: number;
  criticalIncidents: number;
  techniciansWithIncidents: number;
  technicians: TechnicianQualityRow[];
  topCategories: { category: QualityIncidentCategory; label: string; count: number }[];
};

const OPEN_STATUSES: QualityIncidentStatus[] = ['aberta', 'em_analise', 'plano_acao'];

export function buildQualityRadarReport(
  incidents: QualityIncident[],
  fromIso: string,
  toIso: string
): QualityRadarReport {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const inRange = incidents.filter((i) => {
    const t = new Date(i.occurredAt).getTime();
    return t >= from.getTime() && t <= to.getTime();
  });

  const byTech = new Map<string, TechnicianQualityRow>();

  const ensure = (id: string | null, name: string): TechnicianQualityRow => {
    const key = id ?? `name:${name}`;
    let row = byTech.get(key);
    if (!row) {
      row = {
        technicianId: id,
        technicianName: name || 'Sem mecânico',
        total: 0,
        open: 0,
        critical: 0,
        high: 0,
        resolved: 0,
        byCategory: {
          montagem: 0,
          diagnostico: 0,
          retrabalho: 0,
          prazo: 0,
          comunicacao: 0,
          seguranca: 0,
          peca_material: 0,
          cliente: 0,
          outro: 0,
        },
        bySeverity: { baixa: 0, media: 0, alta: 0, critica: 0 },
        lastOccurredAt: null,
        recentTitles: [],
      };
      byTech.set(key, row);
    }
    return row;
  };

  for (const inc of inRange) {
    const row = ensure(inc.technicianId, inc.technicianName);
    row.total += 1;
    if (OPEN_STATUSES.includes(inc.status)) row.open += 1;
    if (inc.status === 'resolvida') row.resolved += 1;
    if (inc.severity === 'critica') row.critical += 1;
    if (inc.severity === 'alta') row.high += 1;
    row.byCategory[inc.category] = (row.byCategory[inc.category] ?? 0) + 1;
    row.bySeverity[inc.severity] = (row.bySeverity[inc.severity] ?? 0) + 1;
    if (!row.lastOccurredAt || inc.occurredAt > row.lastOccurredAt) {
      row.lastOccurredAt = inc.occurredAt;
    }
    if (row.recentTitles.length < 3 && inc.title) {
      row.recentTitles.push(inc.title);
    }
  }

  const technicians = [...byTech.values()].sort((a, b) => {
    if (b.critical !== a.critical) return b.critical - a.critical;
    if (b.open !== a.open) return b.open - a.open;
    return b.total - a.total;
  });

  const catCounts = new Map<QualityIncidentCategory, number>();
  for (const inc of inRange) {
    catCounts.set(inc.category, (catCounts.get(inc.category) ?? 0) + 1);
  }
  const topCategories = [...catCounts.entries()]
    .map(([category, count]) => ({
      category,
      label: QUALITY_CATEGORY_LABEL[category],
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    from: fromIso,
    to: toIso,
    totalIncidents: inRange.length,
    openIncidents: inRange.filter((i) => OPEN_STATUSES.includes(i.status)).length,
    criticalIncidents: inRange.filter((i) => i.severity === 'critica').length,
    techniciansWithIncidents: technicians.length,
    technicians,
    topCategories,
  };
}

export function formatReportPeriodLabel(fromIso: string, toIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${fmt(fromIso)} — ${fmt(toIso)}`;
}

export function severityScore(severity: QualityIncidentSeverity): number {
  return { baixa: 1, media: 2, alta: 3, critica: 4 }[severity];
}

export function technicianScore(row: TechnicianQualityRow): number {
  return row.critical * 10 + row.high * 5 + row.open * 2 + row.total;
}
