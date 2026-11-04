/**
 * PDF profissional — relatórios semanais do Radar (cliente).
 * Identidade Rei do ABS (amarelo/preto). Sem dados pessoais desnecessários.
 */
import { jsPDF } from 'jspdf';

const MARGIN = 14;

export type QualityPersonPdfPayload = {
  header: {
    personName: string;
    jobTitle: string;
    periodFrom: string;
    periodTo: string;
    leaderName: string;
    elaboratedAt: string;
  };
  indicators: Record<string, number | null | undefined>;
  analysis: Record<string, string>;
  actionPlan: Record<string, string>;
  conclusion: Record<string, string>;
  unavailableFields?: string[];
};

export type QualityTeamPdfPayload = {
  weekFrom: string;
  weekTo: string;
  body: {
    weekSummary: string;
    teamWins: string;
    recurringDifficulties: string;
    trainingNeeds: string;
    observedImprovements: string;
    operationalIssues: string;
    pdiSituation: string;
    nextWeekCommitments: string;
    noteNoRanking?: string;
    unavailableFields?: string[];
  };
  approvedByName?: string;
};

function brandHeader(doc: jsPDF, subtitle: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(24, 24, 27);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setFillColor(255, 214, 10);
  doc.rect(0, 22, pageW, 2, 'F');
  doc.setTextColor(255, 214, 10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('REI DO ABS', MARGIN, 10);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, MARGIN, 16);
  doc.setTextColor(0, 0, 0);
  return 32;
}

function ensureSpace(doc: jsPDF, y: number, need: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + need > pageH - 16) {
    doc.addPage();
    return brandHeader(doc, 'Relatório semanal — continuação');
  }
  return y;
}

function sectionTitle(doc: jsPDF, y: number, title: string): number {
  y = ensureSpace(doc, y, 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(24, 24, 27);
  doc.text(title, MARGIN, y);
  y += 2;
  doc.setDrawColor(255, 214, 10);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, MARGIN + 40, y);
  doc.setTextColor(0, 0, 0);
  return y + 6;
}

function para(doc: jsPDF, y: number, label: string, text: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - MARGIN * 2;
  const content = (text || '').trim() || '— não informado —';
  y = ensureSpace(doc, y, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(label, MARGIN, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 50);
  const lines = doc.splitTextToSize(content, maxW) as string[];
  for (const line of lines) {
    y = ensureSpace(doc, y, 6);
    doc.text(line, MARGIN, y);
    y += 4.5;
  }
  doc.setTextColor(0, 0, 0);
  return y + 2;
}

function safeName(s: string): string {
  return s.replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'relatorio';
}

export function downloadQualityPersonWeeklyPdf(payload: QualityPersonPdfPayload): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let y = brandHeader(doc, 'Relatório individual — Radar de Qualidade');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(payload.header.personName || 'Mecânico', MARGIN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);
  doc.text(`Função: ${payload.header.jobTitle || '—'}`, MARGIN, y);
  y += 5;
  doc.text(
    `Período: ${payload.header.periodFrom} → ${payload.header.periodTo}`,
    MARGIN,
    y
  );
  y += 5;
  doc.text(`Líder: ${payload.header.leaderName || '—'}`, MARGIN, y);
  y += 5;
  doc.text(
    `Elaborado em: ${
      payload.header.elaboratedAt
        ? new Date(payload.header.elaboratedAt).toLocaleString('pt-BR')
        : '—'
    }`,
    MARGIN,
    y
  );
  y += 8;
  doc.setTextColor(0, 0, 0);

  y = sectionTitle(doc, y, 'Indicadores objetivos');
  const indLabels: Array<[string, string]> = [
    ['servicesPatio', 'Serviços Pátio'],
    ['servicesLab', 'Serviços Laboratório'],
    ['productiveHours', 'Horas produtivas'],
    ['pausedHours', 'Horas em pausa'],
    ['evaluationsCount', 'Avaliações'],
    ['occurrencesCount', 'Ocorrências'],
    ['reworkHintCount', 'Indícios de retrabalho'],
    ['recognitionsCount', 'Registros positivos'],
    ['goalsDoneCount', 'Metas concluídas'],
    ['meetingsCount', 'Reuniões/feedbacks'],
  ];
  for (const [k, label] of indLabels) {
    const v = payload.indicators[k];
    const shown = v == null ? 'indisponível' : String(v);
    y = para(doc, y, label, shown);
  }

  y = sectionTitle(doc, y, 'Análise profissional');
  const analysisLabels: Array<[string, string]> = [
    ['overall', 'Desempenho geral'],
    ['strengths', 'Pontos fortes'],
    ['bestSkills', 'Melhores habilidades'],
    ['difficulties', 'Dificuldades'],
    ['errorsAndCorrectives', 'Erros e ações corretivas'],
    ['evolutionVsPrior', 'Evolução vs semanas anteriores'],
    ['technicalDevelopment', 'Desenvolvimento técnico'],
    ['autonomyAndOrganization', 'Autonomia e organização'],
    ['collaboration', 'Colaboração'],
  ];
  for (const [k, label] of analysisLabels) {
    y = para(doc, y, label, payload.analysis[k] || '');
  }

  y = sectionTitle(doc, y, 'Plano de ação');
  for (const [k, label] of [
    ['improvements', 'Melhorias recomendadas'],
    ['trainings', 'Treinamentos'],
    ['nextWeekGoals', 'Metas da próxima semana'],
    ['ownersAndDeadlines', 'Responsáveis e prazos'],
  ] as const) {
    y = para(doc, y, label, payload.actionPlan[k] || '');
  }

  y = sectionTitle(doc, y, 'Conclusão');
  for (const [k, label] of [
    ['periodSynthesis', 'Síntese do período'],
    ['leaderObservations', 'Observações do líder'],
    ['directorateDiscussionPoints', 'Pontos para a diretoria'],
  ] as const) {
    y = para(doc, y, label, payload.conclusion[k] || '');
  }

  if (payload.unavailableFields?.length) {
    y = sectionTitle(doc, y, 'Informações indisponíveis / incompletas');
    y = para(doc, y, 'Campos', payload.unavailableFields.join('\n'));
  }

  y = ensureSpace(doc, y, 14);
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    'Documento confidencial — gerência. Sem notas automáticas. Decisões humanas.',
    MARGIN,
    y
  );

  doc.save(
    `radar-semanal-${safeName(payload.header.personName)}-${payload.header.periodFrom}.pdf`
  );
}

export function downloadQualityTeamWeeklyPdf(payload: QualityTeamPdfPayload): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let y = brandHeader(doc, 'Relatório consolidado da equipe — Diretoria');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Consolidado semanal da equipe', MARGIN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);
  doc.text(`Período: ${payload.weekFrom} → ${payload.weekTo}`, MARGIN, y);
  y += 5;
  if (payload.approvedByName) {
    doc.text(`Aprovado por: ${payload.approvedByName}`, MARGIN, y);
    y += 5;
  }
  y += 3;
  doc.setTextColor(0, 0, 0);

  const sections: Array<[keyof QualityTeamPdfPayload['body'], string]> = [
    ['weekSummary', 'Resumo da semana'],
    ['teamWins', 'Principais conquistas'],
    ['recurringDifficulties', 'Dificuldades recorrentes'],
    ['trainingNeeds', 'Necessidades de treinamento'],
    ['observedImprovements', 'Melhorias observadas'],
    ['operationalIssues', 'Problemas operacionais'],
    ['pdiSituation', 'Situação dos planos de desenvolvimento'],
    ['nextWeekCommitments', 'Compromissos da próxima semana'],
  ];
  for (const [k, label] of sections) {
    y = sectionTitle(doc, y, label);
    y = para(doc, y, '', String(payload.body[k] || ''));
  }

  y = para(
    doc,
    y,
    'Nota',
    payload.body.noteNoRanking ||
      'Este consolidado não ranqueia profissionais de níveis ou funções diferentes.'
  );

  if (payload.body.unavailableFields?.length) {
    y = sectionTitle(doc, y, 'Lacunas');
    y = para(doc, y, '', payload.body.unavailableFields.join('\n'));
  }

  doc.save(`radar-equipe-${payload.weekFrom}.pdf`);
}
