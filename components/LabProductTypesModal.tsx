import React, { useEffect, useRef, useState } from 'react';
import { X, Plus, Trash2, Loader2, Package, Info, Camera, Image as ImageIcon } from 'lucide-react';
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
import {
  getWorkshopSettings,
  updateWorkshopSettings,
  uploadLabProductKindPhoto,
} from '../services/apiService';
import {
  OTHER_MODULE_KIND_ID,
  setLabProductKinds,
  LAB_PRODUCT_KINDS_CHANGED_EVENT,
  slugifyModuleKindId,
} from '../utils/moduleMetadata';
import { storageThumbnailUrl } from '../utils/storageThumbnailUrl';

interface LabProductTypesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DraftKind {
  /** id existente (vazio para tipos novos — gerado ao salvar). */
  id: string;
  label: string;
  photoUrl: string | null;
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
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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
          photoUrl: k.photoUrl?.trim() || null,
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
      const newItem: DraftKind = { id: '', label: '', photoUrl: null, key: nextDraftKey() };
      if (otherIdx >= 0) next.splice(otherIdx, 0, newItem);
      else next.push(newItem);
      return next;
    });
  };

  const dispatchKindsChanged = () => {
    try {
      window.dispatchEvent(new CustomEvent(LAB_PRODUCT_KINDS_CHANGED_EVENT));
    } catch {
      /* noop */
    }
  };

  const handlePhotoPick = async (key: string, file: File | null) => {
    if (!file) return;
    const item = items.find((it) => it.key === key);
    if (!item) return;
    const kindId = item.id.trim() || slugifyModuleKindId(item.label);
    if (!kindId) {
      setError('Defina o nome do tipo antes de adicionar a foto.');
      return;
    }
    // Tipos novos precisam existir no settings antes do upload.
    if (!item.id.trim()) {
      setError('Salve o tipo primeiro e depois adicione a foto.');
      return;
    }
    setUploadingKey(key);
    setError(null);
    try {
      const result = await uploadLabProductKindPhoto(kindId, file, file.name);
      setLabProductKinds(result.labProductKinds);
      setItems((prev) =>
        prev.map((it) =>
          it.key === key ? { ...it, photoUrl: result.photoUrl } : it
        )
      );
      dispatchKindsChanged();
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao enviar a foto.');
    } finally {
      setUploadingKey(null);
    }
  };

  const handleSave = async () => {
    const cleaned = items
      .map((it) => ({
        id: it.id.trim(),
        label: it.label.trim(),
        photoUrl: it.photoUrl?.trim() || null,
      }))
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
      dispatchKindsChanged();
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
                title="Tipos de peça do laboratório"
                subtitle="Nomes e fotos exibidos na lista e na recepção"
              />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 pb-4 space-y-4">
              <div className="flex items-start gap-2 rounded-2xl border border-[#007AFF]/20 bg-[#007AFF]/[0.06] px-3.5 py-3 text-[12.5px] leading-relaxed text-zinc-600 dark:border-[#64B5FF]/25 dark:bg-[#64B5FF]/10 dark:text-zinc-300">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#007AFF] dark:text-[#7ab8ff]" aria-hidden />
                <span>
                  Adicione uma foto por tipo para a visualização em lista do laboratório. Renomear mantém
                  os produtos já cadastrados. O tipo <strong>Outro produto</strong> é fixo (texto livre na
                  recepção). Salve tipos novos antes de enviar a foto.
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
                    const thumb = it.photoUrl
                      ? storageThumbnailUrl(it.photoUrl, { maxWidth: 96, maxHeight: 96, resize: 'cover' }) || it.photoUrl
                      : null;
                    const uploading = uploadingKey === it.key;
                    return (
                      <div
                        key={it.key}
                        className={`${iosModalInsetCard} flex items-center gap-2.5 p-2.5`}
                      >
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            disabled={uploading || !it.id.trim()}
                            onClick={() => fileInputRefs.current[it.key]?.click()}
                            className="group relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-50 transition hover:border-[#007AFF]/45 disabled:opacity-50 dark:border-white/[0.1] dark:bg-zinc-950/40"
                            aria-label={it.photoUrl ? 'Trocar foto do tipo' : 'Adicionar foto do tipo'}
                            title={!it.id.trim() ? 'Salve o tipo antes de adicionar a foto' : undefined}
                          >
                            {thumb ? (
                              <img src={thumb} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <ImageIcon className="h-5 w-5 text-zinc-400 dark:text-zinc-500" strokeWidth={1.8} />
                            )}
                            <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition group-hover:opacity-100">
                              {uploading ? (
                                <Loader2 className="h-4 w-4 animate-spin text-white" />
                              ) : (
                                <Camera className="h-4 w-4 text-white" strokeWidth={2.2} />
                              )}
                            </span>
                          </button>
                          <input
                            ref={(el) => {
                              fileInputRefs.current[it.key] = el;
                            }}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              e.target.value = '';
                              void handlePhotoPick(it.key, file);
                            }}
                          />
                        </div>
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
