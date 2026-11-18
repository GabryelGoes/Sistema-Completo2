/**
 * Rode: npx tsx scripts/patioPecasLabel.selftest.ts
 */
import {
  createDefaultPecasOsTemplate,
  createDefaultLabelTemplatesStore,
  labelTemplateUsesKeyOptions,
  normalizeLabelTemplate,
  normalizeLabelTemplatesStore,
  LABEL_TEMPLATE_META,
  LABEL_SAMPLE_DATA,
} from "../utils/labelTemplates.js";
import {
  formatPecasPlateDisplay,
  splitPecasVehicleLines,
} from "../utils/patioPecasLabelRender.js";

let failed = 0;

function ok(label: string, cond: boolean) {
  if (cond) console.log(`  OK  ${label}`);
  else {
    failed += 1;
    console.log(`  FAIL ${label}`);
  }
}

console.log("patioPecasLabel selftest\n");

ok(
  "meta inclui pecas_os",
  LABEL_TEMPLATE_META.some((m) => m.id === "pecas_os")
);

const def = createDefaultPecasOsTemplate();
ok("default id pecas_os", def.id === "pecas_os");
ok("version 2 mockup", def.version === 2);
ok("canvas 384×240", def.canvasW === 384 && def.canvasH === 240);
ok(
  "elementos veículo/placa/cor/cliente",
  def.elements.some((e) => e.id === "vehicle") &&
    def.elements.some((e) => e.id === "plate") &&
    def.elements.some((e) => e.id === "color") &&
    def.elements.some((e) => e.id === "customer")
);
ok("usa keyOptions", labelTemplateUsesKeyOptions("pecas_os"));

const store = createDefaultLabelTemplatesStore();
ok("store tem pecas_os", !!store.pecas_os);

const migrated = normalizeLabelTemplate("pecas_os", {
  version: 1,
  elements: [{ id: "banner", kind: "banner", name: "old" } as never],
});
ok(
  "migra v1→v2 sem banner legado",
  !migrated.elements.some((e) => e.id === "banner") &&
    migrated.elements.some((e) => e.id === "customer")
);

ok(
  "placa Mercosul com hífen",
  formatPecasPlateDisplay("AZK4B21") === "AZK-4B21" ||
    formatPecasPlateDisplay("azk4b21") === "AZK-4B21"
);

const lines = splitPecasVehicleLines("HR-V EXL 1.8 FLEX", "2016");
ok("título = primeira palavra", lines.title === "HR-V");
ok(
  "subtítulo com resto e ano",
  lines.subtitle.includes("EXL") && lines.subtitle.includes("2016")
);

ok(
  "sample data completo",
  LABEL_SAMPLE_DATA.pecas_os.customerName.length > 0 &&
    LABEL_SAMPLE_DATA.pecas_os.plate.length > 0
);

const normalized = normalizeLabelTemplatesStore({
  pecas_os: {
    version: 2,
    elements: [{ id: "vehicle", x: 20, y: 40, w: 300, h: 30 } as never],
  },
});
ok("normalize preserva pecas_os", normalized.pecas_os.id === "pecas_os");

if (failed > 0) {
  console.log(`\n${failed} falha(s)`);
  process.exit(1);
}
console.log("\npatioPecasLabel.selftest: ok");
