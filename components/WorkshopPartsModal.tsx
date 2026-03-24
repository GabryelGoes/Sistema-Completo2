import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Package, Plus, Pencil, Trash2, Check, Loader2, Camera } from 'lucide-react';
import {
  getWorkshopParts,
  createWorkshopPart,
  updateWorkshopPart,
  deleteWorkshopPart,
  uploadWorkshopPartPhoto,
  type WorkshopPart,
} from '../services/apiService';

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir peça.');
    }
  };

  const handleUploadPhotoForPart = async (partId: string, file: File | null) => {
    if (!file) return;
    setUploadingPhotoId(partId);
    setError(null);
    try {
      const updated = await uploadWorkshopPartPhoto(partId, file, file.name);
      setParts((prev) => prev.map((p) => (p.id === partId ? updated : p)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar foto da peça.');
    } finally {
      setUploadingPhotoId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-2 sm:p-4 animate-modal-backdrop">
      <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-zinc-200/60 dark:border-white/[0.08] rounded-[1.5rem] w-full max-w-[95vw] h-[94vh] max-h-[94vh] shadow-[0_2px_24px_-4px_rgba(0,0,0,0.1),0_12px_40px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_32px_-4px_rgba(0,0,0,0.5)] overflow-hidden animate-modal-sheet flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-zinc-200/60 dark:border-white/[0.08] bg-zinc-50/80 dark:bg-white/[0.04] shrink-0">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-brand-yellow" />
            Estoque de Peças
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-zinc-200/80 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-4">
            Cadastre as peças com preço e quantidade em estoque para facilitar a montagem de orçamentos.
          </p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="rounded-2xl overflow-hidden bg-white/70 dark:bg-white/[0.06] border border-zinc-200/60 dark:border-white/[0.08] shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto_auto] gap-3 p-3 border-b border-zinc-200/50 dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.03]">
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
              <div className="space-y-1">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Preço (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="0,00"
                  className="w-full min-w-0 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-yellow/40 focus:border-brand-yellow/60"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Quantidade em estoque
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={newStock}
                  onChange={(e) => setNewStock(e.target.value)}
                  placeholder="0"
                  className="w-full min-w-0 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-yellow/40 focus:border-brand-yellow/60"
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
                  setNewPhoto(f);
                }}
              />
            </div>
            {newPhoto && (
              <div className="px-3 pb-3 text-[12px] text-zinc-500 dark:text-zinc-400">
                Foto selecionada: <span className="text-zinc-800 dark:text-zinc-200 font-medium">{newPhoto.name}</span>
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
                <div className="px-4 pt-3 pb-2 grid grid-cols-[2fr_1fr_1fr_auto_auto_auto] gap-3 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-zinc-200/40 dark:border-white/[0.06]">
                  <span>Nome da peça</span>
                  <span>Preço</span>
                  <span>Quantidade</span>
                  <span className="text-center">Editar</span>
                  <span className="text-center">Foto</span>
                  <span className="text-center">Excluir</span>
                </div>
                <div className="divide-y divide-zinc-200/50 dark:divide-white/[0.06]">
                {parts.map((p) => (
                  <div
                    key={p.id}
                    className="min-h-[52px] flex items-center gap-3 px-4 py-3 bg-transparent hover:bg-zinc-100/60 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    {editingId === p.id ? (
                      <>
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-[2] min-w-0 px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-yellow/40"
                          autoFocus
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editingPrice}
                          onChange={(e) => setEditingPrice(e.target.value)}
                          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-yellow/40"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={editingStock}
                          onChange={(e) => setEditingStock(e.target.value)}
                          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[14px] focus:outline-none focus:ring-2 focus:ring-brand-yellow/40"
                        />
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="w-9 h-9 rounded-lg bg-brand-yellow text-black flex items-center justify-center hover:brightness-110"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="w-9 h-9 rounded-lg bg-zinc-200 dark:bg-white/10 text-zinc-600 dark:text-zinc-400 flex items-center justify-center hover:bg-zinc-300 dark:hover:bg-white/20"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex-[2] min-w-0 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 overflow-hidden shrink-0">
                            {p.photo_url ? (
                              <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" />
                            ) : null}
                          </div>
                          <span className="min-w-0 text-[16px] font-medium text-zinc-900 dark:text-white truncate">
                            {p.name}
                          </span>
                        </div>
                        <span className="flex-1 min-w-0 text-[14px] text-zinc-700 dark:text-zinc-300">
                          R$ {Number(p.unit_price ?? 0).toFixed(2)}
                        </span>
                        <span className="flex-1 min-w-0 text-[14px] text-zinc-700 dark:text-zinc-300">
                          {Number(p.stock_qty ?? 0).toFixed(3)}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-brand-yellow hover:bg-brand-yellow/10 transition-colors"
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
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-brand-yellow hover:bg-brand-yellow/10 transition-colors"
                          aria-label="Foto"
                          title="Adicionar/alterar foto"
                        >
                          {uploadingPhotoId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-red-600 hover:bg-red-500/10 transition-colors"
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
                    if (partId) handleUploadPhotoForPart(partId, f);
                    if (editPhotoInputRef.current) {
                      editPhotoInputRef.current.value = '';
                    }
                  }}
                />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

