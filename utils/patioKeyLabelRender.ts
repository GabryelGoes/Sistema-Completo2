import { NIIMBOT_LABEL_H_PX, NIIMBOT_LABEL_W_PX } from './niimbotLabelRender';

export type PatioKeyLabelInput = {
  customerName: string;
  vehicleModel: string;
  vehicleColor: string;
  plate: string;
};

const MARGIN = 4;
const HALF_GAP = 2;

function toUpperClean(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('pt-BR');
}

/** Apenas o primeiro nome, em maiúsculas. */
export function formatKeyLabelCustomerName(fullName: string): string {
  const parts = toUpperClean(fullName).split(' ').filter(Boolean);
  return parts[0] || '—';
}

/** No máximo 2 palavras/nomes do modelo, em maiúsculas. */
export function formatKeyLabelVehicleModel(model: string): string {
  const parts = toUpperClean(model).split(' ').filter(Boolean);
  if (parts.length === 0) return '—';
  return parts.slice(0, 2).join(' ');
}

function fitLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const t = text.trim().replace(/\s+/g, ' ') || '—';
  if (ctx.measureText(t).width <= maxWidth) return t;
  let s = t;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}…`;
}

/**
 * Bloco de texto na orientação de leitura da chave:
 * largura = 30 mm (240 px), altura de meia etiqueta ao longo dos 50 mm.
 */
function renderKeyBlock(
  blockW: number,
  blockH: number,
  input: PatioKeyLabelInput
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = blockW;
  canvas.height = blockH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, blockW, blockH);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  const contentW = blockW - MARGIN * 2;
  const lines: Array<{ label: string; value: string }> = [
    { label: 'Cliente:', value: formatKeyLabelCustomerName(input.customerName) },
    { label: 'Carro:', value: formatKeyLabelVehicleModel(input.vehicleModel) },
    { label: 'Cor:', value: toUpperClean(input.vehicleColor) || '—' },
    { label: 'Placa:', value: toUpperClean(input.plate) || '—' },
  ];

  const usableH = blockH - MARGIN * 2;
  const lineSlot = usableH / 4;
  // Fonte +30% em relação ao tamanho anterior (0.72 → 0.936 do slot)
  let fontPx = Math.floor(lineSlot * 0.72 * 1.3);
  fontPx = Math.max(12, Math.min(fontPx, 26));

  const font = `bold ${fontPx}px Arial, Helvetica, sans-serif`;
  const blockTextH = lineSlot * 4;
  let y = MARGIN + Math.max(0, (usableH - blockTextH) / 2);

  for (const row of lines) {
    ctx.font = font;
    const labelText = `${row.label} `;
    const labelW = ctx.measureText(labelText).width;
    ctx.fillText(labelText, MARGIN, y);
    const valueMax = Math.max(16, contentW - labelW);
    ctx.fillText(fitLine(ctx, row.value, valueMax), MARGIN + labelW, y);
    y += lineSlot;
  }

  return canvas;
}

/**
 * Etiqueta de chave — impressão B1 exatamente 50×30 mm (384×240).
 *
 * Conteúdo em orientação VERTICAL (leitura com a etiqueta na chave):
 * - eixo longo 50 mm = altura de leitura
 * - eixo curto 30 mm = largura de leitura
 * - duas cópias empilhadas; a de baixo é rotação visual 180°
 *
 * O bitmap final é rotacionado 90° para o buffer da impressora (50 mm × 30 mm).
 */
export function renderPatioKeyLabelDataUrl(input: PatioKeyLabelInput): string {
  // Retrato lógico: 30 mm × 50 mm
  const portraitW = NIIMBOT_LABEL_H_PX; // 240
  const portraitH = NIIMBOT_LABEL_W_PX; // 384
  const halfH = Math.floor((portraitH - HALF_GAP) / 2);

  const portrait = document.createElement('canvas');
  portrait.width = portraitW;
  portrait.height = portraitH;
  const pctx = portrait.getContext('2d');
  if (!pctx) throw new Error('Canvas 2D indisponível');

  pctx.fillStyle = '#ffffff';
  pctx.fillRect(0, 0, portraitW, portraitH);

  const block = renderKeyBlock(portraitW, halfH, input);

  // Cópia 1 — topo (orientação normal na vertical)
  pctx.drawImage(block, 0, 0);

  // Cópia 2 — base, rotação visual completa 180°
  pctx.save();
  pctx.translate(portraitW, portraitH);
  pctx.rotate(Math.PI);
  pctx.drawImage(block, 0, 0);
  pctx.restore();

  // Buffer da B1: 50 mm (largura) × 30 mm (altura)
  const printW = NIIMBOT_LABEL_W_PX; // 384
  const printH = NIIMBOT_LABEL_H_PX; // 240
  const canvas = document.createElement('canvas');
  canvas.width = printW;
  canvas.height = printH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, printW, printH);

  // 90° horário + 180°: texto vertical na etiqueta física 50×30
  ctx.save();
  ctx.translate(0, printH);
  ctx.rotate(-Math.PI / 2);
  ctx.drawImage(portrait, 0, 0);
  ctx.restore();

  return canvas.toDataURL('image/png');
}
