import type { ErrorBulletinDetail } from '../services/apiService';
import { printHtmlDocument } from './printHtml';
import { TECHNICAL_BULLETINS_MODULE_LABEL } from '../constants/errorBulletinIcon';
import { isAttachmentImage } from './attachmentPreviewHelpers';

function esc(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function parseDtcLines(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function section(title: string, body: string | null | undefined): string {
  const text = (body ?? '').trim();
  if (!text) return '';
  return `
    <section class="sec">
      <h2 class="sec-title">${esc(title)}</h2>
      <div class="sec-body">${esc(text)}</div>
    </section>`;
}

export function printErrorBulletin(detail: ErrorBulletinDetail): void {
  const vehicle = [detail.vehicleBrand, detail.vehicleModel, detail.vehicleYear].filter(Boolean).join(' ');
  const dtcs = parseDtcLines(detail.dtcCodes);
  const dtcHtml = dtcs.length
    ? `<div class="dtc-row">${dtcs.map((c) => `<span class="dtc">${esc(c)}</span>`).join('')}</div>`
    : '';
  const tags = (detail.tags ?? []).filter(Boolean);
  const tagHtml = tags.length
    ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>`
    : '';
  const images = (detail.attachments ?? []).filter(isAttachmentImage);
  const photosHtml = images.length
    ? `<section class="sec"><h2 class="sec-title">Fotos</h2><div class="photos">${images
        .map(
          (img) =>
            `<figure class="photo"><img src="${esc(img.url)}" alt="${esc(img.name)}" /><figcaption>${esc(img.name)}</figcaption></figure>`
        )
        .join('')}</div></section>`
    : '';
  const dateStr = new Date(detail.updatedAt || detail.createdAt).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${esc(detail.title || TECHNICAL_BULLETINS_MODULE_LABEL)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #18181b; margin: 0; padding: 0; background: #fff; font-size: 11pt; line-height: 1.45; }
  .page { max-width: 180mm; margin: 0 auto; }
  .head { border-bottom: 3px solid #f59e0b; padding-bottom: 10px; margin-bottom: 18px; }
  .kicker { font-family: system-ui, sans-serif; font-size: 9pt; letter-spacing: 0.12em; text-transform: uppercase; color: #b45309; font-weight: 700; }
  h1 { font-size: 20pt; margin: 6px 0 4px; line-height: 1.2; }
  .meta { font-family: system-ui, sans-serif; font-size: 9.5pt; color: #52525b; }
  .vehicle { margin-top: 8px; font-family: system-ui, sans-serif; font-size: 10pt; }
  .plate { display: inline-block; background: #27272a; color: #fff; font-family: ui-monospace, monospace; font-size: 9pt; font-weight: 700; padding: 2px 8px; border-radius: 4px; margin-left: 6px; }
  .sec { margin: 0 0 14px; page-break-inside: avoid; }
  .sec-title { font-family: system-ui, sans-serif; font-size: 8.5pt; letter-spacing: 0.1em; text-transform: uppercase; color: #92400e; margin: 0 0 6px; font-weight: 700; border-left: 3px solid #f59e0b; padding-left: 8px; }
  .sec-body { white-space: pre-wrap; }
  .dtc-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 14px; }
  .dtc { font-family: ui-monospace, monospace; font-size: 9pt; font-weight: 700; background: #f59e0b; color: #fff; padding: 3px 8px; border-radius: 4px; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .tag { font-family: system-ui, sans-serif; font-size: 8.5pt; background: #f4f4f5; border: 1px solid #e4e4e7; padding: 2px 8px; border-radius: 999px; }
  .photos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .photo { margin: 0; page-break-inside: avoid; }
  .photo img { width: 100%; max-height: 70mm; object-fit: contain; border: 1px solid #e4e4e7; border-radius: 6px; background: #fafafa; }
  .photo figcaption { font-family: system-ui, sans-serif; font-size: 8pt; color: #71717a; margin-top: 4px; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e4e4e7; font-family: system-ui, sans-serif; font-size: 8.5pt; color: #71717a; }
</style>
</head>
<body>
<div class="page">
  <header class="head">
    <div class="kicker">${esc(TECHNICAL_BULLETINS_MODULE_LABEL)}</div>
    <h1>${esc(detail.title || vehicle || 'Boletim técnico')}</h1>
    <div class="meta">Atualizado em ${esc(dateStr)}${detail.createdByName ? ` · ${esc(detail.createdByName)}` : ''}</div>
    ${vehicle || detail.plate || detail.engineInfo
      ? `<div class="vehicle">${esc(vehicle)}${detail.plate ? `<span class="plate">${esc(detail.plate)}</span>` : ''}${detail.engineInfo ? ` · ${esc(detail.engineInfo)}` : ''}</div>`
      : ''}
  </header>
  ${dtcHtml}
  ${section('Sintomas / defeito', detail.symptoms)}
  ${section('Diagnóstico', detail.possibleCauses)}
  ${section('Possíveis causas', detail.probableCauses)}
  ${section('Solução aplicada', detail.solution)}
  ${section('Observações internas', detail.notes)}
  ${tagHtml ? `<section class="sec"><h2 class="sec-title">Tags</h2>${tagHtml}</section>` : ''}
  ${photosHtml}
  <footer class="footer">Documento gerado pelo sistema RDA · ${esc(TECHNICAL_BULLETINS_MODULE_LABEL)}</footer>
</div>
</body>
</html>`;

  printHtmlDocument(html);
}
