import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, Loader2, Wrench, Info, GripVertical } from 'lucide-react';
import {
  iosModalShell,
  iosModalClose,
  iosModalInsetCard,
  resolveIosModalOverlayClass,
  iosInput,
  iosPrimaryButton,
} from './ui/iosModalStyles';
import { ModalPortal } from './ui/ModalPortal';
import { IosModalHeader } from './ui/IosModalHeader';
import { useRegisterModalOpen } from './ui/ModalLayerContext';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { getWorkshopSettings, updateWorkshopSettings } from '../services/apiService';
import {
  LAB_QUICK_SERVICES_CHANGED_EVENT,
  LAB_QUICK_SERVICE_COLOR_OPTIONS,
  setLabQuickServices,
  slugifyLabQuickServiceId,
  type LabQuickService,
  type LabQuickServiceColor,
} from '../utils/labQuickServices';

interface LabQuickServicesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DraftService {
  id: string;
  label: string;
  color: LabQuickServiceColor;
  sortOrder: number;
  absOnly: boolean;
  allowPreApproval: boolean;
  key: string;
}

let draftKeySeq = 0;
const nextDraftKey = () => `lqs_${Date.now()}_${draftKeySeq++}`;

export const LabQuickServicesModal: React.FC<LabQuickServicesModalProps> = ({ isOpen, onClose }) => {
  useRegisterModalOpen(isOpen);
  const isDesktopShell = useDesktopShellLayout();
  const [items, setItems] = useState<DraftService[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getWorkshopSettings()
      .then((s) => {
        if (cancelled) return;
        const list = (s.labQuickServices ?? []).map((k, i) => ({
          id: k.id,
          label: k.label,
          color: k.color,
          sortOrder: k.sortOrder ?? i,
          absOnly: k.absOnly !== false,
          allowPreApproval: k.allowPreApproval === true,
          key: nextDraftKey(),
        }));
        setItems(list);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? 'Falha ao carregar os serviços.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const updateItem = (key: string, patch: Partial<DraftService>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: '',
        label: '',
        color: 'violet',
        sortOrder: prev.length,
        absOnly: true,
        allowPreApproval: false,
        key: nextDraftKey(),
      },
    ]);
  };

  const handleSave = async () => {
    const cleaned: LabQuickService[] = items
      .map((it, i) => ({
        id: it.id.trim() || slugifyLabQuickServiceId(it.label),
        label: it.label.trim(),
        color: it.color,
        sortOrder: i,
        absOnly: it.absOnly,
        allowPreApproval: it.allowPreApproval,
      }))
      .filter((it) => it.label.length > 0 && it.id.length > 0);
    if (cleaned.length === 0) {
      setError('Adicione pelo menos um serviço.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await updateWorkshopSettings({ labQuickServices: cleaned });
      setLabQuickServices(saved.labQuickServices ?? cleaned);
      try {
        window.dispatchEvent(new CustomEvent(LAB_QUICK_SERVICES_CHANGED_EVENT));
      } catch {
        /* noop */
      }
      onClose();
    } catch (e: unknown) {
      setError((e as Error)?.message ?? 'Falha ao salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalPortal>
      <div className={resolveIosModalOverlayClass(isDesktopShell)}>
        <div className={`${iosModalShell} max-h-[94vh] max-w-xl`}>
          {!isDesktopShell ? (
            <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
              <X className="w-5 h-5" />
            </button>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className={`shrink-0 px-6 pb-4 pt-8 sm:px-8 ${isDesktopShell ? 'pr-6 sm:pr-8' : 'pr-14'}`}>
              <IosModalHeader
                icon={<Wrench className="h-6 w-6" strokeWidth={2.1} />}
                title="Serviços rápidos do laboratório"
                subtitle="Botões da avaliação técnica para módulos ABS"
              />
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4 sm:px-8">
              <div className="flex items-start gap-2 rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] px-3.5 py-3 text-[12.5px] leading-relaxed text-zinc-600 dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-zinc-300">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden />
                <span>
                  Estes serviços aparecem na <strong>avaliação técnica</strong> quando o produto for módulo ABS
                  (completo, hidráulico ou eletrônico). Marque &quot;Limpeza pré-aprovada&quot; apenas no serviço que
                  permitir atalho direto para Em serviço.
                </span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Carregando…
                </div>
              ) : (
                <div className="space-y-2.5">
                  {items.map((it) => (
                    <div key={it.key} className={`${iosModalInsetCard} space-y-2.5 p-3`}>
                      <div className="flex items-start gap-2">
                        <GripVertical className="mt-2.5 h-4 w-4 shrink-0 text-zinc-300" aria-hidden />
                        <div className="min-w-0 flex-1 space-y-2">
                          <input
                            value={it.label}
                            onChange={(e) => updateItem(it.key, { label: e.target.value })}
                            placeholder="Nome do serviço"
                            className={iosInput}
                            maxLength={64}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={it.color}
                              onChange={(e) =>
                                updateItem(it.key, { color: e.target.value as LabQuickServiceColor })
                              }
                              className={iosInput}
                            >
                              {LAB_QUICK_SERVICE_COLOR_OPTIONS.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  Cor: {opt.label}
                                </option>
                              ))}
                            </select>
                            <label className="flex items-center gap-2 rounded-2xl border border-zinc-200/80 bg-white/80 px-3 py-2 text-[12px] font-medium text-zinc-700 dark:border-white/10 dark:bg-zinc-950/40 dark:text-zinc-200">
                              <input
                                type="checkbox"
                                checked={it.allowPreApproval}
                                onChange={(e) => updateItem(it.key, { allowPreApproval: e.target.checked })}
                                className="h-4 w-4 rounded"
                              />
                              Limpeza pré-aprovada
                            </label>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(it.key)}
                          aria-label="Excluir serviço"
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-200/80 bg-red-50/80 text-red-600 transition-all hover:bg-red-100 active:scale-[0.97] dark:border-red-500/25 dark:bg-red-950/30 dark:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addItem}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-500/40 bg-violet-500/[0.04] px-4 py-3.5 text-[14px] font-semibold text-violet-700 transition-all hover:bg-violet-500/[0.08] active:scale-[0.99] dark:border-violet-400/35 dark:text-violet-200"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar serviço
                  </button>
                </div>
              )}

              {error ? (
                <p className="rounded-xl border border-red-200/80 bg-red-50/80 px-3 py-2 text-[13px] font-medium text-red-600 dark:border-red-500/25 dark:bg-red-950/30 dark:text-red-400">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-zinc-200/70 px-6 py-4 dark:border-white/[0.07] sm:px-8">
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="rounded-2xl border border-zinc-200/90 bg-white/80 px-5 py-3.5 text-[15px] font-semibold text-zinc-700 transition-all hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-45 dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-zinc-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || loading}
                  className={`${iosPrimaryButton} inline-flex items-center gap-2`}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {saving ? 'Salvando…' : 'Salvar serviços'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
