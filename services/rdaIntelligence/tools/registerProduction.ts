import { productionRdaToolRegistry } from "./registry.js";
import { RDA_PRODUCTION_TOOLS } from "./definitions.js";

let registered = false;

/** Registra tools reais uma vez (idempotente). */
export function ensureProductionRdaToolsRegistered(): void {
  if (registered) return;
  for (const tool of RDA_PRODUCTION_TOOLS) {
    if (!productionRdaToolRegistry.has(tool.id)) {
      productionRdaToolRegistry.register(tool);
    }
  }
  registered = true;
}
