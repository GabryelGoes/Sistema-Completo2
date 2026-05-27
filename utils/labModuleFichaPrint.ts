import type { ServiceOrderDetail } from '../services/apiService';
import type { VehicleReferenceLink } from '../types';
import { labProductDisplayLabel, moduleVehicleKindLabel } from './moduleMetadata';
import { printHtmlDocument } from './printHtml';

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

function fieldHtml(label: string, value: string, wide = false) {
  return `<div class="field${wide ? ' field-wide' : ''}"><span class="label">${esc(label)}</span><span class="value">${value}</span></div>`;
}

function formatDateBr(iso: string | null | undefined): string {
  if (!iso?.trim()) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function printLabModuleFicha(opts: {
  detail: ServiceOrderDetail;
  complaint: string;
  statusLabel?: string;
  photoUrls?: string[];
  technicianName?: string | null;
  deliveryDate?: string | null;
  referenceLinks?: VehicleReferenceLink[];
}): void {
  const { detail, complaint, statusLabel, photoUrls = [], technicianName, deliveryDate, referenceLinks = [] } =
    opts;
  const c = detail.customers;
  const osNumber = detail.os_number != null ? String(detail.os_number) : '—';
  const printedAt = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const photosHtml =
    photoUrls.length > 0
      ? `<section class="section">
          <h2 class="sec-title">Fotos</h2>
          <div class="photos">${photoUrls
            .slice(0, 12)
            .map(
              (url, i) =>
                `<figure class="photo"><img src="${esc(url)}" alt="Foto ${i + 1}" /><figcaption>Foto ${i + 1}</figcaption></figure>`
            )
            .join('')}</div>
        </section>`
      : '';

  const linksHtml =
    referenceLinks.length > 0
      ? `<section class="section">
          <h2 class="sec-title">Links de referência</h2>
          <ul class="links">${referenceLinks
            .map(
              (l) =>
                `<li><strong>${esc(displayText(l.label))}</strong> — ${esc(displayText(l.url))}</li>`
            )
            .join('')}</ul>
        </section>`
      : '';

  const address = [c?.address, c?.address_number, c?.cep].filter(Boolean).join(' · ') || '—';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Ficha laboratório — OS #${esc(osNumber)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; padding: 22px 24px; color: #1f2937; font-size: 11.5px; line-height: 1.45; }
    .brand { margin-bottom: 16px; border-bottom: 2px solid #7c3aed; padding-bottom: 12px; }
    .brand h1 { font-size: 20px; font-weight: 800; color: #5b21b6; letter-spacing: .03em; }
    .brand p { font-size: 10.5px; color: #4b5563; margin-top: 2px; }
    .doc-title { margin-top: 10px; font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
    .doc-sub { font-size: 11px; color: #6b7280; margin-top: 4px; }
    .product-name { font-size: 22px; font-weight: 800; color: #111827; margin: 12px 0 4px; }
    .status-pill { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 999px; font-size: 10px; font-weight: 800; text-transform: uppercase; background: #ede9fe; color: #5b21b6; border: 1px solid #c4b5fd; }
    .hero { margin: 16px 0 18px; border: 2px solid #7c3aed; border-radius: 12px; overflow: hidden; background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); }
    .hero-grid { display: grid; grid-template-columns: minmax(140px, 200px) 1fr; }
    .hero-os { padding: 16px 18px; background: #6d28d9; color: #fff; display: flex; flex-direction: column; justify-content: center; }
    .hero-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; opacity: .92; }
    .hero-os-num { font-size: 28px; font-weight: 900; margin-top: 6px; line-height: 1; }
    .hero-complaint { padding: 16px 18px; border-left: 1px solid #c4b5fd; }
    .hero-complaint .hero-label { color: #5b21b6; }
    .hero-complaint-body { margin-top: 8px; font-size: 13px; font-weight: 600; color: #4c1d95; white-space: pre-wrap; line-height: 1.5; }
    .section { margin-bottom: 16px; page-break-inside: avoid; }
    .sec-title { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: #6d28d9; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #d1d5db; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 14px; }
    .field { border-bottom: 1px dashed #d1d5db; padding-bottom: 4px; min-height: 32px; }
    .field-wide { grid-column: 1 / -1; }
    .label { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; font-weight: 700; margin-bottom: 2px; }
    .value { display: block; font-size: 12px; font-weight: 600; color: #111827; word-break: break-word; }
    .photos { display: flex; flex-wrap: wrap; gap: 10px; }
    .photo { width: 120px; text-align: center; }
    .photo img { width: 120px; height: 120px; object-fit: cover; border-radius: 8px; border: 1px solid #d1d5db; }
    .photo figcaption { font-size: 9px; color: #6b7280; margin-top: 4px; font-weight: 700; }
    .links { margin-left: 18px; }
    .links li { margin: 4px 0; }
    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
    @media print { body { padding: 14px 16px; } .hero { break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="brand">
    <h1>REI DO ABS — Laboratório</h1>
    <p>Especialista em freios ABS</p>
    <p>Avenida Tuiuti 4366, Conjunto João de Barro Itaparica — Maringá</p>
    <p>(44) 99929-4861 / (44) 3040-3931 · reidoabs@gmail.com</p>
    <div class="doc-title">Ficha do produto</div>
    <p class="doc-sub">Emissão: ${esc(printedAt)}</p>
  </div>

  <p class="product-name">${esc(displayText(detail.vehicle_model))}</p>
  ${statusLabel ? `<span class="status-pill">${esc(statusLabel)}</span>` : ''}

  <section class="hero">
    <div class="hero-grid">
      <div class="hero-os">
        <span class="hero-label">Ordem de serviço</span>
        <span class="hero-os-num">OS #${esc(osNumber)}</span>
      </div>
      <div class="hero-complaint">
        <span class="hero-label">Queixa do cliente</span>
        <div class="hero-complaint-body">${complaint ? esc(complaint) : '<span style="opacity:.75">Nenhuma queixa registrada.</span>'}</div>
      </div>
    </div>
  </section>

  <section class="section">
    <h2 class="sec-title">Produto / módulo</h2>
    <div class="grid">
      ${fieldHtml('Identificação', esc(displayText(detail.module_identification)))}
      ${fieldHtml('Referência', esc(displayText(detail.vehicle_model)))}
      ${fieldHtml(
        'Tipo de produto',
        esc(labProductDisplayLabel(detail.module_kind, detail.module_product_other))
      )}
      ${fieldHtml(
        'Produto de',
        esc(moduleVehicleKindLabel(detail.module_vehicle_kind))
      )}
      ${fieldHtml('Data de entrega', esc(formatDateBr(deliveryDate)))}
      ${fieldHtml('Técnico responsável', esc(displayText(technicianName)))}
    </div>
  </section>

  <section class="section">
    <h2 class="sec-title">Cliente</h2>
    <div class="grid">
      ${fieldHtml('Nome', esc(displayText(c?.name)))}
      ${fieldHtml('Telefone', esc(displayText(c?.phone)))}
      ${fieldHtml('E-mail', esc(displayText(c?.email)))}
      ${fieldHtml('CPF', esc(displayText(c?.cpf)))}
      ${fieldHtml('Endereço', esc(address), true)}
    </div>
  </section>

  ${photosHtml}
  ${linksHtml}

  <p class="footer">Documento gerado pelo sistema RDA · Ficha de produto do laboratório</p>
</body>
</html>`;

  printHtmlDocument(html);
}
