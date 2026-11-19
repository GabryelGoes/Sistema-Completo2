/**
 * Rode: npx tsx scripts/patioPecasLabel.selftest.ts
 */
import {
  createDefaultPecasOsTemplate,
  createDefaultPecasOptions,
  createDefaultLabelTemplatesStore,
  labelTemplateUsesKeyOptions,
  normalizeLabelTemplate,
  normalizeLabelTemplatesStore,
  normalizePecasOptions,
  LABEL_PECAS_SIDEBAR_ICONS,
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
ok("version 3 editor completo", def.version === 3);
ok("canvas 384×240", def.canvasW === 384 && def.canvasH === 240);
ok(
  "elementos veículo/placa/cor/cliente",
  def.elements.some((e) => e.id === "vehicle") &&
    def.elements.some((e) => e.id === "plate") &&
    def.elements.some((e) => e.id === "color") &&
    def.elements.some((e) => e.id === "customer")
);
ok("usa keyOptions", labelTemplateUsesKeyOptions("pecas_os"));
ok("tem pecasOptions", !!def.pecasOptions);
ok(
  "ícones de faixa disponíveis",
  LABEL_PECAS_SIDEBAR_ICONS.length >= 5 &&
    LABEL_PECAS_SIDEBAR_ICONS.some((i) => i.value === "car_gear") &&
    LABEL_PECAS_SIDEBAR_ICONS.some((i) => i.value === "none")
);

const opts = createDefaultPecasOptions();
ok("faixa padrão 78px", opts.sidebarWidth === 78);
ok("texto faixa PEÇA", opts.sidebarText === "PEÇA");
ok("ícones de campo ligados", opts.showPlateIcon && opts.showColorIcon && opts.showCustomerIcon);

const patched = normalizePecasOptions(
  {
    sidebarWidth: 90,
    sidebarTextSize: 32,
    sidebarIcon: "wrench",
    showPlateIcon: false,
  },
  opts
);
ok("normalize largura", patched.sidebarWidth === 90);
ok("normalize ícone wrench", patched.sidebarIcon === "wrench");
ok("normalize sem ícone placa", patched.showPlateIcon === false);
ok("normalize mantém ícone cor", patched.showColorIcon === true);
ok(
  "normalize rejeita ícone inválido",
  normalizePecasOptions({ sidebarIcon: "xyz" as never }, opts).sidebarIcon ===
    opts.sidebarIcon
);

const store = createDefaultLabelTemplatesStore();
ok("store tem pecas_os", !!store.pecas_os);

const migrated = normalizeLabelTemplate("pecas_os", {
  version: 1,
  elements: [{ id: "banner", kind: "banner", name: "old" } as never],
});
ok(
  "migra v1→v3 sem banner legado",
  migrated.version >= 3 &&
    !migrated.elements.some((e) => e.id === "banner") &&
    migrated.elements.some((e) => e.id === "customer") &&
    !!migrated.pecasOptions
);

const migratedV2 = normalizeLabelTemplate("pecas_os", {
  version: 2,
  elements: def.elements,
});
ok(
  "migra v2→v3 com pecasOptions",
  migratedV2.version >= 3 && !!migratedV2.pecasOptions
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
ok("normalize injeta pecasOptions", !!normalized.pecas_os.pecasOptions);

if (failed > 0) {
  console.log(`\n${failed} falha(s)`);
  process.exit(1);
}
console.log("\npatioPecasLabel.selftest: ok");
