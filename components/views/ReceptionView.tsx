import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { Car, User, Smartphone, Mail, FileText, ArrowRight, MapPin, Hash, ShieldCheck, Map, Building2, X, Check, MessageSquare, Paperclip, Download, ZoomIn, Eye, ExternalLink, Eraser, Camera, Image as ImageIcon, Calendar, Package, History, Search, RefreshCw, Calculator, ArchiveRestore, Copy, Sparkles, Loader2 } from 'lucide-react';
import {
  iosModalShell,
  iosModalClose,
  iosLabel,
  iosPageGlass,
} from '../ui/iosModalStyles';
import { IosAccentIconSquircle } from '../ui/IosAccentIconSquircle';
import { IosModalHeader } from '../ui/IosModalHeader';
import { Customer, ProcessingStatus } from '../../types';
import { Input, TextArea } from '../ui/Input';
import { ProcessingOverlay } from '../ProcessingOverlay';
import {
  saveReceptionIntake,
  consultPlacaFipe,
  uploadServiceOrderPhoto,
  getServiceOrders,
  getServiceOrderBudgets,
  budgetLastActivityMs,
  budgetChronologicalNumber,
  getServiceOrderById,
  getServiceOrderPhotos,
  getServiceOrderComments,
  updateServiceOrderStatus,
  type ServiceOrderListItem,
  type SavedBudgetFromApi,
  type ServiceOrderType,
  type ServiceOrderDetail,
  type ServiceOrderComment,
  type ServiceOrderUpdateActor,
} from '../../services/apiService';
import { BrazilFlagIcon } from '../ui/BrazilFlagIcon';
import { StorageThumbImg } from '../ui/StorageThumbImg';
import { ModalPortal } from '../ui/ModalPortal';
import { PdfViewerModal } from '../PdfViewerModal';
import { useServiceOrderLiveSync } from '../../hooks/useServiceOrderLiveSync';
import { formatLaborLabel } from '../../utils/workshopLaborFormat';
import { budgetHasExplicitApprovalDecisions, budgetReadRowClass } from '../../utils/budgetItemDisplay';
import { markdownComponentsApp } from '../ui/markdownUi';
import { uiReadBody, uiSectionTitleRow } from '../ui/appTypography';
import { firstTwoNames } from '../../utils/personNameFormat';
import { BOARD_PANORAMIC_ZOOM } from '../../utils/patioBoardGlassCard';
import { PatioStyleArchiveBoardCard } from '../patio/PatioStyleArchiveBoardCard';

const ARCHIVED_PHOTOS_BATCH = 8;

/** Máximo de fotos opcionais na criação da ficha (recepção). */
const MAX_RECEPTION_INTAKE_PHOTOS = 12;

function isLikelyImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  const n = file.name.toLowerCase();
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(n);
}

function newReceptionIntakePhotoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `rf_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

type ReceptionIntakePhoto = { id: string; file: Blob; url: string };

const RECEPTION_MODE_KEY = 'app_reception_mode';
const VEHICLE_CATEGORIES = ['Compacto', 'Médio/SUV', 'Pick-Up', 'Premium'] as const;
type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

const receptionSectionShell =
  'overflow-hidden rounded-[24px] border border-zinc-300/70 bg-white shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12),0_2px_12px_-6px_rgba(0,0,0,0.08)] dark:border-white/[0.08] dark:bg-zinc-900/40 dark:backdrop-blur-2xl dark:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.5)]';

const receptionSectionHeader =
  'relative border-b border-black/[0.06] bg-white dark:border-white/[0.08] dark:bg-zinc-950/25';

function sortArchivedOrdersNewestFirst(orders: ServiceOrderListItem[]): ServiceOrderListItem[] {
  return [...orders].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

interface ReceptionViewProps {
  initialData?: Customer | null;
  onDataLoaded?: () => void;
  forcedMode?: ServiceOrderType | null;
  /** Modo cinematográfico: embaçar placas exibidas (para gravar tela / redes sociais). */
  blurPlates?: boolean;
  /** Preencher o formulário com dados da OS (igual ao Pátio: "Usar cadastro"). */
  onUseCustomerData?: (data: Customer) => void;
  /** Quem registra o desarquivamento na API (igual ao Pátio). */
  actorOptions?: ServiceOrderUpdateActor;
  /** Após criar OS com sucesso (ex.: voltar ao Pátio ou Laboratório). */
  onIntakeSuccess?: (orderType: ServiceOrderType) => void;
  /** Mantém o destino do gesto/botão voltar alinhado ao modo veículo vs módulo (fluxo Pátio/Lab → recepção). */
  onReceptionModeChangeForBack?: (mode: ServiceOrderType) => void;
  /** KeepAlive: pausa polling do histórico quando outra aba está visível. */
  isReceptionTabActive?: boolean;
}

function attachmentMimeType(name: string): string {
  const n = (name || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (/\.(jpg|jpeg|png|gif|webp|heic|heif|bmp)$/.test(n)) return 'image/*';
  return 'application/octet-stream';
}

function normalizePlacaLocal(raw: string) {
  return String(raw ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8);
}

export const ReceptionView: React.FC<ReceptionViewProps> = ({
  initialData,
  onDataLoaded,
  forcedMode = null,
  blurPlates = false,
  onUseCustomerData,
  actorOptions,
  onIntakeSuccess,
  onReceptionModeChangeForBack,
  isReceptionTabActive = true,
}) => {
  const [receptionMode, setReceptionMode] = useState<ServiceOrderType>(() => {
    try {
      const v = localStorage.getItem(RECEPTION_MODE_KEY);
      return (v === 'module' ? 'module' : 'vehicle') as ServiceOrderType;
    } catch {
      return 'vehicle';
    }
  });

  const [customer, setCustomer] = useState<Customer>({
    name: '',
    cpf: '',
    phone: '',
    email: '',
    cep: '',
    address: '',
    city: '',
    addressNumber: '',
    vehicleBrand: '',
    vehicleModel: '',
    moduleIdentification: '',
    plate: '',
    vehicleColor: '',
    vehicleYear: '',
    vehicleEngineInfo: '',
    mileageKm: '',
    issueDescription: ''
  });

  const [status, setStatus] = useState<ProcessingStatus>({ step: 'idle' });
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory | ''>('');
  const [plateLookupLoading, setPlateLookupLoading] = useState(false);
  const [plateLookupError, setPlateLookupError] = useState<string | null>(null);
  const lastFetchedPlacaRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(RECEPTION_MODE_KEY, receptionMode);
    } catch (_) {}
  }, [receptionMode]);

  useEffect(() => {
    if (!forcedMode) return;
    setReceptionMode(forcedMode);
  }, [forcedMode]);

  useEffect(() => {
    onReceptionModeChangeForBack?.(receptionMode);
  }, [receptionMode, onReceptionModeChangeForBack]);

  // Refs — fotos: câmera (capture) vs galeria (múltiplas)
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [intakePhotos, setIntakePhotos] = useState<ReceptionIntakePhoto[]>([]);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const historySearchRef = useRef(historySearch);
  historySearchRef.current = historySearch;
  const [historyLoading, setHistoryLoading] = useState(false);
  const [archivedOrders, setArchivedOrders] = useState<ServiceOrderListItem[]>([]);
  const [expandedHistoryOrderId, setExpandedHistoryOrderId] = useState<string | null>(null);
  const [historyBudgetsByOrder, setHistoryBudgetsByOrder] = useState<Record<string, SavedBudgetFromApi[]>>({});
  /** Só true após GET com sucesso; evita travar retry quando houve erro (array vazio é truthy em JS). */
  const [historyBudgetsFetchOk, setHistoryBudgetsFetchOk] = useState<Record<string, boolean>>({});
  const [historyBudgetsLoadingId, setHistoryBudgetsLoadingId] = useState<string | null>(null);
  const [historyBudgetErrorByOrder, setHistoryBudgetErrorByOrder] = useState<Record<string, string>>({});
  const [historyBudgetDetail, setHistoryBudgetDetail] = useState<SavedBudgetFromApi | null>(null);
  const historyBudgetDetailRef = useRef(historyBudgetDetail);
  historyBudgetDetailRef.current = historyBudgetDetail;
  const historyBudgetApprovalContrast = useMemo(
    () =>
      historyBudgetDetail != null &&
      budgetHasExplicitApprovalDecisions(historyBudgetDetail.services, historyBudgetDetail.parts),
    [historyBudgetDetail]
  );
  const [archivedDetailOrderId, setArchivedDetailOrderId] = useState<string | null>(null);
  const [archivedDetailLoading, setArchivedDetailLoading] = useState(false);
  const [archivedDetailData, setArchivedDetailData] = useState<ServiceOrderDetail | null>(null);
  const [archivedDetailPhotos, setArchivedDetailPhotos] = useState<
    { id: string; name: string; url: string; mimeType: string }[]
  >([]);
  const [archivedDetailComments, setArchivedDetailComments] = useState<ServiceOrderComment[]>([]);
  const [archivedPhotosVisibleCount, setArchivedPhotosVisibleCount] = useState(ARCHIVED_PHOTOS_BATCH);
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null);
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);

  const [isDesktopLandscape, setIsDesktopLandscape] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px) and (orientation: landscape)');
    const apply = () => setIsDesktopLandscape(mq.matches);
    apply();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, []);

  const historyBoardPanoramic = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      const key =
        receptionMode === 'module' ? 'patio-board-panoramic-module' : 'patio-board-panoramic-vehicle';
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }, [isHistoryOpen, receptionMode]);

  useEffect(() => {
    setArchivedPhotosVisibleCount(ARCHIVED_PHOTOS_BATCH);
  }, [archivedDetailOrderId]);

  // Efeito para carregar dados iniciais vindos do Pátio ou Histórico (todos editáveis, inclusive placa)
  useEffect(() => {
    if (initialData) {
      setCustomer((prev) => ({
        ...prev,
        name: initialData.name ?? prev.name,
        phone: initialData.phone ?? prev.phone,
        email: initialData.email ?? prev.email,
        cpf: initialData.cpf ?? prev.cpf,
        cep: initialData.cep ?? prev.cep,
        address: initialData.address ?? prev.address,
        city: initialData.city ?? prev.city ?? '',
        addressNumber: initialData.addressNumber ?? prev.addressNumber,
        vehicleBrand: initialData.vehicleBrand ?? prev.vehicleBrand,
        vehicleModel: initialData.vehicleModel ?? prev.vehicleModel,
        moduleIdentification: initialData.moduleIdentification ?? prev.moduleIdentification,
        plate: initialData.plate ?? prev.plate,
        vehicleColor: initialData.vehicleColor ?? prev.vehicleColor,
        vehicleYear: initialData.vehicleYear ?? prev.vehicleYear,
        vehicleEngineInfo: initialData.vehicleEngineInfo ?? prev.vehicleEngineInfo,
        mileageKm: initialData.mileageKm ?? prev.mileageKm,
        issueDescription: initialData.issueDescription ?? prev.issueDescription,
        trelloCardId: initialData.trelloCardId,
      }));
      if (onDataLoaded) onDataLoaded();
    }
  }, [initialData, onDataLoaded]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCustomer(prev => ({ ...prev, [name]: value }));
  };

  const removeIntakePhoto = useCallback((id: string) => {
    setIntakePhotos((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) {
        try {
          URL.revokeObjectURL(found.url);
        } catch {
          /* ignore */
        }
      }
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const addIntakePhotosFromFiles = useCallback((files: Iterable<File>) => {
    const list = Array.from(files).filter((f) => isLikelyImageFile(f));
    if (list.length === 0) return;
    setIntakePhotos((prev) => {
      const room = MAX_RECEPTION_INTAKE_PHOTOS - prev.length;
      if (room <= 0) return prev;
      const toAdd = list.slice(0, room);
      const next: ReceptionIntakePhoto[] = [...prev];
      for (const file of toAdd) {
        next.push({ id: newReceptionIntakePhotoId(), file, url: URL.createObjectURL(file) });
      }
      if (list.length > room) {
        window.alert(`Só é possível anexar até ${MAX_RECEPTION_INTAKE_PHOTOS} fotos por ficha. As extras foram ignoradas.`);
      }
      return next;
    });
  }, []);

  const handleCameraInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = input.files;
    if (files && files.length > 0) {
      addIntakePhotosFromFiles([files[0]]);
    }
    input.value = '';
  };

  const handleGalleryInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = input.files;
    if (files && files.length > 0) {
      addIntakePhotosFromFiles(Array.from(files));
    }
    input.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nameTrim = (customer.name ?? '').trim();
    const phoneTrim = (customer.phone ?? '').trim();
    const issueTrim = (customer.issueDescription ?? '').trim();

    if (!nameTrim) {
      setStatus({ step: 'error', message: 'Preencha o nome completo.' });
      return;
    }
    if (!phoneTrim) {
      setStatus({ step: 'error', message: 'Preencha o telefone.' });
      return;
    }
    const phoneDigits = phoneTrim.replace(/\D/g, '');
    if (phoneDigits.length < 8) {
      setStatus({ step: 'error', message: 'Informe um telefone válido (mínimo 8 dígitos).' });
      return;
    }
    if (!issueTrim) {
      setStatus({ step: 'error', message: 'Preencha a queixa do cliente.' });
      return;
    }

    const isModule = receptionMode === 'module';
    if (!isModule) {
      if (!vehicleCategory) {
        setStatus({
          step: 'error',
          message: 'Selecione a categoria do veículo: Compacto, Médio/SUV, Pick-Up ou Premium.',
        });
        return;
      }
      const p = normalizePlacaLocal(customer.plate);
      if (p.length < 7) {
        setStatus({
          step: 'error',
          message: 'Preencha a placa completa (mín. 7 caracteres).',
        });
        return;
      }
    }

    try {
      setStatus({
        step: 'creating',
        message: intakePhotos.length > 0 ? 'Criando ficha e enviando fotos…' : 'Criando cadastro',
      });
      const { customer: savedCustomer, serviceOrder } = await saveReceptionIntake(
        { ...customer, issueDescription: customer.issueDescription },
        receptionMode,
        receptionMode === 'vehicle' ? vehicleCategory : null
      );

      // Fotos opcionais (câmera/galeria) — envio sequencial com compressão no cliente (uploadServiceOrderPhoto)
      if (serviceOrder?.id && intakePhotos.length > 0) {
        const photosSnapshot = [...intakePhotos];
        for (let i = 0; i < photosSnapshot.length; i++) {
          const shot = photosSnapshot[i];
          await uploadServiceOrderPhoto(
            serviceOrder.id,
            shot.file,
            `entrada_${serviceOrder.id}_${i + 1}_${Date.now()}.jpg`
          );
        }
      }

      const osLabel = serviceOrder?.os_number != null ? ` OS #${serviceOrder.os_number}.` : '';
      setStatus({ step: 'success', message: `Cadastro criado com sucesso.${osLabel}` });
      onIntakeSuccess?.(receptionMode);
    } catch (error: any) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setStatus({ step: 'error', message: `Erro: ${errorMessage}` });
    }
  };

  const resetForm = () => {
    setCustomer({
      name: '',
      cpf: '',
      phone: '',
      email: '',
      cep: '',
      address: '',
      city: '',
      addressNumber: '',
      vehicleBrand: '',
      vehicleModel: '',
      moduleIdentification: '',
      plate: '',
      vehicleColor: '',
      vehicleYear: '',
      vehicleEngineInfo: '',
      mileageKm: '',
      issueDescription: '',
      trelloCardId: undefined
    });
    setIntakePhotos((prev) => {
      prev.forEach((p) => {
        try {
          URL.revokeObjectURL(p.url);
        } catch {
          /* ignore */
        }
      });
      return [];
    });
    setVehicleCategory('');
    setPlateLookupError(null);
    lastFetchedPlacaRef.current = null;
    setStatus({ step: 'idle' });
  };

  const runPlacaLookup = useCallback(
    async (force?: boolean) => {
      if (receptionMode !== 'vehicle') return;
      const p = normalizePlacaLocal(customer.plate);
      if (p.length < 7) {
        setPlateLookupError('Informe a placa completa (mín. 7 caracteres).');
        return;
      }
      if (!force && lastFetchedPlacaRef.current === p) return;
      setPlateLookupError(null);
      setPlateLookupLoading(true);
      try {
        const result = await consultPlacaFipe(p);
        lastFetchedPlacaRef.current = normalizePlacaLocal(result.plate || p);
        setCustomer((prev) => ({
          ...prev,
          plate: (result.plate || p).toUpperCase(),
          vehicleBrand: result.vehicleBrand?.trim() || prev.vehicleBrand,
          vehicleModel: result.vehicleModel?.trim() || prev.vehicleModel,
          vehicleColor: result.vehicleColor?.trim() || prev.vehicleColor,
          vehicleYear: result.vehicleYear?.trim() || prev.vehicleYear,
          vehicleEngineInfo: result.vehicleEngineInfo?.trim() || prev.vehicleEngineInfo,
        }));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Falha na consulta.';
        setPlateLookupError(msg);
      } finally {
        setPlateLookupLoading(false);
      }
    },
    [receptionMode, customer.plate]
  );

  useEffect(() => {
    const p = normalizePlacaLocal(customer.plate);
    if (lastFetchedPlacaRef.current != null && p !== lastFetchedPlacaRef.current) {
      lastFetchedPlacaRef.current = null;
    }
  }, [customer.plate]);

  const loadVehicleHistory = useCallback(async (term = '') => {
    setHistoryLoading(true);
    try {
      const rows = await getServiceOrders('CANCELLED', receptionMode);
      const t = term.trim().toLowerCase();
      const filtered = t
        ? rows.filter((o) =>
            (o.plate || '').toLowerCase().includes(t) ||
            (o.module_identification || '').toLowerCase().includes(t) ||
            (o.vehicle_model || '').toLowerCase().includes(t) ||
            (o.vehicle_brand || '').toLowerCase().includes(t) ||
            (o.customer_name || o.customers?.name || '').toLowerCase().includes(t)
          )
        : rows;
      setArchivedOrders(sortArchivedOrdersNewestFirst(filtered));
    } catch (e) {
      console.error(e);
      setArchivedOrders([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [receptionMode]);

  const loadVehicleHistoryRef = useRef(loadVehicleHistory);
  loadVehicleHistoryRef.current = loadVehicleHistory;

  useEffect(() => {
    if (isHistoryOpen) void loadVehicleHistory(historySearchRef.current ?? '');
  }, [isHistoryOpen, receptionMode, loadVehicleHistory]);

  /** Mantém lista / filtro do histórico atualizados com o modal aberto (≥60s; pausa fora da aba). */
  useEffect(() => {
    if (!isHistoryOpen || !isReceptionTabActive) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const term = historySearchRef.current ?? '';
      void loadVehicleHistoryRef.current(term);
    };
    const id = window.setInterval(tick, 60000);
    return () => window.clearInterval(id);
  }, [isHistoryOpen, isReceptionTabActive]);

  useEffect(() => {
    if (!isHistoryOpen) {
      setHistoryBudgetDetail(null);
      setExpandedHistoryOrderId(null);
      setArchivedDetailOrderId(null);
      setArchivedDetailData(null);
      setArchivedDetailPhotos([]);
      setArchivedDetailComments([]);
    }
  }, [isHistoryOpen]);

  const handleToggleHistoryBudgets = async (serviceOrderId: string) => {
    if (expandedHistoryOrderId === serviceOrderId) {
      setExpandedHistoryOrderId(null);
      return;
    }

    setExpandedHistoryOrderId(serviceOrderId);
    if (historyBudgetsFetchOk[serviceOrderId]) return;

    setHistoryBudgetsLoadingId(serviceOrderId);
    setHistoryBudgetErrorByOrder((prev) => ({ ...prev, [serviceOrderId]: '' }));
    try {
      const budgets = await getServiceOrderBudgets(serviceOrderId);
      setHistoryBudgetsByOrder((prev) => ({ ...prev, [serviceOrderId]: budgets }));
      setHistoryBudgetsFetchOk((prev) => ({ ...prev, [serviceOrderId]: true }));
    } catch (err: any) {
      setHistoryBudgetErrorByOrder((prev) => ({
        ...prev,
        [serviceOrderId]: err?.message ?? 'Falha ao carregar orçamentos.',
      }));
    } finally {
      setHistoryBudgetsLoadingId(null);
    }
  };

  const handleRetryHistoryBudgets = async (serviceOrderId: string) => {
    setHistoryBudgetsFetchOk((prev) => ({ ...prev, [serviceOrderId]: false }));
    setHistoryBudgetErrorByOrder((prev) => ({ ...prev, [serviceOrderId]: '' }));
    setHistoryBudgetsLoadingId(serviceOrderId);
    try {
      const budgets = await getServiceOrderBudgets(serviceOrderId);
      setHistoryBudgetsByOrder((prev) => ({ ...prev, [serviceOrderId]: budgets }));
      setHistoryBudgetsFetchOk((prev) => ({ ...prev, [serviceOrderId]: true }));
    } catch (err: any) {
      setHistoryBudgetErrorByOrder((prev) => ({
        ...prev,
        [serviceOrderId]: err?.message ?? 'Falha ao carregar orçamentos.',
      }));
    } finally {
      setHistoryBudgetsLoadingId(null);
    }
  };

  const openArchivedDetail = async (order: ServiceOrderListItem) => {
    setArchivedDetailOrderId(order.id);
    setArchivedDetailLoading(true);
    setArchivedDetailData(null);
    setArchivedDetailPhotos([]);
    setArchivedDetailComments([]);
    try {
      const [detail, photos, comments] = await Promise.all([
        getServiceOrderById(order.id),
        getServiceOrderPhotos(order.id),
        getServiceOrderComments(order.id).catch(() => [] as ServiceOrderComment[]),
      ]);
      setArchivedDetailData(detail);
      setArchivedDetailPhotos(
        photos.map((p, i) => ({
          id: p.path || String(i),
          name: p.name,
          url: p.url,
          mimeType: attachmentMimeType(p.name),
        }))
      );
      setArchivedDetailComments(comments);
    } catch (e: any) {
      alert(e?.message ?? 'Erro ao carregar detalhes.');
      setArchivedDetailOrderId(null);
    } finally {
      setArchivedDetailLoading(false);
    }
  };

  const handleUnarchiveFromDetail = async () => {
    if (!archivedDetailData) return;
    const id = archivedDetailData.id;
    setUnarchivingId(id);
    try {
      await updateServiceOrderStatus(id, 'FINALIZADO', actorOptions ?? { actor: 'admin' });
      setArchivedDetailOrderId(null);
      setArchivedDetailData(null);
      setArchivedDetailPhotos([]);
      setArchivedDetailComments([]);
      await loadVehicleHistory(historySearch);
    } catch (e: any) {
      alert(e?.message ?? 'Erro ao desarquivar.');
    } finally {
      setUnarchivingId(null);
    }
  };

  const handleUseRegistrationFromDetail = () => {
    if (!archivedDetailData || !onUseCustomerData) return;
    const detail = archivedDetailData;
    const c = detail.customers;
    const customerData: Customer = {
      name: c?.name ?? '',
      cpf: c?.cpf ?? '',
      phone: c?.phone ?? '',
      email: c?.email ?? undefined,
      cep: c?.cep ?? '',
      address: c?.address ?? '',
      addressNumber: c?.address_number ?? '',
      city: c?.city ?? '',
      vehicleBrand: detail.vehicle_brand ?? '',
      vehicleModel: detail.vehicle_model ?? '',
      moduleIdentification: detail.module_identification ?? undefined,
      plate: (detail.plate || '').toUpperCase(),
      vehicleColor: detail.vehicle_color ?? '',
      vehicleYear: detail.vehicle_year ?? '',
      vehicleEngineInfo: detail.vehicle_engine_info ?? '',
      /** Nova OS: não reaproveitar km da OS arquivada. */
      mileageKm: '',
      issueDescription: '',
    };
    const mode: ServiceOrderType = detail.order_type === 'module' ? 'module' : 'vehicle';
    try {
      localStorage.setItem(RECEPTION_MODE_KEY, mode);
    } catch (_) {}
    setReceptionMode(mode);
    setArchivedDetailOrderId(null);
    setArchivedDetailData(null);
    setArchivedDetailPhotos([]);
    setArchivedDetailComments([]);
    setIsHistoryOpen(false);
    onUseCustomerData(customerData);
  };

  const closeArchivedDetail = () => {
    setArchivedDetailOrderId(null);
    setArchivedDetailData(null);
    setArchivedDetailPhotos([]);
    setArchivedDetailComments([]);
  };

  const silentReloadArchivedDetail = useCallback(async () => {
    if (!archivedDetailOrderId) return;
    try {
      const [detail, photos, comments] = await Promise.all([
        getServiceOrderById(archivedDetailOrderId),
        getServiceOrderPhotos(archivedDetailOrderId),
        getServiceOrderComments(archivedDetailOrderId).catch(() => [] as ServiceOrderComment[]),
      ]);
      setArchivedDetailData(detail);
      setArchivedDetailPhotos(
        photos.map((p, i) => ({
          id: p.path || String(i),
          name: p.name,
          url: p.url,
          mimeType: attachmentMimeType(p.name),
        }))
      );
      setArchivedDetailComments(comments);
    } catch {
      /* mantém estado anterior */
    }
  }, [archivedDetailOrderId]);

  useServiceOrderLiveSync(archivedDetailOrderId, silentReloadArchivedDetail, {
    enabled: !!archivedDetailOrderId,
    realtimeCustomerId: archivedDetailData?.customer_id,
    realtimeWorkshopId: archivedDetailData?.workshop_id,
  });

  const syncHistoryBudgetDetailFromServer = useCallback(async () => {
    const b = historyBudgetDetailRef.current;
    if (!b) return;
    try {
      const budgets = await getServiceOrderBudgets(b.serviceOrderId);
      setHistoryBudgetsByOrder((prev) => ({ ...prev, [b.serviceOrderId]: budgets }));
      const updated = budgets.find((x) => x.id === b.id);
      if (updated) setHistoryBudgetDetail(updated);
      else setHistoryBudgetDetail(null);
    } catch {
      /* mantém estado anterior */
    }
  }, []);

  useServiceOrderLiveSync(historyBudgetDetail?.serviceOrderId ?? null, syncHistoryBudgetDetailFromServer, {
    enabled: !!historyBudgetDetail,
    realtimeWorkshopId: (import.meta.env.VITE_WORKSHOP_ID as string | undefined) || undefined,
  });

  return (
    <div className="min-h-full w-full bg-gradient-to-b from-zinc-100/95 via-white/85 to-zinc-100/70 dark:from-zinc-950 dark:via-zinc-950/98 dark:to-zinc-900/90">
    <div className="w-full max-w-none mx-auto px-3 sm:px-4 md:px-6 pb-24 md:pb-28 pt-3 md:pt-6 animate-in fade-in duration-500">

      {/* Cabeçalho — mesmo padrão da página Agenda */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6 lg:mb-8">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 ml-[8%]">
          <IosAccentIconSquircle variant="page" strokeWidth={2.2}>
            <img src="/icons/recepcao-ios.png" alt="" className="h-full w-full object-cover" />
          </IosAccentIconSquircle>
          <div className="min-w-0">
            <h1 className="text-[22px] sm:text-[28px] font-semibold tracking-tight text-zinc-900 dark:text-white leading-tight">
              Recepção
            </h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <Sparkles className="w-3.5 h-3.5 text-[#007AFF] dark:text-[#7ab8ff] shrink-0" strokeWidth={2} />
              <span>Cadastro de clientes e veículos</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto justify-end">
          <button
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            className="inline-flex items-center gap-2 py-2.5 px-4 rounded-2xl text-sm font-semibold border border-zinc-200/80 dark:border-white/[0.1] bg-white/65 dark:bg-white/[0.06] backdrop-blur-xl text-zinc-800 dark:text-zinc-100 hover:bg-white/90 dark:hover:bg-white/10 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.08)] transition-all active:scale-[0.98] shrink-0"
            title="Consultar histórico de veículos arquivados"
          >
            <History className="w-4 h-4 text-[#007AFF] dark:text-[#7ab8ff]" />
            {receptionMode === 'module' ? 'Histórico de módulos' : 'Histórico de veículos'}
          </button>
        </div>
      </header>

      {/* Cartão principal — vidro iOS */}
      <div className={`${iosPageGlass} overflow-hidden`}>
        <div className="pointer-events-none absolute -top-32 -right-32 w-[22rem] h-[22rem] bg-gradient-to-br from-cyan-400/20 to-blue-600/10 rounded-full blur-3xl opacity-70" />
        <div className="pointer-events-none absolute -bottom-28 -left-20 w-[18rem] h-[18rem] bg-gradient-to-br from-sky-400/20 to-blue-600/10 rounded-full blur-3xl opacity-60" />

        <form
          onSubmit={handleSubmit}
          className="relative z-10 [&_input]:shadow-[0_4px_14px_-10px_rgba(0,0,0,0.28)] [&_textarea]:shadow-[0_4px_14px_-10px_rgba(0,0,0,0.28)] dark:[&_input]:shadow-none dark:[&_textarea]:shadow-none"
        >
          {/* Bloco único da ficha */}
          <div className={`${receptionSectionShell} w-full rounded-[calc(2rem-2px)] sm:rounded-[calc(2.25rem-2px)]`}>
            <div className="p-4 sm:p-5 lg:p-6">
          <div className="mb-4 flex justify-end">
             <button
               type="button"
               onClick={resetForm}
               className="inline-flex items-center gap-2 rounded-xl border border-[#007AFF]/25 bg-[#007AFF]/10 px-3 py-2 text-[12px] font-semibold text-[#007AFF] shadow-[0_6px_16px_-10px_rgba(0,122,255,0.45)] transition-all hover:bg-[#007AFF]/15 active:scale-[0.98] dark:border-[#64B5FF]/35 dark:bg-[#64B5FF]/12 dark:text-[#93c5fd]"
               title="Limpar todos os campos"
             >
               <Eraser className="h-4 w-4" />
               Limpar campos
             </button>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-7">
            {/* Dados do cliente — order-2: coluna direita no desktop; após veículo no mobile */}
            <div className="order-2 space-y-6">
              <h2 className="border-b border-zinc-200/80 pb-2 text-[14px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:border-white/[0.08] dark:text-zinc-200">
                Dados do cliente
              </h2>
              <div>
                <Input 
                  label="Nome Completo"
                  name="name"
                  placeholder="Ex: João da Silva"
                  value={customer.name}
                  onChange={handleInputChange}
                  icon={<User className="w-4 h-4" />}
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input 
                  label="CPF"
                  name="cpf"
                  placeholder="000.000.000-00"
                  value={customer.cpf}
                  onChange={handleInputChange}
                  icon={<ShieldCheck className="w-4 h-4" />}
                />
                <Input 
                  label="Telefone"
                  name="phone"
                  placeholder="(11) 99999-9999"
                  value={customer.phone}
                  onChange={handleInputChange}
                  icon={<Smartphone className="w-4 h-4" />}
                  required
                />
              </div>
              <div>
                <Input 
                  label="E-mail"
                  name="email"
                  placeholder="exemplo@email.com"
                  value={customer.email}
                  onChange={handleInputChange}
                  icon={<Mail className="w-4 h-4" />}
                />
              </div>
              <div>
                <Input 
                  label="Endereço"
                  name="address"
                  placeholder="Rua, Avenida, Bairro..."
                  value={customer.address}
                  onChange={handleInputChange}
                  icon={<Map className="w-4 h-4" />}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input 
                  label="CEP"
                  name="cep"
                  placeholder="00000-000"
                  value={customer.cep}
                  onChange={handleInputChange}
                  icon={<MapPin className="w-4 h-4" />}
                />
                <Input 
                  label="Nº"
                  name="addressNumber"
                  placeholder="123"
                  value={customer.addressNumber}
                  onChange={handleInputChange}
                  icon={<Hash className="w-4 h-4" />}
                />
              </div>
              <div>
                <Input 
                  label="Cidade"
                  name="city"
                  placeholder="Ex: São Paulo"
                  value={customer.city ?? ''}
                  onChange={handleInputChange}
                  icon={<Building2 className="w-4 h-4" />}
                />
              </div>
            </div>

            {/* Veículo/módulo + queixa (foto e enviar ficam em order-3) — order-1: coluna esquerda no desktop */}
            <div className="order-1 space-y-6">
              <h2 className="border-b border-zinc-200/80 pb-2 text-[14px] font-bold uppercase tracking-[0.08em] text-zinc-700 dark:border-white/[0.08] dark:text-zinc-200">
                {receptionMode === 'vehicle' ? 'Veículo e atendimento' : 'Módulo e atendimento'}
              </h2>

              {receptionMode === 'vehicle' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Marca / montadora"
                      name="vehicleBrand"
                      placeholder="Ex: Renault"
                      value={customer.vehicleBrand ?? ''}
                      onChange={handleInputChange}
                      icon={<FileText className="w-4 h-4" />}
                    />
                    <Input
                      label="Modelo (aparece no card)"
                      name="vehicleModel"
                      placeholder="Ex: Logan 1.6 — ou preencha pela placa"
                      value={customer.vehicleModel}
                      onChange={handleInputChange}
                      icon={<Car className="w-4 h-4" />}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="flex-1 min-w-0">
                          <Input
                            label="Placa"
                            name="plate"
                            placeholder="ABC1D23"
                            value={customer.plate ? String(customer.plate).toUpperCase() : ''}
                            onChange={(e) =>
                              setCustomer((prev) => ({ ...prev, plate: e.target.value.toUpperCase() }))
                            }
                            onBlur={() => void runPlacaLookup(false)}
                            className="uppercase"
                            maxLength={8}
                            icon={<FileText className="w-4 h-4" />}
                            required
                          />
                        </div>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => void runPlacaLookup(true)}
                          disabled={plateLookupLoading}
                          className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold border border-zinc-200/90 dark:border-white/[0.12] bg-white/90 dark:bg-white/[0.06] text-zinc-800 dark:text-zinc-100 hover:border-[#007AFF]/45 disabled:opacity-50 disabled:pointer-events-none transition-all active:scale-[0.98]"
                        >
                          {plateLookupLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-[#007AFF] dark:text-[#7ab8ff]" aria-hidden />
                          ) : (
                            <Search className="w-4 h-4 text-[#007AFF] dark:text-[#7ab8ff]" aria-hidden />
                          )}
                          Buscar placa
                        </button>
                      </div>
                      {plateLookupError ? (
                        <p className="text-xs text-red-600 dark:text-red-400 px-1" role="alert">
                          {plateLookupError}
                        </p>
                      ) : null}
                    </div>
                    <Input
                      label="Km"
                      name="mileageKm"
                      placeholder="Ex: 45000"
                      value={customer.mileageKm ?? ''}
                      onChange={handleInputChange}
                      icon={<Hash className="w-4 h-4" />}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input
                      label="Cor"
                      name="vehicleColor"
                      placeholder="Ex: Branca"
                      value={customer.vehicleColor ?? ''}
                      onChange={handleInputChange}
                      icon={<Sparkles className="w-4 h-4" />}
                    />
                    <Input
                      label="Ano / ano modelo"
                      name="vehicleYear"
                      placeholder="Ex: 2010 / 2010"
                      value={customer.vehicleYear ?? ''}
                      onChange={handleInputChange}
                      icon={<Calendar className="w-4 h-4" />}
                    />
                    <Input
                      label="Motor (cilindradas / combustível)"
                      name="vehicleEngineInfo"
                      placeholder="Ex: 1598 cc · Flex"
                      value={customer.vehicleEngineInfo ?? ''}
                      onChange={handleInputChange}
                      icon={<Car className="w-4 h-4" />}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input 
                    label="Veículo"
                    name="vehicleModel"
                    placeholder="Ex: BMW 320i"
                    value={customer.vehicleModel}
                    onChange={handleInputChange}
                    icon={<Package className="w-4 h-4" />}
                  />
                  <Input 
                    label="Identificação do módulo"
                    name="moduleIdentification"
                    placeholder="Ex: Módulo ABS XYZ"
                    value={customer.moduleIdentification ?? ''}
                    onChange={handleInputChange}
                    icon={<Package className="w-4 h-4" />}
                  />
                </div>
              )}

              {receptionMode === 'vehicle' && (
                <div>
                  <label className={`${iosLabel} ml-1`}>
                    Categoria do veículo <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {VEHICLE_CATEGORIES.map((category) => {
                      const selected = vehicleCategory === category;
                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => setVehicleCategory(category)}
                          className={`px-3 py-2.5 rounded-2xl text-sm font-semibold border transition-all active:scale-[0.98] ${
                            selected
                              ? 'bg-[#007AFF] text-white border-[#007AFF]/85 shadow-md shadow-blue-500/25'
                              : 'bg-white/80 dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-200 border-zinc-200/90 dark:border-white/[0.1] hover:border-[#007AFF]/45 backdrop-blur-sm'
                          }`}
                          aria-pressed={selected}
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="relative">
                <TextArea
                  label="Queixa do cliente"
                  name="issueDescription"
                  placeholder="Descreva o problema relatado pelo cliente..."
                  value={customer.issueDescription}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="h-px bg-zinc-200/80 dark:bg-white/[0.08]" />

              <div className="space-y-3">
                <label className={`${iosLabel} ml-1`}>
                  {receptionMode === 'vehicle' ? 'Fotos do veículo (opcional)' : 'Fotos (opcional)'}
                </label>
                <p className="ml-1 text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">
                  No celular, <span className="font-semibold text-zinc-600 dark:text-zinc-300">Abrir câmera</span> inicia a
                  câmera traseira. Use <span className="font-semibold text-zinc-600 dark:text-zinc-300">Galeria</span> para
                  escolher uma ou várias imagens. Envio ao criar a ficha (até {MAX_RECEPTION_INTAKE_PHOTOS} fotos).
                </p>
                <input
                  ref={cameraInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCameraInputChange}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,.png,.jpg,.jpeg,.webp,.heic,.heif"
                  multiple
                  onChange={handleGalleryInputChange}
                />
                {intakePhotos.length > 0 ? (
                  <div className="flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch] scroll-smooth">
                    {intakePhotos.map((p, idx) => (
                      <div
                        key={p.id}
                        className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200 relative h-[5.25rem] w-[5.25rem] shrink-0 snap-start overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-100 shadow-sm dark:border-white/10 dark:bg-zinc-900/60 sm:h-24 sm:w-24"
                      >
                        <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeIntakePhoto(p.id)}
                          className="absolute right-0.5 top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-red-500/95 text-white shadow-md transition-transform hover:scale-105 active:scale-95"
                          aria-label={`Remover foto ${idx + 1}`}
                        >
                          <X className="h-4 w-4" strokeWidth={2.5} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <button
                    type="button"
                    disabled={intakePhotos.length >= MAX_RECEPTION_INTAKE_PHOTOS}
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex min-h-[52px] flex-1 items-center justify-center gap-2.5 rounded-2xl border border-zinc-200/90 bg-white/50 py-3.5 text-zinc-700 backdrop-blur-md transition-all hover:border-[#007AFF]/45 hover:bg-white/90 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-45 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-zinc-100 dark:hover:bg-white/[0.1]"
                  >
                    <Camera className="h-5 w-5 shrink-0 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2} />
                    <span className="text-left text-sm font-semibold leading-tight">
                      {intakePhotos.length === 0
                        ? receptionMode === 'module'
                          ? 'Abrir câmera (módulo)'
                          : 'Abrir câmera (veículo)'
                        : 'Mais uma foto (câmera)'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={intakePhotos.length >= MAX_RECEPTION_INTAKE_PHOTOS}
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl border border-zinc-300/90 bg-zinc-100/60 py-3.5 text-sm font-semibold text-zinc-800 backdrop-blur-md transition-all hover:bg-zinc-100 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-45 dark:border-white/12 dark:bg-white/[0.06] dark:text-zinc-100 dark:hover:bg-white/[0.1]"
                  >
                    <ImageIcon className="h-5 w-5 shrink-0 text-zinc-600 dark:text-zinc-300" strokeWidth={2} />
                    Galeria (uma ou várias)
                  </button>
                </div>
                {intakePhotos.length > 0 ? (
                  <p className="text-center text-[11px] font-medium text-zinc-500 dark:text-zinc-400 sm:text-left">
                    {intakePhotos.length === 1
                      ? '1 foto selecionada'
                      : `${intakePhotos.length} fotos selecionadas`}
                  </p>
                ) : null}
              </div>

            </div>
          </div>
          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              className="group relative flex min-w-[220px] items-center justify-center gap-2 rounded-2xl bg-[#007AFF] px-8 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:opacity-95 active:scale-[0.98]"
            >
              Criar ficha
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
            </div>
          </div>

        </form>
      </div>

      {isHistoryOpen && (
        <ModalPortal>
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 backdrop-blur-[20px] p-3 sm:p-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className={`${iosModalShell} w-full max-w-[90rem] max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] shadow-[0_18px_60px_-24px_rgba(0,0,0,0.45)]`}>
            <button
              type="button"
              onClick={() => setIsHistoryOpen(false)}
              className={iosModalClose}
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="px-6 sm:px-8 pt-8 pb-4 pr-14 shrink-0 border-b border-zinc-200/50 dark:border-white/[0.06]">
              <IosModalHeader
                icon={<img src="/icons/recepcao-ios.png" alt="" className="h-full w-full min-h-0 object-cover" />}
                title={receptionMode === 'module' ? 'Histórico de módulos' : 'Histórico de veículos'}
                subtitle={
                  receptionMode === 'module'
                    ? 'Módulos arquivados — mesmo visual do Pátio'
                    : 'Veículos arquivados — mesmo visual do Pátio'
                }
              />
            </div>
            <div className="p-4 sm:p-6 border-b border-zinc-200/50 dark:border-white/[0.06] bg-zinc-50/40 dark:bg-white/[0.03]">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#007AFF]/90 dark:text-[#7ab8ff]" strokeWidth={2} />
                  <input
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadVehicleHistory(historySearch)}
                    placeholder={
                      receptionMode === 'module'
                        ? 'Buscar por identificação, cliente ou modelo'
                        : 'Buscar por placa, cliente ou modelo'
                    }
                    className="w-full rounded-2xl border border-zinc-200/90 bg-white/90 py-3 pl-9 pr-3 text-zinc-900 placeholder:text-zinc-400 focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/[0.1] dark:bg-zinc-950/50 dark:text-zinc-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => loadVehicleHistory(historySearch)}
                  className="flex h-11 min-w-[44px] items-center justify-center rounded-2xl border border-[#007AFF]/60 bg-[#007AFF] px-4 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:brightness-110 active:scale-[0.98]"
                >
                  <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 bg-zinc-50/30 dark:bg-zinc-950/20 custom-scrollbar pb-[max(1rem,env(safe-area-inset-bottom))]">
              {historyLoading ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-zinc-500">
                  <RefreshCw className="w-8 h-8 animate-spin text-[#007AFF] dark:text-[#7ab8ff]" />
                  <p>Carregando arquivados...</p>
                </div>
              ) : archivedOrders.length === 0 ? (
                <div className="py-16 text-center text-zinc-500">
                  {receptionMode === 'module' ? 'Nenhum módulo arquivado encontrado.' : 'Nenhum veículo arquivado encontrado.'}
                </div>
              ) : (
                <div
                  className="origin-top will-change-[zoom]"
                  style={
                    {
                      zoom: historyBoardPanoramic ? BOARD_PANORAMIC_ZOOM : 1,
                      transition: 'zoom 0.55s cubic-bezier(0.34, 1.35, 0.25, 1)',
                    } as React.CSSProperties & { zoom?: number }
                  }
                >
                  <div
                    className={`relative z-0 grid items-start perspective-[1400px] transition-[gap] duration-500 ease-[cubic-bezier(0.34,1.35,0.25,1)] ${
                      historyBoardPanoramic
                        ? 'grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-5 md:gap-3 lg:gap-3.5 2xl:gap-4'
                        : 'grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6 landscape:lg:grid-cols-4'
                    }`}
                  >
                    {archivedOrders.map((o) => {
                      const model = (o.vehicle_model || (receptionMode === 'module' ? 'Módulo' : 'Veículo')).trim();
                      const plateOrModule =
                        receptionMode === 'vehicle'
                          ? (o.plate || '---').toUpperCase()
                          : (o.module_identification || '—').trim();
                      const customerFull = (o.customer_name || o.customers?.name || '').trim();
                      return (
                        <PatioStyleArchiveBoardCard
                          key={o.id}
                          boardPanoramic={historyBoardPanoramic}
                          isDesktopLandscape={isDesktopLandscape}
                          isModuleMode={receptionMode === 'module'}
                          blurPlates={blurPlates}
                          model={model}
                          plateOrModule={plateOrModule}
                          customerFullName={customerFull}
                          vehicleColor={o.vehicle_color}
                          archivedAt={o.updated_at}
                          mechanicName={(o.assigned_technician || '').trim() || undefined}
                          garantiaTag={o.garantia_tag === true}
                          onOpen={() => openArchivedDetail(o)}
                          footerAppend={
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleHistoryBudgets(o.id)}
                                className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-zinc-200/80 bg-white/90 px-4 py-3 text-[14px] font-semibold text-zinc-800 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.1)] transition-all hover:bg-zinc-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.08] dark:text-zinc-100 dark:hover:bg-white/[0.12]"
                              >
                                {expandedHistoryOrderId === o.id ? 'Ocultar orçamentos' : 'Ver orçamentos'}
                              </button>
                              {expandedHistoryOrderId === o.id && (
                                <div className="mt-3 space-y-2 rounded-[1.25rem] border border-zinc-200/80 bg-zinc-50/90 p-3 dark:border-white/10 dark:bg-black/30">
                                  {historyBudgetsLoadingId === o.id ? (
                                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                                      <RefreshCw className="h-4 w-4 animate-spin" />
                                      Carregando orçamentos...
                                    </div>
                                  ) : historyBudgetErrorByOrder[o.id] ? (
                                    <div className="space-y-2">
                                      <div className="text-sm text-red-500">{historyBudgetErrorByOrder[o.id]}</div>
                                      <button
                                        type="button"
                                        onClick={() => handleRetryHistoryBudgets(o.id)}
                                        className="text-xs font-semibold text-zinc-900 underline dark:text-white"
                                      >
                                        Tentar novamente
                                      </button>
                                    </div>
                                  ) : (historyBudgetsByOrder[o.id] || []).length === 0 ? (
                                    <div className="text-sm text-zinc-500">Nenhum orçamento encontrado para este veículo.</div>
                                  ) : (
                                    (() => {
                                      const list = historyBudgetsByOrder[o.id] || [];
                                      const sorted = [...list].sort((a, b) => budgetLastActivityMs(b) - budgetLastActivityMs(a));
                                      return sorted.map((b) => (
                                        <div
                                          key={b.id}
                                          className="rounded-xl border border-zinc-200/80 bg-white p-2.5 dark:border-white/10 dark:bg-white/[0.02]"
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                                              Orçamento {budgetChronologicalNumber(list, b.id)}
                                            </p>
                                            <p className="text-xs text-zinc-500">
                                              {new Date(budgetLastActivityMs(b)).toLocaleString('pt-BR')}
                                            </p>
                                          </div>
                                          {b.diagnosis?.trim() && (
                                            <p className="mt-1 line-clamp-2 text-sm text-zinc-700 dark:text-zinc-300">
                                              <span className="font-medium">Diagnóstico:</span> {b.diagnosis}
                                            </p>
                                          )}
                                          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                                            {b.services.length} serviço(s) • {b.parts.length} peça(s)
                                          </p>
                                          <button
                                            type="button"
                                            onClick={() => setHistoryBudgetDetail(b)}
                                            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#007AFF] px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 sm:w-auto"
                                          >
                                            <Eye className="h-3.5 w-3.5" />
                                            Abrir orçamento completo
                                          </button>
                                        </div>
                                      ));
                                    })()
                                  )}
                                </div>
                              )}
                            </>
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Modal: detalhe completo da OS arquivada (queixa, comentários, anexos — como no Pátio) */}
      {archivedDetailOrderId && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[220] flex items-center justify-center bg-black/45 backdrop-blur-[20px] p-3 sm:p-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reception-archived-detail-title"
          >
            <div className={`${iosModalShell} w-full max-w-[90rem] max-h-[90vh] shadow-[0_18px_60px_-24px_rgba(0,0,0,0.45)] animate-modal-sheet`}>
              <div className="absolute top-4 right-4 z-10 flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={handleUnarchiveFromDetail}
                  disabled={!archivedDetailData || unarchivingId !== null}
                  className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white px-4 sm:px-6 py-2.5 rounded-full font-bold shadow-lg flex items-center gap-2 text-sm transition-all"
                >
                  {unarchivingId ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArchiveRestore className="w-4 h-4" />
                  )}
                  DESARQUIVAR
                </button>
                {onUseCustomerData && (
                  <button
                    type="button"
                    onClick={handleUseRegistrationFromDetail}
                    disabled={!archivedDetailData}
                    className="bg-[#007AFF] hover:bg-[#0A84FF] disabled:opacity-50 text-white px-4 sm:px-6 py-2.5 rounded-full font-bold shadow-lg shadow-blue-500/25 flex items-center gap-2 text-sm transition-all"
                  >
                    <Copy className="w-4 h-4" />
                    USAR CADASTRO
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeArchivedDetail}
                  className={`${iosModalClose} static shrink-0`}
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                {archivedDetailLoading && !archivedDetailData ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-3 text-zinc-500">
                    <RefreshCw className="w-10 h-10 animate-spin text-[#007AFF] dark:text-[#7ab8ff]" />
                    <p>Carregando dados da OS...</p>
                  </div>
                ) : archivedDetailData ? (
                  (() => {
                    const d = archivedDetailData;
                    const isModuleDetail = d.order_type === 'module';
                    const cust = d.customers;
                    const customerName = firstTwoNames((cust?.name || 'Cliente').trim());
                    return (
                      <div className="p-6 sm:p-10 md:p-12 pb-28">
                        <div className="flex flex-col gap-3 mb-6">
                          <span className="inline-flex self-start items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest border bg-zinc-100 dark:bg-black/60 text-zinc-700 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700">
                            ARQUIVADO
                            {d.os_number != null && (
                              <span className="text-[#007AFF] dark:text-[#7ab8ff]">· OS #{d.os_number}</span>
                            )}
                          </span>
                          <h1
                            id="reception-archived-detail-title"
                            className="font-vehicle text-3xl sm:text-5xl md:text-6xl font-bold text-zinc-900 dark:text-white tracking-tight uppercase leading-none pr-4"
                          >
                            {(d.vehicle_model || '—').trim()}
                          </h1>
                          {!isModuleDetail && (d.vehicle_brand ?? '').trim() ? (
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500/90 dark:text-zinc-400">
                              {(d.vehicle_brand ?? '').trim()}
                            </p>
                          ) : null}
                          {!isModuleDetail && (d.vehicle_color ?? '').trim() ? (
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500/90 dark:text-zinc-400">
                              Cor · {(d.vehicle_color ?? '').trim()}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-zinc-700 dark:text-zinc-300 mb-8">
                          {!isModuleDetail && (
                            <div className="flex items-center">
                              <div className="w-[140px] bg-white rounded-lg border-2 border-black flex flex-col overflow-hidden shadow-xl shadow-black/20 select-none">
                                <div className="h-5 bg-[#003399] flex items-center justify-between px-3 relative">
                                  <span className="text-[8px] font-bold text-white tracking-wider">BRASIL</span>
                                  <BrazilFlagIcon width={16} height={11} className="rounded-sm flex-shrink-0 border border-white/30" />
                                </div>
                                <div className="h-10 flex items-center justify-center bg-white">
                                  <span
                                    className={`text-black font-mono text-2xl font-black tracking-widest leading-none ${blurPlates ? 'blur-plate' : ''}`}
                                  >
                                    {(d.plate || '---').toUpperCase()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                          {isModuleDetail && (
                            <div className="rounded-xl border border-zinc-300 dark:border-white/15 bg-zinc-100/80 dark:bg-white/[0.06] px-4 py-3">
                              <span className="text-[10px] uppercase font-bold text-zinc-500 dark:text-zinc-400">Identificação do módulo</span>
                              <p className="text-lg font-mono font-bold text-zinc-900 dark:text-white mt-1">
                                {(d.module_identification || '—').trim()}
                              </p>
                            </div>
                          )}
                          <div className="flex items-center gap-2 px-4 py-2">
                            <User className="w-5 h-5 text-zinc-500" />
                            <span className="text-lg font-medium text-zinc-900 dark:text-white">{customerName}</span>
                          </div>
                          {d.delivery_date && (
                            <div className="flex items-center gap-2 bg-zinc-100/80 dark:bg-zinc-900/50 px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700/80">
                              <Calendar className="w-4 h-4 text-zinc-600" />
                              <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                                Entrega: {new Date(d.delivery_date).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800/60 mb-10" />

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                          <div className="lg:col-span-2 space-y-10">
                            <div>
                              <h3 className={uiSectionTitleRow}>
                                <FileText className="h-3.5 w-3.5" />
                                Queixa do cliente
                              </h3>
                              <div
                                className={`rounded-2xl border border-zinc-200/80 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/70 ${uiReadBody}`}
                              >
                                <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponentsApp}>
                                  {d.issue_description?.trim() || 'Nenhuma descrição disponível.'}
                                </ReactMarkdown>
                              </div>
                            </div>

                            {d.ai_analysis?.trim() && (
                              <div>
                                <h3 className="text-zinc-700 dark:text-zinc-300 text-sm font-bold uppercase tracking-widest flex items-center gap-2 mb-4">
                                  <MessageSquare className="w-4 h-4" />
                                  Análise (IA)
                                </h3>
                                <div className="bg-zinc-50 dark:bg-black/40 rounded-2xl p-6 border border-zinc-200/80 dark:border-zinc-800 text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap">
                                  {d.ai_analysis}
                                </div>
                              </div>
                            )}

                            <div>
                              <h3 className="text-zinc-700 dark:text-zinc-300 text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                                <MessageSquare className="w-4 h-4" />
                                Comentários e atividades
                              </h3>
                              <div className="bg-white dark:bg-zinc-900/70 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 overflow-hidden">
                                <div className="p-6 space-y-6 max-h-[420px] overflow-y-auto custom-scrollbar bg-zinc-50/60 dark:bg-black/40">
                                  {archivedDetailComments.length === 0 ? (
                                    <div className="text-center py-8 text-zinc-500 dark:text-zinc-400 italic text-sm">
                                      Nenhum comentário registrado nesta OS.
                                    </div>
                                  ) : (
                                    archivedDetailComments.map((c) => (
                                      <div key={c.id} className="flex gap-4">
                                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#007AFF]/15 border border-[#007AFF]/35 flex items-center justify-center text-sm font-bold text-zinc-900 dark:text-white">
                                          {(c.author_display_name || '?').slice(0, 1).toUpperCase()}
                                        </div>
                                        <div className="flex-1 space-y-1 min-w-0">
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">{c.author_display_name}</span>
                                            <span className="text-xs text-zinc-500">
                                              {new Date(c.created_at).toLocaleString('pt-BR')}
                                            </span>
                                          </div>
                                          <div
                                            className={`rounded-r-xl rounded-bl-xl border border-zinc-200 bg-zinc-100/90 p-3 dark:border-zinc-700/50 dark:bg-zinc-800/50 ${uiReadBody}`}
                                          >
                                            <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponentsApp}>
                                              {c.text}
                                            </ReactMarkdown>
                                          </div>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-8">
                            <div>
                              <h3 className="text-[#007AFF] dark:text-[#7ab8ff] text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Paperclip className="w-4 h-4" />
                                Fotos e anexos
                              </h3>
                              {archivedDetailPhotos.length === 0 ? (
                                <p className="text-sm text-zinc-500 italic">Nenhum anexo nesta OS.</p>
                              ) : (
                                (() => {
                                  const archivedPhotosToShow = archivedDetailPhotos.slice(0, archivedPhotosVisibleCount);
                                  const archivedPhotosHidden = archivedDetailPhotos.length - archivedPhotosToShow.length;
                                  return (
                                <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  {archivedPhotosToShow.map((att) => {
                                    const isImage =
                                      att.mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.url);
                                    const isPdf = att.mimeType === 'application/pdf' || att.url.toLowerCase().endsWith('.pdf');
                                    const cardClass =
                                      'block w-full bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden group hover:border-[#007AFF]/45 transition-all';
                                    if (isPdf) {
                                      return (
                                        <button
                                          key={att.id}
                                          type="button"
                                          onClick={() => setPreviewPdf(att.url)}
                                          className={cardClass}
                                        >
                                          <div className="p-4 flex flex-col items-center gap-2 text-center">
                                            <FileText className="w-8 h-8 text-red-500" />
                                            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200 break-all line-clamp-2">
                                              {att.name}
                                            </span>
                                            <span className="text-[10px] text-red-500 font-bold">PDF · toque para ver</span>
                                          </div>
                                        </button>
                                      );
                                    }
                                    return (
                                      <a
                                        key={att.id}
                                        href={att.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={cardClass}
                                      >
                                        {isImage ? (
                                          <div className="aspect-square relative bg-zinc-100 dark:bg-black">
                                            <StorageThumbImg
                                              src={att.url}
                                              alt={att.name}
                                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                              sizes="(max-width: 1024px) 45vw, 160px"
                                              thumbMaxWidth={180}
                                              thumbMaxHeight={180}
                                              thumbQuality={50}
                                            />
                                            <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/60 text-[10px] text-white truncate">
                                              {att.name}
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="p-4 flex flex-col items-center gap-2 text-center">
                                            <FileText className="w-8 h-8 text-zinc-400" />
                                            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200 break-all line-clamp-2">
                                              {att.name}
                                            </span>
                                          </div>
                                        )}
                                      </a>
                                    );
                                  })}
                                </div>
                                {archivedPhotosHidden > 0 && (
                                  <button
                                    type="button"
                                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700/80"
                                    onClick={() =>
                                      setArchivedPhotosVisibleCount((n) => n + ARCHIVED_PHOTOS_BATCH)
                                    }
                                  >
                                    Mostrar mais ({archivedPhotosHidden}{' '}
                                    {archivedPhotosHidden === 1 ? 'anexo' : 'anexos'})
                                  </button>
                                )}
                                </div>
                                  );
                                })()
                              )}
                            </div>

                            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700/80 p-4 bg-zinc-50/80 dark:bg-black/30 text-sm space-y-2">
                              <p className="text-[10px] uppercase font-bold text-zinc-500">Cliente (cadastro)</p>
                              {cust?.phone && (
                                <p>
                                  <span className="text-zinc-500">Tel: </span>
                                  {cust.phone}
                                </p>
                              )}
                              {cust?.email && (
                                <p>
                                  <span className="text-zinc-500">E-mail: </span>
                                  {cust.email}
                                </p>
                              )}
                              {(cust?.cpf || cust?.cep || cust?.address) && (
                                <p className="text-xs text-zinc-600 dark:text-zinc-400 pt-2 border-t border-zinc-200 dark:border-zinc-700">
                                  {[cust?.cpf, cust?.cep, cust?.address, cust?.city, cust?.address_number].filter(Boolean).join(' · ')}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="py-16 text-center text-zinc-500">Não foi possível carregar os dados.</div>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal: orçamento completo — portal para ficar acima da TabBar do app */}
      {historyBudgetDetail && (
        <ModalPortal>
        <div
          className="fixed inset-0 z-[230] flex items-center justify-center bg-black/45 backdrop-blur-[20px] p-3 sm:p-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]"
          onClick={() => setHistoryBudgetDetail(null)}
        >
          <div
            className={`${iosModalShell} w-full max-w-2xl max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)]`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-6 sm:px-8 border-b border-zinc-200/50 dark:border-white/[0.06] shrink-0 pt-8 pr-14">
              <div className="min-w-0">
                <div className="flex items-center gap-3 text-zinc-900 dark:text-white">
                  <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
                    <Calculator />
                  </IosAccentIconSquircle>
                  <div>
                  <h2 className="text-[20px] sm:text-[22px] font-semibold tracking-tight truncate">Orçamento</h2>
                {historyBudgetDetail.cardName?.trim() && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 truncate">{historyBudgetDetail.cardName}</p>
                )}
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  {new Date(budgetLastActivityMs(historyBudgetDetail)).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryBudgetDetail(null)}
                className={iosModalClose}
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-5 text-zinc-900 dark:text-zinc-100 [-webkit-overflow-scrolling:touch]">
              {historyBudgetDetail.diagnosis?.trim() && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Diagnóstico</h3>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{historyBudgetDetail.diagnosis}</div>
                </section>
              )}
              {historyBudgetDetail.services.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Serviços</h3>
                  <ul className="list-none space-y-2 text-sm">
                    {historyBudgetDetail.services.map((s, i) => (
                      <li
                        key={i}
                        className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${budgetReadRowClass(s.approved, 'ios', historyBudgetApprovalContrast)}`}
                      >
                        {s.approved === true && <Check className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden />}
                        {s.approved === false && <X className="w-4 h-4 shrink-0 text-red-600 mt-0.5" aria-hidden />}
                        {s.approved !== true && s.approved !== false && (
                          <span className="w-4 h-4 shrink-0 text-center font-bold text-zinc-400 mt-0.5" aria-hidden>—</span>
                        )}
                        <span className={historyBudgetApprovalContrast && s.approved === true ? 'font-medium' : ''}>{s.description}</span>
                        {s.labor_hours != null && Number.isFinite(Number(s.labor_hours)) ? (
                          <span className="text-[13px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
                            ({formatLaborLabel(Number(s.labor_hours))})
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {historyBudgetDetail.parts.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Peças</h3>
                  <ul className="space-y-2 text-sm">
                    {historyBudgetDetail.parts.map((p, i) => (
                      <li
                        key={i}
                        className={`flex items-start gap-2 ${budgetReadRowClass(p.approved, 'ios', historyBudgetApprovalContrast)}`}
                      >
                        {p.approved === true && <Check className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden />}
                        {p.approved === false && <X className="w-4 h-4 shrink-0 text-red-600 mt-0.5" aria-hidden />}
                        {p.approved !== true && p.approved !== false && (
                          <span className="w-4 h-4 shrink-0 text-center font-bold text-zinc-400 mt-0.5" aria-hidden>—</span>
                        )}
                        <span>
                          <span
                            className={
                              historyBudgetApprovalContrast && p.approved === true ? 'font-bold' : 'font-semibold'
                            }
                          >
                            ({p.quantity}x)
                          </span>{' '}
                          {p.description}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {historyBudgetDetail.observations?.trim() && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Observações</h3>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{historyBudgetDetail.observations}</div>
                </section>
              )}
              {!historyBudgetDetail.diagnosis?.trim() &&
                historyBudgetDetail.services.length === 0 &&
                historyBudgetDetail.parts.length === 0 &&
                !historyBudgetDetail.observations?.trim() && (
                  <p className="text-sm text-zinc-500">Este orçamento não possui itens preenchidos.</p>
                )}
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {previewPdf && (
        <PdfViewerModal src={previewPdf} onClose={() => setPreviewPdf(null)} />
      )}

      <ProcessingOverlay 
        status={status}
        onClose={() => {
          if (status.step === 'success') {
            resetForm();
          } else {
            setStatus({ step: 'idle' });
          }
        }}
      />

    </div>
    </div>
  );
};
