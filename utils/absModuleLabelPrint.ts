import QRCode from 'qrcode';
import { printHtmlDocument } from './printHtml.js';
import {
  absModuleKindLabel,
  formatAbsModuleSequence,
} from './workshopAbsModules.js';

export type AbsModuleLabelInput = {
  publicId: string;
  moduleKind?: string | null;
  manufacturer?: string | null;
  application?: string | null;
  /** Alias aceito pelo formulário */
  module_kind?: string | null;
  /** Número de sequência do modelo (#N na etiqueta). */
  sequenceNumber?: number | null;
  sequence_number?: number | null;
  location?: string | null;
  code?: string | null;
  original_code?: string | null;
};

/** Gera data-URL PNG do QR (conteúdo = public_id interno, sem URL externa). */
export async function generateAbsModuleQrDataUrl(publicId: string): Promise<string> {
  return QRCode.toDataURL(publicId, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

/** Etiqueta física orientada à Niimbot: #N grande + QR + ID. */
export async function printAbsModuleLabel(input: AbsModuleLabelInput): Promise<void> {
  const publicId = String(input.publicId || '').trim().toUpperCase();
  if (!publicId) throw new Error('ID do módulo ausente.');
  const qr = await generateAbsModuleQrDataUrl(publicId);
  const kind = absModuleKindLabel(input.moduleKind ?? input.module_kind);
  const seq = formatAbsModuleSequence(input.sequenceNumber ?? input.sequence_number);
  const code = String(input.code || input.original_code || '').trim();
  const location = String(input.location || '').trim();
  const meta = [input.manufacturer, input.application, code].filter(Boolean).join(' · ');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Etiqueta ${publicId}</title>
  <style>
    @page { size: 50mm 30mm; margin: 1.5mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #111;
    }
    .label {
      width: 47mm;
      min-height: 27mm;
      padding: 1.2mm 1.5mm;
      display: grid;
      grid-template-columns: 1fr 18mm;
      grid-template-rows: auto auto 1fr auto;
      column-gap: 1.5mm;
      align-items: start;
    }
    .seq {
      grid-column: 1;
      grid-row: 1;
      font-size: 22pt;
      font-weight: 900;
      line-height: 1;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .brand {
      grid-column: 2;
      grid-row: 1;
      justify-self: end;
      align-self: center;
      width: 7mm;
      height: 7mm;
      object-fit: contain;
    }
    .kind {
      grid-column: 1 / -1;
      grid-row: 2;
      font-size: 7pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #333;
      margin-top: 0.4mm;
    }
    .qr-wrap {
      grid-column: 2;
      grid-row: 3 / 5;
      align-self: center;
      justify-self: end;
    }
    .qr {
      width: 16mm;
      height: 16mm;
      object-fit: contain;
    }
    .meta {
      grid-column: 1;
      grid-row: 3;
      font-size: 6pt;
      color: #444;
      max-width: 28mm;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-top: 0.6mm;
    }
    .id-row {
      grid-column: 1;
      grid-row: 4;
      align-self: end;
    }
    .id {
      font-size: 8.5pt;
      font-weight: 800;
      letter-spacing: 0.04em;
      font-variant-numeric: tabular-nums;
    }
    .loc {
      font-size: 6pt;
      color: #555;
      margin-top: 0.3mm;
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="seq">${seq}</div>
    <img class="brand" src="/logo.png" alt="Rei do ABS" />
    <div class="kind">${kind.toUpperCase().includes('MÓDULO') ? kind.toUpperCase() : `MÓDULO ABS · ${kind.toUpperCase()}`}</div>
    <div class="qr-wrap"><img class="qr" src="${qr}" alt="QR ${publicId}" /></div>
    ${meta ? `<div class="meta">${meta.replace(/</g, '&lt;')}</div>` : '<div class="meta"></div>'}
    <div class="id-row">
      <div class="id">${publicId}</div>
      ${location ? `<div class="loc">${location.replace(/</g, '&lt;')}</div>` : ''}
    </div>
  </div>
</body>
</html>`;

  printHtmlDocument(html);
}
