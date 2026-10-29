import type { ServiceOrderDetail } from '../services/apiService';
import { budgetLastActivityMs } from '../services/apiService';
import { formatLaborLabel } from './workshopLaborFormat';
import { parsePatioCardTitle } from './patioCardTitle';
import type { BudgetPrintBudget } from './budgetPrintWithDetail';
import { NIIMBOT_LABEL_W_PX } from './niimbotLabelRender';

export type BudgetContinuousPrintInput = {
  budget: BudgetPrintBudget;
  detail: ServiceOrderDetail | null;
  isModuleMode: boolean;
  mileageKm?: string | null;
  /** Largura do cabeçote (384 B1 / 576 Pro). Sempre múltiplo de 8. */
  widthPx?: number;
};

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const words = raw.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      if (ctx.measureText(word).width <= maxWidth) {
        cur = word;
      } else {
        let chunk = '';
        for (const ch of word) {
          const t = chunk + ch;
          if (ctx.measureText(t).width <= maxWidth) chunk = t;
          else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        cur = chunk;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function roundUpToMultiple(n: number, multiple: number): number {
  const m = Math.max(1, multiple | 0);
  return Math.ceil(Math.max(1, n) / m) * m;
}

/**
 * Bitmap (PNG data URL) do orçamento aprovado para bobina 50 mm (altura livre).
 * Largura = cabeçote B1 (384 @ 203 dpi ≈ 48 mm úteis na bobina de 50 mm).
 */
export function renderBudgetContinuousDataUrl(input: BudgetContinuousPrintInput): string {
  const width = roundUpToMultiple(
    Math.max(192, Math.floor(input.widthPx || NIIMBOT_LABEL_W_PX)),
    8
  );
  const padX = Math.max(8, Math.round(width * 0.04));
  const contentW = width - padX * 2;
  const lineGap = 2;

  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = width;
  measureCanvas.height = 64;
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponível');

  const { budget, detail, isModuleMode, mileageKm } = input;
  const titleParts = parsePatioCardTitle(budget.cardName || '');
  const customerName = detail?.customers?.name || titleParts.customer || '—';
  const vehicleName = detail?.vehicle_model || titleParts.vehicle || '—';
  const plateOrModule = isModuleMode
    ? detail?.module_identification || titleParts.plateOrModule || '—'
    : (detail?.plate || titleParts.plateOrModule || '—').toUpperCase();
  const brand = detail?.vehicle_brand || '—';
  const osNumber = detail?.os_number != null ? String(detail.os_number) : '—';
  const mileage = mileageKm || detail?.mileage_km || '—';
  const dateStr = new Date(budgetLastActivityMs(budget)).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const approvedServices = budget.services.filter((s) => s.approved === true);
  const approvedParts = budget.parts.filter((p) => p.approved === true);

  type DrawOp = { draw: (c: CanvasRenderingContext2D) => void };
  const ops: DrawOp[] = [];
  let y = 12;

  const pushText = (text: string, font: string, gapAfter = lineGap) => {
    ctx.font = font;
    const lines = wrapLines(ctx, text, contentW);
    for (const line of lines) {
      const at = y;
      ops.push({
        draw: (c) => {
          c.font = font;
          c.fillStyle = '#000';
          c.textBaseline = 'top';
          c.fillText(line, padX, at);
        },
      });
      const m = ctx.measureText(line);
      const ascent = m.actualBoundingBoxAscent || 0;
      const descent = m.actualBoundingBoxDescent || 0;
      const lh = Math.max(11, Math.ceil(ascent + descent) || Math.round(parseInt(font, 10) || 12));
      y += lh + 1;
    }
    y += gapAfter;
  };

  const pushRule = (gapAfter = 8) => {
    const at = y;
    ops.push({
      draw: (c) => {
        c.strokeStyle = '#000';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(padX, at + 0.5);
        c.lineTo(width - padX, at + 0.5);
        c.stroke();
      },
    });
    y += gapAfter;
  };

  const scale = width / NIIMBOT_LABEL_W_PX;
  const fontTitle = `bold ${Math.round(16 * scale)}px Arial, Helvetica, sans-serif`;
  const fontSub = `bold ${Math.round(12 * scale)}px Arial, Helvetica, sans-serif`;
  const fontBody = `bold ${Math.round(12 * scale)}px Arial, Helvetica, sans-serif`;
  const fontSmall = `${Math.round(11 * scale)}px Arial, Helvetica, sans-serif`;
  const fontMeta = `${Math.round(10 * scale)}px Arial, Helvetica, sans-serif`;

  pushText('REI DO ABS', fontTitle, 2);
  pushText('ORÇAMENTO APROVADO', fontSub, 4);
  pushText(`OS ${osNumber}  ${dateStr}`, fontMeta, 6);
  pushRule(8);

  pushText(`Cliente: ${customerName}`, fontBody, 2);
  pushText(
    isModuleMode ? `Módulo: ${plateOrModule}` : `Placa: ${plateOrModule}`,
    fontBody,
    2
  );
  pushText(`Veículo: ${brand} ${vehicleName}`.replace(/\s+/g, ' ').trim(), fontBody, 2);
  pushText(`KM: ${mileage}`, fontBody, 6);
  pushRule(8);

  if (approvedServices.length > 0) {
    pushText('SERVIÇOS', fontSub, 4);
    for (const s of approvedServices) {
      const dur =
        s.labor_hours != null && Number.isFinite(Number(s.labor_hours))
          ? ` (${formatLaborLabel(Number(s.labor_hours))})`
          : '';
      pushText(`- ${s.description}${dur}`, fontSmall, 3);
    }
    y += 4;
  }

  if (approvedParts.length > 0) {
    pushText('PEÇAS', fontSub, 4);
    for (const p of approvedParts) {
      pushText(`- (${p.quantity}x) ${p.description}`, fontSmall, 3);
    }
    y += 4;
  }

  if (approvedServices.length === 0 && approvedParts.length === 0) {
    pushText('Nenhum item aprovado.', fontSmall, 6);
  }

  pushRule(8);
  pushText('Assinatura: ____________________', fontMeta, 3);
  pushText('Data teste: ____/____/______', fontMeta, 3);
  // Folga no fim da bobina (PrintEnd pode puxar um pouco o papel).
  y += 36;

  const height = roundUpToMultiple(Math.max(80, Math.ceil(y)), 8);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx2 = canvas.getContext('2d');
  if (!ctx2) throw new Error('Canvas 2D indisponível');
  ctx2.fillStyle = '#fff';
  ctx2.fillRect(0, 0, width, height);
  ctx2.fillStyle = '#000';
  for (const op of ops) op.draw(ctx2);

  return canvas.toDataURL('image/png');
}
