import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  X,
  Package,
  Plus,
  Pencil,
  Trash2,
  Check,
  Loader2,
  Camera,
  Hash,
  SlidersHorizontal,
  Images,
  Search,
  Tags,
  ChevronDown,
} from 'lucide-react';
import { iosModalShell, iosModalClose, iosModalInsetCard } from './ui/iosModalStyles';
import { IosAccentIconSquircle } from './ui/IosAccentIconSquircle';
import { StorageThumbImg } from './ui/StorageThumbImg';
import { useRegisterModalOpen } from './ui/ModalLayerContext';
import { IosModalHeader } from './ui/IosModalHeader';
import {
  getWorkshopParts,
  createWorkshopPart,
  updateWorkshopPart,
  deleteWorkshopPart,
  uploadWorkshopPartPhoto,
  getWorkshopPartCategories,
  createWorkshopPartCategory,
  updateWorkshopPartCategory,
  deleteWorkshopPartCategory,
  setWorkshopPartCategories,
  type WorkshopPart,
  type WorkshopPartCategory,
} from '../services/apiService';
import { TechnicianPhotoEditorModal } from './TechnicianPhotoEditorModal';

interface WorkshopPartsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Carrega imagem pública (ex.: Storage) para o editor; tenta fetch CORS e, se falhar, Image + canvas. */
async function fetchImageUrlAsFileForEditor(imageUrl: string): Promise<File> {
  const withBust = (base: string) =>
    base + (base.includes('?') ? '&' : '?') + `cb=${Date.now()}`;
  const busted = withBust(imageUrl.trim());
  try {
    const res = await fetch(busted, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) throw new Error('not image');
    const type =
      blob.type.includes('jpeg') || blob.type.includes('jpg')
        ? 'image/jpeg'
        : blob.type.includes('png')
          ? 'image/png'
          : blob.type.includes('webp')
            ? 'image/webp'
            : 'image/jpeg';
    return new File([blob], 'foto_existente.jpg', { type });
  } catch {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas não disponível.'));
            return;
          }
          ctx.drawImage(img, 0, 0);
          c.toBlob(
            (b) => {
              if (b) resolve(new File([b], 'foto_existente.jpg', { type: 'image/jpeg' }));
              else reject(new Error('Falha ao gerar arquivo da imagem.'));
            },
            'image/jpeg',
            0.92
          );
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Falha ao processar imagem.'));
        }
      };
      img.onerror = () =>
        reject(
          new Error(
            'Não foi possível carregar a foto para edição. Verifique a conexão ou envie uma nova imagem pela câmera.'
          )
        );
      img.src = busted;
    });
  }
}

function normalizePartSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

export const WorkshopPartsModal: React.FC<WorkshopPartsModalProps> = ({ isOpen, onClose }) => {
  const [parts, setParts] = useState<WorkshopPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newStock, setNewStock] = useState('');
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const [newPhotoPreviewUrl, setNewPhotoPreviewUrl] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPrice, setEditingPrice] = useState('');
  const [editingStock, setEditingStock] = useState('');
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [loadingExistingPhotoId, setLoadingExistingPhotoId] = useState<string | null>(null);
  const [detailPart, setDetailPart] = useState<WorkshopPart | null>(null);
  const [partsSearchQuery, setPartsSearchQuery] = useState('');
  /** `all` | `uncategorized` | id da categoria */
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [categories, setCategories] = useState<WorkshopPartCategory[]>([]);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryCreating, setCategoryCreating] = useState(false);
  const [categoryEditingId, setCategoryEditingId] = useState<string | null>(null);
  const [categoryEditingName, setCategoryEditingName] = useState('');
  const [newProductCategoryIds, setNewProductCategoryIds] = useState<string[]>([]);
  const [partDetailCategoryIds, setPartDetailCategoryIds] = useState<string[]>([]);
  const [savingDetailCategories, setSavingDetailCategories] = useState(false);
  /** 'new' = foto para peça ainda não cadastrada; string = id da peça existente */
  const [photoEditorTarget, setPhotoEditorTarget] = useState<'new' | string | null>(null);
  const [photoEditorFile, setPhotoEditorFile] = useState<File | null>(null);
  const createPhotoInputRef = useRef<HTMLInputElement>(null);
  const createCameraInputRef = useRef<HTMLInputElement>(null);
  const editPhotoInputRef = useRef<HTMLInputElement>(null);
  const editCameraInputRef = useRef<HTMLInputElement>(null);
  const categoryFilterDropdownRef = useRef<HTMLDivElement>(null);

  const [categoryFilterMenuOpen, setCategoryFilterMenuOpen] = useState(false);

  const parseNumber = (value: string): number => {
    const n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const handleNewPartImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!f || !f.type.startsWith('image/')) return;
    setPhotoEditorTarget('new');
    setPhotoEditorFile(f);
  };

  const handleExistingPartImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    const partId = e.currentTarget.dataset.partId;
    e.target.value = '';
    if (!f || !f.type.startsWith('image/') || !partId) return;
    setPhotoEditorTarget(partId);
    setPhotoEditorFile(f);
  };

  const fetchParts = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const [list, cats] = await Promise.all([
        getWorkshopParts(),
        getWorkshopPartCategories().catch(() => [] as WorkshopPartCategory[]),
      ]);
      setParts(list);
      setCategories(cats);
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
    if (!isOpen) {
      setPartsSearchQuery('');
      setCategoryFilter('all');
      setCategoryFilterMenuOpen(false);
      setIsCategoriesModalOpen(false);
      setNewCategoryName('');
      setCategoryEditingId(null);
      setCategoryEditingName('');
    }
  }, [isOpen]);

  /** Evita filtro preso em categoria que foi excluída. */
  useEffect(() => {
    if (categoryFilter === 'all' || categoryFilter === 'uncategorized') return;
    if (categories.some((c) => c.id === categoryFilter)) return;
    setCategoryFilter('all');
    setCategoryFilterMenuOpen(false);
  }, [categories, categoryFilter]);

  useEffect(() => {
    if (!detailPart) {
      setPartDetailCategoryIds([]);
      return;
    }
    setPartDetailCategoryIds([...(detailPart.category_ids ?? [])]);
  }, [detailPart]);

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
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setDetailPart(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailPart]);

  useEffect(() => {
    if (!newPhoto) {
      setNewPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(newPhoto);
    setNewPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [newPhoto]);

  const resetNewProductDraft = useCallback(() => {
    setNewName('');
    setNewPrice('');
    setNewStock('');
    setNewPhoto(null);
    setPhotoEditorFile(null);
    setPhotoEditorTarget(null);
    setNewProductCategoryIds([]);
  }, []);

  const closeAddProductModal = useCallback(() => {
    setIsAddProductModalOpen(false);
    resetNewProductDraft();
  }, [resetNewProductDraft]);

  useEffect(() => {
    if (!isAddProductModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (photoEditorFile) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeAddProductModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAddProductModalOpen, closeAddProductModal, photoEditorFile]);

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
      if (newProductCategoryIds.length > 0) {
        created = await setWorkshopPartCategories(created.id, newProductCategoryIds);
      }
      setParts((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setIsAddProductModalOpen(false);
      resetNewProductDraft();
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

  const openExistingPartPhotoInEditor = async (p: WorkshopPart) => {
    const url = p.photo_url?.trim();
    if (!url) return;
    setLoadingExistingPhotoId(p.id);
    setError(null);
    try {
      const file = await fetchImageUrlAsFileForEditor(url);
      setPhotoEditorTarget(p.id);
      setPhotoEditorFile(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir a foto para edição.');
    } finally {
      setLoadingExistingPhotoId(null);
    }
  };

  const partsInCategoryScope = useMemo(() => {
    if (categoryFilter === 'all') return parts;
    if (categoryFilter === 'uncategorized') {
      return parts.filter((p) => !(p.category_ids && p.category_ids.length > 0));
    }
    return parts.filter((p) => p.category_ids?.includes(categoryFilter));
  }, [parts, categoryFilter]);

  const filteredParts = useMemo(() => {
    const raw = partsSearchQuery.trim();
    if (!raw) return partsInCategoryScope;
    const q = normalizePartSearch(raw);
    if (!q) return partsInCategoryScope;
    return partsInCategoryScope.filter((p) => {
      const name = normalizePartSearch(p.name || '');
      const id = (p.id || '').toLowerCase();
      const price = String(p.unit_price ?? '').replace(',', '.');
      const stock = String(p.stock_qty ?? '').replace(',', '.');
      const catNames = (p.category_ids ?? [])
        .map((cid) => categories.find((c) => c.id === cid)?.name)
        .filter(Boolean)
        .join(' ');
      return (
        name.includes(q) ||
        id.includes(raw.toLowerCase().replace(/\s/g, '')) ||
        normalizePartSearch(price).includes(q) ||
        stock.replace(/\s/g, '').includes(raw.replace(/\s/g, '').replace(',', '.')) ||
        normalizePartSearch(catNames).includes(q)
      );
    });
  }, [partsInCategoryScope, partsSearchQuery, categories]);

  const categoryLineForPart = useCallback(
    (p: WorkshopPart) => {
      const names = (p.category_ids ?? [])
        .map((cid) => categories.find((c) => c.id === cid)?.name)
        .filter(Boolean) as string[];
      if (names.length === 0) return null;
      return names.join(' · ');
    },
    [categories]
  );

  const toggleNewProductCategory = (id: string) => {
    setNewProductCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleDetailCategory = (id: string) => {
    setPartDetailCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSaveDetailCategories = async () => {
    if (!detailPart) return;
    setSavingDetailCategories(true);
    setError(null);
    try {
      const updated = await setWorkshopPartCategories(detailPart.id, partDetailCategoryIds);
      setParts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setDetailPart(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar categorias.');
    } finally {
      setSavingDetailCategories(false);
    }
  };

  const handleCreateCategory = async () => {
    const n = newCategoryName.trim();
    if (!n || categoryCreating) return;
    setCategoryCreating(true);
    setError(null);
    try {
      const c = await createWorkshopPartCategory({ name: n });
      setCategories((prev) => [...prev, c].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
      setNewCategoryName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar categoria.');
    } finally {
      setCategoryCreating(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!window.confirm('Excluir esta categoria? Os produtos não serão apagados; apenas o vínculo com a categoria.')) return;
    setError(null);
    try {
      await deleteWorkshopPartCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setParts((prev) =>
        prev.map((p) => ({
          ...p,
          category_ids: (p.category_ids ?? []).filter((cid) => cid !== id),
        }))
      );
      setPartDetailCategoryIds((prev) => prev.filter((cid) => cid !== id));
      setNewProductCategoryIds((prev) => prev.filter((cid) => cid !== id));
      if (categoryFilter === id) setCategoryFilter('all');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir categoria.');
    }
  };

  const saveCategoryRename = async () => {
    if (!categoryEditingId) return;
    const trimmed = categoryEditingName.trim();
    if (!trimmed) return;
    setError(null);
    try {
      const updated = await updateWorkshopPartCategory(categoryEditingId, { name: trimmed });
      setCategories((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      );
      setCategoryEditingId(null);
      setCategoryEditingName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao renomear categoria.');
    }
  };

  const closeCategoriesModal = useCallback(() => {
    setIsCategoriesModalOpen(false);
    setNewCategoryName('');
    setCategoryEditingId(null);
    setCategoryEditingName('');
  }, []);

  useEffect(() => {
    if (!isCategoriesModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeCategoriesModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isCategoriesModalOpen, closeCategoriesModal]);

  useEffect(() => {
    if (!categoryFilterMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = categoryFilterDropdownRef.current;
      if (el && !el.contains(e.target as Node)) setCategoryFilterMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setCategoryFilterMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [categoryFilterMenuOpen]);

  const categoryFilterLabel = useMemo(() => {
    if (categoryFilter === 'all') return 'Todos os produtos';
    if (categoryFilter === 'uncategorized') return 'Sem categoria';
    return categories.find((c) => c.id === categoryFilter)?.name ?? 'Categoria';
  }, [categoryFilter, categories]);

  useEffect(() => {
    if (!editingId) return;
    if (!filteredParts.some((p) => p.id === editingId)) {
      setEditingId(null);
      setEditingName('');
      setEditingPrice('');
      setEditingStock('');
    }
  }, [filteredParts, editingId]);

  useRegisterModalOpen(isOpen);

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

    <div className="fixed inset-0 z-[100] flex h-[100dvh] max-h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-black/45 backdrop-blur-[20px] p-0">
      <div
        className={`${iosModalShell} relative flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden rounded-none border-0 shadow-none sm:rounded-none`}
      >
        <button
          type="button"
          onClick={onClose}
          className={`${iosModalClose} top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))]`}
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="px-6 sm:px-8 pt-[max(2rem,env(safe-area-inset-top)+0.75rem)] pb-4 pr-14 shrink-0">
            <IosModalHeader
              icon={<img src="/icons/estoque-ios.png" alt="" className="h-full w-full min-h-0 object-cover" />}
              title="Estoque de peças"
              subtitle="Preço, quantidade e foto para orçamentos"
              gradientClass="from-emerald-500 to-teal-700"
            />
          </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 sm:px-8 pb-[max(2rem,env(safe-area-inset-bottom))] custom-scrollbar">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 sm:max-w-xl">
              Gerencie preço e estoque. Use <span className="font-medium text-zinc-600 dark:text-zinc-300">Categorias</span> para
              organizar o catálogo. Use <span className="font-medium text-zinc-600 dark:text-zinc-300">Adicionar produto</span> para
              cadastrar. Para <span className="font-medium text-zinc-600 dark:text-zinc-300">foto e ajustes</span>, abra o item tocando
              no nome.
            </p>
            <div className="flex flex-wrap gap-2 justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsCategoriesModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-300 dark:border-white/15 bg-white dark:bg-white/5 px-4 py-3 text-[15px] font-semibold text-zinc-800 dark:text-white hover:bg-zinc-50 dark:hover:bg-white/10 transition-colors"
              >
                <Tags className="w-5 h-5" />
                Categorias
              </button>
              <button
                type="button"
                onClick={() => setIsAddProductModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-[15px] font-semibold text-white shadow-md shadow-emerald-900/20 hover:bg-emerald-500 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Adicionar produto
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className={`overflow-visible ${iosModalInsetCard}`}>
            {!loading && parts.length > 0 && (
              <div className="border-b border-zinc-200/50 dark:border-white/[0.06] bg-zinc-50/40 dark:bg-white/[0.02] px-3 py-3 sm:px-4 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
                  <div ref={categoryFilterDropdownRef} className="relative z-20 w-full sm:w-[min(100%,280px)] shrink-0">
                    <span id="workshop-parts-category-filter-label" className="sr-only">
                      Filtrar por categoria
                    </span>
                    <button
                      type="button"
                      id="workshop-parts-category-filter"
                      aria-haspopup="listbox"
                      aria-expanded={categoryFilterMenuOpen}
                      aria-controls="workshop-parts-category-listbox"
                      onClick={() => setCategoryFilterMenuOpen((open) => !open)}
                      className="flex w-full min-h-[46px] items-center justify-between gap-2 rounded-xl border border-zinc-200/90 dark:border-white/[0.12] bg-white/95 dark:bg-zinc-950/90 py-2.5 pl-3 pr-2 text-left text-[15px] font-semibold text-zinc-900 dark:text-white shadow-sm dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50 transition-colors"
                    >
                      <span className="min-w-0 truncate">{categoryFilterLabel}</span>
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 text-zinc-500 transition-transform duration-200 ${
                          categoryFilterMenuOpen ? 'rotate-180' : ''
                        }`}
                        aria-hidden
                      />
                    </button>
                    {categoryFilterMenuOpen ? (
                      <ul
                        id="workshop-parts-category-listbox"
                        role="listbox"
                        aria-label="Opções de filtro por categoria"
                        className="absolute left-0 right-0 top-full z-[60] mt-1.5 max-h-[min(280px,45vh)] overflow-y-auto rounded-xl border border-zinc-200/90 dark:border-white/[0.14] bg-white dark:bg-zinc-900 py-1.5 shadow-xl shadow-zinc-900/12 dark:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.65)] ring-1 ring-zinc-900/5 dark:ring-white/10"
                      >
                        {(
                          [
                            { value: 'all' as const, label: 'Todos os produtos' },
                            { value: 'uncategorized' as const, label: 'Sem categoria' },
                            ...categories.map((c) => ({ value: c.id as string, label: c.name })),
                          ] as { value: string; label: string }[]
                        ).map((opt) => {
                          const selected = categoryFilter === opt.value;
                          return (
                            <li key={opt.value} role="none">
                              <button
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onClick={() => {
                                  setCategoryFilter(opt.value);
                                  setCategoryFilterMenuOpen(false);
                                }}
                                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[15px] transition-colors ${
                                  selected
                                    ? 'bg-emerald-500/14 font-semibold text-emerald-950 dark:bg-emerald-400/18 dark:text-emerald-50'
                                    : 'font-medium text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-white/[0.08]'
                                }`}
                              >
                                <span className="min-w-0 truncate">{opt.label}</span>
                                {selected ? (
                                  <Check
                                    className="h-4 w-4 shrink-0 text-emerald-600"
                                    strokeWidth={2.5}
                                    aria-hidden
                                  />
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                  <div className="relative flex-1 min-w-0">
                    <label htmlFor="workshop-parts-search" className="sr-only">
                      Pesquisar peças
                    </label>
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                      aria-hidden
                    />
                    <input
                      id="workshop-parts-search"
                      type="search"
                      value={partsSearchQuery}
                      onChange={(e) => setPartsSearchQuery(e.target.value)}
                      placeholder="Pesquisar nesta seleção (nome, preço, categorias…)"
                      autoComplete="off"
                      className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 py-2.5 pl-10 pr-10 text-[15px] text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-500/50"
                    />
                    {partsSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => setPartsSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200/80 dark:text-zinc-400 dark:hover:bg-white/10"
                        aria-label="Limpar pesquisa"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
            <div className="hidden md:grid md:grid-cols-[4fr_1fr_1fr_auto_auto] md:gap-3 px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-zinc-200/40 dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.03]">
              <span className="min-w-0">Nome da peça</span>
              <span className="text-right tabular-nums">Preço</span>
              <span className="text-right tabular-nums">Quantidade</span>
              <span className="text-center justify-self-center">Editar</span>
              <span className="text-center justify-self-center">Excluir</span>
            </div>
            <div className="md:hidden px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-zinc-200/40 dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.03]">
              Lista de peças
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-zinc-500 dark:text-zinc-400">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : parts.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <p className="text-[15px] text-zinc-500 dark:text-zinc-400">Nenhuma peça cadastrada.</p>
                <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1">
                  Toque em <span className="font-medium text-zinc-600 dark:text-zinc-300">Adicionar produto</span> para incluir a primeira
                  peça.
                </p>
              </div>
            ) : partsInCategoryScope.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <p className="text-[15px] text-zinc-500 dark:text-zinc-400">Nenhum produto nesta seleção.</p>
                <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1">
                  Escolha{' '}
                  <button
                    type="button"
                    className="font-medium text-emerald-600 dark:text-emerald-400 underline hover:brightness-110"
                    onClick={() => {
                      setCategoryFilter('all');
                      setPartsSearchQuery('');
                      setCategoryFilterMenuOpen(false);
                    }}
                  >
                    Todos os produtos
                  </button>{' '}
                  no filtro acima, ou outra categoria, ou vincule produtos em{' '}
                  <button
                    type="button"
                    className="font-medium text-emerald-600 dark:text-emerald-400 underline hover:brightness-110"
                    onClick={() => setIsCategoriesModalOpen(true)}
                  >
                    Categorias
                  </button>{' '}
                  / detalhe do item.
                </p>
                <button
                  type="button"
                  className="mt-3 text-[14px] font-semibold text-emerald-600 dark:text-emerald-400 underline hover:brightness-110"
                  onClick={() => {
                    setCategoryFilter('all');
                    setPartsSearchQuery('');
                    setCategoryFilterMenuOpen(false);
                  }}
                >
                  Ver todos os produtos
                </button>
              </div>
            ) : filteredParts.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <p className="text-[15px] text-zinc-500 dark:text-zinc-400">Nenhum resultado para a pesquisa nesta seleção.</p>
                <p className="text-[13px] text-zinc-400 dark:text-zinc-500 mt-1">
                  Ajuste os termos ou{' '}
                  <button
                    type="button"
                    className="font-medium text-emerald-600 dark:text-emerald-400 underline"
                    onClick={() => setPartsSearchQuery('')}
                  >
                    limpar a busca
                  </button>
                  .
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-200/50 dark:divide-white/[0.06]">
                {filteredParts.map((p) => {
                  const catLine = categoryLineForPart(p);
                  return (
                  <div
                    key={p.id}
                    className="min-h-[52px] flex flex-wrap items-center gap-3 px-4 py-3 bg-transparent hover:bg-zinc-100/60 dark:hover:bg-white/[0.04] transition-colors md:grid md:grid-cols-[4fr_1fr_1fr_auto_auto] md:flex-nowrap md:gap-3 md:items-center"
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
                            className="w-9 h-9 shrink-0 rounded-lg bg-zinc-200 dark:bg-white/10 text-zinc-600 flex items-center justify-center justify-self-center hover:bg-zinc-300 dark:hover:bg-white/20"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <span className="hidden md:block" aria-hidden />
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setDetailPart(p)}
                          className="w-full min-w-0 flex flex-[1_1_100%] items-center gap-3 text-left rounded-xl -my-1 -ml-2 pl-2 pr-2 py-1.5 hover:bg-zinc-200/70 dark:hover:bg-white/[0.07] transition-colors cursor-pointer md:col-span-1 md:flex-[unset] md:w-auto"
                          title="Abrir produto — foto e ajustes"
                        >
                          <div className="w-10 h-10 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5 overflow-hidden shrink-0 pointer-events-none">
                            {p.photo_url ? (
                              <StorageThumbImg
                                src={p.photo_url}
                                alt=""
                                className="h-full w-full object-cover"
                                thumbMaxWidth={64}
                                thumbMaxHeight={64}
                                thumbResize="cover"
                                thumbQuality={32}
                              />
                            ) : null}
                          </div>
                          <span className="min-w-0 flex flex-col gap-0.5 text-left">
                            <span className="text-[16px] font-medium text-zinc-900 dark:text-white truncate">{p.name}</span>
                            {catLine ? (
                              <span className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{catLine}</span>
                            ) : null}
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
                          className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center justify-self-center text-zinc-500 hover:text-brand-yellow hover:bg-brand-yellow/10 transition-colors"
                          aria-label="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center justify-self-center text-zinc-500 hover:text-red-600 hover:bg-red-500/10 transition-colors"
                          aria-label="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>

    {isAddProductModalOpen && (
      <div
        className="fixed inset-0 z-[115] flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-[12px]"
        onClick={closeAddProductModal}
        role="presentation"
      >
        <div
          className={`${iosModalShell} w-full max-w-lg md:max-w-3xl xl:max-w-4xl max-h-[92vh] overflow-y-auto`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="workshop-add-product-title"
        >
          <button type="button" onClick={closeAddProductModal} className={iosModalClose} aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
          <p id="workshop-add-product-title" className="sr-only">
            Cadastrar novo produto no estoque
          </p>
          <div className="px-6 sm:px-8 pt-8 pb-4 pr-14 shrink-0 border-b border-zinc-200/50 dark:border-white/[0.06]">
            <IosModalHeader
              icon={<img src="/icons/estoque-ios.png" alt="" className="h-full w-full min-h-0 object-cover" />}
              title="Novo produto"
              subtitle="Preço, estoque e foto"
              gradientClass="from-emerald-500 to-teal-700"
            />
          </div>
          <div className="px-6 sm:px-8 py-5 border-b border-zinc-200/50 dark:border-white/[0.06] bg-gradient-to-b from-emerald-500/[0.06] to-transparent dark:from-emerald-400/[0.08]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700/90 dark:text-emerald-400/90 mb-2">
              Nome do produto
            </p>
            {newName.trim() ? (
              <p className="text-[1.5rem] sm:text-[1.875rem] font-bold tracking-tight text-zinc-900 dark:text-white leading-[1.2] break-words">
                {newName.trim()}
              </p>
            ) : (
              <p className="text-[1.125rem] sm:text-[1.25rem] text-zinc-400 dark:text-zinc-500 leading-snug">
                Digite abaixo — o nome aparecerá aqui em destaque
              </p>
            )}
          </div>
          <div className="px-6 sm:px-8 py-6">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Definir nome
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex.: Sensor ABS"
                    className="w-full min-w-0 px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-500/50"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
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
                      className="w-full min-w-0 px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-[15px] tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-500/50"
                    />
                  </div>
                  <div className="space-y-1.5">
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
                      className="w-full min-w-0 px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-[15px] tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/35 focus:border-emerald-500/50"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Pré-visualização</p>
                <div className="mx-auto w-full max-w-[280px] md:max-w-none md:mx-0">
                  <div className="aspect-square w-full rounded-[22px] border border-zinc-200/80 dark:border-white/[0.08] bg-zinc-100 dark:bg-white/[0.05] overflow-hidden flex items-center justify-center">
                    {newPhotoPreviewUrl ? (
                      <img src={newPhotoPreviewUrl} alt="Prévia da foto do produto" className="h-full w-full object-cover" />
                    ) : (
                      <Package className="w-16 h-16 text-zinc-300 sm:w-20 sm:h-20" strokeWidth={1.25} />
                    )}
                  </div>
                </div>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 text-center md:text-left">
                  A foto passa pelo editor (recorte quadrado) antes de ser usada.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
                  <button
                    type="button"
                    onClick={() => createPhotoInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl bg-zinc-700 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-zinc-600 transition-colors"
                  >
                    <Images className="w-4 h-4" />
                    Galeria
                  </button>
                  <button
                    type="button"
                    onClick={() => createCameraInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-emerald-500 transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    Câmera
                  </button>
                  {newPhoto ? (
                    <button
                      type="button"
                      onClick={() => setNewPhoto(null)}
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-white/15 bg-transparent px-4 py-2.5 text-[14px] font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
                    >
                      Remover foto
                    </button>
                  ) : null}
                </div>
                <input
                  ref={createPhotoInputRef}
                  type="file"
                  accept="image/*,.png,.jpg,.jpeg,.webp,.heic,.heif"
                  className="hidden"
                  onChange={handleNewPartImageSelected}
                />
                <input
                  ref={createCameraInputRef}
                  type="file"
                  accept="image/*,.png,.jpg,.jpeg,.webp,.heic,.heif"
                  className="hidden"
                  onChange={handleNewPartImageSelected}
                />
              </div>
            </div>
            {categories.length > 0 ? (
              <div className="mt-6 pt-6 border-t border-zinc-200/50 dark:border-white/[0.06] space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Categorias (opcional)
                </p>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                  Marque em quais grupos este produto deve aparecer ao filtrar a lista.
                </p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <label
                      key={c.id}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50/80 dark:bg-white/[0.04] px-3 py-2 text-[14px] text-zinc-800 dark:text-zinc-200 has-[:checked]:border-emerald-500/50 has-[:checked]:bg-emerald-500/10 dark:has-[:checked]:bg-emerald-500/15"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-zinc-300 dark:border-white/20 text-emerald-600 focus:ring-emerald-500/40"
                        checked={newProductCategoryIds.includes(c.id)}
                        onChange={() => toggleNewProductCategory(c.id)}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-8 flex flex-col-reverse gap-3 border-t border-zinc-200/50 dark:border-white/[0.06] pt-6 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeAddProductModal}
                disabled={adding}
                className="rounded-2xl px-5 py-3 text-[15px] font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={!newName.trim() || adding}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-yellow px-6 py-3 text-[15px] font-semibold text-black hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none transition-[filter]"
              >
                {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                Salvar produto
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {detail && (
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-[12px]"
        onClick={() => setDetailPart(null)}
      >
        <div
          className={`${iosModalShell} w-full max-w-[min(96vw,720px)] sm:max-w-[min(94vw,900px)] lg:max-w-[min(92vw,1100px)] max-h-[92vh] overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgb(200_200_204/0.7)_transparent] dark:[scrollbar-color:rgba(255,255,255,0.22)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300/45 [&::-webkit-scrollbar-thumb]:hover:bg-zinc-400/55 dark:[&::-webkit-scrollbar-thumb]:bg-white/12 dark:[&::-webkit-scrollbar-thumb]:hover:bg-white/22`}
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
          <div className="px-6 sm:px-8 pt-8 pb-5 pr-14 shrink-0 border-b border-zinc-200/50 dark:border-white/[0.06] bg-gradient-to-b from-emerald-500/[0.07] to-transparent dark:from-emerald-400/[0.09]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <IosAccentIconSquircle variant="page" strokeWidth={2.2}>
                <img src="/icons/estoque-ios.png" alt="" className="h-full w-full object-cover" />
              </IosAccentIconSquircle>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700/90 dark:text-emerald-400/90 mb-1.5">
                  Produto no estoque
                </p>
                <h2 className="text-[1.65rem] sm:text-[2.125rem] font-bold tracking-tight text-zinc-900 dark:text-white leading-[1.12] break-words">
                  {detail.name}
                </h2>
              </div>
            </div>
          </div>
          <div className="px-6 sm:px-8 py-6 space-y-5">
            <div className="flex justify-center sm:justify-start">
              <div className="w-full max-w-[min(100%,190px)] sm:max-w-[min(100%,220px)] aspect-square rounded-[22px] border border-zinc-200/80 dark:border-white/[0.08] bg-zinc-100 dark:bg-white/[0.05] overflow-hidden flex items-center justify-center">
                {detail.photo_url ? (
                  <StorageThumbImg
                    src={detail.photo_url}
                    alt={detail.name}
                    className="h-full w-full object-cover"
                    thumbMaxWidth={256}
                    thumbMaxHeight={256}
                    thumbResize="cover"
                    thumbQuality={40}
                    loading="eager"
                    fetchPriority="high"
                  />
                ) : (
                  <Package className="w-10 h-10 text-zinc-300" strokeWidth={1.25} />
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
            {categories.length > 0 ? (
              <div className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/50 dark:bg-white/[0.03] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Tags className="w-4 h-4 text-emerald-600" aria-hidden />
                  <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                    Categorias deste produto
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <label
                      key={c.id}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-[14px] text-zinc-800 dark:text-zinc-200 has-[:checked]:border-emerald-500/50 has-[:checked]:bg-emerald-500/10 dark:has-[:checked]:bg-emerald-500/15"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-zinc-300 dark:border-white/20 text-emerald-600 focus:ring-emerald-500/40"
                        checked={partDetailCategoryIds.includes(c.id)}
                        onChange={() => toggleDetailCategory(c.id)}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void handleSaveDetailCategories()}
                  disabled={savingDetailCategories}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                >
                  {savingDetailCategories ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar categorias
                </button>
              </div>
            ) : (
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                Crie categorias em <span className="font-medium text-zinc-700 dark:text-zinc-300">Categorias</span> no estoque para
                organizar este produto.
              </p>
            )}
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
                  if (!editPhotoInputRef.current || !detail) return;
                  editPhotoInputRef.current.dataset.partId = detail.id;
                  editPhotoInputRef.current.click();
                }}
                disabled={uploadingPhotoId === detail.id || loadingExistingPhotoId === detail.id}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-200 dark:bg-white/10 px-4 py-3 text-[15px] font-semibold text-zinc-900 dark:text-white hover:bg-zinc-300 dark:hover:bg-white/15 transition-colors disabled:opacity-50"
              >
                {uploadingPhotoId === detail.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Images className="w-4 h-4" />
                )}
                Galeria
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!editCameraInputRef.current || !detail) return;
                  editCameraInputRef.current.dataset.partId = detail.id;
                  editCameraInputRef.current.click();
                }}
                disabled={uploadingPhotoId === detail.id || loadingExistingPhotoId === detail.id}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 px-4 py-3 text-[15px] font-semibold text-white transition-colors disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                Câmera
              </button>
              {detail.photo_url ? (
                <button
                  type="button"
                  onClick={() => void openExistingPartPhotoInEditor(detail)}
                  disabled={loadingExistingPhotoId === detail.id || uploadingPhotoId === detail.id}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-300/80 dark:border-violet-500/40 bg-violet-50 dark:bg-violet-950/40 px-4 py-3 text-[15px] font-semibold text-violet-800 dark:text-violet-200 hover:bg-violet-100 dark:hover:bg-violet-950/60 transition-colors disabled:opacity-50"
                >
                  {loadingExistingPhotoId === detail.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <SlidersHorizontal className="w-4 h-4" />
                  )}
                  Ajustar foto
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => handleDelete(detail.id)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-300 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-[15px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Excluir
              </button>
            </div>
            <input
              ref={editPhotoInputRef}
              type="file"
              accept="image/*,.png,.jpg,.jpeg,.webp,.heic,.heif"
              className="hidden"
              onChange={handleExistingPartImageSelected}
            />
            <input
              ref={editCameraInputRef}
              type="file"
              accept="image/*,.png,.jpg,.jpeg,.webp,.heic,.heif"
              className="hidden"
              onChange={handleExistingPartImageSelected}
            />
          </div>
        </div>
      </div>
    )}

    {isCategoriesModalOpen && (
      <div
        className="fixed inset-0 z-[118] flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-[12px]"
        onClick={closeCategoriesModal}
        role="presentation"
      >
        <div
          className={`${iosModalShell} w-full max-w-lg max-h-[88vh] overflow-hidden flex flex-col`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="workshop-part-categories-title"
        >
          <button type="button" onClick={closeCategoriesModal} className={iosModalClose} aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
          <p id="workshop-part-categories-title" className="sr-only">
            Categorias do estoque
          </p>
          <div className="px-6 sm:px-8 pt-8 pb-4 pr-14 shrink-0 border-b border-zinc-200/50 dark:border-white/[0.06]">
            <IosModalHeader
              icon={<img src="/icons/estoque-ios.png" alt="" className="h-full w-full min-h-0 object-cover" />}
              title="Categorias do estoque"
              subtitle="Grupos para filtrar e organizar produtos"
              gradientClass="from-emerald-500 to-teal-700"
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 py-5 space-y-4">
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
              Crie categorias e depois vincule cada produto pelo detalhe do item ou ao cadastrar. Excluir uma categoria não apaga produtos.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleCreateCategory();
                  }
                }}
                placeholder="Nome da nova categoria"
                className="flex-1 min-w-0 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-[15px] text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/35"
              />
              <button
                type="button"
                onClick={() => void handleCreateCategory()}
                disabled={!newCategoryName.trim() || categoryCreating}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-[15px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
              >
                {categoryCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                Criar
              </button>
            </div>
            <ul className="divide-y divide-zinc-200/60 dark:divide-white/[0.08] rounded-xl border border-zinc-200/60 dark:border-white/[0.08] overflow-hidden">
              {categories.length === 0 ? (
                <li className="px-4 py-8 text-center text-[14px] text-zinc-500 dark:text-zinc-400">Nenhuma categoria ainda.</li>
              ) : (
                categories.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-2 px-4 py-3 bg-zinc-50/30 dark:bg-white/[0.02] hover:bg-zinc-100/50 dark:hover:bg-white/[0.04]"
                  >
                    {categoryEditingId === c.id ? (
                      <>
                        <input
                          type="text"
                          value={categoryEditingName}
                          onChange={(e) => setCategoryEditingName(e.target.value)}
                          className="flex-1 min-w-[120px] rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-[15px] text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/35"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => void saveCategoryRename()}
                          className="w-9 h-9 shrink-0 rounded-lg bg-brand-yellow text-black flex items-center justify-center hover:brightness-110"
                          aria-label="Confirmar nome"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCategoryEditingId(null);
                            setCategoryEditingName('');
                          }}
                          className="w-9 h-9 shrink-0 rounded-lg bg-zinc-200 dark:bg-white/10 flex items-center justify-center"
                          aria-label="Cancelar edição"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 min-w-0 text-[15px] font-medium text-zinc-900 dark:text-white truncate">{c.name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCategoryEditingId(c.id);
                            setCategoryEditingName(c.name);
                          }}
                          className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-200 dark:hover:bg-white/10"
                          aria-label="Renomear"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCategory(c.id)}
                          className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-zinc-500 hover:text-red-600 hover:bg-red-500/10"
                          aria-label="Excluir categoria"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

