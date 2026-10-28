import React from 'react';
import {
  ChevronLeft,
  MoreHorizontal,
  FileText,
  Clock,
  ChevronRight,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { VehicleBrandLogo } from '../ui/VehicleBrandLogo';
import { MercosulPlateMockup } from '../ui/MercosulPlateMockup';

export type PatioOsModalTouchVehicleHeroProps = {
  vehicleTitle: string;
  brand?: string | null;
  year?: string | null;
  color?: string | null;
  fuel?: string | null;
  plate: string;
  chassis?: string | null;
  mileageKm?: string | null;
  blurPlates?: boolean;
  garantiaTag?: boolean;
  agendaTag?: boolean;
  stageLabel: string;
  stageIsExternalRepair?: boolean;
  showDeliver?: boolean;
  archiving?: boolean;
  onClose: () => void;
  onOpenFicha: () => void;
  onChangeStage: (e: React.MouseEvent | React.KeyboardEvent) => void;
  onDeliver?: () => void;
  toolsMenuOpen: boolean;
  onToggleToolsMenu: () => void;
  toolsMenuRef: React.RefObject<HTMLDivElement | null>;
  toolsMenu: React.ReactNode;
};

function metaParts(parts: Array<string | null | undefined>): string {
  return parts.map((p) => (p ?? '').trim()).filter(Boolean).join(' · ');
}

function formatKm(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  if (!t) return '—';
  const n = Number(String(t).replace(/\D/g, ''));
  if (!Number.isFinite(n) || n <= 0) return t;
  return n.toLocaleString('pt-BR');
}

/**
 * Cabeçalho touch da OS de veículo — hero escuro + faixa de etapa
 * (referência visual tablet/mobile).
 */
export function PatioOsModalTouchVehicleHero({
  vehicleTitle,
  brand,
  year,
  color,
  fuel,
  plate,
  chassis,
  mileageKm,
  blurPlates,
  garantiaTag,
  agendaTag,
  stageLabel,
  stageIsExternalRepair,
  showDeliver,
  archiving,
  onClose,
  onOpenFicha,
  onChangeStage,
  onDeliver,
  toolsMenuOpen,
  onToggleToolsMenu,
  toolsMenuRef,
  toolsMenu,
}: PatioOsModalTouchVehicleHeroProps) {
  const meta = metaParts([brand, year, fuel, color]);
  const chassisText = (chassis ?? '').trim() || '—';
  const plateText = (plate || '—').trim() || '—';

  return (
    <div className="patio-os-touch-hero relative shrink-0 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_12%_-10%,rgba(0,122,255,0.22),transparent_55%),radial-gradient(ellipse_70%_55%_at_95%_20%,rgba(56,120,255,0.12),transparent_50%),linear-gradient(180deg,#141820_0%,#0b0d12_72%,#090a0e_100%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/35 to-transparent"
        aria-hidden
      />

      <div className="relative px-3.5 pb-3.5 pt-[max(0.45rem,env(safe-area-inset-top))] sm:px-5">
        {/* Top chrome: voltar | menu */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/90 transition-colors hover:bg-white/[0.14] active:bg-white/[0.18]"
            aria-label="Voltar"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.4} aria-hidden />
          </button>
          <div className="relative" ref={toolsMenuRef}>
            <button
              type="button"
              onClick={onToggleToolsMenu}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-white/90 transition-colors hover:bg-white/[0.14] active:bg-white/[0.18]"
              aria-expanded={toolsMenuOpen}
              aria-haspopup="menu"
              aria-label="Mais opções"
              title="Mais opções"
            >
              <MoreHorizontal className="h-5 w-5" strokeWidth={2.2} aria-hidden />
            </button>
            {toolsMenu}
          </div>
        </div>

        {/* Logo + título + placa/ficha */}
        <div className="flex min-w-0 items-start gap-3 sm:gap-3.5">
          <div className="flex h-[3.65rem] w-[3.65rem] shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-[0_8px_28px_-10px_rgba(0,0,0,0.55)] ring-1 ring-white/25 sm:h-[4.1rem] sm:w-[4.1rem]">
            {brand?.trim() ? (
              <VehicleBrandLogo brand={brand} size="modalHero" className="scale-[1.05]" />
            ) : (
              <span className="font-display text-[15px] font-semibold text-zinc-500">—</span>
            )}
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1
                className="font-display min-w-0 max-w-full truncate text-[1.55rem] font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-[1.75rem]"
                title={vehicleTitle}
              >
                {vehicleTitle || 'Veículo'}
              </h1>
              {garantiaTag ? (
                <span className="inline-flex shrink-0 items-center rounded-md border border-red-500/80 bg-red-600 px-2 py-[0.2rem] text-[10px] font-semibold uppercase tracking-wide text-white">
                  Garantia
                </span>
              ) : null}
              {agendaTag ? (
                <span className="inline-flex shrink-0 items-center rounded-md border border-sky-400/35 bg-sky-500/15 px-2 py-[0.2rem] text-[10px] font-semibold uppercase tracking-wide text-sky-200">
                  Agendado
                </span>
              ) : null}
            </div>
            {meta ? (
              <p className="mt-1.5 truncate text-[12.5px] font-medium leading-snug tracking-wide text-zinc-400 sm:text-[13px]">
                {meta}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
            <MercosulPlateMockup
              plate={plateText}
              blurPlates={blurPlates}
              size="modalTablet"
              selectable
            />
            <button
              type="button"
              onClick={onOpenFicha}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-[11.5px] font-semibold text-zinc-100 transition-colors hover:border-[#7ab8ff]/45 hover:bg-[#007AFF]/18 hover:text-white"
            >
              <FileText className="h-3.5 w-3.5 text-[#7ab8ff]" strokeWidth={2.25} aria-hidden />
              Abrir ficha
            </button>
          </div>
        </div>

        {/* Placa | Chassi | KM */}
        <div className="mt-3.5 flex min-w-0 items-stretch overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.04]">
          <div className="min-w-0 flex-1 px-2.5 py-2 sm:px-3">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Placa
            </p>
            <p
              className={`mt-0.5 truncate text-[12.5px] font-semibold tabular-nums text-zinc-100 sm:text-[13px] ${
                blurPlates ? 'blur-plate' : ''
              }`}
            >
              {plateText}
            </p>
          </div>
          <div className="w-px shrink-0 self-stretch bg-white/[0.1]" aria-hidden />
          <div className="min-w-0 flex-[1.35] px-2.5 py-2 sm:px-3">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Chassi
            </p>
            <p className="mt-0.5 truncate font-mono text-[11px] font-medium tracking-wide text-zinc-200 sm:text-[12px]">
              {chassisText}
            </p>
          </div>
          <div className="w-px shrink-0 self-stretch bg-white/[0.1]" aria-hidden />
          <div className="min-w-0 flex-1 px-2.5 py-2 sm:px-3">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              KM
            </p>
            <p className="mt-0.5 truncate text-[12.5px] font-semibold tabular-nums text-zinc-100 sm:text-[13px]">
              {formatKm(mileageKm)}
            </p>
          </div>
        </div>
      </div>

      {/* Faixa de etapa */}
      <button
        type="button"
        onClick={onChangeStage}
        title="Alterar etapa"
        aria-label={`Alterar etapa: ${stageLabel}`}
        className={`patio-os-touch-stage relative flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-[filter] hover:brightness-[1.03] active:brightness-95 sm:gap-3 sm:px-5 ${
          stageIsExternalRepair
            ? 'bg-gradient-to-r from-violet-600 via-violet-500 to-violet-600 text-white'
            : 'bg-gradient-to-r from-[#f5c518] via-[#f0c000] to-[#e8b800] text-zinc-950'
        }`}
      >
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            stageIsExternalRepair ? 'bg-white/15' : 'bg-black/10'
          }`}
        >
          <Clock
            className={`h-4 w-4 ${stageIsExternalRepair ? 'text-white' : 'text-zinc-900'}`}
            strokeWidth={2.25}
            aria-hidden
          />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block text-[10px] font-semibold uppercase tracking-[0.14em] ${
              stageIsExternalRepair ? 'text-white/75' : 'text-zinc-800/75'
            }`}
          >
            Etapa atual
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1">
            <span className="truncate text-[15px] font-bold leading-tight tracking-tight sm:text-[16px]">
              {stageLabel}
            </span>
            <ChevronRight
              className={`h-4 w-4 shrink-0 opacity-70 ${
                stageIsExternalRepair ? 'text-white' : 'text-zinc-900'
              }`}
              strokeWidth={2.5}
              aria-hidden
            />
          </span>
        </span>
        {showDeliver && onDeliver ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDeliver();
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              e.stopPropagation();
              onDeliver();
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-600/50 bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 shadow-sm"
            aria-label="Entregue — arquivar OS"
          >
            {archiving ? (
              <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <CheckCircle2 className="h-3 w-3" aria-hidden />
            )}
            Entregue
          </span>
        ) : null}
        <span
          className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold ${
            stageIsExternalRepair
              ? 'bg-white/15 text-white'
              : 'bg-black/12 text-zinc-900'
          }`}
        >
          Alterar etapa
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        </span>
      </button>
    </div>
  );
}
