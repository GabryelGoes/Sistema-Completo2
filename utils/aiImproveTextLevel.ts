/**
 * Nível de correção/melhoria de texto com IA (diagnóstico de orçamento, etc.).
 * Persistido em workshop_settings.ai_improve_text_level.
 */

export type AiImproveTextLevel = "light" | "balanced" | "strong";

export const AI_IMPROVE_TEXT_LEVEL_KEY = "ai_improve_text_level" as const;

export const DEFAULT_AI_IMPROVE_TEXT_LEVEL: AiImproveTextLevel = "balanced";

export const AI_IMPROVE_TEXT_LEVELS: Array<{
  id: AiImproveTextLevel;
  label: string;
  hint: string;
}> = [
  {
    id: "light",
    label: "Leve",
    hint: "Corrige erros e deixa mais claro, sem mudar muito a estrutura.",
  },
  {
    id: "balanced",
    label: "Médio",
    hint: "Organiza as ideias e explica melhor o que você escreveu.",
  },
  {
    id: "strong",
    label: "Forte",
    hint: "Reestrutura o texto, deixa bem didático e fácil de entender.",
  },
];

export function normalizeAiImproveTextLevel(raw: unknown): AiImproveTextLevel {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "light" || v === "leve" || v === "1") return "light";
  if (v === "strong" || v === "forte" || v === "3" || v === "high") return "strong";
  if (v === "balanced" || v === "medium" || v === "medio" || v === "médio" || v === "2") {
    return "balanced";
  }
  return DEFAULT_AI_IMPROVE_TEXT_LEVEL;
}

export type AiImproveTextKind = "budget_diagnosis" | "general";

function budgetDiagnosisPrompt(level: AiImproveTextLevel): string {
  const base = `Você ajuda mecânicos a melhorar o diagnóstico escrito em um orçamento automotivo.
Escreva em português do Brasil, tom natural de oficina (claro e direto — sem corporativês).
Preserve os fatos técnicos que o autor citou. Não invente sintomas, peças, causas ou conclusões que não estejam no texto original.
Pode tornar explícito o que já está implícito nas palavras do autor, e organizar a lógica.
Responda APENAS com o texto melhorado, sem aspas, títulos, marcadores de lista ou explicações suas.`;

  if (level === "light") {
    return `${base}

Nível LEVE:
- Corrija português e deixe a frase fluindo.
- Mude o mínimo possível da estrutura e da ordem das ideias.
- Não alongue o texto sem necessidade.`;
  }

  if (level === "strong") {
    return `${base}

Nível FORTE:
- Reorganize as ideias em uma ordem clara (ex.: o que foi observado → o que isso indica → o que precisa ser feito, se já estiver no original).
- Explique com mais clareza o que o autor quis dizer, como se fosse para o cliente ou para a equipe entender rápido.
- Deixe o texto mais completo e didático, sem inventar informação nova.
- Pode usar 2–4 frases curtas ou um parágrafo bem estruturado.`;
  }

  return `${base}

Nível MÉDIO:
- Organize melhor as ideias (deixe a leitura em ordem lógica).
- Explique com mais clareza o que já está escrito, sem inventar fatos.
- Melhore bem a qualidade do texto — não faça só troca de palavras.`;
}

function generalPrompt(level: AiImproveTextLevel): string {
  const base = `Melhore o texto em português do Brasil para ficar mais claro e fácil de entender.
Tom natural e direto, sem formalismo exagerado.
Preserve o sentido; não invente informações.
Responda APENAS com o texto melhorado, sem aspas nem explicações.`;

  if (level === "light") {
    return `${base}

Nível LEVE: corrija e deixe mais claro com mudanças pequenas.`;
  }
  if (level === "strong") {
    return `${base}

Nível FORTE: reorganize as ideias e explique melhor o conteúdo, de forma didática.`;
  }
  return `${base}

Nível MÉDIO: organize as ideias e explique melhor o que já está no texto.`;
}

export function buildAiImproveSystemPrompt(
  kind: AiImproveTextKind,
  level: AiImproveTextLevel
): string {
  return kind === "budget_diagnosis"
    ? budgetDiagnosisPrompt(level)
    : generalPrompt(level);
}

export function aiImproveTemperature(level: AiImproveTextLevel): number {
  if (level === "light") return 0.35;
  if (level === "strong") return 0.55;
  return 0.45;
}

export function aiImproveMaxTokens(level: AiImproveTextLevel): number {
  if (level === "light") return 900;
  if (level === "strong") return 2200;
  return 1600;
}
