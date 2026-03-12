import React, { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { RefreshCw, AlertCircle, ChevronDown, ChevronRight, ChevronLeft, User, Wrench, X, Check, Users, ClipboardList, CheckCircle2, Circle, Plus, ListChecks, FileText, Calendar, Clock, MessageSquare, Send, Paperclip, Download, ExternalLink, ZoomIn, Calculator, Trash2, DollarSign, Settings, Hash, Minus, Pencil, Save, Maximize2, Eye, History, Search, Copy, ArrowRight, Camera, Image as ImageIcon, FolderOpen, Upload, FilePlus, ArchiveRestore, Printer, Smartphone, Mail, MapPin, Share2 } from 'lucide-react';
import { TrelloList, TrelloCard, TrelloMember, TrelloAction, TrelloAttachment, Customer } from '../../types';
import {
  getServiceOrders,
  getServiceOrderById,
  updateServiceOrderStatus,
  updateServiceOrderDescription,
  updateServiceOrderTechnician,
  updateServiceOrderGarantiaTag,
  updateServiceOrderMileage,
  updateServiceOrderDeliveryDate,
  updateServiceOrderVehicle,
  getServiceOrderPhotos,
  uploadServiceOrderPhoto,
  renameServiceOrderPhoto,
  getServiceOrderBudgets,
  createServiceOrderBudget,
  updateServiceOrderBudget,
  deleteServiceOrderBudget,
  getServiceOrderComments,
  addServiceOrderComment,
  deleteServiceOrderComment,
  updateServiceOrderComment,
  getWorkshopServices,
  getSystemUserTechnicians,
  updateCustomer,
  deleteServiceOrderWithPassword,
  ServiceOrderListItem,
  type WorkshopService,
  type SystemUserTechnician,
  type ServiceOrderUpdateActor,
  type ServiceOrderType,
} from '../../services/apiService';
import type { ServiceOrderDetail } from '../../services/apiService';
import { SERVICE_ORDER_STAGES, getStageStyle, type ServiceOrderStatus } from '../../constants/serviceOrderStages';
import { BrazilFlagIcon } from '../ui/BrazilFlagIcon';
import { PatioCarIcon } from '../ui/PatioCarIcon';

export type OpenServiceOrderSection = 'comments' | 'budgets' | 'description' | null;

interface PatioViewProps {
  onUseCustomerData?: (data: Customer) => void;
  /** Se false, desativa efeitos (ex.: 3D nos cards). */
  effectsEnabled?: boolean;
  /** Nome exibido nos comentários: "Rei do ABS" (admin) ou nome do técnico. */
  commentAuthorName?: string;
  /** Se definido, abre o modal do veículo com esta OS (vindo ex.: da central de notificações). */
  openServiceOrderId?: string | null;
  /** Seção do modal para rolar após abrir (comentários, orçamentos, queixa). */
  openServiceOrderSection?: OpenServiceOrderSection;
  /** Chamado após abrir o modal e rolar à seção (para limpar o estado de navegação no pai). */
  onOpenServiceOrderHandled?: () => void;
  /** Quem está agindo (admin vs técnico) para as notificações: admin só recebe de técnicos, técnicos só de admin. */
  actorOptions?: ServiceOrderUpdateActor;
  /** Modo cinematográfico: embaçar placas em todo o app (para gravar tela / redes sociais). */
  blurPlates?: boolean;
  /** Exibir apenas veículos (Pátio) ou apenas módulos (Laboratório). */
  orderType?: ServiceOrderType;
  /** Permissões do pátio para usuários limitados. Se não passado (admin), tudo permitido. */
  patioPermissions?: {
    canDeleteCards?: boolean;
    canAssignTechnician?: boolean;
    canEditFicha?: boolean;
    canEditQueixa?: boolean;
    canEditDeliveryDate?: boolean;
    canEditMileage?: boolean;
    canEditBudgets?: boolean;
    canAddComments?: boolean;
    canArchiveCard?: boolean;
  };
}

const BACKEND_LISTS: TrelloList[] = SERVICE_ORDER_STAGES.map((s) => ({
  id: s.id,
  name: s.name,
  pos: s.pos,
}));

function capitalizeFirst(str: string): string {
  if (!str || !str.trim()) return str;
  return str.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function buildTechnicianNameMap(technicians: SystemUserTechnician[]): Record<string, string> {
  const map: Record<string, string> = {};
  technicians.forEach((t) => {
    map[t.id] = (t.display_name || t.username || '').trim() || t.username;
  });
  return map;
}

function orderToCard(o: ServiceOrderListItem, technicianNameMap?: Record<string, string>, orderType: ServiceOrderType = 'vehicle'): TrelloCard {
  const name = orderType === 'module'
    ? `${o.vehicle_model || '—'} - ${o.module_identification || '—'} - ${o.customers?.name || 'Cliente'}`
    : `${o.vehicle_model || 'Veículo'} - ${(o.plate || '---').toUpperCase()} - ${o.customers?.name || 'Cliente'}`;
  const techId = o.assigned_technician ?? null;
  const nameMap = technicianNameMap ?? {};
  const techName = techId ? (nameMap[techId] ?? techId) : null;
  return {
    id: o.id,
    name,
    osNumber: o.os_number ?? null,
    desc: o.issue_description || '',
    idList: o.status,
    url: '',
    dateLastActivity: o.updated_at,
    pos: 0,
    members: techName ? [{ id: techId!, fullName: capitalizeFirst(techName), username: '' }] : [],
    checklists: [],
    garantiaTag: o.garantia_tag === true,
    mileageKm: o.mileage_km ?? null,
    deliveryDate: o.delivery_date ?? null,
  };
}

// Interfaces separadas para Serviços (só descrição) e Peças (descrição + quantidade)
interface BudgetServiceItem {
  id: string;
  description: string;
}

interface BudgetPartItem {
  id: string;
  description: string;
  quantity: string;
}

/** Orçamento salvo. approved = true (aprovado) / false (reprovado) pelo admin; undefined = pendente. */
export interface SavedBudget {
  id: string;
  createdAt: string;
  serviceOrderId: string;
  cardName: string;
  diagnosis: string;
  services: { description: string; approved?: boolean }[];
  parts: { description: string; quantity: string; approved?: boolean }[];
  observations: string;
}

// --- Componente Lightbox com Zoom (Pinch) e Navegação entre Fotos ---
const SWIPE_THRESHOLD = 60;

const Lightbox = ({
  src: singleSrc,
  images: imagesProp,
  initialIndex = 0,
  onClose,
}: {
  src?: string;
  images?: string[];
  initialIndex?: number;
  onClose: () => void;
}) => {
  const images = imagesProp && imagesProp.length > 0 ? imagesProp : (singleSrc ? [singleSrc] : []);
  const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 && initialIndex < images.length ? initialIndex : 0);
  const src = images[currentIndex] ?? singleSrc ?? "";

  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastDistRef = useRef<number | null>(null);
  const dragStartXRef = useRef<number>(0);
  const imageRef = useRef<HTMLImageElement>(null);

  const hasMultiple = images.length > 1;
  const canGoPrev = hasMultiple && currentIndex > 0;
  const canGoNext = hasMultiple && currentIndex < images.length - 1;

  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setCurrentIndex(initialIndex >= 0 && initialIndex < images.length ? initialIndex : 0);
  }, [initialIndex, images.length]);

  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, [src]);

  useEffect(() => {
    return () => {
      if (src.startsWith("blob:")) URL.revokeObjectURL(src);
    };
  }, [src]);

  const goPrev = () => {
    if (canGoPrev) setCurrentIndex((i) => i - 1);
  };
  const goNext = () => {
    if (canGoNext) setCurrentIndex((i) => i + 1);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      dragStartXRef.current = e.touches[0].clientX;
      if (scale > 1) setIsDragging(true);
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastDistRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && lastTouchRef.current) {
      const dx = e.touches[0].clientX - lastTouchRef.current.x;
      const dy = e.touches[0].clientY - lastTouchRef.current.y;
      if (scale > 1) {
        setIsDragging(true);
        setTranslate((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      } else if (hasMultiple && Math.abs(dx) > Math.abs(dy)) {
        setTranslate((prev) => ({ ...prev, x: prev.x + dx }));
      }
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && lastDistRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / lastDistRef.current;
      setScale((s) => Math.min(Math.max(1, s * ratio), 5));
      lastDistRef.current = dist;
    }
  };

  const handleTouchEnd = () => {
    if (scale > 1) {
      setIsDragging(false);
    } else if (hasMultiple && lastTouchRef.current !== null) {
      const deltaX = lastTouchRef.current.x - dragStartXRef.current;
      if (deltaX > SWIPE_THRESHOLD && canGoPrev) goPrev();
      else if (deltaX < -SWIPE_THRESHOLD && canGoNext) goNext();
    }
    setTranslate({ x: 0, y: 0 });
    lastTouchRef.current = null;
    lastDistRef.current = null;
    if (scale < 1) setScale(1);
  };

  const handleDoubleTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (scale > 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-modal-backdrop overflow-hidden"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-6 right-6 z-50 w-12 h-12 rounded-full bg-zinc-900/80 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors border border-zinc-700"
      >
        <X className="w-6 h-6" />
      </button>

      {hasMultiple && canGoPrev && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 z-50 w-12 h-12 rounded-full bg-zinc-900/80 flex items-center justify-center text-white hover:bg-zinc-800 transition-colors border border-zinc-700"
          aria-label="Foto anterior"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {hasMultiple && canGoNext && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="absolute right-2 md:right-14 top-1/2 -translate-y-1/2 z-50 w-12 h-12 rounded-full bg-zinc-900/80 flex items-center justify-center text-white hover:bg-zinc-800 transition-colors border border-zinc-700"
          aria-label="Próxima foto"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      <div
        className="w-full h-full flex items-center justify-center touch-none"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          ref={imageRef}
          src={src}
          alt="Preview"
          onDoubleClick={handleDoubleTap}
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transition: isDragging ? "none" : "transform 0.2s ease-out",
          }}
          className="max-w-full max-h-full object-contain select-none"
          draggable={false}
        />
      </div>

      {hasMultiple && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
          {images.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${i === currentIndex ? "bg-brand-yellow" : "bg-zinc-500/60"}`}
            />
          ))}
        </div>
      )}
      {!hasMultiple && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-black/50 px-4 py-2 rounded-full text-zinc-400 text-xs pointer-events-none backdrop-blur-md border border-white/10">
          Toque duplo para zoom ou use pinça
        </div>
      )}
    </div>
  );
};

// --- Componente Visualizador de PDF ---
const PdfViewer = ({ src, onClose }: { src: string; onClose: () => void }) => {
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95 backdrop-blur-xl animate-modal-backdrop">
      {/* Header do PDF Viewer */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/80">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-brand-yellow" />
          <h3 className="text-white font-bold">Visualização de Documento</h3>
        </div>
        <div className="flex items-center gap-3">
           <a 
            href={src} 
            target="_blank" 
            rel="noopener noreferrer"
            className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Abrir Externamente / Baixar"
           >
             <Download className="w-5 h-5" />
           </a>
           <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors border border-zinc-700"
           >
            <X className="w-5 h-5" />
           </button>
        </div>
      </div>
      
      {/* Área do PDF */}
      <div className="flex-1 w-full h-full bg-[#1e1e1e] relative">
         <iframe 
           src={src} 
           className="w-full h-full border-0"
           title="PDF Preview"
         />
      </div>
    </div>
  );
};

/** Converte comentário da API para o formato TrelloAction (compatível com a UI). */
function commentToAction(c: { id: string; author_display_name: string; text: string; created_at: string; author_photo_url?: string | null; updated_at?: string | null }): TrelloAction {
  return {
    id: c.id,
    idMemberCreator: '',
    data: { text: c.text, edited_at: c.updated_at ?? null },
    type: 'commentCard',
    date: c.created_at,
    memberCreator: {
      id: '',
      fullName: c.author_display_name,
      avatarUrl: c.author_photo_url ?? null,
    },
  };
}

export const PatioView: React.FC<PatioViewProps> = ({
  onUseCustomerData,
  effectsEnabled = true,
  commentAuthorName = 'Rei do ABS',
  openServiceOrderId: openServiceOrderIdProp,
  openServiceOrderSection,
  onOpenServiceOrderHandled,
  actorOptions,
  blurPlates = false,
  orderType = 'vehicle',
  patioPermissions,
}) => {
  const can = (key: keyof NonNullable<PatioViewProps['patioPermissions']>) =>
    patioPermissions?.[key] !== false;
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [cards, setCards] = useState<TrelloCard[]>([]);
  const commentsSectionRef = useRef<HTMLDivElement>(null);
  const commentsListRef = useRef<HTMLDivElement>(null);
  const customerDataSectionRef = useRef<HTMLDivElement>(null);
  const descriptionSectionRef = useRef<HTMLDivElement>(null);
  const budgetsSectionRef = useRef<HTMLDivElement>(null);
  const openServiceOrderHandledRef = useRef(false);
  const [allMembers, setAllMembers] = useState<TrelloMember[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Card em Visualização DETALHADA (Full Screen Modal)
  const [selectedCard, setSelectedCard] = useState<TrelloCard | null>(null);
  const [serviceOrderDetail, setServiceOrderDetail] = useState<ServiceOrderDetail | null>(null);
  const [cardDetails, setCardDetails] = useState<{ actions: TrelloAction[], attachments: TrelloAttachment[] } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isEditFichaOpen, setIsEditFichaOpen] = useState(false);
  const [editFichaSaving, setEditFichaSaving] = useState(false);
  /** Seção "Dados da ficha" no modal: começa minimizada. */
  const [isDadosFichaExpanded, setIsDadosFichaExpanded] = useState(false);

  useEffect(() => {
    if (selectedCard?.id) setIsDadosFichaExpanded(false);
  }, [selectedCard?.id]);

  /** Sincroniza o formulário de edição da ficha quando a seção é expandida (para edição inline). */
  useEffect(() => {
    if (!isDadosFichaExpanded || !serviceOrderDetail) return;
    const c = serviceOrderDetail.customers;
    setEditFichaForm({
      name: c?.name ?? '',
      cpf: c?.cpf ?? '',
      phone: c?.phone ?? '',
      email: c?.email ?? '',
      cep: c?.cep ?? '',
      address: c?.address ?? '',
      addressNumber: c?.address_number ?? '',
      vehicleModel: serviceOrderDetail.vehicle_model ?? '',
      moduleIdentification: serviceOrderDetail.module_identification ?? '',
      plate: (serviceOrderDetail.plate ?? '').toUpperCase(),
      mileageKm: serviceOrderDetail.mileage_km ?? '',
    });
  }, [isDadosFichaExpanded, serviceOrderDetail]);

  const [editFichaForm, setEditFichaForm] = useState<{
    name: string; cpf: string; phone: string; email: string; cep: string; address: string; addressNumber: string;
    vehicleModel: string; moduleIdentification: string; plate: string; mileageKm: string;
  }>({ name: '', cpf: '', phone: '', email: '', cep: '', address: '', addressNumber: '', vehicleModel: '', moduleIdentification: '', plate: '', mileageKm: '' });
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  // Estados para Edição de Comentário
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Estados para Edição da DESCRIÇÃO (Ficha Técnica)
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descText, setDescText] = useState('');
  const [isSavingDesc, setIsSavingDesc] = useState(false);

  // Visualização de Imagem (Lightbox) — lista de URLs e índice para navegar entre fotos
  const [previewImages, setPreviewImages] = useState<{ urls: string[]; currentIndex: number } | null>(null);
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null);
  const [renameAttachmentId, setRenameAttachmentId] = useState<string | null>(null);
  const [renameAttachmentNewName, setRenameAttachmentNewName] = useState('');
  const [renamingAttachmentId, setRenamingAttachmentId] = useState<string | null>(null);
  
  // Visualização de PDF
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);

  // Orçamento (Budget)
  const [isBudgetOpen, setIsBudgetOpen] = useState(false);
  const [budgetServices, setBudgetServices] = useState<BudgetServiceItem[]>([]);
  const [budgetParts, setBudgetParts] = useState<BudgetPartItem[]>([]);
  const [budgetDiagnosis, setBudgetDiagnosis] = useState('');
  const [budgetObservations, setBudgetObservations] = useState('');
  const [sendingBudget, setSendingBudget] = useState(false);
  const [savedBudgets, setSavedBudgets] = useState<SavedBudget[]>([]);
  const [viewingBudget, setViewingBudget] = useState<SavedBudget | null>(null);
  const [editingBudget, setEditingBudget] = useState<SavedBudget | null>(null);
  const [deletingBudgetId, setDeletingBudgetId] = useState<string | null>(null);
  /** Admin: orçamento em aprovação (modal com toggles por serviço/peça). */
  const [budgetApprovalTarget, setBudgetApprovalTarget] = useState<SavedBudget | null>(null);
  const [approvalServices, setApprovalServices] = useState<boolean[]>([]);
  const [approvalParts, setApprovalParts] = useState<boolean[]>([]);
  const [savingApproval, setSavingApproval] = useState(false);
  const [workshopServices, setWorkshopServices] = useState<WorkshopService[]>([]);
  const [systemTechnicians, setSystemTechnicians] = useState<SystemUserTechnician[]>([]);
  const [isServiceListOpen, setIsServiceListOpen] = useState(false);
  const [suggestionsForServiceId, setSuggestionsForServiceId] = useState<string | null>(null);
  const suggestionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedServiceInputRef = useRef<HTMLDivElement>(null);
  const [suggestionBoxPosition, setSuggestionBoxPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  // Card em transição de COLUNA (Status)
  const [cardInTransition, setCardInTransition] = useState<TrelloCard | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  // Card em transição de MEMBRO (Mecânico)
  const [cardForMemberAssignment, setCardForMemberAssignment] = useState<TrelloCard | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  // Card em Visualização de CHECKLIST (Entrada ou Finalização)
  const [activeChecklistCardId, setActiveChecklistCardId] = useState<string | null>(null);
  const [activeChecklistType, setActiveChecklistType] = useState<'Entrada' | 'Finalização' | null>(null);
  
  // Estado para indicar criação de checklist
  const [isCreatingChecklist, setIsCreatingChecklist] = useState(false);

  // Estado para arquivamento (Entregue)
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [removingGarantiaId, setRemovingGarantiaId] = useState<string | null>(null);

  // Estados para HISTÓRICO (Search & Use)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historySearchPlate, setHistorySearchPlate] = useState('');
  const [archivedCards, setArchivedCards] = useState<TrelloCard[]>([]);
  /** Últimos veículos arquivados (carregados ao abrir o modal); usados quando a busca não retorna resultados. */
  const [recentArchivedCards, setRecentArchivedCards] = useState<TrelloCard[]>([]);
  const [historyShowingFallback, setHistoryShowingFallback] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedHistoryCard, setSelectedHistoryCard] = useState<TrelloCard | null>(null);
  const [loadingHistoryDetails, setLoadingHistoryDetails] = useState(false);
  const [historyCardDetails, setHistoryCardDetails] = useState<{ actions: TrelloAction[], attachments: TrelloAttachment[] } | null>(null);

  // --- Attachment States ---
  const [isUploading, setIsUploading] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  /** Input para "Foto do veículo" (mesmo comportamento da recepção: câmera ou galeria). */
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Camera State
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Quilometragem editável no modal do veículo
  const [mileageEditValue, setMileageEditValue] = useState('');
  const [lastSavedMileage, setLastSavedMileage] = useState('');
  const [savingMileage, setSavingMileage] = useState(false);
  const [mileageSavedMessage, setMileageSavedMessage] = useState(false);

  // Data de entrega editável no modal do veículo
  const [deliveryDateEditValue, setDeliveryDateEditValue] = useState('');
  const [lastSavedDeliveryDate, setLastSavedDeliveryDate] = useState('');
  const [savingDeliveryDate, setSavingDeliveryDate] = useState(false);
  const [deliveryDateSavedMessage, setDeliveryDateSavedMessage] = useState(false);

  // Modal editar nome do veículo / placa
  const [isVehicleEditOpen, setIsVehicleEditOpen] = useState(false);
  const [isDeleteVehicleOpen, setIsDeleteVehicleOpen] = useState(false);
  const [deleteVehiclePassword, setDeleteVehiclePassword] = useState('');
  const [deleteVehicleSaving, setDeleteVehicleSaving] = useState(false);
  const [deleteVehicleError, setDeleteVehicleError] = useState<string | null>(null);
  const [vehicleEditModel, setVehicleEditModel] = useState('');
  const [vehicleEditPlate, setVehicleEditPlate] = useState('');
  const [savingVehicleEdit, setSavingVehicleEdit] = useState(false);

  // Efeito "folha boiando na água" nos cards do pátio (hover 3D)
  const [cardFloat, setCardFloat] = useState<{ id: string; rotateX: number; rotateY: number } | null>(null);
  const FLOAT_MAX_TILT = 6;
  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>, cardId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const rotateY = (relX - 0.5) * 2 * FLOAT_MAX_TILT;
    const rotateX = (0.5 - relY) * 2 * FLOAT_MAX_TILT;
    setCardFloat({ id: cardId, rotateX, rotateY });
  };
  const handleCardMouseLeave = () => setCardFloat(null);

  // Helper para normalizar texto (remover acentos e lowercase) para comparações seguras
  const normalizeText = (text: string) => {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
  };

  const fetchData = async (isBackground = false) => {
    if (!isBackground) {
      setError(null);
      setInitialLoading(true);
    }
    try {
      const orders = await getServiceOrders(undefined, orderType);
      let technicians: SystemUserTechnician[] = [];
      try {
        technicians = await getSystemUserTechnicians();
      } catch (_) {
        // Nenhum usuário marcado como técnico ainda
      }
      setSystemTechnicians(technicians);
      setLists(BACKEND_LISTS);
      const nameMap = buildTechnicianNameMap(technicians);
      const onlyActive = orders.filter((o) => o.status !== 'CANCELLED');
      setCards(onlyActive.map((o) => orderToCard(o, nameMap, orderType)).sort((a, b) => new Date(b.dateLastActivity).getTime() - new Date(a.dateLastActivity).getTime()));
      setAllMembers([]);
      if (error) setError(null);
    } catch (err: any) {
      if (!isBackground) setError(err?.message ?? 'Erro ao carregar ordens.');
      else console.error("Erro na sincronização:", err);
    } finally {
      if (!isBackground) setInitialLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCard) {
      const km = selectedCard.mileageKm ?? '';
      setMileageEditValue(km);
      setLastSavedMileage(km);
      setMileageSavedMessage(false);
      const dd = selectedCard.deliveryDate ?? '';
      setDeliveryDateEditValue(dd);
      setLastSavedDeliveryDate(dd);
      setDeliveryDateSavedMessage(false);
    }
  }, [selectedCard?.id, selectedCard?.mileageKm, selectedCard?.deliveryDate]);

  // Abrir modal do veículo ao clicar em notificação (navegação da central de notificações)
  useEffect(() => {
    if (!openServiceOrderIdProp || openServiceOrderHandledRef.current) return;
    if (cards.length === 0) return;
    const card = cards.find((c) => c.id === openServiceOrderIdProp);
    if (card) {
      setSelectedCard(card);
    } else {
      openServiceOrderHandledRef.current = true;
      onOpenServiceOrderHandled?.();
    }
  }, [openServiceOrderIdProp, cards, onOpenServiceOrderHandled]);

  // Rolar à seção (comentários, orçamentos, queixa) após abrir o modal e carregar detalhes
  useEffect(() => {
    if (!selectedCard || !openServiceOrderSection || selectedCard.id !== openServiceOrderIdProp) return;
    if (openServiceOrderHandledRef.current) return;
    const scrollToSection = () => {
      const ref = openServiceOrderSection === 'comments' ? commentsSectionRef : openServiceOrderSection === 'budgets' ? budgetsSectionRef : descriptionSectionRef;
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      openServiceOrderHandledRef.current = true;
      onOpenServiceOrderHandled?.();
    };
    if (openServiceOrderSection === 'comments' || openServiceOrderSection === 'budgets') {
      if (!loadingDetails) setTimeout(scrollToSection, 150);
    } else {
      setTimeout(scrollToSection, 300);
    }
  }, [selectedCard?.id, openServiceOrderSection, openServiceOrderIdProp, loadingDetails, onOpenServiceOrderHandled]);

  useEffect(() => {
    if (!openServiceOrderIdProp) openServiceOrderHandledRef.current = false;
  }, [openServiceOrderIdProp]);

  // Manter a última mensagem visível: rolar ao fim ao carregar comentários ou ao enviar novo
  useEffect(() => {
    if (!selectedCard || loadingDetails) return;
    const actions = cardDetails?.actions;
    if (!actions?.length) return;
    const el = commentsListRef.current;
    if (!el) return;
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    requestAnimationFrame(() => requestAnimationFrame(scrollToBottom));
  }, [selectedCard?.id, loadingDetails, cardDetails?.actions?.length]);

  useEffect(() => {
    if (selectedCard) {
      setDescText(selectedCard.desc || "");
      setIsEditingDesc(false);
      setLoadingDetails(true);
      setCardDetails(null);
      setServiceOrderDetail(null);
      Promise.all([
        getServiceOrderById(selectedCard.id),
        getServiceOrderPhotos(selectedCard.id),
        getServiceOrderBudgets(selectedCard.id),
        getServiceOrderComments(selectedCard.id),
      ])
        .then(([order, photos, budgets, comments]) => {
          setServiceOrderDetail(order);
          setCardDetails({
            actions: (comments ?? []).map(commentToAction),
            attachments: photos.map((p, i) => ({
              id: p.path || String(i),
              name: p.name,
              url: p.url,
              mimeType: attachmentMimeType(p.name),
              previews: [{ url: p.url, width: 200, height: 200 }],
            })),
          });
          setSavedBudgets(budgets);
        })
        .catch(err => console.error("Erro ao carregar detalhes", err))
        .finally(() => setLoadingDetails(false));
    } else {
      setServiceOrderDetail(null);
      setSavedBudgets([]);
    }
  }, [selectedCard]);

  /** Atualiza os detalhes da OS no modal (serviceOrderDetail) sem fechar o modal nem mostrar loading. */
  const refreshModalDetails = React.useCallback(async () => {
    if (!selectedCard) return;
    try {
      const order = await getServiceOrderById(selectedCard.id);
      setServiceOrderDetail(order);
    } catch (e) {
      console.error('Erro ao atualizar detalhes do modal', e);
    }
  }, [selectedCard?.id]);

  useEffect(() => {
    fetchData(false);
    const intervalId = setInterval(() => fetchData(true), 5000);
    return () => clearInterval(intervalId);
  }, []);

  // Deriva o cartão ativo do estado principal de cards
  const activeChecklistCard = cards.find(c => c.id === activeChecklistCardId);

  /** Carrega os últimos veículos arquivados (sem filtro de busca). */
  const loadRecentArchived = async () => {
    setIsLoadingHistory(true);
    setHistoryShowingFallback(false);
    try {
      const orders = await getServiceOrders('CANCELLED', orderType);
      const nameMap = buildTechnicianNameMap(workshopTechnicians);
      const list = orders.map((o) => orderToCard(o, nameMap, orderType));
      setRecentArchivedCards(list);
      setArchivedCards(list);
    } catch (err) {
      console.error(err);
      setArchivedCards([]);
      alert("Erro ao carregar histórico.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSearchHistory = async (termToSearch: string = historySearchPlate) => {
    const term = (termToSearch ?? historySearchPlate).trim();
    setIsLoadingHistory(true);
    setHistoryShowingFallback(false);
    try {
      const orders = await getServiceOrders('CANCELLED', orderType);
      const nameMap = buildTechnicianNameMap(workshopTechnicians);
      if (!term) {
        const list = orders.map((o) => orderToCard(o, nameMap, orderType));
        setRecentArchivedCards(list);
        setArchivedCards(list);
        return;
      }
      const cancelled = orders.filter(
        o =>
          (o.plate && o.plate.toUpperCase().includes(term.toUpperCase())) ||
          (o.customers?.name && o.customers.name.toLowerCase().includes(term.toLowerCase())) ||
          (o.vehicle_model && o.vehicle_model.toLowerCase().includes(term.toLowerCase())) ||
          (o.module_identification && o.module_identification.toLowerCase().includes(term.toLowerCase()))
      );
      const cards = cancelled.map((o) => orderToCard(o, nameMap, orderType));
      if (cards.length === 0) {
        const list = orders.map((o) => orderToCard(o, nameMap, orderType));
        setRecentArchivedCards(list);
        setArchivedCards(list);
        setHistoryShowingFallback(list.length > 0);
      } else {
        setArchivedCards(cards);
      }
    } catch (err) {
      console.error(err);
      setArchivedCards(recentArchivedCards);
      setHistoryShowingFallback(recentArchivedCards.length > 0);
      alert("Erro ao buscar histórico.");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const isModuleMode = orderType === 'module';

  // Ao abrir o modal de histórico, carregar os últimos veículos arquivados
  useEffect(() => {
    if (isHistoryOpen) {
      setHistoryShowingFallback(false);
      loadRecentArchived();
    }
  }, [isHistoryOpen]);

  const handleOpenHistoryCardDetails = (card: TrelloCard) => {
    setSelectedHistoryCard(card);
    setLoadingHistoryDetails(true);
    setHistoryCardDetails(null);
    Promise.all([getServiceOrderById(card.id), getServiceOrderPhotos(card.id)])
      .then(([, photos]) =>
        setHistoryCardDetails({
          actions: [],
          attachments: photos.map((p, i) => ({
            id: p.path || String(i),
            name: p.name,
            url: p.url,
            mimeType: attachmentMimeType(p.name),
            previews: [{ url: p.url, width: 200, height: 200 }],
          })),
        })
      )
      .catch(err => console.error(err))
      .finally(() => setLoadingHistoryDetails(false));
  };

  const handleUseRegistration = async (card: TrelloCard) => {
    try {
      const detail = await getServiceOrderById(card.id);
      const c = detail.customers;
      const customerData: Customer = {
        name: c?.name ?? '',
        cpf: c?.cpf ?? '',
        phone: c?.phone ?? '',
        email: c?.email ?? undefined,
        cep: c?.cep ?? '',
        address: c?.address ?? '',
        addressNumber: c?.address_number ?? '',
        vehicleModel: detail.vehicle_model ?? '',
        moduleIdentification: detail.module_identification ?? undefined,
        plate: (detail.plate || '').toUpperCase(),
        mileageKm: detail.mileage_km ?? '',
        issueDescription: '',
      };
      setSelectedHistoryCard(null);
      setIsHistoryOpen(false);
      if (onUseCustomerData) onUseCustomerData(customerData);
    } catch (e: any) {
      alert(e?.message ?? "Erro ao carregar dados.");
    }
  };

  const handleOpenMoveModal = (card: TrelloCard, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCardInTransition(card);
  };

  const handleMoveCard = async (newListId: string) => {
    if (!cardInTransition || !newListId) return;
    const cardId = cardInTransition.id;
    setIsMoving(true);
    try {
      await updateServiceOrderStatus(cardId, newListId as ServiceOrderStatus, actorOptions);
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, idList: newListId, garantiaTag: newListId === 'GARANTIA' || c.garantiaTag } : c));
      if (selectedCard?.id === cardId) {
        setSelectedCard(prev => prev && prev.id === cardId ? { ...prev, idList: newListId, garantiaTag: newListId === 'GARANTIA' || prev.garantiaTag } : prev);
      }
      setCardInTransition(null);
    } catch (err: any) {
      console.error("Failed to move", err);
      alert(err?.message ?? "Erro ao mover.");
    } finally {
      setIsMoving(false);
      fetchData(true);
    }
  };

  const handleRemoveGarantia = async () => {
    if (!selectedCard || !selectedCard.garantiaTag) return;
    const cardId = selectedCard.id;
    setRemovingGarantiaId(cardId);
    try {
      await updateServiceOrderGarantiaTag(cardId, false, actorOptions);
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, garantiaTag: false } : c));
      setSelectedCard(prev => prev && prev.id === cardId ? { ...prev, garantiaTag: false } : prev);
    } catch (err: any) {
      alert(err?.message ?? 'Erro ao remover etiqueta garantia.');
    } finally {
      setRemovingGarantiaId(null);
    }
  };

  const handleSaveMileage = async () => {
    if (!selectedCard) return;
    const value = mileageEditValue.trim();
    setSavingMileage(true);
    setMileageSavedMessage(false);
    try {
      await updateServiceOrderMileage(selectedCard.id, value || null, actorOptions);
      const updated = { ...selectedCard, mileageKm: value || null };
      setSelectedCard(updated);
      setCards(prev => prev.map(c => c.id === selectedCard.id ? updated : c));
      setLastSavedMileage(value);
      setMileageSavedMessage(true);
      setTimeout(() => setMileageSavedMessage(false), 2500);
      refreshModalDetails();
    } catch (e: any) {
      alert(e?.message ?? 'Erro ao salvar Km.');
    } finally {
      setSavingMileage(false);
    }
  };

  const handleSaveDeliveryDate = async () => {
    if (!selectedCard) return;
    const value = deliveryDateEditValue.trim();
    setSavingDeliveryDate(true);
    setDeliveryDateSavedMessage(false);
    try {
      await updateServiceOrderDeliveryDate(selectedCard.id, value || null, actorOptions);
      const updated = { ...selectedCard, deliveryDate: value || null };
      setSelectedCard(updated);
      setCards(prev => prev.map(c => c.id === selectedCard.id ? updated : c));
      setLastSavedDeliveryDate(value);
      setDeliveryDateSavedMessage(true);
      setTimeout(() => setDeliveryDateSavedMessage(false), 2500);
      refreshModalDetails();
    } catch (e: any) {
      alert(e?.message ?? 'Erro ao salvar data de entrega.');
    } finally {
      setSavingDeliveryDate(false);
    }
  };

  const openVehicleEditModal = () => {
    if (!selectedCard) return;
    const parts = selectedCard.name.split('-').map((s) => s.trim());
    setVehicleEditModel(parts[0] || '');
    setVehicleEditPlate(parts[1] || '');
    setIsVehicleEditOpen(true);
  };

  const handleSaveVehicleEdit = async () => {
    if (!selectedCard) return;
    const model = vehicleEditModel.trim();
    const plate = vehicleEditPlate.trim().toUpperCase();
    if (!model) {
      alert('Informe o nome do veículo.');
      return;
    }
    if (!plate) {
      alert('Informe a placa.');
      return;
    }
    setSavingVehicleEdit(true);
    try {
      await updateServiceOrderVehicle(selectedCard.id, { vehicleModel: model, plate }, actorOptions);
      const parts = selectedCard.name.split('-').map((s) => s.trim());
      const customerPart = parts[2] ?? 'Cliente';
      const newName = `${model} - ${plate} - ${customerPart}`;
      setCards((prev) =>
        prev.map((c) => (c.id === selectedCard.id ? { ...c, name: newName } : c))
      );
      setSelectedCard((prev) => (prev?.id === selectedCard.id ? { ...prev, name: newName } : prev));
      setIsVehicleEditOpen(false);
      refreshModalDetails();
    } catch (e: any) {
      alert(e?.message ?? 'Erro ao salvar.');
    } finally {
      setSavingVehicleEdit(false);
    }
  };

  const handleConfirmDeleteVehicle = async () => {
    if (!selectedCard || !deleteVehiclePassword.trim()) return;
    setDeleteVehicleError(null);
    setDeleteVehicleSaving(true);
    try {
      await deleteServiceOrderWithPassword(selectedCard.id, deleteVehiclePassword.trim());
      setCards((prev) => prev.filter((c) => c.id !== selectedCard.id));
      setSelectedCard(null);
      setIsDeleteVehicleOpen(false);
      setDeleteVehiclePassword('');
    } catch (e: any) {
      setDeleteVehicleError(e?.message ?? 'Erro ao excluir.');
    } finally {
      setDeleteVehicleSaving(false);
    }
  };

  const handleAssignTechnician = async (technician: { id: string; name: string } | null) => {
    if (!cardForMemberAssignment) return;
    setIsAssigning(true);
    try {
      await updateServiceOrderTechnician(cardForMemberAssignment.id, technician?.id ?? null, actorOptions);
      const newMembers = technician ? [{ id: technician.id, fullName: capitalizeFirst(technician.name), username: '' }] : [];
      setCards(prev =>
        prev.map(c =>
          c.id === cardForMemberAssignment.id
            ? { ...c, members: newMembers }
            : c
        )
      );
      if (selectedCard?.id === cardForMemberAssignment.id) {
        setSelectedCard(prev => prev ? { ...prev, members: newMembers } : null);
        refreshModalDetails();
      }
      setCardForMemberAssignment(null);
    } catch (err: any) {
      alert(err?.message ?? 'Erro ao atribuir técnico.');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleToggleCheckItem = async (_cardId: string, _checklistId: string, _itemId: string, _currentState: 'complete' | 'incomplete') => {
    // Backend: checklists em breve
  };

  const handleCreateChecklist = async (_type: 'Entrada' | 'Finalização') => {
    if (!activeChecklistCardId) return;
    setIsCreatingChecklist(false);
    // Backend: checklists em breve
  };

  const handleSendComment = async () => {
    if (!selectedCard || !newComment.trim()) return;
    const text = newComment.trim();
    setNewComment('');
    setSendingComment(true);
    try {
      await addServiceOrderComment(selectedCard.id, text, commentAuthorName);
      const comments = await getServiceOrderComments(selectedCard.id);
      setCardDetails(prev => prev ? {
        ...prev,
        actions: comments.map(commentToAction),
      } : null);
    } catch (err: any) {
      alert(err?.message ?? 'Erro ao enviar comentário.');
      setNewComment(text);
    } finally {
      setSendingComment(false);
    }
  };

  // --- Funções de Edição/Exclusão de Comentários ---

  const handleStartEdit = (actionId: string, text: string) => {
    setEditingActionId(actionId);
    setEditingText(text);
  };

  const handleCancelEdit = () => {
    setEditingActionId(null);
    setEditingText('');
  };

  /** Verifica se o usuário atual é o autor do comentário (para exibir Editar/Excluir só ao autor). */
  const isAuthorOfComment = (authorDisplayName: string): boolean => {
    const norm = (s: string) => (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return norm(authorDisplayName) === norm(commentAuthorName ?? '');
  };

  const handleUpdateComment = async (actionId: string) => {
    if (!selectedCard || !actionId || !editingText.trim()) {
      setEditingActionId(null);
      setEditingText('');
      return;
    }
    setActionLoadingId(actionId);
    try {
      await updateServiceOrderComment(selectedCard.id, actionId, editingText.trim());
      const comments = await getServiceOrderComments(selectedCard.id);
      setCardDetails(prev => prev ? {
        ...prev,
        actions: comments.map(commentToAction),
      } : null);
      setEditingActionId(null);
      setEditingText('');
    } catch (err: any) {
      alert(err?.message ?? 'Erro ao atualizar comentário.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteComment = async (actionId: string) => {
    if (!selectedCard || !actionId) return;
    if (!confirm('Excluir este comentário? Esta ação não pode ser desfeita.')) return;
    setActionLoadingId(actionId);
    try {
      await deleteServiceOrderComment(selectedCard.id, actionId);
      const comments = await getServiceOrderComments(selectedCard.id);
      setCardDetails(prev => prev ? {
        ...prev,
        actions: comments.map(commentToAction),
      } : null);
    } catch (err: any) {
      alert(err?.message ?? 'Erro ao excluir comentário.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSaveDescription = async () => {
    if (!selectedCard) return;
    setIsSavingDesc(true);
    try {
      await updateServiceOrderDescription(selectedCard.id, descText, actorOptions);
      const updatedCard = { ...selectedCard, desc: descText };
      setSelectedCard(updatedCard);
      setCards(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c));
      setIsEditingDesc(false);
      refreshModalDetails();
    } catch (err: any) {
      alert(err?.message ?? "Erro ao atualizar a descrição.");
    } finally {
      setIsSavingDesc(false);
    }
  };

  const openEditFichaModal = () => {
    if (!serviceOrderDetail) return;
    const c = serviceOrderDetail.customers;
    setEditFichaForm({
      name: c?.name ?? '',
      cpf: c?.cpf ?? '',
      phone: c?.phone ?? '',
      email: c?.email ?? '',
      cep: c?.cep ?? '',
      address: c?.address ?? '',
      addressNumber: c?.address_number ?? '',
      vehicleModel: serviceOrderDetail.vehicle_model ?? '',
      moduleIdentification: serviceOrderDetail.module_identification ?? '',
      plate: (serviceOrderDetail.plate ?? '').toUpperCase(),
      mileageKm: serviceOrderDetail.mileage_km ?? '',
    });
    setIsEditFichaOpen(true);
  };

  const handleSaveEditFicha = async () => {
    if (!selectedCard || !serviceOrderDetail?.customers?.id) return;
    setEditFichaSaving(true);
    try {
      await updateCustomer(serviceOrderDetail.customers.id, {
        name: editFichaForm.name.trim(),
        cpf: editFichaForm.cpf.trim() || null,
        phone: editFichaForm.phone.trim(),
        email: editFichaForm.email.trim() || null,
        cep: editFichaForm.cep.trim() || null,
        address: editFichaForm.address.trim() || null,
        addressNumber: editFichaForm.addressNumber.trim() || null,
      });
      await updateServiceOrderVehicle(selectedCard.id, {
        vehicleModel: editFichaForm.vehicleModel.trim(),
        moduleIdentification: isModuleMode ? (editFichaForm.moduleIdentification.trim() || null) : undefined,
        plate: isModuleMode ? undefined : editFichaForm.plate.trim().toUpperCase(),
      }, actorOptions);
      if (!isModuleMode) {
        await updateServiceOrderMileage(selectedCard.id, editFichaForm.mileageKm.trim() || null, actorOptions);
      }
      const updated = await getServiceOrderById(selectedCard.id);
      setServiceOrderDetail(updated);
      const newName = isModuleMode
        ? `${updated.vehicle_model || '—'} - ${updated.module_identification || '—'} - ${updated.customers?.name || 'Cliente'}`
        : `${updated.vehicle_model || 'Veículo'} - ${(updated.plate || '---').toUpperCase()} - ${updated.customers?.name || 'Cliente'}`;
      const updatedCard = { ...selectedCard, name: newName, osNumber: updated.os_number ?? selectedCard.osNumber };
      setSelectedCard(updatedCard);
      setCards(prev => prev.map(c => c.id === selectedCard.id ? { ...c, name: newName } : c));
      setIsEditFichaOpen(false);
    } catch (err: any) {
      alert(err?.message ?? "Erro ao salvar alterações.");
    } finally {
      setEditFichaSaving(false);
    }
  };

  // --- Budget Functions ---

  const openBudgetModal = (budgetToEdit?: SavedBudget | null) => {
    const isEdit = budgetToEdit && typeof budgetToEdit === 'object' && 'id' in budgetToEdit && 'services' in budgetToEdit && Array.isArray(budgetToEdit.services);
    if (isEdit && budgetToEdit) {
      setEditingBudget(budgetToEdit);
      setBudgetDiagnosis(budgetToEdit.diagnosis ?? '');
      setBudgetServices(budgetToEdit.services.length > 0
        ? budgetToEdit.services.map((s, i) => ({ id: `s-${budgetToEdit.id}-${i}`, description: s.description }))
        : [{ id: '1', description: '' }]);
      setBudgetParts(budgetToEdit.parts.length > 0
        ? budgetToEdit.parts.map((p, i) => ({ id: `p-${budgetToEdit.id}-${i}`, description: p.description, quantity: p.quantity || '1' }))
        : [{ id: '1', description: '', quantity: '1' }]);
      setBudgetObservations(budgetToEdit.observations ?? '');
    } else {
      setEditingBudget(null);
      setBudgetServices([{ id: '1', description: '' }]);
      setBudgetParts([{ id: '1', description: '', quantity: '1' }]);
      setBudgetDiagnosis('');
      setBudgetObservations('');
    }
    setIsBudgetOpen(true);
    getWorkshopServices().then(setWorkshopServices).catch(() => setWorkshopServices([]));
  };

  const closeBudgetModal = () => {
    setIsBudgetOpen(false);
    setEditingBudget(null);
    setBudgetDiagnosis('');
    setBudgetServices([{ id: String(Date.now()), description: '' }]);
    setBudgetParts([{ id: String(Date.now() + 1), description: '', quantity: '1' }]);
    setBudgetObservations('');
  };

  const handleDeleteBudget = async () => {
    if (!selectedCard || !viewingBudget) return;
    if (!confirm('Tem certeza que deseja excluir este orçamento? Esta ação não pode ser desfeita.')) return;
    setDeletingBudgetId(viewingBudget.id);
    try {
      await deleteServiceOrderBudget(selectedCard.id, viewingBudget.id);
      setSavedBudgets((prev) => prev.filter((b) => b.id !== viewingBudget.id));
      setViewingBudget(null);
    } catch (err: unknown) {
      alert((err as Error)?.message ?? 'Erro ao excluir orçamento.');
    } finally {
      setDeletingBudgetId(null);
    }
  };

  /** Abre o modal de aprovação do orçamento (só admin). */
  const openBudgetApproval = (budget: SavedBudget) => {
    setBudgetApprovalTarget(budget);
    setApprovalServices(budget.services.map((s) => s.approved === true));
    setApprovalParts(budget.parts.map((p) => p.approved === true));
  };

  const closeBudgetApproval = () => {
    setBudgetApprovalTarget(null);
    setApprovalServices([]);
    setApprovalParts([]);
  };

  const handleSaveApproval = async () => {
    if (!selectedCard || !budgetApprovalTarget) return;
    setSavingApproval(true);
    try {
      const services = budgetApprovalTarget.services.map((s, i) => ({
        description: s.description,
        approved: approvalServices[i] ?? false,
      }));
      const parts = budgetApprovalTarget.parts.map((p, i) => ({
        description: p.description,
        quantity: p.quantity,
        approved: approvalParts[i] ?? false,
      }));
      const updated = await updateServiceOrderBudget(
        selectedCard.id,
        budgetApprovalTarget.id,
        {
          cardName: budgetApprovalTarget.cardName,
          diagnosis: budgetApprovalTarget.diagnosis,
          services,
          parts,
          observations: budgetApprovalTarget.observations,
        },
        actorOptions
      );
      setSavedBudgets((prev) => prev.map((b) => (b.id === updated.id ? { ...updated, createdAt: b.createdAt } : b)));
      if (viewingBudget?.id === updated.id) setViewingBudget(updated);
      closeBudgetApproval();
    } catch (err: any) {
      alert(err?.message ?? 'Erro ao salvar aprovação.');
    } finally {
      setSavingApproval(false);
    }
  };

  /** Compartilha orçamento via Web Share API (igual às fotos dos anexos). */
  const shareBudget = async (budget: SavedBudget, mileageKm?: string | null) => {
    const dateStr = new Date(budget.createdAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const sym = (approved: boolean | undefined) => approved === true ? '✓ ' : approved === false ? '✗ ' : '— ';
    const lines: string[] = [
      `Orçamento - ${budget.cardName ?? 'Veículo'}`,
      dateStr,
      ...(mileageKm ? [`Km ${mileageKm}`] : []),
      '',
    ];
    if (budget.diagnosis) {
      lines.push('Diagnóstico:', budget.diagnosis.trim(), '');
    }
    if (budget.services.length > 0) {
      lines.push('Serviços:', ...budget.services.map((s) => `  ${sym(s.approved)}${s.description}`), '');
    }
    if (budget.parts.length > 0) {
      lines.push('Peças:', ...budget.parts.map((p) => `  ${sym(p.approved)}(${p.quantity || 1}x) ${p.description}`), '');
    }
    if (budget.observations) {
      lines.push('Observações:', budget.observations.trim());
    }
    const text = lines.join('\n');
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Orçamento - ${budget.cardName ?? 'Veículo'}`,
          text,
        });
      } catch (err: unknown) {
        if ((err as { name?: string })?.name !== 'AbortError') {
          try {
            await navigator.clipboard.writeText(text);
            alert('Orçamento copiado para a área de transferência.');
          } catch {
            alert('Não foi possível compartilhar. Tente imprimir.');
          }
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        alert('Orçamento copiado para a área de transferência.');
      } catch {
        alert('Seu navegador não suporta compartilhar. Use Ctrl+C após abrir para imprimir.');
      }
    }
  };

  const printBudget = (budget: SavedBudget, mileageKm?: string | null) => {
    const esc = (s: string) => String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '<br>');
    const dateStr = new Date(budget.createdAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const sym = (approved: boolean | undefined) => approved === true ? '✓ ' : approved === false ? '✗ ' : '— ';
    const servicesHtml = budget.services.length > 0
      ? `<h3 class="sec">Serviços</h3><ul>${budget.services.map((s) => `<li>${sym(s.approved)}${esc(s.description)}</li>`).join('')}</ul>`
      : '';
    const partsHtml = budget.parts.length > 0
      ? `<h3 class="sec">Peças</h3><ul>${budget.parts.map((p) => `<li>${sym(p.approved)}<strong>(${esc(p.quantity)}x)</strong> ${esc(p.description)}</li>`).join('')}</ul>`
      : '';
    const diagnosisHtml = budget.diagnosis ? `<h3 class="sec">Diagnóstico</h3><div class="block">${esc(budget.diagnosis)}</div>` : '';
    const obsHtml = budget.observations ? `<h3 class="sec">Observações</h3><div class="block">${esc(budget.observations)}</div>` : '';
    const kmHtml = mileageKm ? `<p class="meta">Km ${esc(mileageKm)}</p>` : '';
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Orçamento - ${esc(budget.cardName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Georgia, 'Times New Roman', serif; padding: 24px; color: #3d3932; font-size: 14px; line-height: 1.5; }
    .header { border-bottom: 2px solid #c9c4b8; padding-bottom: 12px; margin-bottom: 20px; }
    h1 { font-size: 18px; font-weight: bold; color: #3d3932; }
    .meta { color: #6b6560; font-size: 13px; margin-top: 4px; }
    .sec { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b6560; margin: 16px 0 8px; }
    .block { white-space: pre-wrap; }
    ul { list-style: disc; margin-left: 20px; }
    li { margin: 4px 0; }
    @media print { body { padding: 16px; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Orçamento</h1>
    <p class="meta">${esc(budget.cardName)}</p>
    <p class="meta">${esc(dateStr)}</p>
    ${kmHtml}
  </div>
  ${diagnosisHtml}
  ${servicesHtml}
  ${partsHtml}
  ${obsHtml}
  <script>
    window.onload = function() {
      window.focus();
      window.print();
      window.onafterprint = function() { window.close(); };
    };
  </script>
</body>
</html>`;
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (w) {
      w.document.write(html);
      w.document.close();
    } else {
      alert('Permita pop-ups para esta página para poder imprimir.');
    }
  };

  const addServiceRow = () => {
    setBudgetServices([...budgetServices, { id: Date.now().toString(), description: '' }]);
  };

  const addPartRow = () => {
    setBudgetParts([...budgetParts, { id: Date.now().toString(), description: '', quantity: '1' }]);
  };

  const removeServiceRow = (id: string) => {
    setBudgetServices(budgetServices.filter(i => i.id !== id));
  };

  const removePartRow = (id: string) => {
    setBudgetParts(budgetParts.filter(i => i.id !== id));
  };

  const updateServiceDescription = (id: string, value: string) => {
    setBudgetServices(budgetServices.map(item => item.id === id ? { ...item, description: value } : item));
  };

  const updatePartDescription = (id: string, value: string) => {
    setBudgetParts(budgetParts.map(item => item.id === id ? { ...item, description: value } : item));
  };

  const updatePartQuantity = (id: string, delta: number) => {
    setBudgetParts(budgetParts.map(item => {
      if (item.id === id) {
        const currentQty = parseInt(item.quantity) || 0;
        const newQty = Math.max(1, currentQty + delta);
        return { ...item, quantity: newQty.toString() };
      }
      return item;
    }));
  };

  const addServiceFromList = (name: string) => {
    setBudgetServices(prev => [...prev, { id: Date.now().toString(), description: name }]);
    setIsServiceListOpen(false);
  };

  const getServiceSuggestions = (description: string) => {
    const q = normalizeText(description.trim());
    if (!q) return [];
    return workshopServices.filter(s => normalizeText(s.name).includes(q)).slice(0, 6);
  };

  useEffect(() => {
    if (suggestionsForServiceId && focusedServiceInputRef.current) {
      const rect = focusedServiceInputRef.current.getBoundingClientRect();
      setSuggestionBoxPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    } else {
      setSuggestionBoxPosition(null);
    }
  }, [suggestionsForServiceId]);

  const handleServiceInputFocus = (id: string) => {
    if (suggestionCloseTimerRef.current) {
      clearTimeout(suggestionCloseTimerRef.current);
      suggestionCloseTimerRef.current = null;
    }
    setSuggestionsForServiceId(id);
  };

  const handleServiceInputBlur = () => {
    suggestionCloseTimerRef.current = setTimeout(() => setSuggestionsForServiceId(null), 180);
  };

  const applySuggestion = (itemId: string, name: string) => {
    updateServiceDescription(itemId, name);
    setSuggestionsForServiceId(null);
  };

  const handleCreateBudget = async () => {
    if (!selectedCard) return;

    const validServices = budgetServices.filter(s => s.description.trim());
    const validParts = budgetParts.filter(p => p.description.trim());

    if (validServices.length === 0 && validParts.length === 0 && !budgetDiagnosis.trim()) {
      alert("Adicione pelo menos um serviço, peça ou diagnóstico.");
      return;
    }

    const payload = {
      cardName: selectedCard.name,
      diagnosis: budgetDiagnosis.trim(),
      services: editingBudget
        ? validServices.map((s, i) => ({ description: s.description.trim(), approved: editingBudget.services[i]?.approved }))
        : validServices.map(s => ({ description: s.description.trim() })),
      parts: editingBudget
        ? validParts.map((p, i) => ({ description: p.description.trim(), quantity: (p.quantity || '1').trim(), approved: editingBudget.parts[i]?.approved }))
        : validParts.map(p => ({ description: p.description.trim(), quantity: (p.quantity || '1').trim() })),
      observations: budgetObservations.trim(),
    };

    setSendingBudget(true);
    try {
      if (editingBudget) {
        const updated = await updateServiceOrderBudget(selectedCard.id, editingBudget.id, payload, actorOptions);
        setSavedBudgets(prev => prev.map(b => b.id === editingBudget.id ? updated : b));
        closeBudgetModal();
      } else {
        const budget = await createServiceOrderBudget(selectedCard.id, payload, actorOptions);
        setSavedBudgets(prev => [budget, ...prev]);
        closeBudgetModal();
      }
    } catch (err: any) {
      alert(err?.message ?? "Erro ao salvar orçamento.");
    } finally {
      setSendingBudget(false);
    }
  };

  const handleDeliverVehicle = async (cardId: string) => {
    if (!confirm("Confirmar entrega do veículo? O registro será arquivado e ficará disponível no Histórico de veículos.")) return;
    setArchivingId(cardId);
    try {
      await updateServiceOrderStatus(cardId, 'CANCELLED', actorOptions);
      setCards((prev) => prev.filter((c) => c.id !== cardId));
    } catch (error: any) {
      alert(error?.message ?? "Erro ao arquivar.");
    } finally {
      setArchivingId(null);
    }
  };

  const handleUnarchive = async (card: TrelloCard) => {
    try {
      await updateServiceOrderStatus(card.id, 'FINALIZADO', actorOptions);
      setSelectedHistoryCard(null);
      setArchivedCards((prev) => prev.filter((c) => c.id !== card.id));
      fetchData(true);
      if (historySearchPlate.trim()) handleSearchHistory(historySearchPlate);
    } catch (e: any) {
      alert(e?.message ?? "Erro ao desarquivar.");
    }
  };

  const getStatusConfig = (listName: string, listId?: string) => {
    const byName = SERVICE_ORDER_STAGES.find(
      (s) => s.name.toLowerCase() === listName.toLowerCase()
    );
    if (byName) return { style: byName.style, label: byName.name };
    if (listId === "CANCELLED")
      return { style: "bg-zinc-600 text-zinc-300 border-zinc-600", label: "Arquivado" };
    return { style: getStageStyle(listId || ""), label: listName };
  };

  // Mapa de accent_color (perfil do técnico) para classes Tailwind
  const accentColorToStyle = (accent: string | null | undefined): string => {
    const c = (accent || 'zinc').toLowerCase();
    const map: Record<string, string> = {
      blue: 'bg-blue-600 text-white border-blue-600',
      emerald: 'bg-emerald-600 text-white border-emerald-600',
      violet: 'bg-violet-600 text-white border-violet-600',
      amber: 'bg-amber-500 text-white border-amber-500',
      rose: 'bg-rose-600 text-white border-rose-600',
      cyan: 'bg-cyan-600 text-white border-cyan-600',
      orange: 'bg-orange-500 text-white border-orange-500',
      zinc: 'bg-zinc-600 text-white border-zinc-600',
    };
    return map[c] ?? map.zinc;
  };
  const accentColorToText = (accent: string | null | undefined): string => {
    const c = (accent || 'zinc').toLowerCase();
    const map: Record<string, string> = {
      blue: 'text-blue-500', emerald: 'text-emerald-500', violet: 'text-violet-500',
      amber: 'text-amber-500', rose: 'text-rose-500', cyan: 'text-cyan-500',
      orange: 'text-orange-500', zinc: 'text-zinc-500',
    };
    return map[c] ?? map.zinc;
  };

  // Lista de técnicos para o modal: usuários do sistema (com cor e foto do perfil)
  const defaultTechStyle = 'bg-zinc-600 text-white border-zinc-600';
  const TECHNICIANS = systemTechnicians.map((t) => ({
    id: t.id,
    name: capitalizeFirst((t.display_name || t.username || '').trim() || t.username),
    style: accentColorToStyle(t.accent_color) || defaultTechStyle,
    photo_url: t.photo_url ?? null,
  }));

  const getTechById = (id: string | null | undefined) => id ? systemTechnicians.find((t) => t.id === id) : undefined;

  const getMechanicIconColor = (mechanicName: string | null, memberId?: string | null) => {
    const tech = memberId ? getTechById(memberId) : undefined;
    if (tech) return accentColorToText(tech.accent_color);
    return 'text-zinc-500';
  };

  const getMechanicButtonStyle = (mechanicName: string, memberId?: string | null) => {
    const tech = memberId ? getTechById(memberId) : undefined;
    if (tech) return accentColorToStyle(tech.accent_color);
    return defaultTechStyle;
  };

  const getCommentAuthorAvatar = (authorName: string, photoUrlFromComment?: string | null): { initial: string; avatarClass: string; useLogo: boolean; photoUrl?: string | null } => {
    const name = (authorName ?? '').trim();
    const initial = name ? name.charAt(0).toUpperCase() : '?';
    const normalized = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normalized.includes('rei do abs')) {
      return { initial: '', avatarClass: '', useLogo: true };
    }
    if (photoUrlFromComment?.trim()) {
      return { initial, avatarClass: 'bg-zinc-600 text-white border-zinc-600', useLogo: false, photoUrl: photoUrlFromComment.trim() };
    }
    const tech = systemTechnicians.find(
      (t) =>
        (t.display_name && normalized.includes(String(t.display_name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) ||
        normalized.includes(String(t.username).toLowerCase())
    );
    if (tech) {
      return {
        initial,
        avatarClass: accentColorToStyle(tech.accent_color),
        useLogo: false,
        photoUrl: tech.photo_url ?? null,
      };
    }
    return { initial, avatarClass: 'bg-zinc-600 text-white border-zinc-600', useLogo: false };
  };

  // Componentes de Estilo para Markdown
  const MarkdownComponents = {
    p: ({children}: any) => <p className="mb-2 last:mb-0 break-words">{children}</p>,
    strong: ({children}: any) => <strong className="font-bold text-white">{children}</strong>,
    em: ({children}: any) => <em className="italic text-zinc-400">{children}</em>,
    ul: ({children}: any) => <ul className="list-disc list-inside ml-2 mb-2 space-y-1">{children}</ul>,
    ol: ({children}: any) => <ol className="list-decimal list-inside ml-2 mb-2 space-y-1">{children}</ol>,
    li: ({children}: any) => <li className="text-zinc-300">{children}</li>,
    a: ({children, href}: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-yellow hover:underline">{children}</a>,
    blockquote: ({children}: any) => <blockquote className="border-l-4 border-zinc-600 pl-4 py-1 italic text-zinc-400 my-2">{children}</blockquote>,
  };

  // --- Attachment Functions ---
  /** Infere mimeType pelo nome do arquivo para exibir PDFs na seção Documentos. */
  const attachmentMimeType = (name: string): string => {
    const n = (name || "").toLowerCase();
    if (n.endsWith(".pdf")) return "application/pdf";
    if (/\.(jpg|jpeg|png|gif|webp)$/.test(n)) return "image/*";
    return "application/octet-stream";
  };

  /** Compartilha imagem via Web Share API (WhatsApp, etc.). Tenta enviar como arquivo; fallback para URL. */
  const handleShareImage = async (e: React.MouseEvent, att: { url: string; name: string }) => {
    e.preventDefault();
    e.stopPropagation();
    if (!navigator.share) {
      window.open(att.url, '_blank');
      return;
    }
    try {
      const res = await fetch(att.url, { mode: 'cors' });
      const blob = await res.blob();
      const ext = (att.name.split('.').pop() || 'jpg').toLowerCase().replace(/jpeg/, 'jpg');
      const file = new File([blob], att.name || `image.${ext}`, { type: blob.type || 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: att.name });
        return;
      }
    } catch (_) {
      // CORS ou canShare não suportado: compartilhar URL
    }
    try {
      await navigator.share({ title: att.name, url: att.url });
    } catch (err: any) {
      if (err?.name !== 'AbortError') window.open(att.url, '_blank');
    }
  };

  const handleGallerySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !selectedCard) return;
    const files = Array.from(e.target.files);
    setIsUploading(true);
    try {
      for (const file of files) {
        await uploadServiceOrderPhoto(selectedCard.id, file, file.name);
      }
      const photos = await getServiceOrderPhotos(selectedCard.id);
      setCardDetails(prev => ({
        actions: prev?.actions ?? [],
        attachments: photos.map((p, i) => ({
          id: p.path || String(i),
          name: p.name,
          url: p.url,
          mimeType: attachmentMimeType(p.name),
          previews: [{ url: p.url, width: 200, height: 200 }],
        })),
      }));
    } catch (err: any) {
      alert(err?.message ?? "Erro ao enviar arquivo(s).");
    } finally {
      setIsUploading(false);
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  /** Mesmo comportamento do botão "Foto do veículo" da recepção: abre câmera (mobile) ou seletor de arquivo. */
  const handleCameraFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !selectedCard) return;
    const files = Array.from(e.target.files);
    setIsUploading(true);
    try {
      for (const file of files) {
        await uploadServiceOrderPhoto(selectedCard.id, file, file.name);
      }
      const photos = await getServiceOrderPhotos(selectedCard.id);
      setCardDetails(prev => ({
        actions: prev?.actions ?? [],
        attachments: photos.map((p, i) => ({
          id: p.path || String(i),
          name: p.name,
          url: p.url,
          mimeType: attachmentMimeType(p.name),
          previews: [{ url: p.url, width: 200, height: 200 }],
        })),
      }));
    } catch (err: any) {
      alert(err?.message ?? "Erro ao enviar foto.");
    } finally {
      setIsUploading(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  // Camera Functions
  const startCamera = () => {
    setIsCameraOpen(true);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  useEffect(() => {
    const initCamera = async () => {
      if (isCameraOpen) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.error("Error accessing camera:", err);
          alert("Erro ao acessar a câmera. Verifique as permissões.");
          setIsCameraOpen(false);
        }
      } else {
        // Cleanup if closed
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      }
    };

    initCamera();

    return () => {
      // Cleanup on unmount or change
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [isCameraOpen]);

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            setPhotoBlob(blob);
            setPhotoPreview(URL.createObjectURL(blob));
            stopCamera();
          }
        }, 'image/jpeg', 0.8);
      }
    }
  };

  const uploadPhoto = async () => {
    if (!selectedCard || !photoBlob) return;
    setIsUploading(true);
    try {
      const fileName = `foto_patio_${new Date().getTime()}.jpg`;
      await uploadServiceOrderPhoto(selectedCard.id, photoBlob, fileName);
      const photos = await getServiceOrderPhotos(selectedCard.id);
      setCardDetails(prev => ({
        actions: prev?.actions ?? [],
        attachments: photos.map((p, i) => ({
          id: p.path || String(i),
          name: p.name,
          url: p.url,
          mimeType: attachmentMimeType(p.name),
          previews: [{ url: p.url, width: 200, height: 200 }],
        })),
      }));
      setPhotoBlob(null);
      setPhotoPreview(null);
    } catch (err: any) {
      alert(err?.message ?? "Erro ao enviar foto.");
    } finally {
      setIsUploading(false);
    }
  };

  const clearPhoto = () => {
    setPhotoBlob(null);
    setPhotoPreview(null);
  };

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] w-full" aria-hidden="true">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 rounded-full border-2 border-brand-yellow/30" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-brand-yellow animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] text-zinc-400 gap-6 px-8 text-center">
        <AlertCircle className="w-16 h-16 text-red-500/80" />
        <p className="text-lg">{error}</p>
        <button 
          onClick={() => fetchData(false)}
          className="px-8 py-3 bg-brand-surfaceHighlight rounded-full text-white font-medium hover:bg-zinc-800 transition-colors"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  // Membros permitidos: apenas técnicos cadastrados na tela inicial
  const allowedMembers = allMembers.filter(m =>
    workshopTechnicians.some(t => t.slug === m.id || m.fullName.toLowerCase().includes(t.name.toLowerCase()))
  );

  return (
    <div className="w-full min-h-full pb-32 animate-in fade-in duration-700 relative">
      {/* Sombra leve em amarelo (como na Recepção) */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-yellow/5 rounded-full blur-[120px] pointer-events-none z-0" />
      
      {/* Header Fixo no Topo da Página */}
      <div className="relative z-10 flex items-center justify-between mb-8 px-2">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="Logo" className="h-20 w-auto object-contain bg-black rounded-xl p-2" />
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-brand-yellow leading-none">
              {isModuleMode ? 'LABORATÓRIO' : 'PÁTIO'}
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              {cards.length} {isModuleMode ? 'Módulos' : 'Veículos'} na oficina
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão de Histórico */}
          <button 
            onClick={() => setIsHistoryOpen(true)}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-light-card dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:border-brand-yellow hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all duration-300"
            title="Consultar Histórico (Arquivados)"
          >
            <History className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => fetchData(false)}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-white dark:bg-brand-surfaceHighlight border border-zinc-200 dark:border-brand-border text-zinc-400 hover:text-brand-yellow hover:border-brand-yellow/50 transition-all duration-300 active:scale-90"
          >
            <RefreshCw className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Grid Unificado de Veículos — perspectiva para efeito 3D no hover */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-1" style={{ perspective: '1400px' }}>
        {cards.map(card => {
          const parts = card.name.split('-').map(s => s.trim());
          const model = parts[0] || card.name;
          const plate = isModuleMode ? '' : (parts[1] || '---');
          const customerName = isModuleMode ? (parts[1] || '') : (parts[2] || '');
          
          const currentList = lists.find(l => l.id === card.idList);
          const listName = currentList ? currentList.name : 'Desconhecido';
          const listNameLower = listName.toLowerCase();
          
          const member = card.members && card.members.length > 0 ? card.members[0] : null;
          const mechanic = member ? member.fullName : null;
          const mechanicColorClass = getMechanicIconColor(mechanic, member?.id);
          const hasMechanic = !!mechanic;
          
          const statusConfig = getStatusConfig(listName, card.idList);

          const canAssignMember = can('canAssignTechnician'); 
          
          // Condição para botão de Checklist de Entrada: Apenas em 'avaliação técnica'
          const showEntryButton = listNameLower.includes('avaliação técnica');
          
          // Condição para botão de Checklist de Finalização: Apenas em 'fase de teste'
          const showFinalizationButton = listNameLower.includes('fase de teste');

          // Condição para botão de ENTREGUE: Apenas em 'finalizado'
          const showDeliverButton = listNameLower.includes('finalizado');

          // Condição para botão de ENTREGUE em 'não aprovado'
          const showNotApprovedDeliverButton = listNameLower.includes('não aprovado');

          // Função helper para calcular progresso
          const getChecklistProgress = (type: 'Entrada' | 'Finalização') => {
             const target = normalizeText(type);
             const cl = card.checklists?.find(c => normalizeText(c.name).includes(target));
             
             const total = cl ? cl.checkItems.length : 0;
             const completed = cl ? cl.checkItems.filter(i => i.state === 'complete').length : 0;
             const progress = total > 0 ? (completed / total) * 100 : 0;
             return { total, completed, progress };
          };

          const entryStats = getChecklistProgress('Entrada');
          const finalizationStats = getChecklistProgress('Finalização');

          const isGarantia = card.garantiaTag === true;
          const isFloating = effectsEnabled && cardFloat?.id === card.id;

          return (
            <div
              key={card.id}
              className="min-h-[180px]"
              style={{ transformStyle: 'preserve-3d' }}
              onMouseMove={(e) => handleCardMouseMove(e, card.id)}
              onMouseLeave={handleCardMouseLeave}
            >
              <div
                onClick={() => setSelectedCard(card)}
                className={`
                  group relative overflow-hidden
                  bg-white/95 dark:bg-[#1C1C1E]/95
                  backdrop-blur-xl
                  border rounded-[1.5rem] p-5
                  shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06),0_8px_24px_-8px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.02)]
                  dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_4px_16px_rgba(0,0,0,0.25),0_12px_32px_-8px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.04)]
                  hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.08),0_16px_48px_-12px_rgba(0,0,0,0.12),0_24px_64px_-16px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.03)]
                  dark:hover:shadow-[0_2px_4px_rgba(0,0,0,0.25),0_12px_32px_rgba(0,0,0,0.3),0_24px_56px_-12px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)]
                  hover:border-zinc-300/80 dark:hover:border-white/[0.12]
                  active:scale-[0.99]
                  flex flex-col justify-between min-h-[180px] cursor-pointer h-full
                  ${isGarantia ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-white dark:ring-offset-[#0a0a0a] border-red-500/30' : 'border border-zinc-200/60 dark:border-white/[0.08]'}
                `}
                style={{
                  transform: isFloating
                    ? `rotateX(${cardFloat.rotateX}deg) rotateY(${cardFloat.rotateY}deg) translateZ(6px)`
                    : 'rotateX(0deg) rotateY(0deg) translateZ(0px)',
                  transition: 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 0.35s ease, border-color 0.3s ease',
                  transformStyle: 'preserve-3d',
                }}
              >
              {/* Overlay de Loading (Geral para Card) */}
              {(isMoving && cardInTransition?.id === card.id) || (isAssigning && cardForMemberAssignment?.id === card.id) || (archivingId === card.id) || (removingGarantiaId === card.id) ? (
                <div className="absolute inset-0 z-30 bg-white/70 dark:bg-black/50 backdrop-blur-md rounded-[1.5rem] flex items-center justify-center overflow-hidden">
                   <RefreshCw className="w-8 h-8 text-brand-yellow animate-spin" />
                </div>
              ) : null}

              {/* Layout Superior */}
              <div className="flex justify-between items-start mb-6">
                
                {/* Info Carro/Cliente */}
                <div className="flex-1 pr-2">
                  <h3 className="text-4xl font-black text-zinc-900 dark:text-white uppercase leading-[0.9] tracking-tighter break-words italic">
                    {model}
                  </h3>
                  {customerName && (
                    <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100/80 dark:bg-white/[0.06] border border-zinc-200/50 dark:border-white/[0.06] w-fit max-w-full">
                      <User className="w-4 h-4 text-brand-yellow shrink-0" strokeWidth={2} />
                      <span className="text-base font-semibold text-zinc-700 dark:text-zinc-200 truncate tracking-tight">
                        {customerName}
                      </span>
                    </div>
                  )}
                  {card.deliveryDate && (
                    <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-100/80 dark:bg-white/[0.06] border border-zinc-200/50 dark:border-white/[0.06] w-fit max-w-full">
                      <Calendar className="w-4 h-4 text-brand-yellow shrink-0" strokeWidth={2} />
                      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                        Entrega: {new Date(card.deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Info Mecânico/Placa */}
                <div className="flex flex-col items-end min-w-[120px] text-right pl-2">
                   <button 
                     type="button"
                     disabled={!canAssignMember}
                     onClick={(e) => { e.stopPropagation(); canAssignMember && setCardForMemberAssignment(card); }}
                     className={`
                        flex items-center justify-end gap-1.5 mb-2 px-3 py-1.5 rounded-2xl border transition-all
                        ${canAssignMember
                          ? 'border-light-border dark:border-white/10 bg-light-card dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200 cursor-pointer hover:bg-zinc-200/90 dark:hover:bg-white/[0.1] active:scale-[0.97]'
                          : 'border-zinc-200/60 dark:border-white/5 bg-light-card/80 dark:bg-white/[0.04] text-zinc-500 cursor-default'}
                     `}
                   >
                      <span className={`text-sm font-bold truncate max-w-[120px] ${!hasMechanic && canAssignMember ? 'text-brand-yellow' : ''}`}>
                        {mechanic ? capitalizeFirst(mechanic) : (canAssignMember ? '+ Técnico' : 'Sem técnico')}
                      </span>
                      {member?.avatarUrl ? (
                         <img 
                            src={member.avatarUrl} 
                            alt={capitalizeFirst(member.fullName)} 
                            className="w-6 h-6 rounded-full object-cover border border-zinc-300/80 dark:border-white/10"
                         />
                      ) : (
                         <Wrench className={`w-6 h-6 shrink-0 ${mechanicColorClass}`} />
                      )}
                   </button>
                   {!isModuleMode && (
                   <div className="w-[120px] bg-white rounded-xl border-2 border-black flex flex-col overflow-hidden shadow-md shadow-black/15 mt-1 select-none">
                      <div className="h-4 bg-[#003399] flex items-center justify-between px-2 relative">
                         <span className="text-[6px] font-bold text-white tracking-wider">BRASIL</span>
                         <BrazilFlagIcon width={12} height={8} className="rounded-sm flex-shrink-0 border border-white/30" />
                      </div>
                      <div className="h-8 flex items-center justify-center bg-white">
                         <span className={`text-black font-mono text-xl font-black tracking-widest leading-none ${blurPlates ? 'blur-plate' : ''}`}>
                            {plate.toUpperCase()}
                         </span>
                      </div>
                   </div>
                   )}
                </div>
              </div>

              {/* Botões de Ação Inferiores — estilo iOS */}
              <div className="relative w-full mt-auto space-y-3">
                
                {/* Botão Checklist Entrada */}
                {showEntryButton && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setActiveChecklistCardId(card.id); setActiveChecklistType('Entrada'); }}
                    className="
                      w-full py-2.5 px-4 rounded-2xl
                      bg-light-card dark:bg-white/[0.06] border border-light-border dark:border-white/[0.08]
                      flex items-center justify-between
                      text-xs uppercase font-bold tracking-widest text-zinc-600 dark:text-zinc-300
                      hover:bg-zinc-200/90 dark:hover:bg-white/[0.1] hover:text-zinc-900 dark:hover:text-white transition-all active:scale-[0.99]
                      group-checklist
                    "
                  >
                    <div className="flex items-center gap-2">
                      <ClipboardList className={`w-4 h-4 ${entryStats.completed === entryStats.total && entryStats.total > 0 ? 'text-green-500' : 'text-brand-yellow'}`} />
                      ENTRADA
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${entryStats.completed === entryStats.total && entryStats.total > 0 ? 'bg-green-500' : 'bg-brand-yellow'}`}
                          style={{ width: `${entryStats.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px]">{Math.round(entryStats.progress)}%</span>
                    </div>
                  </button>
                )}

                 {/* Botão Checklist Finalização */}
                 {showFinalizationButton && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); setActiveChecklistCardId(card.id); setActiveChecklistType('Finalização'); }}
                    className="
                      w-full py-2.5 px-4 rounded-2xl
                      bg-light-card dark:bg-white/[0.06] border border-light-border dark:border-white/[0.08]
                      flex items-center justify-between
                      text-xs uppercase font-bold tracking-widest text-zinc-600 dark:text-zinc-300
                      hover:bg-zinc-200/90 dark:hover:bg-white/[0.1] hover:text-zinc-900 dark:hover:text-white transition-all active:scale-[0.99]
                      group-checklist
                    "
                  >
                    <div className="flex items-center gap-2">
                      <ListChecks className={`w-4 h-4 ${finalizationStats.completed === finalizationStats.total && finalizationStats.total > 0 ? 'text-green-500' : 'text-blue-500'}`} />
                      FINALIZAÇÃO
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${finalizationStats.completed === finalizationStats.total && finalizationStats.total > 0 ? 'bg-green-500' : 'bg-blue-500'}`}
                          style={{ width: `${finalizationStats.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px]">{Math.round(finalizationStats.progress)}%</span>
                    </div>
                  </button>
                )}

                {/* Botão ENTREGUE (Apenas se Finalizado) */}
                {can('canArchiveCard') && showDeliverButton && (
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDeliverVehicle(card.id); }}
                        disabled={archivingId === card.id}
                        className="
                            w-full py-3 px-4 rounded-2xl
                            bg-light-card dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-400
                            border border-zinc-200/60 dark:border-white/[0.08]
                            font-bold uppercase tracking-widest
                            hover:bg-zinc-200/90 dark:hover:bg-white/[0.1] hover:text-zinc-900 dark:hover:text-white
                            transition-all active:scale-[0.99]
                            flex items-center justify-center gap-2
                        "
                    >
                        {archivingId === card.id ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                        ENTREGUE
                    </button>
                )}

                {/* Botão ENTREGUE (Se Não Aprovado) */}
                {can('canArchiveCard') && showNotApprovedDeliverButton && (
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDeliverVehicle(card.id); }}
                        disabled={archivingId === card.id}
                        className="
                            w-full py-3 px-4 rounded-2xl
                            bg-light-card dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-400
                            border border-zinc-200/60 dark:border-white/[0.08]
                            font-bold uppercase tracking-widest
                            hover:bg-zinc-200/90 dark:hover:bg-white/[0.1] hover:text-zinc-900 dark:hover:text-white
                            transition-all active:scale-[0.99]
                            flex items-center justify-center gap-2
                        "
                    >
                        {archivingId === card.id ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                        ENTREGUE
                    </button>
                )}

                {/* Botão de Status (Mudar Etapa) — mesmo tamanho, visual iOS */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleOpenMoveModal(card, e);
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                  }}
                  className={`
                    flex items-center justify-between 
                    w-full px-5 py-3.5 rounded-2xl 
                    cursor-pointer transition-all duration-200 ease-out
                    shadow-[0_2px_12px_-2px_rgba(0,0,0,0.15)]
                    dark:shadow-[0_2px_16px_-2px_rgba(0,0,0,0.35)]
                    border border-black/10 dark:border-white/10
                    ${statusConfig.style}
                    hover:brightness-110 active:scale-[0.98]
                  `}
                >
                  <span className="font-black text-sm uppercase tracking-wide truncate pr-2">
                    {statusConfig.label}
                  </span>
                  <ChevronDown className="w-5 h-5 opacity-70" />
                </button>
              </div>

            </div>
            </div>
          );
        })}
      </div>

      {cards.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-600">
            <PatioCarIcon className="w-16 h-16 mb-4 opacity-20" strokeWidth={2.5} />
            <p>{isModuleMode ? 'Nenhum módulo no laboratório' : 'Nenhum veículo no pátio'}</p>
          </div>
      )}

      {/* --- MODAL DE HISTÓRICO (BUSCA) --- */}
      {isHistoryOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-modal-backdrop">
            <div className="bg-emerald-50/98 dark:bg-emerald-950/30 backdrop-blur-xl border-2 border-emerald-200/80 dark:border-emerald-800/50 w-full max-w-[90rem] w-full h-[90vh] rounded-[1.5rem] shadow-[0_2px_24px_-4px_rgba(0,0,0,0.1),0_12px_40px_-8px_rgba(6,95,70,0.2)] flex flex-col overflow-hidden animate-modal-sheet relative">
               
               <div className="p-6 border-b border-emerald-200/80 dark:border-emerald-800/50 flex items-center justify-between bg-emerald-100/60 dark:bg-emerald-900/30">
                  <div className="flex items-center gap-3">
                     <div className="bg-emerald-500/20 p-2 rounded-xl">
                        <History className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
                     </div>
                     <div>
                        <h2 className="text-xl font-bold text-emerald-900 dark:text-emerald-100">Histórico de Veículos</h2>
                        <p className="text-emerald-600 dark:text-emerald-400 text-xs mt-0.5">Buscar veículos arquivados</p>
                     </div>
                  </div>
                  <button onClick={() => setIsHistoryOpen(false)} className="w-10 h-10 rounded-full bg-emerald-200/80 dark:bg-emerald-800/50 flex items-center justify-center text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-white hover:bg-emerald-300 dark:hover:bg-emerald-700 transition-colors">
                     <X className="w-5 h-5" />
                  </button>
               </div>

               <div className="p-6 bg-emerald-100/40 dark:bg-emerald-900/20 border-b border-emerald-200/80 dark:border-emerald-800/50">
                  <div className="flex gap-3">
                     <div className="flex-1 relative">
                        <input 
                           type="text" 
                           placeholder="Digite placa, nome, cpf, telefone ou cep..." 
                           value={historySearchPlate}
                           onChange={(e) => setHistorySearchPlate(e.target.value)}
                           onKeyDown={(e) => e.key === 'Enter' && handleSearchHistory()}
                           className="w-full bg-white dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 rounded-xl py-3 pl-10 pr-4 text-emerald-900 dark:text-emerald-100 placeholder:text-emerald-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-colors"
                        />
                        <Search className="w-4 h-4 text-emerald-500 absolute left-3 top-1/2 -translate-y-1/2" />
                     </div>
                     <button 
                        onClick={() => handleSearchHistory()}
                        disabled={isLoadingHistory}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 rounded-xl font-bold transition-colors disabled:opacity-50"
                     >
                        {isLoadingHistory ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Buscar'}
                     </button>
                  </div>
               </div>

               <div className="flex-1 overflow-y-auto p-6 bg-emerald-50/80 dark:bg-emerald-950/20 custom-scrollbar">
                  {isLoadingHistory ? (
                     <div className="flex flex-col items-center justify-center h-full text-emerald-600 dark:text-emerald-400 gap-4">
                        <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
                        <p>Buscando no arquivo morto...</p>
                     </div>
                  ) : archivedCards.length > 0 ? (
                     <div>
                        {historyShowingFallback && (
                           <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                              Nenhum resultado para a busca. Exibindo últimos veículos arquivados:
                           </p>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {archivedCards.map(card => {
                           const parts = card.name.split('-');
                           const model = parts[0]?.trim() || card.name;
                           const plate = parts[1]?.trim() || '---';
                           const customerName = parts[2]?.trim() || '';

                           return (
                              <div 
                                 key={card.id}
                                 onClick={() => handleOpenHistoryCardDetails(card)}
                                 className="group bg-white dark:bg-emerald-900/40 border-2 border-emerald-200/80 dark:border-emerald-700/50 rounded-2xl p-5 hover:border-emerald-400 dark:hover:border-emerald-500 transition-all cursor-pointer shadow-sm hover:shadow-md flex flex-col justify-between min-h-[140px]"
                              >
                                 <div className="flex justify-between items-start mb-4">
                                    <div>
                                       <h3 className="text-2xl font-black text-emerald-900 dark:text-emerald-100 uppercase italic tracking-tighter truncate max-w-[200px]">{model}</h3>
                                       <div className="flex items-center gap-2 mt-1">
                                          <User className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                          <p className="text-emerald-700 dark:text-emerald-300 text-sm font-bold truncate max-w-[150px]">{customerName}</p>
                                       </div>
                                    </div>
                                    <div className="bg-emerald-100 dark:bg-emerald-800/80 text-emerald-900 dark:text-emerald-100 font-mono font-black text-sm px-2 py-1 rounded border-2 border-emerald-700 dark:border-emerald-500">
                                       <span className={blurPlates ? 'blur-plate' : ''}>{plate.toUpperCase()}</span>
                                    </div>
                                 </div>
                                 
                                 <div className="flex items-end justify-between mt-2 pt-3 border-t border-emerald-200/80 dark:border-emerald-700/50">
                                    <div className="flex flex-col">
                                         <span className="text-[10px] uppercase text-emerald-600 dark:text-emerald-400 font-bold tracking-wider">Arquivado em</span>
                                         <span className="text-xl text-emerald-700 dark:text-emerald-300 font-black tracking-tight leading-none">
                                            {card.dateLastActivity ? new Date(card.dateLastActivity).toLocaleDateString('pt-BR') : 'N/A'}
                                         </span>
                                    </div>

                                    <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-900 dark:group-hover:text-white transition-colors">
                                       Ver Detalhes <ArrowRight className="w-3 h-3" />
                                    </span>
                                 </div>
                              </div>
                           );
                        })}
                        </div>
                     </div>
                  ) : (
                     <div className="flex flex-col items-center justify-center h-full text-emerald-600 dark:text-emerald-400">
                        <History className="w-16 h-16 mb-4 opacity-20" />
                        <p>Nenhum registro encontrado.</p>
                     </div>
                  )}
               </div>

            </div>
         </div>
      )}

      {/* --- DETALHES DO CARD ARQUIVADO (MODAL NO PÁTIO) --- */}
      {selectedHistoryCard && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-modal-backdrop">
            <div className="bg-emerald-50/98 dark:bg-emerald-950/30 backdrop-blur-xl border-2 border-emerald-200/80 dark:border-emerald-800/50 w-full max-w-[90rem] h-[90vh] rounded-[1.5rem] shadow-[0_2px_24px_-4px_rgba(0,0,0,0.1),0_12px_40px_-8px_rgba(6,95,70,0.2)] flex flex-col overflow-hidden animate-modal-sheet relative">
               
               <div className="absolute top-6 right-6 z-10 flex gap-3">
                  <button 
                     onClick={() => handleUnarchive(selectedHistoryCard)}
                     className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-full font-bold shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                  >
                     <ArchiveRestore className="w-4 h-4" />
                     DESARQUIVAR
                  </button>
                  <button 
                     onClick={() => handleUseRegistration(selectedHistoryCard)}
                     className="bg-emerald-500 hover:bg-emerald-400 text-white px-6 py-2.5 rounded-full font-bold shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                  >
                     <Copy className="w-4 h-4" />
                     USAR CADASTRO
                  </button>
                  <button 
                     onClick={() => setSelectedHistoryCard(null)}
                     className="w-10 h-10 rounded-full bg-emerald-200/80 dark:bg-emerald-800/80 backdrop-blur-md flex items-center justify-center text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-white hover:bg-emerald-300 dark:hover:bg-emerald-700 transition-all active:scale-95"
                  >
                     <X className="w-6 h-6" />
                  </button>
               </div>

               <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <div className="p-8 md:p-12 pb-24">
                     <div className="flex flex-col gap-3 mb-6">
                        <span className="inline-flex self-start items-center gap-2 px-4 py-2 rounded-full text-sm font-black uppercase tracking-widest shadow-xl border-2 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700">
                            ARQUIVADO
                        </span>
                        <h1 className="text-5xl md:text-7xl font-black text-emerald-900 dark:text-emerald-100 tracking-tighter uppercase italic leading-none">
                          {selectedHistoryCard.name.split('-')[0]}
                        </h1>
                     </div>

                     <div className="flex flex-wrap items-center gap-4 text-emerald-700 dark:text-emerald-300">
                         <div className="flex items-center">
                            {/* PLACA MERCOSUL */}
                            <div className="w-[140px] bg-white rounded-lg border-2 border-black flex flex-col overflow-hidden shadow-xl shadow-black/20 select-none">
                               <div className="h-5 bg-[#003399] flex items-center justify-between px-3 relative">
                                  <span className="text-[8px] font-bold text-white tracking-wider">BRASIL</span>
                                  <BrazilFlagIcon width={16} height={11} className="rounded-sm flex-shrink-0 border border-white/30" />
                               </div>
                               <div className="h-10 flex items-center justify-center bg-white">
                                  <span className="text-black font-mono text-2xl font-black tracking-widest leading-none">
                                     {(selectedHistoryCard.name.split('-')[1]?.trim() || '---').toUpperCase()}
                                  </span>
                               </div>
                            </div>
                         </div>
                         <div className="flex items-center gap-2 px-4 py-2">
                            <User className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-lg font-medium text-emerald-900 dark:text-emerald-100">{selectedHistoryCard.name.split('-')[2]?.trim()}</span>
                         </div>
                         {selectedHistoryCard.due && (
                           <div className="flex items-center gap-2 bg-emerald-100/80 dark:bg-emerald-900/40 px-4 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700/50">
                              <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                              <span className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
                                Entrega: {new Date(selectedHistoryCard.due).toLocaleDateString('pt-BR')}
                              </span>
                           </div>
                         )}
                      </div>
                  </div>

                  <div className="w-full h-px bg-emerald-200 dark:bg-emerald-800/50 mx-auto max-w-[90%]"></div>

                  <div className="p-8 md:p-12 pt-8 grid grid-cols-1 lg:grid-cols-3 gap-10">
                      
                      <div className="lg:col-span-2 space-y-10">
                        <div>
                           <h3 className="text-emerald-700 dark:text-emerald-400 text-sm font-bold uppercase tracking-widest flex items-center gap-2 mb-4">
                              <FileText className="w-4 h-4" />
                              Queixa do cliente (Registro Antigo)
                           </h3>
                           <div className="bg-white dark:bg-emerald-900/30 rounded-2xl p-6 border border-emerald-200/80 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 leading-relaxed font-light text-lg">
                              <ReactMarkdown components={MarkdownComponents}>
                                 {selectedHistoryCard.desc || "Nenhuma descrição disponível."}
                              </ReactMarkdown>
                           </div>
                        </div>

                        <div>
                           <h3 className="text-emerald-700 dark:text-emerald-400 text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                             <MessageSquare className="w-4 h-4" />
                             Histórico de Atividades
                          </h3>
                          <div className="bg-white dark:bg-emerald-900/30 rounded-2xl border border-emerald-200/80 dark:border-emerald-800 overflow-hidden">
                             <div className="p-6 space-y-6 max-h-[500px] overflow-y-auto custom-scrollbar bg-emerald-50/50 dark:bg-emerald-950/30">
                                {loadingHistoryDetails ? (
                                   <div className="flex justify-center py-8">
                                      <RefreshCw className="w-6 h-6 text-emerald-600 dark:text-emerald-400 animate-spin" />
                                   </div>
                                ) : historyCardDetails?.actions && historyCardDetails.actions.length > 0 ? (
                                   historyCardDetails.actions.map(action => {
                                      const avatar = getCommentAuthorAvatar(action.memberCreator.fullName, action.memberCreator.avatarUrl);
                                      return (
                                      <div key={action.id} className="flex gap-4">
                                         <div className={`flex-shrink-0 w-10 h-10 rounded-full overflow-hidden shrink-0 ${avatar.useLogo ? 'bg-emerald-500' : avatar.photoUrl ? '' : ''}`}>
                                            {avatar.useLogo ? (
                                               <img src="/logo.png" alt="Rei do ABS" className="w-full h-full object-cover" />
                                            ) : avatar.photoUrl ? (
                                               <img src={avatar.photoUrl} alt={action.memberCreator.fullName} className="w-full h-full object-cover" />
                                            ) : (
                                               <div className={`w-full h-full rounded-full flex items-center justify-center text-sm font-bold ${avatar.avatarClass}`}>
                                                  {avatar.initial}
                                               </div>
                                            )}
                                         </div>
                                         <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between">
                                               <span className="font-bold text-emerald-900 dark:text-emerald-100 text-sm">{action.memberCreator.fullName}</span>
                                               <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                                  {new Date(action.date).toLocaleString('pt-BR')}
                                                  {action.data.edited_at && (
                                                    <span className="ml-1.5 text-emerald-500/80 italic">editada</span>
                                                  )}
                                               </span>
                                            </div>
                                            <div className="bg-emerald-100/80 dark:bg-emerald-800/50 p-3 rounded-r-xl rounded-bl-xl text-emerald-800 dark:text-emerald-200 text-sm leading-relaxed border border-emerald-200 dark:border-emerald-700/50">
                                                <ReactMarkdown components={MarkdownComponents}>
                                                   {action.data.text}
                                                </ReactMarkdown>
                                            </div>
                                         </div>
                                      </div>
                                   ); })
                                ) : (
                                   <div className="text-center py-8 text-emerald-600 dark:text-emerald-400 italic">
                                      Nenhum comentário registrado no histórico.
                                   </div>
                                )}
                             </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-8">
                         <div>
                            <h3 className="text-emerald-700 dark:text-emerald-400 text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                               <Paperclip className="w-4 h-4" />
                               Anexos Antigos
                            </h3>
                            <div className="space-y-3">
                               {loadingHistoryDetails ? (
                                  <div className="flex justify-center p-4">
                                     <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin" />
                                  </div>
                               ) : historyCardDetails?.attachments && historyCardDetails.attachments.length > 0 ? (
                                  <div className="grid grid-cols-2 gap-2">
                                     {historyCardDetails.attachments.map(att => {
                                       const isImage = att.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.url);
                                       const isPdf = att.mimeType === 'application/pdf' || att.url.toLowerCase().endsWith('.pdf');
                                       
                                       return (
                                        <a 
                                          key={att.id} 
                                          href={att.url} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="block bg-white dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-700 rounded-lg overflow-hidden group hover:border-emerald-400 dark:hover:border-emerald-500 transition-all cursor-pointer"
                                        >
                                           <div className="h-24 bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center relative overflow-hidden">
                                              {att.previews && att.previews.length > 0 ? (
                                                 <img 
                                                   src={att.previews[att.previews.length > 2 ? 2 : 0].url}
                                                   alt={att.name} 
                                                   className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                                                 />
                                              ) : (
                                                 <FileText className="w-8 h-8 text-emerald-500 dark:text-emerald-600" />
                                              )}
                                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                 <ExternalLink className="w-5 h-5 text-white" />
                                              </div>
                                           </div>
                                           <div className="p-2 bg-emerald-50 dark:bg-emerald-900/50">
                                              <p className="text-xs text-emerald-800 dark:text-emerald-200 font-medium truncate">{att.name}</p>
                                           </div>
                                        </a>
                                     )})}
                                  </div>
                               ) : (
                                  <div className="text-center py-6 border border-dashed border-emerald-300 dark:border-emerald-700 rounded-xl">
                                     <p className="text-emerald-600 dark:text-emerald-400 text-sm">Nenhum anexo encontrado.</p>
                                  </div>
                               )}
                            </div>
                         </div>
                      </div>

                  </div>
               </div>

            </div>
         </div>
      )}

      {/* MODAL DETALHE DO VEÍCULO */}
      {selectedCard && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-modal-backdrop">
           <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-zinc-200/60 dark:border-white/[0.08] w-full max-w-4xl h-[90vh] rounded-[1.5rem] shadow-[0_2px_24px_-4px_rgba(0,0,0,0.1),0_12px_40px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_32px_-4px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-modal-sheet relative">
              
              <div className="absolute top-6 right-6 z-10 flex items-center gap-2">
                {can('canDeleteCards') && (
                <button
                  type="button"
                  onClick={() => { setDeleteVehicleError(null); setDeleteVehiclePassword(''); setIsDeleteVehicleOpen(true); }}
                  className="w-10 h-10 rounded-full bg-light-card dark:bg-zinc-800/80 backdrop-blur-md flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-red-600 hover:bg-red-500/10 dark:hover:bg-red-500/10 transition-all active:scale-95"
                  title="Excluir veículo do sistema"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                )}
                <button 
                  onClick={() => setSelectedCard(null)}
                  className="w-10 h-10 rounded-full bg-light-card dark:bg-zinc-800/80 backdrop-blur-md flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all active:scale-95"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {can('canDeleteCards') && isDeleteVehicleOpen && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 rounded-[1.5rem] p-4">
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 p-6 rounded-2xl shadow-xl max-w-sm w-full">
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2 mb-2">
                      <Trash2 className="w-5 h-5 text-red-500" />
                      Excluir veículo do sistema
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                      Este veículo será arquivado (OS cancelada). Digite a senha configurada em &quot;Alterar senhas&quot; para confirmar.
                    </p>
                    <input
                      type="password"
                      value={deleteVehiclePassword}
                      onChange={(e) => setDeleteVehiclePassword(e.target.value)}
                      placeholder="Senha"
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-500/40 mb-3"
                      autoFocus
                    />
                    {deleteVehicleError && (
                      <p className="text-sm text-red-600 dark:text-red-400 mb-3">{deleteVehicleError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setIsDeleteVehicleOpen(false); setDeleteVehiclePassword(''); setDeleteVehicleError(null); }}
                        className="flex-1 py-2.5 rounded-xl border border-zinc-300 dark:border-white/20 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDeleteVehicle}
                        disabled={deleteVehicleSaving || !deleteVehiclePassword.trim()}
                        className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2"
                      >
                        {deleteVehicleSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <div className="p-8 md:p-12 pb-24">
                     <div className="flex flex-col gap-3 mb-6">
                        <div className="flex flex-wrap items-center gap-2">
                          {(serviceOrderDetail?.os_number ?? selectedCard.osNumber) != null && (
                            <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider bg-zinc-200/80 dark:bg-zinc-700/80 text-zinc-600 dark:text-zinc-300 border border-zinc-300/60 dark:border-zinc-600/60">
                              OS #{(serviceOrderDetail?.os_number ?? selectedCard.osNumber)}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-black uppercase tracking-widest shadow-xl border-2 ${getStatusConfig(lists.find(l => l.id === selectedCard.idList)?.name || '', selectedCard.idList).style}`}>
                            {lists.find(l => l.id === selectedCard.idList)?.name}
                          </span>
                          {selectedCard.garantiaTag && (
                            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wide bg-red-500/15 dark:bg-red-500/20 text-red-600 dark:text-red-400 border-2 border-red-500/50">
                              Garantia
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleRemoveGarantia(); }}
                                disabled={removingGarantiaId === selectedCard.id}
                                className="w-6 h-6 rounded-full flex items-center justify-center bg-red-500/30 hover:bg-red-500/50 text-red-700 dark:text-red-300 transition-colors disabled:opacity-50"
                                title="Remover etiqueta Garantia"
                              >
                                {removingGarantiaId === selectedCard.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                              </button>
                            </span>
                          )}
                        </div>
                        <h1 className="text-5xl md:text-7xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase italic leading-none">
                          {selectedCard.name.split('-')[0]}
                        </h1>
                        {/* Técnico + Data de entrega — duas colunas no mesmo bloco */}
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {can('canAssignTechnician') && (
                          <button
                            type="button"
                            onClick={() => setCardForMemberAssignment(selectedCard)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-light-card dark:bg-white/[0.06] border border-light-border dark:border-white/10 shadow-sm active:scale-[0.99] transition-all duration-200 text-left hover:bg-zinc-200/80 dark:hover:bg-white/[0.09]"
                          >
                            {selectedCard.members && selectedCard.members.length > 0 ? (
                              <>
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm ${getMechanicButtonStyle(selectedCard.members[0].fullName, selectedCard.members[0].id)}`}>
                                  <Wrench className="w-4 h-4 opacity-95" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                    Técnico responsável
                                  </p>
                                  <p className="text-sm font-bold text-zinc-900 dark:text-white truncate mt-0.5">
                                    {capitalizeFirst(selectedCard.members[0].fullName)}
                                  </p>
                                </div>
                                <ChevronRight className="w-4 h-4 shrink-0 text-brand-yellow" />
                              </>
                            ) : (
                              <>
                                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-brand-yellow/20 border-2 border-dashed border-brand-yellow/50">
                                  <Wrench className="w-4 h-4 text-brand-yellow" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                    Técnico responsável
                                  </p>
                                  <p className="text-sm font-semibold text-brand-yellow mt-0.5">
                                    Toque para atribuir
                                  </p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
                              </>
                            )}
                          </button>
                          )}
                          {can('canEditDeliveryDate') && (
                          <div className="flex items-center gap-2 flex-wrap px-3 py-2.5 rounded-xl bg-light-card dark:bg-white/[0.06] border border-light-border dark:border-white/10">
                            <Calendar className="w-5 h-5 text-brand-yellow shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                Data de entrega
                              </p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <input
                                  type="date"
                                  value={deliveryDateEditValue}
                                  onChange={(e) => setDeliveryDateEditValue(e.target.value)}
                                  className="px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 min-w-[120px]"
                                />
                                <button
                                  type="button"
                                  onClick={handleSaveDeliveryDate}
                                  disabled={savingDeliveryDate || deliveryDateEditValue === lastSavedDeliveryDate}
                                  className={`px-2.5 py-1.5 rounded-lg text-white text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50 ${
                                    deliveryDateEditValue !== lastSavedDeliveryDate
                                      ? 'bg-amber-500 hover:bg-amber-600'
                                      : 'bg-zinc-600 dark:bg-zinc-700'
                                  }`}
                                >
                                  {savingDeliveryDate ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                  Salvar
                                </button>
                                {deliveryDateSavedMessage && (
                                  <span className="text-xs font-medium text-green-600 dark:text-green-400">Salvo!</span>
                                )}
                              </div>
                            </div>
                          </div>
                          )}
                        </div>
                     </div>

                     <div className="flex flex-wrap items-center gap-6 text-zinc-400">
                         {!isModuleMode && (
                         <div className="flex items-center">
                            <div className="w-[140px] bg-white rounded-lg border-2 border-black flex flex-col overflow-hidden shadow-xl shadow-black/20 select-none">
                               <div className="h-5 bg-[#003399] flex items-center justify-between px-3 relative">
                                  <span className="text-[8px] font-bold text-white tracking-wider">BRASIL</span>
                                  <BrazilFlagIcon width={16} height={11} className="rounded-sm flex-shrink-0 border border-white/30" />
                               </div>
                               <div className="h-10 flex items-center justify-center bg-white">
                                  <span className={`text-black font-mono text-2xl font-black tracking-widest leading-none ${blurPlates ? 'blur-plate' : ''}`}>
                                     {(selectedCard.name.split('-')[1]?.trim() || '---').toUpperCase()}
                                  </span>
                               </div>
                            </div>
                         </div>
                         )}
                         <div className="flex items-center gap-2 px-4 py-2">
                            <User className="w-5 h-5 text-brand-yellow" />
                            <span className="text-lg font-medium text-zinc-700 dark:text-white">
                              {selectedCard.name.split('-').map((s) => s.trim())[2] ?? '—'}
                            </span>
                         </div>
                         {!isModuleMode && can('canEditMileage') && (
                         <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-yellow">Km</span>
                            <input
                              type="text"
                              value={mileageEditValue}
                              onChange={(e) => setMileageEditValue(e.target.value)}
                              placeholder="Ex: 45000"
                              className="w-28 px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                            />
                            <button
                              type="button"
                              onClick={handleSaveMileage}
                              disabled={savingMileage || mileageEditValue.trim() === lastSavedMileage}
                              className={`px-3 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                                mileageEditValue.trim() !== lastSavedMileage
                                  ? 'bg-amber-500 hover:bg-amber-600'
                                  : 'bg-zinc-600 dark:bg-zinc-700'
                              }`}
                            >
                              {savingMileage ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              Salvar
                            </button>
                            {mileageSavedMessage && (
                              <span className="text-sm font-medium text-green-600 dark:text-green-400 animate-in fade-in">
                                Salvo!
                              </span>
                            )}
                         </div>
                         )}
                     </div>
                  </div>

                  <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800/50 mx-auto max-w-[90%]"></div>

                  {/* Dados da ficha — agrupados antes da queixa (minimizado por padrão) */}
                  {serviceOrderDetail && (
                    <div ref={customerDataSectionRef} className="p-8 md:p-12 pt-8">
                      <div className="bg-gradient-to-br from-light-elevated to-white dark:from-zinc-900/80 dark:to-[#1C1C1E] rounded-2xl border border-light-border dark:border-zinc-800 overflow-hidden shadow-sm">
                        <button
                          type="button"
                          onClick={() => setIsDadosFichaExpanded((v) => !v)}
                          className="flex w-full items-center justify-between px-6 py-4 border-b border-light-border dark:border-zinc-800 bg-brand-yellow/5 dark:bg-brand-yellow/10 hover:bg-brand-yellow/10 dark:hover:bg-brand-yellow/15 transition-colors text-left"
                        >
                          <h3 className="text-brand-yellow text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                            {isDadosFichaExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            <User className="w-4 h-4" />
                            Dados da ficha
                          </h3>
                          {can('canEditFicha') && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openEditFichaModal(); setIsDadosFichaExpanded(true); }}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-yellow/20 dark:bg-brand-yellow/20 text-brand-yellow hover:bg-brand-yellow/30 dark:hover:bg-brand-yellow/30 font-bold text-xs uppercase tracking-wider transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Editar em janela
                          </button>
                          )}
                        </button>
                        {isDadosFichaExpanded && (
                        <div className="p-6 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {can('canEditFicha') ? (
                              <>
                                {serviceOrderDetail.customers && (
                                  <>
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20">
                                      <User className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                      <div className="min-w-0 flex-1">
                                        <label className="block text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider mb-1">Nome</label>
                                        <input value={editFichaForm.name} onChange={(e) => setEditFichaForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="Nome do cliente" />
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20">
                                      <Smartphone className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                      <div className="min-w-0 flex-1">
                                        <label className="block text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider mb-1">Telefone</label>
                                        <input value={editFichaForm.phone} onChange={(e) => setEditFichaForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="(11) 99999-9999" />
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20">
                                      <Mail className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                      <div className="min-w-0 flex-1">
                                        <label className="block text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider mb-1">E-mail</label>
                                        <input type="email" value={editFichaForm.email} onChange={(e) => setEditFichaForm(f => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="email@exemplo.com" />
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20">
                                      <FileText className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                      <div className="min-w-0 flex-1">
                                        <label className="block text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider mb-1">CPF</label>
                                        <input value={editFichaForm.cpf} onChange={(e) => setEditFichaForm(f => ({ ...f, cpf: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="000.000.000-00" />
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20 sm:col-span-2">
                                      <MapPin className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                      <div className="min-w-0 flex-1 space-y-2">
                                        <label className="block text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">Endereço</label>
                                        <input value={editFichaForm.address} onChange={(e) => setEditFichaForm(f => ({ ...f, address: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="Rua, bairro..." />
                                        <div className="grid grid-cols-2 gap-2">
                                          <input value={editFichaForm.addressNumber} onChange={(e) => setEditFichaForm(f => ({ ...f, addressNumber: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="Nº" />
                                          <input value={editFichaForm.cep} onChange={(e) => setEditFichaForm(f => ({ ...f, cep: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="CEP" />
                                        </div>
                                      </div>
                                    </div>
                                  </>
                                )}
                                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20">
                                  <FileText className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                  <div className="min-w-0 flex-1">
                                    <label className="block text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider mb-1">{isModuleMode ? 'Veículo' : 'Modelo do veículo'}</label>
                                    <input value={editFichaForm.vehicleModel} onChange={(e) => setEditFichaForm(f => ({ ...f, vehicleModel: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder={isModuleMode ? 'Ex: BMW 320i' : 'Ex: Gol 1.0'} />
                                  </div>
                                </div>
                                {isModuleMode && (
                                  <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20">
                                    <FileText className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                    <div className="min-w-0 flex-1">
                                      <label className="block text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider mb-1">Identificação do módulo</label>
                                      <input value={editFichaForm.moduleIdentification} onChange={(e) => setEditFichaForm(f => ({ ...f, moduleIdentification: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="Ex: Módulo ABS XYZ" />
                                    </div>
                                  </div>
                                )}
                                {!isModuleMode && (
                                  <>
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20">
                                      <FileText className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                      <div className="min-w-0 flex-1">
                                        <label className="block text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider mb-1">Placa</label>
                                        <input value={editFichaForm.plate} onChange={(e) => setEditFichaForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))} maxLength={8} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="ABC1D23" />
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20">
                                      <Hash className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                      <div className="min-w-0 flex-1">
                                        <label className="block text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider mb-1">Km</label>
                                        <input value={editFichaForm.mileageKm} onChange={(e) => setEditFichaForm(f => ({ ...f, mileageKm: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="45000" />
                                      </div>
                                    </div>
                                  </>
                                )}
                              </>
                            ) : (
                              <>
                                {serviceOrderDetail.customers && (
                                  <>
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20">
                                      <User className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                      <div>
                                        <p className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">Nome</p>
                                        <p className="text-zinc-900 dark:text-white font-medium">{serviceOrderDetail.customers.name || '—'}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20">
                                      <Smartphone className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                      <div>
                                        <p className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">Telefone</p>
                                        <p className="text-zinc-900 dark:text-white font-medium">{serviceOrderDetail.customers.phone || '—'}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20">
                                      <Mail className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                      <div>
                                        <p className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">E-mail</p>
                                        <p className="text-zinc-900 dark:text-white font-medium truncate">{serviceOrderDetail.customers.email || '—'}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20">
                                      <FileText className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                      <div>
                                        <p className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">CPF</p>
                                        <p className="text-zinc-900 dark:text-white font-medium">{serviceOrderDetail.customers.cpf || '—'}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20 sm:col-span-2">
                                      <MapPin className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                      <div className="min-w-0">
                                        <p className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">Endereço</p>
                                        <p className="text-zinc-900 dark:text-white font-medium">
                                          {[serviceOrderDetail.customers.address, serviceOrderDetail.customers.address_number, serviceOrderDetail.customers.cep].filter(Boolean).join(' · ') || '—'}
                                        </p>
                                      </div>
                                    </div>
                                  </>
                                )}
                                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20">
                                  <FileText className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">Veículo</p>
                                    <p className="text-zinc-900 dark:text-white font-medium">{serviceOrderDetail.vehicle_model || '—'}</p>
                                  </div>
                                </div>
                                {isModuleMode && (
                                  <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20">
                                    <FileText className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                    <div>
                                      <p className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">Identificação do módulo</p>
                                      <p className="text-zinc-900 dark:text-white font-medium">{serviceOrderDetail.module_identification || '—'}</p>
                                    </div>
                                  </div>
                                )}
                                {!isModuleMode && (
                                  <>
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20">
                                      <FileText className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                      <div>
                                        <p className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">Placa</p>
                                        <p className="text-zinc-900 dark:text-white font-mono font-bold uppercase">{(serviceOrderDetail.plate || '—').toUpperCase()}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 dark:bg-black/20">
                                      <Hash className="w-4 h-4 text-brand-yellow shrink-0 mt-0.5" />
                                      <div>
                                        <p className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">Km</p>
                                        <p className="text-zinc-900 dark:text-white font-medium">{serviceOrderDetail.mileage_km || '—'}</p>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                          {can('canEditFicha') && (
                            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-light-border dark:border-zinc-800">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!serviceOrderDetail) return;
                                  const c = serviceOrderDetail.customers;
                                  setEditFichaForm({
                                    name: c?.name ?? '', cpf: c?.cpf ?? '', phone: c?.phone ?? '', email: c?.email ?? '',
                                    cep: c?.cep ?? '', address: c?.address ?? '', addressNumber: c?.address_number ?? '',
                                    vehicleModel: serviceOrderDetail.vehicle_model ?? '', moduleIdentification: serviceOrderDetail.module_identification ?? '',
                                    plate: (serviceOrderDetail.plate ?? '').toUpperCase(), mileageKm: serviceOrderDetail.mileage_km ?? '',
                                  });
                                }}
                                className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveEditFicha}
                                disabled={editFichaSaving}
                                className="px-5 py-2 rounded-xl bg-brand-yellow text-black text-sm font-bold hover:bg-[#fcd61e] transition-colors flex items-center gap-2 disabled:opacity-50"
                              >
                                {editFichaSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Salvar alterações
                              </button>
                            </div>
                          )}
                        </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="p-8 md:p-12 pt-8 grid grid-cols-1 lg:grid-cols-3 gap-10">
                      
                      <div className="lg:col-span-2 space-y-10">
                        <div ref={descriptionSectionRef}>
                          <div className="flex items-center justify-between mb-4">
                             <h3 className="text-brand-yellow text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                Queixa do cliente
                             </h3>
                             {can('canEditQueixa') && !isEditingDesc && (
                               <button 
                                 onClick={() => { setIsEditingDesc(true); setDescText(selectedCard.desc || ''); }}
                                 className="text-xs font-bold text-brand-yellow hover:text-zinc-900 dark:hover:text-white transition-colors flex items-center gap-1"
                               >
                                 <Pencil className="w-3 h-3" /> Editar
                               </button>
                             )}
                          </div>
                          
                          {isEditingDesc ? (
                             <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl p-4 border border-brand-yellow/50 animate-in fade-in duration-200">
                                <textarea 
                                  value={descText}
                                  onChange={(e) => setDescText(e.target.value)}
                                  className="w-full bg-light-elevated dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-300 text-lg font-light focus:outline-none resize-none min-h-[200px] p-2 rounded-lg"
                                  placeholder="Digite a queixa do cliente..."
                                />
                                <div className="flex justify-end gap-3 mt-4">
                                   <button 
                                     onClick={() => setIsEditingDesc(false)}
                                     disabled={isSavingDesc}
                                     className="px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white font-bold transition-colors"
                                   >
                                     Cancelar
                                   </button>
                                   <button 
                                     onClick={handleSaveDescription}
                                     disabled={isSavingDesc}
                                     className="px-6 py-2 bg-brand-yellow text-black rounded-lg text-sm font-bold hover:bg-[#fcd61e] transition-colors flex items-center gap-2"
                                   >
                                     {isSavingDesc ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4" />}
                                     Salvar Alterações
                                   </button>
                                </div>
                             </div>
                          ) : (
                            <div className="bg-light-elevated dark:bg-[#1C1C1E] rounded-2xl p-6 border border-light-border dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 leading-relaxed font-light text-lg">
                               <ReactMarkdown components={MarkdownComponents}>
                                 {selectedCard.desc || "Nenhuma descrição disponível para este veículo."}
                               </ReactMarkdown>
                            </div>
                          )}
                        </div>
                        
                        <div ref={commentsSectionRef}>
                           <h3 className="text-brand-yellow text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                             <MessageSquare className="w-4 h-4" />
                             Comentários
                          </h3>

                          <div className="bg-light-elevated dark:bg-[#1C1C1E] rounded-2xl border border-light-border dark:border-zinc-800 overflow-hidden">
                             <div ref={commentsListRef} className="p-6 space-y-6 max-h-[400px] overflow-y-auto custom-scrollbar bg-white dark:bg-[#121212]">
                                {loadingDetails ? (
                                   <div className="flex justify-center py-8">
                                      <RefreshCw className="w-6 h-6 text-brand-yellow animate-spin" />
                                   </div>
                                ) : cardDetails?.actions && cardDetails.actions.length > 0 ? (
                                   cardDetails.actions.map(action => {
                                      const avatar = getCommentAuthorAvatar(action.memberCreator.fullName, action.memberCreator.avatarUrl);
                                      return (
                                      <div key={action.id} className="flex gap-4 group/comment">
                                         <div className={`flex-shrink-0 w-10 h-10 rounded-full overflow-hidden shrink-0 ${avatar.useLogo ? 'bg-brand-yellow' : ''}`}>
                                            {avatar.useLogo ? (
                                               <img src="/logo.png" alt="Rei do ABS" className="w-full h-full object-cover" />
                                            ) : avatar.photoUrl ? (
                                               <img src={avatar.photoUrl} alt={action.memberCreator.fullName} className="w-full h-full object-cover" />
                                            ) : (
                                               <div className={`w-full h-full rounded-full flex items-center justify-center text-sm font-bold ${avatar.avatarClass}`}>
                                                  {avatar.initial}
                                               </div>
                                            )}
                                         </div>
                                         <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between">
                                               <span className="font-bold text-zinc-900 dark:text-white text-sm">{action.memberCreator.fullName}</span>
                                               <span className="text-xs text-zinc-500">
                                                  {new Date(action.date).toLocaleString('pt-BR')}
                                                  {action.data.edited_at && (
                                                    <span className="ml-1.5 text-zinc-400 dark:text-zinc-500 italic">editada</span>
                                                  )}
                                               </span>
                                            </div>
                                            
                                            {editingActionId === action.id ? (
                                               <div className="animate-in fade-in duration-200">
                                                  <textarea 
                                                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-brand-yellow/50 rounded-xl p-3 text-sm text-zinc-900 dark:text-white focus:outline-none mb-2 min-h-[100px]"
                                                    value={editingText}
                                                    onChange={(e) => setEditingText(e.target.value)}
                                                    autoFocus
                                                  />
                                                  <div className="flex items-center gap-2">
                                                     <button 
                                                        onClick={() => handleUpdateComment(action.id)}
                                                        disabled={actionLoadingId === action.id}
                                                        className="px-3 py-1.5 bg-brand-yellow text-black text-xs font-bold rounded-lg flex items-center gap-1 hover:bg-[#fcd61e]"
                                                     >
                                                        {actionLoadingId === action.id ? <RefreshCw className="w-3 h-3 animate-spin"/> : <Save className="w-3 h-3"/>}
                                                        Salvar
                                                     </button>
                                                     <button 
                                                        onClick={handleCancelEdit}
                                                        disabled={actionLoadingId === action.id}
                                                        className="px-3 py-1.5 text-zinc-400 text-xs font-medium hover:text-zinc-900 dark:hover:text-white"
                                                     >
                                                        Cancelar
                                                     </button>
                                                  </div>
                                               </div>
                                            ) : (
                                              <>
                                                <div className="bg-light-card dark:bg-zinc-800/50 p-3 rounded-r-xl rounded-bl-xl text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed border border-zinc-200 dark:border-zinc-700/50">
                                                   <ReactMarkdown components={MarkdownComponents}>
                                                      {action.data.text}
                                                   </ReactMarkdown>
                                                </div>
                                                
                                                {/* Editar/Excluir: apenas o autor da mensagem */}
                                                {isAuthorOfComment(action.memberCreator.fullName) && (
                                                <div className="flex items-center gap-3 mt-1 ml-1 opacity-0 group-hover/comment:opacity-100 transition-opacity duration-200">
                                                   <button 
                                                      type="button"
                                                      onClick={() => handleStartEdit(action.id, action.data.text)}
                                                      className="text-[10px] text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:underline flex items-center gap-1"
                                                   >
                                                      Editar
                                                   </button>
                                                   <span className="text-zinc-400 dark:text-zinc-700 text-[10px]">•</span>
                                                   <button 
                                                      type="button"
                                                      onClick={() => handleDeleteComment(action.id)}
                                                      disabled={actionLoadingId === action.id}
                                                      className="text-[10px] text-zinc-500 hover:text-red-500 hover:underline flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                                   >
                                                      {actionLoadingId === action.id ? 'Excluindo…' : 'Excluir'}
                                                   </button>
                                                </div>
                                                )}
                                              </>
                                            )}
                                         </div>
                                      </div>
                                   ); })
                                ) : (
                                   <div className="text-center py-8 text-zinc-600 italic">
                                      Nenhum comentário registrado.
                                   </div>
                                )}
                             </div>

                             {can('canAddComments') && (
                             <div className="p-4 bg-zinc-50/80 dark:bg-white/[0.03] border-t border-zinc-200/60 dark:border-white/[0.06] flex gap-2.5 items-end">
                                <input 
                                   type="text" 
                                   value={newComment}
                                   onChange={(e) => setNewComment(e.target.value)}
                                   placeholder="Escreva um comentário..."
                                   className="flex-1 bg-white dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/[0.08] rounded-2xl px-4 py-3 text-[15px] text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-brand-yellow/50 focus:ring-2 focus:ring-brand-yellow/20 transition-all"
                                   onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) handleSendComment() }}
                                />
                                <button 
                                   type="button"
                                   onClick={handleSendComment}
                                   disabled={sendingComment || !newComment.trim()}
                                   className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed bg-brand-yellow text-black hover:bg-[#fcd61e] active:scale-95 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)] disabled:shadow-none disabled:hover:bg-brand-yellow"
                                >
                                   {sendingComment ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" strokeWidth={2.2} />}
                                </button>
                             </div>
                             )}
                          </div>
                        </div>

                      </div>

                      <div className="space-y-8">
                         
                         <div>
                            <h3 className="text-brand-yellow text-sm font-bold uppercase tracking-widest mb-4">Alterar status</h3>
                            <button 
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleOpenMoveModal(selectedCard, e);
                                }}
                                className={`w-full p-4 border-2 rounded-xl flex items-center justify-between group transition-all hover:brightness-110 hover:scale-[1.01] active:scale-[0.99] ${getStatusConfig(lists.find(l => l.id === selectedCard.idList)?.name ?? '', selectedCard.idList).style}`}
                              >
                                <span className="font-bold">{getStatusConfig(lists.find(l => l.id === selectedCard.idList)?.name ?? '', selectedCard.idList).label}</span>
                                <ChevronDown className="w-5 h-5 opacity-90" />
                            </button>
                         </div>

                         <div className="h-px bg-zinc-200 dark:bg-zinc-800"></div>

                         {/* Orçamentos: criar + lista */}
                         {can('canEditBudgets') && (
                         <div ref={budgetsSectionRef}>
                            <h3 className="text-brand-yellow text-sm font-bold uppercase tracking-widest mb-4">Orçamentos</h3>
                            <div className="space-y-3">
                              <button 
                                  type="button"
                                  onClick={() => openBudgetModal()}
                                  className="w-full p-4 bg-[#f0ebe0] border border-[#e2dcd0] hover:bg-[#e8e2d5] rounded-xl flex items-center justify-between group transition-all shadow-sm"
                                >
                                  <span className="font-black text-zinc-800">Criar orçamento</span>
                                  <Calculator className="w-5 h-5 text-zinc-700 group-hover:scale-110 transition-transform" />
                              </button>
                              <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 p-3 space-y-3 max-h-[280px] overflow-y-auto shadow-inner bg-zinc-100/50 dark:bg-zinc-900/30">
                              {savedBudgets
                                .filter((b) => b.serviceOrderId === selectedCard.id)
                                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                .map((budget, index) => {
                                  const preview =
                                    budget.diagnosis?.split('\n')[0]?.slice(0, 42) ||
                                    budget.services[0]?.description?.slice(0, 42) ||
                                    (budget.parts[0] ? `${budget.parts[0].quantity}x ${budget.parts[0].description?.slice(0, 30)}` : '') ||
                                    'Orçamento';
                                  const dateStr = new Date(budget.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                                  const numero = index + 1;
                                  return (
                                    <button
                                      key={budget.id}
                                      type="button"
                                      onClick={() => setViewingBudget(budget)}
                                      className="w-full text-left rounded-xl bg-[#f5f4f0] dark:bg-[#f5f4f0]/90 border border-zinc-200/90 dark:border-zinc-300/40 p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-zinc-300 dark:hover:border-zinc-400/60 transition-all duration-200"
                                    >
                                      <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-700">
                                          Orçamento {numero}
                                        </span>
                                        <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-600 tabular-nums">
                                          {dateStr}
                                        </span>
                                      </div>
                                      <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-800 line-clamp-2 leading-snug mb-2">
                                        {preview}
                                      </p>
                                      <div className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-600">
                                        <span>{budget.services.length} serviço{budget.services.length !== 1 ? 's' : ''}</span>
                                        <span className="text-zinc-400">·</span>
                                        <span>{budget.parts.length} peça{budget.parts.length !== 1 ? 's' : ''}</span>
                                      </div>
                                    </button>
                                  );
                                })}
                              {savedBudgets.filter((b) => b.serviceOrderId === selectedCard.id).length === 0 && (
                                <div className="rounded-xl bg-[#f5f4f0] dark:bg-[#f5f4f0]/80 border border-dashed border-zinc-300 dark:border-zinc-400/50 p-5 text-center">
                                  <FileText className="w-9 h-9 text-zinc-400 dark:text-zinc-500 mx-auto mb-2" />
                                  <p className="text-sm font-medium text-zinc-600 dark:text-zinc-600">Nenhum orçamento</p>
                                  <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-0.5">Crie um orçamento pelo botão acima</p>
                                </div>
                              )}
                              </div>

                              {/* Aprovar orçamento (somente admin): separado da exibição, dentro de Orçamentos */}
                              {actorOptions?.actor === 'admin' && savedBudgets.filter((b) => b.serviceOrderId === selectedCard.id).length > 0 && (
                                <div className="mt-4 pt-4 border-t border-zinc-200/80 dark:border-zinc-700/80">
                                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">Aprovar orçamento</p>
                                  <p className="text-[11px] text-zinc-500 dark:text-zinc-500 mb-3">Selecione um orçamento para marcar cada serviço e peça como aprovado ou reprovado.</p>
                                  <div className="flex flex-wrap gap-2">
                                    {savedBudgets
                                      .filter((b) => b.serviceOrderId === selectedCard.id)
                                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                      .map((budget, idx) => (
                                        <button
                                          key={budget.id}
                                          type="button"
                                          onClick={() => openBudgetApproval(budget)}
                                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-sm font-medium hover:bg-amber-500/20 transition-colors"
                                        >
                                          <CheckCircle2 className="w-4 h-4" />
                                          Aprovar orçamento {idx + 1}
                                        </button>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </div>
                         </div>
                         )}

                         <div className="h-px bg-zinc-200 dark:bg-zinc-800"></div>

                         <div>
                             <h3 className="text-brand-yellow text-sm font-bold uppercase tracking-widest mb-4">Checklists</h3>
                             <div className="space-y-3">
                                <button 
                                    onClick={() => { setActiveChecklistCardId(selectedCard.id); setActiveChecklistType('Entrada'); }}
                                    className="w-full p-4 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-brand-yellow hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl flex items-center gap-3 group transition-all"
                                  >
                                    <div className="w-10 h-10 rounded-full bg-brand-yellow/10 flex items-center justify-center text-brand-yellow group-hover:bg-brand-yellow group-hover:text-black transition-colors">
                                        <ClipboardList className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-zinc-900 dark:text-white">Checklist Entrada</p>
                                        <p className="text-xs text-zinc-500">Verificar avarias e scanner</p>
                                    </div>
                                </button>

                                <button 
                                    onClick={() => { setActiveChecklistCardId(selectedCard.id); setActiveChecklistType('Finalização'); }}
                                    className="w-full p-4 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-blue-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl flex items-center gap-3 group transition-all"
                                  >
                                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                        <ListChecks className="w-5 h-5" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-zinc-900 dark:text-white">Checklist Finalização</p>
                                        <p className="text-xs text-zinc-500">Limpeza e etiquetas</p>
                                    </div>
                                </button>
                             </div>
                         </div>

                         <div className="h-px bg-zinc-200 dark:bg-zinc-800"></div>

                         <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-brand-yellow text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                                   <Paperclip className="w-4 h-4" />
                                   Anexos
                                </h3>
                                <div className="grid grid-cols-3 gap-3 w-full justify-items-center">
                                    <input 
                                        type="file" 
                                        ref={galleryInputRef} 
                                        className="hidden" 
                                        accept="image/*,application/pdf"
                                        multiple
                                        onChange={handleGallerySelect}
                                    />
                                    <input 
                                        type="file" 
                                        ref={cameraInputRef} 
                                        className="hidden" 
                                        accept="image/*,application/pdf"
                                        capture="environment"
                                        onChange={handleCameraFileSelect}
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => cameraInputRef.current?.click()}
                                        disabled={isUploading}
                                        className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white/90 dark:bg-white/[0.08] border border-zinc-200/80 dark:border-white/10 shadow-sm active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.12] transition-all duration-200"
                                        title="Foto do veículo (câmera ou arquivo)"
                                    >
                                        <Camera className="w-6 h-6 shrink-0" strokeWidth={2} />
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => galleryInputRef.current?.click()}
                                        disabled={isUploading}
                                        className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white/90 dark:bg-white/[0.08] border border-zinc-200/80 dark:border-white/10 shadow-sm active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.12] transition-all duration-200"
                                        title="Galeria / Documentos"
                                    >
                                        <ImageIcon className="w-6 h-6 shrink-0" strokeWidth={2} />
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => galleryInputRef.current?.click()}
                                        disabled={isUploading}
                                        className="flex items-center justify-center w-14 h-14 rounded-2xl bg-white/90 dark:bg-white/[0.08] border border-zinc-200/80 dark:border-white/10 shadow-sm active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.12] transition-all duration-200"
                                        title="Arquivos do dispositivo"
                                    >
                                        <FolderOpen className="w-6 h-6 shrink-0" strokeWidth={2} />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="space-y-3">
                               {isUploading && (
                                  <div className="flex justify-center p-4">
                                     <RefreshCw className="w-4 h-4 text-brand-yellow animate-spin" />
                                  </div>
                               )}
                               {loadingDetails ? (
                                  <div className="flex justify-center p-4">
                                     <RefreshCw className="w-4 h-4 text-zinc-500 animate-spin" />
                                  </div>
                               ) : cardDetails?.attachments && cardDetails.attachments.length > 0 ? (
                                  (() => {
                                    const attachments = cardDetails.attachments;
                                    const images = attachments.filter(att => att.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.url));
                                    const others = attachments.filter(att => !(att.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.url)));
                                    const thumbUrl = (att: typeof attachments[0]) => (att.previews && att.previews.length > 0 ? att.previews[att.previews.length > 2 ? 2 : 0].url : att.url);
                                    return (
                                      <div className="space-y-5">
                                        {images.length > 0 && (
                                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                                            {images.map(att => {
                                              const isLoadingThis = loadingAttachmentId === att.id;
                                              const src = thumbUrl(att);
                                              return (
                                                <div
                                                  key={att.id}
                                                  className="aspect-square rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-900 relative group"
                                                >
                                                  <button
                                                    type="button"
                                                    onClick={() => !isLoadingThis && setPreviewImages({ urls: images.map(a => a.url), currentIndex: images.findIndex(a => a.url === att.url) })}
                                                    className="absolute inset-0 w-full h-full focus:outline-none focus:ring-2 focus:ring-brand-yellow/50 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 rounded-xl"
                                                  >
                                                    {isLoadingThis ? (
                                                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-200/80 dark:bg-zinc-800/80">
                                                        <RefreshCw className="w-6 h-6 text-brand-yellow animate-spin" />
                                                      </div>
                                                    ) : (
                                                      <>
                                                        <img
                                                          src={src || att.url}
                                                          alt={att.name}
                                                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between pb-2 px-2">
                                                          <button
                                                            type="button"
                                                            onClick={(e) => handleShareImage(e, { url: att.url, name: att.name })}
                                                            className="p-1.5 rounded-lg bg-black/40 hover:bg-black/60 text-white drop-shadow-lg"
                                                            title="Compartilhar (ex.: WhatsApp)"
                                                          >
                                                            <Share2 className="w-5 h-5" />
                                                          </button>
                                                          <ZoomIn className="w-6 h-6 text-white drop-shadow-lg" />
                                                        </div>
                                                      </>
                                                    )}
                                                  </button>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                        {others.length > 0 && (
                                          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700">
                                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">Documentos</p>
                                            <div className="flex flex-wrap gap-2">
                                              {others.map(att => {
                                                const isPdf = att.mimeType === 'application/pdf' || att.url.toLowerCase().endsWith('.pdf');
                                                const isLoadingThis = loadingAttachmentId === att.id;
                                                const isRenamingThis = renamingAttachmentId === att.id;
                                                const isEditingName = renameAttachmentId === att.id;
                                                const attachmentPath = att.id;
                                                const canRename = attachmentPath.includes('/');
                                                return (
                                                  <div key={att.id} className="flex items-center gap-2 min-w-0 max-w-full">
                                                    {isEditingName ? (
                                                      <div className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                                                        <FileText className="w-5 h-5 text-zinc-500 dark:text-zinc-400 shrink-0" />
                                                        <input
                                                          type="text"
                                                          value={renameAttachmentNewName}
                                                          onChange={(e) => setRenameAttachmentNewName(e.target.value)}
                                                          onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                              e.preventDefault();
                                                              if (selectedCard && renameAttachmentNewName.trim()) {
                                                                setRenamingAttachmentId(att.id);
                                                                renameServiceOrderPhoto(selectedCard.id, attachmentPath, renameAttachmentNewName.trim())
                                                                  .then(() => getServiceOrderPhotos(selectedCard.id))
                                                                  .then(photos => {
                                                                    setCardDetails(prev => prev ? {
                                                                      ...prev,
                                                                      attachments: photos.map((p, i) => ({
                                                                        id: p.path || String(i),
                                                                        name: p.name,
                                                                        url: p.url,
                                                                        mimeType: attachmentMimeType(p.name),
                                                                        previews: [{ url: p.url, width: 200, height: 200 }],
                                                                      })),
                                                                    } : null);
                                                                  })
                                                                  .catch(err => alert(err?.message ?? 'Erro ao renomear.'))
                                                                  .finally(() => { setRenameAttachmentId(null); setRenamingAttachmentId(null); });
                                                              }
                                                            }
                                                            if (e.key === 'Escape') {
                                                              setRenameAttachmentId(null);
                                                              setRenameAttachmentNewName('');
                                                            }
                                                          }}
                                                          className="flex-1 min-w-0 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-transparent border-0 focus:ring-0 focus:outline-none p-0"
                                                          placeholder="Novo nome do arquivo"
                                                          autoFocus
                                                        />
                                                        <button
                                                          type="button"
                                                          onClick={() => {
                                                            if (!selectedCard || !renameAttachmentNewName.trim()) return;
                                                            setRenamingAttachmentId(att.id);
                                                            renameServiceOrderPhoto(selectedCard.id, attachmentPath, renameAttachmentNewName.trim())
                                                              .then(() => getServiceOrderPhotos(selectedCard.id))
                                                              .then(photos => {
                                                                setCardDetails(prev => prev ? {
                                                                  ...prev,
                                                                  attachments: photos.map((p, i) => ({
                                                                    id: p.path || String(i),
                                                                    name: p.name,
                                                                    url: p.url,
                                                                    mimeType: attachmentMimeType(p.name),
                                                                    previews: [{ url: p.url, width: 200, height: 200 }],
                                                                  })),
                                                                } : null);
                                                              })
                                                              .catch(err => alert(err?.message ?? 'Erro ao renomear.'))
                                                              .finally(() => { setRenameAttachmentId(null); setRenamingAttachmentId(null); });
                                                          }}
                                                          disabled={isRenamingThis || !renameAttachmentNewName.trim()}
                                                          className="shrink-0 p-1 rounded text-brand-yellow hover:bg-brand-yellow/20 disabled:opacity-50"
                                                          title="Confirmar"
                                                        >
                                                          <Check className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={() => { setRenameAttachmentId(null); setRenameAttachmentNewName(''); }}
                                                          className="shrink-0 p-1 rounded text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                                          title="Cancelar"
                                                        >
                                                          <X className="w-4 h-4" />
                                                        </button>
                                                      </div>
                                                    ) : (
                                                      <>
                                                        <a
                                                          href={att.url}
                                                          target="_blank"
                                                          rel="noopener noreferrer"
                                                          onClick={(e) => {
                                                            if (isPdf) {
                                                              e.preventDefault();
                                                              setPreviewPdf(att.url);
                                                            }
                                                          }}
                                                          className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors min-w-0 flex-1"
                                                        >
                                                          {isLoadingThis ? (
                                                            <RefreshCw className="w-5 h-5 text-brand-yellow animate-spin shrink-0" />
                                                          ) : (
                                                            <FileText className="w-5 h-5 text-zinc-500 dark:text-zinc-400 shrink-0" />
                                                          )}
                                                          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">{att.name}</span>
                                                          {(isPdf || !att.mimeType?.startsWith('image/')) && <ExternalLink className="w-4 h-4 text-zinc-400 shrink-0" />}
                                                        </a>
                                                        {canRename && (
                                                          <button
                                                            type="button"
                                                            onClick={() => {
                                                              setRenameAttachmentId(att.id);
                                                              setRenameAttachmentNewName(att.name);
                                                            }}
                                                            className="shrink-0 p-2 rounded-lg text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-300"
                                                            title="Renomear arquivo"
                                                          >
                                                            <Pencil className="w-4 h-4" />
                                                          </button>
                                                        )}
                                                      </>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()
                               ) : (
                                  <div className="text-center py-6 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl">
                                     <p className="text-zinc-600 text-sm">Nenhum anexo encontrado.</p>
                                  </div>
                               )}
                            </div>
                         </div>

                      </div>
                  </div>
              </div>
           </div>
        </div>
      )}

      {/* MODAL EDITAR DADOS DA FICHA (cliente + veículo) */}
      {isEditFichaOpen && selectedCard && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-modal-backdrop">
          <div className="bg-white dark:bg-[#1C1C1E] border border-zinc-200 dark:border-white/10 w-full max-w-lg max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-modal-sheet">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-white/10 bg-brand-yellow/10">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Pencil className="w-5 h-5 text-brand-yellow" />
                Editar dados da ficha
              </h3>
              <button type="button" onClick={() => setIsEditFichaOpen(false)} className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-4 custom-scrollbar">
              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Nome</label>
                <input value={editFichaForm.name} onChange={(e) => setEditFichaForm(f => ({ ...f, name: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="Nome do cliente" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Telefone</label>
                  <input value={editFichaForm.phone} onChange={(e) => setEditFichaForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="(11) 99999-9999" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">E-mail</label>
                  <input type="email" value={editFichaForm.email} onChange={(e) => setEditFichaForm(f => ({ ...f, email: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="email@exemplo.com" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">CPF</label>
                <input value={editFichaForm.cpf} onChange={(e) => setEditFichaForm(f => ({ ...f, cpf: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="000.000.000-00" />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Endereço</label>
                <input value={editFichaForm.address} onChange={(e) => setEditFichaForm(f => ({ ...f, address: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="Rua, bairro..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Nº</label>
                  <input value={editFichaForm.addressNumber} onChange={(e) => setEditFichaForm(f => ({ ...f, addressNumber: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="123" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">CEP</label>
                  <input value={editFichaForm.cep} onChange={(e) => setEditFichaForm(f => ({ ...f, cep: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="00000-000" />
                </div>
              </div>
              <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-2" />
              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">{isModuleMode ? 'Veículo' : 'Modelo do veículo'}</label>
                <input value={editFichaForm.vehicleModel} onChange={(e) => setEditFichaForm(f => ({ ...f, vehicleModel: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder={isModuleMode ? 'Ex: BMW 320i' : 'Ex: Gol 1.0'} />
              </div>
              {isModuleMode && (
              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Identificação do módulo</label>
                <input value={editFichaForm.moduleIdentification} onChange={(e) => setEditFichaForm(f => ({ ...f, moduleIdentification: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="Ex: Módulo ABS XYZ" />
              </div>
              )}
              {!isModuleMode && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Placa</label>
                  <input value={editFichaForm.plate} onChange={(e) => setEditFichaForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))} maxLength={8} className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="ABC1D23" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">Km</label>
                  <input value={editFichaForm.mileageKm} onChange={(e) => setEditFichaForm(f => ({ ...f, mileageKm: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/40" placeholder="45000" />
                </div>
              </div>
              )}
            </div>
            <div className="flex gap-3 p-6 border-t border-zinc-200 dark:border-white/10 bg-zinc-50/50 dark:bg-white/[0.03]">
              <button type="button" onClick={() => setIsEditFichaOpen(false)} className="flex-1 py-3 rounded-xl border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">Cancelar</button>
              <button type="button" onClick={handleSaveEditFicha} disabled={editFichaSaving} className="flex-1 py-3 rounded-xl bg-brand-yellow text-black font-bold hover:bg-[#fcd61e] transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                {editFichaSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR NOME DO VEÍCULO / PLACA */}
      {isVehicleEditOpen && selectedCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-modal-backdrop">
          <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-zinc-200/60 dark:border-white/[0.08] w-full max-w-md rounded-[1.5rem] shadow-xl overflow-hidden animate-modal-sheet">
            <div className="p-6 border-b border-zinc-200/60 dark:border-white/[0.08]">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Pencil className="w-5 h-5 text-brand-yellow" />
                Editar veículo
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Corrija o nome do veículo ou a placa, se estiver errado.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Nome do veículo</label>
                <input
                  type="text"
                  value={vehicleEditModel}
                  onChange={(e) => setVehicleEditModel(e.target.value)}
                  placeholder="Ex: Gol 1.0"
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-yellow/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">Placa</label>
                <input
                  type="text"
                  value={vehicleEditPlate}
                  onChange={(e) => setVehicleEditPlate(e.target.value.toUpperCase())}
                  placeholder="Ex: ABC1D23"
                  maxLength={8}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-yellow/40 uppercase"
                />
              </div>
            </div>
            <div className="p-6 pt-0 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setIsVehicleEditOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveVehicleEdit}
                disabled={savingVehicleEdit || !vehicleEditModel.trim() || !vehicleEditPlate.trim()}
                className="px-4 py-2.5 rounded-xl bg-brand-yellow hover:bg-amber-500 disabled:opacity-50 text-black font-semibold flex items-center gap-2 transition-colors"
              >
                {savingVehicleEdit ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL (IMAGE PREVIEW) WITH ZOOM E NAVEGAÇÃO */}
      {previewImages && (
        <Lightbox
          images={previewImages.urls}
          initialIndex={previewImages.currentIndex}
          onClose={() => setPreviewImages(null)}
        />
      )}

      {/* PDF VIEWER MODAL */}
      {previewPdf && (
        <PdfViewer 
          src={previewPdf}
          onClose={() => setPreviewPdf(null)}
        />
      )}

      {/* MODAL VISUALIZAR ORÇAMENTO — folha de papel envelhecido */}
      {viewingBudget && selectedCard && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/70 p-4 animate-modal-backdrop">
          <div
            className="relative w-full max-w-2xl max-h-[90vh] rounded-sm flex flex-col overflow-hidden animate-modal-sheet"
            style={{
              backgroundColor: '#e8e4d9',
              border: '1px solid #c9c4b8',
              boxShadow: '0 2px 2px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.15)',
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23grain)' opacity='0.04'/%3E%3C/svg%3E")`,
            }}
          >
            {/* Textura de fibra sobreposta */}
            <div
              className="absolute inset-0 pointer-events-none rounded-sm opacity-[0.035]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
              }}
            />
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#d4cfc4] shrink-0 relative z-10">
              <div>
                <h2 className="text-lg font-bold text-[#3d3932]">Orçamento</h2>
                <p className="text-sm text-[#6b6560] mt-0.5">
                  {new Date(viewingBudget.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                {selectedCard?.mileageKm && (
                  <p className="text-sm text-[#6b6560] mt-1">
                    <span className="text-amber-600 font-medium">Km</span> {selectedCard.mileageKm}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => shareBudget(viewingBudget, selectedCard?.mileageKm ?? null)}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[#6b6560] hover:text-[#3d3932] hover:bg-[#ddd8ce] transition-colors"
                  title="Compartilhar orçamento"
                  aria-label="Compartilhar"
                >
                  <Share2 className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewingBudget(null)}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[#6b6560] hover:text-[#3d3932] hover:bg-[#ddd8ce] transition-colors"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-[#3d3932] relative z-10">
              {viewingBudget.diagnosis && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6b6560] mb-2">Diagnóstico</h3>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap text-[#4a4540]">{viewingBudget.diagnosis}</div>
                </section>
              )}
              {viewingBudget.services.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6b6560] mb-2">Serviços</h3>
                  <ul className="list-none space-y-1.5 text-sm text-[#4a4540]">
                    {viewingBudget.services.map((s, i) => (
                      <li key={i} className="flex items-center gap-2">
                        {s.approved === true && <Check className="w-4 h-4 shrink-0 text-emerald-600" aria-label="Aprovado" />}
                        {s.approved === false && <X className="w-4 h-4 shrink-0 text-red-600" aria-label="Reprovado" />}
                        {s.approved !== true && s.approved !== false && <span className="w-4 h-4 shrink-0 text-[#6b6560] font-bold" aria-label="Pendente">—</span>}
                        <span>{s.description}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {viewingBudget.parts.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6b6560] mb-2">Peças</h3>
                  <ul className="space-y-1.5 text-sm text-[#4a4540]">
                    {viewingBudget.parts.map((p, i) => (
                      <li key={i} className="flex items-center gap-2">
                        {p.approved === true && <Check className="w-4 h-4 shrink-0 text-emerald-600" aria-label="Aprovado" />}
                        {p.approved === false && <X className="w-4 h-4 shrink-0 text-red-600" aria-label="Reprovado" />}
                        {p.approved !== true && p.approved !== false && <span className="w-4 h-4 shrink-0 text-[#6b6560] font-bold" aria-label="Pendente">—</span>}
                        <span><span className="font-medium text-[#3d3932]">({p.quantity}x)</span> {p.description}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {viewingBudget.observations && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#6b6560] mb-2">Observações</h3>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap text-[#4a4540]">{viewingBudget.observations}</div>
                </section>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#d4cfc4] shrink-0 relative z-10" style={{ backgroundColor: 'rgba(221,216,206,0.6)' }}>
              <button
                type="button"
                onClick={handleDeleteBudget}
                disabled={!!deletingBudgetId}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-red-300 text-red-700 font-medium text-sm hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                {deletingBudgetId ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deletingBudgetId ? 'Excluindo…' : 'Excluir orçamento'}
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setViewingBudget(null); openBudgetModal(viewingBudget); }}
                  disabled={!!deletingBudgetId}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[#c9c4b8] text-[#4a4540] font-medium text-sm hover:bg-[#ddd8ce] transition-colors disabled:opacity-50"
                >
                  <Pencil className="w-4 h-4" /> Editar orçamento
                </button>
                <button
                  type="button"
                  onClick={() => setViewingBudget(null)}
                  disabled={!!deletingBudgetId}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-opacity text-[#e8e4d9] hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: '#5c564d' }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Aprovar orçamento (admin) — toggles por serviço e peça */}
      {budgetApprovalTarget && selectedCard && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-zinc-200 dark:border-zinc-700 w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Aprovar orçamento</h2>
              <button type="button" onClick={closeBudgetApproval} className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Ligue = aprovado, desligue = reprovado. O técnico verá ✓ ou ✗ em cada item.</p>
              {budgetApprovalTarget.services.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">Serviços</h3>
                  <ul className="space-y-2">
                    {budgetApprovalTarget.services.map((s, i) => (
                      <li key={i} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={approvalServices[i]}
                          onClick={() => setApprovalServices((prev) => {
                            const next = [...prev];
                            next[i] = !next[i];
                            return next;
                          })}
                          className={`relative w-12 h-7 rounded-full shrink-0 transition-colors ${approvalServices[i] ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-600'}`}
                        >
                          <span className="absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 left-0.5" style={{ transform: approvalServices[i] ? 'translateX(20px)' : 'translateX(0)' }} />
                        </button>
                        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex-1">{s.description}</span>
                        <span className={`text-xs font-semibold ${approvalServices[i] ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {approvalServices[i] ? 'Aprovado' : 'Reprovado'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {budgetApprovalTarget.parts.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">Peças</h3>
                  <ul className="space-y-2">
                    {budgetApprovalTarget.parts.map((p, i) => (
                      <li key={i} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={approvalParts[i]}
                          onClick={() => setApprovalParts((prev) => {
                            const next = [...prev];
                            next[i] = !next[i];
                            return next;
                          })}
                          className={`relative w-12 h-7 rounded-full shrink-0 transition-colors ${approvalParts[i] ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-600'}`}
                        >
                          <span className="absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 left-0.5" style={{ transform: approvalParts[i] ? 'translateX(20px)' : 'translateX(0)' }} />
                        </button>
                        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 flex-1">({p.quantity}x) {p.description}</span>
                        <span className={`text-xs font-semibold shrink-0 ${approvalParts[i] ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {approvalParts[i] ? 'Aprovado' : 'Reprovado'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
            <div className="flex items-center gap-3 p-4 border-t border-zinc-200 dark:border-zinc-700">
              <button type="button" onClick={closeBudgetApproval} className="flex-1 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 font-medium">
                Cancelar
              </button>
              <button type="button" onClick={handleSaveApproval} disabled={savingApproval} className="flex-1 py-2.5 rounded-xl bg-brand-yellow text-black font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                {savingApproval ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                {savingApproval ? 'Salvando…' : 'Salvar aprovação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BUDGET FULL-SCREEN — Off-white paper texture, criar/editar */}
      {isBudgetOpen && selectedCard && (
        <div
          className="fixed inset-0 z-[60] overflow-auto animate-modal-backdrop"
          style={{
            backgroundColor: '#f5f4f0',
            backgroundImage: `
              linear-gradient(rgba(0,0,0,.018) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,0,0,.018) 1px, transparent 1px)
            `,
            backgroundSize: '24px 24px',
          }}
        >
          <div className="min-h-full flex flex-col max-w-[1600px] mx-auto pb-[env(safe-area-inset-bottom)]">
            {/* Header */}
            <header className="sticky top-0 z-10 flex items-center justify-between px-6 lg:px-10 py-5 bg-[#f5f4f0]/95 backdrop-blur-md border-b border-zinc-300/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-sm">
                  <Calculator className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{editingBudget ? 'Editar orçamento' : 'Orçamento'}</h1>
                  <p className="text-sm text-zinc-600 mt-0.5">
                    {blurPlates ? (() => {
                      const p = selectedCard.name.split(' - ');
                      return p.length >= 3 ? <>{p[0]} <span className="blur-plate">{p[1]}</span> {p.slice(2).join(' - ')}</> : selectedCard.name;
                    })() : selectedCard.name}
                  </p>
                </div>
              </div>
              <button
                onClick={closeBudgetModal}
                className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-300/50 transition-colors"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto flex justify-center" style={{ paddingBottom: 'max(8rem, env(safe-area-inset-bottom, 0px))' }}>
              <main className="w-full max-w-2xl p-6 lg:p-10">
                  <div className="space-y-8">
                    <section className="bg-white/80 rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-zinc-100">
                        <h3 className="font-semibold text-zinc-900 flex items-center gap-2">
                          <ClipboardList className="w-5 h-5 text-zinc-400" />
                          Descrição do diagnóstico
                        </h3>
                      </div>
                      <textarea
                        className="w-full px-6 py-4 bg-transparent border-0 text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-0 min-h-[120px] resize-y text-sm leading-relaxed"
                        placeholder="Descreva o diagnóstico técnico..."
                        value={budgetDiagnosis}
                        onChange={(e) => setBudgetDiagnosis(e.target.value)}
                      />
                    </section>

                    <section className="bg-white/80 rounded-2xl border border-zinc-200/80 shadow-sm overflow-visible">
                      <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
                        <h3 className="font-semibold text-zinc-900 flex items-center gap-2">
                          <Users className="w-5 h-5 text-zinc-400" />
                          Serviços
                        </h3>
                        <div className="flex items-center gap-2">
                          {workshopServices.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setIsServiceListOpen(true)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-300 bg-white text-zinc-700 text-sm font-medium hover:bg-zinc-100 transition-colors shadow-sm"
                            >
                              Inserir da lista
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          )}
                          <button type="button" onClick={addServiceRow} className="text-sm font-medium text-zinc-600 hover:text-zinc-900 flex items-center gap-1.5">
                            <Plus className="w-4 h-4" /> Adicionar
                          </button>
                        </div>
                      </div>
                      <div className="p-4 space-y-3">
                        {budgetServices.map((item) => {
                          const suggestions = getServiceSuggestions(item.description);
                          const showSuggestions = suggestionsForServiceId === item.id && suggestions.length > 0;
                          const isFocused = suggestionsForServiceId === item.id;
                          return (
                            <div
                              key={item.id}
                              ref={isFocused ? focusedServiceInputRef : undefined}
                              className="relative"
                            >
                              <div className="flex gap-3 items-center">
                                <div className="flex-1 min-w-0">
                                  <input
                                    type="text"
                                    placeholder="Digite ou escolha um serviço..."
                                    className="w-full px-4 py-2.5 rounded-lg border border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/50 text-sm shadow-sm"
                                    style={{ caretColor: '#18181b' }}
                                    value={item.description}
                                    onChange={(e) => updateServiceDescription(item.id, e.target.value)}
                                    onFocus={() => handleServiceInputFocus(item.id)}
                                    onBlur={handleServiceInputBlur}
                                  />
                                </div>
                                <button type="button" onClick={() => removeServiceRow(item.id)} className="p-2 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    {/* Modal: lista de serviços cadastrados (mesma largura do campo de serviços) */}
                    {isServiceListOpen && (
                      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40" onClick={() => setIsServiceListOpen(false)}>
                        <div
                          className="w-full max-w-2xl max-h-[70vh] overflow-hidden rounded-2xl bg-white shadow-xl border border-zinc-200"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
                            <span className="font-semibold text-zinc-900">Serviços cadastrados</span>
                            <button type="button" onClick={() => setIsServiceListOpen(false)} className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-200">
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                          <div className="overflow-y-auto max-h-[calc(70vh-52px)] py-2">
                            {workshopServices.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => addServiceFromList(s.name)}
                                className="w-full text-left px-4 py-3 text-zinc-900 hover:bg-amber-50 border-b border-zinc-100 last:border-0 transition-colors"
                              >
                                {s.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Modal: sugestões ao digitar (embaixo do campo) */}
                    {suggestionBoxPosition && suggestionsForServiceId && (() => {
                      const suggestions = budgetServices.find(i => i.id === suggestionsForServiceId)
                        ? getServiceSuggestions(budgetServices.find(i => i.id === suggestionsForServiceId)!.description)
                        : [];
                      if (suggestions.length === 0) return null;
                      return (
                        <>
                          <div className="fixed inset-0 z-[65] bg-black/25" onClick={() => setSuggestionsForServiceId(null)} />
                          <div
                            className="fixed z-[66] rounded-xl bg-white border border-zinc-200 shadow-xl overflow-hidden py-1 max-h-[200px] overflow-y-auto"
                            style={{
                              top: suggestionBoxPosition.top,
                              left: suggestionBoxPosition.left,
                              width: suggestionBoxPosition.width,
                            }}
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            {suggestions.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onMouseDown={() => suggestionsForServiceId && applySuggestion(suggestionsForServiceId, s.name)}
                                className="w-full text-left px-4 py-2.5 text-sm text-zinc-900 hover:bg-amber-100 transition-colors"
                              >
                                {s.name}
                              </button>
                            ))}
                          </div>
                        </>
                      );
                    })()}

                    <section className="bg-white/80 rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
                        <h3 className="font-semibold text-zinc-900 flex items-center gap-2">
                          <Settings className="w-5 h-5 text-zinc-400" />
                          Peças
                        </h3>
                        <button type="button" onClick={addPartRow} className="text-sm font-medium text-zinc-600 hover:text-zinc-900 flex items-center gap-1.5">
                          <Plus className="w-4 h-4" /> Adicionar
                        </button>
                      </div>
                      <div className="p-4 space-y-4">
                        {budgetParts.map((item) => (
                          <div key={item.id} className="flex flex-col sm:flex-row gap-3 sm:items-center bg-zinc-50/50 rounded-xl p-3 border border-zinc-100">
                            <input
                              type="text"
                              placeholder="Nome da peça..."
                              className="flex-1 px-4 py-2.5 rounded-lg border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 text-sm"
                              value={item.description}
                              onChange={(e) => updatePartDescription(item.id, e.target.value)}
                            />
                            <div className="flex items-center gap-2">
                              <div className="flex items-center rounded-lg border border-zinc-200 overflow-hidden bg-white">
                                <button type="button" onClick={() => updatePartQuantity(item.id, -1)} className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:bg-zinc-100 transition-colors">
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="w-10 text-center font-medium text-zinc-900 text-sm">{item.quantity}</span>
                                <button type="button" onClick={() => updatePartQuantity(item.id, 1)} className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:bg-zinc-100 transition-colors">
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                              <button type="button" onClick={() => removePartRow(item.id)} className="w-10 h-10 flex items-center justify-center rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="bg-white/80 rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-zinc-100">
                        <h3 className="font-semibold text-zinc-900 flex items-center gap-2">
                          <AlertCircle className="w-5 h-5 text-zinc-400" />
                          Observações
                        </h3>
                      </div>
                      <textarea
                        className="w-full px-6 py-4 bg-transparent border-0 text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-0 min-h-[88px] resize-y text-sm leading-relaxed"
                        placeholder="Prazos, condições, etc."
                        value={budgetObservations}
                        onChange={(e) => setBudgetObservations(e.target.value)}
                      />
                    </section>

                    <div className="flex justify-end pt-6 pb-4">
                      <button
                        type="button"
                        onClick={handleCreateBudget}
                        disabled={sendingBudget}
                        className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl bg-zinc-900 text-white font-semibold text-sm shadow-lg shadow-zinc-900/20 hover:bg-zinc-800 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {sendingBudget ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                        {editingBudget ? 'Salvar alterações' : 'Criar orçamento'}
                      </button>
                    </div>
                  </div>
              </main>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE SELEÇÃO DE ETAPA (MOVE) — estilo iOS 26 */}
      {cardInTransition && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-modal-backdrop">
          <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-zinc-200/60 dark:border-white/[0.08] w-full max-w-md rounded-[1.5rem] shadow-[0_4px_32px_-4px_rgba(0,0,0,0.12),0_16px_48px_-12px_rgba(0,0,0,0.18)] dark:shadow-[0_4px_40px_-4px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[90vh] animate-modal-sheet">
            <div className="flex items-center justify-between p-6 pb-5 border-b border-zinc-200/60 dark:border-white/[0.08] bg-zinc-50/60 dark:bg-white/[0.03]">
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Alterar etapa</p>
                <p className="text-xl font-bold text-zinc-900 dark:text-white truncate mt-1 tracking-tight">{cardInTransition.name.split('-')[0]}</p>
              </div>
              <button type="button" onClick={() => setCardInTransition(null)} className="w-10 h-10 rounded-full bg-zinc-200/80 dark:bg-white/10 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-300/80 dark:hover:bg-white/15 transition-colors shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
              {lists.map((list) => {
                const config = getStatusConfig(list.name, list.id);
                const isCurrent = list.id === cardInTransition.idList;
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => handleMoveCard(list.id)}
                    disabled={isCurrent || isMoving}
                    className={`
                      w-full py-4 px-5 rounded-2xl flex items-center justify-between text-left transition-all duration-200 min-h-[52px]
                      ${isCurrent 
                        ? 'opacity-60 cursor-not-allowed border border-zinc-200/60 dark:border-white/[0.08] bg-zinc-100/80 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400' 
                        : `border border-transparent ${config.style} hover:brightness-110 active:scale-[0.99] shadow-[0_2px_12px_-2px_rgba(0,0,0,0.12)]`}
                    `}
                  >
                    <span className="text-[15px] font-semibold uppercase tracking-wide">{list.name}</span>
                    {isCurrent && <Check className="w-5 h-5 shrink-0 opacity-80" />}
                  </button>
                );
              })}
            </div>
            <div className="p-4 pt-3 bg-zinc-50/60 dark:bg-white/[0.03] border-t border-zinc-200/60 dark:border-white/[0.08]">
              <button type="button" onClick={() => setCardInTransition(null)} className="w-full py-3 text-[15px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors rounded-xl hover:bg-zinc-200/50 dark:hover:bg-white/[0.06]">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE SELEÇÃO DE MECÂNICO */}
      {cardForMemberAssignment && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-modal-backdrop">
           <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-zinc-200/60 dark:border-white/[0.08] w-full max-w-md rounded-[1.5rem] shadow-[0_2px_24px_-4px_rgba(0,0,0,0.1),0_12px_40px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_32px_-4px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[90vh] animate-modal-sheet">
            <div className="flex items-center justify-between p-6 border-b border-zinc-200/60 dark:border-white/[0.08] bg-light-card/80 dark:bg-white/[0.04]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-yellow/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-brand-yellow" />
                </div>
                <div>
                  <h3 className="text-zinc-900 dark:text-white font-bold text-lg">Selecionar Técnico</h3>
                  <p className="text-zinc-500 text-xs mt-0.5">Responsável pelo veículo</p>
                </div>
              </div>
              <button type="button" onClick={() => setCardForMemberAssignment(null)} className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto space-y-2.5">
              <button
                type="button"
                onClick={() => handleAssignTechnician(null)}
                disabled={isAssigning}
                className="w-full p-3 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 bg-zinc-100/80 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 text-sm font-medium hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 transition-all"
              >
                Nenhum / Remover técnico
              </button>
              {TECHNICIANS.map((tech) => (
                <button
                  key={tech.id}
                  type="button"
                  onClick={() => handleAssignTechnician(tech)}
                  disabled={isAssigning}
                  className={`w-full p-4 rounded-xl border-2 flex items-center gap-3 text-sm uppercase font-black tracking-wide transition-all duration-200 ${tech.style} hover:brightness-110 hover:scale-[1.01] active:scale-[0.99] shadow-sm`}
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-black/20 flex items-center justify-center">
                    {tech.photo_url ? (
                      <img src={tech.photo_url} alt={tech.name} className="w-full h-full object-cover" />
                    ) : (
                      <Wrench className="w-5 h-5 opacity-90" />
                    )}
                  </div>
                  <span>{tech.name}</span>
                </button>
              ))}
            </div>

            <div className="p-4 bg-light-card/80 dark:bg-white/[0.04] border-t border-zinc-200/60 dark:border-white/[0.08] text-center">
                <button onClick={() => setCardForMemberAssignment(null)} className="text-zinc-500 text-sm hover:text-zinc-900 dark:hover:text-white transition-colors">Cancelar</button>
            </div>
           </div>
        </div>
      )}

      {/* MODAL DE CHECKLIST (ENTRADA OU FINALIZAÇÃO) */}
      {activeChecklistCard && activeChecklistType && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-modal-backdrop">
           <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-zinc-200/60 dark:border-white/[0.08] w-full max-w-lg rounded-[1.5rem] shadow-[0_2px_24px_-4px_rgba(0,0,0,0.1),0_12px_40px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_32px_-4px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[90vh] animate-modal-sheet">
             
             {/* Header Checklist */}
             <div className="relative p-8 pb-4 border-b border-zinc-200 dark:border-zinc-800 bg-gradient-to-b from-zinc-50 to-white dark:from-[#242426] dark:to-[#1C1C1E]">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                     <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${activeChecklistType === 'Entrada' ? 'bg-brand-yellow shadow-brand-yellow/20' : 'bg-blue-600 shadow-blue-600/20'}`}>
                        {activeChecklistType === 'Entrada' ? <ClipboardList className="w-6 h-6 text-black" /> : <ListChecks className="w-6 h-6 text-white" />}
                     </div>
                     <div>
                       <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">Checklist de {activeChecklistType}</h2>
                       <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">{activeChecklistCard.name.split('-')[0]}</p>
                     </div>
                  </div>
                  <button 
                    onClick={() => { setActiveChecklistCardId(null); setActiveChecklistType(null); }} 
                    className="w-8 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                {/* Progress Bar Header */}
                {(() => {
                   const searchTerm = normalizeText(activeChecklistType || "");
                   
                   const cl = activeChecklistCard.checklists?.find(c => normalizeText(c.name).includes(searchTerm));

                   if (!cl) return null;
                   const total = cl.checkItems.length;
                   const completed = cl.checkItems.filter(i => i.state === 'complete').length;
                   const pct = total > 0 ? (completed / total) * 100 : 0;
                   const barColor = activeChecklistType === 'Entrada' ? 'bg-brand-yellow' : 'bg-blue-600';
                   
                   return (
                     <div className="mt-4">
                        <div className="flex justify-between text-xs font-bold uppercase tracking-wider mb-2">
                          <span className={pct === 100 ? 'text-green-500' : 'text-zinc-400'}>
                             {pct === 100 ? 'Concluído' : 'Progresso'}
                          </span>
                          <span className="text-zinc-900 dark:text-white">{Math.round(pct)}%</span>
                        </div>
                        <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                           <div 
                             className={`h-full transition-all duration-500 ease-out ${pct === 100 ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : barColor}`}
                             style={{ width: `${pct}%` }}
                           />
                        </div>
                     </div>
                   )
                })()}
             </div>

             {/* Itens do Checklist */}
             <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-light-page dark:bg-[#121212]">
                {(() => {
                   const searchTerm = normalizeText(activeChecklistType || "");
                   
                   const cl = activeChecklistCard.checklists?.find(c => normalizeText(c.name).includes(searchTerm));
                   
                   if (!cl || cl.checkItems.length === 0) {
                     return (
                       <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-4">
                          <AlertCircle className="w-10 h-10 opacity-50" />
                          <p>Nenhum checklist de {activeChecklistType} encontrado.</p>
                          <button 
                             onClick={() => handleCreateChecklist(activeChecklistType)}
                             disabled={isCreatingChecklist}
                             className="px-6 py-2 bg-brand-surfaceHighlight border border-zinc-700 rounded-full text-white text-sm hover:bg-zinc-800 transition-colors flex items-center gap-2"
                          >
                             {isCreatingChecklist ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4" />}
                             Criar Checklist Padrão
                          </button>
                       </div>
                     );
                   }

                   return cl.checkItems.map(item => {
                     const isComplete = item.state === 'complete';

                     return (
                       <button
                         key={item.id}
                         onClick={() => handleToggleCheckItem(activeChecklistCard.id, cl.id, item.id, item.state)}
                         className={`
                            w-full p-4 rounded-xl border flex items-center justify-between transition-all duration-300 group
                            ${isComplete 
                              ? 'bg-[#1A251D] border-green-900/30 text-green-100' 
                              : 'bg-light-elevated dark:bg-[#1C1C1E] border-light-border dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-700 hover:bg-light-card dark:hover:bg-[#242426]'}
                         `}
                       >
                          <span className={`text-sm font-bold text-left ${isComplete ? 'line-through opacity-70' : ''}`}>
                             {item.name}
                          </span>
                          
                          <div className={`
                             w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300
                             ${isComplete ? 'bg-green-500 text-black scale-110' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 group-hover:bg-zinc-300 dark:group-hover:bg-zinc-700'}
                          `}>
                             {isComplete ? <Check className="w-4 h-4" /> : <div className="w-2 h-2 rounded-full bg-current opacity-50" />}
                          </div>
                       </button>
                     )
                   })
                })()}
             </div>

             {/* Footer Modal */}
             <div className="p-4 bg-light-card/80 dark:bg-white/[0.04] border-t border-zinc-200/60 dark:border-white/[0.08] text-center">
               <button 
                 onClick={() => { setActiveChecklistCardId(null); setActiveChecklistType(null); }}
                 className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-colors"
               >
                 Fechar Checklist
               </button>
             </div>

           </div>
         </div>
      )}

      {/* CAMERA MODAL */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[80] bg-black flex flex-col animate-modal-backdrop">
            <div className="relative flex-1 bg-black">
                <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
                
                <button 
                    onClick={stopCamera}
                    className="absolute top-6 right-6 z-50 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-md"
                >
                    <X className="w-6 h-6" />
                </button>

                <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-8">
                    <button 
                        onClick={takePhoto}
                        className="w-20 h-20 rounded-full bg-white border-4 border-zinc-300 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                    >
                        <div className="w-16 h-16 rounded-full bg-brand-yellow border-2 border-black" />
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* PHOTO PREVIEW MODAL */}
      {photoPreview && (
        <div className="fixed inset-0 z-[80] bg-black flex flex-col animate-modal-backdrop">
            <div className="relative flex-1 bg-black flex items-center justify-center">
                <img src={photoPreview} alt="Preview" className="max-w-full max-h-full object-contain" />
                
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/90 to-transparent flex justify-between items-end">
                    <button 
                        onClick={clearPhoto}
                        className="px-6 py-3 rounded-xl bg-zinc-800 text-white font-bold hover:bg-zinc-700 transition-colors"
                    >
                        Descartar
                    </button>
                    <button 
                        onClick={uploadPhoto}
                        disabled={isUploading}
                        className="px-6 py-3 rounded-xl bg-brand-yellow text-black font-bold hover:bg-[#fcd61e] transition-colors flex items-center gap-2"
                    >
                        {isUploading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                        Usar Foto
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};