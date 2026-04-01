import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Wrench, Plus, Pencil, Trash2, Check, Loader2, Clock3, Tag } from 'lucide-react';
import { iosModalOverlay, iosModalShell, iosModalClose, iosModalInsetCard } from './ui/iosModalStyles';
import { IosModalHeader } from './ui/IosModalHeader';
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
    <div className={iosModalOverlay}>
      <div className={`${iosModalShell} w-full max-w-[95vw] h-[94vh] max-h-[94vh]`}>
        <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="px-6 sm:px-8 pt-8 pb-4 pr-14 shrink-0">
            <IosModalHeader
              icon={<Wrench className="w-6 h-6 text-white" strokeWidth={2.2} />}
              title="Serviços da oficina"
              subtitle="Categorias, horas e itens para orçamento"
              gradientClass="from-amber-500 to-orange-600"
            />
          </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 pb-8">
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-4">
            Organize serviços por categoria de veículo e defina horas padrão. Isso facilita a seleção no orçamento.
          </p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className={`overflow-hidden mb-4 ${iosModalInsetCard}`}>
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
            <div className="hidden md:grid grid-cols-12 gap-2 px-3 pt-1 pb-0 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-transparent">
              <span className="col-span-8 pl-1">Serviço</span>
              <span className="col-span-2 text-center">Horas</span>
              <span className="col-span-2 text-right pr-1">Adicionar</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-2 p-3 border-b border-zinc-200/50 dark:border-white/[0.06] items-center">
              <div className="md:col-span-8">
                <label className="md:sr-only text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1 block">
                  Serviço
                </label>
                <input
                  type="text"
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  placeholder={`Novo serviço para ${selectedCategory}`}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 text-[15px] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>
              <div className="md:col-span-2">
                <label className="md:sr-only text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1 block">
                  Horas
                </label>
                <div className="relative w-full md:max-w-[7.5rem] md:mx-auto">
                  <Clock3 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={newHours}
                    onChange={(e) => setNewHours(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    placeholder="Horas"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[15px] tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                </div>
              </div>
              <div className="md:col-span-2 flex justify-stretch md:justify-end">
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!newServiceName.trim() || !newHours.trim() || adding}
                  title="Adicionar serviço"
                  aria-label="Adicionar serviço"
                  className="h-[42px] w-full md:w-[42px] md:shrink-0 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:pointer-events-none text-white flex items-center justify-center transition-colors"
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
                        <>
                          <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-zinc-200/40 dark:border-white/[0.06]">
                            <span className="col-span-8 pl-1">Serviço</span>
                            <span className="col-span-2 text-center">Horas</span>
                            <span className="col-span-2 text-right pr-1">Ações</span>
                          </div>
                          {bucket.map((s) => {
                          const parsed = parseServiceName(s.name);
                          const serviceCategory = (s.category || parsed.category || baseCategory).trim();
                          const serviceHours =
                            s.labor_hours != null && Number.isFinite(Number(s.labor_hours))
                              ? String(s.labor_hours)
                              : parsed.hours || '?';
                          const displayTitle =
                            (parsed.title || '').trim() || (s.name || '').trim();
                          return (
                            <div
                              key={s.id}
                              className="min-h-[52px] px-4 py-3 bg-transparent hover:bg-zinc-100/60 dark:hover:bg-white/[0.04] transition-colors"
                            >
                              {editingId === s.id ? (
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-2 items-center">
                                  <input
                                    type="text"
                                    value={editingServiceName}
                                    onChange={(e) => setEditingServiceName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveEdit();
                                      if (e.key === 'Escape') cancelEdit();
                                    }}
                                    className="md:col-span-8 min-w-0 px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[15px]"
                                    autoFocus
                                  />
                                  <input
                                    type="number"
                                    min="0.1"
                                    step="0.1"
                                    value={editingHours}
                                    onChange={(e) => setEditingHours(e.target.value)}
                                    className="md:col-span-2 min-w-0 px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[15px] tabular-nums text-right md:max-w-[7.5rem] md:mx-auto w-full"
                                  />
                                  <div className="md:col-span-2 flex flex-wrap items-center gap-1 justify-stretch md:justify-end min-w-0">
                                    <select
                                      value={editingCategory}
                                      onChange={(e) => setEditingCategory(e.target.value)}
                                      className="min-w-0 flex-1 md:flex-1 md:min-w-0 px-2 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-[13px]"
                                    >
                                      {categories.map((c) => (
                                        <option key={c} value={c}>
                                          {c}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={handleSaveEdit}
                                      className="w-9 h-9 shrink-0 rounded-lg bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEdit}
                                      className="w-9 h-9 shrink-0 rounded-lg bg-zinc-200 dark:bg-white/10 text-zinc-600 dark:text-zinc-400 flex items-center justify-center hover:bg-zinc-300 dark:hover:bg-white/20"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-2 items-center">
                                  <div className="md:col-span-8 min-w-0">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 md:hidden mb-0.5">
                                      Serviço
                                    </p>
                                    <p className="text-[16px] font-medium text-zinc-900 dark:text-white truncate">
                                      {displayTitle}
                                    </p>
                                    {serviceCategory !== selectedCategory ? (
                                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                                        {serviceCategory}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="md:col-span-2 flex flex-row md:flex-col items-center justify-between md:justify-center gap-2 min-h-[2.25rem]">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 md:hidden shrink-0">
                                      Horas
                                    </p>
                                    <span className="text-[16px] font-semibold tabular-nums text-zinc-900 dark:text-white md:min-w-[4.5rem] md:text-center">
                                      {serviceHours}h
                                    </span>
                                  </div>
                                  <div className="md:col-span-2 flex justify-end gap-1">
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
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        </>
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
    </div>
  );
};
