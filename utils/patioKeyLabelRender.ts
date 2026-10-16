import { withLabelElementStyle } from './labelElementStyle';
import {
  cssFontForElement,
  loadLabelTemplate,
  saveLabelTemplate,
  type LabelAlign,
  type LabelElementDef,
  type LabelFontFamily,
  type LabelFontWeight,
  type LabelKeyOptions,
  type LabelTemplateLayout,
  type LabelVAlign,
} from './labelTemplates';
import { drawMercosulPlateOnCanvas } from './mercosulPlateCanvas';
import { NIIMBOT_LABEL_H_PX, NIIMBOT_LABEL_W_PX } from './niimbotLabelRender';

export type PatioKeyLabelInput = {
  customerName: string;
  vehicleModel: string;
  vehicleColor: string;
  plate: string;
};

/** @deprecated Use LabelFontFamily — mantido para o modal de impressão. */
export type PatioKeyLabelFontFamily = LabelFontFamily;
export type PatioKeyLabelAlign = LabelAlign;
export type PatioKeyLabelVAlign = LabelVAlign;
export type PatioKeyLabelWeight = LabelFontWeight;

/** Estilo editável da etiqueta de chave (derivado do template unificado). */
export type PatioKeyLabelStyle = {
  fontFamily: PatioKeyLabelFontFamily;
  fontSize: number;
  fontWeight: PatioKeyLabelWeight;
  letterSpacing: number;
  lineSpacing: number;
  align: PatioKeyLabelAlign;
  vAlign: PatioKeyLabelVAlign;
  offsetX: number;
  offsetY: number;
  margin: number;
  halfGap: number;
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

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function styleFromTemplate(layout: LabelTemplateLayout): PatioKeyLabelStyle {
  const first = layout.elements[0];
  const opts = layout.keyOptions;
  const hasLabels = layout.elements.some((e) => (e.labelText || '').trim().length > 0);
  return normalizePatioKeyLabelStyle({
    fontFamily: first?.fontFamily ?? 'Arial',
    fontSize: first?.fontSize ?? 18,
    fontWeight: first?.fontWeight ?? 'bold',
    letterSpacing: opts?.letterSpacing ?? 0,
    lineSpacing: opts?.lineSpacing ?? 1,
    align: first?.align ?? 'left',
    vAlign: opts?.vAlign ?? 'middle',
    offsetX: opts?.offsetX ?? 0,
    offsetY: opts?.offsetY ?? 0,
    margin: opts?.margin ?? 4,
    halfGap: opts?.halfGap ?? 2,
    showLabels: hasLabels,
  });
}

function applyStyleToTemplate(
  layout: LabelTemplateLayout,
  style: PatioKeyLabelStyle
): LabelTemplateLayout {
  const show = style.showLabels !== false;
  const defaults: Record<string, string> = {
    customer: 'Cliente:',
    vehicle: 'Carro:',
    color: 'Cor:',
    plate: '',
  };
  return {
    ...layout,
    elements: layout.elements.map((e) => {
      // Placa Mercosul: tipografia/tamanho vêm só do editor de etiquetas.
      // Ajustes rápidos do modal de impressão não podem sobrescrever valueFontSize.
      if (e.id === 'plate') {
        return {
          ...e,
          labelText: '',
          visible: e.visible !== false,
        };
      }
      return {
        ...e,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        valueFontSize: style.fontSize,
        fontWeight: style.fontWeight,
        align: style.align,
        labelText: show ? e.labelText || defaults[e.id] || e.labelText : '',
        visible: e.visible !== false,
      };
    }),
    keyOptions: {
      letterSpacing: style.letterSpacing,
      lineSpacing: style.lineSpacing,
      margin: style.margin,
      halfGap: style.halfGap,
      vAlign: style.vAlign,
      dualCopy: layout.keyOptions?.dualCopy !== false,
      offsetX: style.offsetX,
      offsetY: style.offsetY,
      mercosulPlate: layout.keyOptions?.mercosulPlate !== false,
    } satisfies LabelKeyOptions,
  };
}

export function loadPatioKeyLabelStyle(): PatioKeyLabelStyle {
  return styleFromTemplate(loadLabelTemplate('chave'));
}

export function savePatioKeyLabelStyle(style: PatioKeyLabelStyle): void {
  const layout = loadLabelTemplate('chave');
  saveLabelTemplate(applyStyleToTemplate(layout, normalizePatioKeyLabelStyle(style)));
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

function renderKeyBlock(
  blockW: number,
  blockH: number,
  input: PatioKeyLabelInput,
  layout: LabelTemplateLayout
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

  const opts = layout.keyOptions!;
  const valueById: Record<string, string> = {
    customer: formatKeyLabelCustomerName(input.customerName),
    vehicle: formatKeyLabelVehicleModel(input.vehicleModel),
    color: toUpperClean(input.vehicleColor) || '—',
    plate: toUpperClean(input.plate) || '—',
  };

  const rows = layout.elements.filter((e) => e.visible !== false && e.kind === 'text_field');
  if (rows.length === 0) return canvas;

  try {
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
      `${opts.letterSpacing}px`;
  } catch {
    /* letterSpacing pode não existir em alguns browsers */
  }

  // Cada texto usa x/y/w/h/rotação próprios (igual ABS / lab / estoque).
  for (const row of rows) {
    const x = Math.round(row.x + opts.offsetX);
    const y = Math.round(row.y + opts.offsetY);
    const boxW = Math.max(8, row.w);
    const boxH = Math.max(8, row.h);
    const valueText = valueById[row.id] ?? '—';

    withLabelElementStyle(
      ctx,
      {
        x,
        y,
        w: boxW,
        h: boxH,
        opacity: row.opacity ?? 100,
        rotation: row.rotation ?? 0,
      },
      (c) => {
        // Placa: Mercosul (P&B) ou texto tradicional — sem rótulo "Placa:".
        if (row.id === 'plate') {
          const useMercosul = opts.mercosulPlate !== false;
          if (useMercosul) {
            drawMercosulPlateOnCanvas(c, x, y, boxW, boxH, valueText, {
              textSize: row.valueFontSize || row.fontSize,
            });
            return;
          }
          // Modo tradicional: só o texto da placa, tipografia forte.
          const valueFont = cssFontForElement({
            ...row,
            fontSize: row.valueFontSize || row.fontSize,
            fontWeight: row.fontWeight || '900',
          });
          c.fillStyle = '#000000';
          c.font = valueFont;
          c.textBaseline = 'top';
          const fitted = fitLineNoEllipsis(c, valueText, boxW);
          const tw = c.measureText(fitted).width;
          let drawX = x;
          if (row.align === 'center') drawX = x + (boxW - tw) / 2;
          else if (row.align === 'right') drawX = x + (boxW - tw);
          const lineH = row.valueFontSize || row.fontSize;
          let drawY = y;
          if (opts.vAlign === 'middle') drawY = y + Math.max(0, (boxH - lineH) / 2);
          else if (opts.vAlign === 'bottom') drawY = y + Math.max(0, boxH - lineH);
          c.fillText(fitted, drawX, drawY);
          return;
        }

        const font = cssFontForElement(row);
        const valueFont = cssFontForElement({
          ...row,
          fontSize: row.valueFontSize || row.fontSize,
        });
        c.fillStyle = '#000000';
        c.textBaseline = 'top';

        const labelText = (row.labelText || '').trim()
          ? row.labelText.endsWith(' ')
            ? row.labelText
            : `${row.labelText} `
          : '';
        c.font = font;
        const labelW = labelText ? c.measureText(labelText).width : 0;
        c.font = valueFont;
        const valueMax = Math.max(8, boxW - labelW);
        const fitted = fitLineNoEllipsis(c, valueText, valueMax);
        c.font = font;
        const fullW = labelW + (() => {
          c.font = valueFont;
          return c.measureText(fitted).width;
        })();

        let drawX = x;
        if (row.align === 'center') {
          drawX = x + (boxW - fullW) / 2;
        } else if (row.align === 'right') {
          drawX = x + (boxW - fullW);
        }

        const lineH = Math.max(
          (row.valueFontSize || row.fontSize) * (opts.lineSpacing || 1),
          row.valueFontSize || row.fontSize
        );
        let drawY = y;
        if (opts.vAlign === 'middle') {
          drawY = y + Math.max(0, (boxH - lineH) / 2);
        } else if (opts.vAlign === 'bottom') {
          drawY = y + Math.max(0, boxH - lineH);
        }

        if (labelText) {
          c.font = font;
          c.fillText(labelText, drawX, drawY);
          c.font = valueFont;
          c.fillText(fitted, drawX + labelW, drawY);
        } else {
          c.font = valueFont;
          c.fillText(fitted, drawX, drawY);
        }
      }
    );
  }

  return canvas;
}

/**
 * Etiqueta de chave — impressão B1 exatamente 50×30 mm (384×240).
 * Conteúdo vertical (leitura na chave) com duas cópias; 2ª rotacionada 180°.
 */
export function renderPatioKeyLabelDataUrl(
  input: PatioKeyLabelInput,
  styleOrLayout?: Partial<PatioKeyLabelStyle> | LabelTemplateLayout | null
): string {
  let layout = loadLabelTemplate('chave');

  if (styleOrLayout && 'elements' in styleOrLayout && Array.isArray(styleOrLayout.elements)) {
    layout = styleOrLayout as LabelTemplateLayout;
  } else if (styleOrLayout) {
    layout = applyStyleToTemplate(
      layout,
      normalizePatioKeyLabelStyle({
        ...DEFAULT_PATIO_KEY_LABEL_STYLE,
        ...(styleOrLayout as Partial<PatioKeyLabelStyle>),
      })
    );
  }

  const opts = layout.keyOptions!;
  const portraitW = NIIMBOT_LABEL_H_PX; // 240 = 30 mm
  const portraitH = NIIMBOT_LABEL_W_PX; // 384 = 50 mm
  const dual = opts.dualCopy !== false;
  const halfH = Math.floor((portraitH - opts.halfGap) / 2);
  // Sem espelhamento: usa a etiqueta inteira para posicionar textos/placa.
  const blockH = dual ? halfH : portraitH;

  const portrait = document.createElement('canvas');
  portrait.width = portraitW;
  portrait.height = portraitH;
  const pctx = portrait.getContext('2d');
  if (!pctx) throw new Error('Canvas 2D indisponível');

  pctx.fillStyle = '#ffffff';
  pctx.fillRect(0, 0, portraitW, portraitH);

  const block = renderKeyBlock(portraitW, blockH, input, layout);
  pctx.drawImage(block, 0, 0);

  if (dual) {
    pctx.save();
    pctx.translate(portraitW, portraitH);
    pctx.rotate(Math.PI);
    pctx.drawImage(block, 0, 0);
    pctx.restore();
  }

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

export type { LabelElementDef, LabelTemplateLayout };
