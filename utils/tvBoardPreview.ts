import type { ServiceOrderListItem, TvScope } from '../services/apiService';

/** Etapa exibida no quadro da TV (mesmos rótulos do Patio-View). */
export type TvBoardStage = string;

export interface TvBoardItem {
  id: string;
  /** 1ª coluna: modelo (pátio) ou carro (lab). */
  primary: string;
  /** Cliente (primeiro nome / dois nomes). */
  client: string;
  stage: TvBoardStage;
  /** Placa (pátio) ou compartimento (lab). */
  fourth: string;
  /** Mecânico (pátio) ou produto (lab). */
  fifth: string;
  garantiaTag?: boolean;
}

export const TV_BOARD_CARS_PER_PAGE = 6;
/** Tempo padrão das páginas do quadro na TV física (config local da TV). */
export const TV_BOARD_PAGE_SECONDS = 7;

const PATIO_STAGE_PRIORITY: Record<string, number> = {
  Garantia: 1,
  'Aguardando Avaliação': 2,
  'Em Avaliação': 3,
  'Avaliação Técnica': 4,
  'Aguardando Aprovação': 5,
  Aprovado: 6,
  'Orçamento Aprovado': 7,
  'Aguardando Peças': 8,
  'Peças Disponíveis': 9,
  'Em Serviço': 10,
  'Fase de Teste': 11,
  Finalizado: 12,
  'Orçamento Não Aprovado': 13,
};

const LAB_STAGE_PRIORITY: Record<string, number> = {
  Garantia: 1,
  'Aguardando Avaliação': 2,
  'Avaliação Técnica': 3,
  'Aguardando Aprovação': 4,
  'Orçamento Aprovado': 5,
  'Aguardando Peças': 6,
  'Peças Disponíveis': 7,
  'Envio Conserto': 8,
  'Chegada Conserto': 9,
  'Em Serviço': 10,
  'Pronto pra Retirada': 11,
  'Orçamento Não Aprovado': 12,
};

const PATIO_STATUS_TO_STAGE: Record<string, string> = {
  AGUARDANDO_AVALIACAO: 'Aguardando Avaliação',
  AVALIACAO_TECNICA: 'Avaliação Técnica',
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  ORCAMENTO_APROVADO: 'Orçamento Aprovado',
  AGUARDANDO_PECAS: 'Aguardando Peças',
  PECAS_DISPONIVEIS: 'Peças Disponíveis',
  EM_SERVICO: 'Em Serviço',
  FASE_DE_TESTE: 'Fase de Teste',
  FINALIZADO: 'Finalizado',
  GARANTIA: 'Garantia',
  ORCAMENTO_NAO_APROVADO: 'Orçamento Não Aprovado',
};

const LAB_STATUS_TO_STAGE: Record<string, string> = {
  AGUARDANDO_AVALIACAO: 'Aguardando Avaliação',
  AVALIACAO_TECNICA: 'Avaliação Técnica',
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  ORCAMENTO_APROVADO: 'Orçamento Aprovado',
  AGUARDANDO_PECAS: 'Aguardando Peças',
  PECAS_DISPONIVEIS: 'Peças Disponíveis',
  ENVIO_CONSERTO: 'Envio Conserto',
  CHEGADA_CONSERTO: 'Chegada Conserto',
  EM_SERVICO: 'Em Serviço',
  PRONTO_PRA_RETIRADA: 'Pronto pra Retirada',
  GARANTIA: 'Garantia',
  ORCAMENTO_NAO_APROVADO: 'Orçamento Não Aprovado',
  FINALIZADO: 'Pronto pra Retirada',
  FASE_DE_TESTE: 'Em Serviço',
};

const MODULE_KIND_LABELS: Record<string, string> = {
  completo: 'Módulo completo',
  eletronico: 'Módulo eletrônico',
  hidraulico: 'Módulo hidráulico',
  pinca_freio: 'Pinça de freio',
  outro: 'Outro produto',
};

function firstNameOnly(fullName: string | null | undefined): string {
  const name = (fullName ?? '').trim();
  if (!name) return 'Cliente';
  return name.split(/\s+/).filter(Boolean)[0] || 'Cliente';
}

function firstTwoNames(fullName: string | null | undefined): string {
  const name = (fullName ?? '').trim();
  if (!name) return 'Cliente';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).join(' ') || 'Cliente';
}

function customerDisplayName(row: ServiceOrderListItem): string {
  return (row.customer_name ?? row.customers?.name ?? '').trim();
}

function labProductLabel(row: ServiceOrderListItem): string {
  const k = String(row.module_kind ?? '').toLowerCase().trim();
  if (k === 'outro') {
    const t = String(row.module_product_other ?? '').trim();
    return t || MODULE_KIND_LABELS.outro;
  }
  return MODULE_KIND_LABELS[k] ?? '—';
}

function formatVehicleDisplay(row: ServiceOrderListItem): string {
  const brand = row.vehicle_brand?.trim() ?? '';
  const model = row.vehicle_model?.trim() ?? '';
  const combined = [brand, model].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  if (row.plate?.trim()) return row.plate.trim().toUpperCase();
  return 'Veículo';
}

function formatBenchSlot(slot: number | null | undefined): string {
  if (slot == null || !Number.isFinite(slot)) return '—';
  return String(Math.trunc(slot));
}

/** Classes de fundo da linha (compactas) — alinhadas às cores da TV. */
export function tvBoardStageColorClass(stage: string, scope: TvScope): string {
  const s = stage.toLowerCase();
  if (s.includes('não aprovado') || s.includes('nao aprovado')) {
    return scope === 'laboratorio'
      ? 'bg-violet-600 text-white'
      : 'bg-rose-700 text-white';
  }
  if (s.includes('garantia')) return 'bg-red-600 text-white';
  if (s.includes('avaliação') && s.includes('aguardando')) return 'bg-zinc-500 text-white';
  if (s.includes('aguardando aprovação') || s.includes('aguardando aprovacao')) {
    return 'bg-amber-500 text-amber-950';
  }
  if (s.includes('avaliação técnica') || s.includes('avaliacao tecnica')) {
    return 'bg-[#F5D00B] text-black';
  }
  if (s.includes('orçamento aprovado') || s.includes('orcamento aprovado')) {
    return 'bg-orange-600 text-white';
  }
  if (s.includes('disponíve') || s.includes('disponive')) {
    return 'bg-pink-500 text-white';
  }
  if ((s.includes('aguardando') && s.includes('peças')) || (s.includes('aguardando') && s.includes('pecas'))) {
    return 'bg-teal-500 text-white';
  }
  if (s.includes('envio') && s.includes('conserto')) return 'bg-indigo-600 text-white';
  if (s.includes('chegada') && s.includes('conserto')) return 'bg-cyan-600 text-white';
  if (s.includes('serviço') || s.includes('servico')) return 'bg-blue-600 text-white';
  if (s.includes('fase de teste')) return 'bg-sky-500 text-white';
  if (s.includes('pronto pra retirada') || s.includes('pronto para retirada') || s.includes('finalizado')) {
    return 'bg-green-500 text-black';
  }
  return 'bg-zinc-800 text-white';
}

export function mapServiceOrdersToTvBoard(
  rows: ServiceOrderListItem[],
  scope: TvScope
): TvBoardItem[] {
  const statusMap = scope === 'laboratorio' ? LAB_STATUS_TO_STAGE : PATIO_STATUS_TO_STAGE;
  const priority = scope === 'laboratorio' ? LAB_STAGE_PRIORITY : PATIO_STAGE_PRIORITY;

  const items = rows
    .filter((row) => String(row.status).toUpperCase() !== 'CANCELLED')
    .map((row): TvBoardItem => {
      const stage = statusMap[String(row.status).toUpperCase()] ?? 'Aguardando Avaliação';
      if (scope === 'laboratorio') {
        return {
          id: row.id,
          primary: formatVehicleDisplay(row).replace(/Land Rover/gi, '').trim() || 'Veículo',
          client: firstTwoNames(customerDisplayName(row)),
          stage,
          fourth: formatBenchSlot(row.bench_slot),
          fifth: labProductLabel(row),
          garantiaTag: row.garantia_tag === true,
        };
      }
      const model = (row.vehicle_model || row.module_identification || 'Veículo')
        .replace(/Land Rover/gi, '')
        .trim();
      return {
        id: row.id,
        primary: model || 'Veículo',
        client: firstNameOnly(customerDisplayName(row)),
        stage,
        fourth: (row.plate ?? '---').toUpperCase(),
        fifth: (row.assigned_technician_name || row.assigned_technician || 'Pátio').trim() || 'Pátio',
        garantiaTag: row.garantia_tag === true,
      };
    })
    .filter((item) => priority[item.stage] !== undefined)
    .sort((a, b) => (priority[a.stage] ?? 99) - (priority[b.stage] ?? 99));

  return items;
}

export function tvBoardSectionLabel(scope: TvScope): string {
  return scope === 'laboratorio' ? 'LABORATÓRIO' : 'PÁTIO';
}

export function tvBoardBrandAccentClass(scope: TvScope): string {
  return scope === 'laboratorio' ? 'text-violet-400' : 'text-yellow-400';
}

export function tvBoardCountText(scope: TvScope, count: number): string {
  return scope === 'laboratorio'
    ? `${count} MÓDULOS NO LABORATÓRIO`
    : `${count} VEÍCULOS NO PÁTIO`;
}
