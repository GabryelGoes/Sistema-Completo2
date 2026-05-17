import React, { useEffect, useState } from 'react';
import { RefreshCw, Trash2, X } from 'lucide-react';
import { ModalPortal } from './ui/ModalPortal';

type DeleteServiceOrderModalProps = {
  open: boolean;
  orderLabel: string;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (adminPassword: string) => void | Promise<void>;
};

export const DeleteServiceOrderModal: React.FC<DeleteServiceOrderModalProps> = ({
  open,
  orderLabel,
  saving = false,
  error = null,
  onClose,
  onConfirm,
}) => {
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!open) setPassword('');
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || saving) return;
    void onConfirm(password.trim());
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-os-title"
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-xl dark:border-white/[0.1] dark:bg-zinc-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <h3 id="delete-os-title" className="flex items-center gap-2 text-[17px] font-semibold text-zinc-900 dark:text-white">
              <Trash2 className="h-5 w-5 shrink-0 text-red-500" />
              Excluir ordem de serviço
            </h3>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-white/[0.08]"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="mb-4 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            A OS <strong className="text-zinc-800 dark:text-zinc-200">{orderLabel}</strong> será arquivada
            (cancelada) e sairá das listas de entradas e relatórios ativos. Use a{' '}
            <strong>mesma senha do login Gerência</strong> ou a senha de exclusão configurada em Alterar senhas.
          </p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha do admin ou de exclusão"
              className="w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-[15px] text-zinc-900 outline-none ring-sky-500/30 focus:ring-2 dark:border-white/[0.12] dark:bg-zinc-950 dark:text-white"
              autoFocus
              disabled={saving}
            />
            {error ? <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p> : null}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 rounded-xl border border-zinc-200/90 py-2.5 text-[14px] font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/[0.12] dark:text-zinc-300 dark:hover:bg-white/[0.06]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !password.trim()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-[14px] font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Excluir
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
};
