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
              ) : (
                <p className="mt-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  Nenhum registro ainda
                </p>
              )}
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

        <div className="relative space-y-2.5 border-t border-zinc-200/60 bg-zinc-50/90 px-3 py-3 dark:border-white/[0.06] dark:bg-white/[0.02] sm:px-4 sm:py-4">
          {composing && canEdit ? (
            <div className="animate-in fade-in duration-200 rounded-xl border border-[#007AFF]/25 bg-white p-3 shadow-sm dark:border-[#007AFF]/30 dark:bg-zinc-950/70">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-[#007AFF] dark:text-[#7ab8ff]">
                  {composer.kind === 'add' ? 'Nova observação' : 'Editar observação'}
                </p>
                <button
                  type="button"
                  onClick={closeComposer}
                  disabled={saving}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
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
                rows={4}
                maxLength={4000}
                disabled={saving}
                placeholder="Descreva a observação do veículo…"
                className={`${inputClass} min-h-[110px] resize-y text-[14px] leading-relaxed disabled:opacity-55`}
              />
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <p className="text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">
                  {draftLen}/4000
                  <span className="ml-2 hidden text-zinc-400 sm:inline dark:text-zinc-500">
                    Ctrl+Enter para salvar
                  </span>
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={closeComposer}
                    disabled={saving}
                    className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-zinc-500 transition-colors hover:bg-black/5 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveComposer()}
                    disabled={!canSubmit}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#007AFF] px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-sm shadow-blue-500/20 transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-45"
                  >
                    {saving ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    )}
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {isEmpty && !composing ? (
            <div className="rounded-xl border border-dashed border-zinc-300/90 bg-white/70 px-4 py-7 text-center dark:border-white/[0.12] dark:bg-white/[0.03]">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#007AFF]/10 ring-1 ring-[#007AFF]/15 dark:bg-[#007AFF]/15 dark:ring-[#007AFF]/25">
                <img
                  src="/icons/observacoes-veiculo-ios.png"
                  alt=""
                  className="h-8 w-8 rounded-[0.65rem] object-cover"
                />
              </div>
              <p className="text-[14px] font-semibold text-zinc-800 dark:text-zinc-100">
                Nenhuma observação
              </p>
              <p className="mx-auto mt-1 max-w-[22rem] text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                Registre detalhes do veículo em forma de lista — cada nota fica separada e pode ser editada depois.
              </p>
              {canEdit ? (
                <button
                  type="button"
                  onClick={openAdd}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#007AFF] px-3.5 py-2 text-[12px] font-bold uppercase tracking-[0.06em] text-white shadow-sm shadow-blue-500/25 transition-[filter] hover:brightness-110"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Adicionar
                </button>
              ) : null}
            </div>
          ) : null}

          {!isEmpty ? (
            <ul className="space-y-2" aria-label="Lista de observações do veículo">
              {items.map((item, index) => {
                const isEditingThis = composer.kind === 'edit' && composer.id === item.id;
                if (isEditingThis) return null;
                return (
                  <li
                    key={item.id}
                    className="group flex gap-2.5 rounded-xl border border-zinc-200/80 bg-white p-3 shadow-[0_4px_14px_-10px_rgba(0,0,0,0.12)] transition-colors hover:border-[#007AFF]/25 dark:border-white/[0.1] dark:bg-zinc-950/65 dark:shadow-none dark:hover:border-[#007AFF]/30"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#007AFF]/12 text-[11px] font-bold tabular-nums text-[#007AFF] dark:bg-[#007AFF]/20 dark:text-[#7ab8ff]">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-900 dark:text-zinc-100">
                        {item.text}
                      </p>
                      <p className="mt-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                        {formatObservationWhen(item.updatedAt || item.createdAt)}
                        {item.updatedAt ? ' · editada' : ''}
                      </p>
                      {canEdit ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            disabled={saving || composing}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#007AFF]/20 bg-[#007AFF]/[0.08] px-2 py-1 text-[11px] font-semibold text-[#007AFF] transition-colors hover:border-[#007AFF]/35 hover:bg-[#007AFF]/15 disabled:opacity-40 dark:border-[#007AFF]/30 dark:bg-[#007AFF]/15 dark:text-[#7ab8ff] dark:hover:bg-[#007AFF]/22"
                          >
                            <Pencil className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(item.id)}
                            disabled={saving || composing}
                            className="inline-flex items-center gap-1 rounded-lg border border-transparent px-2 py-1 text-[11px] font-semibold text-red-600/85 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:text-red-400/90 dark:hover:border-red-900/50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                            Excluir
                          </button>
                        </div>
                      ) : null}
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
