import type { RdaToolDefinition } from "../types.js";

/**
 * Registry em memória de tools autorizáveis.
 * Fase 0: registry de produção inicia vazio (nenhuma tool de dados reais).
 */
export class RdaToolRegistry {
  private readonly tools = new Map<string, RdaToolDefinition>();

  register(tool: RdaToolDefinition): void {
    const id = String(tool.id || "").trim();
    if (!id) throw new Error("RDA tool id inválido.");
    if (this.tools.has(id)) {
      throw new Error(`RDA tool já registrada: ${id}`);
    }
    this.tools.set(id, {
      ...tool,
      id,
      enabled: tool.enabled !== false,
    });
  }

  /** Substitui/atualiza (útil em testes). */
  upsert(tool: RdaToolDefinition): void {
    const id = String(tool.id || "").trim();
    if (!id) throw new Error("RDA tool id inválido.");
    this.tools.set(id, {
      ...tool,
      id,
      enabled: tool.enabled !== false,
    });
  }

  get(id: string): RdaToolDefinition | undefined {
    return this.tools.get(String(id || "").trim());
  }

  has(id: string): boolean {
    return this.tools.has(String(id || "").trim());
  }

  list(options?: { includeDisabled?: boolean }): RdaToolDefinition[] {
    const all = [...this.tools.values()].sort((a, b) => a.id.localeCompare(b.id));
    if (options?.includeDisabled) return all;
    return all.filter((t) => t.enabled !== false);
  }

  clear(): void {
    this.tools.clear();
  }

  get size(): number {
    return this.tools.size;
  }
}

/** Registry singleton de produção (vazio na Fase 0). */
export const productionRdaToolRegistry = new RdaToolRegistry();

/** Cria registry isolado (testes / sandboxes). */
export function createRdaToolRegistry(): RdaToolRegistry {
  return new RdaToolRegistry();
}
