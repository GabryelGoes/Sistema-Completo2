import { drawCode128B } from './niimbotCode128';

export const NIIMBOT_LABEL_W_PX = 384;
export const NIIMBOT_LABEL_H_PX = 240;
export const NIIMBOT_LABEL_MARGIN_PX = 10;

export type NiimbotPartLabelInput = {
  /** Nome do produto (linha principal). */
  name: string;
  /** Código interno impresso no Code128 e como texto legível. */
  code: string;
  /** Marca no topo; padrão REI DO ABS. */
  brand?: string;
};

/**
 * Prioridade do código na etiqueta: numeric_code → barcode → original_code.
 */
export function resolveWorkshopPartLabelCode(part: {
  numeric_code?: string | null;
  barcode?: string | null;
  original_code?: string | null;
}): string {
  const pick = (v: string | null | undefined) => String(v ?? '').trim();
  return pick(part.numeric_code) || pick(part.barcode) || pick(part.original_code) || '';
}

function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const t = text.trim();
  if (!t) return '';
  if (ctx.measureText(t).width <= maxWidth) return t;
  let s = t;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}…`;
}

/** Renderiza a etiqueta 50×30 mm (384×240 @ 203 dpi) e devolve data URL PNG. */
export function renderNiimbotPartLabelDataUrl(input: NiimbotPartLabelInput): string {
  const code = String(input.code ?? '').trim();
  if (!code) throw new Error('Código interno ausente para a etiqueta.');

  const brand = (input.brand ?? 'REI DO ABS').trim() || 'REI DO ABS';
  const name = String(input.name ?? '').trim() || 'Produto';

  const w = NIIMBOT_LABEL_W_PX;
  const h = NIIMBOT_LABEL_H_PX;
  const m = NIIMBOT_LABEL_MARGIN_PX;
  const contentW = w - m * 2;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  // Marca
  ctx.font = 'bold 22px Arial, Helvetica, sans-serif';
  ctx.fillText(truncateToWidth(ctx, brand, contentW), m, 8);

  // Nome do produto
  ctx.font = 'bold 18px Arial, Helvetica, sans-serif';
  const nameY = 36;
  ctx.fillText(truncateToWidth(ctx, name, contentW), m, nameY);

  // Linha "Código: …"
  ctx.font = '14px Arial, Helvetica, sans-serif';
  const codeLine = truncateToWidth(ctx, `Código: ${code}`, contentW);
  ctx.fillText(codeLine, m, 62);

  // Code128
  const barY = 88;
  const barH = 96;
  const barX = m;
  const barW = contentW;
  drawCode128B(ctx, code, barX, barY, barW, barH);

  // Texto legível sob o código de barras
  ctx.font = 'bold 16px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const human = truncateToWidth(ctx, code, contentW);
  ctx.fillText(human, w / 2, h - 14);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
}

/** Etiqueta de teste (conectividade / alinhamento). */
export function renderNiimbotTestLabelDataUrl(): string {
  return renderNiimbotPartLabelDataUrl({
    brand: 'REI DO ABS',
    name: 'ETIQUETA DE TESTE',
    code: 'TESTE-B1',
  });
}
