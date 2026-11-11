/**
 * Selftest: PDFs dos modais de veículo abrem no visualizador in-app.
 * npm run test:vehicle-modal-pdf-viewer
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

console.log("vehicleModalPdfViewer selftest\n");

const viewer = readFileSync(join(process.cwd(), "components/PdfViewerModal.tsx"), "utf8");
const patio = readFileSync(join(process.cwd(), "components/views/PatioView.tsx"), "utf8");

assert(viewer.includes("createObjectURL"), "viewer carrega PDF como blob in-app");
assert(viewer.includes("Visualizador do sistema"), "viewer se identifica como interno");
assert(viewer.includes("Escape"), "viewer fecha com Esc");
assert(patio.includes("setPreviewPdf({"), "pátio abre PDF via setPreviewPdf");
assert(!/onClick=\{\(\) => window\.open\(att\.url/.test(patio), "pátio não abre PDF com window.open direto");
assert(patio.includes("PdfViewerModal"), "pátio monta PdfViewerModal");
assert(patio.includes("title={previewPdf.title}"), "pátio passa título ao viewer");

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
