/**
 * Garante que os 5 painéis RDA usam o shell acima do Hub de Ajustes.
 * npm run test:rda-panels-zindex
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SETTINGS_CHILD_MODAL_Z, SETTINGS_HUB_Z } from "../components/ui/iosModalStyles.js";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed += 1;
    console.log(`  OK  ${msg}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${msg}`);
  }
}

const root = join(process.cwd());
const panels = [
  "RdaKnowledgeMemoryPanel.tsx",
  "RdaOperationalIntelligencePanel.tsx",
  "RdaPatioIntelligencePanel.tsx",
  "RdaLabEstoqueIntelligencePanel.tsx",
  "RdaProactiveIntelligencePanel.tsx",
];

console.log("RDA panels z-index / shell selftest\n");

console.log("1) Constantes do hub");
{
  assert(SETTINGS_HUB_Z === "z-[150]", "hub z-[150]");
  assert(SETTINGS_CHILD_MODAL_Z === "z-[160]", "filho z-[160]");
}

console.log("\n2) Shell compartilhado");
{
  const shell = readFileSync(
    join(root, "components/rda/RdaSettingsChildShell.tsx"),
    "utf8"
  );
  assert(shell.includes("SETTINGS_CHILD_MODAL_Z"), "shell usa SETTINGS_CHILD_MODAL_Z");
  assert(shell.includes("ModalPortal"), "shell usa ModalPortal");
  assert(shell.includes("desktopShellViewportOverlayClass"), "shell ancora no desktop shell");
  assert(shell.includes("manageBackLayer={false}"), "back layer no HomeView (sem duplicar)");
}

console.log("\n3) Cinco painéis usam o shell (não z-[70])");
{
  for (const file of panels) {
    const src = readFileSync(join(root, "components/rda", file), "utf8");
    assert(src.includes("RdaSettingsChildShell"), `${file} → RdaSettingsChildShell`);
    assert(!/z-\[70\]/.test(src), `${file} sem z-[70]`);
  }
}

console.log("\n4) HomeView limpa os 5 estados ao fechar o hub");
{
  const home = readFileSync(join(root, "components/views/HomeView.tsx"), "utf8");
  assert(home.includes("setIsRdaMemoryOpen(false)"), "fecha memória");
  assert(home.includes("setIsRdaOpsOpen(false)"), "fecha ops");
  assert(home.includes("setIsRdaPatioIntelOpen(false)"), "fecha pátio");
  assert(home.includes("setIsRdaLabEstoqueIntelOpen(false)"), "fecha lab");
  assert(home.includes("setIsRdaProactiveOpen(false)"), "fecha proativo");
  const closeBlock = home.slice(
    home.indexOf("closeAllSettingsChildModals"),
    home.indexOf("closeAllSettingsChildModals") + 900
  );
  assert(closeBlock.includes("setIsRdaOpsOpen(false)"), "closeAll inclui ops");
  assert(closeBlock.includes("setIsRdaProactiveOpen(false)"), "closeAll inclui proativo");
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
