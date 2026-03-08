import React, { useState, useEffect, useCallback } from 'react';
import { X, Wrench, Plus, Pencil, Trash2, Check, Loader2 } from 'lucide-react';
import {
  getWorkshopServices,
  createWorkshopService,
  updateWorkshopService,
  deleteWorkshopService,
  type WorkshopService,
} from '../services/apiService';

interface WorkshopServicesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WorkshopServicesModal: React.FC<WorkshopServicesModalProps> = ({ isOpen, onClose }) => {
  const [services, setServices] = useState<WorkshopService[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const fetchServices = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const list = await getWorkshopServices();
      setServices(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar serviços.');
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) fetchServices();
  }, [isOpen, fetchServices]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    setError(null);
    try {
      const created = await createWorkshopService(name);
      setServices((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setNewName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao adicionar.');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (s: WorkshopService) => {
    setEditingId(s.id);
    setEditingName(s.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingName.trim()) {
      cancelEdit();
      return;
    }
    setError(null);
    try {
      const updated = await updateWorkshopService(editingId, editingName.trim());
      setServices((prev) => prev.map((s) => (s.id === editingId ? updated : s)));
      cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este serviço da lista?')) return;
    setError(null);
    try {
      await deleteWorkshopService(id);
      setServices((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-2 sm:p-4 animate-modal-backdrop">
      <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-zinc-200/60 dark:border-white/[0.08] rounded-[1.5rem] w-full max-w-3xl h-[92vh] max-h-[92vh] shadow-[0_2px_24px_-4px_rgba(0,0,0,0.1),0_12px_40px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_32px_-4px_rgba(0,0,0,0.5)] overflow-hidden animate-modal-sheet flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-zinc-200/60 dark:border-white/[0.08] bg-zinc-50/80 dark:bg-white/[0.04] shrink-0">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-500 dark:text-amber-400" />
            Serviços da oficina
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
            Cadastre os serviços que mais faz. Eles aparecerão para seleção ao criar orçamento.
          </p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="rounded-2xl overflow-hidden bg-white/70 dark:bg-white/[0.06] border border-zinc-200/60 dark:border-white/[0.08] shadow-sm">
            <div className="flex items-center gap-2 p-3 border-b border-zinc-200/50 dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.03]">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="Ex.: Troca de óleo, Revisão geral..."
                className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-[15px] focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newName.trim() || adding}
                className="shrink-0 w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:pointer-events-none text-white flex items-center justify-center transition-colors"
              >
                {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-zinc-500 dark:text-zinc-400">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : services.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <p className="text-[15px] text-zinc-500 dark:text-zinc-400">Nenhum serviço cadastrado.</p>
                <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1">Adicione acima para usar no orçamento.</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200/50 dark:divide-white/[0.06]">
                {services.map((s) => (
                  <div
                    key={s.id}
                    className="min-h-[52px] flex items-center gap-3 px-4 py-3 bg-transparent hover:bg-zinc-100/60 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    {editingId === s.id ? (
                      <>
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit();
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[15px] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="w-9 h-9 rounded-lg bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600"
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
                        <span className="flex-1 min-w-0 text-[17px] font-medium text-zinc-900 dark:text-white truncate">
                          {s.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => startEdit(s)}
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-amber-600 hover:bg-amber-500/10 transition-colors"
                          aria-label="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(s.id)}
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-red-600 hover:bg-red-500/10 transition-colors"
                          aria-label="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
