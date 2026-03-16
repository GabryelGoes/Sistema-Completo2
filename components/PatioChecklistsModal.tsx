import React, { useState, useEffect, useCallback } from 'react';
import { X, ClipboardList, Plus, Pencil, Trash2, Check, Loader2 } from 'lucide-react';
import {
  getChecklistTemplates,
  createChecklistTemplate,
  updateChecklistTemplate,
  deleteChecklistTemplate,
  type ChecklistTemplate,
} from '../services/apiService';

interface PatioChecklistsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function parseItemsText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function itemsToText(items: { text: string }[]): string {
  return items.map((i) => i.text).join('\n');
}

export const PatioChecklistsModal: React.FC<PatioChecklistsModalProps> = ({ isOpen, onClose }) => {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newItemsText, setNewItemsText] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingItemsText, setEditingItemsText] = useState('');

  const fetchTemplates = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const list = await getChecklistTemplates();
      setTemplates(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar checklists.');
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) fetchTemplates();
  }, [isOpen, fetchTemplates]);

  const handleCreate = async () => {
    const name = newName.trim();
    const items = parseItemsText(newItemsText);
    if (!name || adding) return;
    setAdding(true);
    setError(null);
    try {
      const created = await createChecklistTemplate(name, items);
      setTemplates((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setNewName('');
      setNewItemsText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar checklist.');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (t: ChecklistTemplate) => {
    setEditingId(t.id);
    setEditingName(t.name);
    setEditingItemsText(itemsToText(t.items));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
    setEditingItemsText('');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingName.trim()) {
      cancelEdit();
      return;
    }
    setError(null);
    try {
      const items = parseItemsText(editingItemsText);
      const updated = await updateChecklistTemplate(editingId, editingName.trim(), items);
      setTemplates((prev) => prev.map((x) => (x.id === editingId ? updated : x)));
      cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este checklist? Os itens marcados nos veículos serão perdidos.')) return;
    setError(null);
    try {
      await deleteChecklistTemplate(id);
      setTemplates((prev) => prev.filter((x) => x.id !== id));
      if (editingId === id) cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-2 sm:p-4 animate-modal-backdrop">
      <div className="bg-[#FAFAF9] dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-zinc-200/60 dark:border-white/[0.08] rounded-[1.5rem] w-full max-w-3xl h-[92vh] max-h-[92vh] shadow-[0_2px_24px_-4px_rgba(0,0,0,0.1),0_12px_40px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_32px_-4px_rgba(0,0,0,0.5)] overflow-hidden animate-modal-sheet flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-zinc-200/60 dark:border-white/[0.08] bg-zinc-50/80 dark:bg-white/[0.04] shrink-0">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            Checklists do Pátio
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
            Crie checklists que aparecerão no modal de cada veículo na página Pátio. Ex.: &quot;Entrada&quot;, &quot;Finalização&quot;. Cada checklist tem itens que o técnico pode marcar por veículo.
          </p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Criar novo */}
          <div className="rounded-2xl overflow-hidden bg-white/70 dark:bg-white/[0.06] border border-zinc-200/60 dark:border-white/[0.08] shadow-sm mb-6">
            <div className="p-4 space-y-3 border-b border-zinc-200/50 dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.03]">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome do checklist (ex.: Entrada, Finalização)"
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50"
              />
              <textarea
                value={newItemsText}
                onChange={(e) => setNewItemsText(e.target.value)}
                placeholder={'Itens (um por linha)\nEx.: Conferir documentação\nVerificar nível de óleo'}
                rows={4}
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 resize-y min-h-[80px]"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim() || adding}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:pointer-events-none text-white font-medium transition-colors"
              >
                {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                Criar checklist
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-zinc-500 dark:text-zinc-400">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <div className="py-10 px-4 text-center rounded-2xl bg-white/50 dark:bg-white/[0.04] border border-zinc-200/50 dark:border-white/[0.06]">
              <p className="text-[15px] text-zinc-500 dark:text-zinc-400">Nenhum checklist cadastrado.</p>
              <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1">Crie um acima para exibir no modal dos veículos do Pátio.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="rounded-2xl overflow-hidden bg-white/70 dark:bg-white/[0.06] border border-zinc-200/60 dark:border-white/[0.08] shadow-sm"
                >
                  {editingId === t.id ? (
                    <div className="p-4 space-y-3">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                        placeholder="Nome do checklist"
                      />
                      <textarea
                        value={editingItemsText}
                        onChange={(e) => setEditingItemsText(e.target.value)}
                        placeholder="Itens (um por linha)"
                        rows={4}
                        className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-y min-h-[80px]"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-white font-medium hover:bg-emerald-600"
                        >
                          <Check className="w-4 h-4" /> Salvar
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="px-4 py-2.5 rounded-xl bg-zinc-200 dark:bg-white/10 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-300 dark:hover:bg-white/20"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="min-h-[52px] flex items-center gap-3 px-4 py-3 hover:bg-zinc-100/60 dark:hover:bg-white/[0.04] transition-colors">
                      <div className="flex-1 min-w-0">
                        <span className="text-[17px] font-medium text-zinc-900 dark:text-white block truncate">
                          {t.name}
                        </span>
                        <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
                          {t.items.length} {t.items.length === 1 ? 'item' : 'itens'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEdit(t)}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                        aria-label="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(t.id)}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-red-600 hover:bg-red-500/10 transition-colors"
                        aria-label="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
