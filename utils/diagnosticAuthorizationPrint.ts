import {
  DIAGNOSTIC_AUTHORIZATION_PARAGRAPH_CHUNKS,
  DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL,
  DIAGNOSTIC_AUTHORIZATION_TITLE,
} from './diagnosticAuthorizationTerm';

export type DiagnosticAuthorizationPrintVehicle = {
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  plate?: string | null;
  mileageKm?: string | null;
  /** Nome do cliente (exibido no documento). */
  customerName?: string | null;
};

function esc(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clean(v?: string | null): string {
  return (v ?? '').trim();
}

export function formatDiagnosticAuthorizationVehicleLabel(
  brand?: string | null,
  model?: string | null
): string {
  return [clean(brand), clean(model)].filter(Boolean).join(' ') || '—';
}

export function formatDiagnosticAuthorizationSignedAt(
  signedAt?: string | null
): { date: string; time: string } | null {
  if (!signedAt) return null;
  const d = new Date(signedAt);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

function termBodyHtml(): string {
  return DIAGNOSTIC_AUTHORIZATION_PARAGRAPH_CHUNKS.map((chunks) => {
    const inner = chunks
      .map((chunk) =>
        chunk.callout
          ? `<strong class="callout">${esc(chunk.text)}</strong>`
          : `<span>${esc(chunk.text)}</span>`
      )
      .join('');
    return `<p class="term-p">${inner}</p>`;
  }).join('');
}

/**
 * Abre o diálogo nativo de impressão / «Salvar como PDF» com o termo
 * em folha A4 (iframe isolado — não sofre o CSS global de relatórios).
 */
export function printDiagnosticAuthorizationSheet(opts: {
  signatureImageSrc: string;
  signedAt?: string | null;
  vehicle?: DiagnosticAuthorizationPrintVehicle | null;
}): void {
  const signed = formatDiagnosticAuthorizationSignedAt(opts.signedAt);
  const customerName = clean(opts.vehicle?.customerName) || '—';
  const vehicleLabel = formatDiagnosticAuthorizationVehicleLabel(
    opts.vehicle?.vehicleBrand,
    opts.vehicle?.vehicleModel
  );
  const plate = clean(opts.vehicle?.plate).toUpperCase() || '—';
  const kmRaw = clean(opts.vehicle?.mileageKm);
  const km = kmRaw ? kmRaw.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '—';

  // Data/hora só sob a assinatura (não no cabeçalho do documento).
  const signedFoot = signed
    ? `<p class="sign-meta">${esc(signed.date)} — ${esc(signed.time)}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <!-- Título vazio: evita cabeçalho do navegador com data + título duplicado ao imprimir. -->
  <title></title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: #fff;
      color: #18181b;
      font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { padding: 0; }
    .sheet {
      width: 100%;
      max-width: 180mm;
      margin: 0 auto;
      padding: 8mm 4mm;
    }
    .doc-title {
      text-align: center;
      font-size: 15pt;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #09090b;
      line-height: 1.25;
    }
    .divider {
      margin-top: 14px;
      border: 0;
      border-top: 1px solid #e4e4e7;
    }
    .vehicle-grid {
      margin-top: 18px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 16px;
    }
    .vehicle-field {
      min-width: 0;
      padding-bottom: 6px;
      border-bottom: 1px solid #e4e4e7;
    }
    .vehicle-field .label {
      display: block;
      font-size: 8.5pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #71717a;
      margin-bottom: 4px;
    }
    .vehicle-field .value {
      display: block;
      font-size: 12pt;
      font-weight: 700;
      color: #18181b;
      word-break: break-word;
    }
    .term {
      margin-top: 22px;
    }
    .term-p {
      font-size: 12pt;
      line-height: 1.55;
      color: #27272a;
      margin: 0 0 14px;
      text-align: justify;
    }
    .callout {
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: #09090b;
    }
    .sign-block { margin-top: 36px; }
    .sign-label {
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #71717a;
    }
    .sign-pad {
      position: relative;
      margin-top: 18px;
      min-height: 88px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding: 0 8px 10px;
    }
    .sign-pad img {
      position: relative;
      z-index: 1;
      max-height: 72px;
      max-width: 420px;
      width: 100%;
      object-fit: contain;
      object-position: bottom center;
    }
    .sign-pad .baseline {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      border-bottom: 1.5px solid #a1a1aa;
    }
    .sign-meta {
      margin-top: 12px;
      text-align: center;
      font-size: 10pt;
      color: #71717a;
    }
    /* Margens suficientes no papel; cabeçalhos/rodapés do Chrome ficam fora do conteúdo. */
    @page { size: A4; margin: 12mm; }
    @media print {
      .sheet { max-width: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <h1 class="doc-title">${esc(DIAGNOSTIC_AUTHORIZATION_TITLE)}</h1>
    <hr class="divider" />
    <div class="vehicle-grid">
      <div class="vehicle-field">
        <span class="label">Cliente</span>
        <span class="value">${esc(customerName)}</span>
      </div>
      <div class="vehicle-field">
        <span class="label">Veículo</span>
        <span class="value">${esc(vehicleLabel)}</span>
      </div>
      <div class="vehicle-field">
        <span class="label">Placa</span>
        <span class="value">${esc(plate)}</span>
      </div>
      <div class="vehicle-field">
        <span class="label">Quilometragem</span>
        <span class="value">${esc(km === '—' ? km : `Km ${km}`)}</span>
      </div>
    </div>
    <div class="term">${termBodyHtml()}</div>
    <div class="sign-block">
      <p class="sign-label">${esc(DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL)}</p>
      <div class="sign-pad">
        <img src="${esc(opts.signatureImageSrc)}" alt="Assinatura do cliente" />
        <div class="baseline" aria-hidden="true"></div>
      </div>
      ${signedFoot}
    </div>
  </div>
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);

  const idoc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!idoc || !win) {
    iframe.remove();
    return;
  }

  idoc.open();
  idoc.write(html);
  idoc.close();

  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };

  const runPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    } finally {
      setTimeout(cleanup, 1000);
    }
  };

  const imgs = Array.from(idoc.images);
  if (imgs.length === 0) {
    setTimeout(runPrint, 120);
    return;
  }

  let pending = imgs.length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) setTimeout(runPrint, 80);
  };
  imgs.forEach((img) => {
    if (img.complete) done();
    else {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
  });
  // Fallback se a assinatura demorar demais
  setTimeout(() => {
    if (pending > 0) runPrint();
  }, 2500);
}
