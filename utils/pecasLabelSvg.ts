/**
 * Etiqueta de peças — SVG-base fixo (50×30 mm) com marca PEÇAS (carro+engrenagem).
 * Campos dinâmicos: modelo, cor, cliente, placa (mapa_campos_pecas.json).
 */
import { PECAS_LABEL_BASE_SVG } from './pecasLabelSvgBase';
import mapaCamposPecasJson from '../assets/labels/mapa_campos_pecas.json';
import { NIIMBOT_LABEL_H_PX, NIIMBOT_LABEL_W_PX } from './niimbotLabelRender';
import type { PatioPecasLabelInput } from './patioPecasLabelRender'; // type-only — evita ciclo com render async

/** SVG-base versionado (espelho de assets/labels/etiqueta_pecas_BASE_50x30.svg). */
export const pecasBaseSvg = PECAS_LABEL_BASE_SVG;

export type PecasLabelFieldKey = 'modelo' | 'cor' | 'cliente' | 'placa';

type PecasFieldMap = {
  key: PecasLabelFieldKey;
  x: number;
  baseline_y: number;
  max_width: number;
  font_size: number;
  min_font_size: number;
  align: 'start' | 'middle' | 'end';
};

export const mapaCamposPecas = mapaCamposPecasJson as {
  dimensions: {
    width_mm: number;
    height_mm: number;
    viewBox: number[];
    orientation: string;
    mirrored: boolean;
  };
  fields: PecasFieldMap[];
  rules?: string[];
};

export const PECAS_FIELD_IDS: Record<PecasLabelFieldKey, string> = {
  modelo: 'campo-modelo',
  cor: 'campo-cor',
  cliente: 'campo-cliente',
  placa: 'campo-placa',
};

export type PecasLabelFitWarning = {
  field: PecasLabelFieldKey;
  original: string;
  fitted: string;
  reason: 'abbreviated' | 'min-font' | 'empty';
};

export type PecasLabelPrepareResult = {
  svgMarkup: string;
  warnings: PecasLabelFitWarning[];
  values: Record<PecasLabelFieldKey, string>;
};

function cleanSpaces(raw: string): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toUpperClean(raw: string): string {
  return cleanSpaces(raw).toLocaleUpperCase('pt-BR');
}

/** Placa: preserva caracteres da OS; só normaliza espaços e caixa. */
export function formatPecasLabelPlate(raw: string): string {
  const t = toUpperClean(raw);
  return t || '—';
}

export function formatPecasLabelModelo(raw: string): string {
  return toUpperClean(raw) || '—';
}

export function formatPecasLabelCor(raw: string): string {
  return toUpperClean(raw) || '—';
}

export function formatPecasLabelCliente(raw: string): string {
  let name = cleanSpaces(raw);
  if (name.toLocaleLowerCase('pt-BR').startsWith('cliente:')) {
    name = cleanSpaces(name.slice(name.indexOf(':') + 1));
  }
  return name || '—';
}

export function resolvePecasLabelValues(
  input: PatioPecasLabelInput
): Record<PecasLabelFieldKey, string> {
  return {
    modelo: formatPecasLabelModelo(input.vehicleModel),
    cor: formatPecasLabelCor(input.vehicleColor),
    cliente: formatPecasLabelCliente(input.customerName),
    placa: formatPecasLabelPlate(input.plate),
  };
}

function fieldMap(key: PecasLabelFieldKey): PecasFieldMap {
  const found = mapaCamposPecas.fields.find((f) => f.key === key);
  if (!found) {
    throw new Error(`Campo ${key} ausente em mapa_campos_pecas.json`);
  }
  return found;
}

function measureTextLength(el: SVGTextElement): number {
  try {
    const len = el.getComputedTextLength?.();
    if (typeof len === 'number' && Number.isFinite(len) && len > 0) return len;
  } catch {
    /* ignore */
  }
  const text = el.textContent || '';
  const size = Number(el.getAttribute('font-size') || 20);
  return text.length * size * 0.56;
}

function abbreviateToFit(
  el: SVGTextElement,
  value: string,
  maxWidth: number
): { text: string; abbreviated: boolean } {
  el.textContent = value;
  if (measureTextLength(el) <= maxWidth) {
    return { text: value, abbreviated: false };
  }
  let s = value;
  while (s.length > 1 && measureTextLength(el) > maxWidth) {
    s = s.slice(0, -1);
    el.textContent = `${s}…`;
  }
  if (!s) {
    el.textContent = '—';
    return { text: '—', abbreviated: true };
  }
  return { text: el.textContent || s, abbreviated: true };
}

function fitFieldText(
  el: SVGTextElement,
  field: PecasLabelFieldKey,
  value: string,
  maxWidth: number,
  baseSize: number,
  minSize: number
): PecasLabelFitWarning | null {
  if (!value || value === '—') {
    el.textContent = '—';
    el.setAttribute('font-size', String(baseSize));
    return { field, original: value || '', fitted: '—', reason: 'empty' };
  }

  let size = baseSize;
  el.setAttribute('font-size', String(size));
  el.textContent = value;

  while (size > minSize && measureTextLength(el) > maxWidth) {
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
  el.setAttribute('font-size', String(Math.max(minSize, size)));
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
    throw new Error('SVG-base da etiqueta de peças inválido');
  }
  if (!svg.getElementById('marca-pecas')) {
    throw new Error('SVG-base de peças sem grupo marca-pecas');
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
 * Clona o SVG-base, preenche campos e ajusta fonte ao max_width do mapa.
 */
export function preparePecasLabelSvg(input: PatioPecasLabelInput): PecasLabelPrepareResult {
  if (typeof document === 'undefined') {
    throw new Error('preparePecasLabelSvg requer DOM (browser)');
  }
  const values = resolvePecasLabelValues(input);
  const { svg, cleanup } = mountSvg(pecasBaseSvg);
  const warnings: PecasLabelFitWarning[] = [];
  try {
    (Object.keys(PECAS_FIELD_IDS) as PecasLabelFieldKey[]).forEach((field) => {
      const id = PECAS_FIELD_IDS[field];
      const el = svg.getElementById(id) as SVGTextElement | null;
      if (!el) {
        throw new Error(`Elemento SVG #${id} não encontrado no template de peças`);
      }
      const map = fieldMap(field);
      el.setAttribute('x', String(map.x));
      el.setAttribute('y', String(map.baseline_y));
      el.setAttribute('text-anchor', map.align === 'middle' ? 'middle' : map.align === 'end' ? 'end' : 'start');
      el.setAttribute('data-max-width', String(map.max_width));
      const warning = fitFieldText(
        el,
        field,
        values[field],
        map.max_width,
        map.font_size,
        map.min_font_size
      );
      if (warning) warnings.push(warning);
    });

    const svgMarkup = new XMLSerializer().serializeToString(svg);
    return { svgMarkup, warnings, values };
  } finally {
    cleanup();
  }
}

/** Versão sem medição DOM — para selftest Node. */
export function preparePecasLabelSvgMarkupForTest(
  input: PatioPecasLabelInput
): {
  svgMarkup: string;
  values: Record<PecasLabelFieldKey, string>;
} {
  const values = resolvePecasLabelValues(input);
  let markup = String(pecasBaseSvg);

  (Object.keys(PECAS_FIELD_IDS) as PecasLabelFieldKey[]).forEach((field) => {
    const id = PECAS_FIELD_IDS[field];
    const value = values[field];
    const map = fieldMap(field);
    const re = new RegExp(`(<text\\b[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)(</text>)`, 'i');
    markup = markup.replace(re, (_m, open: string, _inner: string, close: string) => {
      let tag = open as string;
      tag = tag.replace(/\sfont-size="[^"]*"/i, '');
      tag = tag.replace(/\sx="[^"]*"/i, '');
      tag = tag.replace(/\sy="[^"]*"/i, '');
      tag = tag.replace(/\stext-anchor="[^"]*"/i, '');
      tag = tag.replace(
        />$/,
        ` x="${map.x}" y="${map.baseline_y}" font-size="${map.font_size}" text-anchor="${
          map.align === 'middle' ? 'middle' : map.align === 'end' ? 'end' : 'start'
        }">`
      );
      const safe = value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `${tag}${safe}${close}`;
    });
  });

  return { svgMarkup: markup, values };
}

export function rasterizePecasSvgMarkupToPngDataUrl(
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
        reject(err instanceof Error ? err : new Error('Falha ao rasterizar SVG de peças'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Falha ao carregar SVG da etiqueta de peças'));
    };
    img.src = url;
  });
}

export async function renderPecasLabelFromSvg(input: PatioPecasLabelInput): Promise<{
  dataUrl: string;
  warnings: PecasLabelFitWarning[];
  values: Record<PecasLabelFieldKey, string>;
}> {
  const prepared = preparePecasLabelSvg(input);
  const dataUrl = await rasterizePecasSvgMarkupToPngDataUrl(prepared.svgMarkup);
  return {
    dataUrl,
    warnings: prepared.warnings,
    values: prepared.values,
  };
}
