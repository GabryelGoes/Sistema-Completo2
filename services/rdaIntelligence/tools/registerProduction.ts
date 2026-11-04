import { productionRdaToolRegistry } from "./registry.js";
import { RDA_PRODUCTION_TOOLS } from "./definitions.js";

let registered = false;

/** Registra tools reais (idempotente; upsert garante tools novas após hot-reload). */
export function ensureProductionRdaToolsRegistered(): void {
  for (const tool of RDA_PRODUCTION_TOOLS) {
    productionRdaToolRegistry.upsert(tool);
  }
  registered = true;
}
