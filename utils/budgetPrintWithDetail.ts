import { budgetLastActivityMs, type ServiceOrderDetail } from "../services/apiService";
import { budgetHasExplicitApprovalDecisions } from "./budgetItemDisplay";
import { formatLaborLabel } from "./workshopLaborFormat";
import { parsePatioCardTitle } from "./patioCardTitle";
import { printHtmlDocument } from "./printHtml";

/** Dados mínimos do orçamento para impressão (compatível com SavedBudget do Pátio). */
export type BudgetPrintBudget = {
  cardName: string;
  diagnosis: string;
  services: { description: string; approved?: boolean; labor_hours?: number | null }[];
  parts: { description: string; quantity: string; approved?: boolean }[];
  observations: string;
  createdAt: string;
  updatedAt?: string | null;
};

function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

export function printBudgetWithDetail(
  budget: BudgetPrintBudget,
  detail: ServiceOrderDetail | null,
  opts: { isModuleMode: boolean; mileageKm?: string | null }
): void {
  const { isModuleMode, mileageKm } = opts;
  const dateStr = new Date(budgetLastActivityMs(budget)).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const hasApprovalDecision = budgetHasExplicitApprovalDecisions(budget.services, budget.parts);
  const serviceApproved = budget.services.filter((s) => s.approved === true);
  const serviceRejected = budget.services.filter((s) => s.approved === false);
  const servicePending = budget.services.filter((s) => s.approved !== true && s.approved !== false);
  const partApproved = budget.parts.filter((p) => p.approved === true);
  const partRejected = budget.parts.filter((p) => p.approved === false);
  const partPending = budget.parts.filter((p) => p.approved !== true && p.approved !== false);

  const serviceLine = (
    s: { description: string; approved?: boolean; labor_hours?: number | null },
    includeStatus = true
  ) => {
    const dur =
      s.labor_hours != null && Number.isFinite(Number(s.labor_hours))
        ? ` <span class="meta">(${formatLaborLabel(Number(s.labor_hours))})</span>`
        : "";
    const status = includeStatus
      ? s.approved === true
        ? `<span class="status ok">APROVADO</span> `
        : s.approved === false
          ? `<span class="status no">REPROVADO</span> `
          : `<span class="status wait">PENDENTE</span> `
      : "";
    return `<li>${status}${esc(s.description)}${dur}</li>`;
  };
  const partLine = (
    p: { description: string; quantity: string; approved?: boolean; fromStock?: boolean },
    includeStatus = true
  ) => {
    const status = includeStatus
      ? p.approved === true
        ? `<span class="status ok">APROVADO</span> `
        : p.approved === false
          ? `<span class="status no">REPROVADO</span> `
          : `<span class="status wait">PENDENTE</span> `
      : "";
    const stockTag = p.fromStock ? `<span class="stock-tag">[Estoque]</span> ` : "";
    return `<li>${status}<strong>(${esc(p.quantity)}x)</strong> ${stockTag}${esc(p.description)}</li>`;
  };

  const approvedExecutionHtml = hasApprovalDecision
    ? `
        <h3 class="sec">Itens aprovados para execução</h3>
        ${
          serviceApproved.length === 0 && partApproved.length === 0
            ? `<div class="block">Nenhum item aprovado até o momento.</div>`
            : `
              ${serviceApproved.length > 0 ? `<h4 class="sub">Serviços aprovados</h4><ul>${serviceApproved.map((s) => serviceLine(s, false)).join("")}</ul>` : ""}
              ${partApproved.length > 0 ? `<h4 class="sub">Peças aprovadas</h4><ul>${partApproved.map((p) => partLine(p, false)).join("")}</ul>` : ""}
            `
        }
      `
    : "";

  const servicesHtml =
    budget.services.length > 0
      ? `<h3 class="sec">Serviços</h3><ul>${budget.services.map((s) => serviceLine(s, hasApprovalDecision)).join("")}</ul>`
      : "";
  const partsHtml =
    budget.parts.length > 0
      ? `<h3 class="sec">Peças</h3><ul>${budget.parts.map((p) => partLine(p, hasApprovalDecision)).join("")}</ul>`
      : "";
  const diagnosisHtml = budget.diagnosis
    ? `<h3 class="sec">Diagnóstico</h3><div class="block">${esc(budget.diagnosis)}</div>`
    : "";
  const obsHtml = budget.observations
    ? `<h3 class="sec">Observações</h3><div class="block">${esc(budget.observations)}</div>`
    : "";
  const titleParts = parsePatioCardTitle(budget.cardName || "");
  const customerName = detail?.customers?.name || titleParts.customer || "—";
  const vehicleName = detail?.vehicle_model || titleParts.vehicle || "—";
  const plateOrModule = isModuleMode
    ? detail?.module_identification || titleParts.plateOrModule || "—"
    : (detail?.plate || titleParts.plateOrModule || "—").toUpperCase();
  const brand = detail?.vehicle_brand || "—";
  const year = detail?.vehicle_year || "—";
  const engine = detail?.vehicle_engine_info || "—";
  const osNumber = detail?.os_number != null ? String(detail.os_number) : "—";
  const mileage = mileageKm || detail?.mileage_km || "—";
  const createdAtStr = new Date(budget.createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const createdAtTime = new Date(budget.createdAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const approvalSummaryHtml = hasApprovalDecision
    ? `<div class="summary">
          <span><strong>Serviços:</strong> ${serviceApproved.length} aprovados, ${serviceRejected.length} reprovados, ${servicePending.length} pendentes</span>
          <span><strong>Peças:</strong> ${partApproved.length} aprovadas, ${partRejected.length} reprovadas, ${partPending.length} pendentes</span>
        </div>`
    : "";
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Orçamento - ${esc(budget.cardName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; padding: 20px; color: #1f2937; font-size: 12px; line-height: 1.4; }
    .brand { margin-bottom: 14px; border-bottom: 2px solid #d1d5db; padding-bottom: 10px; }
    .brand h1 { font-size: 18px; font-weight: 800; letter-spacing: .02em; }
    .brand p { font-size: 11px; color: #4b5563; margin-top: 2px; }
    .title { margin-top: 8px; font-size: 16px; font-weight: 800; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 14px; margin-bottom: 14px; }
    .field { border-bottom: 1px dashed #d1d5db; padding-bottom: 3px; min-height: 34px; }
    .label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; font-weight: 700; margin-bottom: 2px; }
    .value { display: block; font-size: 12px; font-weight: 600; color: #111827; word-break: break-word; }
    .meta { color: #4b5563; font-size: 11px; margin-top: 4px; }
    .sec { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #374151; margin: 14px 0 6px; border-top: 1px solid #e5e7eb; padding-top: 8px; }
    .sub { font-size: 12px; font-weight: 700; color: #4a443d; margin: 12px 0 6px; }
    .block { white-space: pre-wrap; }
    .summary { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0 6px; padding: 10px 12px; border: 1px solid #d8cfbf; background: #f7f1e6; border-radius: 8px; font-size: 12px; color: #4a443d; }
    .status { display: inline-block; margin-right: 6px; border-radius: 5px; padding: 1px 6px; font-size: 10px; font-weight: 700; letter-spacing: .03em; vertical-align: middle; }
    .status.ok { background: #e6f5e9; color: #1f6b2a; border: 1px solid #b7e0be; }
    .status.no { background: #fbe8e8; color: #9d1f1f; border: 1px solid #efb6b6; }
    .status.wait { background: #f3efe7; color: #6f665c; border: 1px solid #ded6c7; }
    .stock-tag { display: inline-block; margin-right: 4px; border-radius: 4px; padding: 0 5px; font-size: 9px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; vertical-align: middle; }
    ul { list-style: disc; margin-left: 20px; }
    li { margin: 4px 0; padding-bottom: 4px; border-bottom: 1px dashed #cfc6b6; }
    li:last-child { border-bottom: 0; }
    @media print { body { padding: 16px; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="brand">
    <h1>REI DO ABS</h1>
    <p>Especialista em freios ABS</p>
    <p>Avenida Tuiuti 4366, Conjunto João de Barro Itaparica - Maringá</p>
    <p>(44) 99929-4861 / (44) 3040-3931</p>
    <p>reidoabs@gmail.com</p>
    <div class="title">Orçamento</div>
  </div>
  <div class="grid">
    <div class="field"><span class="label">Nome do cliente</span><span class="value">${esc(customerName)}</span></div>
    <div class="field"><span class="label">Nº Ordem de serviço</span><span class="value">${esc(osNumber)}</span></div>
    <div class="field"><span class="label">${isModuleMode ? "Identificação do módulo" : "Placa"}</span><span class="value">${esc(plateOrModule)}</span></div>
    <div class="field"><span class="label">Fabricante</span><span class="value">${esc(brand)}</span></div>
    <div class="field"><span class="label">Modelo</span><span class="value">${esc(vehicleName)}</span></div>
    <div class="field"><span class="label">Ano</span><span class="value">${esc(year)}</span></div>
    <div class="field"><span class="label">Motor</span><span class="value">${esc(engine)}</span></div>
    <div class="field"><span class="label">KM</span><span class="value">${esc(mileage)}</span></div>
    <div class="field"><span class="label">Data de entrada</span><span class="value">${esc(createdAtStr)} às ${esc(createdAtTime)}</span></div>
  </div>
  <p class="meta">OS: ${esc(budget.cardName)}</p>
  <p class="meta">Emissão: ${esc(dateStr)}</p>
  ${approvalSummaryHtml}
  ${diagnosisHtml}
  ${approvedExecutionHtml}
  ${servicesHtml}
  ${partsHtml}
  ${obsHtml}
</body>
</html>`;
  printHtmlDocument(html);
}

export function printBudgetMechanicWithDetail(
  budget: BudgetPrintBudget,
  detail: ServiceOrderDetail | null,
  opts: { isModuleMode: boolean; mileageKm?: string | null }
): void {
  const { isModuleMode, mileageKm } = opts;
  const dateStr = new Date(budgetLastActivityMs(budget)).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const approvedServices = budget.services.filter((s) => s.approved === true);
  const approvedParts = budget.parts.filter((p) => p.approved === true);
  const titleParts = parsePatioCardTitle(budget.cardName || "");
  const customerName = detail?.customers?.name || titleParts.customer || "—";
  const vehicleName = detail?.vehicle_model || titleParts.vehicle || "—";
  const plateOrModule = isModuleMode
    ? detail?.module_identification || titleParts.plateOrModule || "—"
    : (detail?.plate || titleParts.plateOrModule || "—").toUpperCase();
  const brand = detail?.vehicle_brand || "—";
  const year = detail?.vehicle_year || "—";
  const engine = detail?.vehicle_engine_info || "—";
  const osNumber = detail?.os_number != null ? String(detail.os_number) : "—";
  const mileage = mileageKm || detail?.mileage_km || "—";
  const createdAtStr = new Date(budget.createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const createdAtTime = new Date(budget.createdAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const servicesHtml =
    approvedServices.length > 0
      ? `<h3 class="sec">Serviços aprovados</h3><ul>${approvedServices
          .map((s) => {
            const dur =
              s.labor_hours != null && Number.isFinite(Number(s.labor_hours))
                ? ` <span class="meta">(${formatLaborLabel(Number(s.labor_hours))})</span>`
                : "";
            return `<li>${esc(s.description)}${dur}</li>`;
          })
          .join("")}</ul>`
      : "";
  const partsHtml =
    approvedParts.length > 0
      ? `<h3 class="sec">Peças aprovadas</h3><ul>${approvedParts
          .map((p) => `<li><strong>(${esc(p.quantity)}x)</strong> ${esc(p.description)}</li>`)
          .join("")}</ul>`
      : "";
  const emptyHtml =
    approvedServices.length === 0 && approvedParts.length === 0
      ? `<div class="block">Nenhum item aprovado neste orçamento.</div>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Via mecânico - ${esc(budget.cardName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; padding: 20px; color: #1f2937; font-size: 12px; line-height: 1.4; }
    .brand { margin-bottom: 14px; border-bottom: 2px solid #d1d5db; padding-bottom: 10px; }
    .brand h1 { font-size: 18px; font-weight: 800; letter-spacing: .02em; }
    .brand p { font-size: 11px; color: #4b5563; margin-top: 2px; }
    .title { margin-top: 8px; font-size: 16px; font-weight: 800; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 14px; margin-bottom: 14px; }
    .field { border-bottom: 1px dashed #d1d5db; padding-bottom: 3px; min-height: 34px; }
    .label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; font-weight: 700; margin-bottom: 2px; }
    .value { display: block; font-size: 12px; font-weight: 600; color: #111827; word-break: break-word; }
    .meta { color: #4b5563; font-size: 11px; margin-top: 4px; }
    .sec { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #374151; margin: 14px 0 6px; border-top: 1px solid #e5e7eb; padding-top: 8px; }
    .block { white-space: pre-wrap; }
    ul { list-style: disc; margin-left: 20px; }
    li { margin: 3px 0; padding-bottom: 4px; border-bottom: 1px dashed #cfc6b6; }
    li:last-child { border-bottom: 0; }
    .footer-sign { margin-top: 18px; font-size: 11px; color: #374151; }
    @media print { body { padding: 16px; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="brand">
    <h1>REI DO ABS</h1>
    <p>Especialista em freios ABS</p>
    <p>Avenida Tuiuti 4366, Conjunto João de Barro Itaparica - Maringá</p>
    <p>(44) 99929-4861 / (44) 3040-3931</p>
    <p>reidoabs@gmail.com</p>
    <div class="title">Via mecânico</div>
  </div>

  <div class="grid">
    <div class="field"><span class="label">Nome do cliente</span><span class="value">${esc(customerName)}</span></div>
    <div class="field"><span class="label">Nº Ordem de serviço</span><span class="value">${esc(osNumber)}</span></div>
    <div class="field"><span class="label">${isModuleMode ? "Identificação do módulo" : "Placa"}</span><span class="value">${esc(plateOrModule)}</span></div>
    <div class="field"><span class="label">Fabricante</span><span class="value">${esc(brand)}</span></div>
    <div class="field"><span class="label">Modelo</span><span class="value">${esc(vehicleName)}</span></div>
    <div class="field"><span class="label">Ano</span><span class="value">${esc(year)}</span></div>
    <div class="field"><span class="label">Motor</span><span class="value">${esc(engine)}</span></div>
    <div class="field"><span class="label">KM</span><span class="value">${esc(mileage)}</span></div>
    <div class="field"><span class="label">Data de entrada</span><span class="value">${esc(createdAtStr)} às ${esc(createdAtTime)}</span></div>
  </div>

  <p class="meta">OS: ${esc(budget.cardName)}</p>
  <p class="meta">Emissão: ${esc(dateStr)}</p>
  ${servicesHtml}
  ${partsHtml}
  ${emptyHtml}
  <p class="footer-sign">Data de teste: ____/____/______ às ____:____ &nbsp;&nbsp; Assinatura do responsável: ____________________________</p>
</body>
</html>`;
  printHtmlDocument(html);
}
