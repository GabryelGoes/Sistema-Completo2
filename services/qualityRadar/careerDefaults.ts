/** Catálogo inicial de competências e níveis — seed apenas se a oficina ainda não tiver dados. */

export type DefaultCompetency = {
  code: string;
  name: string;
  description: string;
  kind: "technical" | "professional";
  sortOrder: number;
  rubrics: { level: number; label: string; description: string }[];
};

const LEVEL_LABELS = ["Inicial", "Básico", "Intermediário", "Avançado", "Referência"];

function rubricsFor(name: string): DefaultCompetency["rubrics"] {
  return [1, 2, 3, 4, 5].map((level) => ({
    level,
    label: LEVEL_LABELS[level - 1],
    description:
      level === 1
        ? `Conhece o básico de ${name}; precisa de supervisão constante.`
        : level === 2
          ? `Executa ${name} com supervisão frequente.`
          : level === 3
            ? `Executa ${name} de forma autônoma na maioria dos casos.`
            : level === 4
              ? `Domina ${name} e orienta colegas em situações típicas.`
              : `Referência em ${name}; resolve casos complexos e padroniza boas práticas.`,
  }));
}

export const DEFAULT_COMPETENCIES: DefaultCompetency[] = [
  // Técnicas
  { code: "freios_conv", name: "Sistema de freios convencionais", description: "", kind: "technical", sortOrder: 10, rubrics: rubricsFor("freios convencionais") },
  { code: "diag_abs", name: "Diagnóstico ABS", description: "", kind: "technical", sortOrder: 20, rubrics: rubricsFor("diagnóstico ABS") },
  { code: "reparo_abs", name: "Reparação e substituição de componentes ABS", description: "", kind: "technical", sortOrder: 30, rubrics: rubricsFor("reparo ABS") },
  { code: "sangria", name: "Sangria e procedimentos técnicos", description: "", kind: "technical", sortOrder: 40, rubrics: rubricsFor("sangria") },
  { code: "suspensao", name: "Suspensão", description: "", kind: "technical", sortOrder: 50, rubrics: rubricsFor("suspensão") },
  { code: "scanner", name: "Utilização de scanner", description: "", kind: "technical", sortOrder: 60, rubrics: rubricsFor("uso de scanner") },
  { code: "dtc", name: "Interpretação de códigos DTC", description: "", kind: "technical", sortOrder: 70, rubrics: rubricsFor("interpretação de DTC") },
  { code: "eletrico", name: "Diagnóstico elétrico e eletrônico", description: "", kind: "technical", sortOrder: 80, rubrics: rubricsFor("diagnóstico elétrico") },
  { code: "montagem", name: "Montagem e conferência", description: "", kind: "technical", sortOrder: 90, rubrics: rubricsFor("montagem e conferência") },
  { code: "testes", name: "Testes e validação de serviços", description: "", kind: "technical", sortOrder: 100, rubrics: rubricsFor("testes e validação") },
  // Profissionais
  { code: "organizacao", name: "Organização", description: "", kind: "professional", sortOrder: 110, rubrics: rubricsFor("organização") },
  { code: "comunicacao", name: "Comunicação", description: "", kind: "professional", sortOrder: 120, rubrics: rubricsFor("comunicação") },
  { code: "autonomia", name: "Autonomia", description: "", kind: "professional", sortOrder: 130, rubrics: rubricsFor("autonomia") },
  { code: "iniciativa", name: "Iniciativa", description: "", kind: "professional", sortOrder: 140, rubrics: rubricsFor("iniciativa") },
  { code: "equipe", name: "Trabalho em equipe", description: "", kind: "professional", sortOrder: 150, rubrics: rubricsFor("trabalho em equipe") },
  { code: "procedimentos", name: "Cumprimento de procedimentos", description: "", kind: "professional", sortOrder: 160, rubrics: rubricsFor("procedimentos") },
  { code: "seguranca", name: "Atenção à segurança", description: "", kind: "professional", sortOrder: 170, rubrics: rubricsFor("segurança") },
  { code: "aprendizado", name: "Capacidade de aprendizado", description: "", kind: "professional", sortOrder: 180, rubrics: rubricsFor("aprendizado") },
  { code: "problemas", name: "Resolução de problemas", description: "", kind: "professional", sortOrder: 190, rubrics: rubricsFor("resolução de problemas") },
  { code: "ferramentas", name: "Responsabilidade com ferramentas e materiais", description: "", kind: "professional", sortOrder: 200, rubrics: rubricsFor("cuidado com ferramentas") },
];

export const DEFAULT_CAREER_LEVELS: Array<{
  code: string;
  name: string;
  description: string;
  sortOrder: number;
  /** códigos de competência → nível mínimo sugerido */
  requirements: Record<string, number>;
}> = [
  {
    code: "auxiliar",
    name: "Auxiliar",
    description: "Apoio operacional com supervisão contínua.",
    sortOrder: 10,
    requirements: { freios_conv: 1, organizacao: 2, seguranca: 2, procedimentos: 2 },
  },
  {
    code: "junior",
    name: "Mecânico júnior",
    description: "Executa serviços básicos com supervisão frequente.",
    sortOrder: 20,
    requirements: {
      freios_conv: 2,
      sangria: 2,
      montagem: 2,
      organizacao: 2,
      comunicacao: 2,
      procedimentos: 3,
      seguranca: 3,
    },
  },
  {
    code: "pleno",
    name: "Mecânico pleno",
    description: "Autonomia na maioria dos serviços do dia a dia.",
    sortOrder: 30,
    requirements: {
      freios_conv: 3,
      diag_abs: 3,
      reparo_abs: 3,
      sangria: 3,
      scanner: 3,
      dtc: 3,
      montagem: 3,
      testes: 3,
      autonomia: 3,
      procedimentos: 3,
      seguranca: 3,
    },
  },
  {
    code: "senior",
    name: "Mecânico sênior",
    description: "Casos complexos e orientação de colegas.",
    sortOrder: 40,
    requirements: {
      diag_abs: 4,
      reparo_abs: 4,
      eletrico: 4,
      dtc: 4,
      testes: 4,
      autonomia: 4,
      equipe: 4,
      problemas: 4,
      aprendizado: 4,
    },
  },
  {
    code: "especialista",
    name: "Especialista técnico",
    description: "Referência técnica; padronização e mentoria.",
    sortOrder: 50,
    requirements: {
      diag_abs: 5,
      reparo_abs: 5,
      eletrico: 5,
      problemas: 5,
      aprendizado: 5,
      iniciativa: 4,
      comunicacao: 4,
      equipe: 4,
    },
  },
];

/** Score null/undefined = não avaliado (não é zero). */
export function scoreOrUnrated(score: number | null | undefined): number | null {
  if (score == null) return null;
  if (!Number.isInteger(score) || score < 1 || score > 5) return null;
  return score;
}

export function readinessAgainstRequirements(input: {
  requirements: Array<{ competencyCode: string; minLevel: number }>;
  scoresByCode: Record<string, number | null | undefined>;
}): {
  met: number;
  total: number;
  missing: Array<{ competencyCode: string; minLevel: number; current: number | null }>;
  /** true só quando TODOS os requisitos têm nota e atingem o mínimo */
  ready: boolean;
} {
  const missing: Array<{ competencyCode: string; minLevel: number; current: number | null }> = [];
  let met = 0;
  for (const req of input.requirements) {
    const cur = scoreOrUnrated(input.scoresByCode[req.competencyCode]);
    if (cur != null && cur >= req.minLevel) met += 1;
    else missing.push({ competencyCode: req.competencyCode, minLevel: req.minLevel, current: cur });
  }
  return {
    met,
    total: input.requirements.length,
    missing,
    ready: input.requirements.length > 0 && missing.length === 0,
  };
}
