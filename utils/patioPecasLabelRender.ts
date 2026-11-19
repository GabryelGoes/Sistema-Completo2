/**
 * Etiqueta de peças da OS (pátio) — Niimbot 50×30 mm (384×240).
 * Layout tipo mockup, totalmente parametrizado via template (pecasOptions + elements).
 */
import {
  createDefaultPecasOptions,
  loadLabelTemplate,
  normalizePecasOptions,
  type LabelElementDef,
  type LabelPecasOptions,
  type LabelPecasSidebarIcon,
  type LabelTemplateLayout,
} from './labelTemplates';
import { NIIMBOT_LABEL_H_PX, NIIMBOT_LABEL_W_PX } from './niimbotLabelRender';
import {
  normalizeBrazilianPlate,
  toMercosulBrazilianPlate,
} from './brazilianPlate';

export type PatioPecasLabelInput = {
  vehicleModel: string;
  vehicleColor: string;
  plate: string;
  customerName: string;
  /** Ano (ou detalhe) exibido na linha auxiliar sob o modelo. */
  vehicleYear?: string | null;
};

function cleanSpaces(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function toUpperClean(raw: string): string {
  return cleanSpaces(raw).toLocaleUpperCase('pt-BR');
}

/** Placa Mercosul com hífen (ex.: AZK-4B21). */
export function formatPecasPlateDisplay(raw: string): string {
  const merc = toMercosulBrazilianPlate(raw) || normalizeBrazilianPlate(raw);
  if (!merc) return '—';
  if (merc.length === 7) return `${merc.slice(0, 3)}-${merc.slice(3)}`;
  return merc;
}

/** Título grande + linha auxiliar (resto do modelo • ano). */
export function splitPecasVehicleLines(
  modelRaw: string,
  yearRaw?: string | null
): { title: string; subtitle: string } {
  const parts = toUpperClean(modelRaw).split(' ').filter(Boolean);
  const year = cleanSpaces(yearRaw || '');
  if (parts.length === 0) {
    return { title: '—', subtitle: year ? year.toLocaleUpperCase('pt-BR') : '' };
  }
  const title = parts[0]!;
  const rest = parts.slice(1).join(' ');
  const yearU = year ? year.toLocaleUpperCase('pt-BR') : '';
  const subtitle = [rest, yearU].filter(Boolean).join(' • ');
  return { title, subtitle };
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const t = text.trim() || '—';
  if (ctx.measureText(t).width <= maxWidth) return t;
  let s = t;
  while (s.length > 1 && ctx.measureText(s).width > maxWidth) s = s.slice(0, -1);
  return s || '—';
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function findEl(
  layout: LabelTemplateLayout,
  id: string
): LabelElementDef | undefined {
  return layout.elements.find((e) => e.id === id);
}

function drawGear(
  ctx: CanvasRenderingContext2D,
  s: number,
  teeth = 10
): void {
  const gearR = s * 0.42;
  const holeR = s * 0.16;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 0.35) / teeth) * Math.PI * 2;
    const a2 = ((i + 0.65) / teeth) * Math.PI * 2;
    const a3 = ((i + 1) / teeth) * Math.PI * 2;
    const outer = gearR * 1.18;
    if (i === 0) ctx.moveTo(Math.cos(a0) * gearR, Math.sin(a0) * gearR);
    ctx.lineTo(Math.cos(a0) * gearR, Math.sin(a0) * gearR);
    ctx.lineTo(Math.cos(a1) * outer, Math.sin(a1) * outer);
    ctx.lineTo(Math.cos(a2) * outer, Math.sin(a2) * outer);
    ctx.lineTo(Math.cos(a3) * gearR, Math.sin(a3) * gearR);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, holeR, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCarFront(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(-s * 0.22, -s * 0.06);
  ctx.lineTo(-s * 0.12, -s * 0.26);
  ctx.lineTo(s * 0.12, -s * 0.26);
  ctx.lineTo(s * 0.22, -s * 0.06);
  ctx.lineTo(s * 0.3, -s * 0.06);
  ctx.lineTo(s * 0.3, s * 0.14);
  ctx.lineTo(-s * 0.3, s * 0.14);
  ctx.lineTo(-s * 0.3, -s * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.2, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(-s * 0.14, -s * 0.08);
  ctx.lineTo(-s * 0.08, -s * 0.22);
  ctx.lineTo(s * 0.08, -s * 0.22);
  ctx.lineTo(s * 0.14, -s * 0.08);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-s * 0.17, s * 0.02, s * 0.055, s * 0.032, 0, 0, Math.PI * 2);
  ctx.ellipse(s * 0.17, s * 0.02, s * 0.055, s * 0.032, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawWrench(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.lineWidth = Math.max(2, s * 0.1);
  ctx.beginPath();
  ctx.moveTo(-s * 0.28, s * 0.22);
  ctx.lineTo(s * 0.18, -s * 0.24);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s * 0.22, -s * 0.28, s * 0.14, 0.2, Math.PI * 1.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-s * 0.3, s * 0.26, s * 0.1, -0.4, Math.PI * 1.2);
  ctx.stroke();
}

function drawTagIcon(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  ctx.moveTo(-s * 0.28, -s * 0.08);
  ctx.lineTo(s * 0.05, -s * 0.28);
  ctx.lineTo(s * 0.3, -s * 0.05);
  ctx.lineTo(s * 0.08, s * 0.28);
  ctx.lineTo(-s * 0.28, s * 0.08);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-s * 0.12, -s * 0.02, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
}

/** Ícone da faixa PEÇA. */
function drawSidebarIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  kind: LabelPecasSidebarIcon
): void {
  if (kind === 'none' || size <= 0) return;
  const s = Math.max(12, size);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.4, s * 0.07);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (kind === 'car_gear') {
    drawGear(ctx, s);
    drawCarFront(ctx, s);
  } else if (kind === 'car') {
    drawCarFront(ctx, s);
  } else if (kind === 'gear') {
    drawGear(ctx, s);
  } else if (kind === 'wrench') {
    drawWrench(ctx, s);
  } else if (kind === 'tag') {
    drawTagIcon(ctx, s);
  }

  ctx.restore();
}

function drawIconBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  kind: 'plate' | 'color' | 'person'
): void {
  const s = Math.max(12, size);
  ctx.fillStyle = '#000000';
  roundRect(ctx, x, y, s, s, Math.max(3, s * 0.18));
  ctx.fill();

  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.2, s * 0.08);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const cx = x + s / 2;
  const cy = y + s / 2;

  if (kind === 'person') {
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.16, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + s * 0.18, y + s * 0.88);
    ctx.quadraticCurveTo(cx, y + s * 0.48, x + s * 0.82, y + s * 0.88);
    ctx.quadraticCurveTo(cx, y + s * 0.68, x + s * 0.18, y + s * 0.88);
    ctx.fill();
  } else if (kind === 'plate') {
    roundRect(ctx, x + s * 0.16, y + s * 0.28, s * 0.68, s * 0.4, 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * 0.22, y + s * 0.4);
    ctx.lineTo(x + s * 0.78, y + s * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + s * 0.28, y + s * 0.55);
    ctx.lineTo(x + s * 0.72, y + s * 0.55);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.02, s * 0.28, s * 0.24, -0.3, 0, Math.PI * 2);
    ctx.stroke();
    for (const [ox, oy] of [
      [-0.12, -0.06],
      [0.08, -0.1],
      [0.14, 0.06],
      [-0.02, 0.1],
    ] as const) {
      ctx.beginPath();
      ctx.arc(cx + s * ox, cy + s * oy, s * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function resolvePecasOptions(layout: LabelTemplateLayout): LabelPecasOptions {
  return normalizePecasOptions(layout.pecasOptions, createDefaultPecasOptions());
}

/**
 * Monta PNG data URL da etiqueta de peças (384×240 / 50×30 mm).
 */
export function renderPatioPecasLabelDataUrl(
  input: PatioPecasLabelInput,
  layoutInput?: LabelTemplateLayout | null
): string {
  const layout = layoutInput ?? loadLabelTemplate('pecas_os');
  const opts = resolvePecasOptions(layout);
  const vehicleEl = findEl(layout, 'vehicle');
  const plateEl = findEl(layout, 'plate');
  const colorEl = findEl(layout, 'color');
  const customerEl = findEl(layout, 'customer');

  const W = NIIMBOT_LABEL_W_PX;
  const H = NIIMBOT_LABEL_H_PX;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');

  const { title, subtitle } = splitPecasVehicleLines(
    input.vehicleModel,
    input.vehicleYear
  );
  const plate = formatPecasPlateDisplay(input.plate);
  const color = toUpperClean(input.vehicleColor) || '—';
  const customer = cleanSpaces(input.customerName) || '—';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const border = 5;
  const radius = 14;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  roundRect(ctx, border, border, W - border * 2, H - border * 2, radius);
  ctx.stroke();

  ctx.save();
  roundRect(ctx, border + 1, border + 1, W - border * 2 - 2, H - border * 2 - 2, radius - 2);
  ctx.clip();

  const leftTop = opts.sidebarWidth;
  const leftBottom = Math.max(36, Math.round(opts.sidebarWidth * 0.8));
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.moveTo(border, border);
  ctx.lineTo(leftTop, border);
  ctx.lineTo(leftBottom, H - border);
  ctx.lineTo(border, H - border);
  ctx.closePath();
  ctx.fill();

  const midLeft = (leftTop + leftBottom) / 2;
  const iconCx = midLeft * 0.55 + border * 0.2;
  const iconCy = 52 + Math.max(0, (opts.sidebarIconSize - 44) * 0.15);
  if (opts.sidebarIcon !== 'none' && opts.sidebarIconSize > 0) {
    drawSidebarIcon(ctx, iconCx, iconCy, opts.sidebarIconSize, opts.sidebarIcon);
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = `900 italic ${opts.sidebarTextSize}px Arial, Helvetica, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const sidebarLabel = (opts.sidebarText || 'PEÇA').trim() || 'PEÇA';
  const textY =
    opts.sidebarIcon !== 'none' && opts.sidebarIconSize > 0
      ? iconCy + opts.sidebarIconSize * 0.55 + opts.sidebarTextSize * 0.55
      : 100;
  ctx.fillText(sidebarLabel, midLeft * 0.52, Math.min(H - 40, textY));
  ctx.textAlign = 'left';

  if (opts.showSidebarBar) {
    const barW = Math.max(20, Math.round(opts.sidebarTextSize * 1.25));
    const barY = Math.min(H - 28, textY + opts.sidebarTextSize * 0.55);
    ctx.fillRect(midLeft * 0.52 - barW / 2, barY, barW, Math.max(4, Math.round(opts.sidebarTextSize * 0.18)));
  }

  const contentLeft = Math.max(leftTop, leftBottom) + 10;
  const contentRight = W - border - 10;
  const contentW = contentRight - contentLeft;

  const vehicleSize = vehicleEl?.valueFontSize || 46;
  const subtitleSize = vehicleEl?.fontSize || 15;
  const vehicleTop = border + 10;
  ctx.fillStyle = '#000000';
  ctx.font = `900 italic ${vehicleSize}px Arial, Helvetica, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(fitText(ctx, title, contentW - 4), contentLeft, vehicleTop);

  ctx.font = `700 ${subtitleSize}px Arial, Helvetica, sans-serif`;
  const subY = vehicleTop + Math.round(vehicleSize * 1.12);
  if (subtitle) {
    ctx.fillText(fitText(ctx, subtitle, contentW - 4), contentLeft, subY);
  }

  const div1Y = subY + (subtitle ? Math.round(subtitleSize * 1.5) : 8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(contentLeft - 2, div1Y);
  ctx.lineTo(contentRight, div1Y);
  ctx.stroke();

  const plateTitleSize = plateEl?.fontSize || 10;
  const plateValueSize = plateEl?.valueFontSize || 18;
  const colorTitleSize = colorEl?.fontSize || 10;
  const colorValueSize = colorEl?.valueFontSize || 18;
  const plateTitle = (plateEl?.labelText || 'PLACA').trim() || 'PLACA';
  const colorTitle = (colorEl?.labelText || 'COR').trim() || 'COR';

  const chipY = div1Y + 10;
  const chipH = Math.max(
    44,
    Math.round(Math.max(plateTitleSize + plateValueSize, colorTitleSize + colorValueSize) + 22)
  );
  const gap = 10;
  const chipW = (contentW - gap) / 2;
  const chipR = 10;

  ctx.fillStyle = '#D8D8D8';
  roundRect(ctx, contentLeft, chipY, chipW, chipH, chipR);
  ctx.fill();
  roundRect(ctx, contentLeft + chipW + gap, chipY, chipW, chipH, chipR);
  ctx.fill();

  const sepX = contentLeft + chipW + gap / 2;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sepX, chipY + 8);
  ctx.lineTo(sepX, chipY + chipH - 8);
  ctx.stroke();

  const badge = opts.fieldIconSize;
  const badgeY = chipY + (chipH - badge) / 2;
  const platePad = opts.showPlateIcon ? badge + 16 : 10;
  const colorPad = opts.showColorIcon ? badge + 16 : 10;

  if (opts.showPlateIcon) {
    drawIconBadge(ctx, contentLeft + 8, badgeY, badge, 'plate');
  }
  if (opts.showColorIcon) {
    drawIconBadge(ctx, contentLeft + chipW + gap + 8, badgeY, badge, 'color');
  }

  const plateTextX = contentLeft + platePad;
  const colorTextX = contentLeft + chipW + gap + colorPad;
  const plateMaxW = chipW - platePad - 8;
  const colorMaxW = chipW - colorPad - 8;

  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';
  ctx.font = `700 ${plateTitleSize}px Arial, Helvetica, sans-serif`;
  ctx.fillText(fitText(ctx, plateTitle, plateMaxW), plateTextX, chipY + 10);
  ctx.font = `700 ${colorTitleSize}px Arial, Helvetica, sans-serif`;
  ctx.fillText(fitText(ctx, colorTitle, colorMaxW), colorTextX, chipY + 10);

  ctx.font = `900 ${plateValueSize}px Arial, Helvetica, sans-serif`;
  ctx.fillText(
    fitText(ctx, plate, plateMaxW),
    plateTextX,
    chipY + 12 + plateTitleSize + 2
  );
  ctx.font = `900 ${colorValueSize}px Arial, Helvetica, sans-serif`;
  ctx.fillText(
    fitText(ctx, color, colorMaxW),
    colorTextX,
    chipY + 12 + colorTitleSize + 2
  );

  const div2Y = chipY + chipH + 10;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(contentLeft - 2, div2Y);
  ctx.lineTo(contentRight, div2Y);
  ctx.stroke();

  const custTitleSize = customerEl?.fontSize || 15;
  const custValueSize = customerEl?.valueFontSize || 15;
  const custLabel = (customerEl?.labelText || 'CLIENTE:').trim() || 'CLIENTE:';
  const custY = div2Y + 12;
  const custBadge = opts.fieldIconSize;
  let custTextX = contentLeft;
  if (opts.showCustomerIcon) {
    drawIconBadge(ctx, contentLeft, custY + 2, custBadge, 'person');
    custTextX = contentLeft + custBadge + 8;
  }

  ctx.fillStyle = '#000000';
  ctx.font = `800 ${custTitleSize}px Arial, Helvetica, sans-serif`;
  ctx.textBaseline = 'middle';
  const midCustY = custY + Math.max(custBadge, custTitleSize) / 2 + 2;
  ctx.fillText(custLabel, custTextX, midCustY);
  const labelW = ctx.measureText(custLabel).width;
  ctx.font = `700 ${custValueSize}px Arial, Helvetica, sans-serif`;
  const nameMax = contentRight - (custTextX + labelW + 6);
  ctx.fillText(fitText(ctx, customer, nameMax), custTextX + labelW + 6, midCustY);

  ctx.restore();

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  roundRect(ctx, border, border, W - border * 2, H - border * 2, radius);
  ctx.stroke();

  return canvas.toDataURL('image/png');
}
