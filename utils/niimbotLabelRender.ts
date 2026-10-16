import { drawCode128B } from './niimbotCode128';
import { withLabelElementStyle } from './labelElementStyle';
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar imagem: ${src}`));
    img.src = src;
  });
}

/**
 * Desenha a logo Rei do ABS em preto sólido para impressão térmica.
 * A arte original é dourada sobre fundo preto — mantém só os pixels claros como tinta.
 */
async function drawAbsBrandLogo(
  ctx: CanvasRenderingContext2D,
  elDef: LabelElementDef,
  logoSrc = '/logo.png'
): Promise<void> {
  if (!elDef.visible) return;
  const size = Math.max(8, Math.min(elDef.w, elDef.h));
  try {
    const img = await loadImage(logoSrc);
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const octx = off.getContext('2d');
    if (!octx) return;
    octx.clearRect(0, 0, size, size);
    octx.drawImage(img, 0, 0, size, size);
    const data = octx.getImageData(0, 0, size, size);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i]!;
      const g = px[i + 1]!;
      const b = px[i + 2]!;
      const a = px[i + 3]!;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      // Dourado/amarelo claro → preto; fundo escuro → transparente
      if (a < 40 || lum < 48) {
        px[i] = 0;
        px[i + 1] = 0;
        px[i + 2] = 0;
        px[i + 3] = 0;
      } else {
        px[i] = 0;
        px[i + 1] = 0;
        px[i + 2] = 0;
        px[i + 3] = 255;
      }
    }
    octx.putImageData(data, 0, 0);
    const dx = elDef.x + Math.max(0, (elDef.w - size) / 2);
    const dy = elDef.y + Math.max(0, (elDef.h - size) / 2);
    withLabelElementStyle(ctx, elDef, (c) => {
      c.drawImage(off, dx, dy, size, size);
    });
  } catch {
    // Sem logo: etiqueta segue sem bloquear a impressão.
  }
}

function drawPlainText(
  ctx: CanvasRenderingContext2D,
  elDef: LabelElementDef,
  text: string
): void {
  if (!elDef.visible) return;
  withLabelElementStyle(ctx, elDef, (c) => {
    c.fillStyle = '#000000';
    c.textBaseline = 'top';
    c.font = cssFontForElement(elDef);
    const drawn = truncateToWidth(c, text, elDef.w);
    let x = elDef.x;
    if (elDef.align === 'center') {
      const tw = c.measureText(drawn).width;
      x = elDef.x + (elDef.w - tw) / 2;
    } else if (elDef.align === 'right') {
      const tw = c.measureText(drawn).width;
      x = elDef.x + elDef.w - tw;
    }
    c.fillText(drawn, x, elDef.y);
  });
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
    withLabelElementStyle(ctx, codeLineEl, (c) => {
      c.font = cssFontForElement(codeLineEl);
      c.textBaseline = 'top';
      c.fillStyle = '#000000';
      const prefix = codeLineEl.labelText
        ? codeLineEl.labelText.endsWith(' ')
          ? codeLineEl.labelText
          : `${codeLineEl.labelText} `
        : '';
      const line = truncateToWidth(c, `${prefix}${code}`, codeLineEl.w);
      c.fillText(line, codeLineEl.x, codeLineEl.y);
    });
  }

  const barcodeEl = findEl(layout, 'barcode');
  if (barcodeEl?.visible) {
    withLabelElementStyle(ctx, barcodeEl, (c) => {
      drawCode128B(c, code, barcodeEl.x, barcodeEl.y, barcodeEl.w, barcodeEl.h);
    });
  }

  const humanEl = findEl(layout, 'human_code');
  if (humanEl?.visible) {
    withLabelElementStyle(ctx, humanEl, (c) => {
      c.font = cssFontForElement(humanEl);
      c.textBaseline = 'alphabetic';
      c.fillStyle = '#000000';
      const human = truncateToWidth(c, code, humanEl.w);
      const textY = humanEl.y + humanEl.h - 4;
      if (humanEl.align === 'center') {
        c.textAlign = 'center';
        c.fillText(human, humanEl.x + humanEl.w / 2, textY);
        c.textAlign = 'left';
      } else if (humanEl.align === 'right') {
        c.textAlign = 'right';
        c.fillText(human, humanEl.x + humanEl.w, textY);
        c.textAlign = 'left';
      } else {
        c.fillText(human, humanEl.x, textY);
      }
    });
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
  /** Anos / faixa de anos da aplicação (ex.: 2010–2014). */
  applicationYears?: string | null;
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

  withLabelElementStyle(ctx, elDef, (c) => {
    const label = String(elDef.labelText || '').trim();
    const labelW = label ? ABS_FIELD_LABEL_W : 0;
    const valueX = elDef.x + labelW;
    const valueW = Math.max(24, elDef.w - labelW);
    const maxLines = Math.max(1, opts?.maxLines ?? elDef.maxLines ?? 1);

    c.fillStyle = '#000000';
    c.textBaseline = 'top';

    if (label) {
      c.font = cssFontForElement({ ...elDef, fontSize: elDef.fontSize, fontWeight: 'bold' });
      const lab = label.endsWith('.') || label.endsWith(':') ? label : `${label}`;
      c.fillText(truncateToWidth(c, lab, labelW - 2), elDef.x, elDef.y);
    }

    const valueSize = elDef.valueFontSize || elDef.fontSize;
    c.font = cssFontForElement({ ...elDef, fontSize: valueSize });

    if (maxLines <= 1) {
      c.fillText(truncateToWidth(c, text || '—', valueW), valueX, elDef.y);
      return;
    }

    const words = (text || '—').split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (c.measureText(trial).width <= valueW || !current) {
        current = trial;
      } else {
        lines.push(current);
        current = word;
        if (lines.length >= maxLines) break;
      }
    }
    if (current && lines.length < maxLines) lines.push(current);
    if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
      lines[maxLines - 1] = truncateToWidth(c, lines[maxLines - 1]!, valueW);
    }
    const lineH = Math.max(valueSize + 2, Math.floor(elDef.h / maxLines));
    lines.forEach((line, i) => {
      c.fillText(line, valueX, elDef.y + i * lineH);
    });
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
  const appYears = String(input.applicationYears || '').trim();
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

  const logoEl = findEl(layout, 'logo');
  if (logoEl) await drawAbsBrandLogo(ctx, logoEl);

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

  const appYearsEl = findEl(layout, 'app_years');
  if (appYearsEl) {
    drawAbsLabeledField(ctx, appYearsEl, appYears || '—', { hideIfEmpty: false });
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
      const elForStyle = barcodeEl ?? {
        x: bx,
        y: by,
        w: bw,
        h: bh,
        opacity: 100,
        rotation: 0,
      };
      withLabelElementStyle(ctx, elForStyle, (c) => {
        drawCode128B(c, publicId, bx, by, bw, bh);
      });
    } catch {
      // Code128 pode falhar com caracteres especiais — human_code ainda identifica.
    }
  }

  const humanEl = findEl(layout, 'human_code');
  if (humanEl?.visible) {
    withLabelElementStyle(ctx, humanEl, (c) => {
      c.font = cssFontForElement(humanEl);
      c.textBaseline = 'alphabetic';
      c.fillStyle = '#000000';
      const human = truncateToWidth(c, publicId, humanEl.w);
      const textY = humanEl.y + humanEl.h - 4;
      if (humanEl.align === 'center') {
        c.textAlign = 'center';
        c.fillText(human, humanEl.x + humanEl.w / 2, textY);
        c.textAlign = 'left';
      } else if (humanEl.align === 'right') {
        c.textAlign = 'right';
        c.fillText(human, humanEl.x + humanEl.w, textY);
        c.textAlign = 'left';
      } else {
        c.fillText(human, humanEl.x, textY);
      }
    });
  }

  return canvas.toDataURL('image/png');
}
