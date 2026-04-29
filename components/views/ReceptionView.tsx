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

const ARCHIVED_PHOTOS_BATCH = 8;

const RECEPTION_MODE_KEY = 'app_reception_mode';
const VEHICLE_CATEGORIES = ['Compacto', 'Médio/SUV', 'Pick-Up', 'Premium'] as const;
type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

/** Mesmo critério do Pátio: dois primeiros nomes do cliente. */
function firstTwoNames(fullName: string): string {
  if (!fullName || !fullName.trim()) return fullName;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return fullName.trim();
  return parts.slice(0, 2).join(' ');
}

/** Tamanho do título do modelo (alinhado ao Pátio / tablet). */
function getModelTitleClass(modelName: string) {
  const len = (modelName || '').length;
  if (len > 40) return 'text-2xl md:text-4xl lg:text-3xl';
  if (len > 26) return 'text-3xl md:text-5xl lg:text-3xl';
  return 'text-3xl md:text-5xl lg:text-3xl';
}

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
  /** Modo cinematográfico: embaçar placas exibidas (para gravar tela / redes sociais). */
  blurPlates?: boolean;
  /** Preencher o formulário com dados da OS (igual ao Pátio: "Usar cadastro"). */
  onUseCustomerData?: (data: Customer) => void;
  /** Quem registra o desarquivamento na API (igual ao Pátio). */
  actorOptions?: ServiceOrderUpdateActor;
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
  blurPlates = false,
  onUseCustomerData,
  actorOptions,
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

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Camera State
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [cameraOrientation, setCameraOrientation] = useState<{alpha: number | null, beta: number | null, gamma: number | null} | null>(null);
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setPhotoBlob(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
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
      setStatus({ step: 'creating', message: 'Criando cadastro' });
      const { customer: savedCustomer, serviceOrder } = await saveReceptionIntake(
        { ...customer, issueDescription: customer.issueDescription },
        receptionMode,
        receptionMode === 'vehicle' ? vehicleCategory : null
      );

      // 2) Se houver foto, enviar (com compressão automática para evitar 413 no Vercel)
      if (photoBlob && serviceOrder?.id) {
        await uploadServiceOrderPhoto(
          serviceOrder.id,
          photoBlob,
          `entrada_${serviceOrder.id}_${Date.now()}.jpg`
        );
      }

      const osLabel = serviceOrder?.os_number != null ? ` OS #${serviceOrder.os_number}.` : '';
      setStatus({ step: 'success', message: `Cadastro criado com sucesso.${osLabel}` });

      // Futuro: podemos usar savedCustomer / serviceOrder (ex: redirecionar, imprimir, etc.)
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
    setPhotoBlob(null);
    setPhotoPreview(null);
    setCameraOrientation(null);
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

  const clearPhoto = () => {
    setPhotoBlob(null);
    setPhotoPreview(null);
    setCameraOrientation(null);
  };

  // --- Funções de Histórico ---
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

  /** Mantém lista / filtro do histórico atualizados com o modal aberto. */
  useEffect(() => {
    if (!isHistoryOpen) return;
    const tick = () => {
      const term = historySearchRef.current ?? '';
      void loadVehicleHistoryRef.current(term);
    };
    const id = window.setInterval(tick, 8000);
    return () => window.clearInterval(id);
  }, [isHistoryOpen]);

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
          <div className="p-1 rounded-2xl bg-zinc-200/90 dark:bg-white/[0.06] border border-zinc-200/70 dark:border-white/[0.08] backdrop-blur-xl shadow-inner flex">
            <button
              type="button"
              onClick={() => setReceptionMode('vehicle')}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-[0.85rem] text-sm font-semibold transition-all ${
                receptionMode === 'vehicle'
                  ? 'bg-[#007AFF] text-white shadow-md shadow-blue-500/25 border border-[#007AFF]/60'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <Car className="w-4 h-4" />
              Veículos
            </button>
            <button
              type="button"
              onClick={() => setReceptionMode('module')}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-[0.85rem] text-sm font-semibold transition-all ${
                receptionMode === 'module'
                  ? 'bg-[#007AFF] text-white shadow-md shadow-blue-500/25 border border-[#007AFF]/60'
                  : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <Package className="w-4 h-4" />
              Módulos
            </button>
          </div>
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

              <div className="space-y-2">
                <label className={`${iosLabel} ml-1`}>
                  {receptionMode === 'vehicle' ? 'Foto do veículo (opcional)' : 'Foto (opcional)'}
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*,.png,.jpg,.jpeg,.webp,.heic,.heif"
                  onChange={handleFileSelect}
                />
                {!photoPreview ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-2xl border border-zinc-200/90 bg-white/50 py-4 text-zinc-600 backdrop-blur-md transition-all hover:border-[#007AFF]/45 hover:bg-white/80 active:scale-[0.99] dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.08]"
                  >
                    <span className="flex items-center justify-center gap-3">
                      <Camera className="h-5 w-5 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2} />
                      <span className="text-sm font-medium">{receptionMode === 'module' ? 'Foto do módulo (câmera ou galeria)' : 'Foto do veículo (câmera ou galeria)'}</span>
                    </span>
                  </button>
                ) : (
                  <div className="relative overflow-hidden rounded-[1.25rem] border border-zinc-200/80 bg-zinc-100/80 shadow-inner backdrop-blur-sm dark:border-white/[0.1] dark:bg-black/40">
                    <img src={photoPreview} alt="Preview" className="h-48 w-full object-cover opacity-80 lg:h-56" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <div className="absolute right-4 top-4 flex gap-2">
                        <button
                          type="button"
                          onClick={clearPhoto}
                          className="rounded-full bg-red-500/90 p-2 text-white shadow-lg transition-colors hover:bg-red-600"
                          title="Remover foto"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-white/10 bg-black/70 p-3 backdrop-blur-md">
                        <div className="flex items-center gap-3">
                          <ImageIcon className="h-5 w-5 text-[#64B5FF]" />
                          <div className="flex-1">
                            <p className="text-xs font-bold uppercase text-white">Foto Selecionada</p>
                            <p className="mt-0.5 text-[10px] text-zinc-300">Clique no X para remover</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-center sm:justify-start">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedOrders.map((o) => {
                  const model = (o.vehicle_model || 'Veículo').trim();
                  const plate = (o.plate || '---').toUpperCase();
                  const customerName = firstTwoNames((o.customer_name || o.customers?.name || 'Cliente').trim());
                  return (
                  <div
                    key={o.id}
                    className="group bg-white/90 dark:bg-zinc-900/50 backdrop-blur-md border border-zinc-200/80 dark:border-white/[0.08] rounded-[22px] p-5 hover:border-[#007AFF]/40 dark:hover:border-[#007AFF]/45 transition-all shadow-[0_2px_20px_-4px_rgba(0,0,0,0.06)] hover:shadow-lg flex flex-col min-h-[200px]"
                  >
                    <div className="flex justify-between items-start gap-4 mb-3">
                      <div className="min-w-0 flex-1">
                        <h3
                          className={`font-vehicle ${getModelTitleClass(model)} font-black text-zinc-900 dark:text-white uppercase leading-[0.95] tracking-tighter break-words italic`}
                        >
                          {model}
                        </h3>
                        {receptionMode === 'vehicle' && (o.vehicle_color ?? '').trim() ? (
                          <p className="mt-1 max-w-full truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400/75 dark:text-zinc-500/85">
                            {(o.vehicle_color ?? '').trim()}
                          </p>
                        ) : null}
                        <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100/80 dark:bg-white/[0.06] border border-zinc-200/50 dark:border-white/[0.06] w-fit max-w-full">
                          <User className="w-4 h-4 text-[#007AFF] dark:text-[#7ab8ff] shrink-0" strokeWidth={2} />
                          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 truncate tracking-tight">
                            {customerName}
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {receptionMode === 'vehicle' ? (
                          <div className="w-[120px] bg-white rounded-lg border-2 border-black flex flex-col overflow-hidden shadow-md shadow-black/20 select-none">
                            <div className="h-4 bg-[#003399] flex items-center justify-between px-2">
                              <span className="text-[7px] font-bold text-white tracking-wider">BRASIL</span>
                              <BrazilFlagIcon width={12} height={8} className="rounded-[2px] flex-shrink-0 border border-white/30" />
                            </div>
                            <div className="h-9 flex items-center justify-center bg-white">
                              <span className={`text-black font-mono text-xl font-black tracking-[0.2em] leading-none ${blurPlates ? 'blur-plate' : ''}`}>
                                {plate}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="max-w-[140px] rounded-xl border border-zinc-300 dark:border-white/15 bg-zinc-100/80 dark:bg-white/[0.06] px-3 py-2 text-right">
                            <span className="text-[9px] uppercase font-bold text-zinc-500 dark:text-zinc-400 block">Módulo</span>
                            <span className="text-sm font-mono font-bold text-zinc-900 dark:text-white break-all">
                              {(o.module_identification || '—').trim()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-end justify-between mt-auto pt-3 border-t border-zinc-200/80 dark:border-zinc-800/70">
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] uppercase text-zinc-500 dark:text-zinc-400 font-bold tracking-wider">Arquivado</span>
                        <span className="text-lg text-zinc-800 dark:text-zinc-100 font-black tracking-tight leading-none truncate">
                          {o.updated_at ? new Date(o.updated_at).toLocaleDateString('pt-BR') : '—'}
                        </span>
                      </div>
                      <span className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500 shrink-0">{o.status}</span>
                    </div>

                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => openArchivedDetail(o)}
                        className="w-full px-3 py-2.5 rounded-xl text-xs font-bold bg-[#007AFF] text-white hover:bg-[#0A84FF] transition-colors flex items-center justify-center gap-2"
                      >
                        Ver detalhes completos
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => handleToggleHistoryBudgets(o.id)}
                        className="w-full px-3 py-2.5 rounded-xl text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white/10 dark:hover:bg-white/15 transition-colors"
                      >
                        {expandedHistoryOrderId === o.id ? 'Ocultar orçamentos' : 'Ver orçamentos'}
                      </button>
                    </div>
                    {expandedHistoryOrderId === o.id && (
                      <div className="mt-3 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50/90 dark:bg-black/30 p-3 space-y-2">
                        {historyBudgetsLoadingId === o.id ? (
                          <div className="text-sm text-zinc-500 flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Carregando orçamentos...
                          </div>
                        ) : historyBudgetErrorByOrder[o.id] ? (
                          <div className="space-y-2">
                            <div className="text-sm text-red-500">{historyBudgetErrorByOrder[o.id]}</div>
                            <button
                              type="button"
                              onClick={() => handleRetryHistoryBudgets(o.id)}
                              className="text-xs font-semibold text-zinc-900 dark:text-white underline"
                            >
                              Tentar novamente
                            </button>
                          </div>
                        ) : (historyBudgetsByOrder[o.id] || []).length === 0 ? (
                          <div className="text-sm text-zinc-500">Nenhum orçamento encontrado para este veículo.</div>
                        ) : (
                          (historyBudgetsByOrder[o.id] || []).map((b, idx) => (
                            <div key={b.id} className="rounded-lg border border-zinc-200 dark:border-white/10 p-2.5 bg-white dark:bg-white/[0.02]">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                                  Orçamento {idx + 1}
                                </p>
                                <p className="text-xs text-zinc-500">
                                  {new Date(b.createdAt).toLocaleString('pt-BR')}
                                </p>
                              </div>
                              {b.diagnosis?.trim() && (
                                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2">
                                  <span className="font-medium">Diagnóstico:</span> {b.diagnosis}
                                </p>
                              )}
                              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                                {b.services.length} serviço(s) • {b.parts.length} peça(s)
                              </p>
                              <button
                                type="button"
                                onClick={() => setHistoryBudgetDetail(b)}
                                className="mt-2 w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#007AFF] text-white hover:opacity-90 transition-opacity"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Abrir orçamento completo
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
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
                            className="font-vehicle text-3xl sm:text-5xl md:text-6xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase italic leading-none pr-4"
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
                  {new Date(historyBudgetDetail.createdAt).toLocaleString('pt-BR', {
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
