import QRCode from 'qrcode';
import { printHtmlDocument } from './printHtml.js';
import { absModuleKindLabel } from './workshopAbsModules.js';

export type AbsModuleLabelInput = {
  publicId: string;
  moduleKind?: string | null;
  manufacturer?: string | null;
  application?: string | null;
  /** Alias aceito pelo formulário */
  module_kind?: string | null;
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

/** Etiqueta física: REI DO ABS + QR + ID textual. */
export async function printAbsModuleLabel(input: AbsModuleLabelInput): Promise<void> {
  const publicId = String(input.publicId || '').trim().toUpperCase();
  if (!publicId) throw new Error('ID do módulo ausente.');
  const qr = await generateAbsModuleQrDataUrl(publicId);
  const kind = absModuleKindLabel(input.moduleKind ?? input.module_kind);
  const meta = [input.manufacturer, input.application].filter(Boolean).join(' · ');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Etiqueta ${publicId}</title>
  <style>
    @page { size: 60mm 40mm; margin: 2mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #111;
    }
    .label {
      width: 56mm;
      min-height: 36mm;
      padding: 2mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1.2mm;
      text-align: center;
    }
    .brand {
      font-size: 9pt;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .qr {
      width: 22mm;
      height: 22mm;
      object-fit: contain;
    }
    .id {
      font-size: 11pt;
      font-weight: 800;
      letter-spacing: 0.06em;
      font-variant-numeric: tabular-nums;
    }
    .kind {
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #333;
    }
    .meta {
      font-size: 6.5pt;
      color: #555;
      max-width: 52mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="brand">REI DO ABS</div>
    <img class="qr" src="${qr}" alt="QR ${publicId}" />
    <div class="id">${publicId}</div>
    <div class="kind">${kind.toUpperCase().includes('MÓDULO') ? kind.toUpperCase() : `MÓDULO ABS · ${kind.toUpperCase()}`}</div>
    ${meta ? `<div class="meta">${meta.replace(/</g, '&lt;')}</div>` : ''}
  </div>
</body>
</html>`;

  printHtmlDocument(html);
}
