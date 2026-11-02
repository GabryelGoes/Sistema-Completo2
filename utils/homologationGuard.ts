/**
 * Guardas de ambiente de homologação RDA.
 * Ativado só quando HOMOLOGATION_MODE=true ou HOMOLOGATION_OK=rei-do-abs-homologacao.
 * Nunca altera o comportamento do deploy de produção sem essas flags.
 */

const PROD_SUPABASE_REF_BLOCKLIST = [
  // Ref histórica do projeto de oficina em produção (não usar em homolog).
  "hvxzloicztmwxmtnwfii",
];

export function isHomologationModeEnabled(): boolean {
  const ok = (process.env.HOMOLOGATION_OK || "").trim();
  const mode = String(process.env.HOMOLOGATION_MODE || "").toLowerCase();
  return mode === "true" || ok === "rei-do-abs-homologacao";
}

/**
 * Aborta o boot da API se o alvo for produção ou se a IA estiver ligada.
 * Seguro chamar no createApiApp() — no-op fora do modo homologação.
 */
export function assertHomologationSafeOrThrow(): void {
  if (!isHomologationModeEnabled()) return;

  const url = (process.env.SUPABASE_URL || "").trim().toLowerCase();
  if (!url) {
    throw new Error(
      "[homologação] SUPABASE_URL ausente com HOMOLOGATION_MODE ativo."
    );
  }

  for (const ref of PROD_SUPABASE_REF_BLOCKLIST) {
    if (url.includes(ref)) {
      throw new Error(
        `[homologação] SUPABASE_URL aponta para ref de produção bloqueada (${ref}). ` +
          "Use apenas o projeto rei-do-abs-homologacao."
      );
    }
  }

  if (String(process.env.RDA_INTELLIGENCE_ENABLED || "").toLowerCase() === "true") {
    throw new Error(
      "[homologação] RDA_INTELLIGENCE_ENABLED deve ser false (IA desligada)."
    );
  }
  if (String(process.env.RDA_ALLOW_LLM_CALLS || "").toLowerCase() === "true") {
    throw new Error("[homologação] RDA_ALLOW_LLM_CALLS deve ser false.");
  }
  if ((process.env.OPENAI_API_KEY || "").trim()) {
    throw new Error("[homologação] OPENAI_API_KEY deve ficar vazio.");
  }

  const workshop = (process.env.WORKSHOP_ID || "").trim();
  if (workshop && workshop !== "11111111-1111-4111-8111-111111111111") {
    throw new Error(
      "[homologação] WORKSHOP_ID deve ser o UUID fictício do seed " +
        "(11111111-1111-4111-8111-111111111111)."
    );
  }
}
