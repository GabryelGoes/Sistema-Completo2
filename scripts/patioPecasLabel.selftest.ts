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
ok("canvas 384×240", def.canvasW === 384 && def.canvasH === 240);
ok("mercosul ligado", def.keyOptions?.mercosulPlate === true);
ok("sem dual copy", def.keyOptions?.dualCopy === false);
ok(
  "elementos carro/cor/placa",
  def.elements.some((e) => e.id === "vehicle") &&
    def.elements.some((e) => e.id === "color") &&
    def.elements.some((e) => e.id === "plate")
);
ok("placa sem rótulo", (def.elements.find((e) => e.id === "plate")?.labelText || "") === "");
ok("usa keyOptions", labelTemplateUsesKeyOptions("pecas_os"));

const store = createDefaultLabelTemplatesStore();
ok("store tem pecas_os", !!store.pecas_os);

const normalized = normalizeLabelTemplatesStore({
  pecas_os: {
    elements: [{ id: "vehicle", x: 20, y: 40, w: 300, h: 30 } as never],
  },
});
ok("normalize preserva pecas_os", normalized.pecas_os.id === "pecas_os");
ok(
  "normalize aplica x do veículo",
  normalized.pecas_os.elements.find((e) => e.id === "vehicle")?.x === 20
);

const plateOnly = normalizeLabelTemplate("pecas_os", {
  elements: [{ id: "plate", labelText: "Placa:", name: "x" } as never],
});
ok(
  "normaliza placa sem rótulo",
  plateOnly.elements.find((e) => e.id === "plate")?.labelText === ""
);

ok(
  "sample data",
  LABEL_SAMPLE_DATA.pecas_os.vehicleModel.length > 0 &&
    LABEL_SAMPLE_DATA.pecas_os.plate.length > 0
);

if (failed > 0) {
  console.log(`\n${failed} falha(s)`);
  process.exit(1);
}
console.log("\npatioPecasLabel.selftest: ok");
