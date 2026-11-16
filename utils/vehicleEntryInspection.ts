/**
 * Checklist versionado de Inspeção de Entrada do veículo.
 * Definição imutável por versão — inspeções antigas usam o snapshot gravado.
 */

export const VEHICLE_ENTRY_CHECKLIST_ID = "vehicle_entry_inspection" as const;
export const VEHICLE_ENTRY_CHECKLIST_VERSION = 1 as const;

export type EntryInspectionStatus = "pending" | "in_progress" | "completed";

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
  | "acesa"
  | "apagada"
  | "nao_verificado"
  | "nao_aplicavel";

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
  /** Respostas que indicam anomalia (resumo na ficha). */
  anomalyValues: readonly EntryAnswerValue[];
  /** Respostas que bloqueiam teste de rodagem até avaliação técnica. */
  criticalValues: readonly EntryAnswerValue[];
  /** Se true, "nao_verificado" exige justificativa. */
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
  acesa: "Acesa",
  apagada: "Apagada",
  nao_verificado: "Não verificado",
  nao_aplicavel: "Não aplicável",
};

export const ENTRY_GROUP_LABELS: Record<EntryQuestionGroup, string> = {
  condicoes_gerais: "Condições gerais",
  sistema_freios: "Sistema de freios",
  sistema_abs: "Sistema ABS",
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
const LAMP = [
  "acesa",
  "apagada",
  "nao_verificado",
  "nao_aplicavel",
] as const satisfies readonly EntryAnswerValue[];
const YES_NO = ["sim", "nao"] as const satisfies readonly EntryAnswerValue[];
const YES_NO_NA = ["sim", "nao", "nao_aplicavel"] as const satisfies readonly EntryAnswerValue[];

/** Modelo v1 — não altere itens; crie VEHICLE_ENTRY_CHECKLIST_VERSION = 2. */
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
    options: LAMP,
    anomalyValues: ["acesa"],
    criticalValues: [],
    requireJustificationIfUnchecked: false,
  },
  {
    id: "stability_warning_light",
    group: "sistema_abs",
    order: 10,
    prompt: "Luz de anomalia do controle de estabilidade/frenagem.",
    options: LAMP,
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

export function getVehicleEntryQuestions(
  version: number = VEHICLE_ENTRY_CHECKLIST_VERSION
): readonly EntryQuestionDef[] {
  if (version === 1) return VEHICLE_ENTRY_QUESTIONS_V1;
  // Versões futuras: retornar o snapshot embutido; desconhecidas caem na v1 só para leitura de labels.
  return VEHICLE_ENTRY_QUESTIONS_V1;
}

export function snapshotVehicleEntryQuestions(
  version: number = VEHICLE_ENTRY_CHECKLIST_VERSION
): EntryQuestionSnapshot[] {
  return getVehicleEntryQuestions(version).map((q) => ({
    id: q.id,
    group: q.group,
    order: q.order,
    prompt: q.prompt,
    options: [...q.options],
    anomalyValues: [...q.anomalyValues],
    criticalValues: [...q.criticalValues],
    requireJustificationIfUnchecked: q.requireJustificationIfUnchecked,
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

export function evaluateEntryInspectionSafety(input: {
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
  const findings: EntrySafetyFinding[] = [];
  for (const q of input.questions) {
    const ans = input.answers[q.id];
    const value = ans?.value ?? null;
    if (!value) continue;

    if (q.criticalValues.includes(value)) {
      findings.push({
        questionId: q.id,
        prompt: q.prompt,
        value,
        kind: "critical",
        message: `Condição crítica: ${q.prompt} → ${ENTRY_ANSWER_LABELS[value]}`,
      });
    } else if (q.anomalyValues.includes(value)) {
      findings.push({
        questionId: q.id,
        prompt: q.prompt,
        value,
        kind: "anomaly",
        message: `${q.prompt} → ${ENTRY_ANSWER_LABELS[value]}`,
      });
    }

    if (
      q.requireJustificationIfUnchecked &&
      value === "nao_verificado" &&
      !(ans?.note || "").trim()
    ) {
      findings.push({
        questionId: q.id,
        prompt: q.prompt,
        value,
        kind: "needs_justification",
        message: `Justificativa obrigatória: ${q.prompt} (não verificado)`,
      });
    }
  }

  const criticalFindings = findings.filter((f) => f.kind === "critical");
  const anomalyFindings = findings.filter((f) => f.kind === "anomaly" || f.kind === "critical");
  const missingJustifications = findings.filter((f) => f.kind === "needs_justification");
  const anomalySummary = anomalyFindings.map((f) => f.message);

  return {
    findings,
    criticalFindings,
    anomalyFindings,
    missingJustifications,
    anomalySummary,
    blocksRoadTest: criticalFindings.length > 0,
  };
}

export function computeEntryInspectionProgress(input: {
  questions: EntryQuestionSnapshot[];
  answers: EntryInspectionAnswers;
}): { answered: number; total: number; percent: number } {
  const total = input.questions.length;
  const answered = input.questions.filter((q) => {
    const v = input.answers[q.id]?.value;
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

export function deriveRoadTestStatus(input: {
  blocksRoadTest: boolean;
  criticalCleared: boolean;
  roadTestPerformed: boolean;
}): EntryRoadTestStatus {
  if (input.roadTestPerformed) return "performed";
  if (input.blocksRoadTest && !input.criticalCleared) return "blocked";
  if (input.blocksRoadTest && input.criticalCleared) return "cleared";
  return "cleared";
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
    const q = input.questions.find((x) => x.id === qid);
    if (!q) {
      return { ok: false, error: `Pergunta desconhecida neste checklist: ${qid}`, code: "unknown_question" };
    }
    if (rec?.value == null) continue;
    if (!isEntryAnswerValue(rec.value) || !q.options.includes(rec.value)) {
      return {
        ok: false,
        error: `Resposta inválida para “${q.prompt}”.`,
        code: "invalid_answer",
      };
    }
  }

  const safety = evaluateEntryInspectionSafety(input);
  if (safety.missingJustifications.length > 0) {
    return {
      ok: false,
      error: safety.missingJustifications[0].message,
      code: "justification_required",
    };
  }

  if (input.requireComplete) {
    for (const q of input.questions) {
      const v = input.answers[q.id]?.value;
      if (!v) {
        return {
          ok: false,
          error: `Responda: ${q.prompt}`,
          code: "incomplete",
        };
      }
    }
  }

  return { ok: true };
}

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
  if (input.blocksRoadTest && !input.criticalCleared) {
    return {
      ok: false,
      error:
        "Condições críticas impedem o teste de rodagem até avaliação técnica apropriada.",
      code: "road_test_blocked",
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
