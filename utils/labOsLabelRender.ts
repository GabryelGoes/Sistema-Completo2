import QRCode from 'qrcode';
import { buildLabOsQrPayload } from './labOsQrCode';
import { withLabelElementStyle } from './labelElementStyle';
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

const PATIO_ORIGIN_ICON_SRC = '/icons/patio-ios.png';
/** Ícone de origem acima do QR (layout padrão 50×30). */
const PATIO_ORIGIN_ICON_SIZE_PX = 28;

export type LabOsLabelInput = {
  serviceOrderId: string;
  customerName: string;
  vehicleName: string;
  /** Queixa do cliente (várias linhas). */
  complaint: string;
  /** Compartimento do depósito/bancada (1–24). */
  benchSlot?: number | null;
  /** Flag de localização Oficina (sem letra). */
  oficinaShelf?: string | null;
  /** Na fila do depósito. */
  benchQueuedAt?: string | null;
  /**
   * Serviço encaminhado do pátio: na etiqueta aparece o ícone do Pátio
   * (sem o texto «Serviço enviado do pátio»).
   */
  fromPatio?: boolean;
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
  withLabelElementStyle(ctx, elDef, (c) => {
    const { x, y, w, h } = elDef;
    c.fillStyle = '#000000';
    c.fillRect(x, y, w, h);

    c.fillStyle = '#ffffff';
    c.textBaseline = 'middle';
    const midY = y + h / 2;
    const padX = 6;

    const tag = (elDef.labelText || '').trim();
    c.font = cssFontForElement(elDef, elDef.fontSize);
    if (tag) c.fillText(tag, x + padX, midY);

    const tagW = tag ? c.measureText(tag).width : 0;
    c.font = cssFontForElement(elDef, elDef.valueFontSize || elDef.fontSize);
    const numText = value.trim() || '—';
    c.fillText(numText, x + padX + (tag ? tagW + 8 : 0), midY);

    c.fillStyle = '#000000';
    c.textBaseline = 'top';
  });
}

function drawLabeledField(
  ctx: CanvasRenderingContext2D,
  elDef: LabelElementDef,
  value: string
): void {
  if (!elDef.visible) return;
  withLabelElementStyle(ctx, elDef, (c) => {
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

    c.font = labelFont;
    const labelText = elDef.labelText
      ? elDef.labelText.endsWith(' ')
        ? elDef.labelText
        : `${elDef.labelText} `
      : '';
    const labelW = labelText ? c.measureText(labelText).width : 0;

    c.font = valueFont;
    const firstMax = Math.max(20, w - labelW);
    const valueNorm = (value || '').trim().replace(/\s+/g, ' ') || '—';

    const words = valueNorm.split(' ');
    let first = '';
    let wordIdx = 0;
    for (; wordIdx < words.length; wordIdx++) {
      const next = first ? `${first} ${words[wordIdx]}` : words[wordIdx]!;
      if (c.measureText(next).width <= firstMax) first = next;
      else break;
    }
    if (!first && words[0]) {
      let t = words[0];
      while (t.length > 1 && c.measureText(`${t}…`).width > firstMax) t = t.slice(0, -1);
      first = `${t}…`;
      wordIdx = words.length;
    }

    c.textBaseline = 'top';
    c.fillStyle = '#000000';
    if (labelText) {
      c.font = labelFont;
      c.fillText(labelText, x, y);
    }
    c.font = valueFont;
    c.fillText(first || '—', x + labelW, y);

    let cy = y + lineHeight;
    const rest = words.slice(wordIdx).join(' ').trim();
    if (rest && elDef.maxLines > 1) {
      const more = wrapTextLines(c, rest, w, elDef.maxLines - 1);
      for (const line of more) {
        c.fillText(line, x, cy);
        cy += lineHeight;
      }
    }
  });
}

function findEl(layout: LabelTemplateLayout, id: string): LabelElementDef | undefined {
  return layout.elements.find((e) => e.id === id);
}

/**
 * Desenha o ícone do Pátio em preto sólido (impressão térmica).
 * Substitui o texto «Serviço enviado do pátio» na etiqueta.
 */
async function drawPatioOriginIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
): Promise<void> {
  const s = Math.max(8, Math.floor(size));
  try {
    const img = await loadImage(PATIO_ORIGIN_ICON_SRC);
    const off = document.createElement('canvas');
    off.width = s;
    off.height = s;
    const octx = off.getContext('2d');
    if (!octx) return;
    octx.clearRect(0, 0, s, s);
    octx.drawImage(img, 0, 0, s, s);
    const data = octx.getImageData(0, 0, s, s);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i]!;
      const g = px[i + 1]!;
      const b = px[i + 2]!;
      const a = px[i + 3]!;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (a < 40 || lum > 245) {
        px[i + 3] = 0;
      } else {
        px[i] = 0;
        px[i + 1] = 0;
        px[i + 2] = 0;
        px[i + 3] = 255;
      }
    }
    octx.putImageData(data, 0, 0);
    ctx.drawImage(off, x, y, s, s);
  } catch {
    // Sem ícone: etiqueta segue sem bloquear a impressão.
  }
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
  if (input.fromPatio) {
    const iconSize = Math.min(
      PATIO_ORIGIN_ICON_SIZE_PX,
      qrEl?.visible ? Math.max(8, qrEl.y - 4) : PATIO_ORIGIN_ICON_SIZE_PX
    );
    const iconX = qrEl?.visible
      ? qrEl.x + Math.max(0, (Math.min(qrEl.w, qrEl.h) - iconSize) / 2)
      : 6;
    const iconY = 4;
    await drawPatioOriginIcon(ctx, iconX, iconY, iconSize);
  }

  if (qrEl?.visible) {
    const qrSize = Math.min(qrEl.w, qrEl.h);
    const qrDataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: qrSize,
      color: { dark: '#000000', light: '#ffffff' },
    });
    const qrImg = await loadImage(qrDataUrl);
    withLabelElementStyle(ctx, qrEl, (c) => {
      c.drawImage(qrImg, qrEl.x, qrEl.y, qrSize, qrSize);
    });
  }

  // Etiqueta: só o número da vaga no laboratório (sem letra da oficina).
  const loc = resolveLabLocation({
    oficinaShelf: input.oficinaShelf,
    benchSlot: input.benchSlot,
    benchQueuedAt: input.benchQueuedAt,
  });
  const banner = formatLabLocationLabelBanner(loc);
  const locationEl =
    findEl(layout, 'location') ??
    findEl(layout, 'deposito') ??
    findEl(layout, 'oficina');
  if (locationEl?.visible) {
    drawBanner(ctx, { ...locationEl, labelText: banner.tag || '' }, banner.value);
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
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao montar QR Code'));
    img.src = src;
  });
}
