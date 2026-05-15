import { jsPDF } from 'jspdf';
import type { ServiceOrderListItem } from '../services/apiService';
import { getStageConfig, CANCELLED_STATUS } from '../constants/serviceOrderStages';
import type { TechnicianCountRow, ModelRankRow } from './workshopReports';
import { formatPlateDisplay } from './workshopReports';

const MARGIN = 14;
/** Larguras em mm (retrato A4: ~182 mm úteis) */
const ORDER_COL_WIDTHS = [16, 40, 22, 48, 56];

export type WorkshopReportPdfMeta = {
  periodLong: string;
  periodShort: string;
  scopeNote: string;
};

function orderStatusLabel(o: ServiceOrderListItem): string {
  return getStageConfig(o.status)?.name ?? (o.status === CANCELLED_STATUS ? 'Arquivado' : String(o.status));
}

function ordersToTableRows(orders: ServiceOrderListItem[], blurPlates: boolean): string[][] {
  return orders.map((o) => {
    const vehicle =
      [o.vehicle_brand, o.vehicle_model].filter(Boolean).join(' ') || o.module_identification || '—';
    return [
      o.os_number != null ? String(o.os_number) : o.id.slice(0, 8),
      o.customer_name ?? o.customers?.name ?? '—',
      formatPlateDisplay(o.plate, blurPlates),
      vehicle.length > 70 ? `${vehicle.slice(0, 67)}…` : vehicle,
      orderStatusLabel(o),
    ];
  });
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'relatorio';
}

function drawBrandHeader(doc: jsPDF): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(2, 132, 199);
  doc.rect(0, 0, pageW, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('REI DO ABS', MARGIN, 11);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Centro de relatórios', MARGIN, 16);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  return 28;
}

function drawMetaBlock(doc: jsPDF, y: number, meta: WorkshopReportPdfMeta, subtitle: string): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(subtitle, MARGIN, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);
  doc.text(`Período: ${meta.periodLong}`, MARGIN, y);
  y += 5;
  doc.text(`Referência: ${meta.periodShort}`, MARGIN, y);
  y += 5;
  doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, MARGIN, y);
  y += 5;
  doc.text(meta.scopeNote, MARGIN, y);
  y += 6;
  doc.setTextColor(0, 0, 0);
  return y;
}

function drawTable(
  doc: jsPDF,
  y: number,
  headers: string[],
  rows: string[][],
  colWidths: number[]
): number {
  const pageH = doc.internal.pageSize.getHeight();
  const bottom = pageH - MARGIN;
  const headerH = 6;
  const baseRowH = 4.5;
  const fontSize = 7.5;
  const tableW = colWidths.reduce((a, b) => a + b, 0);

  const drawHead = () => {
    doc.setFillColor(236, 236, 236);
    doc.rect(MARGIN, y - 3, tableW, headerH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    let x = MARGIN;
    headers.forEach((h, i) => {
      doc.text(h, x + 1, y + 1.5);
      x += colWidths[i];
    });
    y += headerH;
    doc.setFont('helvetica', 'normal');
  };

  drawHead();

  for (const row of rows) {
    const linesPerCol = row.map((cell, i) =>
      doc.splitTextToSize(cell || '—', colWidths[i] - 2)
    );
    const maxLines = Math.max(1, ...linesPerCol.map((l) => l.length));
    const rowH = baseRowH + (maxLines - 1) * 3.2;
    if (y + rowH > bottom) {
      doc.addPage();
      y = MARGIN + 4;
      drawHead();
    }
    let x = MARGIN;
    row.forEach((cell, i) => {
      const lines = doc.splitTextToSize(cell || '—', colWidths[i] - 2);
      doc.text(lines, x + 1, y + 3);
      x += colWidths[i];
    });
    y += rowH;
  }
  return y + 4;
}

/** PDF da secção atual (lista de OS). */
export function downloadOrdersReportPdf(
  sectionTitle: string,
  footnote: string,
  orders: ServiceOrderListItem[],
  meta: WorkshopReportPdfMeta,
  blurPlates: boolean
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let y = drawBrandHeader(doc);
  y = drawMetaBlock(doc, y, meta, sectionTitle);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  const foot = doc.splitTextToSize(footnote, doc.internal.pageSize.getWidth() - 2 * MARGIN);
  doc.text(foot, MARGIN, y);
  y += foot.length * 3.5 + 4;
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');

  const name = `rei_abs_${safeFilenamePart(sectionTitle)}_${safeFilenamePart(meta.periodShort)}.pdf`;

  if (orders.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('Nenhum registro no período para este critério.', MARGIN, y);
    doc.save(name);
    return;
  }

  const headers = ['OS', 'Cliente', 'Placa', 'Veículo', 'Status'];
  const rows = ordersToTableRows(orders, blurPlates);
  drawTable(doc, y, headers, rows, ORDER_COL_WIDTHS);

  doc.save(name);
}

/** PDF: ranking de modelos. */
export function downloadModelsReportPdf(
  models: ModelRankRow[],
  meta: WorkshopReportPdfMeta
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let y = drawBrandHeader(doc);
  y = drawMetaBlock(doc, y, meta, 'Modelos mais frequentes');
  if (models.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('Nenhum modelo registrado nas entradas deste período.', MARGIN, y);
    doc.save(`rei_abs_modelos_${safeFilenamePart(meta.periodShort)}.pdf`);
    return;
  }
  const headers = ['#', 'Marca', 'Modelo', 'Qtd.'];
  const colW = [12, 45, 95, 30];
  const rows = models.map((m, i) => [String(i + 1), m.brand, m.model, String(m.count)]);
  drawTable(doc, y, headers, rows, colW);
  doc.save(`rei_abs_modelos_${safeFilenamePart(meta.periodShort)}.pdf`);
}

/** PDF: resumo por técnico (tabelas por bloco). */
export function downloadTechniciansReportPdf(
  technicians: TechnicianCountRow[],
  meta: WorkshopReportPdfMeta,
  blurPlates: boolean
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let y = drawBrandHeader(doc);
  y = drawMetaBlock(doc, y, meta, 'Responsabilidade por técnico (data de entrada)');

  if (technicians.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('Nenhuma OS com entrada no período.', MARGIN, y);
    doc.save(`rei_abs_tecnicos_${safeFilenamePart(meta.periodShort)}.pdf`);
    return;
  }

  const headers = ['OS', 'Cliente', 'Placa', 'Veículo', 'Status'];

  for (const t of technicians) {
    const blockTitle = `${t.displayName} — ${t.count} OS`;
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = MARGIN + 4;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(blockTitle, MARGIN, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    const rows = ordersToTableRows(t.orders, blurPlates);
    y = drawTable(doc, y, headers, rows, ORDER_COL_WIDTHS);
  }

  doc.save(`rei_abs_tecnicos_${safeFilenamePart(meta.periodShort)}.pdf`);
}

/** Um único PDF com todas as secções (síntese + tabelas resumidas). */
export function downloadFullWorkshopReportPdf(opts: {
  meta: WorkshopReportPdfMeta;
  blurPlates: boolean;
  includeModules: boolean;
  kpis: { entradas: number; fluxo: number; garantia: number; totalFiltrado: number };
  entradas: ServiceOrderListItem[];
  fluxo: ServiceOrderListItem[];
  garantia: ServiceOrderListItem[];
  tecnicos: TechnicianCountRow[];
  modelos: ModelRankRow[];
}): void {
  const { meta, blurPlates, includeModules, kpis, entradas, fluxo, garantia, tecnicos, modelos } = opts;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let y = drawBrandHeader(doc);
  y = drawMetaBlock(doc, y, meta, 'Relatório consolidado');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Resumo', MARGIN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const scopeExtra = includeModules ? ' e módulos' : '';
  const lines = [
    `Entradas no período: ${kpis.entradas}`,
    `Entrada e saída (mesmo período): ${kpis.fluxo}`,
    `Garantia (entradas): ${kpis.garantia}`,
    `Base filtrada (veículos${scopeExtra}): ${kpis.totalFiltrado} OS`,
  ];
  lines.forEach((ln) => {
    doc.text(ln, MARGIN, y);
    y += 5;
  });
  y += 4;

  const headers = ['OS', 'Cliente', 'Placa', 'Veículo', 'Status'];

  const addSection = (title: string, orders: ServiceOrderListItem[], maxRows = 80) => {
    if (orders.length === 0) return;
    if (y > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage();
      y = MARGIN + 4;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${title} (${orders.length})`, MARGIN, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    const slice = orders.slice(0, maxRows);
    const rows = ordersToTableRows(slice, blurPlates);
    y = drawTable(doc, y, headers, rows, ORDER_COL_WIDTHS);
    if (orders.length > maxRows) {
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`… e mais ${orders.length - maxRows} registro(s) (exporte CSV na secção para lista completa).`, MARGIN, y);
      y += 5;
      doc.setTextColor(0, 0, 0);
    }
  };

  addSection('Entradas', entradas);
  addSection('Entrada e saída', fluxo);
  addSection('Garantia', garantia);

  if (tecnicos.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = MARGIN + 4;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Por técnico (resumo)', MARGIN, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const t of tecnicos) {
      const osSample = t.orders
        .slice(0, 12)
        .map((o) => (o.os_number != null ? `#${o.os_number}` : o.id.slice(0, 6)))
        .join(', ');
      const line = `${t.displayName}: ${t.count} OS${osSample ? ` — ${osSample}` : ''}`;
      const wrapped = doc.splitTextToSize(line, doc.internal.pageSize.getWidth() - 2 * MARGIN);
      if (y + wrapped.length * 4 > doc.internal.pageSize.getHeight() - MARGIN) {
        doc.addPage();
        y = MARGIN + 4;
      }
      doc.text(wrapped, MARGIN, y);
      y += wrapped.length * 4 + 2;
    }
    y += 2;
  }

  if (modelos.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = MARGIN + 4;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Top modelos', MARGIN, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    const hdr = ['#', 'Marca', 'Modelo', 'Qtd.'];
    const colW = [12, 45, 95, 30];
    const mrows = modelos.map((m, i) => [String(i + 1), m.brand, m.model, String(m.count)]);
    y = drawTable(doc, y, hdr, mrows, colW);
  }

  doc.save(`rei_abs_relatorio_completo_${safeFilenamePart(meta.periodShort)}.pdf`);
}
