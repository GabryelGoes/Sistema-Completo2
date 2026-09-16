import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';
import { ModalPortal } from './ui/ModalPortal';
import { resolveIosModalOverlayClass, NESTED_STOCK_OVERLAY_Z } from './ui/iosModalStyles';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

export type StockGuardPasswordModalProps = {
  open: boolean;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  error?: string | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (password: string) => void | Promise<void>;
};

/** Prompt reutilizável para senha de proteção do estoque (edição / cancelamento). */
export function StockGuardPasswordModal({
  open,
  title = 'Confirmar com senha',
  subtitle = 'Use a senha da Gerência ou a senha de proteção do estoque.',
  confirmLabel = 'Confirmar',
  error = null,
  busy = false,
  onClose,
  onConfirm,
}: StockGuardPasswordModalProps) {
  const isDesktopShell = useDesktopShellLayout();
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useBrowserBackLayer(open, onClose);

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setLocalError(null);
  }, [open]);

  if (!open) return null;

  const overlayClass = resolveIosModalOverlayClass(isDesktopShell, NESTED_STOCK_OVERLAY_Z);

  return (
    <ModalPortal>
      <div className={overlayClass} role="dialog" aria-modal="true" aria-label={title}>
        <div className="w-full max-w-sm overflow-hidden rounded-[1.5rem] border-0 bg-white shadow-none dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200/70 px-5 py-4 dark:border-white/10">
            <div className="flex min-w-0 items-start gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
                <KeyRound className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[16px] font-bold text-zinc-900 dark:text-white">{title}</h2>
                <p className="mt-0.5 text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">
                  {subtitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form
            className="space-y-3 px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              const pwd = password.trim();
              if (!pwd) {
                setLocalError('Informe a senha.');
                return;
              }
              setLocalError(null);
              void onConfirm(pwd);
            }}
          >
            <label className="block space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                Senha
              </span>
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-[#007AFF]/30 dark:bg-white/5 dark:text-white"
                placeholder="Senha da Gerência"
              />
            </label>

            {(localError || error) && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:bg-red-950/40 dark:text-red-200">
                {localError || error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="rounded-xl px-3.5 py-2.5 text-[13px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy || !password.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {confirmLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
