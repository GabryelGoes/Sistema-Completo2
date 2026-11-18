/**
 * Etiqueta de peças da OS (pátio) — Niimbot 50×30 mm (384×240), paisagem.
 * Campos: carro, cor e placa Mercosul. Layout editável em Ajustes → Etiquetas.
 */
import { withLabelElementStyle } from './labelElementStyle';
import {
  cssFontForElement,
  loadLabelTemplate,
  type LabelElementDef,
  type LabelTemplateLayout,
} from './labelTemplates';
import { drawMercosulPlateOnCanvas } from './mercosulPlateCanvas';
import {
  drawKeyLabelIcon,
  keyLabelIconSlotWidth,
  splitKeyLabelPrefix,
} from './keyLabelIcons';
import { NIIMBOT_LABEL_H_PX, NIIMBOT_LABEL_W_PX } from './niimbotLabelRender';

export type PatioPecasLabelInput = {
  vehicleModel: string;
  vehicleColor: string;
  plate: string;
};

function toUpperClean(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('pt-BR');
}

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

function drawBannerChip(ctx: CanvasRenderingContext2D, elDef: LabelElementDef): void {
  if (!elDef.visible) return;
  withLabelElementStyle(ctx, elDef, (c) => {
    const { x, y, w, h } = elDef;
    c.fillStyle = '#000000';
    // Cantos levemente arredondados (impressão térmica ainda lê bem).
    const r = Math.min(6, Math.floor(h / 3));
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
    c.fill();

    const tag = (elDef.labelText || 'PEÇAS').trim() || 'PEÇAS';
    c.fillStyle = '#ffffff';
    c.font = cssFontForElement(elDef, elDef.fontSize);
    c.textBaseline = 'middle';
    const tw = c.measureText(tag).width;
    let tx = x + 8;
    if (elDef.align === 'center') tx = x + (w - tw) / 2;
    else if (elDef.align === 'right') tx = x + w - tw - 8;
    c.fillText(tag, tx, y + h / 2);
    c.textBaseline = 'top';
    c.fillStyle = '#000000';
  });
}

function drawTextField(
  ctx: CanvasRenderingContext2D,
  elDef: LabelElementDef,
  valueText: string,
  opts: { vAlign: 'top' | 'middle' | 'bottom'; letterSpacing: number; lineSpacing: number }
): void {
  if (!elDef.visible) return;
  const x = Math.round(elDef.x);
  const y = Math.round(elDef.y);
  const boxW = Math.max(8, elDef.w);
  const boxH = Math.max(8, elDef.h);

  withLabelElementStyle(
    ctx,
    {
      x,
      y,
      w: boxW,
      h: boxH,
      opacity: elDef.opacity ?? 100,
      rotation: elDef.rotation ?? 0,
    },
    (c) => {
      try {
        (c as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing =
          `${opts.letterSpacing}px`;
      } catch {
        /* ignore */
      }

      if (elDef.id === 'plate') {
        return;
      }

      const font = cssFontForElement(elDef);
      const valueFont = cssFontForElement({
        ...elDef,
        fontSize: elDef.valueFontSize || elDef.fontSize,
      });
      c.fillStyle = '#000000';
      c.textBaseline = 'top';

      const rawLabel = elDef.labelText || '';
      const hasLabel = rawLabel.trim().length > 0;
      const labelText = hasLabel
        ? rawLabel.endsWith(' ')
          ? rawLabel
          : `${rawLabel} `
        : '';
      const { icon, rest } = splitKeyLabelPrefix(labelText);
      const iconSize = Math.max(
        12,
        Math.round((elDef.valueFontSize || elDef.fontSize) * 0.95)
      );
      const iconW = icon ? keyLabelIconSlotWidth(iconSize) : 0;

      c.font = font;
      const restText = icon ? rest : labelText;
      const restW = restText ? c.measureText(restText).width : 0;
      const labelW = iconW + restW;

      c.font = valueFont;
      const valueMax = Math.max(8, boxW - labelW);
      const fitted = fitLineNoEllipsis(c, valueText, valueMax);
      const valueW = c.measureText(fitted).width;
      const fullW = labelW + valueW;

      let drawX = x;
      if (elDef.align === 'center') drawX = x + (boxW - fullW) / 2;
      else if (elDef.align === 'right') drawX = x + (boxW - fullW);

      const lineH = Math.max(
        (elDef.valueFontSize || elDef.fontSize) * (opts.lineSpacing || 1),
        elDef.valueFontSize || elDef.fontSize,
        icon ? iconSize : 0
      );
      let drawY = y;
      if (opts.vAlign === 'middle') drawY = y + Math.max(0, (boxH - lineH) / 2);
      else if (opts.vAlign === 'bottom') drawY = y + Math.max(0, boxH - lineH);

      let cursorX = drawX;
      if (icon) {
        const iconY = drawY + Math.max(0, (lineH - iconSize) / 2);
        drawKeyLabelIcon(c, icon, cursorX, iconY, iconSize);
        cursorX += iconW;
      }
      if (restText) {
        c.font = font;
        c.fillStyle = '#000000';
        c.textBaseline = 'top';
        const textY = drawY + Math.max(0, (lineH - (elDef.fontSize || 16)) / 2);
        c.fillText(restText, cursorX, textY);
        cursorX += restW;
      }
      c.font = valueFont;
      c.fillStyle = '#000000';
      c.textBaseline = 'top';
      const valueY =
        drawY + Math.max(0, (lineH - (elDef.valueFontSize || elDef.fontSize)) / 2);
      c.fillText(fitted, cursorX, valueY);
    }
  );
}

function drawPlate(
  ctx: CanvasRenderingContext2D,
  elDef: LabelElementDef,
  plateText: string,
  useMercosul: boolean,
  vAlign: 'top' | 'middle' | 'bottom'
): void {
  if (!elDef.visible) return;
  const x = Math.round(elDef.x);
  const y = Math.round(elDef.y);
  const boxW = Math.max(8, elDef.w);
  const boxH = Math.max(8, elDef.h);

  withLabelElementStyle(
    ctx,
    {
      x,
      y,
      w: boxW,
      h: boxH,
      opacity: elDef.opacity ?? 100,
      rotation: elDef.rotation ?? 0,
    },
    (c) => {
      if (useMercosul) {
        drawMercosulPlateOnCanvas(c, x, y, boxW, boxH, plateText, {
          textSize: elDef.valueFontSize || elDef.fontSize,
        });
        return;
      }
      const valueFont = cssFontForElement({
        ...elDef,
        fontSize: elDef.valueFontSize || elDef.fontSize,
        fontWeight: elDef.fontWeight || '900',
      });
      c.fillStyle = '#000000';
      c.font = valueFont;
      c.textBaseline = 'top';
      const fitted = fitLineNoEllipsis(c, plateText, boxW);
      const tw = c.measureText(fitted).width;
      let drawX = x;
      if (elDef.align === 'center') drawX = x + (boxW - tw) / 2;
      else if (elDef.align === 'right') drawX = x + (boxW - tw);
      const lineH = elDef.valueFontSize || elDef.fontSize;
      let drawY = y;
      if (vAlign === 'middle') drawY = y + Math.max(0, (boxH - lineH) / 2);
      else if (vAlign === 'bottom') drawY = y + Math.max(0, boxH - lineH);
      c.fillText(fitted, drawX, drawY);
    }
  );
}

/**
 * Monta PNG data URL da etiqueta de peças (384×240 / 50×30 mm).
 */
export function renderPatioPecasLabelDataUrl(
  input: PatioPecasLabelInput,
  layoutInput?: LabelTemplateLayout | null
): string {
  const layout = layoutInput ?? loadLabelTemplate('pecas_os');
  const opts = layout.keyOptions ?? {
    letterSpacing: 0,
    lineSpacing: 1,
    margin: 4,
    halfGap: 2,
    vAlign: 'middle' as const,
    dualCopy: false,
    offsetX: 0,
    offsetY: 0,
    mercosulPlate: true,
  };

  const canvas = document.createElement('canvas');
  canvas.width = NIIMBOT_LABEL_W_PX;
  canvas.height = NIIMBOT_LABEL_H_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  // Modelo completo (fit no canvas); distinto da etiqueta de chave (máx. 2 palavras).
  const vehicleFull = toUpperClean(input.vehicleModel) || '—';
  const color = toUpperClean(input.vehicleColor) || '—';
  const plate = toUpperClean(input.plate) || '—';

  const valueById: Record<string, string> = {
    vehicle: vehicleFull,
    color,
    plate,
  };

  for (const elDef of layout.elements) {
    if (elDef.visible === false) continue;
    const shifted: LabelElementDef = {
      ...elDef,
      x: elDef.x + (opts.offsetX || 0),
      y: elDef.y + (opts.offsetY || 0),
    };
    if (shifted.kind === 'banner') {
      drawBannerChip(ctx, shifted);
      continue;
    }
    if (shifted.id === 'plate' || (shifted.kind === 'text_field' && shifted.id === 'plate')) {
      drawPlate(
        ctx,
        shifted,
        plate,
        opts.mercosulPlate !== false,
        opts.vAlign === 'top' || opts.vAlign === 'bottom' ? opts.vAlign : 'middle'
      );
      continue;
    }
    if (shifted.kind === 'text_field' || shifted.kind === 'text') {
      drawTextField(ctx, shifted, valueById[shifted.id] ?? '—', {
        vAlign: opts.vAlign === 'top' || opts.vAlign === 'bottom' ? opts.vAlign : 'middle',
        letterSpacing: opts.letterSpacing || 0,
        lineSpacing: opts.lineSpacing || 1,
      });
    }
  }

  return canvas.toDataURL('image/png');
}
