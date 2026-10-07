import QRCode from 'qrcode';
import { buildLabOsQrPayload } from './labOsQrCode';
import {
  cssFontForElement,
  loadLabelTemplate,
  type LabelElementDef,
  type LabelTemplateLayout,
} from './labelTemplates';
import {
  formatLabLocationLabelBanner,
  resolveLabLocation,
} from './labLocation';
import { NIIMBOT_LABEL_H_PX, NIIMBOT_LABEL_W_PX } from './niimbotLabelRender';

export type LabOsLabelInput = {
  serviceOrderId: string;
  customerName: string;
  vehicleName: string;
  /** Queixa do cliente (várias linhas). */
  complaint: string;
  /** Compartimento do depósito/bancada (1–24). */
  benchSlot?: number | null;
  /** Endereço na oficina (letra A–X). */
  oficinaShelf?: string | null;
  /** Na fila do depósito. */
  benchQueuedAt?: string | null;
};

/** Quebra texto em linhas que cabem em maxWidth (até maxLines). */
function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const raw = text.trim().replace(/\s+/g, ' ');
  if (!raw) return ['—'];
  if (maxLines < 1) return [];

  const words = raw.split(' ');
  const lines: string[] = [];
  let current = '';

  const fit = (s: string): string => {
    if (ctx.measureText(s).width <= maxWidth) return s;
    let t = s;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
    return `${t}…`;
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(fit(word));
      current = '';
    }
    if (lines.length === maxLines - 1) {
      const rest = [current, ...words.slice(i + (current === word ? 1 : 0))]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (rest) lines.push(fit(rest));
      return lines.slice(0, maxLines);
    }
  }
  if (current && lines.length < maxLines) lines.push(fit(current));
  return lines.length ? lines : ['—'];
}

function drawBanner(
  ctx: CanvasRenderingContext2D,
  elDef: LabelElementDef,
  value: string
): void {
  if (!elDef.visible) return;
  const { x, y, w, h } = elDef;
  ctx.fillStyle = '#000000';
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  const midY = y + h / 2;
  const padX = 6;

  const tag = (elDef.labelText || '').trim();
  ctx.font = cssFontForElement(elDef, elDef.fontSize);
  if (tag) ctx.fillText(tag, x + padX, midY);

  const tagW = tag ? ctx.measureText(tag).width : 0;
  ctx.font = cssFontForElement(elDef, elDef.valueFontSize || elDef.fontSize);
  const numText = value.trim() || '—';
  ctx.fillText(numText, x + padX + (tag ? tagW + 8 : 0), midY);

  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';
}

function drawLabeledField(
  ctx: CanvasRenderingContext2D,
  elDef: LabelElementDef,
  value: string
): void {
  if (!elDef.visible) return;
  const { x, y, w } = elDef;
  const labelFont = cssFontForElement(elDef, elDef.fontSize);
  const valueFont = cssFontForElement(
    { ...elDef, fontWeight: elDef.fontWeight },
    elDef.valueFontSize || elDef.fontSize
  );
  const lineHeight = Math.max(
    (elDef.valueFontSize || elDef.fontSize) * 1.15,
    elDef.fontSize * 1.15
  );

  ctx.font = labelFont;
  const labelText = elDef.labelText
    ? elDef.labelText.endsWith(' ')
      ? elDef.labelText
      : `${elDef.labelText} `
    : '';
  const labelW = labelText ? ctx.measureText(labelText).width : 0;

  ctx.font = valueFont;
  const firstMax = Math.max(20, w - labelW);
  const valueNorm = (value || '').trim().replace(/\s+/g, ' ') || '—';

  const words = valueNorm.split(' ');
  let first = '';
  let wordIdx = 0;
  for (; wordIdx < words.length; wordIdx++) {
    const next = first ? `${first} ${words[wordIdx]}` : words[wordIdx]!;
    if (ctx.measureText(next).width <= firstMax) first = next;
    else break;
  }
  if (!first && words[0]) {
    let t = words[0];
    while (t.length > 1 && ctx.measureText(`${t}…`).width > firstMax) t = t.slice(0, -1);
    first = `${t}…`;
    wordIdx = words.length;
  }

  ctx.textBaseline = 'top';
  ctx.fillStyle = '#000000';
  if (labelText) {
    ctx.font = labelFont;
    ctx.fillText(labelText, x, y);
  }
  ctx.font = valueFont;
  ctx.fillText(first || '—', x + labelW, y);

  let cy = y + lineHeight;
  const rest = words.slice(wordIdx).join(' ').trim();
  if (rest && elDef.maxLines > 1) {
    const more = wrapTextLines(ctx, rest, w, elDef.maxLines - 1);
    for (const line of more) {
      ctx.fillText(line, x, cy);
      cy += lineHeight;
    }
  }
}

function findEl(layout: LabelTemplateLayout, id: string): LabelElementDef | undefined {
  return layout.elements.find((e) => e.id === id);
}

/** Renderiza etiqueta 50×30 mm (384×240) com layout editável. */
export async function renderLabOsLabelDataUrl(
  input: LabOsLabelInput,
  layoutInput?: LabelTemplateLayout | null
): Promise<string> {
  const layout = layoutInput
    ? layoutInput
    : loadLabelTemplate('lab_os');
  const payload = buildLabOsQrPayload(input.serviceOrderId);
  const w = layout.canvasW || NIIMBOT_LABEL_W_PX;
  const h = layout.canvasH || NIIMBOT_LABEL_H_PX;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  const qrEl = findEl(layout, 'qr');
  if (qrEl?.visible) {
    const qrSize = Math.min(qrEl.w, qrEl.h);
    const qrDataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: qrSize,
      color: { dark: '#000000', light: '#ffffff' },
    });
    const qrImg = await loadImage(qrDataUrl);
    ctx.drawImage(qrImg, qrEl.x, qrEl.y, qrSize, qrSize);
  }

  // Um endereço ativo na etiqueta: OFICINA C | DEP 07 | DEP FILA
  const loc = resolveLabLocation({
    oficinaShelf: input.oficinaShelf,
    benchSlot: input.benchSlot,
    benchQueuedAt: input.benchQueuedAt,
  });
  const banner = formatLabLocationLabelBanner(loc);
  const locationEl =
    findEl(layout, 'location') ??
    (loc.kind === 'oficina'
      ? findEl(layout, 'oficina')
      : findEl(layout, 'deposito') ?? findEl(layout, 'oficina'));
  if (locationEl?.visible) {
    drawBanner(ctx, { ...locationEl, labelText: banner.tag }, banner.value);
  }
  // Elementos legados: ocultos se já desenhamos o local ativo
  for (const legacyId of ['oficina', 'deposito'] as const) {
    if (locationEl?.id === legacyId) continue;
    const legacy = findEl(layout, legacyId);
    if (legacy && legacy.id !== locationEl?.id) {
      // não desenha o outro endereço — um só ativo
    }
  }

  const customerEl = findEl(layout, 'customer');
  if (customerEl) drawLabeledField(ctx, customerEl, input.customerName || '—');

  const vehicleEl = findEl(layout, 'vehicle');
  if (vehicleEl) drawLabeledField(ctx, vehicleEl, input.vehicleName || '—');

  const complaintEl = findEl(layout, 'complaint');
  if (complaintEl) drawLabeledField(ctx, complaintEl, input.complaint || '—');

  return canvas.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao montar QR Code'));
    img.src = src;
  });
}
