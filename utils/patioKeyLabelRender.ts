import { NIIMBOT_LABEL_H_PX, NIIMBOT_LABEL_W_PX } from './niimbotLabelRender';

export type PatioKeyLabelInput = {
  customerName: string;
  vehicleModel: string;
  vehicleColor: string;
  plate: string;
};

const MARGIN = 5;
const HALF_GAP = 2; // folga mínima entre as duas cópias

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

/** Desenha o bloco único (Cliente / Carro / Cor / Placa) em um canvas halfH. */
function renderKeyBlock(
  w: number,
  halfH: number,
  input: PatioKeyLabelInput
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = halfH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, halfH);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  const contentW = w - MARGIN * 2;
  const lines: Array<{ label: string; value: string }> = [
    { label: 'Cliente:', value: input.customerName || '—' },
    { label: 'Carro:', value: input.vehicleModel || '—' },
    { label: 'Cor:', value: input.vehicleColor || '—' },
    { label: 'Placa:', value: (input.plate || '—').toUpperCase() },
  ];

  // Fonte o maior possível que caiba 4 linhas com margem
  const usableH = halfH - MARGIN * 2;
  const lineSlot = usableH / 4;
  let fontPx = Math.floor(lineSlot * 0.78);
  fontPx = Math.max(11, Math.min(fontPx, 22));

  const labelFont = `bold ${fontPx}px Arial, Helvetica, sans-serif`;
  const valueFont = `bold ${fontPx}px Arial, Helvetica, sans-serif`;

  // Centraliza o bloco verticalmente na meia etiqueta
  const blockH = lineSlot * 4;
  let y = MARGIN + Math.max(0, (usableH - blockH) / 2);

  for (const row of lines) {
    ctx.font = labelFont;
    const labelText = `${row.label} `;
    const labelW = ctx.measureText(labelText).width;
    ctx.fillText(labelText, MARGIN, y);

    ctx.font = valueFont;
    const valueMax = Math.max(20, contentW - labelW);
    ctx.fillText(fitLine(ctx, row.value, valueMax), MARGIN + labelW, y);
    y += lineSlot;
  }

  return canvas;
}

/**
 * Etiqueta de chave do Pátio — exatamente 50×30 mm (384×240 @ 203 dpi).
 * Duas cópias do mesmo bloco: superior normal, inferior rotacionada 180°.
 */
export function renderPatioKeyLabelDataUrl(input: PatioKeyLabelInput): string {
  const w = NIIMBOT_LABEL_W_PX;
  const h = NIIMBOT_LABEL_H_PX;
  const halfH = Math.floor((h - HALF_GAP) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  const block = renderKeyBlock(w, halfH, input);

  // Cópia 1 — orientação normal (metade superior)
  ctx.drawImage(block, 0, 0);

  // Cópia 2 — rotação visual completa de 180° (metade inferior)
  ctx.save();
  ctx.translate(w, h);
  ctx.rotate(Math.PI);
  ctx.drawImage(block, 0, 0);
  ctx.restore();

  return canvas.toDataURL('image/png');
}
