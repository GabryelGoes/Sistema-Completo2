import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  X,
  Package,
  Plus,
  Pencil,
  Trash2,
  Check,
  Loader2,
  Search,
  Tags,
  ChevronDown,
  AlertTriangle,
  PackageX,
  Clock,
  History,
} from 'lucide-react';
import { iosModalShell, iosModalClose, iosModalInsetCard } from './ui/iosModalStyles';
import { IosAccentIconSquircle } from './ui/IosAccentIconSquircle';

import {
  WORKSHOP_PART_LEGACY_COVER_ID,
  workshopPartPhotosToSlots,
  workshopPartToPhotoSlots,
} from '../utils/workshopPartPhotoSlots';
import { ModalPortal } from './ui/ModalPortal';
import { PartPhotoImg } from './ui/PartPhotoImg';
import { RegistrationPortal } from './ui/RegistrationPortal';
import { useBrowserBackLayer } from './ui/BackNavigationContext';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import {
  desktopShellNestedOverlayClass,
  desktopShellViewportOverlayClass,
} from '../utils/desktopShellOverlay';
import { IosModalHeader } from './ui/IosModalHeader';
import {
  getWorkshopParts,
  createWorkshopPart,
  updateWorkshopPart,
  deleteWorkshopPart,
  uploadWorkshopPartPhoto,
  getWorkshopPartPhotos,
  deleteWorkshopPartPhoto,
  WORKSHOP_PART_PHOTOS_MAX,
  getWorkshopPartCategories,
  createWorkshopPartCategory,
  updateWorkshopPartCategory,
  deleteWorkshopPartCategory,
  setWorkshopPartCategories,
  getWorkshopPartPurchases,
  createWorkshopPartPurchase,
  updateWorkshopPartPurchase,
  deleteWorkshopPartPurchase,
  type WorkshopPart,
  type WorkshopPartCategory,
  type WorkshopPartPurchase,
} from '../services/apiService';
import { TechnicianPhotoEditorModal } from './TechnicianPhotoEditorModal';
import {
  WorkshopPartRegistrationForm,
  type PartPhotoSlot,
} from './WorkshopPartRegistrationForm';
import { WorkshopPartDetailView } from './WorkshopPartDetailView';
import {
  formValuesToApiPayload,
  purchaseDraftToPayload,
  purchaseToDraft,
  type WorkshopPartFormValues,
  type WorkshopPartPurchaseDraft,
} from '../utils/workshopPartFields';
import {
  buildPartNumberMap,
  countPartsByCategory,
  countStockAlerts,
  getWorkshopPartStockStatus,
  readWorkshopPartSortMode,
  sortWorkshopPartsForCatalogNumber,
  sortWorkshopPartsForDisplay,
  WORKSHOP_PARTS_SORT_STORAGE_KEY,
  type WorkshopPartSortMode,
} from '../utils/workshopPartStock';
import { WorkshopPartStockBadge } from './ui/WorkshopPartStockBadge';

interface WorkshopPartsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type PendingPartPhoto = { id: string; file: File; previewUrl: string };

type PhotoEditorContext =
  | { kind: 'pending-add' }
  | { kind: 'pending-replace'; photoId: string }
  | { kind: 'remote-add'; partId: string }
  | { kind: 'remote-replace'; partId: string; photoId: string; url: string };

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
  const [pendingPhotos, setPendingPhotos] = useState<PendingPartPhoto[]>([]);
  const [registrationPhotos, setRegistrationPhotos] = useState<PartPhotoSlot[]>([]);
  const [adding, setAdding] = useState(false);
  const [registrationMode, setRegistrationMode] = useState<'create' | 'edit' | null>(null);
  const [registrationPart, setRegistrationPart] = useState<WorkshopPart | null>(null);
  const [registrationPurchases, setRegistrationPurchases] = useState<WorkshopPartPurchaseDraft[]>([]);
  const [loadingRegistrationPurchases, setLoadingRegistrationPurchases] = useState(false);

  const [viewPart, setViewPart] = useState<WorkshopPart | null>(null);
  const [viewPhotos, setViewPhotos] = useState<PartPhotoSlot[]>([]);
  const [viewPurchases, setViewPurchases] = useState<WorkshopPartPurchase[]>([]);
  const [loadingViewPart, setLoadingViewPart] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPrice, setEditingPrice] = useState('');
  const [editingStock, setEditingStock] = useState('');
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [loadingExistingPhotoId, setLoadingExistingPhotoId] = useState<string | null>(null);
  const [partsSearchQuery, setPartsSearchQuery] = useState('');
  /** `all` | `uncategorized` | id da categoria */
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  type StockAlertFilter = 'all' | 'zero' | 'low' | 'alerts';
  const [stockAlertFilter, setStockAlertFilter] = useState<StockAlertFilter>('all');
  const [sortMode, setSortMode] = useState<WorkshopPartSortMode>(readWorkshopPartSortMode);
  const [categories, setCategories] = useState<WorkshopPartCategory[]>([]);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryCreating, setCategoryCreating] = useState(false);
  const [categoryEditingId, setCategoryEditingId] = useState<string | null>(null);
  const [categoryEditingName, setCategoryEditingName] = useState('');
  const [photoEditorContext, setPhotoEditorContext] = useState<PhotoEditorContext | null>(null);
  const [photoEditorFile, setPhotoEditorFile] = useState<File | null>(null);
  const createPhotoInputRef = useRef<HTMLInputElement>(null);
  const createCameraInputRef = useRef<HTMLInputElement>(null);
  const categoryFilterDropdownRef = useRef<HTMLDivElement>(null);
  /** Evita fechar cadastro no popstate ao abrir câmera/galeria nativa (mobile). */
  const suspendRegistrationBackRef = useRef(false);
  /** Evita clique fantasma no overlay ao voltar do seletor de arquivo. */
  const blockRegistrationBackdropUntilRef = useRef(0);

  const [categoryFilterMenuOpen, setCategoryFilterMenuOpen] = useState(false);

  const parseNumber = (value: string): number => {
    const n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const registrationPhotoCount =
    registrationMode === 'create' ? pendingPhotos.length : registrationPhotos.length;

  const armNativePhotoPicker = useCallback(() => {
    suspendRegistrationBackRef.current = true;
    blockRegistrationBackdropUntilRef.current = Date.now() + 1200;
  }, []);

  const releaseNativePhotoPicker = useCallback(() => {
    suspendRegistrationBackRef.current = false;
  }, []);

  const beginAddPhoto = useCallback(
    (source: 'gallery' | 'camera') => {
      if (!registrationMode) return;
      if (registrationPhotoCount >= WORKSHOP_PART_PHOTOS_MAX) {
        setError(`Máximo de ${WORKSHOP_PART_PHOTOS_MAX} fotos por produto.`);
        return;
      }
      setError(null);
      armNativePhotoPicker();
      if (source === 'camera') {
        createCameraInputRef.current?.click();
      } else {
        createPhotoInputRef.current?.click();
      }
    },
    [registrationMode, registrationPhotoCount, armNativePhotoPicker]
  );

  const handleNewPartImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    releaseNativePhotoPicker();
    const f = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!f || !f.type.startsWith('image/')) return;
    if (!registrationMode) return;
    if (registrationPhotoCount >= WORKSHOP_PART_PHOTOS_MAX) {
      setError(`Máximo de ${WORKSHOP_PART_PHOTOS_MAX} fotos por produto.`);
      return;
    }
    if (registrationMode === 'create') {
      setPhotoEditorContext({ kind: 'pending-add' });
    } else if (registrationPart) {
      setPhotoEditorContext({ kind: 'remote-add', partId: registrationPart.id });
    }
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

  const resetNewProductDraft = useCallback(() => {
    setNewName('');
    setPendingPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setRegistrationPhotos([]);
    setPhotoEditorFile(null);
    setPhotoEditorContext(null);
  }, []);

  const closeRegistration = useCallback(() => {
    setRegistrationMode(null);
    setRegistrationPart(null);
    setRegistrationPurchases([]);
    resetNewProductDraft();
  }, [resetNewProductDraft]);

  const closeProductView = useCallback(() => {
    setViewPart(null);
    setViewPhotos([]);
    setViewPurchases([]);
    setLoadingViewPart(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      closeRegistration();
      closeProductView();
    }
  }, [isOpen, closeRegistration, closeProductView]);

  const openCreateRegistration = useCallback(() => {
    closeProductView();
    setRegistrationMode('create');
    setRegistrationPart(null);
    setRegistrationPurchases([]);
    resetNewProductDraft();
    setError(null);
  }, [resetNewProductDraft, closeProductView]);

  const openProductView = useCallback(async (part: WorkshopPart) => {
    const latest = parts.find((p) => p.id === part.id) ?? part;
    setViewPart(latest);
    setLoadingViewPart(true);
    setError(null);
    try {
      const [purchases, photos] = await Promise.all([
        getWorkshopPartPurchases(latest.id),
        getWorkshopPartPhotos(latest.id).catch(() => []),
      ]);
      setViewPurchases(purchases);
      setViewPhotos(workshopPartPhotosToSlots(photos, latest.photo_url));
    } catch {
      setViewPurchases([]);
      setViewPhotos(workshopPartToPhotoSlots(latest));
    } finally {
      setLoadingViewPart(false);
    }
  }, [parts]);

  const openEditRegistration = useCallback(async (part: WorkshopPart) => {
    closeProductView();
    setRegistrationMode('edit');
    setRegistrationPart(part);
    setPendingPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setError(null);
    setLoadingRegistrationPurchases(true);
    try {
      const [purchases, photos] = await Promise.all([
        getWorkshopPartPurchases(part.id),
        getWorkshopPartPhotos(part.id).catch(() => []),
      ]);
      setRegistrationPurchases(purchases.map(purchaseToDraft));
      setRegistrationPhotos(workshopPartPhotosToSlots(photos, part.photo_url));
    } catch {
      setRegistrationPurchases([]);
      setRegistrationPhotos(workshopPartToPhotoSlots(part));
    } finally {
      setLoadingRegistrationPurchases(false);
    }
  }, [closeProductView]);

  const handleEditFromView = useCallback(() => {
    if (!viewPart) return;
    const part = viewPart;
    closeProductView();
    void openEditRegistration(part);
  }, [viewPart, closeProductView, openEditRegistration]);

  useEffect(() => {
    if (!registrationMode) return;
    const onVis = () => {
      if (document.visibilityState !== 'visible' || !suspendRegistrationBackRef.current) return;
      window.setTimeout(() => {
        suspendRegistrationBackRef.current = false;
      }, 450);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [registrationMode]);

  useEffect(() => {
    if (!registrationMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (photoEditorFile) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeRegistration();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [registrationMode, closeRegistration, photoEditorFile]);

  useEffect(() => {
    if (!viewPart) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeProductView();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewPart, closeProductView]);

  const handleViewBackdropClick = useCallback(() => {
    closeProductView();
  }, [closeProductView]);

  const syncPurchasesForPart = async (partId: string, drafts: WorkshopPartPurchaseDraft[]) => {
    const existing = await getWorkshopPartPurchases(partId);
    const existingIds = new Set(existing.map((p) => p.id));
    const draftIds = new Set(drafts.filter((d) => d.id).map((d) => d.id!));

    for (const row of existing) {
      if (!draftIds.has(row.id)) {
        await deleteWorkshopPartPurchase(partId, row.id);
      }
    }

    for (const draft of drafts) {
      const payload = purchaseDraftToPayload(draft);
      if (draft.id && existingIds.has(draft.id)) {
        await updateWorkshopPartPurchase(partId, draft.id, payload);
      } else if (!draft.id) {
        await createWorkshopPartPurchase(partId, payload);
      }
    }
  };

  const handleRegistrationSave = async ({
    values,
    purchases: purchaseDrafts,
  }: {
    values: WorkshopPartFormValues;
    purchases: WorkshopPartPurchaseDraft[];
  }) => {
    if (!values.name.trim() || adding) return;
    setAdding(true);
    setError(null);
    try {
      const payload = formValuesToApiPayload(values);
      const categoryIds = values.category_ids ?? [];

      if (registrationMode === 'create') {
        let created = await createWorkshopPart(payload);
        created = await setWorkshopPartCategories(created.id, categoryIds);
        for (const photo of pendingPhotos) {
          created = await uploadWorkshopPartPhoto(created.id, photo.file, photo.file.name);
        }
        for (const draft of purchaseDrafts) {
          if (draft.supplier_name.trim() || parseNumber(draft.quantity) > 0) {
            await createWorkshopPartPurchase(created.id, purchaseDraftToPayload(draft));
          }
        }
        setParts((prev) =>
          [...prev, created].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        );
      } else if (registrationMode === 'edit' && registrationPart) {
        let updated = await updateWorkshopPart(registrationPart.id, payload);
        updated = await setWorkshopPartCategories(registrationPart.id, categoryIds);
        await syncPurchasesForPart(registrationPart.id, purchaseDrafts);
        setParts((prev) => prev.map((p) => (p.id === registrationPart.id ? updated : p)));
      }

      closeRegistration();
      await fetchParts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar peça.');
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
      if (registrationPart?.id === id) closeRegistration();
      if (viewPart?.id === id) closeProductView();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir peça.');
    }
  };

  const photoEditorDisplayName =
    photoEditorContext?.kind === 'pending-add' || photoEditorContext?.kind === 'pending-replace'
      ? newName.trim() || 'Nova peça'
      : photoEditorContext && 'partId' in photoEditorContext
        ? registrationPart?.name ?? parts.find((x) => x.id === photoEditorContext.partId)?.name ?? 'Peça'
        : '';

  const refreshRegistrationPhotosFromPart = (part: WorkshopPart) => {
    setRegistrationPhotos(workshopPartToPhotoSlots(part));
    setRegistrationPart(part);
  };

  const handlePhotoEditorSave = async (blob: Blob) => {
    const ctx = photoEditorContext;
    setPhotoEditorFile(null);
    setPhotoEditorContext(null);
    const file = new File([blob], 'foto.jpg', { type: 'image/jpeg' });

    if (!ctx) return;

    if (ctx.kind === 'pending-add') {
      const id = crypto.randomUUID();
      setPendingPhotos((prev) => [
        ...prev,
        { id, file, previewUrl: URL.createObjectURL(file) },
      ]);
      return;
    }

    if (ctx.kind === 'pending-replace') {
      setPendingPhotos((prev) =>
        prev.map((p) => {
          if (p.id !== ctx.photoId) return p;
          URL.revokeObjectURL(p.previewUrl);
          return { ...p, file, previewUrl: URL.createObjectURL(file) };
        })
      );
      return;
    }

    if (ctx.kind === 'remote-add' || ctx.kind === 'remote-replace') {
      setUploadingPhotoId(ctx.partId);
      setError(null);
      try {
        const replaceId =
          ctx.kind === 'remote-replace' && ctx.photoId !== WORKSHOP_PART_LEGACY_COVER_ID
            ? ctx.photoId
            : undefined;
        const updated = await uploadWorkshopPartPhoto(ctx.partId, file, file.name, {
          replacePhotoId: replaceId,
        });
        setParts((prev) => prev.map((p) => (p.id === ctx.partId ? updated : p)));
        if (registrationPart?.id === ctx.partId) {
          refreshRegistrationPhotosFromPart(updated);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao enviar foto da peça.');
      } finally {
        setUploadingPhotoId(null);
      }
    }
  };

  const handlePhotoEditorCancel = () => {
    setPhotoEditorFile(null);
    setPhotoEditorContext(null);
  };

  const handleRemoveRegistrationPhoto = async (photoId: string) => {
    if (registrationMode === 'create') {
      setPendingPhotos((prev) => {
        const row = prev.find((p) => p.id === photoId);
        if (row) URL.revokeObjectURL(row.previewUrl);
        return prev.filter((p) => p.id !== photoId);
      });
      return;
    }
    if (!registrationPart) return;
    setUploadingPhotoId(registrationPart.id);
    setError(null);
    try {
      if (photoId === WORKSHOP_PART_LEGACY_COVER_ID) {
        const updated = await updateWorkshopPart(registrationPart.id, { photo_url: null });
        setParts((prev) => prev.map((p) => (p.id === registrationPart.id ? updated : p)));
        setRegistrationPhotos([]);
        setRegistrationPart(updated);
        return;
      }
      const updated = await deleteWorkshopPartPhoto(registrationPart.id, photoId);
      setParts((prev) => prev.map((p) => (p.id === registrationPart.id ? updated : p)));
      refreshRegistrationPhotosFromPart(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao remover foto.');
    } finally {
      setUploadingPhotoId(null);
    }
  };

  const handleEditRegistrationPhoto = (photoId: string) => {
    if (registrationMode === 'create') {
      const row = pendingPhotos.find((p) => p.id === photoId);
      if (!row) return;
      setPhotoEditorContext({ kind: 'pending-replace', photoId });
      setPhotoEditorFile(row.file);
      return;
    }
    const slot = registrationPhotos.find((p) => p.id === photoId);
    if (!slot?.remoteUrl || !registrationPart) return;
    void openExistingPartPhotoInEditor(registrationPart, photoId, slot.remoteUrl);
  };

  const registrationPhotoSlots: PartPhotoSlot[] =
    registrationMode === 'create' ? pendingPhotos.map((p) => ({ id: p.id, previewUrl: p.previewUrl })) : registrationPhotos;

  useBrowserBackLayer(!!viewPart, closeProductView);

  /** Gesto voltar / history.back: fecha cadastro; se o editor de foto estiver aberto, cancela a foto antes. */
  useBrowserBackLayer(
    !!registrationMode,
    () => {
      if (photoEditorFile) {
        handlePhotoEditorCancel();
        return;
      }
      closeRegistration();
    },
    { canPop: () => !suspendRegistrationBackRef.current }
  );

  const handleRegistrationBackdropClick = useCallback(() => {
    if (Date.now() < blockRegistrationBackdropUntilRef.current) return;
    closeRegistration();
  }, [closeRegistration]);

  const openExistingPartPhotoInEditor = async (
    p: WorkshopPart,
    photoId: string,
    imageUrl?: string
  ) => {
    const url = (imageUrl ?? p.photo_url)?.trim();
    if (!url) return;
    setLoadingExistingPhotoId(p.id);
    setError(null);
    try {
      const file = await fetchImageUrlAsFileForEditor(url);
      setPhotoEditorContext({ kind: 'remote-replace', partId: p.id, photoId, url });
      setPhotoEditorFile(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir a foto para edição.');
    } finally {
      setLoadingExistingPhotoId(null);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(WORKSHOP_PARTS_SORT_STORAGE_KEY, sortMode);
    } catch {
      /* ignore */
    }
  }, [sortMode]);

  const partNumberById = useMemo(
    () => buildPartNumberMap(sortWorkshopPartsForCatalogNumber(parts)),
    [parts]
  );
  const sortedParts = useMemo(
    () => sortWorkshopPartsForDisplay(parts, sortMode),
    [parts, sortMode]
  );
  const categoryCounts = useMemo(() => countPartsByCategory(parts), [parts]);
  const stockAlertsGlobal = useMemo(() => countStockAlerts(parts), [parts]);

  const partsInCategoryScope = useMemo(() => {
    if (categoryFilter === 'all') return sortedParts;
    if (categoryFilter === 'uncategorized') {
      return sortedParts.filter((p) => !(p.category_ids && p.category_ids.length > 0));
    }
    return sortedParts.filter((p) => p.category_ids?.includes(categoryFilter));
  }, [sortedParts, categoryFilter]);

  const partsAfterStockFilter = useMemo(() => {
    if (stockAlertFilter === 'all') return partsInCategoryScope;
    return partsInCategoryScope.filter((p) => {
      const status = getWorkshopPartStockStatus(p);
      if (stockAlertFilter === 'zero') return status === 'zero';
      if (stockAlertFilter === 'low') return status === 'low';
      return status === 'zero' || status === 'low';
    });
  }, [partsInCategoryScope, stockAlertFilter]);

  const filteredParts = useMemo(() => {
    const raw = partsSearchQuery.trim();
    if (!raw) return partsAfterStockFilter;
    const q = normalizePartSearch(raw);
    if (!q) return partsAfterStockFilter;
    return partsAfterStockFilter.filter((p) => {
      const name = normalizePartSearch(p.name || '');
      const id = (p.id || '').toLowerCase();
      const original = normalizePartSearch(p.original_code || '');
      const numeric = normalizePartSearch(p.numeric_code || '');
      const location = normalizePartSearch(p.location || '');
      const price = String(p.unit_price ?? '').replace(',', '.');
      const stock = String(p.stock_qty ?? '').replace(',', '.');
      const catNames = (p.category_ids ?? [])
        .map((cid) => categories.find((c) => c.id === cid)?.name)
        .filter(Boolean)
        .join(' ');
      return (
        name.includes(q) ||
        original.includes(q) ||
        numeric.includes(q) ||
        location.includes(q) ||
        id.includes(raw.toLowerCase().replace(/\s/g, '')) ||
        normalizePartSearch(price).includes(q) ||
        stock.replace(/\s/g, '').includes(raw.replace(/\s/g, '').replace(',', '.')) ||
        normalizePartSearch(catNames).includes(q)
      );
    });
  }, [partsAfterStockFilter, partsSearchQuery, categories]);

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
    const fmt = (label: string, count: number) => `${label} (${count})`;
    if (categoryFilter === 'all') return fmt('Todos os produtos', categoryCounts.total);
    if (categoryFilter === 'uncategorized') return fmt('Sem categoria', categoryCounts.uncategorized);
    const name = categories.find((c) => c.id === categoryFilter)?.name ?? 'Categoria';
    return fmt(name, categoryCounts.counts.get(categoryFilter) ?? 0);
  }, [categoryFilter, categories, categoryCounts]);

  const categoryFilterOptions = useMemo(() => {
    const fmt = (label: string, count: number) => ({ label, countLabel: `${label} (${count})` });
    return [
      { value: 'all' as const, ...fmt('Todos os produtos', categoryCounts.total) },
      { value: 'uncategorized' as const, ...fmt('Sem categoria', categoryCounts.uncategorized) },
      ...categories.map((c) => ({
        value: c.id,
        ...fmt(c.name, categoryCounts.counts.get(c.id) ?? 0),
      })),
    ];
  }, [categories, categoryCounts]);

  useEffect(() => {
    if (!editingId) return;
    if (!filteredParts.some((p) => p.id === editingId)) {
      setEditingId(null);
      setEditingName('');
      setEditingPrice('');
      setEditingStock('');
    }
  }, [filteredParts, editingId]);

  const isDesktopShell = useDesktopShellLayout();

  /** Lista sem backdrop-blur: blur quebra carregamento de imagens no Safari (mobile/tablet). */
  const workshopPartsListCard =
    'overflow-visible rounded-[22px] border border-zinc-200/80 dark:border-white/[0.07] bg-white dark:bg-zinc-900 shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]';

  if (!isOpen) return null;

  return (
    <>
    <TechnicianPhotoEditorModal
      isOpen={!!photoEditorFile}
      imageFile={photoEditorFile}
      technicianName={photoEditorDisplayName}
      onSave={handlePhotoEditorSave}
      onCancel={handlePhotoEditorCancel}
      overlayZIndexClass="z-[140]"
      cropShape="square"
    />

    <ModalPortal>
    <div
      className={`${desktopShellViewportOverlayClass(isDesktopShell)} flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950 p-0${isDesktopShell ? '' : ' h-[100dvh] max-h-[100dvh]'}`}
    >
      <div className="relative flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
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

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-auto touch-pan-y px-6 sm:px-8 pb-[max(2rem,env(safe-area-inset-bottom))] custom-scrollbar [scrollbar-gutter:stable]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 sm:max-w-xl">
              Gerencie preço e estoque. Use <span className="font-medium text-zinc-600 dark:text-zinc-300">Categorias</span> para
              organizar o catálogo. Use <span className="font-medium text-zinc-600 dark:text-zinc-300">Adicionar produto</span> para
              cadastrar. Toque no nome do item para <span className="font-medium text-zinc-600 dark:text-zinc-300">ver detalhes</span>; use o
              ícone de lápis para editar.
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
                onClick={openCreateRegistration}
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

          <div className={workshopPartsListCard}>
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
                        {categoryFilterOptions.map((opt) => {
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
                                <span className="min-w-0 truncate">{opt.countLabel}</span>
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

                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                  <span
                    id="workshop-parts-sort-label"
                    className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                  >
                    Ordenar por
                  </span>
                  <div
                    role="group"
                    aria-labelledby="workshop-parts-sort-label"
                    className="inline-flex w-full sm:w-auto rounded-xl border border-zinc-200/90 dark:border-white/[0.12] bg-white/95 dark:bg-zinc-950/90 p-1 shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => setSortMode('recent')}
                      aria-pressed={sortMode === 'recent'}
                      className={`inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${
                        sortMode === 'recent'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.08]'
                      }`}
                    >
                      <Clock className="h-4 w-4 shrink-0" aria-hidden />
                      Recentes
                    </button>
                    <button
                      type="button"
                      onClick={() => setSortMode('oldest')}
                      aria-pressed={sortMode === 'oldest'}
                      className={`inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${
                        sortMode === 'oldest'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.08]'
                      }`}
                    >
                      <History className="h-4 w-4 shrink-0" aria-hidden />
                      Antigo
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 pt-0.5">
                  <p className="text-[14px] font-semibold text-zinc-800 dark:text-zinc-200">
                    <span className="tabular-nums">{categoryCounts.total}</span>{' '}
                    {categoryCounts.total === 1 ? 'produto no estoque' : 'produtos no estoque'}
                    {categoryFilter !== 'all' || stockAlertFilter !== 'all' || partsSearchQuery.trim() ? (
                      <span className="font-medium text-zinc-500 dark:text-zinc-400">
                        {' '}
                        · exibindo <span className="tabular-nums text-zinc-700 dark:text-zinc-300">{filteredParts.length}</span>
                      </span>
                    ) : null}
                  </p>

                  {(stockAlertsGlobal.zero > 0 || stockAlertsGlobal.low > 0) && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Alertas:
                      </span>
                      {stockAlertsGlobal.zero > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setStockAlertFilter((f) => (f === 'zero' ? 'all' : 'zero'))
                          }
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                            stockAlertFilter === 'zero'
                              ? 'bg-red-600 text-white'
                              : 'bg-red-100 text-red-900 ring-1 ring-red-300/60 hover:bg-red-200/90 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-500/30'
                          }`}
                        >
                          <PackageX className="h-3.5 w-3.5" aria-hidden />
                          <span className="tabular-nums">{stockAlertsGlobal.zero}</span> sem estoque
                        </button>
                      ) : null}
                      {stockAlertsGlobal.low > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setStockAlertFilter((f) => (f === 'low' ? 'all' : 'low'))
                          }
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                            stockAlertFilter === 'low'
                              ? 'bg-amber-600 text-white'
                              : 'bg-amber-100 text-amber-900 ring-1 ring-amber-300/60 hover:bg-amber-200/90 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-500/30'
                          }`}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                          <span className="tabular-nums">{stockAlertsGlobal.low}</span> acabando
                        </button>
                      ) : null}
                      {(stockAlertsGlobal.zero > 0 && stockAlertsGlobal.low > 0) ||
                      stockAlertFilter === 'alerts' ? (
                        <button
                          type="button"
                          onClick={() =>
                            setStockAlertFilter((f) => (f === 'alerts' ? 'all' : 'alerts'))
                          }
                          className={`rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                            stockAlertFilter === 'alerts'
                              ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                              : 'text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                          }`}
                        >
                          {stockAlertFilter === 'alerts' ? 'Limpar filtro de alertas' : 'Ver todos os alertas'}
                        </button>
                      ) : null}
                    </div>
                  )}

                  {categories.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Por categoria
                      </span>
                      <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-0.5 px-0.5 scrollbar-thin">
                        <button
                          type="button"
                          onClick={() => {
                            setCategoryFilter('all');
                            setCategoryFilterMenuOpen(false);
                          }}
                          className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                            categoryFilter === 'all'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-zinc-200/90 text-zinc-800 hover:bg-zinc-300/90 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15'
                          }`}
                        >
                          Todos <span className="tabular-nums">({categoryCounts.total})</span>
                        </button>
                        {categoryCounts.uncategorized > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setCategoryFilter('uncategorized');
                              setCategoryFilterMenuOpen(false);
                            }}
                            className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                              categoryFilter === 'uncategorized'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-zinc-200/90 text-zinc-800 hover:bg-zinc-300/90 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15'
                            }`}
                          >
                            Sem categoria{' '}
                            <span className="tabular-nums">({categoryCounts.uncategorized})</span>
                          </button>
                        ) : null}
                        {categories.map((c) => {
                          const n = categoryCounts.counts.get(c.id) ?? 0;
                          if (n === 0) return null;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setCategoryFilter(c.id);
                                setCategoryFilterMenuOpen(false);
                              }}
                              className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                                categoryFilter === c.id
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-zinc-200/90 text-zinc-800 hover:bg-zinc-300/90 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15'
                              }`}
                            >
                              {c.name} <span className="tabular-nums">({n})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
            <div className="hidden md:grid md:grid-cols-[3rem_4fr_1fr_1fr_auto_auto] md:gap-3 px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-zinc-200/40 dark:border-white/[0.06] bg-zinc-50/50 dark:bg-white/[0.03]">
              <span className="text-center tabular-nums">#</span>
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
            ) : partsAfterStockFilter.length === 0 && stockAlertFilter !== 'all' ? (
              <div className="py-10 px-4 text-center">
                <p className="text-[15px] text-zinc-500 dark:text-zinc-400">
                  Nenhum produto com este alerta nesta seleção.
                </p>
                <button
                  type="button"
                  className="mt-3 text-[14px] font-semibold text-emerald-600 dark:text-emerald-400 underline hover:brightness-110"
                  onClick={() => setStockAlertFilter('all')}
                >
                  Mostrar todos os produtos
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
                  const partNum = partNumberById.get(p.id);
                  const stockStatus = getWorkshopPartStockStatus(p);
                  const rowAlertCls =
                    stockStatus === 'zero'
                      ? 'bg-red-50/80 dark:bg-red-950/20'
                      : stockStatus === 'low'
                        ? 'bg-amber-50/70 dark:bg-amber-950/15'
                        : 'bg-transparent';
                  return (
                  <div
                    key={p.id}
                    className={`min-h-[52px] flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-zinc-100/60 dark:hover:bg-white/[0.04] transition-colors md:grid md:grid-cols-[3rem_4fr_1fr_1fr_auto_auto] md:flex-nowrap md:gap-3 md:items-center ${rowAlertCls}`}
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
                        <span className="hidden items-center justify-center text-[13px] font-bold tabular-nums text-zinc-500 dark:text-zinc-400 md:flex">
                          {partNum != null ? `#${partNum}` : '—'}
                        </span>
                        <button
                          type="button"
                          onClick={() => void openProductView(p)}
                          className="w-full min-w-0 flex flex-[1_1_100%] items-center gap-3 text-left rounded-xl -my-1 -ml-2 pl-2 pr-2 py-1.5 hover:bg-zinc-200/70 dark:hover:bg-white/[0.07] transition-colors cursor-pointer md:col-span-1 md:flex-[unset] md:w-auto"
                          title="Ver detalhes do produto"
                        >
                          <div className="isolate w-10 h-10 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 pointer-events-none dark:border-white/10 dark:bg-white/5">
                            {p.photo_url ? (
                              <PartPhotoImg
                                src={p.photo_url}
                                alt=""
                                className="h-full w-full object-cover [transform:translateZ(0)]"
                              />
                            ) : null}
                          </div>
                          <span className="min-w-0 flex flex-col gap-0.5 text-left">
                            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                              {partNum != null ? (
                                <span className="shrink-0 text-[13px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                                  #{partNum}
                                </span>
                              ) : null}
                              <span className="min-w-0 text-[16px] font-medium text-zinc-900 dark:text-white truncate">
                                {p.name}
                              </span>
                              <WorkshopPartStockBadge status={stockStatus} className="md:hidden" />
                            </span>
                            {catLine ? (
                              <span className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{catLine}</span>
                            ) : null}
                          </span>
                        </button>
                        <span className="min-w-0 flex-1 text-[14px] text-zinc-700 dark:text-zinc-300 text-right tabular-nums md:flex-[unset] md:min-w-0 md:justify-self-end">
                          R$ {Number(p.unit_price ?? 0).toFixed(2)}
                        </span>
                        <span
                          className={`min-w-0 flex flex-1 flex-col items-end gap-0.5 text-[14px] tabular-nums md:flex-[unset] md:min-w-0 md:justify-self-end ${
                            stockStatus === 'zero'
                              ? 'font-semibold text-red-700 dark:text-red-300'
                              : stockStatus === 'low'
                                ? 'font-semibold text-amber-800 dark:text-amber-300'
                                : 'text-zinc-700 dark:text-zinc-300'
                          }`}
                        >
                          <span>{Number(p.stock_qty ?? 0).toFixed(3)}</span>
                          <WorkshopPartStockBadge status={stockStatus} className="hidden md:inline-flex" />
                        </span>
                        <button
                          type="button"
                          onClick={() => void openEditRegistration(p)}
                          className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center justify-self-center text-zinc-500 hover:text-brand-yellow hover:bg-brand-yellow/10 transition-colors"
                          aria-label="Editar cadastro completo"
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

    {registrationMode ? (
      <RegistrationPortal>
      <div
        className={
          isDesktopShell
            ? `${desktopShellNestedOverlayClass(isDesktopShell)} flex min-h-0 w-full flex-col overflow-hidden bg-white dark:bg-zinc-950`
            : 'fixed inset-0 z-[115] flex items-center justify-center bg-black/50 p-2 sm:p-4'
        }
        onClick={isDesktopShell ? undefined : handleRegistrationBackdropClick}
        role="presentation"
      >
        <input
          ref={createPhotoInputRef}
          type="file"
          accept="image/*,.png,.jpg,.jpeg,.webp,.heic,.heif"
          className="sr-only fixed left-0 top-0 h-px w-px opacity-0"
          tabIndex={-1}
          aria-hidden
          onChange={handleNewPartImageSelected}
        />
        <input
          ref={createCameraInputRef}
          type="file"
          accept="image/*,.png,.jpg,.jpeg,.webp,.heic,.heif"
          capture="environment"
          className="sr-only fixed left-0 top-0 h-px w-px opacity-0"
          tabIndex={-1}
          aria-hidden
          onChange={handleNewPartImageSelected}
        />
        <div
          className={
            isDesktopShell
              ? 'relative flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950'
              : 'relative flex w-full max-w-[min(98vw,1280px)] max-h-[min(94dvh,calc(100dvh-2rem))] flex-col overflow-hidden rounded-[2rem] border border-zinc-200/90 bg-white shadow-[0_8px_40px_-12px_rgba(0,0,0,0.12)] dark:border-white/[0.08] dark:bg-zinc-950 dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)] sm:rounded-[2.25rem]'
          }
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={closeRegistration}
            className={
              isDesktopShell
                ? `${iosModalClose} top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))]`
                : iosModalClose
            }
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
          <div
            className={
              isDesktopShell
                ? 'shrink-0 border-b border-zinc-200/70 bg-white px-6 pb-4 pt-[max(2rem,env(safe-area-inset-top)+0.75rem)] pr-14 dark:border-white/[0.06] dark:bg-transparent sm:px-8'
                : 'shrink-0 border-b border-zinc-200/70 bg-white px-6 pb-4 pt-8 pr-14 dark:border-white/[0.06] dark:bg-transparent'
            }
          >
            <IosModalHeader
              icon={<img src="/icons/estoque-ios.png" alt="" className="h-full w-full min-h-0 object-cover" />}
              title={registrationMode === 'create' ? 'Estoque — criação de registro' : 'Estoque — edição de registro'}
              subtitle="Cadastro completo da peça"
              gradientClass="from-emerald-500 to-teal-700"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-auto touch-pan-y bg-white px-6 py-6 sm:px-8 custom-scrollbar [scrollbar-gutter:stable] dark:bg-transparent">
            {loadingRegistrationPurchases ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              </div>
            ) : (
              <WorkshopPartRegistrationForm
                mode={registrationMode}
                initialPart={registrationMode === 'edit' ? registrationPart : null}
                initialPurchases={registrationPurchases}
                categories={categories}
                onManageCategories={() => setIsCategoriesModalOpen(true)}
                photos={registrationPhotoSlots}
                maxPhotos={WORKSHOP_PART_PHOTOS_MAX}
                saving={adding}
                error={error}
                onValuesChange={(name) => setNewName(name)}
                onAddPhoto={() => beginAddPhoto('gallery')}
                onAddPhotoCamera={() => beginAddPhoto('camera')}
                onRemovePhoto={(id) => void handleRemoveRegistrationPhoto(id)}
                onEditPhoto={handleEditRegistrationPhoto}
                photoBusy={uploadingPhotoId !== null || loadingExistingPhotoId !== null}
                onSubmit={handleRegistrationSave}
                onCancel={closeRegistration}
              />
            )}
          </div>
        </div>
      </div>
      </RegistrationPortal>
    ) : null}

    {viewPart ? (
      <RegistrationPortal>
        <div
          className={
            isDesktopShell
              ? `${desktopShellNestedOverlayClass(isDesktopShell)} flex min-h-0 w-full flex-col overflow-hidden bg-white dark:bg-zinc-950`
              : 'fixed inset-0 z-[115] flex items-center justify-center bg-black/50 p-2 sm:p-4'
          }
          onClick={isDesktopShell ? undefined : handleViewBackdropClick}
          role="presentation"
        >
          <div
            className={
              isDesktopShell
                ? 'relative flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950'
                : 'relative flex w-full max-w-[min(98vw,1280px)] max-h-[min(94dvh,calc(100dvh-2rem))] flex-col overflow-hidden rounded-[2rem] border border-zinc-200/90 bg-white shadow-[0_8px_40px_-12px_rgba(0,0,0,0.12)] dark:border-white/[0.08] dark:bg-zinc-950 dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)] sm:rounded-[2.25rem]'
            }
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={closeProductView}
              className={
                isDesktopShell
                  ? `${iosModalClose} top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))]`
                  : iosModalClose
              }
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
            <div
              className={
                isDesktopShell
                  ? 'shrink-0 border-b border-zinc-200/70 bg-white px-6 pb-4 pt-[max(2rem,env(safe-area-inset-top)+0.75rem)] pr-14 dark:border-white/[0.06] dark:bg-transparent sm:px-8'
                  : 'shrink-0 border-b border-zinc-200/70 bg-white px-6 pb-4 pt-8 pr-14 dark:border-white/[0.06] dark:bg-transparent'
              }
            >
              <IosModalHeader
                icon={<img src="/icons/estoque-ios.png" alt="" className="h-full w-full min-h-0 object-cover" />}
                title="Estoque — visualização"
                subtitle={
                  partNumberById.get(viewPart.id) != null
                    ? `#${partNumberById.get(viewPart.id)} · ${viewPart.name}`
                    : viewPart.name
                }
                gradientClass="from-emerald-500 to-teal-700"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-auto touch-pan-y bg-white px-6 py-6 sm:px-8 custom-scrollbar [scrollbar-gutter:stable] dark:bg-transparent">
              <WorkshopPartDetailView
                part={parts.find((p) => p.id === viewPart.id) ?? viewPart}
                catalogNumber={partNumberById.get(viewPart.id)}
                photos={viewPhotos}
                purchases={viewPurchases}
                categories={categories}
                loading={loadingViewPart}
                onEdit={handleEditFromView}
                onDelete={() => void handleDelete(viewPart.id)}
              />
            </div>
          </div>
        </div>
      </RegistrationPortal>
    ) : null}

    {isCategoriesModalOpen && (
      <div
        className={`${desktopShellNestedOverlayClass(isDesktopShell, 'z-[118]')} flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-[12px]`}
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
    </ModalPortal>
    </>
  );
};

