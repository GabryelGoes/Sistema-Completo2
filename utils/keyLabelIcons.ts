/**
 * Ícones de prefixo da etiqueta de chave — desenhados em P&B para térmica Niimbot.
 * Os emojis 👤 / 🚗 / 🎨 ficam no labelText; na renderização viram silhuetas nítidas.
 */

export const KEY_LABEL_ICON_EMOJIS = ['👤', '🚗', '🎨'] as const;
export type KeyLabelIconEmoji = (typeof KEY_LABEL_ICON_EMOJIS)[number];

export const KEY_LABEL_ICON_PRESETS: Array<{
  fieldId: 'customer' | 'vehicle' | 'color';
  emoji: KeyLabelIconEmoji;
  name: string;
  /** Valor padrão do rótulo (emoji + espaço). */
  labelText: string;
}> = [
  { fieldId: 'customer', emoji: '👤', name: 'Cliente', labelText: '👤 ' },
  { fieldId: 'vehicle', emoji: '🚗', name: 'Carro', labelText: '🚗 ' },
  { fieldId: 'color', emoji: '🎨', name: 'Cor', labelText: '🎨 ' },
];

export function isKeyLabelIconEmoji(s: string): s is KeyLabelIconEmoji {
  return (KEY_LABEL_ICON_EMOJIS as readonly string[]).includes(s);
}

/** Se o prefixo começa com um ícone conhecido, separa ícone e resto do texto. */
export function splitKeyLabelPrefix(raw: string): {
  icon: KeyLabelIconEmoji | null;
  rest: string;
} {
  const s = String(raw ?? '');
  for (const emoji of KEY_LABEL_ICON_EMOJIS) {
    if (s.startsWith(emoji)) {
      return { icon: emoji, rest: s.slice(emoji.length) };
    }
  }
  return { icon: null, rest: s };
}

function strokeIcon(
  ctx: CanvasRenderingContext2D,
  draw: (c: CanvasRenderingContext2D) => void
): void {
  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#000000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  draw(ctx);
  ctx.restore();
}

/** Pessoa (👤) — cabeça + ombros. */
function drawPersonIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
): void {
  const s = Math.max(10, size);
  const cx = x + s / 2;
  const headR = s * 0.22;
  const headCy = y + s * 0.28;
  strokeIcon(ctx, (c) => {
    c.lineWidth = Math.max(1.2, s * 0.08);
    c.beginPath();
    c.arc(cx, headCy, headR, 0, Math.PI * 2);
    c.fill();
    // ombros
    c.beginPath();
    c.moveTo(x + s * 0.12, y + s * 0.92);
    c.quadraticCurveTo(cx, y + s * 0.52, x + s * 0.88, y + s * 0.92);
    c.quadraticCurveTo(cx, y + s * 0.72, x + s * 0.12, y + s * 0.92);
    c.fill();
  });
}

/** Carro (🚗) — silhueta lateral simples. */
function drawCarIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
): void {
  const s = Math.max(10, size);
  strokeIcon(ctx, (c) => {
    c.lineWidth = Math.max(1.1, s * 0.07);
    // carroceria
    c.beginPath();
    c.moveTo(x + s * 0.08, y + s * 0.62);
    c.lineTo(x + s * 0.18, y + s * 0.62);
    c.lineTo(x + s * 0.28, y + s * 0.38);
    c.lineTo(x + s * 0.62, y + s * 0.38);
    c.lineTo(x + s * 0.78, y + s * 0.62);
    c.lineTo(x + s * 0.92, y + s * 0.62);
    c.lineTo(x + s * 0.92, y + s * 0.78);
    c.lineTo(x + s * 0.08, y + s * 0.78);
    c.closePath();
    c.fill();
    // rodas (centro branco + aro preto — nítido na térmica)
    for (const wx of [0.28, 0.72]) {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(x + s * wx, y + s * 0.78, s * 0.12, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#000000';
      c.beginPath();
      c.arc(x + s * wx, y + s * 0.78, s * 0.12, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(x + s * wx, y + s * 0.78, s * 0.045, 0, Math.PI * 2);
      c.fill();
    }
  });
}

/** Paleta (🎨) — círculo + poças. */
function drawPaletteIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
): void {
  const s = Math.max(10, size);
  const cx = x + s * 0.46;
  const cy = y + s * 0.48;
  const r = s * 0.36;
  strokeIcon(ctx, (c) => {
    c.lineWidth = Math.max(1.2, s * 0.08);
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();
    // furo do polegar
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(x + s * 0.78, y + s * 0.62, s * 0.13, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#000000';
    c.beginPath();
    c.arc(x + s * 0.78, y + s * 0.62, s * 0.13, 0, Math.PI * 2);
    c.stroke();
    // poças de tinta
    const dots: Array<[number, number]> = [
      [0.36, 0.32],
      [0.54, 0.28],
      [0.3, 0.52],
      [0.48, 0.55],
    ];
    for (const [px, py] of dots) {
      c.beginPath();
      c.arc(x + s * px, y + s * py, s * 0.06, 0, Math.PI * 2);
      c.fill();
    }
  });
}

export function drawKeyLabelIcon(
  ctx: CanvasRenderingContext2D,
  emoji: KeyLabelIconEmoji,
  x: number,
  y: number,
  size: number
): void {
  if (emoji === '👤') drawPersonIcon(ctx, x, y, size);
  else if (emoji === '🚗') drawCarIcon(ctx, x, y, size);
  else drawPaletteIcon(ctx, x, y, size);
}

/** Largura reservada ao ícone (+ folga) no layout da linha. */
export function keyLabelIconSlotWidth(fontSize: number): number {
  return Math.max(12, Math.round(fontSize * 1.15));
}
