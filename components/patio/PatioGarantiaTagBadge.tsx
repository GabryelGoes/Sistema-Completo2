import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { patioOsSecModalPcClass, usePatioOsPcLayout } from './PatioOsPcLayoutContext';
import { Loader2 } from 'lucide-react';

type PatioGarantiaTagBadgeProps = {
  /** Permite clicar e pedir confirmação para retirar. */
  canRemove?: boolean;
  removing?: boolean;
  onConfirmRemove?: () => void | Promise<void>;
  size?: 'card' | 'cardCompact' | 'modal';
  className?: string;
};

const sizeClass: Record<NonNullable<PatioGarantiaTagBadgeProps['size']>, string> = {
  card: 'px-[0.65rem] py-[0.26rem] text-[11.7px]',
  cardCompact: 'px-2 py-[0.2rem] text-[9px]',
  modal: 'px-2.5 py-[0.3rem] text-[11px]',
};

/**
 * Etiqueta vermelha "Garantia". Com `canRemove`, o clique abre uma janelinha
 * pedindo confirmação antes de retirar.
 */
export function PatioGarantiaTagBadge({
  canRemove = false,
  removing = false,
  onConfirmRemove,
  size = 'modal',
  className = '',
}: PatioGarantiaTagBadgeProps) {
  const patioOsPcLayout = usePatioOsPcLayout();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  const close = () => setOpen(false);

  const placePanel = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const panelW = 260;
    const left = Math.min(
      Math.max(12, r.left + r.width / 2 - panelW / 2),
      window.innerWidth - panelW - 12
    );
    const below = r.bottom + 8;
    const top =
      below + 140 > window.innerHeight ? Math.max(12, r.top - 8 - 140) : below;
    setPos({ top, left });
  };

  useEffect(() => {
    if (!open) return;
    placePanel();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (btnRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      close();
    };
    const onReposition = () => placePanel();
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('touchstart', onDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!removing) return;
    close();
  }, [removing]);

  const badgeClass = `inline-flex shrink-0 items-center rounded-md border border-red-600 bg-red-600 font-semibold uppercase tracking-wide text-white shadow-none ${sizeClass[size]} ${className}`;

  if (!canRemove || !onConfirmRemove) {
    return (
      <span className={badgeClass} title="Em garantia">
        Garantia
      </span>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={removing}
        className={`${badgeClass} transition hover:bg-red-700 disabled:opacity-60`}
        title="Clique para retirar a etiqueta de garantia"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (removing) return;
          setOpen((v) => !v);
        }}
      >
        {removing ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : 'Garantia'}
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className={patioOsSecModalPcClass(
                patioOsPcLayout,
                'fixed z-[520] w-[min(16.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-zinc-200/90 bg-white p-3 text-zinc-900 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)] dark:border-white/12 dark:bg-zinc-900 dark:text-zinc-100 patio-os-sec-popover'
              )}
              data-patio-os-sec-role={patioOsPcLayout ? 'popover' : undefined}
              data-patio-os-sec-danger={patioOsPcLayout ? 'true' : undefined}
              style={{ top: pos.top, left: pos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <p id={titleId} className="patio-os-sec-title text-[13px] font-semibold leading-snug">
                Retirar a etiqueta de garantia?
              </p>
              <p className="mt-1 text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">
                O veículo deixa de aparecer como garantia no pátio.
              </p>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl px-3 py-1.5 text-[12px] font-semibold text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    close();
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                  disabled={removing}
                  onClick={(e) => {
                    e.stopPropagation();
                    void onConfirmRemove();
                  }}
                >
                  Retirar
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
