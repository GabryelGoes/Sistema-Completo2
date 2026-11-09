/** Espelha canViewProactiveIntelligence no cliente (só para exibir UI). */

export function clientCanViewProactiveIntelligence(input: {
  role?: string | null;
  /** Mantido por compatibilidade; não bloqueia sozinho (igual ao servidor). */
  isTechnician?: boolean | null;
  permissions?: Record<string, boolean> | null;
}): boolean {
  if (input.role === "admin") return true;
  if (input.role !== "user") return false;
  const p = input.permissions || {};
  return (
    p.full_access === true ||
    p.access_radar_qualidade === true ||
    p.access_patio === true ||
    p.access_laboratorio === true ||
    p.access_estoque_pecas === true
  );
}
