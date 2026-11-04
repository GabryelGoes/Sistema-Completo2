/** Radar de Qualidade — rótulos e metadados fixos (mesma UI no claro/escuro). */

export const QUALITY_RADAR_MODULE_TITLE = 'Radar de Qualidade';
export const QUALITY_RADAR_MODULE_SUBTITLE =
  'Central gerencial da equipe: funcionários, ocorrências, desempenho e preparação para avaliações.';

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
  | 'organizacao'
  | 'procedimentos'
  | 'outro';

export type QualityIncidentSeverity = 'baixa' | 'media' | 'alta' | 'critica';

export type QualityIncidentStatus =
  | 'aberta'
  | 'em_analise'
  | 'plano_acao'
  | 'resolvida'
  | 'arquivada';

/** Distingue investigação de culpa comprovada / fator externo. */
export type QualityFaultAttribution =
  | 'investigacao'
  | 'erro_comprovado'
  | 'fator_externo'
  | 'nao_aplicavel';

export type QualityRecognitionCategory =
  | 'diagnostico_complexo'
  | 'qualidade_execucao'
  | 'autonomia'
  | 'iniciativa'
  | 'organizacao'
  | 'colaboracao'
  | 'evolucao'
  | 'procedimentos'
  | 'ajuda_colegas'
  | 'melhoria_oficina'
  | 'outro';

export const QUALITY_CATEGORIES: {
  id: QualityIncidentCategory;
  label: string;
  description: string;
}[] = [
  { id: 'montagem', label: 'Falhas de montagem', description: 'Peça invertida, torque, montagem incompleta' },
  { id: 'diagnostico', label: 'Erros de diagnóstico', description: 'Causa raiz incorreta ou caminho de teste falho' },
  { id: 'retrabalho', label: 'Retrabalhos', description: 'Serviço refeito por falha do processo' },
  { id: 'organizacao', label: 'Problemas de organização', description: 'Posto de trabalho, ferramentas, ordem' },
  { id: 'procedimentos', label: 'Descumprimento de procedimentos', description: 'Protocolo ou checklist não seguido' },
  { id: 'comunicacao', label: 'Falhas de comunicação', description: 'Falta de alinhamento com equipe ou cliente' },
  { id: 'seguranca', label: 'Problemas de segurança', description: 'EPI, procedimento ou risco no box' },
  { id: 'prazo', label: 'Prazo / Atraso', description: 'Entrega, fila ou priorização inadequada' },
  { id: 'peca_material', label: 'Peça / Material', description: 'Peça errada, qualidade ou conferência' },
  { id: 'cliente', label: 'Relacionamento', description: 'Postura, registro ou expectativa com cliente' },
  { id: 'outro', label: 'Outras ocorrências', description: 'Demais desvios operacionais relevantes' },
];

export const QUALITY_FAULT_ATTRIBUTIONS: {
  id: QualityFaultAttribution;
  label: string;
  description: string;
}[] = [
  {
    id: 'investigacao',
    label: 'Em investigação',
    description: 'Ainda sem conclusão — não atribui culpa ao mecânico',
  },
  {
    id: 'erro_comprovado',
    label: 'Erro comprovado',
    description: 'Responsabilidade técnica do mecânico comprovada',
  },
  {
    id: 'fator_externo',
    label: 'Fator externo',
    description: 'Peça, processo, recurso ou causa fora do mecânico',
  },
  {
    id: 'nao_aplicavel',
    label: 'Não aplicável',
    description: 'Registro informativo sem atribuição de culpa',
  },
];

export const QUALITY_RECOGNITION_CATEGORIES: {
  id: QualityRecognitionCategory;
  label: string;
}[] = [
  { id: 'diagnostico_complexo', label: 'Diagnóstico complexo resolvido' },
  { id: 'qualidade_execucao', label: 'Excelente qualidade de execução' },
  { id: 'autonomia', label: 'Autonomia técnica' },
  { id: 'iniciativa', label: 'Iniciativa' },
  { id: 'organizacao', label: 'Organização' },
  { id: 'colaboracao', label: 'Colaboração' },
  { id: 'evolucao', label: 'Evolução profissional' },
  { id: 'procedimentos', label: 'Cumprimento de procedimentos' },
  { id: 'ajuda_colegas', label: 'Ajuda a outros funcionários' },
  { id: 'melhoria_oficina', label: 'Contribuição para melhorias da oficina' },
  { id: 'outro', label: 'Outro reconhecimento' },
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

export const QUALITY_FAULT_ATTRIBUTION_LABEL: Record<QualityFaultAttribution, string> =
  Object.fromEntries(QUALITY_FAULT_ATTRIBUTIONS.map((f) => [f.id, f.label])) as Record<
    QualityFaultAttribution,
    string
  >;

export const QUALITY_RECOGNITION_CATEGORY_LABEL: Record<QualityRecognitionCategory, string> =
  Object.fromEntries(QUALITY_RECOGNITION_CATEGORIES.map((c) => [c.id, c.label])) as Record<
    QualityRecognitionCategory,
    string
  >;
