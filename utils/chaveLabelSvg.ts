/**
 * Etiqueta de chaves — SVG-base fixo (50×30 mm) preenchido via DOM + raster Niimbot.
 * modelo/cor na faixa preta (branco); cliente na coluna; placa na moldura.
 */
import { CHAVE_LABEL_BASE_SVG } from './chaveLabelSvgBase';
import mapaCamposJson from '../assets/labels/mapa_campos.json';
import {
  createDefaultChaveSvgOptions,
  loadLabelTemplate,
  normalizeChaveSvgOptions,
  type LabelChaveSvgFieldKey,
  type LabelChaveSvgOptions,
  type LabelTemplateLayout,
} from './labelTemplates';
import { NIIMBOT_LABEL_H_PX, NIIMBOT_LABEL_W_PX } from './niimbotLabelRender';
import type { PatioKeyLabelInput } from './patioKeyLabelRender';

/** SVG-base versionado (espelho de assets/labels/etiqueta_chaves_BASE_50x30.svg). */
export const chaveBaseSvg = CHAVE_LABEL_BASE_SVG;

export const mapaCampos = mapaCamposJson as {
  dimensions: {
    width_mm: number;
    height_mm: number;
    viewBox: number[];
    face_width_mm: number;
    fold_line_x: number;
    dpi_reference: number;
    bitmap_reference_px: number[];
  };
  fields: Record<
    string,
    {
      ids: string[];
      source: string;
      maxWidthSvgUnits: number;
      prefix?: string;
      region?: string;
      fill?: string;
    }
  >;
};

export type ChaveLabelFieldKey = LabelChaveSvgFieldKey;

export type ChaveLabelFitWarning = {
  field: ChaveLabelFieldKey;
  original: string;
  fitted: string;
  reason: 'abbreviated' | 'min-font' | 'empty';
};

export type ChaveLabelPrepareResult = {
  svgMarkup: string;
  warnings: ChaveLabelFitWarning[];
  values: Record<ChaveLabelFieldKey, string>;
  options: LabelChaveSvgOptions;
};

const FIELD_IDS: Record<ChaveLabelFieldKey, [string, string]> = {
  modelo: ['modelo-1', 'modelo-2'],
  cor: ['cor-1', 'cor-2'],
  cliente: ['cliente-1', 'cliente-2'],
  placa: ['placa-1', 'placa-2'],
};

/** Posição base (face 1) no viewBox — face 2 = +250 em X. */
export const CHAVE_FIELD_BASE_POS: Record<
  ChaveLabelFieldKey,
  { x: number; y: number; onBlack: boolean }
> = {
  modelo: { x: 42, y: 150, onBlack: true },
  cor: { x: 74, y: 150, onBlack: true },
  cliente: { x: 149, y: 150, onBlack: false },
  placa: { x: 222, y: 152, onBlack: false },
};

const FACE2_DX = 250;
const MIN_FONT_SIZE = 9;

function cleanSpaces(raw: string): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Placa: preserva caracteres da OS; só normaliza espaços e caixa. Sem forçar Mercosul. */
export function formatChaveLabelPlate(raw: string): string {
  const t = cleanSpaces(raw).toLocaleUpperCase('pt-BR');
  return t || '—';
}

export function formatChaveLabelModelo(raw: string): string {
  return cleanSpaces(raw).toLocaleUpperCase('pt-BR') || '—';
}

export function formatChaveLabelCor(raw: string): string {
  return cleanSpaces(raw).toLocaleUpperCase('pt-BR') || '—';
}

export function formatChaveLabelCliente(
  raw: string,
  showPrefix = true
): string {
  const name = cleanSpaces(raw);
  if (!showPrefix) {
    return name || '—';
  }
  if (!name || name === '—') return 'Cliente: —';
  const prefix =
    typeof mapaCampos?.fields?.cliente?.prefix === 'string'
      ? mapaCampos.fields.cliente.prefix
      : 'Cliente: ';
  if (name.toLocaleLowerCase('pt-BR').startsWith('cliente:')) return name;
  return `${prefix}${name}`;
}

export function resolveChaveLabelValues(
  input: PatioKeyLabelInput,
  options?: LabelChaveSvgOptions | null
): Record<ChaveLabelFieldKey, string> {
  const showPrefix = options?.showClientePrefix !== false;
  return {
    modelo: formatChaveLabelModelo(input.vehicleModel),
    cor: formatChaveLabelCor(input.vehicleColor),
    cliente: formatChaveLabelCliente(input.customerName, showPrefix),
    placa: formatChaveLabelPlate(input.plate),
  };
}

export function resolveChaveSvgOptions(
  layoutOrOptions?: LabelTemplateLayout | LabelChaveSvgOptions | null
): LabelChaveSvgOptions {
  if (layoutOrOptions && 'fields' in layoutOrOptions && layoutOrOptions.fields) {
    return normalizeChaveSvgOptions(layoutOrOptions as LabelChaveSvgOptions);
  }
  if (layoutOrOptions && 'chaveSvgOptions' in layoutOrOptions) {
    return normalizeChaveSvgOptions(
      (layoutOrOptions as LabelTemplateLayout).chaveSvgOptions,
      createDefaultChaveSvgOptions()
    );
  }
  return normalizeChaveSvgOptions(
    loadLabelTemplate('chave').chaveSvgOptions,
    createDefaultChaveSvgOptions()
  );
}

function measureTextLength(el: SVGTextElement): number {
  try {
    if (typeof el.getComputedTextLength === 'function') {
      const n = el.getComputedTextLength();
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof el.getBBox === 'function') {
      const b = el.getBBox();
      if (b && Number.isFinite(b.width) && b.width > 0) return b.width;
    }
  } catch {
    /* getBBox pode falhar se o SVG não estiver montado */
  }
  const size = Number(el.getAttribute('font-size')) || 16;
  const text = el.textContent || '';
  return text.length * size * 0.56;
}

function abbreviateToFit(
  el: SVGTextElement,
  full: string,
  maxWidth: number
): { text: string; abbreviated: boolean } {
  el.textContent = full;
  if (measureTextLength(el) <= maxWidth) return { text: full, abbreviated: false };

  const words = full.split(' ').filter(Boolean);
  if (words.length > 1) {
    for (let keep = words.length - 1; keep >= 1; keep -= 1) {
      const candidate = `${words.slice(0, keep).join(' ')}…`;
      el.textContent = candidate;
      if (measureTextLength(el) <= maxWidth) {
        return { text: candidate, abbreviated: true };
      }
    }
  }

  let s = full;
  while (s.length > 1) {
    s = s.slice(0, -1);
    const next = `${s}…`;
    el.textContent = next;
    if (measureTextLength(el) <= maxWidth) {
      return { text: next, abbreviated: true };
    }
  }
  el.textContent = '…';
  return { text: '…', abbreviated: true };
}

function applyFieldGeometry(
  el: SVGTextElement,
  field: ChaveLabelFieldKey,
  faceIndex: 0 | 1,
  options: LabelChaveSvgOptions
): void {
  const base = CHAVE_FIELD_BASE_POS[field];
  const layout = options.fields[field];
  const x = base.x + FACE2_DX * faceIndex + layout.offsetX;
  const y = base.y + layout.offsetY;
  el.setAttribute('x', String(x));
  el.setAttribute('y', String(y));
  el.setAttribute('transform', `rotate(-90 ${x} ${y})`);
  el.setAttribute('font-size', String(layout.fontSize));
  el.setAttribute('text-anchor', layout.anchor);
  el.setAttribute('data-max-width', String(layout.maxWidth));
  el.setAttribute('fill', base.onBlack ? '#ffffff' : '#000000');
  el.setAttribute('class', base.onBlack ? 'chave-field-on-black' : 'chave-field');
  if (base.onBlack) el.setAttribute('data-on-black', '1');
  else el.removeAttribute('data-on-black');
}

function fitFieldText(
  el: SVGTextElement,
  field: ChaveLabelFieldKey,
  value: string,
  maxWidth: number,
  baseSize: number
): ChaveLabelFitWarning | null {
  let size = baseSize;
  el.setAttribute('font-size', String(size));
  el.textContent = value;

  if (!value) {
    el.textContent = '—';
    return { field, original: value, fitted: '—', reason: 'empty' };
  }

  while (size > MIN_FONT_SIZE && measureTextLength(el) > maxWidth) {
    size -= 1;
    el.setAttribute('font-size', String(size));
  }

  if (measureTextLength(el) <= maxWidth) {
    if (size < baseSize) {
      return { field, original: value, fitted: value, reason: 'min-font' };
    }
    return null;
  }

  const { text, abbreviated } = abbreviateToFit(el, value, maxWidth);
  el.setAttribute('font-size', String(Math.max(MIN_FONT_SIZE, size)));
  if (abbreviated) {
    return { field, original: value, fitted: text, reason: 'abbreviated' };
  }
  return { field, original: value, fitted: text, reason: 'min-font' };
}

function mountSvg(markup: string): { svg: SVGSVGElement; cleanup: () => void } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(markup, 'image/svg+xml');
  const svg = doc.documentElement as unknown as SVGSVGElement;
  if (!svg || svg.tagName.toLowerCase() !== 'svg') {
    throw new Error('SVG-base da etiqueta de chaves inválido');
  }
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none';
  host.appendChild(svg);
  document.body.appendChild(host);
  return {
    svg,
    cleanup: () => {
      host.remove();
    },
  };
}

/**
 * Clona o SVG-base, aplica layout do editor, preenche IDs e ajusta fonte.
 */
export function prepareChaveLabelSvg(
  input: PatioKeyLabelInput,
  layoutOrOptions?: LabelTemplateLayout | LabelChaveSvgOptions | null
): ChaveLabelPrepareResult {
  if (typeof document === 'undefined') {
    throw new Error('prepareChaveLabelSvg requer DOM (browser)');
  }
  const options = resolveChaveSvgOptions(layoutOrOptions);
  const values = resolveChaveLabelValues(input, options);
  const { svg, cleanup } = mountSvg(chaveBaseSvg);
  const warnings: ChaveLabelFitWarning[] = [];
  try {
    (Object.keys(FIELD_IDS) as ChaveLabelFieldKey[]).forEach((field) => {
      const ids = FIELD_IDS[field];
      const value = values[field];
      const fieldOpts = options.fields[field];
      let sharedWarning: ChaveLabelFitWarning | null = null;

      ids.forEach((id, index) => {
        const el = svg.getElementById(id) as SVGTextElement | null;
        if (!el) {
          throw new Error(`Elemento SVG #${id} não encontrado no template de chaves`);
        }
        const faceIndex = (index === 0 ? 0 : 1) as 0 | 1;
        applyFieldGeometry(el, field, faceIndex, options);
        if (index === 0) {
          sharedWarning = fitFieldText(el, field, value, fieldOpts.maxWidth, fieldOpts.fontSize);
        } else {
          const face1 = svg.getElementById(ids[0]) as SVGTextElement | null;
          if (face1) {
            el.textContent = face1.textContent;
            el.setAttribute('font-size', face1.getAttribute('font-size') || String(fieldOpts.fontSize));
          }
        }
      });
      if (sharedWarning) warnings.push(sharedWarning);
    });

    (Object.keys(FIELD_IDS) as ChaveLabelFieldKey[]).forEach((field) => {
      const [id1, id2] = FIELD_IDS[field];
      const a = svg.getElementById(id1) as SVGTextElement | null;
      const b = svg.getElementById(id2) as SVGTextElement | null;
      if (!a || !b) return;
      b.textContent = a.textContent;
      b.setAttribute('font-size', a.getAttribute('font-size') || '');
    });

    const svgMarkup = new XMLSerializer().serializeToString(svg);
    return { svgMarkup, warnings, values, options };
  } finally {
    cleanup();
  }
}

/** Versão sem medição DOM — para selftest Node. */
export function prepareChaveLabelSvgMarkupForTest(
  input: PatioKeyLabelInput,
  layoutOrOptions?: LabelTemplateLayout | LabelChaveSvgOptions | null
): {
  svgMarkup: string;
  values: Record<ChaveLabelFieldKey, string>;
  options: LabelChaveSvgOptions;
} {
  const options = resolveChaveSvgOptions(layoutOrOptions ?? createDefaultChaveSvgOptions());
  const values = resolveChaveLabelValues(input, options);
  let markup = String(chaveBaseSvg);

  (Object.keys(FIELD_IDS) as ChaveLabelFieldKey[]).forEach((field) => {
    const value = values[field];
    const layout = options.fields[field];
    const base = CHAVE_FIELD_BASE_POS[field];
    FIELD_IDS[field].forEach((id, index) => {
      const x = base.x + FACE2_DX * index + layout.offsetX;
      const y = base.y + layout.offsetY;
      const fill = base.onBlack ? '#ffffff' : '#000000';
      const cls = base.onBlack ? 'chave-field-on-black' : 'chave-field';
      const re = new RegExp(`(<text\\b[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)(</text>)`, 'i');
      markup = markup.replace(re, (_m, open: string, _inner: string, close: string) => {
        let tag = open as string;
        tag = tag.replace(/\sfill="[^"]*"/i, '');
        tag = tag.replace(/\sclass="[^"]*"/i, '');
        tag = tag.replace(/\sfont-size="[^"]*"/i, '');
        tag = tag.replace(/\stext-anchor="[^"]*"/i, '');
        tag = tag.replace(/\sdata-max-width="[^"]*"/i, '');
        tag = tag.replace(/\sx="[^"]*"/i, '');
        tag = tag.replace(/\sy="[^"]*"/i, '');
        tag = tag.replace(/\stransform="[^"]*"/i, '');
        tag = tag.replace(
          />$/,
          ` class="${cls}" fill="${fill}" font-size="${layout.fontSize}" text-anchor="${layout.anchor}" data-max-width="${layout.maxWidth}" x="${x}" y="${y}" transform="rotate(-90 ${x} ${y})">`
        );
        const safe = value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `${tag}${safe}${close}`;
      });
    });
  });

  return { svgMarkup: markup, values, options };
}

export function rasterizeSvgMarkupToPngDataUrl(
  svgMarkup: string,
  width = NIIMBOT_LABEL_W_PX,
  height = NIIMBOT_LABEL_H_PX
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas 2D indisponível'));
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
          const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const v = y < 160 ? 0 : 255;
          d[i] = d[i + 1] = d[i + 2] = v;
          d[i + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Falha ao rasterizar SVG'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Falha ao carregar SVG da etiqueta de chaves'));
    };
    img.src = url;
  });
}

export async function renderChaveLabelFromSvg(
  input: PatioKeyLabelInput,
  layoutOrOptions?: LabelTemplateLayout | LabelChaveSvgOptions | null
): Promise<{
  dataUrl: string;
  warnings: ChaveLabelFitWarning[];
  values: Record<ChaveLabelFieldKey, string>;
  options: LabelChaveSvgOptions;
}> {
  const prepared = prepareChaveLabelSvg(input, layoutOrOptions);
  const dataUrl = await rasterizeSvgMarkupToPngDataUrl(prepared.svgMarkup);
  return {
    dataUrl,
    warnings: prepared.warnings,
    values: prepared.values,
    options: prepared.options,
  };
}
