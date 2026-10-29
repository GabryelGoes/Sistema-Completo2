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
  /** Largura do cabeçote (384 B1 / 576 Pro). */
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

/**
 * Gera bitmap (data URL) do orçamento aprovado para papel contínuo 50 mm na B1.
 * Altura cresce com o conteúdo; largura = cabeçote.
 */
export function renderBudgetContinuousDataUrl(input: BudgetContinuousPrintInput): string {
  const width = Math.max(192, Math.floor(input.widthPx || NIIMBOT_LABEL_W_PX));
  const padX = Math.round(width * 0.045);
  const contentW = width - padX * 2;
  const lineGap = 3;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  // Altura provisória — redimensiona depois do layout.
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
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

  type DrawOp = { y: number; draw: (c: CanvasRenderingContext2D) => void };
  const ops: DrawOp[] = [];
  let y = 10;

  const pushText = (
    text: string,
    font: string,
    opts?: { bold?: boolean; gapAfter?: number; maxWidth?: number }
  ) => {
    ctx.font = font;
    const lines = wrapLines(ctx, text, opts?.maxWidth ?? contentW);
    for (const line of lines) {
      const at = y;
      ops.push({
        y: at,
        draw: (c) => {
          c.font = font;
          c.fillStyle = '#000';
          c.textBaseline = 'top';
          c.fillText(line, padX, at);
        },
      });
      const m = ctx.measureText(line);
      const lh = Math.ceil((m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0) || 14);
      y += Math.max(12, lh) + 1;
    }
    y += opts?.gapAfter ?? lineGap;
  };

  const pushRule = (gapAfter = 8) => {
    const at = y;
    ops.push({
      y: at,
      draw: (c) => {
        c.strokeStyle = '#000';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(padX, at + 0.5);
        c.lineTo(width - padX, at + 0.5);
        c.stroke();
      },
    });
    y += gapAfter;
  };

  const scale = width / NIIMBOT_LABEL_W_PX;
  const fontTitle = `bold ${Math.round(15 * scale)}px system-ui, sans-serif`;
  const fontSub = `bold ${Math.round(11 * scale)}px system-ui, sans-serif`;
  const fontBody = `${Math.round(11 * scale)}px system-ui, sans-serif`;
  const fontSmall = `${Math.round(10 * scale)}px system-ui, sans-serif`;
  const fontMeta = `${Math.round(9 * scale)}px system-ui, sans-serif`;

  pushText('REI DO ABS', fontTitle, { gapAfter: 2 });
  pushText('Orçamento aprovado', fontSub, { gapAfter: 4 });
  pushText(`OS ${osNumber} · ${dateStr}`, fontMeta, { gapAfter: 6 });
  pushRule();

  pushText(`Cliente: ${customerName}`, fontBody, { gapAfter: 2 });
  pushText(
    isModuleMode ? `Módulo: ${plateOrModule}` : `Placa: ${plateOrModule}`,
    fontBody,
    { gapAfter: 2 }
  );
  pushText(`Veículo: ${brand} ${vehicleName}`.replace(/\s+/g, ' ').trim(), fontBody, {
    gapAfter: 2,
  });
  pushText(`KM: ${mileage}`, fontBody, { gapAfter: 6 });
  pushRule();

  if (approvedServices.length > 0) {
    pushText('SERVIÇOS', fontSub, { gapAfter: 4 });
    for (const s of approvedServices) {
      const dur =
        s.labor_hours != null && Number.isFinite(Number(s.labor_hours))
          ? ` (${formatLaborLabel(Number(s.labor_hours))})`
          : '';
      pushText(`• ${s.description}${dur}`, fontBody, { gapAfter: 3 });
    }
    y += 4;
  }

  if (approvedParts.length > 0) {
    pushText('PEÇAS', fontSub, { gapAfter: 4 });
    for (const p of approvedParts) {
      pushText(`• (${p.quantity}x) ${p.description}`, fontBody, { gapAfter: 3 });
    }
    y += 4;
  }

  if (approvedServices.length === 0 && approvedParts.length === 0) {
    pushText('Nenhum item aprovado.', fontSmall, { gapAfter: 6 });
  }

  pushRule(6);
  pushText('Assinatura: ____________________', fontMeta, { gapAfter: 2 });
  pushText('Data teste: ____/____/______', fontMeta, { gapAfter: 10 });

  const height = Math.max(48, Math.ceil(y));
  canvas.height = height;
  // Reobter contexto após resize (limpa o canvas).
  const ctx2 = canvas.getContext('2d');
  if (!ctx2) throw new Error('Canvas 2D indisponível');
  ctx2.fillStyle = '#fff';
  ctx2.fillRect(0, 0, width, height);
  ctx2.fillStyle = '#000';
  for (const op of ops) op.draw(ctx2);

  return canvas.toDataURL('image/png');
}
