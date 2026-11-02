import type { RdaSystemEvent } from "../types.js";
import { resolveRdaIntelligenceEnabled } from "../featureFlag.js";

export type RdaEventHandler = (event: RdaSystemEvent) => void | Promise<void>;

/**
 * Barramento in-memory. Com feature off, publish é no-op (não dispara handlers).
 * Fase 0: sem fila persistente, sem jobs, sem notificações.
 */
export class RdaEventBus {
  private readonly handlers = new Map<string, Set<RdaEventHandler>>();
  private readonly allHandlers = new Set<RdaEventHandler>();

  on(kind: RdaSystemEvent["kind"] | "*", handler: RdaEventHandler): () => void {
    if (kind === "*") {
      this.allHandlers.add(handler);
      return () => {
        this.allHandlers.delete(handler);
      };
    }
    let set = this.handlers.get(kind);
    if (!set) {
      set = new Set();
      this.handlers.set(kind, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  }

  async publish(
    event: RdaSystemEvent,
    options?: { featureEnabled?: boolean; settingValue?: string | null; envValue?: string | null }
  ): Promise<{ accepted: boolean; delivered: number }> {
    const enabled =
      typeof options?.featureEnabled === "boolean"
        ? options.featureEnabled
        : resolveRdaIntelligenceEnabled({
            settingValue: options?.settingValue,
            envValue: options?.envValue,
          });
    if (!enabled) return { accepted: false, delivered: 0 };

    const targeted = this.handlers.get(event.kind);
    const list = [
      ...(targeted ? [...targeted] : []),
      ...this.allHandlers,
    ];
    let delivered = 0;
    for (const h of list) {
      await h(event);
      delivered += 1;
    }
    return { accepted: true, delivered };
  }

  clear(): void {
    this.handlers.clear();
    this.allHandlers.clear();
  }
}

export const productionRdaEventBus = new RdaEventBus();

export function createRdaEventBus(): RdaEventBus {
  return new RdaEventBus();
}

export function createRdaSystemEvent(
  kind: RdaSystemEvent["kind"],
  payload: Record<string, unknown> = {},
  workshopId?: string
): RdaSystemEvent {
  return {
    id: `rda_evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    workshopId,
    occurredAt: new Date().toISOString(),
    payload,
  };
}
