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

/**
 * Selo de origem do Pátio — bloco preto + glifo vetorial grosso.
 * O PNG iOS some na térmica em tamanho pequeno; o traço vetorial fica legível.
 */
const PATIO_ORIGIN_BADGE_SIZE_PX = 58;
/** Espaço reservado acima do QR quando há selo do Pátio (+ legenda). */
const PATIO_ORIGIN_TOP_RESERVE_PX = 80;

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

function fillRoundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + radius, y);
  c.arcTo(x + w, y, x + w, y + h, radius);
  c.arcTo(x + w, y + h, x, y + h, radius);
  c.arcTo(x, y + h, x, y, radius);
  c.arcTo(x, y, x + w, y, radius);
  c.closePath();
  c.fill();
}

/**
 * Selo do Pátio bem legível na B1: quadrado preto + “P” de estacionamento.
 * Traço vetorial grosso — PNG iOS some na térmica em tamanho de etiqueta.
 */
function drawPatioOriginBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
): void {
  const s = Math.max(32, Math.floor(size));
  const radius = Math.max(6, Math.round(s * 0.2));

  // Bloco preto sólido — impossível de perder na térmica.
  ctx.fillStyle = '#000000';
  fillRoundRect(ctx, x, y, s, s, radius);

  const cx = x + s / 2;
  const cy = y + s / 2;
  const discR = s * 0.36;

  // Disco branco (placa de estacionamento) — máximo contraste na térmica.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, discR, 0, Math.PI * 2);
  ctx.fill();

  // “P” preto bem grosso no centro.
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(s * 0.5)}px Arial, Helvetica, sans-serif`;
  ctx.fillText('P', cx, cy + s * 0.02);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
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
  const fromPatio = Boolean(input.fromPatio);
  let qrX = qrEl?.x ?? 6;
  let qrY = qrEl?.y ?? 36;
  let qrSize = qrEl ? Math.min(qrEl.w, qrEl.h) : 0;

  if (fromPatio) {
    const badgeSize = Math.min(
      PATIO_ORIGIN_BADGE_SIZE_PX,
      Math.max(40, Math.floor((qrEl?.w || 168) * 0.34))
    );
    // Empurra o QR para baixo e encolhe um pouco para o selo caber legível.
    if (qrEl?.visible) {
      const topReserve = Math.max(PATIO_ORIGIN_TOP_RESERVE_PX, badgeSize + 8);
      if (qrY < topReserve) {
        const shift = topReserve - qrY;
        qrY = topReserve;
        qrSize = Math.max(96, qrSize - shift);
      }
    }
    const badgeX = qrEl?.visible
      ? qrX + Math.max(0, (qrSize - badgeSize) / 2)
      : 6;
    const badgeY = 4;
    drawPatioOriginBadge(ctx, badgeX, badgeY, badgeSize);
    // Legenda preta sob o selo — reforço se o glifo falhar na térmica.
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.font = '900 13px Arial, Helvetica, sans-serif';
    const captionX = badgeX + badgeSize / 2;
    const captionY = badgeY + badgeSize + 1;
    if (!qrEl?.visible || captionY + 14 <= qrY - 1) {
      ctx.fillText('PÁTIO', captionX, captionY);
    }
    ctx.textAlign = 'left';
  }

  if (qrEl?.visible && qrSize > 0) {
    const qrDataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 0,
      width: qrSize,
      color: { dark: '#000000', light: '#ffffff' },
    });
    const qrImg = await loadImage(qrDataUrl);
    withLabelElementStyle(ctx, qrEl, (c) => {
      c.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
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
