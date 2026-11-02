import type { RdaAuditEntry } from "../types.js";

/**
 * Log de auditoria em memória (Fase 0).
 * Sem persistência em banco — só para testes e diagnóstico local.
 * Fase futura: tabela rda_tool_audit_log via migration.
 */
export class RdaMemoryAuditLog {
  private readonly entries: RdaAuditEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries = 500) {
    this.maxEntries = Math.max(1, maxEntries);
  }

  append(entry: Omit<RdaAuditEntry, "id" | "at"> & { id?: string; at?: string }): RdaAuditEntry {
    const full: RdaAuditEntry = {
      id: entry.id || `rda_aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      at: entry.at || new Date().toISOString(),
      actorRole: entry.actorRole,
      actorUserId: entry.actorUserId,
      toolId: entry.toolId,
      eventKind: entry.eventKind,
      allowed: entry.allowed,
      reason: entry.reason,
      detail: entry.detail,
    };
    this.entries.push(full);
    while (this.entries.length > this.maxEntries) this.entries.shift();
    return full;
  }

  list(): RdaAuditEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries.length = 0;
  }
}

export const productionRdaAuditLog = new RdaMemoryAuditLog();
