import QRCode from 'qrcode';
import { buildLabOsQrPayload } from './labOsQrCode';
import { NIIMBOT_LABEL_H_PX, NIIMBOT_LABEL_W_PX } from './niimbotLabelRender';

export type LabOsLabelInput = {
  serviceOrderId: string;
  customerName: string;
  vehicleName: string;
  /** Queixa do cliente (várias linhas). */
  complaint: string;
  /** Compartimento da bancada do laboratório (1–24). */
  benchSlot?: number | null;
};

/** +30% sobre as fontes anteriores (QR permanece 168 px). */
const FONT_SLOT_LABEL = Math.round(11 * 1.3); // 14
const FONT_SLOT_NUM = Math.round(28 * 1.3); // 36 — vaga bem evidente
const FONT_LABEL = Math.round(12 * 1.3); // 16
const FONT_VALUE = Math.round(15 * 1.3); // 20
const FONT_COMPLAINT = Math.round(13 * 1.3); // 17
const LINE_SLOT = Math.round(34 * 1.3); // 44
const LINE_VALUE = Math.round(22 * 1.3); // 29
const LINE_COMPLAINT = Math.round(17 * 1.3); // 22

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

/**
 * Desenha "Rótulo: valor" — valor pode continuar em linhas abaixo (largura total).
 * Retorna o y seguinte.
 */
function drawLabeledBlock(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  labelFont: string,
  valueFont: string,
  lineHeight: number,
  maxLines: number
): number {
  ctx.font = labelFont;
  const labelText = label.endsWith(' ') ? label : `${label} `;
  const labelW = ctx.measureText(labelText).width;

  ctx.font = valueFont;
  const firstMax = Math.max(20, maxWidth - labelW);
  const valueNorm = (value || '').trim().replace(/\s+/g, ' ') || '—';

  // Primeira linha: rótulo + início do valor
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
    wordIdx = words.length; // resto descartado se só 1 linha
  }

  ctx.font = labelFont;
  ctx.fillText(labelText, x, y);
  ctx.font = valueFont;
  ctx.fillText(first || '—', x + labelW, y);

  let used = 1;
  let cy = y + lineHeight;
  const rest = words.slice(wordIdx).join(' ').trim();
  if (rest && maxLines > 1) {
    const more = wrapTextLines(ctx, rest, maxWidth, maxLines - 1);
    for (const line of more) {
      ctx.fillText(line, x, cy);
      cy += lineHeight;
      used += 1;
    }
  }

  return y + used * lineHeight;
}

/**
 * Bloco destacado da vaga: faixa preta com "VAGA" + número grande em branco
 * (máximo contraste na impressão térmica).
 */
function drawBenchSlotBanner(
  ctx: CanvasRenderingContext2D,
  slot: number | null | undefined,
  x: number,
  y: number,
  maxWidth: number
): number {
  const slotLabelFont = `bold ${FONT_SLOT_LABEL}px Arial, Helvetica, sans-serif`;
  const slotNumFont = `bold ${FONT_SLOT_NUM}px Arial, Helvetica, sans-serif`;
  const padX = 6;
  const padY = 3;
  const bannerH = LINE_SLOT;
  const hasSlot = typeof slot === 'number' && Number.isFinite(slot);

  ctx.fillStyle = '#000000';
  ctx.fillRect(x, y, maxWidth, bannerH);

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  const midY = y + bannerH / 2;

  ctx.font = slotLabelFont;
  const tag = 'VAGA';
  ctx.fillText(tag, x + padX, midY);

  const tagW = ctx.measureText(tag).width;
  ctx.font = slotNumFont;
  const numText = hasSlot ? String(Math.trunc(slot)) : '—';
  ctx.fillText(numText, x + padX + tagW + 8, midY);

  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';
  return y + bannerH + padY;
}

/** Renderiza etiqueta 50×30 mm (384×240): QR à esquerda + textos à direita. */
export async function renderLabOsLabelDataUrl(input: LabOsLabelInput): Promise<string> {
  const payload = buildLabOsQrPayload(input.serviceOrderId);
  const w = NIIMBOT_LABEL_W_PX;
  const h = NIIMBOT_LABEL_H_PX;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  const qrSize = 168; // tamanho do QR inalterado
  const qrX = 6;
  const qrY = Math.floor((h - qrSize) / 2);
  const textX = qrX + qrSize + 8;
  const textMax = w - textX - 8;

  const qrDataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: qrSize,
    color: { dark: '#000000', light: '#ffffff' },
  });
  const qrImg = await loadImage(qrDataUrl);
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  const labelFont = `bold ${FONT_LABEL}px Arial, Helvetica, sans-serif`;
  const valueFont = `bold ${FONT_VALUE}px Arial, Helvetica, sans-serif`;
  const complaintFont = `${FONT_COMPLAINT}px Arial, Helvetica, sans-serif`;

  let y = 4;

  y = drawBenchSlotBanner(ctx, input.benchSlot, textX, y, textMax);

  y = drawLabeledBlock(
    ctx,
    'Cliente:',
    input.customerName || '—',
    textX,
    y,
    textMax,
    labelFont,
    valueFont,
    LINE_VALUE,
    2
  );

  y = drawLabeledBlock(
    ctx,
    'Veículo:',
    input.vehicleName || '—',
    textX,
    y,
    textMax,
    labelFont,
    valueFont,
    LINE_VALUE,
    2
  );

  // Queixa: rótulo na primeira linha; texto completo em várias linhas abaixo
  y = drawLabeledBlock(
    ctx,
    'Queixa:',
    input.complaint || '—',
    textX,
    y,
    textMax,
    labelFont,
    complaintFont,
    LINE_COMPLAINT,
    Math.max(1, Math.floor((h - 4 - y) / LINE_COMPLAINT))
  );

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
