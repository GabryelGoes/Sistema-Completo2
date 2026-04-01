import { jsPDF } from 'jspdf';
import type { WorkshopService } from '../services/apiService';

const DEFAULT_CATEGORY = 'Compacto';

function parseServiceName(rawName: string): { category: string; hours: string; title: string } {
  const n = (rawName || '').trim();
  const match = n.match(/^\[(.+?)\s*\|\s*([0-9]+(?:[.,][0-9]+)?)h\]\s*(.+)$/i);
  if (match) {
    return {
      category: match[1].trim(),
      hours: match[2].replace(',', '.'),
      title: match[3].trim(),
    };
  }
  return { category: DEFAULT_CATEGORY, hours: '', title: n };
}

function laborHoursToParts(laborHours: number): { h: number; m: number } {
  const safe = Math.max(0, Number(laborHours) || 0);
  const totalMin = Math.round(safe * 60);
  return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
}

function formatLaborLabel(laborHours: number | null | undefined): string {
  if (laborHours == null || !Number.isFinite(Number(laborHours))) return '—';
  const { h, m } = laborHoursToParts(Number(laborHours));
  if (h === 0 && m === 0) return '0';
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
}

export type WorkshopExportRow = {
  category: string;
  title: string;
  durationLabel: string;
  laborDecimal: string;
};

export function buildWorkshopExportRows(services: WorkshopService[]): WorkshopExportRow[] {
  const rows: WorkshopExportRow[] = services.map((s) => {
    const parsed = parseServiceName(s.name);
    const category = (s.category || parsed.category || DEFAULT_CATEGORY).trim();
    const title = ((parsed.title || '').trim() || (s.name || '').trim()) || '—';
    const laborRaw =
      s.labor_hours != null && Number.isFinite(Number(s.labor_hours))
        ? Number(s.labor_hours)
        : parsed.hours
          ? Number(String(parsed.hours).replace(',', '.'))
          : null;
    const durationLabel = laborRaw != null && laborRaw > 0 ? formatLaborLabel(laborRaw) : '—';
    const laborDecimal =
      laborRaw != null && Number.isFinite(laborRaw) ? String(laborRaw).replace('.', ',') : '—';
    return { category, title, durationLabel, laborDecimal };
  });
  rows.sort(
    (a, b) => a.category.localeCompare(b.category, 'pt') || a.title.localeCompare(b.title, 'pt')
  );
  return rows;
}

export function buildWorkshopServicesText(services: WorkshopService[]): string {
  const rows = buildWorkshopExportRows(services);
  const when = new Date().toLocaleString('pt-BR');
  let out = `SERVIÇOS DA OFICINA\n`;
  out += `Gerado em ${when}\n`;
  out += `${'='.repeat(56)}\n`;
  let current = '';
  for (const r of rows) {
    if (r.category !== current) {
      current = r.category;
      out += `\n▸ ${current}\n${'-'.repeat(40)}\n`;
    }
    out += `  • ${r.title}\n`;
    out += `    Duração: ${r.durationLabel}`;
    if (r.laborDecimal !== '—') out += `  |  horas (valor interno): ${r.laborDecimal}`;
    out += `\n`;
  }
  out += `\n${'='.repeat(56)}\n`;
  out += `Total de itens: ${rows.length}\n`;
  return out;
}

export function downloadWorkshopServicesText(services: WorkshopService[]): void {
  if (services.length === 0) return;
  const text = buildWorkshopServicesText(services);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `servicos-oficina-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadWorkshopServicesPdf(services: WorkshopService[]): void {
  if (services.length === 0) return;
  const rows = buildWorkshopExportRows(services);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 14;
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - margin * 2;
  let y = 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Serviços da oficina', margin, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, y);
  y += 6;
  doc.setTextColor(0, 0, 0);

  let currentCat = '';
  for (const r of rows) {
    if (r.category !== currentCat) {
      currentCat = r.category;
      y += 4;
      if (y > 278) {
        doc.addPage();
        y = 16;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(currentCat, margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
    }

    const bullet = doc.splitTextToSize(`• ${r.title}`, maxW - 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    for (const line of bullet) {
      if (y > 285) {
        doc.addPage();
        y = 16;
      }
      doc.text(line, margin + 1, y);
      y += 5;
    }

    const detail = `Duração: ${r.durationLabel}${r.laborDecimal !== '—' ? `  ·  h (API): ${r.laborDecimal}` : ''}`;
    doc.setFontSize(8.5);
    doc.setTextColor(75, 75, 75);
    const detailLines = doc.splitTextToSize(detail, maxW - 6);
    for (const line of detailLines) {
      if (y > 288) {
        doc.addPage();
        y = 16;
      }
      doc.text(line, margin + 4, y);
      y += 4;
    }
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    y += 2;
  }

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  if (y > 275) {
    doc.addPage();
    y = 16;
  }
  doc.text(`Total: ${rows.length} serviço(s)`, margin, y + 4);

  doc.save(`servicos-oficina-${new Date().toISOString().slice(0, 10)}.pdf`);
}
