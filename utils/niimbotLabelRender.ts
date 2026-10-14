import { drawCode128B } from './niimbotCode128';
import {
  cssFontForElement,
  loadLabelTemplate,
  type LabelElementDef,
  type LabelTemplateLayout,
} from './labelTemplates';
import { generateInternalEan13 } from './workshopPartLabelCode';
import {
  absModuleKindLabel,
  formatAbsModuleSequence,
} from './workshopAbsModules';

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
 * Se nenhum existir e houver `id`, gera EAN-13 interno (não persiste).
 */
export function resolveWorkshopPartLabelCode(part: {
  id?: string;
  numeric_code?: string | null;
  barcode?: string | null;
  original_code?: string | null;
}): string {
  const pick = (v: string | null | undefined) => String(v ?? '').trim();
  const existing =
    pick(part.numeric_code) || pick(part.barcode) || pick(part.original_code);
  if (existing) return existing;
  const id = pick(part.id);
  if (!id) return '';
  return generateInternalEan13(id);
}

/** True se o código veio gerado (produto sem códigos cadastrados). */
export function workshopPartNeedsGeneratedLabelCode(part: {
  numeric_code?: string | null;
  barcode?: string | null;
  original_code?: string | null;
}): boolean {
  const pick = (v: string | null | undefined) => String(v ?? '').trim();
  return !(pick(part.numeric_code) || pick(part.barcode) || pick(part.original_code));
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

function findEl(layout: LabelTemplateLayout, id: string): LabelElementDef | undefined {
  return layout.elements.find((e) => e.id === id);
}

function drawPlainText(
  ctx: CanvasRenderingContext2D,
  elDef: LabelElementDef,
  text: string
): void {
  if (!elDef.visible) return;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';
  ctx.font = cssFontForElement(elDef);
  const drawn = truncateToWidth(ctx, text, elDef.w);
  let x = elDef.x;
  if (elDef.align === 'center') {
    const tw = ctx.measureText(drawn).width;
    x = elDef.x + (elDef.w - tw) / 2;
  } else if (elDef.align === 'right') {
    const tw = ctx.measureText(drawn).width;
    x = elDef.x + elDef.w - tw;
  }
  ctx.fillText(drawn, x, elDef.y);
}

/** Renderiza a etiqueta 50×30 mm (384×240 @ 203 dpi) e devolve data URL PNG. */
export function renderNiimbotPartLabelDataUrl(
  input: NiimbotPartLabelInput,
  layoutInput?: LabelTemplateLayout | null
): string {
  const code = String(input.code ?? '').trim();
  if (!code) throw new Error('Código interno ausente para a etiqueta.');

  const brand = (input.brand ?? 'REI DO ABS').trim() || 'REI DO ABS';
  const name = String(input.name ?? '').trim() || 'Peça';
  const layout = layoutInput ?? loadLabelTemplate('estoque');

  const w = layout.canvasW || NIIMBOT_LABEL_W_PX;
  const h = layout.canvasH || NIIMBOT_LABEL_H_PX;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  const brandEl = findEl(layout, 'brand');
  if (brandEl) drawPlainText(ctx, brandEl, brand);

  const nameEl = findEl(layout, 'name');
  if (nameEl) drawPlainText(ctx, nameEl, name);

  const codeLineEl = findEl(layout, 'code_line');
  if (codeLineEl?.visible) {
    ctx.font = cssFontForElement(codeLineEl);
    ctx.textBaseline = 'top';
    const prefix = codeLineEl.labelText
      ? codeLineEl.labelText.endsWith(' ')
        ? codeLineEl.labelText
        : `${codeLineEl.labelText} `
      : '';
    const line = truncateToWidth(ctx, `${prefix}${code}`, codeLineEl.w);
    ctx.fillText(line, codeLineEl.x, codeLineEl.y);
  }

  const barcodeEl = findEl(layout, 'barcode');
  if (barcodeEl?.visible) {
    drawCode128B(ctx, code, barcodeEl.x, barcodeEl.y, barcodeEl.w, barcodeEl.h);
  }

  const humanEl = findEl(layout, 'human_code');
  if (humanEl?.visible) {
    ctx.font = cssFontForElement(humanEl);
    ctx.textBaseline = 'alphabetic';
    const human = truncateToWidth(ctx, code, humanEl.w);
    const textY = humanEl.y + humanEl.h - 4;
    if (humanEl.align === 'center') {
      ctx.textAlign = 'center';
      ctx.fillText(human, humanEl.x + humanEl.w / 2, textY);
      ctx.textAlign = 'left';
    } else if (humanEl.align === 'right') {
      ctx.textAlign = 'right';
      ctx.fillText(human, humanEl.x + humanEl.w, textY);
      ctx.textAlign = 'left';
    } else {
      ctx.fillText(human, humanEl.x, textY);
    }
  }

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

export type NiimbotAbsModuleLabelInput = {
  publicId: string;
  sequenceNumber?: number | null;
  moduleKind?: string | null;
  code?: string | null;
  location?: string | null;
  brand?: string;
  manufacturer?: string | null;
  /** Marca(s) de aplicação do veículo (ex.: Volkswagen). */
  applicationBrand?: string | null;
  /** Modelos de veículo de aplicação (ex.: Gol · Fox · Voyage). */
  applicationVehicles?: string | null;
};

const ABS_FIELD_LABEL_W = 42;

function drawAbsLabeledField(
  ctx: CanvasRenderingContext2D,
  elDef: LabelElementDef,
  value: string,
  opts?: { hideIfEmpty?: boolean; maxLines?: number }
): void {
  if (!elDef.visible) return;
  const text = String(value || '').trim();
  if (!text && opts?.hideIfEmpty !== false) return;

  const label = String(elDef.labelText || '').trim();
  const labelW = label ? ABS_FIELD_LABEL_W : 0;
  const valueX = elDef.x + labelW;
  const valueW = Math.max(24, elDef.w - labelW);
  const maxLines = Math.max(1, opts?.maxLines ?? elDef.maxLines ?? 1);

  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  if (label) {
    ctx.font = cssFontForElement({ ...elDef, fontSize: elDef.fontSize, fontWeight: 'bold' });
    const lab = label.endsWith('.') || label.endsWith(':') ? label : `${label}`;
    ctx.fillText(truncateToWidth(ctx, lab, labelW - 2), elDef.x, elDef.y);
  }

  const valueSize = elDef.valueFontSize || elDef.fontSize;
  ctx.font = cssFontForElement({ ...elDef, fontSize: valueSize });

  if (maxLines <= 1) {
    ctx.fillText(truncateToWidth(ctx, text || '—', valueW), valueX, elDef.y);
    return;
  }

  const words = (text || '—').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width <= valueW || !current) {
      current = trial;
    } else {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = truncateToWidth(ctx, lines[maxLines - 1]!, valueW);
  }
  const lineH = Math.max(valueSize + 2, Math.floor(elDef.h / maxLines));
  lines.forEach((line, i) => {
    ctx.fillText(line, valueX, elDef.y + i * lineH);
  });
}

/** Renderiza etiqueta Niimbot 50×30 mm para módulo ABS (dados + Code128). */
export async function renderNiimbotAbsModuleLabelDataUrl(
  input: NiimbotAbsModuleLabelInput,
  layoutInput?: LabelTemplateLayout | null
): Promise<string> {
  const publicId = String(input.publicId || '').trim().toUpperCase();
  if (!publicId) throw new Error('ID do módulo ausente para a etiqueta.');

  const shopBrand = (input.brand ?? '').trim();
  const seq = formatAbsModuleSequence(input.sequenceNumber);
  const kind = absModuleKindLabel(input.moduleKind);
  const manufacturer = String(input.manufacturer || '').trim();
  const appBrand = String(input.applicationBrand || '').trim();
  const appVehicles = String(input.applicationVehicles || '').trim();
  const code = String(input.code || '').trim();
  const location = String(input.location || '').trim();
  const layout = layoutInput ?? loadLabelTemplate('abs_modulo');

  const w = layout.canvasW || NIIMBOT_LABEL_W_PX;
  const h = layout.canvasH || NIIMBOT_LABEL_H_PX;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  const seqEl = findEl(layout, 'sequence');
  if (seqEl) drawPlainText(ctx, seqEl, seq);

  const kindEl = findEl(layout, 'kind');
  if (kindEl) drawPlainText(ctx, kindEl, kind);

  const brandEl = findEl(layout, 'brand');
  if (brandEl && shopBrand) drawPlainText(ctx, brandEl, shopBrand);

  const mfrEl = findEl(layout, 'manufacturer');
  if (mfrEl) drawAbsLabeledField(ctx, mfrEl, manufacturer || '—', { hideIfEmpty: false });

  const appBrandEl = findEl(layout, 'app_brand');
  if (appBrandEl) drawAbsLabeledField(ctx, appBrandEl, appBrand || '—', { hideIfEmpty: false });

  const appVehEl = findEl(layout, 'app_vehicles');
  if (appVehEl) {
    drawAbsLabeledField(ctx, appVehEl, appVehicles || '—', {
      hideIfEmpty: false,
      maxLines: appVehEl.maxLines || 2,
    });
  }

  const codeLineEl = findEl(layout, 'code_line');
  if (codeLineEl) drawAbsLabeledField(ctx, codeLineEl, code || '—', { hideIfEmpty: false });

  const locEl = findEl(layout, 'location');
  if (locEl) drawAbsLabeledField(ctx, locEl, location || '—', { hideIfEmpty: false });

  // Etiqueta ABS: apenas código de barras (sem QR), para leitura pela pistola USB.
  const barcodeEl = findEl(layout, 'barcode');
  if (barcodeEl?.visible !== false) {
    try {
      const bw = barcodeEl?.w ?? Math.min(368, w - 16);
      const bh = barcodeEl?.h ?? 78;
      const bx = barcodeEl?.x ?? 8;
      const by = barcodeEl?.y ?? Math.max(120, h - bh - 32);
      drawCode128B(ctx, publicId, bx, by, bw, bh);
    } catch {
      // Code128 pode falhar com caracteres especiais — human_code ainda identifica.
    }
  }

  const humanEl = findEl(layout, 'human_code');
  if (humanEl?.visible) {
    ctx.font = cssFontForElement(humanEl);
    ctx.textBaseline = 'alphabetic';
    const human = truncateToWidth(ctx, publicId, humanEl.w);
    const textY = humanEl.y + humanEl.h - 4;
    if (humanEl.align === 'center') {
      ctx.textAlign = 'center';
      ctx.fillText(human, humanEl.x + humanEl.w / 2, textY);
      ctx.textAlign = 'left';
    } else if (humanEl.align === 'right') {
      ctx.textAlign = 'right';
      ctx.fillText(human, humanEl.x + humanEl.w, textY);
      ctx.textAlign = 'left';
    } else {
      ctx.fillText(human, humanEl.x, textY);
    }
  }

  return canvas.toDataURL('image/png');
}
