/**
 * Contratos e regras puras — Revisão Semanal com RDA (Fase 3).
 * Sem I/O. Ausência de dado ≠ fato negativo.
 */

export const REVIEW_OBSERVATION_CLASSIFICATIONS = [
  "system_fact",
  "leader_observation",
  "ai_suggestion",
  "unconfirmed",
] as const;

export type ReviewObservationClassification =
  (typeof REVIEW_OBSERVATION_CLASSIFICATIONS)[number];

export const REVIEW_SCOPES = ["person", "team"] as const;
export type ReviewScope = (typeof REVIEW_SCOPES)[number];

export const REVIEW_STATUSES = [
  "in_progress",
  "draft_ready",
  "approved",
  "rejected",
  "archived",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const DRAFT_STATUSES = ["draft", "edited", "approved", "rejected"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

/** Temas da entrevista — uma pergunta por vez; pular se já coberto. */
export const INTERVIEW_TOPICS = [
  { id: "desempenho_geral", label: "Desempenho geral" },
  { id: "servicos_destaque", label: "Serviços bem executados" },
  { id: "evolucao_tecnica", label: "Evolução técnica" },
  { id: "problemas_dificeis", label: "Problemas difíceis resolvidos" },
  { id: "necessidade_ajuda", label: "Necessidade de ajuda" },
  { id: "dificuldades", label: "Dificuldades" },
  { id: "erros", label: "Erros" },
  { id: "retrabalho", label: "Retrabalho e causa" },
  { id: "organizacao", label: "Organização" },
  { id: "procedimentos", label: "Cumprimento de procedimentos" },
  { id: "trabalho_equipe", label: "Trabalho em equipe" },
  { id: "iniciativa", label: "Iniciativa" },
  { id: "reconhecimento", label: "Habilidades a reconhecer" },
  { id: "treinamento", label: "Treinamento sugerido" },
  { id: "metas_proxima", label: "Metas da próxima semana" },
] as const;

export type InterviewTopicId = (typeof INTERVIEW_TOPICS)[number]["id"];

export type WeeklyDraftFields = {
  weekSummary: string;
  strengths: string;
  difficulties: string;
  observedSkills: string;
  evolution: string;
  recommendedActions: string;
  proposedGoals: string;
  followUps: string;
};

export const EMPTY_WEEKLY_DRAFT: WeeklyDraftFields = {
  weekSummary: "",
  strengths: "",
  difficulties: "",
  observedSkills: "",
  evolution: "",
  recommendedActions: "",
  proposedGoals: "",
  followUps: "",
};

export function isReviewObservationClassification(
  v: unknown
): v is ReviewObservationClassification {
  return (
    typeof v === "string" &&
    (REVIEW_OBSERVATION_CLASSIFICATIONS as readonly string[]).includes(v)
  );
}

/** Hipótese/sugestão da IA nunca vira fato do sistema. */
export function promoteClassification(
  from: ReviewObservationClassification,
  to: ReviewObservationClassification
): ReviewObservationClassification | null {
  if (from === to) return from;
  // Só o líder (ou confirmação explícita) eleva unconfirmed/ai → leader_observation.
  if (
    (from === "ai_suggestion" || from === "unconfirmed") &&
    to === "leader_observation"
  ) {
    return "leader_observation";
  }
  // Nunca promover artificialmente a system_fact.
  if (to === "system_fact") return null;
  return null;
}

export function computeInterviewProgress(topicsCovered: string[]): {
  covered: string[];
  remaining: string[];
  progressPct: number;
} {
  const known = new Set<string>(INTERVIEW_TOPICS.map((t) => t.id));
  const covered = [
    ...new Set(
      topicsCovered
        .map((t) => String(t).trim())
        .filter((t) => known.has(t))
    ),
  ];
  const remaining = INTERVIEW_TOPICS.map((t) => t.id).filter((id) => !covered.includes(id));
  const total = INTERVIEW_TOPICS.length || 1;
  const progressPct = Math.round((covered.length / total) * 100);
  return { covered, remaining, progressPct };
}

/** Semana ISO (seg–dom) em America/Sao_Paulo aproximada via offset local do host. */
export function defaultWeekBounds(now = new Date()): { weekFrom: string; weekTo: string } {
  const d = new Date(now);
  const day = d.getDay(); // 0=dom
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diffToMon);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const iso = (x: Date) => {
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const dd = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  return { weekFrom: iso(mon), weekTo: iso(sun) };
}

export function draftFieldsFromUnknown(raw: unknown): WeeklyDraftFields {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const s = (k: keyof WeeklyDraftFields, alt?: string) =>
    String(o[k] ?? (alt ? o[alt] : "") ?? "").trim();
  return {
    weekSummary: s("weekSummary", "week_summary"),
    strengths: s("strengths"),
    difficulties: s("difficulties"),
    observedSkills: s("observedSkills", "observed_skills"),
    evolution: s("evolution"),
    recommendedActions: s("recommendedActions", "recommended_actions"),
    proposedGoals: s("proposedGoals", "proposed_goals"),
    followUps: s("followUps", "follow_ups"),
  };
}

/**
 * Detecta temas já suficientemente cobertos por observações do líder
 * (heurística simples por palavras-chave — a IA também usa tools).
 */
export function inferCoveredTopicsFromText(texts: string[]): InterviewTopicId[] {
  const blob = texts.join("\n").toLowerCase();
  const hits: InterviewTopicId[] = [];
  const rules: Array<{ id: InterviewTopicId; keys: string[] }> = [
    { id: "desempenho_geral", keys: ["desempenho", "trabalhou bem", "semana"] },
    { id: "servicos_destaque", keys: ["serviço", "destaque", "bem execut"] },
    { id: "evolucao_tecnica", keys: ["evolução", "evolucao", "melhorou", "técnic"] },
    { id: "problemas_dificeis", keys: ["difícil", "dificil", "complexo", "complicado"] },
    { id: "necessidade_ajuda", keys: ["ajuda", "orientação", "orientacao", "autonomia"] },
    { id: "dificuldades", keys: ["dificuldade", "travou", "demorou"] },
    { id: "erros", keys: ["erro", "falha", "equivocou"] },
    { id: "retrabalho", keys: ["retrabalho", "refazer", "garantia"] },
    { id: "organizacao", keys: ["organiza"] },
    { id: "procedimentos", keys: ["procedimento", "checklist", "padrão", "padrao"] },
    { id: "trabalho_equipe", keys: ["equipe", "colegas", "colabor"] },
    { id: "iniciativa", keys: ["iniciativa", "proativ"] },
    { id: "reconhecimento", keys: ["reconhec", "habilidade", "ponto forte"] },
    { id: "treinamento", keys: ["treinament", "curso", "capacita"] },
    { id: "metas_proxima", keys: ["meta", "próxima semana", "proxima semana"] },
  ];
  for (const r of rules) {
    if (r.keys.some((k) => blob.includes(k))) hits.push(r.id);
  }
  return hits;
}

export const MANAGERIAL_INTERVIEW_SYSTEM_ADDENDUM = `Modo: Revisão Semanal Gerencial (Radar de Qualidade).
Você conversa com o LÍDER de pátio — nunca com o mecânico avaliado.
Objetivo: organizar informações para acompanhamento; NÃO substituir julgamento humano.
NÃO recomende punições, aumentos ou promoções como decisão automática.
NÃO invente ocorrências, competências, notas ou fatos.
NÃO infira características pessoais sensíveis.

Classificação obrigatória em cada afirmação:
- FATO DO SISTEMA: só o que veio de tools (cite a fonte).
- OBSERVAÇÃO DO LÍDER: o que o líder declarou nesta conversa.
- SUGESTÃO DA IA: interpretação sua — deixe explícito que é sugestão.
- NÃO CONFIRMADO: hipótese ou lacuna — peça confirmação.

Condução:
1) Consulte tools do Radar antes de resumir a semana.
2) Resumo objetivo do que existe; diga o que está incompleto.
3) Uma pergunta por vez, natural, contextualizada.
4) Não repita temas já cobertos com resposta suficiente.
5) Aprofunde respostas vagas só quando necessário.
6) Separe Pátio (vehicle) e Laboratório (module).
7) Ao encerrar, proponha rascunho estruturado (resumo, pontos fortes, dificuldades, habilidades, evolução, ações, metas, acompanhamentos) para o líder editar/aprovar — nunca salve avaliação subjetiva como definitiva.`;
