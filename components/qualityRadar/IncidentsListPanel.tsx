import React from 'react';
import { RefreshCw, Search, User } from 'lucide-react';
import type {
  QualityIncident,
  QualityIncidentCategory,
  QualityIncidentSeverity,
  QualityIncidentStatus,
} from '../../services/apiService';
import {
  QUALITY_CATEGORIES,
  QUALITY_CATEGORY_LABEL,
  QUALITY_SEVERITIES,
  QUALITY_SEVERITY_LABEL,
  QUALITY_SEVERITY_SOLID,
  QUALITY_STATUSES,
  QUALITY_STATUS_LABEL,
  QUALITY_STATUS_SOLID,
} from '../../constants/qualityRadar';
import type { QualityRadarTechnicianOption } from '../../utils/qualityRadarTechnicians';
import { hub } from './hubTheme';
import { HubEmptyState, HubSectionHeader } from './HubPrimitives';

export function IncidentsListPanel({
  items,
  loading,
  error,
  technicians,
  search,
  filterTechnicianId,
  filterCategory,
  filterSeverity,
  filterStatus,
  onSearch,
  onFilterTechnicianId,
  onFilterCategory,
  onFilterSeverity,
  onFilterStatus,
  onClearFilters,
  onOpenCreate,
  onOpenEdit,
  title = 'Ocorrências',
  subtitle = 'Histórico operacional preservado. Não representa nota de desempenho.',
  showCreate = true,
}: {
  items: QualityIncident[] | null;
  loading: boolean;
  error: string | null;
  technicians: QualityRadarTechnicianOption[];
  search: string;
  filterTechnicianId: string;
  filterCategory: QualityIncidentCategory | '';
  filterSeverity: QualityIncidentSeverity | '';
  filterStatus: QualityIncidentStatus | '';
  onSearch: (v: string) => void;
  onFilterTechnicianId: (v: string) => void;
  onFilterCategory: (v: QualityIncidentCategory | '') => void;
  onFilterSeverity: (v: QualityIncidentSeverity | '') => void;
  onFilterStatus: (v: QualityIncidentStatus | '') => void;
  onClearFilters: () => void;
  onOpenCreate: () => void;
  onOpenEdit: (id: string) => void;
  title?: string;
  subtitle?: string;
  showCreate?: boolean;
}) {
  const hasFilters = Boolean(
    filterTechnicianId || filterCategory || filterSeverity || filterStatus || search
  );

  return (
    <div className={hub.stack}>
      <HubSectionHeader
        title={title}
        subtitle={subtitle}
        actions={
          showCreate ? (
            <button type="button" onClick={onOpenCreate} className={hub.btnPrimary}>
              Nova ocorrência
            </button>
          ) : null
        }
      />

      <div className={`${hub.surface} ${hub.cardPad}`}>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${hub.muted}`} />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Buscar título, funcionário, placa…"
              className={`${hub.input} pl-10`}
            />
          </div>
          <select
            value={filterTechnicianId}
            onChange={(e) => onFilterTechnicianId(e.target.value)}
            className={hub.select}
          >
            <option value="">Todos os funcionários</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => onFilterCategory(e.target.value as QualityIncidentCategory | '')}
            className={hub.select}
          >
            <option value="">Todas categorias</option>
            {QUALITY_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={filterSeverity}
            onChange={(e) => onFilterSeverity(e.target.value as QualityIncidentSeverity | '')}
            className={hub.select}
          >
            <option value="">Todas severidades</option>
            {QUALITY_SEVERITIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => onFilterStatus(e.target.value as QualityIncidentStatus | '')}
            className={hub.select}
          >
            <option value="">Todos status</option>
            {QUALITY_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {hasFilters ? (
          <button type="button" onClick={onClearFilters} className={`${hub.btnGhost} mb-3 px-0`}>
            Limpar filtros
          </button>
        ) : null}

        {error ? (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {loading && !items ? (
          <div className={`flex flex-col items-center gap-3 py-16 ${hub.muted}`}>
            <RefreshCw className="h-8 w-8 animate-spin text-zinc-400" />
            <p>Carregando ocorrências…</p>
          </div>
        ) : items && items.length === 0 ? (
          <HubEmptyState
            title="Nenhuma ocorrência no período"
            description="O histórico operacional permanece disponível. Novos registros podem ser criados quando necessário."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {(items ?? []).map((inc) => (
              <button
                key={inc.id}
                type="button"
                onClick={() => onOpenEdit(inc.id)}
                className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:bg-[#FAFAFA] dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`${hub.badge} ${QUALITY_STATUS_SOLID[inc.status]}`}>
                    {QUALITY_STATUS_LABEL[inc.status]}
                  </span>
                  <span className={`${hub.badge} ${QUALITY_SEVERITY_SOLID[inc.severity]}`}>
                    {QUALITY_SEVERITY_LABEL[inc.severity]}
                  </span>
                  <span className={`${hub.badge} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900`}>
                    {QUALITY_CATEGORY_LABEL[inc.category]}
                  </span>
                  {inc.plate ? (
                    <span className={`${hub.badge} bg-zinc-100 font-mono text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100`}>
                      {inc.plate}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-2 text-[15px] font-semibold text-zinc-900 dark:text-white">
                  {inc.title || 'Sem título'}
                </h3>
                <p className={`mt-0.5 flex items-center gap-1.5 text-[13px] ${hub.muted}`}>
                  <User className="h-3.5 w-3.5 shrink-0" />
                  {inc.technicianName || 'Funcionário não informado'}
                  <span>·</span>
                  {new Date(inc.occurredAt).toLocaleDateString('pt-BR')}
                </p>
                {inc.description ? (
                  <p className={`mt-2 line-clamp-2 text-[13px] ${hub.muted}`}>{inc.description}</p>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
