import type {
  WorkshopPart,
  WorkshopPartCategory,
  WorkshopPartPurchase,
} from '../services/apiService';
import {
  PART_ORIGIN_OPTIONS,
  UNIT_OF_MEASURE_OPTIONS,
  formatPartContent,
  storageSiteLabel,
} from './workshopPartFields';
import { formatWorkshopPartQty, getWorkshopPartStockStatus } from './workshopPartStock';
import { printHtmlDocument } from './printHtml';
import { moduleKindLabel, moduleVehicleKindLabel } from './moduleMetadata';

import type { WorkshopPartLabContext } from '../services/apiService';

export type WorkshopPartLabPrintContext = WorkshopPartLabContext;

function esc(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function displayText(v: string | null | undefined): string {
  const s = (v ?? '').trim();
  return s || '—';
}

function fmtMoney(n: number): string {
  return `R$ ${Number(n ?? 0).toFixed(2)}`;
}

function fmtQty(n: number, unit: string): string {
  return `${formatWorkshopPartQty(n)} ${unit}`;
}

function originLabel(code: string): string {
  return PART_ORIGIN_OPTIONS.find((o) => o.value === code)?.label ?? code;
}

function unitLabel(code: string): string {
  const u = UNIT_OF_MEASURE_OPTIONS.find((o) => o.value === code);
  return u ? `${u.value} — ${u.label}` : code;
}

const PURCHASE_STATUS: Record<string, string> = {
  pending: 'Pendente',
  ordered: 'Pedido',
  received: 'Recebido',
  cancelled: 'Cancelado',
};

const STOCK_STATUS_LABEL: Record<string, string> = {
  zero: 'Sem estoque',
  low: 'Abaixo do mínimo',
  ok: 'Normal',
};

function fieldHtml(label: string, value: string, opts?: { wide?: boolean; highlight?: boolean }) {
  const cls = opts?.wide ? 'field field-wide' : 'field';
  const valCls = opts?.highlight ? 'value value-strong' : 'value';
  return `<div class="${cls}"><span class="label">${esc(label)}</span><span class="${valCls}">${value}</span></div>`;
}

export function printWorkshopPartSheet(opts: {
  part: WorkshopPart;
  catalogNumber?: number;
  categories: WorkshopPartCategory[];
  purchases: WorkshopPartPurchase[];
  photoUrls: string[];
  labContext?: WorkshopPartLabPrintContext | null;
}): void {
  const { part, catalogNumber, categories, purchases, photoUrls, labContext } = opts;
  const unit = part.unit_of_measure ?? 'UN';
  const stockStatus = getWorkshopPartStockStatus(part);
  const categoryNames = (part.category_ids ?? [])
    .map((id) => categories.find((c) => c.id === id)?.name)
    .filter((n): n is string => !!n);
  const fe = part.fiscal_extra ?? {};
  const hasFiscal = Object.values(fe).some((v) => v != null && String(v).trim() !== '');

  const printedAt = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const osNumber =
    labContext?.os_number != null ? String(labContext.os_number) : null;
  const complaint = (labContext?.issue_description ?? '').trim();

  const heroHtml = `
  <section class="hero">
    <div class="hero-grid">
      ${
        osNumber
          ? `<div class="hero-os">
              <span class="hero-label">Ordem de serviço</span>
              <span class="hero-os-num">OS #${esc(osNumber)}</span>
            </div>`
          : `<div class="hero-os hero-os-empty">
              <span class="hero-label">Ordem de serviço</span>
              <span class="hero-muted">Não vinculada a uma OS do laboratório</span>
            </div>`
      }
      <div class="hero-complaint">
        <span class="hero-label">Queixa do cliente</span>
        <div class="hero-complaint-body">${complaint ? esc(complaint) : '<span class="hero-muted">Nenhuma queixa registrada na OS vinculada.</span>'}</div>
      </div>
    </div>
    ${
      labContext &&
      (labContext.customer_name ||
        labContext.vehicle_model ||
        labContext.module_identification)
        ? `<div class="hero-meta">
            ${labContext.customer_name ? `<span><strong>Cliente:</strong> ${esc(displayText(labContext.customer_name))}</span>` : ''}
            ${labContext.vehicle_brand || labContext.vehicle_model ? `<span><strong>Veículo:</strong> ${esc([labContext.vehicle_brand, labContext.vehicle_model].filter(Boolean).join(' ') || '—')}</span>` : ''}
            ${labContext.module_identification ? `<span><strong>Módulo:</strong> ${esc(displayText(labContext.module_identification))}</span>` : ''}
            ${labContext.plate?.trim() ? `<span><strong>Placa:</strong> ${esc(labContext.plate.trim().toUpperCase())}</span>` : ''}
            ${labContext.mileage_km?.trim() ? `<span><strong>Km:</strong> ${esc(labContext.mileage_km.trim())}</span>` : ''}
          </div>`
        : ''
    }
  </section>`;

  const photosHtml =
    photoUrls.length > 0
      ? `<section class="section">
          <h2 class="sec-title">Fotos do produto</h2>
          <div class="photos">${photoUrls
            .slice(0, 3)
            .map(
              (url, i) =>
                `<figure class="photo"><img src="${esc(url)}" alt="Foto ${i + 1}" /><figcaption>${i === 0 ? 'Capa' : `Foto ${i + 1}`}</figcaption></figure>`
            )
            .join('')}</div>
        </section>`
      : '';

  const categoriesHtml =
    categoryNames.length > 0
      ? categoryNames.map((n) => `<span class="tag">${esc(n)}</span>`).join('')
      : '—';

  const applicationHtml = part.application_similar?.trim()
    ? `<section class="section"><h2 class="sec-title">Aplicação e similares</h2><div class="block">${esc(part.application_similar)}</div></section>`
    : '';

  const descriptionHtml = part.description?.trim()
    ? `<section class="section"><h2 class="sec-title">Descrição</h2><div class="block">${esc(part.description)}</div></section>`
    : '';

  const characteristicsHtml = part.characteristics?.trim()
    ? `<section class="section"><h2 class="sec-title">Características</h2><div class="block">${esc(part.characteristics)}</div></section>`
    : '';

  const notesHtml = part.notes?.trim()
    ? `<section class="section"><h2 class="sec-title">Observações</h2><div class="block">${esc(part.notes)}</div></section>`
    : '';

  const fiscalRows = [
    fe.cest ? fieldHtml('CEST', esc(fe.cest)) : '',
    fe.cfop ? fieldHtml('CFOP', esc(fe.cfop)) : '',
    fe.icms_cst ? fieldHtml('CST ICMS', esc(fe.icms_cst)) : '',
    fe.ipi_cst ? fieldHtml('CST IPI', esc(fe.ipi_cst)) : '',
    fe.pis_cst ? fieldHtml('CST PIS', esc(fe.pis_cst)) : '',
    fe.cofins_cst ? fieldHtml('CST COFINS', esc(fe.cofins_cst)) : '',
  ]
    .filter(Boolean)
    .join('');

  const fiscalHtml = hasFiscal
    ? `<section class="section">
        <h2 class="sec-title">Fiscal</h2>
        <div class="grid">${fiscalRows}</div>
        ${fe.tax_notes?.trim() ? `<div class="block mt">${esc(fe.tax_notes)}</div>` : ''}
      </section>`
    : '';

  const purchasesHtml =
    purchases.length > 0
      ? `<section class="section">
          <h2 class="sec-title">Lista de compras</h2>
          <table class="table">
            <thead><tr>
              <th>Fornecedor</th><th>Qtd.</th><th>Custo un.</th><th>Previsão</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${purchases
                .map(
                  (row) => `<tr>
                <td>${esc(displayText(row.supplier_name))}</td>
                <td>${esc(fmtQty(row.quantity, unit))}</td>
                <td>${esc(fmtMoney(row.unit_cost))}</td>
                <td>${esc(row.expected_date || '—')}</td>
                <td>${esc(PURCHASE_STATUS[row.status] ?? row.status)}</td>
              </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </section>`
      : '';

  const labTypeHtml =
    labContext?.module_kind || labContext?.module_product_other
      ? fieldHtml(
          'Tipo de produto (lab.)',
          esc(
            [
              moduleKindLabel(labContext.module_kind),
              moduleVehicleKindLabel(labContext.module_vehicle_kind),
            ]
              .filter((s) => s && s !== '—')
              .join(' · ') || '—'
          )
        )
      : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Ficha — ${esc(part.name)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; padding: 22px 24px; color: #1f2937; font-size: 11.5px; line-height: 1.45; }
    .brand { margin-bottom: 16px; border-bottom: 2px solid #0d9488; padding-bottom: 12px; }
    .brand h1 { font-size: 20px; font-weight: 800; letter-spacing: .03em; color: #0f766e; }
    .brand p { font-size: 10.5px; color: #4b5563; margin-top: 2px; }
    .doc-title { margin-top: 10px; font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #111827; }
    .doc-sub { font-size: 11px; color: #6b7280; margin-top: 4px; }
    .product-name { font-size: 22px; font-weight: 800; color: #111827; margin: 14px 0 4px; line-height: 1.2; }
    .product-meta { font-size: 12px; color: #374151; margin-bottom: 4px; }
    .hero { margin: 16px 0 18px; border: 2px solid #0d9488; border-radius: 12px; overflow: hidden; background: linear-gradient(135deg, #f0fdfa 0%, #ecfeff 100%); }
    .hero-grid { display: grid; grid-template-columns: minmax(140px, 200px) 1fr; gap: 0; }
    .hero-os { padding: 16px 18px; background: #0d9488; color: #fff; display: flex; flex-direction: column; justify-content: center; }
    .hero-os-empty { background: #64748b; }
    .hero-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; opacity: .9; }
    .hero-os-num { font-size: 28px; font-weight: 900; letter-spacing: .02em; margin-top: 6px; line-height: 1; }
    .hero-muted { font-size: 11px; opacity: .85; margin-top: 6px; line-height: 1.35; }
    .hero-complaint { padding: 16px 18px; border-left: 1px solid #99f6e4; }
    .hero-complaint .hero-label { color: #0f766e; }
    .hero-complaint-body { margin-top: 8px; font-size: 13px; font-weight: 600; color: #134e4a; white-space: pre-wrap; line-height: 1.5; }
    .hero-meta { display: flex; flex-wrap: wrap; gap: 10px 20px; padding: 10px 18px 12px; border-top: 1px solid #99f6e4; font-size: 11px; color: #334155; background: rgba(255,255,255,.55); }
    .section { margin-bottom: 16px; page-break-inside: avoid; }
    .sec-title { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: #0f766e; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #d1d5db; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 14px; }
    .field { border-bottom: 1px dashed #d1d5db; padding-bottom: 4px; min-height: 32px; }
    .field-wide { grid-column: 1 / -1; }
    .label { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; font-weight: 700; margin-bottom: 2px; }
    .value { display: block; font-size: 12px; font-weight: 600; color: #111827; word-break: break-word; }
    .value-strong { font-size: 14px; font-weight: 800; }
    .block { white-space: pre-wrap; padding: 10px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; }
    .mt { margin-top: 10px; }
    .tag { display: inline-block; margin: 2px 4px 2px 0; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .stock-badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; }
    .stock-ok { background: #dcfce7; color: #166534; }
    .stock-low { background: #fef3c7; color: #92400e; }
    .stock-zero { background: #fee2e2; color: #991b1b; }
    .photos { display: flex; gap: 12px; flex-wrap: wrap; }
    .photo { width: 140px; text-align: center; }
    .photo img { width: 140px; height: 140px; object-fit: cover; border-radius: 8px; border: 1px solid #d1d5db; }
    .photo figcaption { font-size: 9px; color: #6b7280; margin-top: 4px; font-weight: 700; text-transform: uppercase; }
    .table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .table th, .table td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
    .table th { background: #f3f4f6; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; }
    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
    @media print {
      body { padding: 14px 16px; }
      .hero { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="brand">
    <h1>REI DO ABS</h1>
    <p>Especialista em freios ABS</p>
    <p>Avenida Tuiuti 4366, Conjunto João de Barro Itaparica — Maringá</p>
    <p>(44) 99929-4861 / (44) 3040-3931 · reidoabs@gmail.com</p>
    <div class="doc-title">Ficha do produto — Laboratório / Estoque</div>
    <p class="doc-sub">Emissão: ${esc(printedAt)}${catalogNumber != null ? ` · Item #${catalogNumber} no catálogo` : ''}</p>
  </div>

  <p class="product-name">${esc(displayText(part.name))}</p>
  <p class="product-meta">${esc([part.brand?.trim(), part.location?.trim()].filter(Boolean).join(' · ') || 'Sem marca / localização')}</p>

  ${heroHtml}

  ${photosHtml}

  <section class="section">
    <h2 class="sec-title">Identificação</h2>
    <div class="grid">
      ${catalogNumber != null ? fieldHtml('Nº no estoque', esc(`#${catalogNumber}`)) : ''}
      ${fieldHtml('Marca', esc(displayText(part.brand)))}
      ${fieldHtml('Modelo', esc(displayText(part.model)))}
      ${fieldHtml('Empresa / barracão', esc(storageSiteLabel(part.storage_site)))}
      ${fieldHtml('Localização', esc(displayText(part.location)))}
      ${fieldHtml('Conteúdo', esc(displayText(formatPartContent(part.content_qty, part.content_unit))))}
      ${fieldHtml('Código original', esc(displayText(part.original_code)))}
      ${fieldHtml('Código numérico', esc(displayText(part.numeric_code)))}
      ${fieldHtml('Código de barras', esc(displayText(part.barcode)))}
      ${fieldHtml('Categorias', categoriesHtml)}
      ${fieldHtml('Unidade de medida', esc(unitLabel(unit)))}
      ${labTypeHtml}
    </div>
  </section>

  ${descriptionHtml}
  ${characteristicsHtml}
  ${applicationHtml}
  ${notesHtml}

  <section class="section">
    <h2 class="sec-title">Estoque e preços · <span class="stock-badge stock-${stockStatus}">${esc(STOCK_STATUS_LABEL[stockStatus])}</span></h2>
    <div class="grid">
      ${fieldHtml('Preço de venda', esc(fmtMoney(part.unit_price)))}
      ${fieldHtml('Custo unitário', esc(fmtMoney(part.unit_cost ?? 0)))}
      ${fieldHtml('Quantidade em estoque', esc(fmtQty(part.stock_qty, unit)), { highlight: stockStatus !== 'ok' })}
      ${fieldHtml('Quantidade mínima', esc(fmtQty(part.min_stock_qty ?? 0, unit)))}
      ${fieldHtml('Quantidade máxima', part.max_stock_qty != null ? esc(fmtQty(part.max_stock_qty, unit)) : '—')}
      ${fieldHtml('Prêmio', esc(fmtMoney(part.premium_amount ?? 0)))}
      ${fieldHtml('Comissão', esc(`${Number(part.commission_pct ?? 0).toFixed(2)} %`))}
      ${fieldHtml('Lucro padrão', esc(`${Number(part.default_profit_pct ?? 0).toFixed(2)} %`))}
      ${fieldHtml('NCM', esc(displayText(part.ncm_code)))}
      ${fieldHtml('Origem da peça', esc(originLabel(part.fiscal_origin ?? '0')))}
      ${fieldHtml('Km limite', part.km_limit != null ? esc(String(part.km_limit)) : '—')}
      ${fieldHtml('Validade (meses)', part.validity_months != null ? esc(String(part.validity_months)) : '—')}
    </div>
  </section>

  ${fiscalHtml}
  ${purchasesHtml}

  <p class="footer">Documento gerado pelo sistema RDA · Ficha de produto para uso interno</p>
</body>
</html>`;

  printHtmlDocument(html);
}
