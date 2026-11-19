/**
 * Etiqueta de chaves — SVG-base fixo (50×30 mm) preenchido via DOM + raster Niimbot.
 * Não recria a arte em canvas: carrega o SVG versionado e só troca textContent dos IDs.
 */
import { CHAVE_LABEL_BASE_SVG } from './chaveLabelSvgBase';
import mapaCamposJson from '../assets/labels/mapa_campos.json';
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
    { ids: string[]; source: string; maxWidthSvgUnits: number; prefix?: string }
  >;
};

export type ChaveLabelFieldKey = 'modelo' | 'cor' | 'cliente' | 'placa';

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
};

const FIELD_IDS: Record<ChaveLabelFieldKey, [string, string]> = {
  modelo: ['modelo-1', 'modelo-2'],
  cor: ['cor-1', 'cor-2'],
  cliente: ['cliente-1', 'cliente-2'],
  placa: ['placa-1', 'placa-2'],
};

const MIN_FONT_SIZE = 9;
const DEFAULT_FONT: Record<ChaveLabelFieldKey, number> = {
  modelo: 28,
  cor: 22,
  cliente: 16,
  placa: 24,
};

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

export function formatChaveLabelCliente(raw: string): string {
  const name = cleanSpaces(raw);
  if (!name || name === '—') return 'Cliente: —';
  const prefix =
    typeof mapaCampos?.fields?.cliente?.prefix === 'string'
      ? mapaCampos.fields.cliente.prefix
      : 'Cliente: ';
  if (name.toLocaleLowerCase('pt-BR').startsWith('cliente:')) return name;
  return `${prefix}${name}`;
}

export function resolveChaveLabelValues(input: PatioKeyLabelInput): Record<ChaveLabelFieldKey, string> {
  return {
    modelo: formatChaveLabelModelo(input.vehicleModel),
    cor: formatChaveLabelCor(input.vehicleColor),
    cliente: formatChaveLabelCliente(input.customerName),
    placa: formatChaveLabelPlate(input.plate),
  };
}

function maxWidthForField(field: ChaveLabelFieldKey, el: Element): number {
  const attr = Number(el.getAttribute('data-max-width'));
  if (Number.isFinite(attr) && attr > 0) return attr;
  const fromMap = Number(mapaCampos?.fields?.[field]?.maxWidthSvgUnits);
  if (Number.isFinite(fromMap) && fromMap > 0) return fromMap;
  return 200;
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
  // Fallback aproximado (selftest / ambientes sem layout SVG).
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

  // Tenta cortar por palavras primeiro.
  const words = full.split(' ').filter(Boolean);
  if (words.length > 1) {
    let candidate = full;
    for (let keep = words.length - 1; keep >= 1; keep -= 1) {
      candidate = `${words.slice(0, keep).join(' ')}…`;
      el.textContent = candidate;
      if (measureTextLength(el) <= maxWidth) {
        return { text: candidate, abbreviated: true };
      }
    }
  }

  // Corta caracteres até caber.
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

function fitFieldText(
  el: SVGTextElement,
  field: ChaveLabelFieldKey,
  value: string
): ChaveLabelFitWarning | null {
  const maxWidth = maxWidthForField(field, el);
  const baseSize = Number(el.getAttribute('font-size')) || DEFAULT_FONT[field];
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
  // Espelha o font-size final (já no mínimo).
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
  // Monta fora da tela para getComputedTextLength / getBBox.
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
 * Clona o SVG-base, preenche IDs das duas faces com os mesmos valores e ajusta fonte.
 */
export function prepareChaveLabelSvg(input: PatioKeyLabelInput): ChaveLabelPrepareResult {
  if (typeof document === 'undefined') {
    throw new Error('prepareChaveLabelSvg requer DOM (browser)');
  }
  const values = resolveChaveLabelValues(input);
  const { svg, cleanup } = mountSvg(chaveBaseSvg);
  const warnings: ChaveLabelFitWarning[] = [];
  try {
    (Object.keys(FIELD_IDS) as ChaveLabelFieldKey[]).forEach((field) => {
      const ids = FIELD_IDS[field];
      const value = values[field];
      let sharedWarning: ChaveLabelFitWarning | null = null;
      ids.forEach((id, index) => {
        const el = svg.getElementById(id) as SVGTextElement | null;
        if (!el) {
          throw new Error(`Elemento SVG #${id} não encontrado no template de chaves`);
        }
        const warn = fitFieldText(el, field, value);
        if (index === 0) sharedWarning = warn;
        else if (sharedWarning) {
          // Face 2 herda o mesmo texto/tamanho já ajustado na face 1.
          const face1 = svg.getElementById(ids[0]) as SVGTextElement | null;
          if (face1) {
            el.textContent = face1.textContent;
            el.setAttribute('font-size', face1.getAttribute('font-size') || String(DEFAULT_FONT[field]));
          }
        }
      });
      if (sharedWarning) warnings.push(sharedWarning);
    });

    // Garante faces idênticas (texto + font-size).
    (Object.keys(FIELD_IDS) as ChaveLabelFieldKey[]).forEach((field) => {
      const [id1, id2] = FIELD_IDS[field];
      const a = svg.getElementById(id1) as SVGTextElement | null;
      const b = svg.getElementById(id2) as SVGTextElement | null;
      if (!a || !b) return;
      b.textContent = a.textContent;
      b.setAttribute('font-size', a.getAttribute('font-size') || '');
    });

    const svgMarkup = new XMLSerializer().serializeToString(svg);
    return { svgMarkup, warnings, values };
  } finally {
    cleanup();
  }
}

/** Versão sem medição DOM — para selftest Node (não ajusta fonte real). */
export function prepareChaveLabelSvgMarkupForTest(input: PatioKeyLabelInput): {
  svgMarkup: string;
  values: Record<ChaveLabelFieldKey, string>;
} {
  const values = resolveChaveLabelValues(input);
  let markup = String(chaveBaseSvg);
  (Object.keys(FIELD_IDS) as ChaveLabelFieldKey[]).forEach((field) => {
    const value = values[field];
    FIELD_IDS[field].forEach((id) => {
      // Substitui apenas o conteúdo vazio do <text id="...">...</text> de forma controlada.
      const re = new RegExp(`(<text\\b[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)(</text>)`, 'i');
      markup = markup.replace(re, (_m, open: string, _inner: string, close: string) => {
        // Escapa caracteres XML no textContent serializado.
        const safe = value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `${open}${safe}${close}`;
      });
    });
  });
  return { svgMarkup: markup, values };
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
        // Monocromia leve (térmica): limiar simples.
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
  input: PatioKeyLabelInput
): Promise<{ dataUrl: string; warnings: ChaveLabelFitWarning[]; values: Record<ChaveLabelFieldKey, string> }> {
  const prepared = prepareChaveLabelSvg(input);
  const dataUrl = await rasterizeSvgMarkupToPngDataUrl(prepared.svgMarkup);
  return { dataUrl, warnings: prepared.warnings, values: prepared.values };
}
