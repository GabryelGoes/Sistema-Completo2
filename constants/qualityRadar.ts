/** Radar de Qualidade — rótulos e metadados fixos (mesma UI no claro/escuro). */

export const QUALITY_RADAR_MODULE_TITLE = 'Radar de Qualidade';
export const QUALITY_RADAR_MODULE_SUBTITLE =
  'Registre ocorrências por mecânico, acompanhe severidade e gere relatórios da equipe.';

export const QUALITY_RADAR_ICON = '/icons/radar-qualidade-ios.png';

export type QualityIncidentCategory =
  | 'montagem'
  | 'diagnostico'
  | 'retrabalho'
  | 'prazo'
  | 'comunicacao'
  | 'seguranca'
  | 'peca_material'
  | 'cliente'
  | 'outro';

export type QualityIncidentSeverity = 'baixa' | 'media' | 'alta' | 'critica';

export type QualityIncidentStatus =
  | 'aberta'
  | 'em_analise'
  | 'plano_acao'
  | 'resolvida'
  | 'arquivada';

export const QUALITY_CATEGORIES: {
  id: QualityIncidentCategory;
  label: string;
  description: string;
}[] = [
  { id: 'montagem', label: 'Montagem / Instalação', description: 'Peça invertida, torque, montagem incompleta' },
  { id: 'diagnostico', label: 'Diagnóstico', description: 'Causa raiz incorreta ou caminho de teste falho' },
  { id: 'retrabalho', label: 'Retrabalho', description: 'Serviço refeito por falha do processo' },
  { id: 'prazo', label: 'Prazo / Atraso', description: 'Entrega, fila ou priorização inadequada' },
  { id: 'comunicacao', label: 'Comunicação', description: 'Falta de alinhamento com equipe ou cliente' },
  { id: 'seguranca', label: 'Segurança', description: 'EPI, procedimento ou risco no box' },
  { id: 'peca_material', label: 'Peça / Material', description: 'Peça errada, qualidade ou conferência' },
  { id: 'cliente', label: 'Relacionamento', description: 'Postura, registro ou expectativa com cliente' },
  { id: 'outro', label: 'Outro', description: 'Demais desvios operacionais' },
];

export const QUALITY_SEVERITIES: {
  id: QualityIncidentSeverity;
  label: string;
  solidClass: string;
}[] = [
  { id: 'baixa', label: 'Baixa', solidClass: 'bg-sky-500 text-white' },
  { id: 'media', label: 'Média', solidClass: 'bg-amber-500 text-white' },
  { id: 'alta', label: 'Alta', solidClass: 'bg-orange-600 text-white' },
  { id: 'critica', label: 'Crítica', solidClass: 'bg-rose-600 text-white' },
];

export const QUALITY_STATUSES: {
  id: QualityIncidentStatus;
  label: string;
  solidClass: string;
}[] = [
  { id: 'aberta', label: 'Aberta', solidClass: 'bg-rose-500 text-white' },
  { id: 'em_analise', label: 'Em análise', solidClass: 'bg-violet-500 text-white' },
  { id: 'plano_acao', label: 'Plano de ação', solidClass: 'bg-sky-500 text-white' },
  { id: 'resolvida', label: 'Resolvida', solidClass: 'bg-emerald-500 text-white' },
  { id: 'arquivada', label: 'Arquivada', solidClass: 'bg-zinc-500 text-white' },
];

export const QUALITY_CATEGORY_LABEL: Record<QualityIncidentCategory, string> = Object.fromEntries(
  QUALITY_CATEGORIES.map((c) => [c.id, c.label])
) as Record<QualityIncidentCategory, string>;

export const QUALITY_SEVERITY_LABEL: Record<QualityIncidentSeverity, string> = Object.fromEntries(
  QUALITY_SEVERITIES.map((s) => [s.id, s.label])
) as Record<QualityIncidentSeverity, string>;

export const QUALITY_STATUS_LABEL: Record<QualityIncidentStatus, string> = Object.fromEntries(
  QUALITY_STATUSES.map((s) => [s.id, s.label])
) as Record<QualityIncidentStatus, string>;

export const QUALITY_SEVERITY_SOLID: Record<QualityIncidentSeverity, string> = Object.fromEntries(
  QUALITY_SEVERITIES.map((s) => [s.id, s.solidClass])
) as Record<QualityIncidentSeverity, string>;

export const QUALITY_STATUS_SOLID: Record<QualityIncidentStatus, string> = Object.fromEntries(
  QUALITY_STATUSES.map((s) => [s.id, s.solidClass])
) as Record<QualityIncidentStatus, string>;
