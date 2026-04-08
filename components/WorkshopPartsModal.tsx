import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Package, Plus, Pencil, Trash2, Check, Loader2, Camera, Hash } from 'lucide-react';
import { iosModalOverlay, iosModalShell, iosModalClose, iosModalInsetCard } from './ui/iosModalStyles';
import { IosModalHeader } from './ui/IosModalHeader';
import {
  getWorkshopParts,
  createWorkshopPart,
  updateWorkshopPart,
  deleteWorkshopPart,
  uploadWorkshopPartPhoto,
  type WorkshopPart,
} from '../services/apiService';
import { TechnicianPhotoEditorModal } from './TechnicianPhotoEditorModal';

interface WorkshopPartsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WorkshopPartsModal: React.FC<WorkshopPartsModalProps> = ({ isOpen, onClose }) => {
  const [parts, setParts] = useState<WorkshopPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newStock, setNewStock] = useState('');
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPrice, setEditingPrice] = useState('');
  const [editingStock, setEditingStock] = useState('');
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [detailPart, setDetailPart] = useState<WorkshopPart | null>(null);
  /** 'new' = foto para peça ainda não cadastrada; string = id da peça existente */
  const [photoEditorTarget, setPhotoEditorTarget] = useState<'new' | string | null>(null);
  const [photoEditorFile, setPhotoEditorFile] = useState<File | null>(null);
  const createPhotoInputRef = useRef<HTMLInputElement>(null);
  const editPhotoInputRef = useRef<HTMLInputElement>(null);

  const parseNumber = (value: string): number => {
    const n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const fetchParts = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const list = await getWorkshopParts();
      setParts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar peças.');
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) fetchParts();
  }, [isOpen, fetchParts]);

  useEffect(() => {
    if (!isOpen) setDetailPart(null);
  }, [isOpen]);

  useEffect(() => {
    setDetailPart((prev) => {
      if (!prev) return null;
      const fresh = parts.find((x) => x.id === prev.id);
      return fresh ?? null;
    });
  }, [parts]);

  useEffect(() => {
    if (!detailPart) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailPart(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailPart]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || adding) return;
    const unit_price = parseNumber(newPrice);
    const stock_qty = parseNumber(newStock);
    if (unit_price < 0 || stock_qty < 0) {
      setError('Preço e estoque devem ser valores positivos.');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      let created = await createWorkshopPart({ name, unit_price, stock_qty });
      if (newPhoto) {
        created = await uploadWorkshopPartPhoto(created.id, newPhoto, newPhoto.name);
      }
      setParts((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setNewName('');
      setNewPrice('');
      setNewStock('');
      setNewPhoto(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao adicionar peça.');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (p: WorkshopPart) => {
    setEditingId(p.id);
    setEditingName(p.name);
    setEditingPrice(String(p.unit_price ?? 0));
    setEditingStock(String(p.stock_qty ?? 0));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
    setEditingPrice('');
    setEditingStock('');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingName.trim()) {
      cancelEdit();
      return;
    }
    const unit_price = parseNumber(editingPrice);
    const stock_qty = parseNumber(editingStock);
    if (unit_price < 0 || stock_qty < 0) {
      setError('Preço e estoque devem ser valores positivos.');
      return;
    }
    setError(null);
    try {
      const updated = await updateWorkshopPart(editingId, {
        name: editingName.trim(),
        unit_price,
        stock_qty,
      });
      setParts((prev) => prev.map((p) => (p.id === editingId ? updated : p)));
      cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar peça.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta peça do estoque?')) return;
    setError(null);
    try {
      await deleteWorkshopPart(id);
      setParts((prev) => prev.filter((p) => p.id !== id));
      setDetailPart((prev) => (prev?.id === id ? null : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir peça.');
    }
  };

  const photoEditorDisplayName =
    photoEditorTarget === 'new'
      ? newName.trim() || 'Nova peça'
      : photoEditorTarget
        ? parts.find((x) => x.id === photoEditorTarget)?.name ?? 'Peça'
        : '';

  const handlePhotoEditorSave = async (blob: Blob) => {
    const target = photoEditorTarget;
    setPhotoEditorFile(null);
    setPhotoEditorTarget(null);
    const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });
    if (target === 'new') {
      setNewPhoto(file);
      return;
    }
    if (target) {
      setUploadingPhotoId(target);
      setError(null);
      try {
        const updated = await uploadWorkshopPartPhoto(target, file, file.name);
        setParts((prev) => prev.map((p) => (p.id === target ? updated : p)));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao enviar foto da peça.');
      } finally {
        setUploadingPhotoId(null);
      }
    }
  };

  const handlePhotoEditorCancel = () => {
    setPhotoEditorFile(null);
    setPhotoEditorTarget(null);
  };

  if (!isOpen) return null;

  const detail = detailPart;

  return (
    <>
    <TechnicianPhotoEditorModal
      isOpen={!!photoEditorFile}
      imageFile={photoEditorFile}
      technicianName={photoEditorDisplayName}
      onSave={handlePhotoEditorSave}
      onCancel={handlePhotoEditorCancel}
      overlayZIndexClass="z-[125]"
      cropShape="square"
    />

    <div className={iosModalOverlay}>
      <div className={`${iosModalShell} w-full max-w-[95vw] h-[94vh] max-h-[94vh]`}>
        <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="px-6 sm:px-8 pt-8 pb-4 pr-14 shrink-0">
            <IosModalHeader
              icon={<Package className="w-6 h-6 text-white" strokeWidth={2.2} />}
              title="Estoque de peças"
              subtitle="Preço, quantidade e foto para orçamentos"
              gradientClass="from-emerald-500 to-teal-700"
            />
          </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 pb-8">
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-4">
            Cadastre as peças com preço e quantidade em estoque para facilitar a montagem de orçamentos.
          </p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className={`overflow-hidden ${iosModalInsetCard}`}>
            <div className="grid grid-cols-1 md:grid-cols-[4fr_1fr_1fr_auto_auto] gap-3 p-3 border-b border-zinc-200/50 dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.03]">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Nome da peça
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  placeholder="Ex.: Sensor ABS"
                  className="w-full min-w-0 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-yellow/40 focus:border-brand-yellow/60"
                />
              </div>
              <div className="space-y-1 md:text-right">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 md:text-right">
                  Preço (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="0,00"
                  className="w-full min-w-0 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-[15px] tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-yellow/40 focus:border-brand-yellow/60 md:text-right"
                />
              </div>
              <div className="space-y-1 md:text-right">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 md:text-right">
                  Quantidade em estoque
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={newStock}
                  onChange={(e) => setNewStock(e.target.value)}
                  placeholder="0"
                  className="w-full min-w-0 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-[15px] tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-yellow/40 focus:border-brand-yellow/60 md:text-right"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 text-center">
                  Salvar
                </label>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!newName.trim() || adding}
                  className="w-10 h-10 rounded-xl bg-brand-yellow hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none text-black flex items-center justify-center transition-colors mx-auto"
                >
                  {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                </button>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 text-center">
                  Foto
                </label>
                <button
                  type="button"
                  onClick={() => createPhotoInputRef.current?.click()}
                  className="w-10 h-10 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white flex items-center justify-center transition-colors mx-auto"
                  title="Selecionar foto da peça"
                >
                  <Camera className="w-5 h-5" />
                </button>
              </div>
              <input
                ref={createPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = '';
                  if (!f || !f.type.startsWith('image/')) return;
                  setPhotoEditorTarget('new');
                  setPhotoEditorFile(f);
                }}
              />
            </div>
            {newPhoto && (
              <div className="px-3 pb-3 text-[12px] text-zinc-500 dark:text-zinc-400">
                Foto pronta para salvar com a peça (ajuste feito no editor).
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12 text-zinc-500 dark:text-zinc-400">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : parts.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <p className="text-[15px] text-zinc-500 dark:text-zinc-400">Nenhuma peça cadastrada.</p>
                <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1">Adicione acima para montar seu estoque.</p>
              </div>
            ) : (
              <>
                <div className="hidden md:grid md:grid-cols-[4fr_1fr_1fr_auto_auto_auto] md:gap-3 px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-zinc-200/40 dark:border-white/[0.06]">
                  <span className="min-w-0">Nome da peça</span>
                  <span className="text-right tabular-nums">Preço</span>
                  <span className="text-right tabular-nums">Quantidade</span>
                  <span className="text-center justify-self-center">Editar</span>
                  <span className="text-center justify-self-center">Foto</span>
                  <span className="text-center justify-self-center">Excluir</span>
                </div>
                <div className="md:hidden px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-zinc-200/40 dark:border-white/[0.06]">
                  Lista de peças
                </div>
                <div className="divide-y divide-zinc-200/50 dark:divide-white/[0.06]">
                {parts.map((p) => (
                  <div
                    key={p.id}
                    className="min-h-[52px] flex flex-wrap items-center gap-3 px-4 py-3 bg-transparent hover:bg-zinc-100/60 dark:hover:bg-white/[0.04] transition-colors md:grid md:grid-cols-[4fr_1fr_1fr_auto_auto_auto] md:flex-nowrap md:gap-3 md:items-center"
                  >
                    {editingId === p.id ? (
                      <>
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="w-full min-w-0 basis-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-yellow/40 md:basis-auto md:min-w-0"
                          autoFocus
                        />
                        <div className="grid w-full basis-full grid-cols-2 gap-2 md:contents">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editingPrice}
                            onChange={(e) => setEditingPrice(e.target.value)}
                            className="min-w-0 px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[14px] text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-yellow/40 md:min-w-0"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={editingStock}
                            onChange={(e) => setEditingStock(e.target.value)}
                            className="min-w-0 px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[14px] text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-yellow/40 md:min-w-0"
                          />
                        </div>
                        <div className="flex w-full basis-full items-center justify-end gap-2 md:contents">
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            className="w-9 h-9 shrink-0 rounded-lg bg-brand-yellow text-black flex items-center justify-center justify-self-center hover:brightness-110"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="w-9 h-9 shrink-0 rounded-lg bg-zinc-200 dark:bg-white/10 text-zinc-600 dark:text-zinc-400 flex items-center justify-center justify-self-center hover:bg-zinc-300 dark:hover:bg-white/20"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <span className="hidden md:block min-w-[2.25rem]" aria-hidden />
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setDetailPart(p)}
                          className="w-full min-w-0 flex flex-[1_1_100%] items-center gap-3 text-left rounded-xl -my-1 -ml-2 pl-2 pr-2 py-1.5 hover:bg-zinc-200/70 dark:hover:bg-white/[0.07] transition-colors cursor-pointer md:col-span-1 md:flex-[unset] md:w-auto"
                          title="Ver detalhes do produto"
                        >
                          <div className="w-10 h-10 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 overflow-hidden shrink-0 pointer-events-none">
                            {p.photo_url ? (
                              <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                            ) : null}
                          </div>
                          <span className="min-w-0 text-[16px] font-medium text-zinc-900 dark:text-white truncate">
                            {p.name}
                          </span>
                        </button>
                        <span className="min-w-0 flex-1 text-[14px] text-zinc-700 dark:text-zinc-300 text-right tabular-nums md:flex-[unset] md:min-w-0 md:justify-self-end">
                          R$ {Number(p.unit_price ?? 0).toFixed(2)}
                        </span>
                        <span className="min-w-0 flex-1 text-[14px] text-zinc-700 dark:text-zinc-300 text-right tabular-nums md:flex-[unset] md:min-w-0 md:justify-self-end">
                          {Number(p.stock_qty ?? 0).toFixed(3)}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center justify-self-center text-zinc-500 dark:text-zinc-400 hover:text-brand-yellow hover:bg-brand-yellow/10 transition-colors"
                          aria-label="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!editPhotoInputRef.current) return;
                            editPhotoInputRef.current.dataset.partId = p.id;
                            editPhotoInputRef.current.click();
                          }}
                          className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center justify-self-center text-zinc-500 dark:text-zinc-400 hover:text-brand-yellow hover:bg-brand-yellow/10 transition-colors"
                          aria-label="Foto"
                          title="Adicionar/alterar foto"
                        >
                          {uploadingPhotoId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center justify-self-center text-zinc-500 dark:text-zinc-400 hover:text-red-600 hover:bg-red-500/10 transition-colors"
                          aria-label="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                <input
                  ref={editPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    const partId = editPhotoInputRef.current?.dataset.partId;
                    if (editPhotoInputRef.current) editPhotoInputRef.current.value = '';
                    if (!f || !f.type.startsWith('image/') || !partId) return;
                    setPhotoEditorTarget(partId);
                    setPhotoEditorFile(f);
                  }}
                />
                </div>
              </>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>

    {detail && (
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-[12px]"
        onClick={() => setDetailPart(null)}
      >
        <div
          className={`${iosModalShell} w-full max-w-md md:max-w-2xl xl:max-w-3xl max-h-[92vh] overflow-y-auto`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="workshop-part-detail-title"
        >
          <button type="button" onClick={() => setDetailPart(null)} className={iosModalClose} aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
          <p id="workshop-part-detail-title" className="sr-only">
            Produto no estoque: {detail.name}
          </p>
          <div className="px-6 sm:px-8 pt-8 pb-4 pr-14 shrink-0 border-b border-zinc-200/50 dark:border-white/[0.06]">
            <IosModalHeader
              icon={<Package className="w-6 h-6 text-white" strokeWidth={2.2} />}
              title="Produto no estoque"
              subtitle={detail.name}
              gradientClass="from-emerald-500 to-teal-700"
            />
          </div>
          <div className="px-6 sm:px-8 py-6 space-y-5">
            <div className="flex justify-center">
              <div className="w-full max-w-[280px] aspect-square rounded-[22px] border border-zinc-200/80 dark:border-white/[0.08] bg-zinc-100 dark:bg-white/[0.05] overflow-hidden flex items-center justify-center">
                {detail.photo_url ? (
                  <img src={detail.photo_url} alt={detail.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-20 h-20 text-zinc-300 dark:text-zinc-600" strokeWidth={1.25} />
                )}
              </div>
            </div>
            <dl className="grid gap-3 text-[15px]">
              <div className="flex justify-between gap-4 border-b border-zinc-200/40 dark:border-white/[0.06] pb-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Preço unitário</dt>
                <dd className="font-semibold text-zinc-900 dark:text-white tabular-nums">
                  R$ {Number(detail.unit_price ?? 0).toFixed(2)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-zinc-200/40 dark:border-white/[0.06] pb-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Quantidade em estoque</dt>
                <dd className="font-semibold text-zinc-900 dark:text-white tabular-nums">
                  {Number(detail.stock_qty ?? 0).toFixed(3)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-zinc-200/40 dark:border-white/[0.06] pb-3">
                <dt className="text-zinc-500 dark:text-zinc-400">Valor em estoque</dt>
                <dd className="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  R$ {(Number(detail.unit_price ?? 0) * Number(detail.stock_qty ?? 0)).toFixed(2)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 items-start">
                <dt className="text-zinc-500 dark:text-zinc-400 shrink-0">Cadastrado em</dt>
                <dd className="text-right text-zinc-800 dark:text-zinc-200 text-[14px]">
                  {detail.created_at
                    ? new Date(detail.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                    : '—'}
                </dd>
              </div>
              <div className="flex items-start gap-2 pt-1 text-[13px] text-zinc-500 dark:text-zinc-500">
                <Hash className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                <span className="font-mono break-all">{detail.id}</span>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const p = detail;
                  setDetailPart(null);
                  startEdit(p);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-yellow px-4 py-3 text-[15px] font-semibold text-black hover:brightness-110 transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Editar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!editPhotoInputRef.current) return;
                  editPhotoInputRef.current.dataset.partId = detail.id;
                  editPhotoInputRef.current.click();
                }}
                disabled={uploadingPhotoId === detail.id}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-200 dark:bg-white/10 px-4 py-3 text-[15px] font-semibold text-zinc-900 dark:text-white hover:bg-zinc-300 dark:hover:bg-white/15 transition-colors disabled:opacity-50"
              >
                {uploadingPhotoId === detail.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                Foto
              </button>
              <button
                type="button"
                onClick={() => handleDelete(detail.id)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-300 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-[15px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Excluir
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

