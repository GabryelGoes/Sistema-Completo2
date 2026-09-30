import React, { useMemo, useState } from 'react';
import { ChevronRight, Loader2, X } from 'lucide-react';
import type { LabQuickService } from '../../utils/labQuickServices';
import { ModalPortal } from '../ui/ModalPortal';
import { iosModalClose, iosModalShell } from '../ui/iosModalStyles';

/** Ícone de envio rápido do pátio, tingido de violeta para o laboratório. */
function LabQuickServiceIcon({ sizeClass = 'h-10 w-10' }: { sizeClass?: string }) {
  return (
    <span className={`relative ${sizeClass} shrink-0 overflow-hidden rounded-[0.65rem] bg-violet-600`}>
      <img
        src="/icons/envio-rapido-ios.png"
        alt=""
        className="h-full w-full object-cover opacity-95 mix-blend-luminosity"
      />
      <span className="pointer-events-none absolute inset-0 bg-violet-600/55 mix-blend-color" aria-hidden />
    </span>
  );
}

export type LabQuickServiceButtonsProps = {
  services: LabQuickService[];
  onSelect: (preset: LabQuickService) => void;
  disabled?: boolean;
  loadingId?: string | null;
  /** Filtra presets exibidos (ex.: apenas ABS na avaliação técnica). */
  filter?: (preset: LabQuickService) => boolean;
  /** Rótulo do botão único que abre a lista. */
  buttonLabel?: string;
  hint?: string;
};

/**
 * Um único botão que abre a lista de serviços rápidos (sem cores por item).
 */
export const LabQuickServiceButtons: React.FC<LabQuickServiceButtonsProps> = ({
  services,
  onSelect,
  disabled = false,
  loadingId = null,
  filter,
  buttonLabel = 'Serviços rápidos',
  hint,
}) => {
  const [open, setOpen] = useState(false);
  const visible = useMemo(
    () => (filter ? services.filter(filter) : services),
    [services, filter]
  );
  if (visible.length === 0) return null;

  const busy = disabled || loadingId != null;

  return (
    <div className="space-y-2">
      {hint ? (
        <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">{hint}</p>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className="group flex w-full items-center gap-3 rounded-xl border border-zinc-200/90 bg-white px-3.5 py-3 text-left shadow-sm transition hover:bg-zinc-50 disabled:opacity-55 dark:border-white/[0.1] dark:bg-zinc-950/55 dark:hover:bg-zinc-900"
      >
        <LabQuickServiceIcon />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-zinc-900 dark:text-white">
            {buttonLabel}
          </span>
          <span className="mt-0.5 block text-[12px] text-zinc-500 dark:text-zinc-400">
            {visible.length} {visible.length === 1 ? 'serviço' : 'serviços'} · toque para escolher
          </span>
        </span>
        <ChevronRight
          className="h-5 w-5 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-600 dark:text-zinc-500"
          strokeWidth={2.25}
          aria-hidden
        />
      </button>

      {open ? (
        <ModalPortal manageBackLayer={false}>
          <div
            className="fixed inset-0 z-[350] flex items-center justify-center bg-black/45 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[20px] sm:p-6"
            onClick={() => !busy && setOpen(false)}
            role="presentation"
          >
            <div
              className={`relative flex max-h-[min(88dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem))] w-full max-w-md min-h-0 flex-col overflow-hidden ${iosModalShell}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="lab-quick-services-picker-title"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={iosModalClose}
                aria-label="Fechar serviços rápidos"
                disabled={busy}
              >
                <X className="h-5 w-5" />
              </button>

              <div className="shrink-0 border-b border-zinc-200/70 px-6 pb-5 pt-7 dark:border-white/[0.07] sm:px-8 sm:pt-8">
                <div className="flex items-start gap-3 pr-10">
                  <LabQuickServiceIcon sizeClass="h-11 w-11" />
                  <div className="min-w-0 flex-1">
                    <h2
                      id="lab-quick-services-picker-title"
                      className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white"
                    >
                      {buttonLabel}
                    </h2>
                    <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                      Escolha um serviço para incluir na avaliação.
                    </p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#F2F2F7] px-4 py-4 dark:bg-black/25 custom-scrollbar sm:px-6">
                <ul className="space-y-2">
                  {visible.map((preset) => {
                    const isLoading = loadingId === preset.id;
                    return (
                      <li key={preset.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(preset);
                            if (!isLoading) setOpen(false);
                          }}
                          disabled={disabled || (loadingId != null && !isLoading)}
                          className="flex w-full items-center gap-3 rounded-xl border border-zinc-200/90 bg-white px-3.5 py-3.5 text-left shadow-sm transition active:scale-[0.99] hover:bg-zinc-50 disabled:opacity-55 dark:border-white/[0.1] dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        >
                          <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-zinc-900 dark:text-white">
                            {preset.label}
                          </span>
                          {isLoading ? (
                            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-zinc-400" />
                          ) : (
                            <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
};
