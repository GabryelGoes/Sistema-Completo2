import React from 'react';
import { Loader2 } from 'lucide-react';
import { formatCpfCnpj, onlyDigits } from '../../utils/cpfCnpj';

export type ReceptionLinkedVehicleSuggestion = {
  key: string;
  customerId: string;
  customerName: string;
  phone: string;
  cpf: string | null;
  plate: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string;
  vehicleYear: string;
  vehicleEngineInfo: string;
  mileageKm: string;
  orderId: string | null;
  /** Cliente sem OS/veículo ainda — só cadastro de pessoa. */
  customerOnly?: boolean;
};

export function formatPlateBadge(plate: string): string {
  const p = plate.replace(/\s/g, '').toUpperCase();
  if (p.length === 7) return `${p.slice(0, 3)} ${p.slice(3)}`;
  return p || '—';
}

export function formatVehicleSuggestLine(s: ReceptionLinkedVehicleSuggestion): string {
  const head = [s.vehicleBrand, s.vehicleModel].filter(Boolean).join(' ').trim();
  const parts = [
    head ? head.toUpperCase() : s.customerOnly ? 'Sem veículo vinculado' : 'VEÍCULO',
    s.vehicleEngineInfo,
    s.vehicleYear,
    s.vehicleColor,
  ].filter((p) => (p ?? '').trim().length > 0);
  return parts.join(' - ');
}

function docLabel(cpf: string | null): 'CPF' | 'CNPJ' {
  const d = onlyDigits(cpf ?? '');
  return d.length > 11 ? 'CNPJ' : 'CPF';
}

type ReceptionLinkedVehicleSuggestProps = {
  open: boolean;
  query: string;
  loading?: boolean;
  error?: string | null;
  suggestions: ReceptionLinkedVehicleSuggestion[];
  onSelectVehicle: (row: ReceptionLinkedVehicleSuggestion) => void;
  onSelectNovaPlaca: () => void;
  className?: string;
};

/**
 * Janela de autocomplete/typeahead abaixo do campo (nome ou placa),
 * listando veículos vinculados ao cliente — no estilo da ficha legada.
 */
export const ReceptionLinkedVehicleSuggest: React.FC<ReceptionLinkedVehicleSuggestProps> = ({
  open,
  query,
  loading = false,
  error = null,
  suggestions,
  onSelectVehicle,
  onSelectNovaPlaca,
  className = '',
}) => {
  if (!open) return null;
  const q = query.trim();

  return (
    <div
      className={`absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-md border border-zinc-300 bg-white shadow-[0_10px_28px_-8px_rgba(0,0,0,0.22),0_4px_12px_-4px_rgba(0,0,0,0.1)] dark:border-white/[0.14] dark:bg-zinc-900 ${className}`}
      role="listbox"
      aria-label="Sugestões de veículos vinculados"
    >
      <div className="flex items-center gap-2 bg-[#1e6fd9] px-2 py-1.5 dark:bg-[#1a5bb8]">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onSelectNovaPlaca}
          className="shrink-0 rounded-[4px] bg-[#3cb54a] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-[#34a042]"
          title="Cadastrar nova placa para o cliente encontrado"
        >
          Nova placa
        </button>
        <span className="min-w-0 truncate text-[12px] font-medium text-white/95">{q}</span>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 px-3 py-3 text-xs text-zinc-500 dark:text-zinc-400">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          Carregando veículos…
        </p>
      ) : null}

      {error ? (
        <p className="px-3 py-3 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {!loading && !error ? (
        <div className="max-h-64 overflow-y-auto overscroll-contain">
          {suggestions.length === 0 ? (
            <p className="p-3 text-xs text-zinc-500 dark:text-zinc-400">
              Nenhum veículo encontrado para “{q}”.
            </p>
          ) : (
            <ul>
              {suggestions.map((row, idx) => {
                const zebra = idx % 2 === 1;
                return (
                  <li key={row.key}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onSelectVehicle(row)}
                      className={`flex w-full items-stretch gap-2 px-2.5 py-2 text-left transition-colors hover:bg-sky-50 dark:hover:bg-zinc-800 ${
                        zebra ? 'bg-zinc-50 dark:bg-zinc-950/50' : 'bg-white dark:bg-zinc-900'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          {!row.customerOnly ? (
                            <span className="inline-flex shrink-0 items-center rounded-[3px] border border-zinc-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-zinc-900 dark:border-zinc-300 dark:text-zinc-100">
                              {formatPlateBadge(row.plate)}
                            </span>
                          ) : null}
                          <span className="min-w-0 truncate text-[12px] text-zinc-800 dark:text-zinc-200">
                            {formatVehicleSuggestLine(row)}
                          </span>
                        </div>
                        <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                          <span className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">
                            {row.customerName}
                          </span>
                          {row.phone ? (
                            <span className="text-[11px] italic text-zinc-500 dark:text-zinc-400">
                              Contato: {row.phone}
                            </span>
                          ) : null}
                          {row.cpf ? (
                            <span className="text-[11px] italic text-zinc-500 dark:text-zinc-400">
                              {docLabel(row.cpf)}: {formatCpfCnpj(row.cpf)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
};
