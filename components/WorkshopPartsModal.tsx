import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  X,
  Check,
  Tags,
  Printer,
  Loader2,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { iosModalShell, iosModalClose, iosModalInsetCard, SETTINGS_CHILD_MODAL_Z, NESTED_STOCK_OVERLAY_Z } from './ui/iosModalStyles';

import {
  WORKSHOP_PART_LEGACY_COVER_ID,
  workshopPartPhotosToSlots,
  workshopPartToPhotoSlots,
} from '../utils/workshopPartPhotoSlots';
import { ModalPortal } from './ui/ModalPortal';
import { RegistrationPortal } from './ui/RegistrationPortal';
import { useBrowserBackLayer } from './ui/BackNavigationContext';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import {
  desktopShellPortaledChildOverlayClass,
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
  getWorkshopPartLabContext,
  createWorkshopPartPurchase,
  updateWorkshopPartPurchase,
  deleteWorkshopPartPurchase,
  getWorkshopPartPendingReservations,
  verifyStockGuardPassword,
  type WorkshopPart,
  type WorkshopPartCategory,
  type WorkshopPartPurchase,
  type WorkshopPartLabContext,
  type WorkshopPartPendingReservation,
  type WorkshopPartStockMovementType,
  type WorkshopPartWriteInput,
} from '../services/apiService';
import { printWorkshopPartSheet } from '../utils/workshopPartPrintSheet';
import { TechnicianPhotoEditorModal } from './TechnicianPhotoEditorModal';
import {
  WorkshopPartRegistrationForm,
  type PartPhotoSlot,
} from './WorkshopPartRegistrationForm';
import { WorkshopPartDetailView } from './WorkshopPartDetailView';
import { WorkshopPartsAnalyticsView } from './WorkshopPartsAnalyticsView';
import { WorkshopPartStockOutboundModal } from './WorkshopPartStockOutboundModal';
import { WorkshopPartStockInboundModal } from './WorkshopPartStockInboundModal';
import { WorkshopPartScanHubModal } from './WorkshopPartScanHubModal';
import { setActiveBarcodeScanClaim } from '../utils/activeBarcodeScanClaim';
import { isLabOsQrPayload } from '../utils/labOsQrCode';
import { normalizeBarcodeInput } from '../utils/workshopPartBarcode';
import { StockGuardPasswordModal } from './StockGuardPasswordModal';
import {
  formValuesToApiPayload,
  purchaseDraftShouldSync,
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
import { storageSiteLabel } from '../utils/workshopPartFields';
import { WorkshopPartsHomeDashboard } from './WorkshopPartsHomeDashboard';

interface WorkshopPartsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Ação pedida de fora (ex.: leitura USB global). */
  bootIntent?: WorkshopPartsBootIntent | null;
  onBootIntentConsumed?: () => void;
}

export type WorkshopPartsBootIntent =
  | { type: 'edit'; part: WorkshopPart }
  | { type: 'create'; barcode: string }
  | { type: 'view'; part: WorkshopPart }
  | { type: 'inbound'; part: WorkshopPart }
  | { type: 'outbound'; mode: WorkshopPartStockMovementType; part: WorkshopPart };

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

export const WorkshopPartsModal: React.FC<WorkshopPartsModalProps> = ({
  isOpen,
  onClose,
  bootIntent = null,
  onBootIntentConsumed,
}) => {
  const [parts, setParts] = useState<WorkshopPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingReservations, setPendingReservations] = useState<WorkshopPartPendingReservation[]>([]);
  const [reservedQtyByPartId, setReservedQtyByPartId] = useState<Record<string, number>>({});
  const [reservationsExpanded, setReservationsExpanded] = useState(false);

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
  const [viewLabContext, setViewLabContext] = useState<WorkshopPartLabContext | null>(null);
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
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [outboundMode, setOutboundMode] = useState<WorkshopPartStockMovementType | null>(null);
  const [outboundInitialPart, setOutboundInitialPart] = useState<WorkshopPart | null>(null);
  const [inboundPart, setInboundPart] = useState<WorkshopPart | null>(null);
  const [scanHubOpen, setScanHubOpen] = useState(false);
  const [scanHubExternal, setScanHubExternal] = useState<{ code: string; token: number } | null>(null);
  const [registrationPrefillBarcode, setRegistrationPrefillBarcode] = useState<string | null>(null);
  const [categories, setCategories] = useState<WorkshopPartCategory[]>([]);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryCreating, setCategoryCreating] = useState(false);
  const [categoryEditingId, setCategoryEditingId] = useState<string | null>(null);
  const [categoryEditingName, setCategoryEditingName] = useState('');
  const [photoEditorContext, setPhotoEditorContext] = useState<PhotoEditorContext | null>(null);
  const [photoEditorFile, setPhotoEditorFile] = useState<File | null>(null);
  const [stockGuardOpen, setStockGuardOpen] = useState(false);
  const [stockGuardError, setStockGuardError] = useState<string | null>(null);
  const [stockGuardBusy, setStockGuardBusy] = useState(false);
  const createPhotoInputRef = useRef<HTMLInputElement>(null);
  const createCameraInputRef = useRef<HTMLInputElement>(null);
  const categoryFilterDropdownRef = useRef<HTMLDivElement>(null);
  /** Evita fechar cadastro no popstate ao abrir câmera/galeria nativa (mobile). */
  const suspendRegistrationBackRef = useRef(false);
  /** Evita clique fantasma no overlay ao voltar do seletor de arquivo. */
  const blockRegistrationBackdropUntilRef = useRef(0);
  /** Ação protegida a executar após validar a senha do estoque. */
  const pendingStockGuardActionRef = useRef<null | (() => Promise<void>)>(null);

  const [categoryFilterMenuOpen, setCategoryFilterMenuOpen] = useState(false);

  const parseNumber = (value: string): number => {
    const n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const requestStockGuard = useCallback((action: () => Promise<void>) => {
    pendingStockGuardActionRef.current = action;
    setStockGuardError(null);
    setStockGuardOpen(true);
  }, []);

  const closeStockGuard = useCallback(() => {
    if (stockGuardBusy) return;
    pendingStockGuardActionRef.current = null;
    setStockGuardOpen(false);
    setStockGuardError(null);
  }, [stockGuardBusy]);

  const handleStockGuardConfirm = useCallback(async (_password: string) => {
    setStockGuardBusy(true);
    setStockGuardError(null);
    try {
      await verifyStockGuardPassword(_password);
      const action = pendingStockGuardActionRef.current;
      pendingStockGuardActionRef.current = null;
      setStockGuardOpen(false);
      if (action) await action();
    } catch (e) {
      setStockGuardError(e instanceof Error ? e.message : 'Senha incorreta.');
    } finally {
      setStockGuardBusy(false);
    }
  }, []);

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
        setError(`Máximo de ${WORKSHOP_PART_PHOTOS_MAX} fotos por peça.`);
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
      setError(`Máximo de ${WORKSHOP_PART_PHOTOS_MAX} fotos por peça.`);
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
      const [list, cats, reservations] = await Promise.all([
        getWorkshopParts(),
        getWorkshopPartCategories().catch(() => [] as WorkshopPartCategory[]),
        getWorkshopPartPendingReservations().catch(() => ({
          items: [] as WorkshopPartPendingReservation[],
          reservedQtyByPartId: {} as Record<string, number>,
        })),
      ]);
      setParts(list);
      setCategories(cats);
      setPendingReservations(reservations.items);
      setReservedQtyByPartId(reservations.reservedQtyByPartId);
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
    setRegistrationPrefillBarcode(null);
    setRegistrationPart(null);
    setRegistrationPurchases([]);
    resetNewProductDraft();
  }, [resetNewProductDraft]);

  const closeProductView = useCallback(() => {
    setViewPart(null);
    setViewPhotos([]);
    setViewPurchases([]);
    setViewLabContext(null);
    setLoadingViewPart(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      closeRegistration();
      closeProductView();
    }
  }, [isOpen, closeRegistration, closeProductView]);

  const openCreateRegistration = useCallback((prefillBarcode?: string | null) => {
    closeProductView();
    setRegistrationMode('create');
    setRegistrationPart(null);
    setRegistrationPurchases([]);
    setRegistrationPrefillBarcode(prefillBarcode?.trim() || null);
    resetNewProductDraft();
    setError(null);
  }, [resetNewProductDraft, closeProductView]);

  const openRegisterFromMissingBarcode = useCallback(
    (barcode: string) => {
      setOutboundMode(null);
      openCreateRegistration(barcode);
    },
    [openCreateRegistration]
  );

  const openProductView = useCallback(async (part: WorkshopPart) => {
    const latest = parts.find((p) => p.id === part.id) ?? part;
    setViewPart(latest);
    setLoadingViewPart(true);
    setError(null);
    try {
      const [purchases, photos, labRes] = await Promise.all([
        getWorkshopPartPurchases(latest.id),
        getWorkshopPartPhotos(latest.id).catch(() => []),
        getWorkshopPartLabContext(latest.id).catch(() => ({ context: null })),
      ]);
      setViewPurchases(purchases);
      setViewPhotos(workshopPartPhotosToSlots(photos, latest.photo_url));
      setViewLabContext(labRes.context ?? null);
    } catch {
      setViewPurchases([]);
      setViewPhotos(workshopPartToPhotoSlots(latest));
      setViewLabContext(null);
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

    const mode = registrationMode;
    const editPartId = registrationPart?.id ?? null;
    const photosSnapshot = [...pendingPhotos];

    const runSave = async () => {
      setAdding(true);
      setError(null);
      try {
        const payload = formValuesToApiPayload(values) as WorkshopPartWriteInput;
        const categoryIds = values.category_ids ?? [];

        if (mode === 'create') {
          let created = await createWorkshopPart(payload);
          created = await setWorkshopPartCategories(created.id, categoryIds);
          for (const photo of photosSnapshot) {
            created = await uploadWorkshopPartPhoto(created.id, photo.file, photo.file.name);
          }
          for (const draft of purchaseDrafts) {
            if (purchaseDraftShouldSync(draft)) {
              await createWorkshopPartPurchase(created.id, purchaseDraftToPayload(draft));
            }
          }
          setParts((prev) =>
            [...prev, created].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
          );
        } else if (mode === 'edit' && editPartId) {
          await updateWorkshopPart(editPartId, payload);
          await setWorkshopPartCategories(editPartId, categoryIds);
          await syncPurchasesForPart(editPartId, purchaseDrafts);
        }

        closeRegistration();
        await fetchParts();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao salvar peça.');
      } finally {
        setAdding(false);
      }
    };

    if (mode === 'create' || (mode === 'edit' && editPartId)) {
      requestStockGuard(runSave);
      return;
    }

    await runSave();
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

    const partId = editingId;
    const name = editingName.trim();

    requestStockGuard(async () => {
      setError(null);
      try {
        const updated = await updateWorkshopPart(partId, {
          name,
          unit_price,
          stock_qty,
        });
        setParts((prev) => prev.map((p) => (p.id === partId ? updated : p)));
        cancelEdit();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao salvar peça.');
      }
    });
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
      const applyRemotePhoto = async () => {
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
      };

      if (registrationMode === 'edit') {
        requestStockGuard(applyRemotePhoto);
        return;
      }
      await applyRemotePhoto();
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

    const applyRemove = async () => {
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

    if (registrationMode === 'edit') {
      requestStockGuard(applyRemove);
      return;
    }
    await applyRemove();
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
      const brand = normalizePartSearch(p.brand || '');
      const id = (p.id || '').toLowerCase();
      const original = normalizePartSearch(p.original_code || '');
      const numeric = normalizePartSearch(p.numeric_code || '');
      const barcode = normalizePartSearch(p.barcode || '');
      const location = normalizePartSearch(p.location || '');
      const model = normalizePartSearch(p.model || '');
      const description = normalizePartSearch(p.description || '');
      const characteristics = normalizePartSearch(p.characteristics || '');
      const storage = normalizePartSearch(storageSiteLabel(p.storage_site));
      const price = String(p.unit_price ?? '').replace(',', '.');
      const stock = String(p.stock_qty ?? '').replace(',', '.');
      const catNames = (p.category_ids ?? [])
        .map((cid) => categories.find((c) => c.id === cid)?.name)
        .filter(Boolean)
        .join(' ');
      return (
        name.includes(q) ||
        brand.includes(q) ||
        model.includes(q) ||
        description.includes(q) ||
        characteristics.includes(q) ||
        storage.includes(q) ||
        original.includes(q) ||
        numeric.includes(q) ||
        barcode.includes(q) ||
        location.includes(q) ||
        id.includes(raw.toLowerCase().replace(/\s/g, '')) ||
        normalizePartSearch(price).includes(q) ||
        stock.replace(/\s/g, '').includes(raw.replace(/\s/g, '').replace(',', '.')) ||
        normalizePartSearch(catNames).includes(q)
      );
    });
  }, [partsAfterStockFilter, partsSearchQuery, categories]);

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
    if (!window.confirm('Excluir esta categoria? As peças não serão apagadas; apenas o vínculo com a categoria.')) return;
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
    if (categoryFilter === 'all') return fmt('Todas as peças', categoryCounts.total);
    if (categoryFilter === 'uncategorized') return fmt('Sem categoria', categoryCounts.uncategorized);
    const name = categories.find((c) => c.id === categoryFilter)?.name ?? 'Categoria';
    return fmt(name, categoryCounts.counts.get(categoryFilter) ?? 0);
  }, [categoryFilter, categories, categoryCounts]);

  const categoryFilterOptions = useMemo(() => {
    const fmt = (label: string, count: number) => ({ label, countLabel: `${label} (${count})` });
    return [
      { value: 'all' as const, ...fmt('Todas as peças', categoryCounts.total) },
      { value: 'uncategorized' as const, ...fmt('Sem categoria', categoryCounts.uncategorized) },
      ...categories.map((c) => ({
        value: c.id,
        ...fmt(c.name, categoryCounts.counts.get(c.id) ?? 0),
      })),
    ];
  }, [categories, categoryCounts]);

  const categoryNamesForPart = useCallback(
    (p: WorkshopPart) =>
      (p.category_ids ?? [])
        .map((cid) => categories.find((c) => c.id === cid)?.name)
        .filter(Boolean) as string[],
    [categories]
  );

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

  useBrowserBackLayer(isAnalyticsOpen, () => setIsAnalyticsOpen(false));

  useEffect(() => {
    if (!isOpen) {
      setIsAnalyticsOpen(false);
      setOutboundMode(null);
      setScanHubOpen(false);
      setScanHubExternal(null);
      setOutboundInitialPart(null);
      setInboundPart(null);
    }
  }, [isOpen]);

  /**
   * Com o módulo de estoque aberto, a pistola USB abre o hub de leitura:
   * produto existente → ficha rápida; código novo → pergunta de cadastro.
   * Não reivindica se ficha/entrada/saída/cadastro já estiver aberto (campo local).
   */
  const stockUsbClaimBlocked =
    !!registrationMode ||
    !!outboundMode ||
    !!inboundPart ||
    !!viewPart ||
    stockGuardOpen ||
    !!photoEditorFile;

  useEffect(() => {
    if (!isOpen || stockUsbClaimBlocked) return;
    setActiveBarcodeScanClaim((raw) => {
      const code = normalizeBarcodeInput(raw);
      if (!code) return false;
      if (isLabOsQrPayload(code)) return false;
      setScanHubOpen(true);
      setScanHubExternal({ code, token: Date.now() });
      return true;
    });
    return () => setActiveBarcodeScanClaim(null);
  }, [isOpen, stockUsbClaimBlocked]);

  /** Intenção vinda da leitura USB global (editar / cadastrar / saída). */
  useEffect(() => {
    if (!isOpen || !bootIntent) return;
    const intent = bootIntent;
    onBootIntentConsumed?.();
    if (intent.type === 'create') {
      openCreateRegistration(intent.barcode);
      return;
    }
    if (intent.type === 'edit') {
      void openEditRegistration(intent.part);
      return;
    }
    if (intent.type === 'view') {
      void openProductView(intent.part);
      return;
    }
    if (intent.type === 'inbound') {
      setInboundPart(intent.part);
      return;
    }
    if (intent.type === 'outbound') {
      setOutboundInitialPart(intent.part);
      setOutboundMode(intent.mode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- consome uma vez por bootIntent
  }, [isOpen, bootIntent]);

  const handleOutboundStockChanged = useCallback(
    (updated: Pick<WorkshopPart, 'id' | 'stock_qty' | 'unit_price' | 'name'>) => {
      setParts((prev) =>
        prev.map((p) =>
          p.id === updated.id
            ? { ...p, stock_qty: Number(updated.stock_qty), unit_price: Number(updated.unit_price ?? p.unit_price) }
            : p
        )
      );
      setViewPart((prev) =>
        prev && prev.id === updated.id
          ? { ...prev, stock_qty: Number(updated.stock_qty), unit_price: Number(updated.unit_price ?? prev.unit_price) }
          : prev
      );
      setInboundPart((prev) =>
        prev && prev.id === updated.id
          ? { ...prev, stock_qty: Number(updated.stock_qty), unit_price: Number(updated.unit_price ?? prev.unit_price) }
          : prev
      );
    },
    []
  );

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

    <ModalPortal manageBackLayer onRequestClose={onClose}>
    <div
      className={`${desktopShellViewportOverlayClass(isDesktopShell, SETTINGS_CHILD_MODAL_Z)} flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-[#F4F5F7] dark:bg-zinc-950 p-0${isDesktopShell ? '' : ' h-[100dvh] max-h-[100dvh]'}`}
    >
      <div className="relative flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden bg-[#F4F5F7] dark:bg-zinc-950">
        {!isDesktopShell ? (
          <button
            type="button"
            onClick={onClose}
            className={`${iosModalClose} top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))]`}
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        ) : null}

        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          {!isDesktopShell ? (
          <div className="px-6 sm:px-8 pt-[max(2rem,env(safe-area-inset-top)+0.75rem)] pb-4 pr-14 shrink-0">
            <IosModalHeader
              icon={<img src="/icons/estoque-ios.png" alt="" className="h-full w-full min-h-0 object-cover" />}
              title="ESTOQUE"
              subtitle="Peças, categorias e alertas de estoque"
              gradientClass="from-emerald-600 to-teal-800"
            />
          </div>
          ) : (
          <div className="shrink-0 pt-3" aria-hidden />
          )}

        {isAnalyticsOpen ? (
          <WorkshopPartsAnalyticsView onBack={() => setIsAnalyticsOpen(false)} />
        ) : (
          <WorkshopPartsHomeDashboard
            loading={loading}
            error={error}
            parts={parts}
            filteredParts={filteredParts}
            partsInCategoryScopeCount={partsInCategoryScope.length}
            partsAfterStockFilterEmpty={partsAfterStockFilter.length === 0 && stockAlertFilter !== 'all'}
            categories={categories}
            categoryCounts={categoryCounts}
            stockAlerts={stockAlertsGlobal}
            pendingReservations={pendingReservations}
            reservationsExpanded={reservationsExpanded}
            onToggleReservations={() => setReservationsExpanded((v) => !v)}
            reservedQtyByPartId={reservedQtyByPartId}
            partNumberById={partNumberById}
            categoryFilter={categoryFilter}
            categoryFilterLabel={categoryFilterLabel}
            categoryFilterOptions={categoryFilterOptions}
            categoryFilterMenuOpen={categoryFilterMenuOpen}
            setCategoryFilterMenuOpen={setCategoryFilterMenuOpen}
            categoryFilterDropdownRef={categoryFilterDropdownRef}
            onCategoryFilterChange={setCategoryFilter}
            stockAlertFilter={stockAlertFilter}
            onStockAlertFilterChange={setStockAlertFilter}
            partsSearchQuery={partsSearchQuery}
            onPartsSearchQueryChange={setPartsSearchQuery}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
            categoryNamesForPart={categoryNamesForPart}
            onOpenScan={() => setScanHubOpen(true)}
            onOpenAnalytics={() => setIsAnalyticsOpen(true)}
            onOpenCategories={() => setIsCategoriesModalOpen(true)}
            onAddPart={() => openCreateRegistration()}
            onOpenPart={(p) => void openProductView(p)}
            onEditPart={(p) => void openEditRegistration(p)}
            onDeletePart={(id) => handleDelete(id)}
            editingId={editingId}
            editingName={editingName}
            editingPrice={editingPrice}
            editingStock={editingStock}
            onEditingNameChange={setEditingName}
            onEditingPriceChange={setEditingPrice}
            onEditingStockChange={setEditingStock}
            onSaveEdit={() => void handleSaveEdit()}
            onCancelEdit={cancelEdit}
          />

        )}
        </div>
      </div>
    </div>

    {registrationMode ? (
      <RegistrationPortal>
      <div
        className={
          isDesktopShell
            ? `${desktopShellPortaledChildOverlayClass(isDesktopShell, NESTED_STOCK_OVERLAY_Z)} flex min-h-0 w-full flex-col overflow-hidden bg-white dark:bg-zinc-950`
            : `${desktopShellPortaledChildOverlayClass(false, NESTED_STOCK_OVERLAY_Z)} flex items-center justify-center bg-black/50 p-2 sm:p-4`
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
              : 'relative flex w-full max-w-[min(98vw,1280px)] max-h-[min(94dvh,calc(100dvh-2rem))] flex-col overflow-hidden rounded-[2rem] border-0 bg-white shadow-none dark:bg-zinc-950 sm:rounded-[2.25rem]'
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
                prefillBarcode={registrationMode === 'create' ? registrationPrefillBarcode : null}
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
              ? `${desktopShellPortaledChildOverlayClass(isDesktopShell, NESTED_STOCK_OVERLAY_Z)} flex min-h-0 w-full flex-col overflow-hidden bg-white dark:bg-zinc-950`
              : `${desktopShellPortaledChildOverlayClass(false, NESTED_STOCK_OVERLAY_Z)} flex items-center justify-center bg-black/50 p-2 sm:p-4`
          }
          onClick={isDesktopShell ? undefined : handleViewBackdropClick}
          role="presentation"
        >
          <div
            className={
              isDesktopShell
                ? 'relative flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950'
                : 'relative flex w-full max-w-[min(98vw,1280px)] max-h-[min(94dvh,calc(100dvh-2rem))] flex-col overflow-hidden rounded-[2rem] border-0 bg-white shadow-none dark:bg-zinc-950 sm:rounded-[2.25rem]'
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
                  ? 'shrink-0 border-b border-zinc-200/70 bg-white px-6 pb-4 pt-[max(2rem,env(safe-area-inset-top)+0.75rem)] pr-28 dark:border-white/[0.06] dark:bg-transparent sm:px-8'
                  : 'shrink-0 border-b border-zinc-200/70 bg-white px-6 pb-4 pt-8 pr-28 dark:border-white/[0.06] dark:bg-transparent'
              }
            >
              <IosModalHeader
                icon={<img src="/icons/estoque-ios.png" alt="" className="h-full w-full min-h-0 object-cover" />}
                title="Estoque — visualização"
                subtitle={
                  partNumberById.get(viewPart.id) != null
                    ? `#${partNumberById.get(viewPart.id)} · ${viewPart.brand?.trim() || '—'} / ${viewPart.name} / ${viewPart.location?.trim() || '—'}`
                    : `${viewPart.brand?.trim() || '—'} / ${viewPart.name} / ${viewPart.location?.trim() || '—'}`
                }
                gradientClass="from-emerald-500 to-teal-700"
              />
            </div>
            <button
              type="button"
              disabled={loadingViewPart}
              onClick={() => {
                const part = parts.find((p) => p.id === viewPart.id) ?? viewPart;
                const photoUrls = viewPhotos
                  .map((slot) => (slot.remoteUrl ?? slot.previewUrl)?.trim())
                  .filter((url): url is string => !!url);
                printWorkshopPartSheet({
                  part,
                  catalogNumber: partNumberById.get(viewPart.id),
                  categories,
                  purchases: viewPurchases,
                  photoUrls,
                  labContext: viewLabContext,
                });
              }}
              className={
                isDesktopShell
                  ? `${iosModalClose} top-[max(1rem,env(safe-area-inset-top))] right-[max(4.25rem,env(safe-area-inset-right)+3.25rem)] !bg-teal-600 !text-white hover:!bg-teal-500`
                  : `${iosModalClose} right-14 !bg-teal-600 !text-white hover:!bg-teal-500`
              }
              aria-label="Imprimir ficha"
              title="Imprimir ficha"
            >
              <Printer className="w-5 h-5" />
            </button>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-auto touch-pan-y bg-white px-6 py-6 sm:px-8 custom-scrollbar [scrollbar-gutter:stable] dark:bg-transparent">
              <WorkshopPartDetailView
                part={parts.find((p) => p.id === viewPart.id) ?? viewPart}
                catalogNumber={partNumberById.get(viewPart.id)}
                photos={viewPhotos}
                purchases={viewPurchases}
                categories={categories}
                labContext={viewLabContext}
                loading={loadingViewPart}
                onEdit={handleEditFromView}
                onDelete={() => void handleDelete(viewPart.id)}
                onPartUpdated={(updated) => {
                  setParts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
                  setViewPart((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
                }}
              />
            </div>
          </div>
        </div>
      </RegistrationPortal>
    ) : null}

    {isCategoriesModalOpen && (
      <RegistrationPortal>
      <div
        className={`${desktopShellPortaledChildOverlayClass(isDesktopShell, NESTED_STOCK_OVERLAY_Z)} flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-[12px]`}
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
              subtitle="Grupos para filtrar e organizar peças"
              gradientClass="from-emerald-500 to-teal-700"
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 py-5 space-y-4">
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
              Crie categorias e depois vincule cada peça pelo detalhe do item ou ao cadastrar. Excluir uma categoria não apaga peças.
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
                className="flex-1 min-w-0 rounded-xl border-0 bg-zinc-100 dark:bg-white/5 px-4 py-3 text-[15px] text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/35"
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
            <ul className="divide-y divide-zinc-200/60 dark:divide-white/[0.08] rounded-xl border-0 overflow-hidden bg-zinc-50/80 dark:bg-white/[0.03]">
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
                          className="flex-1 min-w-[120px] rounded-lg border-0 bg-zinc-100 dark:bg-white/5 px-3 py-2 text-[15px] text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/35"
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
      </RegistrationPortal>
    )}

    {scanHubOpen ? (
      <WorkshopPartScanHubModal
        isOpen
        onClose={() => {
          setScanHubOpen(false);
          setScanHubExternal(null);
        }}
        catalogParts={parts}
        externalScanCode={scanHubExternal?.code ?? null}
        externalScanToken={scanHubExternal?.token ?? null}
        onExternalScanConsumed={() => setScanHubExternal(null)}
        onEditProduct={(part) => {
          void openEditRegistration(part);
        }}
        onStockEntry={(part) => {
          setInboundPart(part);
        }}
        onRegisterProduct={(barcode) => {
          openCreateRegistration(barcode);
        }}
        onSaleOutbound={(part) => {
          setOutboundInitialPart(part);
          setOutboundMode('sale');
        }}
        onConsumableOutbound={(part) => {
          setOutboundInitialPart(part);
          setOutboundMode('consumable');
        }}
      />
    ) : null}

    {inboundPart ? (
      <WorkshopPartStockInboundModal
        isOpen
        part={inboundPart}
        onClose={() => setInboundPart(null)}
        onStockChanged={(updated) => {
          handleOutboundStockChanged(updated);
          setInboundPart(updated);
        }}
        onOpenFullEdit={(part) => {
          setInboundPart(null);
          void openEditRegistration(part);
        }}
      />
    ) : null}

    {outboundMode ? (
      <WorkshopPartStockOutboundModal
        isOpen
        mode={outboundMode}
        initialPart={outboundInitialPart}
        onClose={() => {
          setOutboundMode(null);
          setOutboundInitialPart(null);
        }}
        onStockChanged={handleOutboundStockChanged}
        catalogParts={parts}
        onRegisterMissingProduct={openRegisterFromMissingBarcode}
      />
    ) : null}

    <StockGuardPasswordModal
      open={stockGuardOpen}
      title={
        registrationMode === 'create'
          ? 'Confirmar cadastro da peça'
          : 'Confirmar alteração da peça'
      }
      subtitle="Use a senha da Gerência ou a senha de proteção do estoque (Alterar senhas)."
      confirmLabel={registrationMode === 'create' ? 'Autorizar cadastro' : 'Autorizar alteração'}
      error={stockGuardError}
      busy={stockGuardBusy}
      onClose={closeStockGuard}
      onConfirm={handleStockGuardConfirm}
    />
    </ModalPortal>
    </>
  );
};

