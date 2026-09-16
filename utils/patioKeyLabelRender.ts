import { NIIMBOT_LABEL_H_PX, NIIMBOT_LABEL_W_PX } from './niimbotLabelRender';

export type PatioKeyLabelInput = {
  customerName: string;
  vehicleModel: string;
  vehicleColor: string;
  plate: string;
};

export type PatioKeyLabelFontFamily =
  | 'Arial'
  | 'Helvetica'
  | 'Verdana'
  | 'Tahoma'
  | 'Trebuchet MS'
  | 'Georgia'
  | 'Times New Roman'
  | 'Courier New'
  | 'Impact';

export type PatioKeyLabelAlign = 'left' | 'center' | 'right';
export type PatioKeyLabelVAlign = 'top' | 'middle' | 'bottom';
export type PatioKeyLabelWeight = 'normal' | 'bold' | '900';

/** Estilo editável da etiqueta de chave (persistido no dispositivo). */
export type PatioKeyLabelStyle = {
  fontFamily: PatioKeyLabelFontFamily;
  /** Tamanho base em px no bloco retrato (30 mm de largura). */
  fontSize: number;
  fontWeight: PatioKeyLabelWeight;
  letterSpacing: number;
  /** Multiplicador do espaçamento entre linhas (1 = padrão). */
  lineSpacing: number;
  align: PatioKeyLabelAlign;
  vAlign: PatioKeyLabelVAlign;
  /** Deslocamento horizontal no bloco (px). */
  offsetX: number;
  /** Deslocamento vertical no bloco (px). */
  offsetY: number;
  /** Margem interna do bloco (px). */
  margin: number;
  /** Espaço entre as duas cópias (px). */
  halfGap: number;
  /** Mostrar rótulos Cliente:/Carro:/… */
  showLabels: boolean;
};

export const PATIO_KEY_LABEL_FONTS: Array<{ value: PatioKeyLabelFontFamily; label: string }> = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Tahoma', label: 'Tahoma' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Impact', label: 'Impact' },
];

export const DEFAULT_PATIO_KEY_LABEL_STYLE: PatioKeyLabelStyle = {
  fontFamily: 'Arial',
  fontSize: 18,
  fontWeight: 'bold',
  letterSpacing: 0,
  lineSpacing: 1,
  align: 'left',
  vAlign: 'middle',
  offsetX: 0,
  offsetY: 0,
  margin: 4,
  halfGap: 2,
  showLabels: true,
};

const STYLE_STORAGE_KEY = 'rda.patioKeyLabelStyle.v1';

export function loadPatioKeyLabelStyle(): PatioKeyLabelStyle {
  try {
    const raw = localStorage.getItem(STYLE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PATIO_KEY_LABEL_STYLE };
    const parsed = JSON.parse(raw) as Partial<PatioKeyLabelStyle>;
    return normalizePatioKeyLabelStyle({ ...DEFAULT_PATIO_KEY_LABEL_STYLE, ...parsed });
  } catch {
    return { ...DEFAULT_PATIO_KEY_LABEL_STYLE };
  }
}

export function savePatioKeyLabelStyle(style: PatioKeyLabelStyle): void {
  try {
    localStorage.setItem(STYLE_STORAGE_KEY, JSON.stringify(normalizePatioKeyLabelStyle(style)));
  } catch {
    /* ignore quota */
  }
}

export function normalizePatioKeyLabelStyle(style: PatioKeyLabelStyle): PatioKeyLabelStyle {
  return {
    fontFamily: PATIO_KEY_LABEL_FONTS.some((f) => f.value === style.fontFamily)
      ? style.fontFamily
      : DEFAULT_PATIO_KEY_LABEL_STYLE.fontFamily,
    fontSize: clamp(Math.round(style.fontSize), 8, 36),
    fontWeight:
      style.fontWeight === 'normal' || style.fontWeight === 'bold' || style.fontWeight === '900'
        ? style.fontWeight
        : 'bold',
    letterSpacing: clamp(Number(style.letterSpacing) || 0, -2, 8),
    lineSpacing: clamp(Number(style.lineSpacing) || 1, 0.7, 1.8),
    align: style.align === 'center' || style.align === 'right' ? style.align : 'left',
    vAlign: style.vAlign === 'top' || style.vAlign === 'bottom' ? style.vAlign : 'middle',
    offsetX: clamp(Math.round(style.offsetX), -40, 40),
    offsetY: clamp(Math.round(style.offsetY), -40, 40),
    margin: clamp(Math.round(style.margin), 0, 16),
    halfGap: clamp(Math.round(style.halfGap), 0, 12),
    showLabels: style.showLabels !== false,
  };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

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

/** Corta sem reticências — se não couber, remove caracteres até caber. */
function fitLineNoEllipsis(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const t = text.trim().replace(/\s+/g, ' ') || '—';
  if (ctx.measureText(t).width <= maxWidth) return t;
  let s = t;
  while (s.length > 1 && ctx.measureText(s).width > maxWidth) {
    s = s.slice(0, -1);
  }
  return s || '';
}

function cssFont(style: PatioKeyLabelStyle): string {
  const weight =
    style.fontWeight === '900' ? '900' : style.fontWeight === 'normal' ? '400' : '700';
  return `${weight} ${style.fontSize}px "${style.fontFamily}", Arial, sans-serif`;
}

function renderKeyBlock(
  blockW: number,
  blockH: number,
  input: PatioKeyLabelInput,
  style: PatioKeyLabelStyle
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

  const margin = style.margin;
  const contentW = Math.max(8, blockW - margin * 2);
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Cliente:', value: formatKeyLabelCustomerName(input.customerName) },
    { label: 'Carro:', value: formatKeyLabelVehicleModel(input.vehicleModel) },
    { label: 'Cor:', value: toUpperClean(input.vehicleColor) || '—' },
    { label: 'Placa:', value: toUpperClean(input.plate) || '—' },
  ];

  const font = cssFont(style);
  ctx.font = font;
  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
      `${style.letterSpacing}px`;
  } catch {
    /* letterSpacing pode não existir em alguns browsers */
  }

  const lineHeight = Math.max(style.fontSize * style.lineSpacing, style.fontSize);
  const blockTextH = lineHeight * rows.length;
  const usableH = Math.max(0, blockH - margin * 2);

  let startY = margin;
  if (style.vAlign === 'middle') {
    startY = margin + Math.max(0, (usableH - blockTextH) / 2);
  } else if (style.vAlign === 'bottom') {
    startY = margin + Math.max(0, usableH - blockTextH);
  }
  startY += style.offsetY;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const y = startY + i * lineHeight;
    ctx.font = font;

    const labelText = style.showLabels ? `${row.label} ` : '';
    const labelW = style.showLabels ? ctx.measureText(labelText).width : 0;
    const valueMax = Math.max(8, contentW - labelW);
    const valueText = fitLineNoEllipsis(ctx, row.value, valueMax);
    const fullW = labelW + ctx.measureText(valueText).width;

    let x = margin + style.offsetX;
    if (style.align === 'center') {
      x = margin + style.offsetX + (contentW - fullW) / 2;
    } else if (style.align === 'right') {
      x = margin + style.offsetX + (contentW - fullW);
    }

    if (style.showLabels) {
      ctx.fillText(labelText, x, y);
      ctx.fillText(valueText, x + labelW, y);
    } else {
      ctx.fillText(valueText, x, y);
    }
  }

  return canvas;
}

/**
 * Etiqueta de chave — impressão B1 exatamente 50×30 mm (384×240).
 * Conteúdo vertical (leitura na chave) com duas cópias; 2ª rotacionada 180°.
 */
export function renderPatioKeyLabelDataUrl(
  input: PatioKeyLabelInput,
  styleInput?: Partial<PatioKeyLabelStyle> | null
): string {
  const style = normalizePatioKeyLabelStyle({
    ...DEFAULT_PATIO_KEY_LABEL_STYLE,
    ...(styleInput ?? {}),
  });

  const portraitW = NIIMBOT_LABEL_H_PX; // 240 = 30 mm
  const portraitH = NIIMBOT_LABEL_W_PX; // 384 = 50 mm
  const halfH = Math.floor((portraitH - style.halfGap) / 2);

  const portrait = document.createElement('canvas');
  portrait.width = portraitW;
  portrait.height = portraitH;
  const pctx = portrait.getContext('2d');
  if (!pctx) throw new Error('Canvas 2D indisponível');

  pctx.fillStyle = '#ffffff';
  pctx.fillRect(0, 0, portraitW, portraitH);

  const block = renderKeyBlock(portraitW, halfH, input, style);
  pctx.drawImage(block, 0, 0);

  pctx.save();
  pctx.translate(portraitW, portraitH);
  pctx.rotate(Math.PI);
  pctx.drawImage(block, 0, 0);
  pctx.restore();

  const printW = NIIMBOT_LABEL_W_PX;
  const printH = NIIMBOT_LABEL_H_PX;
  const canvas = document.createElement('canvas');
  canvas.width = printW;
  canvas.height = printH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, printW, printH);

  ctx.save();
  ctx.translate(0, printH);
  ctx.rotate(-Math.PI / 2);
  ctx.drawImage(portrait, 0, 0);
  ctx.restore();

  return canvas.toDataURL('image/png');
}
