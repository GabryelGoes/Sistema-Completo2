import React, { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { uiOsModalCardSectionTitle, uiOsModalSectionAppIcon } from '../ui/appTypography';
import {
  createVehicleObservation,
  formatObservationWhen,
  parseVehicleObservations,
  serializeVehicleObservations,
  type VehicleObservationItem,
} from '../../utils/vehicleObservations';

export type VehicleObservationsSectionProps = {
  insetCardClass: string;
  inputClass: string;
  rawValue: string;
  canEdit: boolean;
  saving: boolean;
  onSave: (serialized: string | null) => Promise<void> | void;
};

type ComposerMode =
  | { kind: 'closed' }
  | { kind: 'add' }
  | { kind: 'edit'; id: string };

export const VehicleObservationsSection: React.FC<VehicleObservationsSectionProps> = ({
  insetCardClass,
  inputClass,
  rawValue,
  canEdit,
  saving,
  onSave,
}) => {
  const items = useMemo(() => parseVehicleObservations(rawValue), [rawValue]);
  const [composer, setComposer] = useState<ComposerMode>({ kind: 'closed' });
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setComposer({ kind: 'closed' });
    setDraft('');
  }, [rawValue]);

  const openAdd = () => {
    setComposer({ kind: 'add' });
    setDraft('');
  };

  const openEdit = (item: VehicleObservationItem) => {
    setComposer({ kind: 'edit', id: item.id });
    setDraft(item.text);
  };

  const closeComposer = () => {
    setComposer({ kind: 'closed' });
    setDraft('');
  };

  const persist = async (next: VehicleObservationItem[]) => {
    await onSave(serializeVehicleObservations(next));
    closeComposer();
  };

  const handleSaveComposer = async () => {
    const text = draft.trim();
    if (!text || saving) return;
    if (composer.kind === 'add') {
      await persist([createVehicleObservation(text), ...items]);
      return;
    }
    if (composer.kind === 'edit') {
      const now = new Date().toISOString();
      await persist(
        items.map((item) =>
          item.id === composer.id ? { ...item, text, updatedAt: now } : item
        )
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (saving) return;
    if (!confirm('Excluir esta observação?')) return;
    await persist(items.filter((item) => item.id !== id));
  };

  const isEmpty = items.length === 0;
  const composing = composer.kind !== 'closed';
  const draftLen = draft.length;
  const canSubmit = !saving && draft.trim().length > 0;

  return (
    <div className={`${insetCardClass} min-w-0 overflow-hidden shadow-none`}>
      <div className="relative min-w-0">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.07),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(245,208,11,0.08),transparent_50%)] dark:bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.11),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(245,208,11,0.1),transparent_52%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-10 top-8 h-24 w-24 rounded-full bg-gradient-to-br from-[#007AFF]/14 to-transparent opacity-80 blur-2xl dark:from-[#007AFF]/22"
          aria-hidden
        />

        <div className="relative flex items-center justify-between gap-2 border-b border-black/[0.06] bg-white/85 px-2.5 py-2 pl-3 backdrop-blur-[2px] dark:border-white/[0.08] dark:bg-zinc-950/35 sm:gap-3 sm:px-3 sm:py-2.5 sm:pl-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
            <div className={uiOsModalSectionAppIcon}>
              <img src="/icons/observacoes-veiculo-ios.png" alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className={uiOsModalCardSectionTitle}>Observações do veículo</p>
              {!isEmpty ? (
                <p className="mt-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  {items.length} {items.length === 1 ? 'registro' : 'registros'}
                </p>
              ) : null}
            </div>
          </div>
          {canEdit && !composing ? (
            <button
              type="button"
              onClick={openAdd}
              className={
                isEmpty
                  ? 'inline-flex shrink-0 items-center gap-1 rounded-xl border-0 bg-[#007AFF] px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm shadow-blue-500/20 transition-[filter] hover:brightness-110'
                  : 'inline-flex shrink-0 items-center gap-1 rounded-xl border border-[#007AFF]/25 bg-[#007AFF]/[0.09] px-2.5 py-1 text-[11px] font-semibold text-[#007AFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-colors hover:border-[#007AFF]/40 hover:bg-[#007AFF]/15 dark:border-[#007AFF]/35 dark:bg-[#007AFF]/15 dark:text-[#b8d9ff] dark:hover:bg-[#007AFF]/22'
              }
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              {isEmpty ? 'Adicionar' : 'Nova'}
            </button>
          ) : null}
        </div>

        <div className="relative space-y-2 border-t border-zinc-200/60 bg-zinc-50/90 px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.02] sm:px-4 sm:py-3">
          {composing && canEdit ? (
            <div className="animate-in fade-in duration-200 rounded-lg border border-[#007AFF]/25 bg-white p-2.5 shadow-sm dark:border-[#007AFF]/30 dark:bg-zinc-950/70">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#007AFF] dark:text-[#7ab8ff]">
                  {composer.kind === 'add' ? 'Nova observação' : 'Editar observação'}
                </p>
                <button
                  type="button"
                  onClick={closeComposer}
                  disabled={saving}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                  aria-label="Fechar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
                    e.preventDefault();
                    void handleSaveComposer();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    closeComposer();
                  }
                }}
                autoFocus
                rows={3}
                maxLength={4000}
                disabled={saving}
                placeholder="Descreva a observação do veículo…"
                className={`${inputClass} min-h-[72px] resize-y text-[13px] leading-snug disabled:opacity-55`}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
                  {draftLen}/4000
                  <span className="ml-1.5 hidden text-zinc-400 sm:inline dark:text-zinc-500">
                    Ctrl+Enter para salvar
                  </span>
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={closeComposer}
                    disabled={saving}
                    className="rounded-md px-2 py-1 text-[11px] font-semibold text-zinc-500 transition-colors hover:bg-black/5 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveComposer()}
                    disabled={!canSubmit}
                    className="inline-flex items-center gap-1 rounded-md bg-[#007AFF] px-2 py-1 text-[11px] font-semibold text-white shadow-sm shadow-blue-500/20 transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-45"
                  >
                    {saving ? (
                      <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    )}
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {isEmpty && !composing ? (
            <p className="px-0.5 py-1 text-[13px] text-zinc-500 dark:text-zinc-400">
              Nenhuma observação
            </p>
          ) : null}

          {!isEmpty ? (
            <ul className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]" aria-label="Lista de observações do veículo">
              {items.map((item, index) => {
                const isEditingThis = composer.kind === 'edit' && composer.id === item.id;
                if (isEditingThis) return null;
                return (
                  <li
                    key={item.id}
                    className="group flex items-start gap-1.5 py-1.5 first:pt-0 last:pb-0"
                  >
                    <span className="mt-px w-4 shrink-0 text-right text-[11px] font-semibold tabular-nums leading-5 text-zinc-400 dark:text-zinc-500">
                      {index + 1}.
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-1">
                        <p className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-5 text-zinc-900 dark:text-zinc-100">
                          {item.text}
                        </p>
                        {canEdit ? (
                          <div className="flex shrink-0 items-center gap-0.5 pt-px">
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              disabled={saving || composing}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-[#007AFF]/80 transition-colors hover:bg-[#007AFF]/10 hover:text-[#007AFF] disabled:opacity-40 dark:text-[#7ab8ff]/85 dark:hover:bg-[#007AFF]/15"
                              aria-label="Editar observação"
                              title="Editar"
                            >
                              <Pencil className="h-2.5 w-2.5" strokeWidth={2.25} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(item.id)}
                              disabled={saving || composing}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-red-500/75 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:text-red-400/75 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                              aria-label="Excluir observação"
                              title="Excluir"
                            >
                              <Trash2 className="h-2.5 w-2.5" strokeWidth={2.25} />
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[10px] leading-4 text-zinc-400 dark:text-zinc-500">
                        {formatObservationWhen(item.updatedAt || item.createdAt)}
                        {item.updatedAt ? ' · editada' : ''}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
};
