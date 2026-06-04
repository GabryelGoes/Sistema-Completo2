import React, { useEffect, useState } from 'react';
import { X, Plus, Trash2, Loader2, Package, Info } from 'lucide-react';
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
  OTHER_MODULE_KIND_ID,
  setLabProductKinds,
  LAB_PRODUCT_KINDS_CHANGED_EVENT,
} from '../utils/moduleMetadata';

interface LabProductTypesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DraftKind {
  /** id existente (vazio para tipos novos — gerado ao salvar). */
  id: string;
  label: string;
  /** chave estável só para o React render. */
  key: string;
}

let draftKeySeq = 0;
const nextDraftKey = () => `lpk_${Date.now()}_${draftKeySeq++}`;

export const LabProductTypesModal: React.FC<LabProductTypesModalProps> = ({ isOpen, onClose }) => {
  useRegisterModalOpen(isOpen);
  const isDesktopShell = useDesktopShellLayout();
  const [items, setItems] = useState<DraftKind[]>([]);
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
        const list = (s.labProductKinds ?? []).map((k) => ({
          id: k.id,
          label: k.label,
          key: nextDraftKey(),
        }));
        setItems(list);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? 'Falha ao carregar os tipos de produto.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const updateLabel = (key: string, label: string) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, label } : it)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  };

  const addItem = () => {
    setItems((prev) => {
      const next = [...prev];
      const otherIdx = next.findIndex((it) => it.id === OTHER_MODULE_KIND_ID);
      const newItem: DraftKind = { id: '', label: '', key: nextDraftKey() };
      if (otherIdx >= 0) next.splice(otherIdx, 0, newItem);
      else next.push(newItem);
      return next;
    });
  };

  const handleSave = async () => {
    const cleaned = items
      .map((it) => ({ id: it.id.trim(), label: it.label.trim() }))
      .filter((it) => it.label.length > 0);
    if (cleaned.length === 0) {
      setError('Adicione pelo menos um tipo de produto.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await updateWorkshopSettings({ labProductKinds: cleaned });
      setLabProductKinds(saved.labProductKinds ?? cleaned);
      try {
        window.dispatchEvent(new CustomEvent(LAB_PRODUCT_KINDS_CHANGED_EVENT));
      } catch {
        /* noop */
      }
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao salvar. Tente novamente.');
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

          <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
            <div className={`px-6 sm:px-8 pt-8 pb-4 shrink-0 ${isDesktopShell ? 'pr-6 sm:pr-8' : 'pr-14'}`}>
              <IosModalHeader
                icon={<Package className="h-6 w-6" strokeWidth={2.1} />}
                title="Tipos de produto do laboratório"
                subtitle="Adicione, renomeie ou remova os tipos exibidos na recepção"
              />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 pb-4 space-y-4">
              <div className="flex items-start gap-2 rounded-2xl border border-[#007AFF]/20 bg-[#007AFF]/[0.06] px-3.5 py-3 text-[12.5px] leading-relaxed text-zinc-600 dark:border-[#64B5FF]/25 dark:bg-[#64B5FF]/10 dark:text-zinc-300">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#007AFF] dark:text-[#7ab8ff]" aria-hidden />
                <span>
                  Renomear um tipo mantém os produtos já cadastrados. Ao excluir um tipo, os produtos
                  antigos que o usavam podem deixar de exibir o nome. O tipo <strong>Outro produto</strong>{' '}
                  é fixo (campo de texto livre na recepção).
                </span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500 dark:text-zinc-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Carregando tipos…
                </div>
              ) : (
                <div className="space-y-2.5">
                  {items.map((it) => {
                    const isOther = it.id === OTHER_MODULE_KIND_ID;
                    return (
                      <div
                        key={it.key}
                        className={`${iosModalInsetCard} flex items-center gap-2.5 p-2.5`}
                      >
                        <div className="min-w-0 flex-1">
                          <input
                            value={it.label}
                            onChange={(e) => updateLabel(it.key, e.target.value)}
                            placeholder="Nome do tipo (ex: Módulo completo)"
                            className={iosInput}
                            maxLength={48}
                          />
                          {isOther ? (
                            <p className="mt-1 ml-1 text-[11px] font-medium text-amber-600 dark:text-amber-400/90">
                              Tipo fixo — abre campo de texto livre na recepção
                            </p>
                          ) : null}
                        </div>
                        {isOther ? (
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200/70 bg-zinc-50/70 text-zinc-300 dark:border-white/[0.08] dark:bg-zinc-950/30 dark:text-zinc-600">
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => removeItem(it.key)}
                            aria-label="Excluir tipo"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-200/80 bg-red-50/80 text-red-600 transition-all hover:bg-red-100 active:scale-[0.97] dark:border-red-500/25 dark:bg-red-950/30 dark:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={addItem}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#007AFF]/40 bg-[#007AFF]/[0.04] px-4 py-3.5 text-[14px] font-semibold text-[#007AFF] transition-all hover:bg-[#007AFF]/[0.08] active:scale-[0.99] dark:border-[#64B5FF]/35 dark:bg-[#64B5FF]/10 dark:text-[#7ab8ff]"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar tipo de produto
                  </button>
                </div>
              )}

              {error ? (
                <p className="rounded-xl border border-red-200/80 bg-red-50/80 px-3 py-2 text-[13px] font-medium text-red-600 dark:border-red-500/25 dark:bg-red-950/30 dark:text-red-400">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-zinc-200/70 px-6 sm:px-8 py-4 dark:border-white/[0.07]">
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
                  {saving ? 'Salvando…' : 'Salvar tipos'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
