import React from 'react';
import {
  ChevronLeft,
  MoreHorizontal,
  FileText,
  ChevronRight,
  User,
  Wrench,
} from 'lucide-react';
import { VehicleBrandLogo } from '../ui/VehicleBrandLogo';
import { MercosulPlateMockup } from '../ui/MercosulPlateMockup';

type SharedHeroProps = {
  vehicleTitle: string;
  brand?: string | null;
  year?: string | null;
  color?: string | null;
  fuel?: string | null;
  plate: string;
  blurPlates?: boolean;
  garantiaTag?: boolean;
  agendaTag?: boolean;
  onClose: () => void;
  onOpenFicha: () => void;
  toolsMenuOpen: boolean;
  onToggleToolsMenu: () => void;
  toolsMenuRef: React.RefObject<HTMLDivElement | null>;
  toolsMenu: React.ReactNode;
};

export type PatioOsModalTouchVehicleStickyHeaderProps = SharedHeroProps;

export type PatioOsModalTouchVehicleScrollDetailsProps = {
  customerName?: string | null;
  chassis?: string | null;
  mileageKm?: string | null;
  diagnosticSigned?: boolean;
  diagnosticAvailable?: boolean;
  technicianName?: string | null;
  canAssignTechnician?: boolean;
  complaintText?: string | null;
  onOpenFicha: () => void;
  onOpenDiagnostic?: () => void;
  onOpenTechnician?: () => void;
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

const chromeBtn =
  'inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 active:bg-slate-300 dark:bg-white/[0.08] dark:text-white/90 dark:hover:bg-white/[0.14]';

/**
 * Parte fixa do cabeçalho touch: voltar, Abrir ficha, menu, logo + nome + placa.
 */
export function PatioOsModalTouchVehicleStickyHeader({
  vehicleTitle,
  brand,
  year,
  color,
  fuel,
  plate,
  blurPlates,
  garantiaTag,
  agendaTag,
  onClose,
  onOpenFicha,
  toolsMenuOpen,
  onToggleToolsMenu,
  toolsMenuRef,
  toolsMenu,
}: PatioOsModalTouchVehicleStickyHeaderProps) {
  const meta = metaParts([brand, year, fuel, color]);
  const plateText = (plate || '—').trim() || '—';

  return (
    <div className="patio-os-touch-hero-sticky z-30 shrink-0 border-b border-slate-200/70 bg-white/95 backdrop-blur-md dark:border-white/[0.08] dark:bg-zinc-950/95">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_12%_-10%,rgba(0,122,255,0.10),transparent_55%),radial-gradient(ellipse_70%_55%_at_95%_10%,rgba(245,208,11,0.08),transparent_50%)] dark:bg-[radial-gradient(ellipse_90%_70%_at_12%_-10%,rgba(0,122,255,0.18),transparent_55%)]"
        aria-hidden
      />
      <div className="relative px-3.5 pb-3 pt-[max(0.45rem,env(safe-area-inset-top))] sm:px-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`${chromeBtn} w-9`}
            aria-label="Voltar"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.4} aria-hidden />
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenFicha}
              className={`${chromeBtn} gap-1.5 px-3 text-[12px] font-semibold`}
            >
              <FileText className="h-3.5 w-3.5 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2.25} aria-hidden />
              Abrir ficha
            </button>
            <div className="relative" ref={toolsMenuRef}>
              <button
                type="button"
                onClick={onToggleToolsMenu}
                className={`${chromeBtn} w-9`}
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
        </div>

        <div className="flex min-w-0 items-start gap-3 sm:gap-3.5">
          <div className="flex h-[3.35rem] w-[3.35rem] shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-[0_6px_20px_-10px_rgba(0,0,0,0.35)] ring-1 ring-slate-200/80 dark:ring-white/20 sm:h-[3.75rem] sm:w-[3.75rem]">
            {brand?.trim() ? (
              <VehicleBrandLogo brand={brand} size="modalHero" className="scale-[1.05]" />
            ) : (
              <span className="font-display text-[15px] font-semibold text-zinc-500">—</span>
            )}
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1
                className="font-display min-w-0 max-w-full truncate text-[1.45rem] font-semibold leading-[1.05] tracking-[-0.03em] text-slate-900 sm:text-[1.65rem] dark:text-white"
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
                <span className="inline-flex shrink-0 items-center rounded-md border border-sky-500/30 bg-sky-500/[0.08] px-2 py-[0.2rem] text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:border-sky-400/35 dark:bg-sky-500/15 dark:text-sky-200">
                  Agendado
                </span>
              ) : null}
            </div>
            {meta ? (
              <p className="mt-1 truncate text-[12px] font-medium leading-snug tracking-wide text-slate-500 sm:text-[12.5px] dark:text-zinc-400">
                {meta}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 self-center">
            <MercosulPlateMockup
              plate={plateText}
              blurPlates={blurPlates}
              size="modalTablet"
              selectable
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Parte rolável do cabeçalho: Cliente|Chassi|KM, Diagnóstico/Técnico e Queixa.
 * Sobe com o scroll e some atrás do sticky do nome do veículo.
 */
export function PatioOsModalTouchVehicleScrollDetails({
  customerName,
  chassis,
  mileageKm,
  diagnosticSigned,
  diagnosticAvailable,
  technicianName,
  canAssignTechnician,
  complaintText,
  onOpenFicha,
  onOpenDiagnostic,
  onOpenTechnician,
}: PatioOsModalTouchVehicleScrollDetailsProps) {
  const chassisText = (chassis ?? '').trim() || '—';
  const customerText = (customerName ?? '').trim() || '—';
  const techText = (technicianName ?? '').trim();
  const complaint = (complaintText ?? '').trim();

  return (
    <div className="patio-os-touch-hero-details px-3.5 pb-3 pt-3 sm:px-5">
      <div className="flex min-w-0 items-stretch overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/80 dark:border-white/[0.08] dark:bg-white/[0.04]">
        <button
          type="button"
          onClick={onOpenFicha}
          className="min-w-0 flex-1 px-2.5 py-2 text-left transition-colors hover:bg-white/70 sm:px-3 dark:hover:bg-white/[0.06]"
          title="Abrir dados da ficha"
        >
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-zinc-500">
            Cliente
          </p>
          <p className="mt-0.5 truncate text-[12.5px] font-semibold text-slate-900 sm:text-[13px] dark:text-zinc-100">
            {customerText}
          </p>
        </button>
        <div className="w-px shrink-0 self-stretch bg-slate-200/90 dark:bg-white/[0.1]" aria-hidden />
        <div className="min-w-0 flex-[1.35] px-2.5 py-2 sm:px-3">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-zinc-500">
            Chassi
          </p>
          <p className="mt-0.5 truncate font-mono text-[11px] font-medium tracking-wide text-slate-800 sm:text-[12px] dark:text-zinc-200">
            {chassisText}
          </p>
        </div>
        <div className="w-px shrink-0 self-stretch bg-slate-200/90 dark:bg-white/[0.1]" aria-hidden />
        <div className="min-w-0 flex-1 px-2.5 py-2 sm:px-3">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-zinc-500">
            KM
          </p>
          <p className="mt-0.5 truncate text-[12.5px] font-semibold tabular-nums text-slate-900 sm:text-[13px] dark:text-zinc-100">
            {formatKm(mileageKm)}
          </p>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {diagnosticAvailable ? (
          <button
            type="button"
            onClick={onOpenDiagnostic}
            className="group flex min-w-0 items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-2.5 py-2.5 text-left shadow-sm transition-colors hover:border-[#007AFF]/35 dark:border-white/[0.1] dark:bg-white/[0.04] dark:hover:border-[#7ab8ff]/40"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50 text-[#007AFF] dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-[#7ab8ff]">
              <FileText className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-zinc-400">
                Diagnóstico
              </span>
              <span
                className={`mt-0.5 block truncate text-[12.5px] font-semibold ${
                  diagnosticSigned
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-300'
                }`}
              >
                {diagnosticSigned ? 'Assinado' : 'Não assinado'}
              </span>
            </span>
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-[#007AFF] dark:text-zinc-500 dark:group-hover:text-[#7ab8ff]"
              strokeWidth={2.25}
              aria-hidden
            />
          </button>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/60 px-2.5 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.02]" />
        )}

        {canAssignTechnician ? (
          <button
            type="button"
            onClick={onOpenTechnician}
            className="group flex min-w-0 items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-2.5 py-2.5 text-left shadow-sm transition-colors hover:border-[#007AFF]/35 dark:border-white/[0.1] dark:bg-white/[0.04] dark:hover:border-[#7ab8ff]/40"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50 text-[#007AFF] dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-[#7ab8ff]">
              {techText ? (
                <User className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              ) : (
                <Wrench className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-zinc-400">
                Técnico responsável
              </span>
              <span
                className={`mt-0.5 block truncate text-[12.5px] font-semibold ${
                  techText
                    ? 'text-slate-900 dark:text-zinc-100'
                    : 'text-[#007AFF] dark:text-[#7ab8ff]'
                }`}
              >
                {techText || 'Toque para atribuir'}
              </span>
            </span>
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-[#007AFF] dark:text-zinc-500 dark:group-hover:text-[#7ab8ff]"
              strokeWidth={2.25}
              aria-hidden
            />
          </button>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/60 px-2.5 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.02]" />
        )}
      </div>

      {/* Queixa — estilo Solicitar Orçamento (sem ícone de título) */}
      <div className="mt-3">
        <p className="mb-1.5 text-[14px] font-semibold tracking-tight text-slate-800 dark:text-zinc-100">
          Queixa do cliente
        </p>
        <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] leading-relaxed text-slate-700 dark:bg-white/[0.04] dark:text-zinc-200">
          {complaint ? (
            <span className="whitespace-pre-wrap uppercase tracking-wide">{complaint}</span>
          ) : (
            <span className="text-slate-400 dark:text-zinc-500">
              Nenhuma queixa registrada nesta OS.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** @deprecated use StickyHeader + ScrollDetails */
export const PatioOsModalTouchVehicleHero = PatioOsModalTouchVehicleStickyHeader;
