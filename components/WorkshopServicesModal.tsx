import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Wrench, Plus, Pencil, Trash2, Check, Loader2, Clock3, Tag } from 'lucide-react';
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
  const DEFAULT_CATEGORIES = useMemo(() => ['Compacto', 'Médio/SUV', 'Pick-Up', 'Premium'], []);
  const CATEGORIES_STORAGE_KEY = 'workshop_service_categories';
  const baseCategory = DEFAULT_CATEGORIES[0];
  const [managedCategories, setManagedCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(baseCategory);
  const [services, setServices] = useState<WorkshopService[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newServiceName, setNewServiceName] = useState('');
  const [newHours, setNewHours] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingServiceName, setEditingServiceName] = useState('');
  const [editingHours, setEditingHours] = useState('');
  const [editingCategory, setEditingCategory] = useState<string>(baseCategory);

  const categories = useMemo(() => {
    const source = managedCategories.length > 0 ? managedCategories : DEFAULT_CATEGORIES;
    return Array.from(new Set(source.map((c) => c.trim()).filter(Boolean)));
  }, [DEFAULT_CATEGORIES, managedCategories]);

  const parseServiceName = useCallback(
    (rawName: string): { category: string; hours: string; title: string } => {
      // Compatibilidade com serviços legados: "[Categoria | Xh] Nome".
      const n = (rawName || '').trim();
      const match = n.match(/^\[(.+?)\s*\|\s*([0-9]+(?:[.,][0-9]+)?)h\]\s*(.+)$/i);
      if (match) {
        return {
          category: match[1].trim(),
          hours: match[2].replace(',', '.'),
          title: match[3].trim(),
        };
      }
      return { category: baseCategory, hours: '', title: n };
    },
    [baseCategory]
  );

  const formatServiceName = useCallback((category: string, title: string, hours: string) => {
    const h = hours.replace(',', '.').trim();
    return `[${category} | ${h}h] ${title.trim()}`;
  }, []);

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CATEGORIES_STORAGE_KEY);
      if (!raw) {
        setManagedCategories(DEFAULT_CATEGORIES);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setManagedCategories(parsed.map((c) => String(c).trim()).filter(Boolean));
      } else {
        setManagedCategories(DEFAULT_CATEGORIES);
      }
    } catch (_) {}
  }, [CATEGORIES_STORAGE_KEY, DEFAULT_CATEGORIES]);

  useEffect(() => {
    try {
      if (managedCategories.length > 0) {
        localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(managedCategories));
      }
    } catch (_) {}
  }, [CATEGORIES_STORAGE_KEY, managedCategories]);

  useEffect(() => {
    if (!categories.includes(selectedCategory)) {
      setSelectedCategory(categories[0] ?? baseCategory);
    }
  }, [categories, selectedCategory, baseCategory]);

  const handleAdd = async () => {
    const serviceName = newServiceName.trim();
    const category = selectedCategory.trim();
    const hours = newHours.trim().replace(',', '.');
    if (!serviceName || !category || !hours || adding) return;
    const hoursNum = Number(hours);
    if (!Number.isFinite(hoursNum) || hoursNum <= 0) {
      setError('Informe horas válidas (ex.: 1.5).');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      const created = await createWorkshopService({
        name: serviceName,
        category,
        labor_hours: hoursNum,
      });
      setServices((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setNewServiceName('');
      setNewHours('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao adicionar.');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (s: WorkshopService) => {
    const parsed = parseServiceName(s.name);
    setEditingId(s.id);
    setEditingServiceName((s.name || parsed.title || '').trim());
    setEditingHours(s.labor_hours != null ? String(s.labor_hours) : parsed.hours);
    setEditingCategory((s.category || parsed.category || baseCategory).trim());
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingServiceName('');
    setEditingHours('');
    setEditingCategory(baseCategory);
  };

  const handleSaveEdit = async () => {
    const serviceName = editingServiceName.trim();
    const category = editingCategory.trim();
    const hours = editingHours.trim().replace(',', '.');
    if (!editingId || !serviceName || !category || !hours) {
      cancelEdit();
      return;
    }
    const hoursNum = Number(hours);
    if (!Number.isFinite(hoursNum) || hoursNum <= 0) {
      setError('Informe horas válidas para o serviço.');
      return;
    }
    setError(null);
    try {
      const updated = await updateWorkshopService(editingId, {
        name: serviceName,
        category,
        labor_hours: hoursNum,
      });
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

  const handleAddCategory = () => {
    const c = newCategoryName.trim();
    if (!c) return;
    if (categories.some((x) => x.toLowerCase() === c.toLowerCase())) {
      setError('Essa categoria já existe.');
      return;
    }
    setError(null);
    setManagedCategories((prev) => [...prev, c]);
    setSelectedCategory(c);
    setNewCategoryName('');
  };

  const handleRenameCategory = async (category: string) => {
    const next = window.prompt(`Novo nome para a categoria "${category}":`, category)?.trim() ?? '';
    if (!next || next === category) return;
    if (categories.some((c) => c.toLowerCase() === next.toLowerCase())) {
      setError('Já existe uma categoria com esse nome.');
      return;
    }
    setError(null);
    const affected = services.filter((s) => (s.category || '').trim() === category.trim());
    try {
      if (affected.length > 0) {
        await Promise.all(
          affected.map((s) =>
            updateWorkshopService(s.id, {
              name: s.name,
              category: next,
              labor_hours: s.labor_hours ?? 1,
            })
          )
        );
      }
      setManagedCategories((prev) => prev.map((c) => (c === category ? next : c)));
      setServices((prev) => prev.map((s) => ((s.category || '').trim() === category.trim() ? { ...s, category: next } : s)));
      if (selectedCategory === category) setSelectedCategory(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao renomear categoria.');
    }
  };

  const handleDeleteCategory = async (category: string) => {
    if (categories.length <= 1) {
      setError('É necessário manter pelo menos 1 categoria.');
      return;
    }
    if (!window.confirm(`Excluir categoria "${category}"?`)) return;
    const others = categories.filter((c) => c !== category);
    const affected = services.filter((s) => (s.category || '').trim() === category.trim());
    const fallback = others[0];
    try {
      if (affected.length > 0) {
        const optionList = others.join(', ');
        const chosen =
          window.prompt(
            `A categoria "${category}" tem ${affected.length} serviço(s). Para qual categoria deseja mover?\n\nOpções: ${optionList}`,
            fallback
          )?.trim() ?? '';
        if (!chosen) return;
        const validTarget = others.find((c) => c.toLowerCase() === chosen.toLowerCase());
        if (!validTarget) {
          setError('Categoria de destino inválida.');
          return;
        }
        await Promise.all(
          affected.map((s) =>
            updateWorkshopService(s.id, {
              name: s.name,
              category: validTarget,
              labor_hours: s.labor_hours ?? 1,
            })
          )
        );
        setServices((prev) =>
          prev.map((s) => ((s.category || '').trim() === category.trim() ? { ...s, category: validTarget } : s))
        );
      }
      setManagedCategories((prev) => prev.filter((c) => c !== category));
      if (selectedCategory === category) setSelectedCategory(fallback);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir categoria.');
    }
  };

  const servicesByCategory = useMemo(() => {
    const map = new Map<string, WorkshopService[]>();
    for (const c of categories) map.set(c, []);
    for (const s of services) {
      const parsed = parseServiceName(s.name);
      const category = (s.category || parsed.category || baseCategory).trim();
      if (!map.has(category)) map.set(category, []);
      map.get(category)!.push(s);
    }
    for (const entry of map.values()) {
      entry.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    }
    return map;
  }, [categories, services, parseServiceName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-2 sm:p-4 animate-modal-backdrop">
      <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-zinc-200/60 dark:border-white/[0.08] rounded-[1.5rem] w-full max-w-[95vw] h-[94vh] max-h-[94vh] shadow-[0_2px_24px_-4px_rgba(0,0,0,0.1),0_12px_40px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_32px_-4px_rgba(0,0,0,0.5)] overflow-hidden animate-modal-sheet flex flex-col">
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
            Organize serviços por categoria de veículo e defina horas padrão. Isso facilita a seleção no orçamento.
          </p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="rounded-2xl overflow-hidden bg-white/70 dark:bg-white/[0.06] border border-zinc-200/60 dark:border-white/[0.08] shadow-sm mb-4">
            <div className="p-3 border-b border-zinc-200/50 dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.03]">
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">Categorias de veículos</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {categories.map((category) => {
                  const active = selectedCategory === category;
                  return (
                    <div key={category} className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedCategory(category)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          active
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white dark:bg-white/5 text-zinc-700 dark:text-zinc-200 border-zinc-300 dark:border-white/10 hover:border-amber-500/60'
                        }`}
                      >
                        {category}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRenameCategory(category)}
                        className="w-6 h-6 rounded-full text-zinc-500 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                        title="Editar categoria"
                      >
                        <Pencil className="w-3.5 h-3.5 mx-auto" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(category)}
                        className="w-6 h-6 rounded-full text-zinc-500 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30"
                        title="Excluir categoria"
                      >
                        <Trash2 className="w-3.5 h-3.5 mx-auto" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-col sm:flex-row items-stretch gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  placeholder="Adicionar nova categoria personalizada"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="px-3 py-2 rounded-lg bg-zinc-900 dark:bg-white/10 text-white dark:text-zinc-100 text-sm font-medium hover:opacity-90"
                >
                  Adicionar categoria
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 p-3 border-b border-zinc-200/50 dark:border-white/[0.06]">
              <div className="md:col-span-7">
                <input
                  type="text"
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  placeholder={`Novo serviço para ${selectedCategory}`}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-[15px] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>
              <div className="md:col-span-3">
                <div className="relative">
                  <Clock3 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={newHours}
                    onChange={(e) => setNewHours(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    placeholder="Horas"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[15px] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!newServiceName.trim() || !newHours.trim() || adding}
                  className="w-full h-full min-h-[42px] rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:pointer-events-none text-white flex items-center justify-center transition-colors"
                >
                  {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                </button>
              </div>
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
                {(() => {
                  const bucket = servicesByCategory.get(selectedCategory) ?? [];
                  return (
                    <div key={selectedCategory}>
                      <div className="px-4 py-2.5 bg-zinc-100/70 dark:bg-white/[0.05] border-y border-zinc-200/60 dark:border-white/[0.06]">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                          {selectedCategory} ({bucket.length})
                        </p>
                      </div>
                      {bucket.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">Nenhum serviço nesta categoria.</div>
                      ) : (
                        bucket.map((s) => {
                          const parsed = parseServiceName(s.name);
                          const serviceCategory = (s.category || parsed.category || baseCategory).trim();
                          const serviceHours =
                            s.labor_hours != null && Number.isFinite(Number(s.labor_hours))
                              ? String(s.labor_hours)
                              : parsed.hours || '?';
                          return (
                            <div
                              key={s.id}
                              className="min-h-[52px] flex items-center gap-3 px-4 py-3 bg-transparent hover:bg-zinc-100/60 dark:hover:bg-white/[0.04] transition-colors"
                            >
                              {editingId === s.id ? (
                                <>
                                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 flex-1 min-w-0">
                                    <input
                                      type="text"
                                      value={editingServiceName}
                                      onChange={(e) => setEditingServiceName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveEdit();
                                        if (e.key === 'Escape') cancelEdit();
                                      }}
                                      className="sm:col-span-7 min-w-0 px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[15px]"
                                      autoFocus
                                    />
                                    <input
                                      type="number"
                                      min="0.1"
                                      step="0.1"
                                      value={editingHours}
                                      onChange={(e) => setEditingHours(e.target.value)}
                                      className="sm:col-span-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[15px]"
                                    />
                                    <select
                                      value={editingCategory}
                                      onChange={(e) => setEditingCategory(e.target.value)}
                                      className="sm:col-span-3 px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[14px]"
                                    >
                                      {categories.map((c) => (
                                        <option key={c} value={c}>
                                          {c}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
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
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[16px] font-medium text-zinc-900 dark:text-white truncate">{s.name}</p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                      {serviceCategory} • {serviceHours}h
                                    </p>
                                  </div>
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
                          );
                        })
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
