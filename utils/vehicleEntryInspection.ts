/**
 * Checklist versionado de Inspeção de Entrada do veículo.
 * Registro simples das condições de chegada — sem bloqueios nem autorização.
 * Definição imutável por versão — inspeções antigas usam o snapshot gravado.
 */

export const VEHICLE_ENTRY_CHECKLIST_ID = "vehicle_entry_inspection" as const;
/** Modelo atual (17 perguntas). Inspeções antigas permanecem na v1 via snapshot. */
export const VEHICLE_ENTRY_CHECKLIST_VERSION = 2 as const;

export type EntryInspectionStatus = "pending" | "in_progress" | "completed";

/** Mantido no schema/API por compatibilidade; a UI não usa mais bloqueio/rodagem. */
export type EntryRoadTestStatus =
  | "not_requested"
  | "blocked"
  | "cleared"
  | "performed";

export type EntryAnswerValue =
  | "sim"
  | "nao"
  | "normal"
  | "anormal"
  | "baixo"
  | "bom"
  | "escurecido"
  | "contaminado"
  | "acesa"
  | "apagada"
  | "intermitente"
  | "rodando"
  | "guincho"
  | "nao_verificado"
  | "nao_aplicavel"
  | "nao_equipado";

export type EntryQuestionGroup =
  | "condicoes_gerais"
  | "sistema_freios"
  | "sistema_abs"
  | "registro";

export type EntryQuestionDef = {
  id: string;
  group: EntryQuestionGroup;
  order: number;
  prompt: string;
  options: readonly EntryAnswerValue[];
  /**
   * Campos legados no snapshot (v1). Na v2 ficam vazios/false —
   * o checklist não bloqueia nem exige justificativa.
   */
  anomalyValues: readonly EntryAnswerValue[];
  criticalValues: readonly EntryAnswerValue[];
  requireJustificationIfUnchecked: boolean;
};

export type EntryAnswerRecord = {
  value: EntryAnswerValue | null;
  note?: string | null;
  answeredAt?: string | null;
};

export type EntryQuestionSnapshot = {
  id: string;
  group: EntryQuestionGroup;
  order: number;
  prompt: string;
  options: EntryAnswerValue[];
  anomalyValues: EntryAnswerValue[];
  criticalValues: EntryAnswerValue[];
  requireJustificationIfUnchecked: boolean;
};

export type EntryInspectionAnswers = Record<string, EntryAnswerRecord>;

export const ENTRY_ANSWER_LABELS: Record<EntryAnswerValue, string> = {
  sim: "Sim",
  nao: "Não",
  normal: "Normal",
  anormal: "Anormal",
  baixo: "Baixo",
  bom: "Bom",
  escurecido: "Escurecido",
  contaminado: "Contaminado",
  acesa: "Acesa",
  apagada: "Apagada",
  intermitente: "Intermitente",
  rodando: "Rodando",
  guincho: "Guincho",
  nao_verificado: "Não verificado",
  nao_aplicavel: "Não aplicável",
  nao_equipado: "Não equipado",
};

export const ENTRY_GROUP_LABELS: Record<EntryQuestionGroup, string> = {
  condicoes_gerais: "Condições gerais",
  sistema_freios: "Freios",
  sistema_abs: "ABS e painel",
  registro: "Registro",
};

export const ENTRY_STATUS_LABELS: Record<EntryInspectionStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluído",
};

export const ENTRY_ROAD_TEST_LABELS: Record<EntryRoadTestStatus, string> = {
  not_requested: "Não solicitado",
  blocked: "Bloqueado — condição crítica",
  cleared: "Liberado para avaliação",
  performed: "Realizado (confirmado)",
};

const NONE = [] as const satisfies readonly EntryAnswerValue[];

const YES_NO_NV = ["sim", "nao", "nao_verificado"] as const satisfies readonly EntryAnswerValue[];
const YES_NO_NV_NA = [
  "sim",
  "nao",
  "nao_verificado",
  "nao_aplicavel",
] as const satisfies readonly EntryAnswerValue[];
const NORMAL_ANORMAL_NV = [
  "normal",
  "anormal",
  "nao_verificado",
] as const satisfies readonly EntryAnswerValue[];
const FLUID_LEVEL = [
  "normal",
  "baixo",
  "nao_verificado",
  "nao_aplicavel",
] as const satisfies readonly EntryAnswerValue[];
const LAMP_V1 = [
  "acesa",
  "apagada",
  "nao_verificado",
  "nao_aplicavel",
] as const satisfies readonly EntryAnswerValue[];
const YES_NO = ["sim", "nao"] as const satisfies readonly EntryAnswerValue[];
const YES_NO_NA = ["sim", "nao", "nao_aplicavel"] as const satisfies readonly EntryAnswerValue[];

const ARRIVAL = ["rodando", "guincho", "nao_verificado"] as const satisfies readonly EntryAnswerValue[];
const FLUID_LEVEL_V2 = ["normal", "baixo", "nao_verificado"] as const satisfies readonly EntryAnswerValue[];
/** Estado visual do fluido — não é análise laboratorial. */
const FLUID_STATE = [
  "bom",
  "escurecido",
  "contaminado",
  "nao_verificado",
] as const satisfies readonly EntryAnswerValue[];
const PANEL_LAMP = [
  "apagada",
  "acesa",
  "intermitente",
  "nao_verificado",
] as const satisfies readonly EntryAnswerValue[];
const TPMS_LAMP = [
  "apagada",
  "acesa",
  "intermitente",
  "nao_verificado",
  "nao_equipado",
] as const satisfies readonly EntryAnswerValue[];

function q(
  partial: Omit<
    EntryQuestionDef,
    "anomalyValues" | "criticalValues" | "requireJustificationIfUnchecked"
  >
): EntryQuestionDef {
  return {
    ...partial,
    anomalyValues: NONE,
    criticalValues: NONE,
    requireJustificationIfUnchecked: false,
  };
}

/** Modelo v1 — congelado; inspeções antigas usam o snapshot gravado. */
export const VEHICLE_ENTRY_QUESTIONS_V1: readonly EntryQuestionDef[] = [
  {
    id: "ext_damage",
    group: "condicoes_gerais",
    order: 1,
    prompt: "Avarias externas visíveis?",
    options: YES_NO_NV,
    anomalyValues: ["sim"],
    criticalValues: [],
    requireJustificationIfUnchecked: false,
  },
  {
    id: "underbody_leak",
    group: "condicoes_gerais",
    order: 2,
    prompt: "Vazamentos aparentes sob o veículo?",
    options: YES_NO_NV,
    anomalyValues: ["sim"],
    criticalValues: [],
    requireJustificationIfUnchecked: false,
  },
  {
    id: "warning_lights",
    group: "condicoes_gerais",
    order: 3,
    prompt: "Luzes de advertência acesas?",
    options: YES_NO_NV,
    anomalyValues: ["sim"],
    criticalValues: [],
    requireJustificationIfUnchecked: false,
  },
  {
    id: "brake_pedal",
    group: "sistema_freios",
    order: 4,
    prompt: "Funcionamento do pedal de freio.",
    options: NORMAL_ANORMAL_NV,
    anomalyValues: ["anormal"],
    criticalValues: ["anormal"],
    requireJustificationIfUnchecked: true,
  },
  {
    id: "brake_noise",
    group: "sistema_freios",
    order: 5,
    prompt: "Ruídos durante a frenagem.",
    options: YES_NO_NV_NA,
    anomalyValues: ["sim"],
    criticalValues: [],
    requireJustificationIfUnchecked: false,
  },
  {
    id: "brake_performance",
    group: "sistema_freios",
    order: 6,
    prompt: "Frenagem insuficiente, travamento ou desvio de trajetória.",
    options: YES_NO_NV_NA,
    anomalyValues: ["sim"],
    criticalValues: ["sim"],
    requireJustificationIfUnchecked: true,
  },
  {
    id: "brake_fluid_level",
    group: "sistema_freios",
    order: 7,
    prompt: "Nível do fluido de freio.",
    options: FLUID_LEVEL,
    anomalyValues: ["baixo"],
    criticalValues: [],
    requireJustificationIfUnchecked: false,
  },
  {
    id: "hydraulic_leak",
    group: "sistema_freios",
    order: 8,
    prompt: "Vazamentos no sistema hidráulico.",
    options: YES_NO_NV,
    anomalyValues: ["sim"],
    criticalValues: ["sim"],
    requireJustificationIfUnchecked: true,
  },
  {
    id: "abs_warning_light",
    group: "sistema_abs",
    order: 9,
    prompt: "Luz de anomalia do ABS.",
    options: LAMP_V1,
    anomalyValues: ["acesa"],
    criticalValues: [],
    requireJustificationIfUnchecked: false,
  },
  {
    id: "stability_warning_light",
    group: "sistema_abs",
    order: 10,
    prompt: "Luz de anomalia do controle de estabilidade/frenagem.",
    options: LAMP_V1,
    anomalyValues: ["acesa"],
    criticalValues: [],
    requireJustificationIfUnchecked: false,
  },
  {
    id: "abs_behavior_report",
    group: "sistema_abs",
    order: 11,
    prompt: "Relato de acionamento indevido ou ausência de atuação do ABS.",
    options: YES_NO_NV_NA,
    anomalyValues: ["sim"],
    criticalValues: [],
    requireJustificationIfUnchecked: false,
  },
  {
    id: "prior_abs_intervention",
    group: "sistema_abs",
    order: 12,
    prompt: "Sinais de intervenção anterior no módulo, tubulações ou chicotes.",
    options: YES_NO_NV_NA,
    anomalyValues: ["sim"],
    criticalValues: [],
    requireJustificationIfUnchecked: false,
  },
  {
    id: "client_complaint_recorded",
    group: "registro",
    order: 13,
    prompt: "Queixa do cliente registrada.",
    options: YES_NO,
    anomalyValues: ["nao"],
    criticalValues: [],
    requireJustificationIfUnchecked: false,
  },
  {
    id: "anomaly_photos_documented",
    group: "registro",
    order: 14,
    prompt: "Fotografias das anomalias documentadas.",
    options: YES_NO_NA,
    anomalyValues: ["nao"],
    criticalValues: [],
    requireJustificationIfUnchecked: false,
  },
] as const;

/** Modelo v2 — registro simples das condições de chegada (17 perguntas). */
export const VEHICLE_ENTRY_QUESTIONS_V2: readonly EntryQuestionDef[] = [
  q({
    id: "arrival_mode",
    group: "condicoes_gerais",
    order: 1,
    prompt: "Chegada do veículo.",
    options: ARRIVAL,
  }),
  q({
    id: "ext_damage",
    group: "condicoes_gerais",
    order: 2,
    prompt: "Avarias externas visíveis?",
    options: YES_NO_NV,
  }),
  q({
    id: "underbody_leak",
    group: "condicoes_gerais",
    order: 3,
    prompt: "Vazamentos aparentes sob o veículo?",
    options: YES_NO_NV,
  }),
  q({
    id: "misalignment",
    group: "condicoes_gerais",
    order: 4,
    prompt: "Desalinhamento aparente?",
    options: YES_NO_NV,
  }),
  q({
    id: "brake_pedal",
    group: "sistema_freios",
    order: 5,
    prompt: "Funcionamento do pedal de freio.",
    options: NORMAL_ANORMAL_NV,
  }),
  q({
    id: "brake_behavior",
    group: "sistema_freios",
    order: 6,
    prompt: "Comportamento da frenagem.",
    options: NORMAL_ANORMAL_NV,
  }),
  q({
    id: "brake_noise",
    group: "sistema_freios",
    order: 7,
    prompt: "Ruídos durante a frenagem?",
    options: YES_NO_NV,
  }),
  q({
    id: "brake_fluid_level",
    group: "sistema_freios",
    order: 8,
    prompt: "Nível do fluido de freio.",
    options: FLUID_LEVEL_V2,
  }),
  q({
    id: "brake_fluid_state",
    group: "sistema_freios",
    order: 9,
    prompt: "Estado visual do fluido de freio.",
    options: FLUID_STATE,
  }),
  q({
    id: "hydraulic_leak",
    group: "sistema_freios",
    order: 10,
    prompt: "Vazamentos no sistema hidráulico?",
    options: YES_NO_NV,
  }),
  q({
    id: "abs_warning_light",
    group: "sistema_abs",
    order: 11,
    prompt: "Luz do ABS.",
    options: PANEL_LAMP,
  }),
  q({
    id: "stability_warning_light",
    group: "sistema_abs",
    order: 12,
    prompt: "Luz de estabilidade/controle de frenagem.",
    options: PANEL_LAMP,
  }),
  q({
    id: "airbag_srs_light",
    group: "sistema_abs",
    order: 13,
    prompt: "Luz do Airbag/SRS.",
    options: PANEL_LAMP,
  }),
  q({
    id: "injection_light",
    group: "sistema_abs",
    order: 14,
    prompt: "Luz de injeção eletrônica.",
    options: PANEL_LAMP,
  }),
  q({
    id: "tpms_light",
    group: "sistema_abs",
    order: 15,
    prompt: "Luz do TPMS (pressão dos pneus).",
    options: TPMS_LAMP,
  }),
  q({
    id: "abs_behavior_report",
    group: "sistema_abs",
    order: 16,
    prompt: "Relato de funcionamento anormal do ABS?",
    options: YES_NO_NV,
  }),
  q({
    id: "prior_abs_intervention",
    group: "sistema_abs",
    order: 17,
    prompt: "Sinais de intervenção anterior no módulo, tubulações ou chicotes?",
    options: YES_NO_NV,
  }),
] as const;

export function getVehicleEntryQuestions(
  version: number = VEHICLE_ENTRY_CHECKLIST_VERSION
): readonly EntryQuestionDef[] {
  if (version === 1) return VEHICLE_ENTRY_QUESTIONS_V1;
  if (version === 2) return VEHICLE_ENTRY_QUESTIONS_V2;
  // Desconhecida: usa o modelo atual.
  return VEHICLE_ENTRY_QUESTIONS_V2;
}

export function snapshotVehicleEntryQuestions(
  version: number = VEHICLE_ENTRY_CHECKLIST_VERSION
): EntryQuestionSnapshot[] {
  return getVehicleEntryQuestions(version).map((item) => ({
    id: item.id,
    group: item.group,
    order: item.order,
    prompt: item.prompt,
    options: [...item.options],
    anomalyValues: [...item.anomalyValues],
    criticalValues: [...item.criticalValues],
    requireJustificationIfUnchecked: item.requireJustificationIfUnchecked,
  }));
}

export function resolveQuestionDefs(
  snapshot: EntryQuestionSnapshot[] | null | undefined,
  version: number = VEHICLE_ENTRY_CHECKLIST_VERSION
): EntryQuestionSnapshot[] {
  if (Array.isArray(snapshot) && snapshot.length > 0) return snapshot;
  return snapshotVehicleEntryQuestions(version);
}

export function isEntryAnswerValue(v: unknown): v is EntryAnswerValue {
  return typeof v === "string" && v in ENTRY_ANSWER_LABELS;
}

export type EntrySafetyFinding = {
  questionId: string;
  prompt: string;
  value: EntryAnswerValue;
  kind: "critical" | "anomaly" | "needs_justification";
  message: string;
};

/**
 * Compatibilidade: não bloqueia diagnóstico/OS/rodagem e não exige justificativa.
 * Mantido para não quebrar callers; sempre retorna sem impedimentos.
 */
export function evaluateEntryInspectionSafety(_input: {
  questions: EntryQuestionSnapshot[];
  answers: EntryInspectionAnswers;
}): {
  findings: EntrySafetyFinding[];
  criticalFindings: EntrySafetyFinding[];
  anomalyFindings: EntrySafetyFinding[];
  missingJustifications: EntrySafetyFinding[];
  anomalySummary: string[];
  blocksRoadTest: boolean;
} {
  return {
    findings: [],
    criticalFindings: [],
    anomalyFindings: [],
    missingJustifications: [],
    anomalySummary: [],
    blocksRoadTest: false,
  };
}

export function computeEntryInspectionProgress(input: {
  questions: EntryQuestionSnapshot[];
  answers: EntryInspectionAnswers;
}): { answered: number; total: number; percent: number } {
  const total = input.questions.length;
  const answered = input.questions.filter((item) => {
    const v = input.answers[item.id]?.value;
    return !!v && isEntryAnswerValue(v);
  }).length;
  const percent = total === 0 ? 0 : Math.round((answered / total) * 100);
  return { answered, total, percent };
}

export function deriveEntryInspectionStatus(input: {
  answers: EntryInspectionAnswers;
  questions: EntryQuestionSnapshot[];
  explicitStatus?: EntryInspectionStatus | null;
}): EntryInspectionStatus {
  if (input.explicitStatus === "completed") return "completed";
  const { answered, total } = computeEntryInspectionProgress(input);
  if (answered === 0) return "pending";
  if (answered >= total) return "completed";
  return "in_progress";
}

/** Compat: nunca bloqueia. */
export function deriveRoadTestStatus(input: {
  blocksRoadTest: boolean;
  criticalCleared: boolean;
  roadTestPerformed: boolean;
}): EntryRoadTestStatus {
  if (input.roadTestPerformed) return "performed";
  return "not_requested";
}

export type EntrySaveValidation =
  | { ok: true }
  | { ok: false; error: string; code: string };

/** Valida payload de respostas contra o snapshot (não contra o modelo atual). */
export function validateEntryAnswersPayload(input: {
  questions: EntryQuestionSnapshot[];
  answers: EntryInspectionAnswers;
  requireComplete?: boolean;
}): EntrySaveValidation {
  for (const [qid, rec] of Object.entries(input.answers || {})) {
    const question = input.questions.find((x) => x.id === qid);
    if (!question) {
      return { ok: false, error: `Pergunta desconhecida neste checklist: ${qid}`, code: "unknown_question" };
    }
    if (rec?.value == null) continue;
    if (!isEntryAnswerValue(rec.value) || !question.options.includes(rec.value)) {
      return {
        ok: false,
        error: `Resposta inválida para “${question.prompt}”.`,
        code: "invalid_answer",
      };
    }
  }

  if (input.requireComplete) {
    for (const question of input.questions) {
      const v = input.answers[question.id]?.value;
      if (!v) {
        return {
          ok: false,
          error: `Responda: ${question.prompt}`,
          code: "incomplete",
        };
      }
    }
  }

  return { ok: true };
}

/** Compat: confirmação de rodagem não é mais usada na UI; nunca bloqueia por crítico. */
export function canConfirmRoadTestPerformed(input: {
  blocksRoadTest: boolean;
  criticalCleared: boolean;
  confirm: boolean;
}): EntrySaveValidation {
  if (!input.confirm) {
    return {
      ok: false,
      error: "Confirme explicitamente que o teste de rodagem foi realizado.",
      code: "road_test_unconfirmed",
    };
  }
  return { ok: true };
}

/** Merge parcial de respostas (não apaga chaves omitidas). */
export function mergeEntryAnswers(
  current: EntryInspectionAnswers,
  patch: EntryInspectionAnswers,
  nowIso: string
): EntryInspectionAnswers {
  const next: EntryInspectionAnswers = { ...current };
  for (const [id, rec] of Object.entries(patch || {})) {
    if (!rec || typeof rec !== "object") continue;
    const prev = next[id] || { value: null };
    next[id] = {
      value: rec.value === undefined ? prev.value : rec.value,
      note: rec.note === undefined ? prev.note ?? null : rec.note,
      answeredAt: nowIso,
    };
  }
  return next;
}

export function normalizeAnswersFromUnknown(raw: unknown): EntryInspectionAnswers {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: EntryInspectionAnswers = {};
  for (const [id, rec] of Object.entries(raw as Record<string, unknown>)) {
    if (!rec || typeof rec !== "object" || Array.isArray(rec)) continue;
    const r = rec as Record<string, unknown>;
    const value = r.value == null ? null : isEntryAnswerValue(r.value) ? r.value : null;
    out[id] = {
      value,
      note: typeof r.note === "string" ? r.note : r.note == null ? null : String(r.note),
      answeredAt: typeof r.answeredAt === "string" ? r.answeredAt : null,
    };
  }
  return out;
}
