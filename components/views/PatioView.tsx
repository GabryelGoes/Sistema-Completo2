import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { RefreshCw, AlertCircle, ChevronDown, ChevronRight, ChevronLeft, User, X, Check, Users, ClipboardList, CheckCircle2, Circle, Plus, ListChecks, FileText, Calendar, Clock, MessageSquare, Send, Paperclip, ExternalLink, ZoomIn, ZoomOut, Calculator, Trash2, DollarSign, Hash, Minus, Pencil, Save, Eye, History, Search, Copy, ArrowRight, ArrowRightLeft, Camera, Image as ImageIcon, FolderOpen, Upload, FilePlus, ArchiveRestore, Printer, Smartphone, Mail, MapPin, Share2, Sparkles, FlaskConical, Loader2, Tag, Link2, Wrench, Gauge } from 'lucide-react';
import { PdfViewerModal } from '../PdfViewerModal';
import { MechanicIcon } from '../ui/MechanicIcon';
import { ReminderIcon } from '../ui/ReminderIcon';
import { NotificationCenter } from '../NotificationCenter';
import { TrelloList, TrelloCard, TrelloMember, TrelloAction, TrelloAttachment, Customer, type VehicleReferenceLink } from '../../types';
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
  updateServiceOrderType,
  updateServiceOrderVehicleCategory,
  updateServiceOrderReferenceLinks,
  getServiceOrderPhotos,
  uploadServiceOrderPhoto,
  renameServiceOrderPhoto,
  deleteServiceOrderPhoto,
  getServiceOrderBudgets,
  createServiceOrderBudget,
  updateServiceOrderBudget,
  deleteServiceOrderBudget,
  getServiceOrderComments,
  addServiceOrderComment,
  deleteServiceOrderComment,
  updateServiceOrderComment,
  getWorkshopServices,
  getWorkshopParts,
  getSystemUserTechnicians,
  updateCustomer,
  deleteServiceOrderWithPassword,
  consultPlacaFipe,
  type PlacaFipeLookupResult,
  getChecklistTemplates,
  getServiceOrderChecklistState,
  updateServiceOrderChecklistItem,
  getWorkshopReminders,
  createWorkshopReminder,
  updateWorkshopReminderRemote,
  deleteWorkshopReminderRemote,
  ServiceOrderListItem,
  type WorkshopService,
  type WorkshopPart,
  type SystemUserTechnician,
  type ServiceOrderUpdateActor,
  type ServiceOrderType,
  type ChecklistTemplate,
} from '../../services/apiService';
import type { ServiceOrderDetail } from '../../services/apiService';
import { SERVICE_ORDER_STAGES, getStageStyle, getStageRingClass, type ServiceOrderStatus } from '../../constants/serviceOrderStages';
import { StorageThumbImg } from '../ui/StorageThumbImg';
import { BrazilFlagIcon } from '../ui/BrazilFlagIcon';
import { ModalPortal } from '../ui/ModalPortal';
import { PatioCarIcon } from '../ui/PatioCarIcon';
import {
  iosModalClose,
  iosModalInsetCard,
  iosModalOverlay,
  iosModalShell,
  iosVehicleModalShell,
  iosVehicleModalInsetCard,
  iosVehicleModalInput,
  iosInput,
  iosLabel,
  iosPageGlass,
  iosAccentPrimaryButton,
  iosPrimaryButton,
} from '../ui/iosModalStyles';
import { IosAccentIconSquircle } from '../ui/IosAccentIconSquircle';
import { markdownComponentsApp } from '../ui/markdownUi';
import { uiReadBody, uiSectionTitleRow } from '../ui/appTypography';
import { useServiceOrderLiveSync } from '../../hooks/useServiceOrderLiveSync';
import { printHtmlDocument } from '../../utils/printHtml';
import { formatLaborLabel } from '../../utils/workshopLaborFormat';
import { budgetHasExplicitApprovalDecisions, budgetReadRowClass } from '../../utils/budgetItemDisplay';
import { parseReferenceLinksFromApi } from '../../utils/vehicleReferenceLinks';

/** Modal de orçamento: papel branco-amarelado (mesmo tom em tema claro ou escuro do app). */
const budgetModalPaperInset =
  'rounded-[22px] border border-[#e8dfd0] bg-[#fffef8] shadow-[0_1px_3px_rgba(90,70,40,0.07),inset_0_1px_0_rgba(255,255,255,0.9)]';
const budgetModalFieldLabel =
  'block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6b6560] mb-2';
const budgetModalInput =
  'w-full rounded-2xl border border-[#e0d6c8] bg-[#fffef8] px-4 py-3 text-[15px] text-[#2d2820] shadow-sm placeholder:text-[#9a928c] transition-[box-shadow,border-color] focus:border-[#c4b8a4] focus:outline-none focus:ring-2 focus:ring-[#c4b8a4]/25';
const budgetModalPaperShell =
  'border border-[#e8dfd0] bg-[#faf6ed] shadow-[0_16px_48px_-20px_rgba(40,30,20,0.14),0_4px_16px_-8px_rgba(40,30,20,0.08)]';
const budgetModalPaperFooter = 'border-t border-[#e8dfd0] bg-[#f5efe0]';

/** Nome do cliente no cabeçalho do modal de veículo — caixa com fundo cinza. */
const vehicleModalCustomerNameBox =
  'rounded-[18px] border border-zinc-300/80 bg-zinc-200/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] dark:border-zinc-600/50 dark:bg-zinc-800/85 dark:shadow-none';

/** Sombra nos glifos do nome do veículo — text-shadow segue o formato das letras (não retângulo como drop-shadow). */
const vehicleModalTitleShadow =
  '[text-shadow:0_1px_1px_rgba(0,0,0,0.2),0_2px_6px_rgba(0,0,0,0.14),0_4px_18px_rgba(0,0,0,0.08)] dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.92),0_2px_10px_rgba(0,0,0,0.52),0_0_26px_rgba(0,0,0,0.35)]';

/** Igual à do modal, porém mais suave nos cards do pátio (opacidades menores). */
const vehicleCardTitleShadow =
  '[text-shadow:0_1px_1px_rgba(0,0,0,0.11),0_2px_6px_rgba(0,0,0,0.07),0_4px_18px_rgba(0,0,0,0.045)] dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.58),0_2px_10px_rgba(0,0,0,0.32),0_0_26px_rgba(0,0,0,0.2)]';

/** Mesma ideia em texto menor (modais etapa/categoria etc.). */
const vehicleModalSubtitleNameShadow =
  '[text-shadow:0_1px_1px_rgba(0,0,0,0.18),0_1px_6px_rgba(0,0,0,0.1)] dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.88),0_1px_10px_rgba(0,0,0,0.42)]';

/** Botão principal de criar/salvar orçamento — cinza no modo claro; papel amarelado no escuro. */
const budgetModalCreateBudgetButton =
  'rounded-2xl border border-zinc-300 bg-zinc-100 text-[15px] font-semibold text-zinc-900 shadow-sm transition-[transform,background-color,border-color,opacity] hover:bg-zinc-200 hover:border-zinc-400 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 dark:border-[#e8dfd0] dark:bg-[#fffef8] dark:text-[#2d2820] dark:shadow-[0_4px_18px_-6px_rgba(0,0,0,0.35)] dark:hover:bg-[#faf6ed] dark:hover:border-[#dcd2c4]';

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
  /** Após carregar orçamentos, abre o modal de leitura deste id (ex.: assistente Zaya). */
  openBudgetIdAfterLoad?: string | null;
  /** Chamado após abrir o modal e rolar à seção (para limpar o estado de navegação no pai). */
  onOpenServiceOrderHandled?: () => void;
  /** Quem está agindo (admin vs técnico) para as notificações: admin só recebe de técnicos, técnicos só de admin. */
  actorOptions?: ServiceOrderUpdateActor;
  /** Modo cinematográfico: embaçar placas em todo o app (para gravar tela / redes sociais). */
  blurPlates?: boolean;
  /** Ao mudar este número, abre o modal de Histórico automaticamente. */
  openHistoryRequested?: number;
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
    /** Aprovar/reprovar serviços e peças no orçamento (modal de aprovação). */
    canApproveBudgetItems?: boolean;
    canAddComments?: boolean;
    canArchiveCard?: boolean;
  };
}

const BACKEND_LISTS: BoardList[] = SERVICE_ORDER_STAGES.map((s) => ({
  id: s.id,
  name: s.name,
  pos: s.pos,
}));

function capitalizeFirst(str: string): string {
  if (!str || !str.trim()) return str;
  return str.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

/** Retorna apenas os dois primeiros nomes do cliente (ex.: "João Silva" a partir de "João Silva Santos"). */
function firstTwoNames(fullName: string): string {
  if (!fullName || !fullName.trim()) return fullName;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return fullName.trim();
  return parts.slice(0, 2).join(' ');
}

/** Nome amigável do anexo (remove prefixo numérico do storage e extensão só na interface). */
function attachmentDisplayName(fileName: string): string {
  const base = fileName.split("/").pop() || fileName;
  const cleaned = base.replace(/^\d+_/, "");
  const withoutExt = cleaned.replace(/\.(jpe?g|png|gif|webp|pdf|heic|heif|bmp)$/i, "");
  const out = (withoutExt || cleaned).trim();
  return out || cleaned || base;
}

/** PDF por mime ou por extensão na URL (inclui `arquivo.pdf?token=…`). */
function isPdfAttachment(mimeType: string | undefined, url: string): boolean {
  if (mimeType === 'application/pdf') return true;
  return /\.pdf(\?|#|$)/i.test(url);
}

/** Remove texto legado "Categoria do veículo: ..." do início da queixa (antes era salvo junto). */
function stripLegacyVehicleCategoryFromComplaint(text: string | null | undefined): string {
  if (!text) return "";
  const lines = text.split("\n");
  const first = lines[0]?.trim() ?? "";
  if (first.startsWith("Categoria do veículo:")) {
    const rest = lines.slice(1);
    while (rest.length && rest[0].trim() === "") rest.shift();
    return rest.join("\n").trim();
  }
  return text;
}

/** Lê categoria legada só do texto da queixa (OS antigas). */
function parseLegacyVehicleCategoryFromIssue(issue: string | null | undefined): string | null {
  if (!issue) return null;
  const line = issue.split("\n")[0]?.trim() ?? "";
  const prefix = "Categoria do veículo:";
  if (!line.startsWith(prefix)) return null;
  const cat = line.slice(prefix.length).trim();
  return cat || null;
}

function resolveVehicleCategoryLabel(
  dbCategory: string | null | undefined,
  issue: string | null | undefined
): string | null {
  const c = (dbCategory ?? "").trim();
  if (c) return c;
  return parseLegacyVehicleCategoryFromIssue(issue);
}

/** Delimitador do título: "modelo - placa - cliente". Não usar só "-" para não quebrar modelos como HR-V. */
const PATIO_CARD_TITLE_SEP = ' - ';

function parsePatioCardTitle(name: string): { vehicle: string; plateOrModule: string; customer: string } {
  const parts = name.split(PATIO_CARD_TITLE_SEP).map((s) => s.trim());
  if (parts.length === 0) return { vehicle: name.trim(), plateOrModule: '', customer: '' };
  if (parts.length === 1) return { vehicle: parts[0] ?? '', plateOrModule: '', customer: '' };
  if (parts.length === 2) return { vehicle: parts[0] ?? '', plateOrModule: parts[1] ?? '', customer: '' };
  return {
    vehicle: parts[0] ?? '',
    plateOrModule: parts[1] ?? '',
    customer: parts.slice(2).join(PATIO_CARD_TITLE_SEP),
  };
}

/** Mesmo critério da Recepção — comparação de placa Mercosul / antiga. */
function normalizePatioPlate(raw: string): string {
  return String(raw ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8);
}

/** Mesmas opções da Recepção — categoria do veículo. */
const VEHICLE_CATEGORIES_MODAL = ['Compacto', 'Médio/SUV', 'Pick-Up', 'Premium'] as const;

function buildTechnicianNameMap(technicians: SystemUserTechnician[]): Record<string, string> {
  const map: Record<string, string> = {};
  technicians.forEach((t) => {
    map[t.id] = (t.display_name || t.username || '').trim() || t.username;
  });
  return map;
}

function serviceOrderDetailToListItem(detail: ServiceOrderDetail): ServiceOrderListItem {
  const d = detail as ServiceOrderDetail & {
    assigned_technician?: string | null;
    garantia_tag?: boolean;
  };
  return {
    id: detail.id,
    os_number: detail.os_number,
    customer_id: detail.customer_id,
    vehicle_model: detail.vehicle_model,
    module_identification: detail.module_identification,
    plate: detail.plate,
    mileage_km: detail.mileage_km,
    delivery_date: detail.delivery_date,
    issue_description: detail.issue_description,
    ai_analysis: detail.ai_analysis,
    status: detail.status as ServiceOrderStatus,
    assigned_technician: d.assigned_technician ?? null,
    garantia_tag: d.garantia_tag,
    order_type: detail.order_type,
    vehicle_category: detail.vehicle_category,
    vehicle_brand: detail.vehicle_brand ?? null,
    vehicle_color: detail.vehicle_color ?? null,
    vehicle_year: detail.vehicle_year ?? null,
    vehicle_engine_info: detail.vehicle_engine_info ?? null,
    reference_links: parseReferenceLinksFromApi(detail.reference_links),
    created_at: detail.created_at,
    updated_at: detail.updated_at,
    customers: detail.customers
      ? { id: detail.customers.id, name: detail.customers.name, phone: detail.customers.phone }
      : null,
    customer_name: detail.customers?.name ?? null,
  };
}

function orderToCard(o: ServiceOrderListItem, technicianNameMap?: Record<string, string>, orderType: ServiceOrderType = 'vehicle'): TrelloCard {
  const clientName = (o.customer_name ?? o.customers?.name ?? '').trim() || 'Cliente';
  const name = orderType === 'module'
    ? `${o.vehicle_model || '—'}${PATIO_CARD_TITLE_SEP}${o.module_identification || '—'}${PATIO_CARD_TITLE_SEP}${clientName}`
    : `${o.vehicle_model || 'Veículo'}${PATIO_CARD_TITLE_SEP}${(o.plate || '---').toUpperCase()}${PATIO_CARD_TITLE_SEP}${clientName}`;
  const techId = o.assigned_technician ?? null;
  const nameMap = technicianNameMap ?? {};
  const techName = techId ? (nameMap[techId] ?? techId) : null;
  return {
    id: o.id,
    name,
    osNumber: o.os_number ?? null,
    desc: stripLegacyVehicleCategoryFromComplaint(o.issue_description || ''),
    vehicleCategory:
      orderType === "vehicle"
        ? resolveVehicleCategoryLabel(o.vehicle_category ?? null, o.issue_description ?? null)
        : null,
    vehicleBrand: o.vehicle_brand ?? null,
    idList: o.status,
    url: '',
    dateLastActivity: o.updated_at,
    pos: 0,
    members: techName ? [{ id: techId!, fullName: capitalizeFirst(techName), username: '' }] : [],
    checklists: [],
    garantiaTag: o.garantia_tag === true,
    mileageKm: o.mileage_km ?? null,
    deliveryDate: o.delivery_date ?? null,
    vehicleColor: o.vehicle_color ?? null,
    vehicleYear: o.vehicle_year ?? null,
    vehicleEngineInfo: o.vehicle_engine_info ?? null,
    referenceLinks: parseReferenceLinksFromApi(o.reference_links),
  };
}

/** Lista de arquivados: mais recentemente atualizado (arquivado) primeiro. */
function sortArchivedOrdersNewestFirst(orders: ServiceOrderListItem[]): ServiceOrderListItem[] {
  return [...orders].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

// Interfaces separadas para Serviços (só descrição) e Peças (descrição + quantidade)
interface BudgetServiceItem {
  id: string;
  description: string;
  /** Horas de mão de obra (lista da oficina), exibidas no orçamento */
  laborHours: number | null;
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
  services: { description: string; approved?: boolean; labor_hours?: number | null }[];
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (images.length <= 1) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex((i) => (i > 0 ? i - 1 : i));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIndex((i) => (i < images.length - 1 ? i + 1 : i));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [images.length, onClose]);

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

  const handleTouchEnd = (e: React.TouchEvent) => {
    const endTouch = e.changedTouches[0];
    const endX = endTouch?.clientX ?? lastTouchRef.current?.x ?? dragStartXRef.current;
    if (scale > 1) {
      setIsDragging(false);
    } else if (hasMultiple) {
      const deltaX = endX - dragStartXRef.current;
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
    <ModalPortal>
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-modal-backdrop overflow-hidden overscroll-contain"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={hasMultiple ? 'Galeria de fotos — use as setas ou deslize para trocar' : 'Visualização de foto'}
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
        onTouchCancel={handleTouchEnd}
      >
        <img
          ref={imageRef}
          src={src}
          alt="Preview"
          decoding="async"
          loading="eager"
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
        <>
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
            {images.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${i === currentIndex ? "bg-brand-yellow" : "bg-zinc-500/60"}`}
              />
            ))}
          </div>
          <p className="pointer-events-none absolute bottom-4 left-1/2 max-w-[min(90vw,20rem)] -translate-x-1/2 text-center text-[11px] font-medium leading-snug text-zinc-400">
            Setas ← → no teclado ou deslize o dedo para o lado
          </p>
        </>
      )}
      {!hasMultiple && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-black/50 px-4 py-2 rounded-full text-zinc-400 text-xs pointer-events-none backdrop-blur-md border border-white/10">
          Toque duplo para zoom ou use pinça
        </div>
      )}
    </div>
    </ModalPortal>
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

/** Miniatura Mercosul — proporção ~400×130 mm (placa traseira veículo). Fonte condensada próxima ao visual de placagem. */
type MercosulPlateMockupSize = 'card' | 'cardCompact' | 'modal';

function MercosulPlateMockup(props: {
  plate: string;
  blurPlates?: boolean;
  size: MercosulPlateMockupSize;
  selectable?: boolean;
}) {
  const { plate, blurPlates = false, size, selectable = false } = props;
  const display = (plate || '—').trim() || '—';

  /** Mesmo visual dos modais: cartão normal e lista de histórico usam este bloco (`card` === `modal`). */
  const isCompact = size === 'cardCompact';

  const w = isCompact ? 'w-[88px]' : 'w-[136px]';

  const shadow = isCompact ? 'shadow-md shadow-black/15' : 'shadow-xl shadow-black/25';

  const bandText = isCompact ? 'text-[4.5px]' : 'text-[8px]';

  const flagW = isCompact ? 8 : 14;
  const flagH = isCompact ? 6 : 9;

  const plateText = isCompact
    ? 'text-[16px] sm:text-[17px]'
    : 'text-[28px] sm:text-[31px]';

  return (
    <div
      className={`${w} aspect-[400/130] grid grid-rows-[20%_80%] overflow-hidden rounded-[7px] border-[2px] border-black bg-white ${shadow} ${selectable ? 'select-text' : 'select-none'} sm:rounded-[9px]`}
      aria-hidden
    >
      <div
        className={`flex min-h-0 items-center justify-between gap-1 bg-[#003399] ${isCompact ? 'px-1.5' : 'px-2 sm:px-3'}`}
      >
        <span className={`font-semibold uppercase leading-none tracking-wide text-white ${bandText}`}>BRASIL</span>
        <BrazilFlagIcon width={flagW} height={flagH} className="shrink-0 rounded-sm border border-white/35" />
      </div>
      <div className={`flex min-h-0 items-center justify-center bg-white ${isCompact ? 'px-1' : 'px-1.5 sm:px-2'}`}>
        <span
          className={`font-plate max-w-[100%] text-center font-extrabold uppercase leading-[0.95] tracking-[0.06em] text-black antialiased ${plateText} ${blurPlates ? 'blur-plate' : ''}`}
        >
          {display.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

const VEHICLE_MODAL_PHOTOS_BATCH = 8;

export const PatioView: React.FC<PatioViewProps> = ({
  onUseCustomerData,
  effectsEnabled = true,
  commentAuthorName = 'Rei do ABS',
  openServiceOrderId: openServiceOrderIdProp,
  openServiceOrderSection,
  openBudgetIdAfterLoad = null,
  onOpenServiceOrderHandled,
  actorOptions,
  blurPlates = false,
  openHistoryRequested,
  orderType = 'vehicle',
  patioPermissions,
}) => {
  /** Admin: sem patioPermissions = tudo permitido. Usuário do sistema: só o que for explicitamente true. */
  const can = (key: keyof NonNullable<PatioViewProps['patioPermissions']>) =>
    patioPermissions === undefined ? true : patioPermissions[key] === true;
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [cards, setCards] = useState<TrelloCard[]>([]);
  const commentsSectionRef = useRef<HTMLDivElement>(null);
  const commentsListRef = useRef<HTMLDivElement>(null);
  const customerDataSectionRef = useRef<HTMLDivElement>(null);
  const customerNameInputRef = useRef<HTMLInputElement>(null);
  const descriptionSectionRef = useRef<HTMLDivElement>(null);
  const budgetsSectionRef = useRef<HTMLDivElement>(null);
  const openServiceOrderHandledRef = useRef(false);
  /** OS id: após mover para "Orçamento aprovado", abre o modal de aprovação quando os orçamentos terminarem de carregar. */
  const pendingBudgetApprovalAfterModalLoadRef = useRef<string | null>(null);
  const [allMembers, setAllMembers] = useState<TrelloMember[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Card em Visualização DETALHADA (Full Screen Modal)
  const [selectedCard, setSelectedCard] = useState<TrelloCard | null>(null);
  const [serviceOrderDetail, setServiceOrderDetail] = useState<ServiceOrderDetail | null>(null);
  const [cardDetails, setCardDetails] = useState<{ actions: TrelloAction[], attachments: TrelloAttachment[] } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [editFichaSaving, setEditFichaSaving] = useState(false);
  const [referenceLinksDraft, setReferenceLinksDraft] = useState<VehicleReferenceLink[]>([]);
  const [referenceLinksSaving, setReferenceLinksSaving] = useState(false);
  /** Seção "Dados da ficha" no modal: começa minimizada. */
  const [isDadosFichaExpanded, setIsDadosFichaExpanded] = useState(false);
  /** Portabilidade Pátio ↔ Laboratório: em progresso */
  const [isConvertingType, setIsConvertingType] = useState(false);

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
      vehicleBrand: serviceOrderDetail.vehicle_brand ?? '',
      moduleIdentification: serviceOrderDetail.module_identification ?? '',
      plate: (serviceOrderDetail.plate ?? '').toUpperCase(),
      mileageKm: serviceOrderDetail.mileage_km ?? '',
      vehicleColor: serviceOrderDetail.vehicle_color ?? '',
      vehicleYear: serviceOrderDetail.vehicle_year ?? '',
      vehicleEngineInfo: serviceOrderDetail.vehicle_engine_info ?? '',
    });
  }, [isDadosFichaExpanded, serviceOrderDetail]);

  const [editFichaForm, setEditFichaForm] = useState<{
    name: string; cpf: string; phone: string; email: string; cep: string; address: string; addressNumber: string;
    vehicleModel: string; vehicleBrand: string; moduleIdentification: string; plate: string; mileageKm: string;
    vehicleColor: string; vehicleYear: string; vehicleEngineInfo: string;
  }>({
    name: '',
    cpf: '',
    phone: '',
    email: '',
    cep: '',
    address: '',
    addressNumber: '',
    vehicleModel: '',
    vehicleBrand: '',
    moduleIdentification: '',
    plate: '',
    mileageKm: '',
    vehicleColor: '',
    vehicleYear: '',
    vehicleEngineInfo: '',
  });
  const [editFichaPlateLookupLoading, setEditFichaPlateLookupLoading] = useState(false);
  const [editFichaPlateLookupError, setEditFichaPlateLookupError] = useState<string | null>(null);
  const lastEditFichaPlateFetchedRef = useRef<string | null>(null);
  const [focusCustomerNameAfterExpand, setFocusCustomerNameAfterExpand] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  // Estados para Edição de Comentário
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const handleJumpToCustomerNameEdit = () => {
    setIsDadosFichaExpanded(true);
    setFocusCustomerNameAfterExpand(true);
    customerDataSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Estados para Edição da DESCRIÇÃO (Ficha Técnica)
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descText, setDescText] = useState('');
  const [isSavingDesc, setIsSavingDesc] = useState(false);
  const isEditingDescRef = useRef(false);
  const selectedCardRef = useRef<TrelloCard | null>(null);
  isEditingDescRef.current = isEditingDesc;
  selectedCardRef.current = selectedCard;

  // Visualização de Imagem (Lightbox) — lista de URLs e índice para navegar entre fotos
  const [previewImages, setPreviewImages] = useState<{ urls: string[]; currentIndex: number } | null>(null);
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null);
  const [renameAttachmentId, setRenameAttachmentId] = useState<string | null>(null);
  const [renameAttachmentNewName, setRenameAttachmentNewName] = useState('');
  const [renamingAttachmentId, setRenamingAttachmentId] = useState<string | null>(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [vehicleModalPhotoVisibleCount, setVehicleModalPhotoVisibleCount] = useState(VEHICLE_MODAL_PHOTOS_BATCH);

  useEffect(() => {
    setVehicleModalPhotoVisibleCount(VEHICLE_MODAL_PHOTOS_BATCH);
  }, [selectedCard?.id]);

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
  const viewingBudgetApprovalContrast = useMemo(
    () =>
      viewingBudget != null &&
      budgetHasExplicitApprovalDecisions(viewingBudget.services, viewingBudget.parts),
    [viewingBudget]
  );
  const [workshopServices, setWorkshopServices] = useState<WorkshopService[]>([]);
  const [workshopParts, setWorkshopParts] = useState<WorkshopPart[]>([]);
  const [systemTechnicians, setSystemTechnicians] = useState<SystemUserTechnician[]>([]);
  const [isServiceListOpen, setIsServiceListOpen] = useState(false);
  const [suggestionsForServiceId, setSuggestionsForServiceId] = useState<string | null>(null);
  const [suggestionsForPartId, setSuggestionsForPartId] = useState<string | null>(null);
  const suggestionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partSuggestionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedServiceInputRef = useRef<HTMLDivElement>(null);
  const focusedPartInputRef = useRef<HTMLDivElement>(null);
  const [suggestionBoxPosition, setSuggestionBoxPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [partSuggestionBoxPosition, setPartSuggestionBoxPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  // Card em transição de COLUNA (Status)
  const [cardInTransition, setCardInTransition] = useState<BoardCard | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [isVehicleCategoryModalOpen, setIsVehicleCategoryModalOpen] = useState(false);
  const [savingVehicleCategory, setSavingVehicleCategory] = useState(false);

  // Card em transição de MEMBRO (Mecânico)
  const [cardForMemberAssignment, setCardForMemberAssignment] = useState<BoardCard | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  // Checklists do Pátio (templates criados pelo admin)
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([]);
  const [activeChecklistCardId, setActiveChecklistCardId] = useState<string | null>(null);
  const [activeChecklistTemplateId, setActiveChecklistTemplateId] = useState<string | null>(null);
  /** Estado dos itens (template_item_id -> complete|incomplete) para o card do modal de checklist */
  const [checklistState, setChecklistState] = useState<Record<string, 'complete' | 'incomplete'>>({});
  const [checklistStateLoading, setChecklistStateLoading] = useState(false);

  // Estado para arquivamento (Entregue)
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [removingGarantiaId, setRemovingGarantiaId] = useState<string | null>(null);

  // Estados para HISTÓRICO (Search & Use)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historySearchPlate, setHistorySearchPlate] = useState('');
  const historySearchPlateRef = useRef(historySearchPlate);
  historySearchPlateRef.current = historySearchPlate;
  const [archivedCards, setArchivedCards] = useState<TrelloCard[]>([]);
  /** Últimos veículos arquivados (carregados ao abrir o modal); usados quando a busca não retorna resultados. */
  const [recentArchivedCards, setRecentArchivedCards] = useState<TrelloCard[]>([]);
  const [historyShowingFallback, setHistoryShowingFallback] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedHistoryCard, setSelectedHistoryCard] = useState<BoardCard | null>(null);
  const [loadingHistoryDetails, setLoadingHistoryDetails] = useState(false);
  const [historyCardDetails, setHistoryCardDetails] = useState<{ actions: BoardAction[], attachments: BoardAttachment[] } | null>(null);
  const [historyServiceOrderDetail, setHistoryServiceOrderDetail] = useState<ServiceOrderDetail | null>(null);
  const [historySavedBudgets, setHistorySavedBudgets] = useState<SavedBudget[]>([]);
  const selectedHistoryCardRef = useRef<BoardCard | null>(null);
  selectedHistoryCardRef.current = selectedHistoryCard;

  // Lembretes do Pátio/Laboratório — persistidos na API (Supabase), visíveis para toda a oficina
  type Reminder = { id: string; text: string; createdAt: string; done: boolean; createdBy?: string };
  const [isRemindersOpen, setIsRemindersOpen] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [reminderSubmitting, setReminderSubmitting] = useState(false);
  const [reminderSaveError, setReminderSaveError] = useState<string | null>(null);
  const [newReminder, setNewReminder] = useState('');
  const remindersStorageKey = orderType === 'module' ? 'patio-reminders-module' : 'patio-reminders-vehicle';
  const isModuleMode = orderType === 'module';
  const remindersScopeApi = orderType === 'module' ? ('module' as const) : ('vehicle' as const);
  const remindersBadgeCount = reminders.length;

  /** Visão panorâmica: cartões menores para caber mais na tela (Pátio / Laboratório independentes). */
  const boardPanoramicStorageKey = isModuleMode ? 'patio-board-panoramic-module' : 'patio-board-panoramic-vehicle';
  const [boardPanoramic, setBoardPanoramic] = useState(false);
  useEffect(() => {
    try {
      setBoardPanoramic(localStorage.getItem(boardPanoramicStorageKey) === '1');
    } catch {
      setBoardPanoramic(false);
    }
  }, [boardPanoramicStorageKey]);

  const selectedCardTitleParts = selectedCard ? parsePatioCardTitle(selectedCard.name) : null;
  const historyCardTitleParts = selectedHistoryCard ? parsePatioCardTitle(selectedHistoryCard.name) : null;
  const cardInTransitionTitleParts = cardInTransition ? parsePatioCardTitle(cardInTransition.name) : null;

  // Gesto voltar nativo (Android/iOS): fecha primeiro os modais de veículo/histórico.
  useEffect(() => {
    if (!selectedCard && !selectedHistoryCard) return;
    const onPopState = () => {
      const w = window as Window & { __rdaModalBackHandledAt?: number };
      w.__rdaModalBackHandledAt = Date.now();
      if (selectedCard) setSelectedCard(null);
      if (selectedHistoryCard) setSelectedHistoryCard(null);
      setViewingBudget(null);
      setBudgetApprovalTarget(null);
      setIsBudgetOpen(false);
      setIsVehicleEditOpen(false);
      setIsDeleteVehicleOpen(false);
      setIsVehicleCategoryModalOpen(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [selectedCard, selectedHistoryCard]);

  const fetchReminders = useCallback(async () => {
    setRemindersLoading(true);
    try {
      const rows = await getWorkshopReminders(remindersScopeApi);
      setReminders(
        rows.map((r) => ({
          id: r.id,
          text: r.text,
          createdAt: r.createdAt,
          done: r.done,
          createdBy: r.createdBy || commentAuthorName || (isModuleMode ? 'Laboratório' : 'Pátio'),
        }))
      );
    } catch {
      // mantém lista anterior em falha de rede
    } finally {
      setRemindersLoading(false);
    }
  }, [remindersScopeApi, commentAuthorName, isModuleMode]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchReminders();
    }, 12000);
    return () => window.clearInterval(id);
  }, [fetchReminders]);

  useEffect(() => {
    if (isRemindersOpen) fetchReminders();
  }, [isRemindersOpen, fetchReminders]);

  /** Migra lembretes antigos do localStorage para a API (uma vez por chave). */
  useEffect(() => {
    const flag = `workshop-reminders-migrated-${remindersStorageKey}`;
    const lockKey = `workshop-reminders-migrate-lock-${remindersStorageKey}`;
    const run = async () => {
      if (typeof localStorage === 'undefined') return;
      if (localStorage.getItem(flag)) return;
      try {
        const server = await getWorkshopReminders(remindersScopeApi);
        const raw = localStorage.getItem(remindersStorageKey);
        if (server.length > 0) {
          if (raw) localStorage.removeItem(remindersStorageKey);
          localStorage.setItem(flag, '1');
          return;
        }
        if (!raw) {
          localStorage.setItem(flag, '1');
          return;
        }
        const parsed = JSON.parse(raw) as Reminder[];
        if (!Array.isArray(parsed) || parsed.length === 0) {
          localStorage.setItem(flag, '1');
          return;
        }
        if (localStorage.getItem(lockKey)) return;
        localStorage.setItem(lockKey, '1');
        try {
          for (const r of parsed) {
            if (!r.text?.trim()) continue;
            const created = await createWorkshopReminder({
              scope: remindersScopeApi,
              text: r.text.trim(),
              createdBy: r.createdBy || commentAuthorName || 'Importado',
            });
            if (r.done) {
              await updateWorkshopReminderRemote(created.id, { scope: remindersScopeApi, done: true });
            }
          }
          localStorage.removeItem(remindersStorageKey);
          localStorage.setItem(flag, '1');
          await fetchReminders();
        } finally {
          localStorage.removeItem(lockKey);
        }
      } catch {
        // tenta de novo em outro carregamento se falhar
      }
    };
    run();
  }, [remindersStorageKey, remindersScopeApi, commentAuthorName, fetchReminders]);

  /** Sincroniza quando a Zaya ou outra aba atualiza lembretes via API. */
  useEffect(() => {
    const onSync = (e: Event) => {
      const ce = e as CustomEvent<{ scope?: string }>;
      const scope = ce.detail?.scope;
      const mine: 'patio' | 'laboratorio' = orderType === 'module' ? 'laboratorio' : 'patio';
      if (scope && scope !== mine) return;
      fetchReminders();
    };
    window.addEventListener('workshop-reminders-updated', onSync);
    return () => window.removeEventListener('workshop-reminders-updated', onSync);
  }, [fetchReminders, orderType]);

  const syncOpenVehicleModalFromServer = React.useCallback(async () => {
    const id = selectedCardRef.current?.id;
    if (!id) return;
    try {
      const [order, photos, budgets, comments] = await Promise.all([
        getServiceOrderById(id),
        getServiceOrderPhotos(id),
        getServiceOrderBudgets(id),
        getServiceOrderComments(id),
      ]);
      setServiceOrderDetail(order);
      const listItem = serviceOrderDetailToListItem(order);
      const nameMap = buildTechnicianNameMap(systemTechnicians);
      const freshCard = orderToCard(listItem, nameMap, orderType);
      setSelectedCard((prev) => (prev?.id === id ? freshCard : prev));
      setCards((prev) => prev.map((c) => (c.id === id ? freshCard : c)));
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
      setViewingBudget((prev) => {
        if (!prev) return null;
        const next = budgets.find((b) => b.id === prev.id);
        return next ?? null;
      });
      setBudgetApprovalTarget((prev) => {
        if (!prev) return null;
        const next = budgets.find((b) => b.id === prev.id);
        return next ?? null;
      });
      if (!isEditingDescRef.current) {
        setDescText(stripLegacyVehicleCategoryFromComplaint(order.issue_description || ""));
      }
      void fetchReminders();
    } catch (e) {
      console.error("syncOpenVehicleModalFromServer", e);
    }
  }, [orderType, systemTechnicians, fetchReminders]);

  useServiceOrderLiveSync(selectedCard?.id ?? null, syncOpenVehicleModalFromServer, {
    enabled: !!selectedCard,
  });

  const syncHistoryDetailFromServer = React.useCallback(async () => {
    const card = selectedHistoryCardRef.current;
    if (!card?.id) return;
    try {
      const [order, photos, comments, budgets] = await Promise.all([
        getServiceOrderById(card.id),
        getServiceOrderPhotos(card.id),
        getServiceOrderComments(card.id),
        getServiceOrderBudgets(card.id),
      ]);
      setHistoryServiceOrderDetail(order);
      setHistorySavedBudgets(budgets);
      setHistoryCardDetails({
        actions: (comments ?? []).map(commentToAction),
        attachments: photos.map((p, i) => {
          const mime = attachmentMimeType(p.name);
          const isPdf = mime === 'application/pdf' || p.url.toLowerCase().endsWith('.pdf');
          return {
            id: p.path || String(i),
            name: p.name,
            url: p.url,
            mimeType: mime,
            previews: isPdf ? [] : [{ url: p.url, width: 200, height: 200 }],
          };
        }),
      });
    } catch (e) {
      console.error('syncHistoryDetailFromServer', e);
    }
  }, []);

  useServiceOrderLiveSync(
    selectedHistoryCard && isHistoryOpen ? selectedHistoryCard.id : null,
    syncHistoryDetailFromServer,
    { enabled: !!selectedHistoryCard && isHistoryOpen }
  );

  // --- Attachment States ---
  const [isUploading, setIsUploading] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  /** Input para "Foto do veículo" (mesmo comportamento da recepção: câmera ou galeria). */
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Camera State
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  /** Nome opcional ao enviar foto tirada na câmera (modal de prévia). */
  const [photoUploadLabel, setPhotoUploadLabel] = useState("");
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

  /** Busca por placa no Pátio (cards ativos) + consulta PlacaFipe se não houver OS local. */
  const [patioPlateSearchInput, setPatioPlateSearchInput] = useState('');
  const [patioPlateSearchLoading, setPatioPlateSearchLoading] = useState(false);
  const [patioPlateSearchMessage, setPatioPlateSearchMessage] = useState<string | null>(null);
  const [patioPlateSearchInPatioCards, setPatioPlateSearchInPatioCards] = useState<TrelloCard[]>([]);
  const [patioPlateSearchApiInfo, setPatioPlateSearchApiInfo] = useState<PlacaFipeLookupResult | null>(null);
  const [isPatioPlateSearchModalOpen, setIsPatioPlateSearchModalOpen] = useState(false);
  const patioPlateSearchInputRef = useRef<HTMLInputElement>(null);

  const closePatioPlateSearchModal = useCallback(() => {
    setIsPatioPlateSearchModalOpen(false);
    setPatioPlateSearchMessage(null);
    setPatioPlateSearchInPatioCards([]);
    setPatioPlateSearchApiInfo(null);
    setPatioPlateSearchLoading(false);
  }, []);

  // Efeito "folha boiando na água" nos cards do pátio (hover 3D)
  const [cardFloat, setCardFloat] = useState<{ id: string; rotateX: number; rotateY: number } | null>(null);
  // Desativa o efeito 3D quando o mouse está sobre o conteúdo (botões), evitando cliques perdidos
  const [interactingCardId, setInteractingCardId] = useState<string | null>(null);
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

  const handlePatioPlateSearch = useCallback(async () => {
    if (isModuleMode) return;
    const norm = normalizePatioPlate(patioPlateSearchInput);
    setPatioPlateSearchApiInfo(null);
    setPatioPlateSearchInPatioCards([]);
    if (norm.length < 7) {
      setPatioPlateSearchMessage('Informe a placa completa (mín. 7 caracteres).');
      return;
    }
    setPatioPlateSearchLoading(true);
    setPatioPlateSearchMessage(null);
    try {
      const matches = cards.filter((c) => {
        const parts = parsePatioCardTitle(c.name);
        return normalizePatioPlate(parts.plateOrModule || '') === norm;
      });
      if (matches.length > 0) {
        setPatioPlateSearchInPatioCards(matches);
        setPatioPlateSearchMessage(
          matches.length === 1
            ? 'Este veículo já está cadastrado no Pátio.'
            : `Existem ${matches.length} ordens ativas com esta placa no Pátio.`
        );
        return;
      }
      const api = await consultPlacaFipe(norm);
      setPatioPlateSearchApiInfo(api);
      setPatioPlateSearchMessage(null);
    } catch (e) {
      setPatioPlateSearchMessage(e instanceof Error ? e.message : 'Erro ao consultar a placa.');
    } finally {
      setPatioPlateSearchLoading(false);
    }
  }, [cards, isModuleMode, patioPlateSearchInput]);

  useEffect(() => {
    if (!isPatioPlateSearchModalOpen) return;
    const id = window.requestAnimationFrame(() => patioPlateSearchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [isPatioPlateSearchModalOpen]);

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

  // Abrir modal do veículo ao clicar em notificação (navegação da central de notificações / assistente Zaya)
  useEffect(() => {
    if (!openServiceOrderIdProp || openServiceOrderHandledRef.current) return;
    if (cards.length === 0) return;
    const card = cards.find((c) => c.id === openServiceOrderIdProp);
    if (card) {
      setSelectedCard(card);
      // Sem seção para rolar: libera o pedido já (senão o id fica preso no pai e cada refresh da lista reabre o modal).
      if (!openServiceOrderSection) {
        openServiceOrderHandledRef.current = true;
        onOpenServiceOrderHandled?.();
      }
    } else {
      openServiceOrderHandledRef.current = true;
      onOpenServiceOrderHandled?.();
    }
  }, [openServiceOrderIdProp, cards, onOpenServiceOrderHandled, openServiceOrderSection]);

  // Rolar à seção (comentários, orçamentos, queixa) após abrir o modal e carregar detalhes
  useEffect(() => {
    if (!selectedCard || !openServiceOrderSection || selectedCard.id !== openServiceOrderIdProp) return;
    if (openServiceOrderHandledRef.current) return;
    const scrollToSection = () => {
      const ref = openServiceOrderSection === 'comments' ? commentsSectionRef : openServiceOrderSection === 'budgets' ? budgetsSectionRef : descriptionSectionRef;
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (openServiceOrderSection === 'budgets' && openBudgetIdAfterLoad) {
        return;
      }
      openServiceOrderHandledRef.current = true;
      onOpenServiceOrderHandled?.();
    };
    if (openServiceOrderSection === 'comments' || openServiceOrderSection === 'budgets') {
      if (!loadingDetails) setTimeout(scrollToSection, 150);
    } else {
      setTimeout(scrollToSection, 300);
    }
  }, [selectedCard?.id, openServiceOrderSection, openServiceOrderIdProp, loadingDetails, onOpenServiceOrderHandled, openBudgetIdAfterLoad]);

  useEffect(() => {
    if (!openBudgetIdAfterLoad || !selectedCard || loadingDetails) return;
    if (selectedCard.id !== openServiceOrderIdProp) return;
    const b = savedBudgets.find((x) => x.id === openBudgetIdAfterLoad);
    if (b) {
      setViewingBudget(b);
    }
    openServiceOrderHandledRef.current = true;
    onOpenServiceOrderHandled?.();
  }, [
    openBudgetIdAfterLoad,
    selectedCard?.id,
    savedBudgets,
    loadingDetails,
    openServiceOrderIdProp,
    onOpenServiceOrderHandled,
  ]);

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
          const pendingApprovalId = pendingBudgetApprovalAfterModalLoadRef.current;
          if (pendingApprovalId && pendingApprovalId === order.id) {
            pendingBudgetApprovalAfterModalLoadRef.current = null;
            const stillThisCard = selectedCardRef.current?.id === order.id;
            const canApproveItems =
              patioPermissions === undefined ? true : patioPermissions.canApproveBudgetItems === true;
            if (stillThisCard && canApproveItems && budgets.length > 0) {
              const first = budgets[0];
              const lineCount = first.services.length + first.parts.length;
              if (
                lineCount > 0 &&
                !budgetHasExplicitApprovalDecisions(first.services, first.parts)
              ) {
                setBudgetApprovalTarget(first);
                setApprovalServices(first.services.map((s) => s.approved === true));
                setApprovalParts(first.parts.map((p) => p.approved === true));
              }
            }
          }
        })
        .catch(err => console.error("Erro ao carregar detalhes", err))
        .finally(() => setLoadingDetails(false));
    } else {
      setServiceOrderDetail(null);
      setSavedBudgets([]);
    }
  }, [selectedCard]);

  useEffect(() => {
    if (!serviceOrderDetail) {
      setReferenceLinksDraft([]);
      return;
    }
    setReferenceLinksDraft(parseReferenceLinksFromApi(serviceOrderDetail.reference_links));
  }, [serviceOrderDetail?.id, serviceOrderDetail?.updated_at]);

  useEffect(() => {
    if (!selectedCard) setIsVehicleCategoryModalOpen(false);
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

  // Carregar templates de checklist do Pátio (criados pelo admin)
  useEffect(() => {
    let cancelled = false;
    getChecklistTemplates()
      .then((list) => { if (!cancelled) setChecklistTemplates(list); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Ao abrir o modal de checklist, carregar estado da OS
  useEffect(() => {
    if (!activeChecklistCardId || !activeChecklistTemplateId) {
      setChecklistState({});
      return;
    }
    let cancelled = false;
    setChecklistStateLoading(true);
    getServiceOrderChecklistState(activeChecklistCardId)
      .then((state) => { if (!cancelled) setChecklistState(state); })
      .catch(() => { if (!cancelled) setChecklistState({}); })
      .finally(() => { if (!cancelled) setChecklistStateLoading(false); });
    return () => { cancelled = true; };
  }, [activeChecklistCardId, activeChecklistTemplateId]);

  // Deriva o cartão ativo e o template ativo
  const activeChecklistCard = cards.find(c => c.id === activeChecklistCardId);
  const activeChecklistTemplate = checklistTemplates.find(t => t.id === activeChecklistTemplateId);
  const activeChecklistCardTitleParts = activeChecklistCard
    ? parsePatioCardTitle(activeChecklistCard.name)
    : null;

  /** Carrega os últimos veículos arquivados (sem filtro de busca). */
  const loadRecentArchived = useCallback(async () => {
    setIsLoadingHistory(true);
    setHistoryShowingFallback(false);
    try {
      const orders = await getServiceOrders('CANCELLED', orderType);
      const nameMap = buildTechnicianNameMap(systemTechnicians);
      const list = sortArchivedOrdersNewestFirst(orders).map((o) => orderToCard(o, nameMap, orderType));
      setRecentArchivedCards(list);
      setArchivedCards(list);
    } catch (err) {
      console.error(err);
      setArchivedCards([]);
      alert("Erro ao carregar histórico.");
    } finally {
      setIsLoadingHistory(false);
    }
  }, [orderType, systemTechnicians]);

  const loadRecentArchivedRef = useRef(loadRecentArchived);
  loadRecentArchivedRef.current = loadRecentArchived;

  const handleSearchHistoryRef = useRef<(term?: string) => Promise<void>>(async () => {});

  const handleSearchHistory = async (termToSearch: string = historySearchPlate) => {
    const term = (termToSearch ?? historySearchPlate).trim();
    setIsLoadingHistory(true);
    setHistoryShowingFallback(false);
    try {
      const orders = await getServiceOrders('CANCELLED', orderType);
      const nameMap = buildTechnicianNameMap(systemTechnicians);
      if (!term) {
        const list = sortArchivedOrdersNewestFirst(orders).map((o) => orderToCard(o, nameMap, orderType));
        setRecentArchivedCards(list);
        setArchivedCards(list);
        return;
      }
      const cancelled = orders.filter(
        o =>
          (o.plate && o.plate.toUpperCase().includes(term.toUpperCase())) ||
          (o.customers?.name && o.customers.name.toLowerCase().includes(term.toLowerCase())) ||
          (o.vehicle_model && o.vehicle_model.toLowerCase().includes(term.toLowerCase())) ||
          (o.vehicle_brand && o.vehicle_brand.toLowerCase().includes(term.toLowerCase())) ||
          (o.module_identification && o.module_identification.toLowerCase().includes(term.toLowerCase()))
      );
      const cards = sortArchivedOrdersNewestFirst(cancelled).map((o) => orderToCard(o, nameMap, orderType));
      if (cards.length === 0) {
        const list = sortArchivedOrdersNewestFirst(orders).map((o) => orderToCard(o, nameMap, orderType));
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

  handleSearchHistoryRef.current = handleSearchHistory;

  // Ao abrir o modal de histórico, carregar os últimos veículos arquivados
  useEffect(() => {
    if (!isHistoryOpen) return;
    setHistoryShowingFallback(false);
    void loadRecentArchivedRef.current();
  }, [isHistoryOpen]);

  /** Histórico sem polling automático para não perder posição durante a rolagem. */

  // Abrir histórico quando solicitado pela Recepção
  useEffect(() => {
    if (typeof openHistoryRequested !== 'number') return;
    if (openHistoryRequested <= 0) return;
    setIsHistoryOpen(true);
  }, [openHistoryRequested]);

  const handleOpenHistoryCardDetails = (card: TrelloCard) => {
    setSelectedHistoryCard(card);
    setLoadingHistoryDetails(true);
    setHistoryCardDetails(null);
    setHistoryServiceOrderDetail(null);
    setHistorySavedBudgets([]);
    Promise.all([
      getServiceOrderById(card.id),
      getServiceOrderPhotos(card.id),
      getServiceOrderComments(card.id),
      getServiceOrderBudgets(card.id),
    ])
      .then(([order, photos, comments, budgets]) => {
        setHistoryServiceOrderDetail(order);
        setHistorySavedBudgets(budgets);
        setHistoryCardDetails({
          actions: (comments ?? []).map(commentToAction),
          attachments: photos.map((p, i) => {
            const mime = attachmentMimeType(p.name);
            const isPdf = mime === 'application/pdf' || p.url.toLowerCase().endsWith('.pdf');
            return {
              id: p.path || String(i),
              name: p.name,
              url: p.url,
              mimeType: mime,
              previews: isPdf ? [] : [{ url: p.url, width: 200, height: 200 }],
            };
          }),
        });
      })
      .catch(err => console.error(err))
      .finally(() => setLoadingHistoryDetails(false));
  };

  const handleUseRegistration = async (card: BoardCard) => {
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
        city: c?.city ?? '',
        addressNumber: c?.address_number ?? '',
        vehicleModel: detail.vehicle_model ?? '',
        vehicleBrand: detail.vehicle_brand ?? '',
        moduleIdentification: detail.module_identification ?? undefined,
        plate: (detail.plate || '').toUpperCase(),
        vehicleColor: detail.vehicle_color ?? '',
        vehicleYear: detail.vehicle_year ?? '',
        vehicleEngineInfo: detail.vehicle_engine_info ?? '',
        /** Nova OS: km sempre em branco para informar o valor atual na recepção. */
        mileageKm: '',
        issueDescription: '',
      };
      // Garantir que a Recepção abra já no modo correto (veículo ou módulo)
      try {
        localStorage.setItem('app_reception_mode', isModuleMode ? 'module' : 'vehicle');
      } catch (_) {}
      setSelectedHistoryCard(null);
      setHistoryServiceOrderDetail(null);
      setHistorySavedBudgets([]);
      setIsHistoryOpen(false);
      if (onUseCustomerData) onUseCustomerData(customerData);
    } catch (e: any) {
      alert(e?.message ?? "Erro ao carregar dados.");
    }
  };

  const handleOpenMoveModal = (card: BoardCard, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCardInTransition(card);
  };

  const handleMoveCard = async (newListId: string) => {
    if (!cardInTransition || !newListId) return;
    const cardId = cardInTransition.id;
    setIsMoving(true);
    try {
      await updateServiceOrderStatus(cardId, newListId as ServiceOrderStatus, actorOptions);
      const updatedCard = {
        ...cardInTransition,
        idList: newListId,
        garantiaTag: newListId === 'GARANTIA' || cardInTransition.garantiaTag,
      };
      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId ? { ...c, idList: newListId, garantiaTag: newListId === 'GARANTIA' || c.garantiaTag } : c
        )
      );
      const shouldAutoOpenBudgetApproval =
        newListId === 'ORCAMENTO_APROVADO' && can('canApproveBudgetItems');
      if (shouldAutoOpenBudgetApproval) {
        pendingBudgetApprovalAfterModalLoadRef.current = cardId;
      }
      if (selectedCard?.id === cardId || shouldAutoOpenBudgetApproval) {
        setSelectedCard(updatedCard);
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

  const handleSelectVehicleCategory = async (category: string) => {
    if (!selectedCard) return;
    setSavingVehicleCategory(true);
    try {
      await updateServiceOrderVehicleCategory(selectedCard.id, category, actorOptions);
      const next = { ...selectedCard, vehicleCategory: category };
      setSelectedCard(next);
      setCards((prev) => prev.map((c) => (c.id === selectedCard.id ? next : c)));
      setServiceOrderDetail((prev) => (prev ? { ...prev, vehicle_category: category } : null));
      setIsVehicleCategoryModalOpen(false);
      await refreshModalDetails();
    } catch (err: any) {
      alert(err?.message ?? "Erro ao salvar categoria.");
    } finally {
      setSavingVehicleCategory(false);
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
    const { vehicle, plateOrModule } = parsePatioCardTitle(selectedCard.name);
    setVehicleEditModel(vehicle);
    setVehicleEditPlate(plateOrModule);
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
      const { customer } = parsePatioCardTitle(selectedCard.name);
      const customerPart = customer || 'Cliente';
      const newName = `${model}${PATIO_CARD_TITLE_SEP}${plate}${PATIO_CARD_TITLE_SEP}${customerPart}`;
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

  const handleToggleChecklistItem = async (templateItemId: string, currentState: 'complete' | 'incomplete') => {
    if (!activeChecklistCardId) return;
    const nextState = currentState === 'complete' ? 'incomplete' as const : 'complete' as const;
    setChecklistState((prev) => ({ ...prev, [templateItemId]: nextState }));
    try {
      await updateServiceOrderChecklistItem(activeChecklistCardId, templateItemId, nextState);
    } catch {
      setChecklistState((prev) => ({ ...prev, [templateItemId]: currentState }));
    }
  };

  const closeChecklistModal = () => {
    setActiveChecklistCardId(null);
    setActiveChecklistTemplateId(null);
  };

  const handleSendComment = async () => {
    if (!selectedCard || !newComment.trim()) return;
    const text = newComment.trim();
    setNewComment('');
    setSendingComment(true);
    try {
      await addServiceOrderComment(selectedCard.id, text, commentAuthorName, actorOptions?.actor);
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
        vehicleBrand: isModuleMode ? undefined : editFichaForm.vehicleBrand.trim() || null,
        moduleIdentification: isModuleMode ? (editFichaForm.moduleIdentification.trim() || null) : undefined,
        plate: isModuleMode ? undefined : editFichaForm.plate.trim().toUpperCase(),
        vehicleColor: isModuleMode ? undefined : editFichaForm.vehicleColor.trim() || null,
        vehicleYear: isModuleMode ? undefined : editFichaForm.vehicleYear.trim() || null,
        vehicleEngineInfo: isModuleMode ? undefined : editFichaForm.vehicleEngineInfo.trim() || null,
      }, actorOptions);
      if (!isModuleMode) {
        await updateServiceOrderMileage(selectedCard.id, editFichaForm.mileageKm.trim() || null, actorOptions);
      }
      const updated = await getServiceOrderById(selectedCard.id);
      setServiceOrderDetail(updated);
      const newName = isModuleMode
        ? `${updated.vehicle_model || '—'} - ${updated.module_identification || '—'} - ${updated.customers?.name || 'Cliente'}`
        : `${updated.vehicle_model || 'Veículo'} - ${(updated.plate || '---').toUpperCase()} - ${updated.customers?.name || 'Cliente'}`;
      const updatedCard = {
        ...selectedCard,
        name: newName,
        osNumber: updated.os_number ?? selectedCard.osNumber,
        mileageKm: updated.mileage_km ?? null,
        deliveryDate: updated.delivery_date ?? selectedCard.deliveryDate,
        dateLastActivity: updated.updated_at,
        vehicleColor: updated.vehicle_color ?? null,
        vehicleYear: updated.vehicle_year ?? null,
        vehicleEngineInfo: updated.vehicle_engine_info ?? null,
        vehicleBrand: updated.vehicle_brand ?? null,
        referenceLinks: parseReferenceLinksFromApi(updated.reference_links),
      };
      setSelectedCard(updatedCard);
      setCards((prev) => prev.map((c) => (c.id === selectedCard.id ? updatedCard : c)));
      setIsDadosFichaExpanded(false);
    } catch (err: any) {
      alert(err?.message ?? "Erro ao salvar alterações.");
    } finally {
      setEditFichaSaving(false);
    }
  };

  const handleEditFichaPlateLookup = async (force?: boolean) => {
    if (isModuleMode) return;
    const normalized = editFichaForm.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (normalized.length < 7) {
      setEditFichaPlateLookupError('Informe a placa completa (mín. 7 caracteres).');
      return;
    }
    if (!force && lastEditFichaPlateFetchedRef.current === normalized) return;
    setEditFichaPlateLookupError(null);
    setEditFichaPlateLookupLoading(true);
    try {
      const result = await consultPlacaFipe(normalized);
      const fetchedPlate = (result.plate || normalized).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      lastEditFichaPlateFetchedRef.current = fetchedPlate;
      setEditFichaForm((prev) => ({
        ...prev,
        plate: fetchedPlate,
        vehicleBrand: result.vehicleBrand?.trim() || prev.vehicleBrand,
        vehicleModel: result.vehicleModel?.trim() || prev.vehicleModel,
        vehicleColor: result.vehicleColor?.trim() || prev.vehicleColor,
        vehicleYear: result.vehicleYear?.trim() || prev.vehicleYear,
        vehicleEngineInfo: result.vehicleEngineInfo?.trim() || prev.vehicleEngineInfo,
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha ao consultar placa.';
      setEditFichaPlateLookupError(msg);
    } finally {
      setEditFichaPlateLookupLoading(false);
    }
  };

  useEffect(() => {
    if (!isDadosFichaExpanded || !focusCustomerNameAfterExpand || !can('canEditFicha')) return;
    const id = window.setTimeout(() => {
      customerNameInputRef.current?.focus();
      customerNameInputRef.current?.select();
      setFocusCustomerNameAfterExpand(false);
    }, 80);
    return () => window.clearTimeout(id);
  }, [isDadosFichaExpanded, focusCustomerNameAfterExpand, can]);

  const handleSaveReferenceLinks = async () => {
    if (!selectedCard || !serviceOrderDetail) return;
    const filtered = referenceLinksDraft
      .map((l) => ({
        id: l.id,
        label: l.label.trim(),
        url: l.url.trim(),
      }))
      .filter((l) => l.url.length > 0);
    setReferenceLinksSaving(true);
    try {
      await updateServiceOrderReferenceLinks(selectedCard.id, filtered, actorOptions);
      const updated = await getServiceOrderById(selectedCard.id);
      setServiceOrderDetail(updated);
      setReferenceLinksDraft(parseReferenceLinksFromApi(updated.reference_links));
      const updatedCard = {
        ...selectedCard,
        referenceLinks: parseReferenceLinksFromApi(updated.reference_links),
        dateLastActivity: updated.updated_at,
      };
      setSelectedCard(updatedCard);
      setCards((prev) => prev.map((c) => (c.id === selectedCard.id ? updatedCard : c)));
    } catch (err: any) {
      alert(err?.message ?? 'Erro ao salvar links.');
    } finally {
      setReferenceLinksSaving(false);
    }
  };

  // --- Budget Functions ---

  const openBudgetModal = (budgetToEdit?: SavedBudget | null) => {
    const isEdit = budgetToEdit && typeof budgetToEdit === 'object' && 'id' in budgetToEdit && 'services' in budgetToEdit && Array.isArray(budgetToEdit.services);
    if (isEdit && budgetToEdit) {
      setEditingBudget(budgetToEdit);
      setBudgetDiagnosis(budgetToEdit.diagnosis ?? '');
      setBudgetServices(budgetToEdit.services.length > 0
        ? budgetToEdit.services.map((s, i) => ({
            id: `s-${budgetToEdit.id}-${i}`,
            description: s.description,
            laborHours:
              s.labor_hours != null && Number.isFinite(Number(s.labor_hours)) ? Number(s.labor_hours) : null,
          }))
        : [{ id: '1', description: '', laborHours: null }]);
      setBudgetParts(budgetToEdit.parts.length > 0
        ? budgetToEdit.parts.map((p, i) => ({ id: `p-${budgetToEdit.id}-${i}`, description: p.description, quantity: p.quantity || '1' }))
        : [{ id: '1', description: '', quantity: '1' }]);
      setBudgetObservations(budgetToEdit.observations ?? '');
    } else {
      setEditingBudget(null);
      setBudgetServices([{ id: '1', description: '', laborHours: null }]);
      setBudgetParts([{ id: '1', description: '', quantity: '1' }]);
      setBudgetDiagnosis('');
      setBudgetObservations('');
    }
    setIsBudgetOpen(true);
    getWorkshopServices().then(setWorkshopServices).catch(() => setWorkshopServices([]));
    getWorkshopParts().then(setWorkshopParts).catch(() => setWorkshopParts([]));
  };

  const closeBudgetModal = () => {
    setIsBudgetOpen(false);
    setEditingBudget(null);
    setBudgetDiagnosis('');
    setBudgetServices([{ id: String(Date.now()), description: '', laborHours: null }]);
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

  /** Abre o modal de aprovação do orçamento (quem tem permissão de aprovar itens). */
  const openBudgetApproval = (budget: SavedBudget) => {
    if (!can('canApproveBudgetItems')) return;
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
    if (!can('canApproveBudgetItems')) return;
    setSavingApproval(true);
    try {
      const services = budgetApprovalTarget.services.map((s, i) => ({
        description: s.description,
        approved: approvalServices[i] ?? false,
        labor_hours: s.labor_hours ?? null,
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
    const hasApprovalDecision = budgetHasExplicitApprovalDecisions(budget.services, budget.parts);
    const serviceApproved = budget.services.filter((s) => s.approved === true);
    const serviceRejected = budget.services.filter((s) => s.approved === false);
    const servicePending = budget.services.filter((s) => s.approved !== true && s.approved !== false);
    const partApproved = budget.parts.filter((p) => p.approved === true);
    const partRejected = budget.parts.filter((p) => p.approved === false);
    const partPending = budget.parts.filter((p) => p.approved !== true && p.approved !== false);

    const serviceLine = (
      s: { description: string; approved?: boolean; labor_hours?: number | null },
      includeStatus = true,
    ) => {
      const dur =
        s.labor_hours != null && Number.isFinite(Number(s.labor_hours))
          ? ` <span class="meta">(${formatLaborLabel(Number(s.labor_hours))})</span>`
          : '';
      const status = includeStatus
        ? s.approved === true
          ? `<span class="status ok">APROVADO</span> `
          : s.approved === false
            ? `<span class="status no">REPROVADO</span> `
            : `<span class="status wait">PENDENTE</span> `
        : '';
      return `<li>${status}${esc(s.description)}${dur}</li>`;
    };
    const partLine = (
      p: { description: string; quantity: string; approved?: boolean },
      includeStatus = true,
    ) => {
      const status = includeStatus
        ? p.approved === true
          ? `<span class="status ok">APROVADO</span> `
          : p.approved === false
            ? `<span class="status no">REPROVADO</span> `
            : `<span class="status wait">PENDENTE</span> `
        : '';
      return `<li>${status}<strong>(${esc(p.quantity)}x)</strong> ${esc(p.description)}</li>`;
    };

    const approvedExecutionHtml = hasApprovalDecision
      ? `
        <h3 class="sec">Itens aprovados para execução</h3>
        ${
          serviceApproved.length === 0 && partApproved.length === 0
            ? `<div class="block">Nenhum item aprovado até o momento.</div>`
            : `
              ${serviceApproved.length > 0 ? `<h4 class="sub">Serviços aprovados</h4><ul>${serviceApproved.map((s) => serviceLine(s, false)).join('')}</ul>` : ''}
              ${partApproved.length > 0 ? `<h4 class="sub">Peças aprovadas</h4><ul>${partApproved.map((p) => partLine(p, false)).join('')}</ul>` : ''}
            `
        }
      `
      : '';

    const servicesHtml = budget.services.length > 0
      ? `<h3 class="sec">Serviços</h3><ul>${budget.services.map((s) => serviceLine(s, hasApprovalDecision)).join('')}</ul>`
      : '';
    const partsHtml = budget.parts.length > 0
      ? `<h3 class="sec">Peças</h3><ul>${budget.parts.map((p) => partLine(p, hasApprovalDecision)).join('')}</ul>`
      : '';
    const diagnosisHtml = budget.diagnosis ? `<h3 class="sec">Diagnóstico</h3><div class="block">${esc(budget.diagnosis)}</div>` : '';
    const obsHtml = budget.observations ? `<h3 class="sec">Observações</h3><div class="block">${esc(budget.observations)}</div>` : '';
    const detail = serviceOrderDetail ?? historyServiceOrderDetail;
    const titleParts = parsePatioCardTitle(budget.cardName || '');
    const customerName = detail?.customers?.name || titleParts.customer || '—';
    const vehicleName = detail?.vehicle_model || titleParts.vehicle || '—';
    const plateOrModule = isModuleMode
      ? detail?.module_identification || titleParts.plateOrModule || '—'
      : (detail?.plate || titleParts.plateOrModule || '—').toUpperCase();
    const brand = detail?.vehicle_brand || '—';
    const year = detail?.vehicle_year || '—';
    const engine = detail?.vehicle_engine_info || '—';
    const osNumber = detail?.os_number != null ? String(detail.os_number) : '—';
    const mileage = mileageKm || detail?.mileage_km || '—';
    const createdAtStr = new Date(budget.createdAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const createdAtTime = new Date(budget.createdAt).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const approvalSummaryHtml = hasApprovalDecision
      ? `<div class="summary">
          <span><strong>Serviços:</strong> ${serviceApproved.length} aprovados, ${serviceRejected.length} reprovados, ${servicePending.length} pendentes</span>
          <span><strong>Peças:</strong> ${partApproved.length} aprovadas, ${partRejected.length} reprovadas, ${partPending.length} pendentes</span>
        </div>`
      : '';
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Orçamento - ${esc(budget.cardName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; padding: 20px; color: #1f2937; font-size: 12px; line-height: 1.4; }
    .brand { margin-bottom: 14px; border-bottom: 2px solid #d1d5db; padding-bottom: 10px; }
    .brand h1 { font-size: 18px; font-weight: 800; letter-spacing: .02em; }
    .brand p { font-size: 11px; color: #4b5563; margin-top: 2px; }
    .title { margin-top: 8px; font-size: 16px; font-weight: 800; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 14px; margin-bottom: 14px; }
    .field { border-bottom: 1px dashed #d1d5db; padding-bottom: 3px; min-height: 34px; }
    .label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; font-weight: 700; margin-bottom: 2px; }
    .value { display: block; font-size: 12px; font-weight: 600; color: #111827; word-break: break-word; }
    .meta { color: #4b5563; font-size: 11px; margin-top: 4px; }
    .sec { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #374151; margin: 14px 0 6px; border-top: 1px solid #e5e7eb; padding-top: 8px; }
    .sub { font-size: 12px; font-weight: 700; color: #4a443d; margin: 12px 0 6px; }
    .block { white-space: pre-wrap; }
    .summary { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0 6px; padding: 10px 12px; border: 1px solid #d8cfbf; background: #f7f1e6; border-radius: 8px; font-size: 12px; color: #4a443d; }
    .status { display: inline-block; margin-right: 6px; border-radius: 5px; padding: 1px 6px; font-size: 10px; font-weight: 700; letter-spacing: .03em; vertical-align: middle; }
    .status.ok { background: #e6f5e9; color: #1f6b2a; border: 1px solid #b7e0be; }
    .status.no { background: #fbe8e8; color: #9d1f1f; border: 1px solid #efb6b6; }
    .status.wait { background: #f3efe7; color: #6f665c; border: 1px solid #ded6c7; }
    ul { list-style: disc; margin-left: 20px; }
    li { margin: 4px 0; padding-bottom: 4px; border-bottom: 1px dashed #cfc6b6; }
    li:last-child { border-bottom: 0; }
    @media print { body { padding: 16px; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="brand">
    <h1>REI DO ABS</h1>
    <p>Especialista em freios ABS</p>
    <p>Avenida Tuiuti 4366, Conjunto João de Barro Itaparica - Maringá</p>
    <p>(44) 99929-4861 / (44) 3040-3931</p>
    <p>reidoabs@gmail.com</p>
    <div class="title">Orçamento</div>
  </div>
  <div class="grid">
    <div class="field"><span class="label">Nome do cliente</span><span class="value">${esc(customerName)}</span></div>
    <div class="field"><span class="label">Nº Ordem de serviço</span><span class="value">${esc(osNumber)}</span></div>
    <div class="field"><span class="label">${isModuleMode ? 'Identificação do módulo' : 'Placa'}</span><span class="value">${esc(plateOrModule)}</span></div>
    <div class="field"><span class="label">Fabricante</span><span class="value">${esc(brand)}</span></div>
    <div class="field"><span class="label">Modelo</span><span class="value">${esc(vehicleName)}</span></div>
    <div class="field"><span class="label">Ano</span><span class="value">${esc(year)}</span></div>
    <div class="field"><span class="label">Motor</span><span class="value">${esc(engine)}</span></div>
    <div class="field"><span class="label">KM</span><span class="value">${esc(mileage)}</span></div>
    <div class="field"><span class="label">Data de entrada</span><span class="value">${esc(createdAtStr)} às ${esc(createdAtTime)}</span></div>
  </div>
  <p class="meta">OS: ${esc(budget.cardName)}</p>
  <p class="meta">Emissão: ${esc(dateStr)}</p>
  ${approvalSummaryHtml}
  ${diagnosisHtml}
  ${approvedExecutionHtml}
  ${servicesHtml}
  ${partsHtml}
  ${obsHtml}
</body>
</html>`;
    printHtmlDocument(html);
  };

  const printBudgetMechanicCopy = (budget: SavedBudget, mileageKm?: string | null) => {
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

    const approvedServices = budget.services.filter((s) => s.approved === true);
    const approvedParts = budget.parts.filter((p) => p.approved === true);
    const detail = serviceOrderDetail ?? historyServiceOrderDetail;
    const titleParts = parsePatioCardTitle(budget.cardName || '');
    const customerName = detail?.customers?.name || titleParts.customer || '—';
    const vehicleName = detail?.vehicle_model || titleParts.vehicle || '—';
    const plateOrModule = isModuleMode
      ? detail?.module_identification || titleParts.plateOrModule || '—'
      : (detail?.plate || titleParts.plateOrModule || '—').toUpperCase();
    const brand = detail?.vehicle_brand || '—';
    const year = detail?.vehicle_year || '—';
    const engine = detail?.vehicle_engine_info || '—';
    const osNumber = detail?.os_number != null ? String(detail.os_number) : '—';
    const mileage = mileageKm || detail?.mileage_km || '—';
    const createdAtStr = new Date(budget.createdAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const createdAtTime = new Date(budget.createdAt).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const servicesHtml = approvedServices.length > 0
      ? `<h3 class="sec">Serviços aprovados</h3><ul>${approvedServices.map((s) => {
          const dur =
            s.labor_hours != null && Number.isFinite(Number(s.labor_hours))
              ? ` <span class="meta">(${formatLaborLabel(Number(s.labor_hours))})</span>`
              : '';
          return `<li>${esc(s.description)}${dur}</li>`;
        }).join('')}</ul>`
      : '';
    const partsHtml = approvedParts.length > 0
      ? `<h3 class="sec">Peças aprovadas</h3><ul>${approvedParts.map((p) => `<li><strong>(${esc(p.quantity)}x)</strong> ${esc(p.description)}</li>`).join('')}</ul>`
      : '';
    const emptyHtml = approvedServices.length === 0 && approvedParts.length === 0
      ? `<div class="block">Nenhum item aprovado neste orçamento.</div>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Via mecânico - ${esc(budget.cardName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; padding: 20px; color: #1f2937; font-size: 12px; line-height: 1.4; }
    .brand { margin-bottom: 14px; border-bottom: 2px solid #d1d5db; padding-bottom: 10px; }
    .brand h1 { font-size: 18px; font-weight: 800; letter-spacing: .02em; }
    .brand p { font-size: 11px; color: #4b5563; margin-top: 2px; }
    .title { margin-top: 8px; font-size: 16px; font-weight: 800; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 14px; margin-bottom: 14px; }
    .field { border-bottom: 1px dashed #d1d5db; padding-bottom: 3px; min-height: 34px; }
    .label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; font-weight: 700; margin-bottom: 2px; }
    .value { display: block; font-size: 12px; font-weight: 600; color: #111827; word-break: break-word; }
    .meta { color: #4b5563; font-size: 11px; margin-top: 4px; }
    .sec { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #374151; margin: 14px 0 6px; border-top: 1px solid #e5e7eb; padding-top: 8px; }
    .block { white-space: pre-wrap; }
    ul { list-style: disc; margin-left: 20px; }
    li { margin: 3px 0; padding-bottom: 4px; border-bottom: 1px dashed #cfc6b6; }
    li:last-child { border-bottom: 0; }
    .footer-sign { margin-top: 18px; font-size: 11px; color: #374151; }
    @media print { body { padding: 16px; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="brand">
    <h1>REI DO ABS</h1>
    <p>Especialista em freios ABS</p>
    <p>Avenida Tuiuti 4366, Conjunto João de Barro Itaparica - Maringá</p>
    <p>(44) 99929-4861 / (44) 3040-3931</p>
    <p>reidoabs@gmail.com</p>
    <div class="title">Via mecânico</div>
  </div>

  <div class="grid">
    <div class="field"><span class="label">Nome do cliente</span><span class="value">${esc(customerName)}</span></div>
    <div class="field"><span class="label">Nº Ordem de serviço</span><span class="value">${esc(osNumber)}</span></div>
    <div class="field"><span class="label">${isModuleMode ? 'Identificação do módulo' : 'Placa'}</span><span class="value">${esc(plateOrModule)}</span></div>
    <div class="field"><span class="label">Fabricante</span><span class="value">${esc(brand)}</span></div>
    <div class="field"><span class="label">Modelo</span><span class="value">${esc(vehicleName)}</span></div>
    <div class="field"><span class="label">Ano</span><span class="value">${esc(year)}</span></div>
    <div class="field"><span class="label">Motor</span><span class="value">${esc(engine)}</span></div>
    <div class="field"><span class="label">KM</span><span class="value">${esc(mileage)}</span></div>
    <div class="field"><span class="label">Data de entrada</span><span class="value">${esc(createdAtStr)} às ${esc(createdAtTime)}</span></div>
  </div>

  <p class="meta">OS: ${esc(budget.cardName)}</p>
  <p class="meta">Emissão: ${esc(dateStr)}</p>
  ${servicesHtml}
  ${partsHtml}
  ${emptyHtml}
  <p class="footer-sign">Data de teste: ____/____/______ às ____:____ &nbsp;&nbsp; Assinatura do responsável: ____________________________</p>
</body>
</html>`;
    printHtmlDocument(html);
  };

  const addServiceRow = () => {
    setBudgetServices([...budgetServices, { id: Date.now().toString(), description: '', laborHours: null }]);
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
    setBudgetServices((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const trimmed = value.trim();
        const match = workshopServices.find((ws) => ws.name.trim() === trimmed);
        return {
          ...item,
          description: value,
          laborHours: match ? (match.labor_hours ?? null) : null,
        };
      })
    );
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

  const addServiceFromList = (svc: WorkshopService) => {
    setBudgetServices((prev) => [
      ...prev,
      { id: Date.now().toString(), description: svc.name, laborHours: svc.labor_hours ?? null },
    ]);
    setIsServiceListOpen(false);
  };

  const getServiceSuggestions = (description: string) => {
    const q = normalizeText(description.trim());
    if (!q) return [];
    return workshopServices.filter(s => normalizeText(s.name).includes(q)).slice(0, 6);
  };

  const getPartSuggestions = (description: string) => {
    const q = normalizeText(description.trim());
    if (!q) return [];
    return workshopParts.filter(p => normalizeText(p.name).includes(q)).slice(0, 6);
  };

  useEffect(() => {
    if (suggestionsForServiceId && focusedServiceInputRef.current) {
      const rect = focusedServiceInputRef.current.getBoundingClientRect();
      setSuggestionBoxPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    } else {
      setSuggestionBoxPosition(null);
    }
  }, [suggestionsForServiceId]);

  useEffect(() => {
    if (suggestionsForPartId && focusedPartInputRef.current) {
      const rect = focusedPartInputRef.current.getBoundingClientRect();
      setPartSuggestionBoxPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    } else {
      setPartSuggestionBoxPosition(null);
    }
  }, [suggestionsForPartId]);

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

  const handlePartInputFocus = (id: string) => {
    if (partSuggestionCloseTimerRef.current) {
      clearTimeout(partSuggestionCloseTimerRef.current);
      partSuggestionCloseTimerRef.current = null;
    }
    setSuggestionsForPartId(id);
  };

  const handlePartInputBlur = () => {
    partSuggestionCloseTimerRef.current = setTimeout(() => setSuggestionsForPartId(null), 180);
  };

  const applySuggestion = (itemId: string, svc: WorkshopService) => {
    setBudgetServices((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, description: svc.name, laborHours: svc.labor_hours ?? null }
          : item
      )
    );
    setSuggestionsForServiceId(null);
  };

  const applyPartSuggestion = (itemId: string, name: string) => {
    updatePartDescription(itemId, name);
    setSuggestionsForPartId(null);
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
        ? validServices.map((s, i) => ({
            description: s.description.trim(),
            approved: editingBudget.services[i]?.approved,
            labor_hours: s.laborHours != null && Number.isFinite(Number(s.laborHours)) ? Number(s.laborHours) : null,
          }))
        : validServices.map((s) => ({
            description: s.description.trim(),
            labor_hours: s.laborHours != null && Number.isFinite(Number(s.laborHours)) ? Number(s.laborHours) : null,
          })),
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

  const handleUnarchive = async (card: BoardCard) => {
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
    if (byName) return { style: byName.style, label: byName.name, ringClass: byName.ringClass };
    if (listId === "CANCELLED")
      return { style: "bg-zinc-600 text-zinc-300 border-zinc-600", label: "Arquivado", ringClass: getStageRingClass("CANCELLED") };
    return { style: getStageStyle(listId || ""), label: listName, ringClass: getStageRingClass(listId || "") };
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

  // Define tamanho da fonte do modelo para não empurrar placa / técnico para fora do card (~90% dos degraus Tailwind = −10%).
  const getModelTitleClass = (modelName: string, panoramic?: boolean) => {
    const len = (modelName || '').length;
    if (panoramic) {
      if (len > 40) return 'text-[1.125rem] md:text-[2.025rem] lg:text-[1.35rem]';
      if (len > 26) return 'text-[1.35rem] md:text-[2.7rem] lg:text-[1.6875rem]';
      return 'text-[1.35rem] md:text-[2.7rem] lg:text-[1.6875rem]';
    }
    // Tablet em pé (md): bem grande; celular e tablet deitado/desktop (lg) mais controlados
    if (len > 40) return 'text-[1.6875rem] md:text-[3.375rem] lg:text-[2.025rem]';
    if (len > 26) return 'text-[2.025rem] md:text-[3.375rem] lg:text-[2.7rem]';
    return 'text-[2.025rem] md:text-[3.375rem] lg:text-[2.7rem]';
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

  // --- Attachment Functions ---
  /** Infere mimeType pelo nome do arquivo para exibir PDFs na seção Documentos. */
  const attachmentMimeType = (name: string): string => {
    const n = (name || "").toLowerCase();
    if (n.endsWith(".pdf")) return "application/pdf";
    if (/\.(jpg|jpeg|png|gif|webp|heic|heif|bmp)$/.test(n)) return "image/*";
    return "application/octet-stream";
  };

  const handleDeleteAttachment = async (path: string, attId: string, url: string) => {
    if (!selectedCard) return;
    if (!window.confirm("Excluir este anexo permanentemente?")) return;
    setDeletingAttachmentId(attId);
    try {
      await deleteServiceOrderPhoto(selectedCard.id, path);
      const photos = await getServiceOrderPhotos(selectedCard.id);
      setCardDetails((prev) =>
        prev
          ? {
              ...prev,
              attachments: photos.map((p, i) => ({
                id: p.path || String(i),
                name: p.name,
                url: p.url,
                mimeType: attachmentMimeType(p.name),
                previews: [{ url: p.url, width: 200, height: 200 }],
              })),
            }
          : null
      );
      if (renameAttachmentId === attId) {
        setRenameAttachmentId(null);
        setRenameAttachmentNewName("");
      }
      setPreviewImages((prev) => {
        if (!prev) return null;
        const newUrls = prev.urls.filter((u) => u !== url);
        if (newUrls.length === 0) return null;
        const oldIdx = prev.urls.indexOf(url);
        if (oldIdx === -1) return { urls: newUrls, currentIndex: Math.min(prev.currentIndex, newUrls.length - 1) };
        let newIndex = prev.currentIndex;
        if (oldIdx < prev.currentIndex) newIndex = prev.currentIndex - 1;
        else if (oldIdx === prev.currentIndex) newIndex = Math.min(prev.currentIndex, newUrls.length - 1);
        return { urls: newUrls, currentIndex: newIndex };
      });
      setPreviewPdf((prev) => (prev === url ? null : prev));
    } catch (err: any) {
      alert(err?.message ?? "Erro ao excluir anexo.");
    } finally {
      setDeletingAttachmentId(null);
    }
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
      const raw = photoUploadLabel.trim();
      let fileName: string;
      if (!raw) {
        fileName = `foto_patio_${Date.now()}.jpg`;
      } else {
        let s = raw
          .normalize("NFD")
          .replace(/\p{M}/gu, "")
          .replace(/\s+/g, "_")
          .replace(/[^\w.\-]/g, "_");
        if (!/\.(jpe?g|png|webp)$/i.test(s)) s += ".jpg";
        fileName = s;
      }
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
      setPhotoUploadLabel("");
    } catch (err: any) {
      alert(err?.message ?? "Erro ao enviar foto.");
    } finally {
      setIsUploading(false);
    }
  };

  const clearPhoto = () => {
    setPhotoBlob(null);
    setPhotoPreview(null);
    setPhotoUploadLabel("");
  };

  if (initialLoading) {
    const loadLabel = isModuleMode ? 'laboratório' : 'pátio';
    const dotClass = isModuleMode
      ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-[0_0_18px_-2px_rgba(139,92,246,0.55)] dark:from-violet-400 dark:to-fuchsia-400 dark:shadow-[0_0_22px_-4px_rgba(167,139,250,0.4)]'
      : 'bg-gradient-to-br from-[#007AFF] to-[#5AC8FA] shadow-[0_0_18px_-2px_rgba(0,122,255,0.5)] dark:from-[#0A84FF] dark:to-[#64B5FF] dark:shadow-[0_0_22px_-4px_rgba(10,132,255,0.4)]';
    return (
      <div
        className="relative flex min-h-[70vh] w-full flex-col items-center justify-center px-4 py-16"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <style>{`
          @keyframes patio-load-bob {
            0%, 100% { transform: translate3d(0, 0, 0); opacity: 0.35; }
            50% { transform: translate3d(0, -14px, 0); opacity: 1; }
          }
          .patio-load-dot {
            animation: patio-load-bob 0.95s cubic-bezier(0.45, 0, 0.3, 1) infinite;
            will-change: transform, opacity;
          }
        `}</style>
        <div className="flex h-14 items-center justify-center gap-3.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`patio-load-dot block h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`}
              style={{ animationDelay: `${i * 0.14}s` }}
            />
          ))}
        </div>
        <p className="mt-11 text-[15px] font-medium tracking-[-0.01em] text-zinc-700 dark:text-zinc-200">
          Carregando o {loadLabel}…
        </p>
        <p className="mt-2 max-w-[16rem] text-center text-[13px] font-normal leading-relaxed text-zinc-400 dark:text-zinc-500">
          Sincronizando ordens de serviço
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative flex min-h-[75vh] w-full flex-col items-center justify-center px-4 py-12">
        <div className={`${iosPageGlass} w-full max-w-md px-8 py-10 text-center sm:px-10`}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/12 dark:bg-red-500/15">
            <AlertCircle className="h-7 w-7 text-red-600" strokeWidth={2} />
          </div>
          <p className="text-[17px] font-semibold leading-snug text-zinc-900 dark:text-white">Não foi possível carregar</p>
          <p className="mt-2 text-[15px] leading-relaxed text-zinc-500 dark:text-zinc-400">{error}</p>
          <button
            type="button"
            onClick={() => fetchData(false)}
            className={`${iosPrimaryButton} mt-8 w-full max-w-xs`}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // Membros permitidos: apenas técnicos cadastrados na tela inicial
  const allowedMembers = allMembers.filter(m =>
    systemTechnicians.some(t => t.id === m.id || m.fullName.toLowerCase().includes(t.display_name?.toLowerCase() ?? ""))
  );

  return (
    <div className="relative min-h-full w-full animate-in pb-32 fade-in duration-500">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[min(480px,75vw)] w-[min(880px,100vw)] -translate-x-1/2 rounded-full bg-gradient-to-br from-cyan-400/[0.09] via-sky-400/[0.05] to-violet-500/[0.08] blur-[90px] dark:from-cyan-500/[0.08] dark:via-transparent dark:to-violet-600/[0.12]" />
        <div className="absolute bottom-0 right-0 h-[380px] w-[min(520px,90vw)] translate-x-[15%] rounded-full bg-gradient-to-tl from-amber-400/[0.07] to-transparent blur-[100px] dark:from-amber-500/[0.08]" />
        <div className="absolute bottom-1/4 left-0 h-[220px] w-[320px] -translate-x-1/3 rounded-full bg-[#007AFF]/[0.04] blur-[80px] dark:bg-[#007AFF]/[0.06]" />
      </div>

      <div className="relative z-0 mx-auto max-w-[100rem] px-3 pt-2 sm:px-5 md:px-6 md:pt-3">
        {/* Cabeçalho — mesmo padrão Recepção/Agenda: sem painel vidro em volta; ícone = tile da Home (Pátio / Laboratório) */}
        <header className="mb-6 flex flex-col gap-4 sm:mb-8 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            {isModuleMode ? (
              <IosAccentIconSquircle variant="page" strokeWidth={2.2}>
                <FlaskConical />
              </IosAccentIconSquircle>
            ) : (
              <IosAccentIconSquircle variant="page" strokeWidth={2.2}>
                <PatioCarIcon />
              </IosAccentIconSquircle>
            )}
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[28px]">
                {isModuleMode ? 'Laboratório' : 'Pátio'}
              </h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-yellow" strokeWidth={2} />
                {cards.length} {isModuleMode ? 'módulos' : 'veículos'} na oficina
              </p>
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:justify-end">
            <button
              type="button"
              onClick={() => {
                setReminderSaveError(null);
                setIsRemindersOpen(true);
              }}
              className="relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-zinc-200/80 bg-white/80 px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 hover:border-[#007AFF]/30 hover:text-zinc-900 active:scale-[0.98] dark:border-white/10 dark:bg-white/10 dark:text-zinc-100 dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)] dark:hover:border-white/20 dark:hover:text-white sm:px-5 sm:py-3"
            >
              {remindersBadgeCount > 0 && (
                <span className="pointer-events-none absolute -right-1 -top-1 inline-flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full border-2 border-white bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white shadow-sm dark:border-zinc-900">
                  {remindersBadgeCount > 99 ? '99+' : remindersBadgeCount}
                </span>
              )}
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#007AFF]/15 text-[#007AFF]">
                <ReminderIcon className="h-3.5 w-3.5" strokeWidth={2} />
              </span>
              <span className="tracking-tight">
                {isModuleMode ? 'Lembretes do laboratório' : 'Lembretes do pátio'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setBoardPanoramic((prev) => {
                  const next = !prev;
                  try {
                    localStorage.setItem(boardPanoramicStorageKey, next ? '1' : '0');
                  } catch (_) {}
                  return next;
                });
              }}
              aria-pressed={boardPanoramic}
              aria-label={
                boardPanoramic
                  ? 'Ampliar cartões — voltar ao tamanho padrão'
                  : 'Reduzir cartões — ver mais na tela'
              }
              title={
                boardPanoramic
                  ? 'Tamanho padrão dos cartões (ampliar)'
                  : 'Ver todos os cartões na tela (reduzir)'
              }
              className={`group flex h-12 w-12 shrink-0 items-center justify-center rounded-full border shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.34,1.35,0.25,1)] hover:scale-[1.06] active:scale-[0.94] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)] ${
                boardPanoramic
                  ? 'border-[#007AFF]/45 bg-[#007AFF]/18 text-[#007AFF] hover:border-[#007AFF]/60 hover:bg-[#007AFF]/26 dark:border-[#0A84FF]/50 dark:bg-[#0A84FF]/22 dark:text-[#64B5FF]'
                  : 'border-zinc-200/80 bg-white/80 text-zinc-600 hover:border-[#007AFF]/35 hover:text-[#007AFF] dark:border-white/[0.1] dark:bg-zinc-900/45 dark:text-zinc-300 dark:hover:text-[#64B5FF]'
              }`}
            >
              <span className="relative flex h-9 w-9 items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.34,1.35,0.25,1)] group-hover:rotate-6 group-active:rotate-0">
                <span
                  key={boardPanoramic ? 'in' : 'out'}
                  className="absolute inset-0 flex items-center justify-center animate-in zoom-in-95 fade-in duration-300"
                >
                  {boardPanoramic ? (
                    <ZoomIn className="h-6 w-6 drop-shadow-sm" strokeWidth={2.2} />
                  ) : (
                    <ZoomOut className="h-6 w-6 drop-shadow-sm" strokeWidth={2.2} />
                  )}
                </span>
              </span>
            </button>
            <div className="flex shrink-0 items-center">
              <NotificationCenter
                theme="light"
                forTechnician={actorOptions?.actor === 'technician'}
                technicianSlug={actorOptions?.actor === 'technician' ? actorOptions?.actorTechnicianSlug : undefined}
              />
            </div>
            <button
              type="button"
              onClick={() => setIsHistoryOpen(true)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-200/80 bg-white/70 text-zinc-600 shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-all duration-300 hover:border-[#007AFF]/35 hover:text-zinc-900 dark:border-white/[0.1] dark:bg-zinc-900/45 dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]"
              title="Consultar histórico (arquivados)"
            >
              <History className="h-5 w-5" strokeWidth={2} />
            </button>
            {!isModuleMode ? (
              <button
                type="button"
                onClick={() => {
                  setPatioPlateSearchMessage(null);
                  setPatioPlateSearchInPatioCards([]);
                  setPatioPlateSearchApiInfo(null);
                  setIsPatioPlateSearchModalOpen(true);
                }}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-200/80 bg-white/70 text-zinc-600 shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-all duration-300 hover:border-[#007AFF]/35 hover:text-[#007AFF] active:scale-95 dark:border-white/[0.1] dark:bg-zinc-900/45 dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]"
                title="Buscar placa no pátio"
              >
                <Search className="h-5 w-5" strokeWidth={2} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fetchData(false)}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-200/80 bg-white/70 text-zinc-500 shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-all duration-300 hover:border-[#007AFF]/35 hover:text-[#007AFF] active:scale-95 dark:border-white/[0.1] dark:bg-zinc-900/45 dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]"
                title="Atualizar lista"
              >
                <RefreshCw className="h-6 w-6" />
              </button>
            )}
          </div>
        </header>
      </div>

      {/* Grid — mesma ordem dos estágios; cartões em vidro iOS. */}
      <div className="mx-auto max-w-[100rem] px-3 sm:px-5 md:px-6">
      {(() => {
        const stageOrder = SERVICE_ORDER_STAGES.map((s) => s.id);
        const byStage = (a: TrelloCard, b: TrelloCard) => {
          const ia = stageOrder.indexOf(a.idList);
          const ib = stageOrder.indexOf(b.idList);
          if (ia !== ib) return ia - ib;
          return new Date(b.dateLastActivity).getTime() - new Date(a.dateLastActivity).getTime();
        };
        const sortedCards = [...cards].sort(byStage);
        return (
      <>
      <div
        className="origin-top will-change-[zoom]"
        style={
          {
            zoom: boardPanoramic ? 0.78 : 1,
            transition: 'zoom 0.55s cubic-bezier(0.34, 1.35, 0.25, 1)',
          } as React.CSSProperties & { zoom?: number }
        }
      >
      <div
        className={`relative z-0 grid perspective-[1400px] transition-[gap] duration-500 ease-[cubic-bezier(0.34,1.35,0.25,1)] ${
          boardPanoramic
            ? 'grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 md:gap-3 lg:grid-cols-4 lg:gap-3.5 xl:grid-cols-5 2xl:grid-cols-6 2xl:gap-4'
            : 'grid-cols-1 gap-5 md:grid-cols-2 md:gap-5 lg:grid-cols-3 lg:gap-6'
        }`}
      >
        {sortedCards.map((card) => {
          const titleParts = parsePatioCardTitle(card.name);
          const model = titleParts.vehicle || card.name;
          const plate = isModuleMode ? '' : (titleParts.plateOrModule || '---');
          const customerName = titleParts.customer || '';
          
          const currentList = lists.find(l => l.id === card.idList);
          const listName = currentList ? currentList.name : 'Desconhecido';
          const listNameLower = listName.toLowerCase();
          
          const member = card.members && card.members.length > 0 ? card.members[0] : null;
          const mechanic = member ? member.fullName : null;
          const mechanicColorClass = getMechanicIconColor(mechanic, member?.id);
          const hasMechanic = !!mechanic;
          
          const statusConfig = getStatusConfig(listName, card.idList);

          const canAssignMember = can('canAssignTechnician'); 
          
          // Condição para botão de ENTREGUE: Apenas em 'finalizado'
          const showDeliverButton = listNameLower.includes('finalizado');

          // Condição para botão de ENTREGUE em 'não aprovado'
          const showNotApprovedDeliverButton = listNameLower.includes('não aprovado');

          const isGarantia = card.garantiaTag === true;
          const isFloating = effectsEnabled && cardFloat?.id === card.id && interactingCardId !== card.id;

          return (
            <div
              key={card.id}
              className={`transition-[min-height] duration-500 ease-[cubic-bezier(0.34,1.35,0.25,1)] ${
                boardPanoramic ? 'min-h-[128px]' : 'min-h-[180px]'
              }`}
              style={{ transformStyle: 'preserve-3d' }}
              onMouseMove={(e) => handleCardMouseMove(e, card.id)}
              onMouseLeave={handleCardMouseLeave}
            >
              <div
                onClick={() => setSelectedCard(card)}
                className={`
                  group relative flex h-full cursor-pointer flex-col justify-between overflow-hidden
                  border bg-white/70 backdrop-blur-2xl
                  shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)] dark:bg-zinc-900/40
                  dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]
                  hover:border-[#007AFF]/28 hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.12)] dark:hover:border-white/[0.12] dark:hover:shadow-[0_16px_48px_-16px_rgba(0,0,0,0.5)]
                  active:scale-[0.99]
                  motion-safe:transition-[padding,min-height,border-radius,box-shadow] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.34,1.35,0.25,1)]
                  ${
                    boardPanoramic
                      ? 'min-h-[128px] rounded-[1.85rem] p-3.5 sm:rounded-[2.1rem]'
                      : 'min-h-[180px] rounded-[2rem] p-5 sm:rounded-[2.25rem]'
                  }
                  ${isGarantia ? 'ring-2 ring-inset ring-red-500 ring-offset-0 border-red-500/40' : 'border-zinc-200/80 dark:border-white/[0.07] ring-1 ring-inset ring-zinc-400/35 ring-offset-0 dark:ring-white/[0.1]'}
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
                <div className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden rounded-[inherit] bg-white/95 dark:bg-zinc-950/90">
                   <RefreshCw className="h-8 w-8 animate-spin text-[#007AFF]" />
                </div>
              ) : null}

              {/* Conteúdo interativo: ao entrar aqui desativamos o 3D para os cliques nos botões funcionarem */}
              <div
                className="relative z-10"
                onMouseEnter={() => setInteractingCardId(card.id)}
                onMouseLeave={() => setInteractingCardId(null)}
              >
              {/* Layout: 1) nome do carro  2) cliente  3) técnico | placa */}
              <div className={boardPanoramic ? 'mb-2' : 'mb-4'}>
                {/* Nome do carro (fonte um pouco menor) */}
                <div className={boardPanoramic ? 'mb-1' : 'mb-2'}>
                  <h3
                    className={`font-vehicle ${getModelTitleClass(model, boardPanoramic)} font-black text-zinc-900 dark:text-white uppercase leading-[0.9] tracking-tighter break-words italic ${vehicleCardTitleShadow}`}
                  >
                    {model}
                  </h3>
                  {!isModuleMode && (card.vehicleColor ?? '').trim() ? (
                    <p
                      className="mt-1 max-w-full truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400/75 dark:text-zinc-500/85"
                      title={`Cor: ${(card.vehicleColor ?? '').trim()}`}
                    >
                      {(card.vehicleColor ?? '').trim()}
                    </p>
                  ) : null}
                </div>

                {/* Cliente + placa na mesma linha (placa fixa à direita, nome truncado) */}
                {customerName && (
                  <div
                    className={`mb-2 flex max-w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200/70 bg-white/55 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.05] ${
                      boardPanoramic ? 'px-2 py-1' : 'px-3 py-1.5'
                    }`}
                  >
                    <div className="min-w-0 flex flex-1 items-center gap-2">
                      <User className={`shrink-0 text-[#007AFF] ${boardPanoramic ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} strokeWidth={2} />
                      <span
                        className={`min-w-0 flex-1 truncate font-semibold text-zinc-700 dark:text-zinc-200 tracking-tight ${
                          boardPanoramic ? 'text-sm' : 'text-base'
                        }`}
                      >
                        {firstTwoNames(customerName)}
                      </span>
                    </div>
                    {!isModuleMode && (
                      <div className="shrink-0">
                        <MercosulPlateMockup
                          plate={plate}
                          blurPlates={blurPlates}
                          size={boardPanoramic ? 'cardCompact' : 'card'}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Técnico */}
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      disabled={!canAssignMember}
                      onClick={(e) => { e.stopPropagation(); canAssignMember && setCardForMemberAssignment(card); }}
                      className={`
                        inline-flex items-center justify-start gap-1.5 px-3 py-1.5 rounded-2xl border transition-all max-w-full
                        ${canAssignMember
                          ? 'border-light-border dark:border-white/10 bg-light-card dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200 cursor-pointer hover:bg-zinc-200/90 dark:hover:bg-white/[0.1] active:scale-[0.97]'
                          : 'border-zinc-200/60 dark:border-white/5 bg-light-card/80 dark:bg-white/[0.04] text-zinc-500 cursor-default'}
                      `}
                    >
                      {member?.avatarUrl ? (
                        <img src={member.avatarUrl} alt={capitalizeFirst(member.fullName)} className="w-6 h-6 rounded-full object-cover border border-zinc-300/80 dark:border-white/10 shrink-0" />
                      ) : (
                        <MechanicIcon className={`w-5 h-5 shrink-0 ${mechanicColorClass}`} />
                      )}
                      <span className={`text-sm font-bold truncate ${!hasMechanic && canAssignMember ? 'text-brand-yellow' : ''}`}>
                        {mechanic ? capitalizeFirst(mechanic) : (canAssignMember ? '+ Técnico' : 'Sem técnico')}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Botões de Ação Inferiores */}
              <div className={`relative mt-auto w-full ${boardPanoramic ? 'space-y-2' : 'space-y-3'}`}>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenMoveModal(card, e); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`
                    w-full cursor-pointer rounded-2xl transition-all duration-200 ease-out
                    shadow-[0_2px_12px_-2px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_16px_-2px_rgba(0,0,0,0.35)]
                    border border-black/10 dark:border-white/10
                    ${boardPanoramic ? 'h-[46px] px-3.5 text-[13px]' : 'h-[56px] px-5'}
                    ${statusConfig.style}
                    hover:brightness-110 active:scale-[0.98]
                  `}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-sm uppercase tracking-wide truncate">
                      {statusConfig.label}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {can('canArchiveCard') && (showDeliverButton || showNotApprovedDeliverButton) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const msg = showDeliverButton
                              ? 'Confirmar entrega deste veículo finalizado? Ele será arquivado e irá para o histórico.'
                              : 'Confirmar entrega deste veículo não aprovado? Ele será arquivado e irá para o histórico.';
                            if (archivingId === card.id) return;
                            if (window.confirm(msg)) {
                              handleDeliverVehicle(card.id);
                            }
                          }}
                          className={`inline-flex items-center rounded-full font-semibold bg-white/90 text-emerald-700 border border-emerald-500/70 shadow-sm hover:bg-emerald-50 hover:text-emerald-800 transition-colors ${
                            showDeliverButton
                              ? 'gap-1.5 px-3 py-2 text-[11px]'
                              : 'gap-1 px-2.5 py-1 text-[10px]'
                          }`}
                        >
                          {archivingId === card.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3" />
                          )}
                          ENTREGAR
                        </button>
                      )}
                      <ChevronDown className="w-5 h-5 opacity-70" />
                    </div>
                  </div>
                </button>
              </div>

              </div>
            </div>
            </div>
          );
        })}
      </div>
      </div>
      </>
        );
      })()}

      {cards.length === 0 && (
          <div className={`${iosPageGlass} ring-1 ring-white/40 dark:ring-white/[0.06] flex flex-col items-center justify-center py-16 text-center sm:py-20`}>
            <div className="mb-5">
              {isModuleMode ? (
                <IosAccentIconSquircle variant="tile" strokeWidth={2.2}>
                  <FlaskConical />
                </IosAccentIconSquircle>
              ) : (
                <IosAccentIconSquircle variant="tile" strokeWidth={2.2}>
                  <PatioCarIcon />
                </IosAccentIconSquircle>
              )}
            </div>
            <p className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white">
              {isModuleMode ? 'Nenhum módulo no laboratório' : 'Nenhum veículo no pátio'}
            </p>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-yellow" />
              Quando houver OS ativas, aparecem aqui em cartões de vidro.
            </p>
          </div>
      )}
      </div>

      {/* --- MODAL DE HISTÓRICO (BUSCA) — portal em body para ficar acima da TabBar --- */}
      {isHistoryOpen && (
         <ModalPortal>
         <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-[20px] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6 sm:p-6 animate-in fade-in duration-200">
            <div
              className={`relative flex h-[min(90vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem))] w-full max-w-[90rem] min-h-0 flex-col overflow-hidden ${iosModalShell} animate-modal-wp-app`}
            >
               <button
                  type="button"
                  onClick={() => setIsHistoryOpen(false)}
                  className={iosModalClose}
                  aria-label="Fechar"
               >
                  <X className="h-5 w-5" />
               </button>

               <div className="shrink-0 border-b border-zinc-200/60 px-6 pb-5 pt-7 dark:border-white/[0.07] sm:px-8 sm:pt-8">
                  <div className="flex items-start gap-3 pr-10">
                     <IosAccentIconSquircle variant="modal" strokeWidth={2.2}>
                        <History />
                     </IosAccentIconSquircle>
                     <div className="min-w-0 flex-1">
                        <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[26px]">
                          {isModuleMode ? 'Histórico de módulos' : 'Histórico de veículos'}
                        </h2>
                        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                           <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-yellow" />
                           {isModuleMode ? 'Consulte módulos arquivados na oficina' : 'Consulte OS entregues e arquivadas'}
                        </p>
                     </div>
                  </div>
               </div>

               <div className="shrink-0 border-b border-zinc-200/50 px-6 py-4 dark:border-white/[0.06] sm:px-8">
                  <p className={iosLabel}>Busca no arquivo</p>
                  <div className={`${iosModalInsetCard} p-4 sm:p-5`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                     <div className="relative min-w-0 flex-1">
                        <input
                           type="text"
                           placeholder="Placa, nome, CPF, telefone ou CEP…"
                           value={historySearchPlate}
                           onChange={(e) => setHistorySearchPlate(e.target.value)}
                           onKeyDown={(e) => e.key === 'Enter' && handleSearchHistory()}
                           className={`${iosInput} py-3 pl-10 pr-4`}
                        />
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                     </div>
                     <button
                        type="button"
                        onClick={() => handleSearchHistory()}
                        disabled={isLoadingHistory}
                        className="shrink-0 rounded-2xl bg-[#007AFF] px-8 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-transform active:scale-[0.98] disabled:opacity-45 sm:self-stretch"
                     >
                        {isLoadingHistory ? <RefreshCw className="mx-auto h-5 w-5 animate-spin" /> : 'Buscar'}
                     </button>
                  </div>
                  </div>
               </div>

               <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 custom-scrollbar sm:px-8">
                  {isLoadingHistory ? (
                     <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 text-zinc-500 dark:text-zinc-400">
                        <RefreshCw className="h-8 w-8 animate-spin text-[#007AFF]" />
                        <p className="text-[15px]">Buscando no arquivo…</p>
                     </div>
                  ) : archivedCards.length > 0 ? (
                     <div>
                        {historyShowingFallback && (
                           <div className={`${iosModalInsetCard} mb-4 p-4 text-[13px] text-zinc-600 dark:text-zinc-300`}>
                              {isModuleMode
                                ? 'Nenhum resultado para a busca. Exibindo os últimos módulos arquivados.'
                                : 'Nenhum resultado para a busca. Exibindo os últimos veículos arquivados.'}
                           </div>
                        )}
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-5 lg:grid-cols-3 lg:gap-6">
                        {archivedCards.map(card => {
                           const t = parsePatioCardTitle(card.name);
                           const model = t.vehicle || card.name;
                           const plate = t.plateOrModule || '---';
                           const customerName = t.customer || '';
                           const archivedWhen = card.dateLastActivity ? new Date(card.dateLastActivity).toLocaleDateString('pt-BR') : '—';

                           return (
                              <div key={card.id} className="min-h-[180px]">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => handleOpenHistoryCardDetails(card)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      handleOpenHistoryCardDetails(card);
                                    }
                                  }}
                                  className={`
                                    group relative flex h-full min-h-[180px] cursor-pointer flex-col justify-between overflow-hidden
                                    rounded-[2rem] border bg-white/70 p-5 backdrop-blur-2xl sm:rounded-[2.25rem]
                                    shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)] dark:bg-zinc-900/40
                                    dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]
                                    border-zinc-200/80 dark:border-white/[0.07] ring-1 ring-inset ring-zinc-400/35 ring-offset-0 dark:ring-white/[0.1]
                                    hover:border-[#007AFF]/28 hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.12)] dark:hover:border-white/[0.12] dark:hover:shadow-[0_16px_48px_-16px_rgba(0,0,0,0.5)]
                                    active:scale-[0.99]
                                  `}
                                >
                                  <div className="relative z-10 flex h-full min-h-0 flex-1 flex-col">
                                    <div className="mb-4 min-h-0 flex-1">
                                      <div className="mb-2">
                                        <h3
                                          className={`font-vehicle ${getModelTitleClass(model)} font-black text-zinc-900 dark:text-white uppercase leading-[0.9] tracking-tighter break-words italic ${vehicleCardTitleShadow}`}
                                        >
                                          {model}
                                        </h3>
                                        {!isModuleMode && (card.vehicleColor ?? '').trim() ? (
                                          <p
                                            className="mt-1 max-w-full truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400/75 dark:text-zinc-500/85"
                                            title={`Cor: ${(card.vehicleColor ?? '').trim()}`}
                                          >
                                            {(card.vehicleColor ?? '').trim()}
                                          </p>
                                        ) : null}
                                      </div>

                                      {customerName ? (
                                        <div className="mb-2 flex w-fit max-w-full items-center gap-2 rounded-2xl border border-zinc-200/70 bg-white/55 px-3 py-1.5 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.05]">
                                          <User className="w-4 h-4 shrink-0 text-[#007AFF]" strokeWidth={2} />
                                          <span className="truncate text-base font-semibold tracking-tight text-zinc-700 dark:text-zinc-200">
                                            {firstTwoNames(customerName)}
                                          </span>
                                        </div>
                                      ) : null}

                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                          <span className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-2xl border border-zinc-200/70 bg-white/55 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-600 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-zinc-300">
                                            <History className="h-3.5 w-3.5 shrink-0 text-[#007AFF]" strokeWidth={2} />
                                            Arquivado · {archivedWhen}
                                          </span>
                                        </div>
                                        <div className="flex-shrink-0">
                                          {!isModuleMode ? (
                                            <MercosulPlateMockup plate={plate} blurPlates={blurPlates} size="card" />
                                          ) : (
                                            <div className="max-w-[140px] rounded-xl border border-zinc-200/70 bg-white/55 px-3 py-2 text-right backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.05]">
                                              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Módulo</p>
                                              <p className="truncate font-mono text-sm font-bold text-zinc-900 dark:text-white">{plate}</p>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="relative mt-auto w-full border-t border-zinc-200/60 pt-3 dark:border-white/[0.06]">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">Ver ficha completa</span>
                                        <span className="flex items-center gap-1 text-[13px] font-semibold text-[#007AFF] opacity-90 transition-opacity group-hover:opacity-100">
                                          Abrir <ArrowRight className="h-3.5 w-3.5" />
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                           );
                        })}
                        </div>
                     </div>
                  ) : (
                     <div className={`flex min-h-[240px] flex-col items-center justify-center ${iosModalInsetCard} p-10 text-center`}>
                        <History className="mb-4 h-14 w-14 text-zinc-300" strokeWidth={1.25} />
                        <p className="text-[15px] font-medium text-zinc-600 dark:text-zinc-400">Nenhum registro encontrado.</p>
                        <p className="mt-1 max-w-sm text-[13px] text-zinc-500">Ajuste os termos da busca ou confira os filtros da oficina.</p>
                     </div>
                  )}
               </div>

            </div>
         </div>
         </ModalPortal>
      )}

      {/* --- DETALHES DO CARD ARQUIVADO — portal em body para ficar acima da TabBar --- */}
      {selectedHistoryCard && (
         <ModalPortal>
         <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-[20px] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6 sm:p-6 animate-in fade-in duration-200">
            <div
              className={`relative flex h-[min(90vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem))] w-full max-w-[90rem] min-h-0 flex-col overflow-hidden ${iosModalShell} animate-in zoom-in-95 duration-200`}
            >
               <div className="shrink-0 border-b border-zinc-200/60 px-4 py-3 dark:border-white/[0.07] sm:px-6">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleUnarchive(selectedHistoryCard)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-5 py-2.5 text-[15px] font-semibold text-white shadow-md transition-transform hover:opacity-95 active:scale-[0.98] dark:bg-white/12 dark:text-white"
                  >
                    <ArchiveRestore className="h-4 w-4" />
                    Desarquivar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUseRegistration(selectedHistoryCard)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#007AFF] px-5 py-2.5 text-[15px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-transform hover:opacity-95 active:scale-[0.98]"
                  >
                    <Copy className="h-4 w-4" />
                    Usar cadastro
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedHistoryCard(null);
                      setHistoryServiceOrderDetail(null);
                      setHistorySavedBudgets([]);
                    }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-zinc-600 transition-colors hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
                    aria-label="Fechar"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  </div>
               </div>

               <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                  <div className="px-6 py-6 pb-4 md:px-10 md:py-8">
                     <div className="mb-6 flex flex-col gap-3">
                        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-zinc-200/80 bg-zinc-100/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600 dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-zinc-300">
                          Arquivado
                        </span>
                        <h1
                          className={`text-3xl font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white md:text-5xl ${vehicleModalTitleShadow}`}
                        >
                          {historyCardTitleParts?.vehicle}
                        </h1>
                        {!isModuleMode && (selectedHistoryCard?.vehicleBrand ?? '').trim() ? (
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500/90 dark:text-zinc-400">
                            {(selectedHistoryCard?.vehicleBrand ?? '').trim()}
                          </p>
                        ) : null}
                        {!isModuleMode && (selectedHistoryCard?.vehicleColor ?? '').trim() ? (
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500/90 dark:text-zinc-400">
                            Cor · {(selectedHistoryCard?.vehicleColor ?? '').trim()}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-col gap-3 text-zinc-700 dark:text-zinc-300 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-6 lg:gap-y-2">
                         {!isModuleMode && (
                           <div className="flex shrink-0 items-center">
                              <MercosulPlateMockup
                                plate={historyCardTitleParts?.plateOrModule || '---'}
                                blurPlates={blurPlates}
                                size="modal"
                              />
                           </div>
                         )}
                         <div
                           className={`${vehicleModalCustomerNameBox} flex min-w-0 flex-1 items-center gap-2 px-4 py-2.5 lg:max-w-xl lg:flex-1`}
                         >
                            <User className="h-5 w-5 shrink-0 text-zinc-500 dark:text-zinc-400" />
                            <span className="truncate text-[16px] font-medium text-zinc-900 dark:text-white">{historyCardTitleParts?.customer}</span>
                         </div>
                         {selectedHistoryCard.due && (
                           <div className={`${iosModalInsetCard} flex shrink-0 items-center gap-2 px-4 py-2.5`}>
                              <Calendar className="h-4 w-4 text-zinc-500" />
                              <span className="text-[14px] font-medium text-zinc-800 dark:text-zinc-100">
                                Entrega: {new Date(selectedHistoryCard.due).toLocaleDateString('pt-BR')}
                              </span>
                           </div>
                         )}
                        </div>
                        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-yellow" />
                          Registro encerrado — leitura, anexos e reabertura
                        </p>
                     </div>
                  </div>

                  <div className="mx-auto h-px max-w-[92%] bg-zinc-200/80 dark:bg-white/[0.08]" />

                  <div className="grid grid-cols-1 gap-10 px-6 py-8 md:px-10 lg:grid-cols-3 lg:gap-12">
                      <div className="space-y-10 lg:col-span-2">
                        <div>
                           <p className={uiSectionTitleRow}>
                              <FileText className="h-3.5 w-3.5" />
                              Queixa do cliente
                           </p>
                           <div className={`${iosModalInsetCard} p-5 ${uiReadBody} sm:p-6`}>
                              <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponentsApp}>
                                 {stripLegacyVehicleCategoryFromComplaint(historyServiceOrderDetail?.issue_description || selectedHistoryCard.desc || "") || "Nenhuma descrição disponível."}
                              </ReactMarkdown>
                           </div>
                        </div>

                        <div>
                           <p className={uiSectionTitleRow}>
                             <MessageSquare className="h-3.5 w-3.5" />
                             Atividades e comentários
                          </p>
                          <div className={`${iosModalInsetCard} overflow-hidden`}>
                             <div className="max-h-[500px] space-y-5 overflow-y-auto bg-zinc-50/40 p-5 dark:bg-black/20 custom-scrollbar sm:p-6">
                                {loadingHistoryDetails ? (
                                   <div className="flex justify-center py-8">
                                      <RefreshCw className="h-6 w-6 animate-spin text-[#007AFF]" />
                                   </div>
                                ) : historyCardDetails?.actions && historyCardDetails.actions.length > 0 ? (
                                   historyCardDetails.actions.map(action => {
                                      const avatar = getCommentAuthorAvatar(action.memberCreator.fullName, action.memberCreator.avatarUrl);
                                      return (
                                      <div key={action.id} className="flex gap-3 sm:gap-4">
                                         <div className={`h-10 w-10 shrink-0 overflow-hidden rounded-full ${avatar.useLogo ? 'bg-[#007AFF]' : ''}`}>
                                            {avatar.useLogo ? (
                                               <img src="/logo.png" alt="Rei do ABS" className="h-full w-full object-cover" />
                                            ) : avatar.photoUrl ? (
                                               <img src={avatar.photoUrl} alt={action.memberCreator.fullName} className="h-full w-full object-cover" />
                                            ) : (
                                               <div className={`flex h-full w-full items-center justify-center text-sm font-bold ${avatar.avatarClass}`}>
                                                  {avatar.initial}
                                               </div>
                                            )}
                                         </div>
                                         <div className="min-w-0 flex-1 space-y-1.5">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                               <span className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">{action.memberCreator.fullName}</span>
                                               <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                                  {new Date(action.date).toLocaleString('pt-BR')}
                                                  {action.data.edited_at && (
                                                    <span className="ml-1.5 italic text-zinc-400">editada</span>
                                                  )}
                                               </span>
                                            </div>
                                            <div className="rounded-2xl border border-zinc-200/80 bg-white/90 p-3.5 text-[14px] leading-relaxed text-zinc-800 dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-zinc-200">
                                                <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponentsApp}>
                                                   {action.data.text}
                                                </ReactMarkdown>
                                            </div>
                                         </div>
                                      </div>
                                   ); })
                                ) : (
                                   <div className="py-8 text-center text-[14px] text-zinc-500 dark:text-zinc-400">
                                      Nenhum comentário registrado no histórico.
                                   </div>
                                )}
                             </div>
                          </div>
                        </div>

                        <div>
                          <p className={uiSectionTitleRow}>
                            <Calculator className="h-3.5 w-3.5" />
                            Orçamentos
                          </p>
                          <div className={`${iosModalInsetCard} p-4 sm:p-5`}>
                            {loadingHistoryDetails ? (
                              <div className="flex justify-center py-6">
                                <RefreshCw className="h-5 w-5 animate-spin text-[#007AFF]" />
                              </div>
                            ) : historySavedBudgets.length > 0 ? (
                              <div className="space-y-2">
                                {[...historySavedBudgets]
                                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                  .map((b, idx) => (
                                    <div key={b.id} className="rounded-xl border border-zinc-200/70 bg-zinc-50/80 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                                      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                                        Orçamento {historySavedBudgets.length - idx}
                                      </p>
                                      <p className="mt-1 text-[13px] text-zinc-700 dark:text-zinc-200">
                                        {new Date(b.createdAt).toLocaleString('pt-BR')}
                                      </p>
                                      <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">
                                        {b.services.length} serviço(s) · {b.parts.length} peça(s)
                                      </p>
                                      <div className="mt-2">
                                        <button
                                          type="button"
                                          onClick={() => setViewingBudget(b)}
                                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/90 bg-white/80 px-3 py-1.5 text-[12px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-zinc-200 dark:hover:bg-white/[0.1]"
                                        >
                                          <Eye className="h-3.5 w-3.5" />
                                          Abrir orçamento
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
                                Nenhum orçamento encontrado.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-8">
                         <div>
                            <p className={uiSectionTitleRow}>
                              <Paperclip className="h-3.5 w-3.5" />
                              Anexos
                            </p>
                            <div className="space-y-3">
                               {loadingHistoryDetails ? (
                                  <div className="flex justify-center p-4">
                                     <RefreshCw className="h-4 w-4 animate-spin text-[#007AFF]" />
                                  </div>
                               ) : historyCardDetails?.attachments && historyCardDetails.attachments.length > 0 ? (
                                  (() => {
                                    const histAll = historyCardDetails.attachments;
                                    return (
                                      <div className="space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                     {histAll.map(att => {
                                       const isPdf = isPdfAttachment(att.mimeType, att.url);
                                       const isImage =
                                         att.mimeType.startsWith('image/') ||
                                         /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp)$/i.test(att.url);
                                       const showImgThumb = !isPdf && isImage;
                                       const cardClass = `group block w-full overflow-hidden ${iosModalInsetCard} transition-all hover:border-[#007AFF]/35`;
                                       return isPdf ? (
                                         <button
                                           key={att.id}
                                           type="button"
                                           onClick={() => setPreviewPdf(att.url)}
                                           className={cardClass}
                                         >
                                           <div className="relative flex h-24 items-center justify-center overflow-hidden bg-zinc-100/80 dark:bg-white/[0.04]">
                                              <div className="flex flex-col items-center justify-center gap-1">
                                                 <FileText className="h-8 w-8 text-red-500" />
                                                 <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">PDF</span>
                                              </div>
                                              <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                                                 <Eye className="h-5 w-5 text-white" />
                                              </div>
                                           </div>
                                           <div className="border-t border-zinc-200/60 p-2 dark:border-white/[0.06] text-left">
                                              <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">{attachmentDisplayName(att.name)}</p>
                                           </div>
                                         </button>
                                       ) : (
                                        <a
                                          key={att.id}
                                          href={att.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={cardClass}
                                        >
                                           <div className="relative flex h-24 items-center justify-center overflow-hidden bg-zinc-100/80 dark:bg-white/[0.04]">
                                              {showImgThumb ? (
                                                 <StorageThumbImg
                                                   src={att.url}
                                                   alt={att.name}
                                                   className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
                                                   sizes="96px"
                                                   thumbMaxWidth={128}
                                                   thumbMaxHeight={96}
                                                   thumbQuality={50}
                                                 />
                                              ) : (
                                                 <FileText className="h-8 w-8 text-zinc-400" />
                                              )}
                                              <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                                                 <ExternalLink className="h-5 w-5 text-white" />
                                              </div>
                                           </div>
                                           <div className="border-t border-zinc-200/60 p-2 dark:border-white/[0.06]">
                                              <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">{attachmentDisplayName(att.name)}</p>
                                           </div>
                                        </a>
                                     );})}
                                  </div>
                                      </div>
                                    );
                                  })()
                               ) : (
                                  <div className={`${iosModalInsetCard} py-8 text-center`}>
                                     <p className="text-[14px] text-zinc-500 dark:text-zinc-400">Nenhum anexo encontrado.</p>
                                  </div>
                               )}
                            </div>
                         </div>

                         <div>
                           <p className={uiSectionTitleRow}>
                             <Link2 className="h-3.5 w-3.5" />
                             Links úteis
                           </p>
                           <div className={`${iosModalInsetCard} p-4 sm:p-5`}>
                             {(() => {
                               const links = parseReferenceLinksFromApi(historyServiceOrderDetail?.reference_links);
                               if (links.length === 0) {
                                 return (
                                   <p className="text-[14px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                                     Nenhum link anexado para este veículo.
                                   </p>
                                 );
                               }
                               return (
                                 <ul className="space-y-2">
                                   {links.map((link) => (
                                     <li
                                       key={link.id}
                                       className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200/70 bg-zinc-50/50 px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.03]"
                                     >
                                       <span className="min-w-0 truncate text-[14px] font-medium text-zinc-900 dark:text-white">
                                         {link.label?.trim() || link.url}
                                       </span>
                                       {link.url?.trim() ? (
                                         <a
                                           href={
                                             link.url.trim().match(/^https?:\/\//i)
                                               ? link.url.trim()
                                               : `https://${link.url.trim().replace(/^\/+/, '')}`
                                           }
                                           target="_blank"
                                           rel="noopener noreferrer"
                                           className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-[#007AFF] hover:underline dark:text-[#64B5FF]"
                                         >
                                           Abrir <ExternalLink className="h-3.5 w-3.5" />
                                         </a>
                                       ) : null}
                                     </li>
                                   ))}
                                 </ul>
                               );
                             })()}
                           </div>
                         </div>
                      </div>

                  </div>
               </div>

            </div>
         </div>
         </ModalPortal>
      )}

      {/* MODAL DETALHE DO VEÍCULO */}
      {selectedCard && (() => {
        const modalListName = lists.find(l => l.id === selectedCard.idList)?.name ?? '';
        const modalStatusConfig = getStatusConfig(modalListName, selectedCard.idList);
        const modalRingClass = selectedCard.garantiaTag
          ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-[#F2F2F7] dark:ring-offset-[#0a0a0a] border-2 border-red-500/30'
          : `${modalStatusConfig.ringClass} border border-zinc-300/70 dark:border-white/[0.08]`;
        const headerVehicleCategoryLabel =
          !isModuleMode
            ? resolveVehicleCategoryLabel(
                serviceOrderDetail?.vehicle_category ?? null,
                serviceOrderDetail?.issue_description ?? null
              ) ?? selectedCard.vehicleCategory ?? null
            : null;
        const vi = iosVehicleModalInsetCard;
        const vin = iosVehicleModalInput;
        return (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 dark:bg-black/45 backdrop-blur-[20px] animate-in fade-in duration-200 p-1.5 pt-[max(0.45rem,env(safe-area-inset-top))] pb-[max(0.45rem,env(safe-area-inset-bottom))] sm:p-3">
           <div className={`relative flex h-[min(97vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-0.35rem))] w-full max-w-[99vw] xl:max-w-[98vw] 2xl:max-w-[97vw] min-h-0 flex-col ${iosVehicleModalShell} animate-modal-wp-app ${modalRingClass}`}>
              
              <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
                {can('canDeleteCards') && (
                <button
                  type="button"
                  onClick={() => { setDeleteVehicleError(null); setDeleteVehiclePassword(''); setIsDeleteVehicleOpen(true); }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-zinc-600 transition-colors hover:bg-red-500/15 hover:text-red-600 dark:bg-white/10 dark:hover:bg-red-500/20"
                  title="Excluir veículo do sistema"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedCard(null)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-zinc-600 transition-colors hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {can('canDeleteCards') && isDeleteVehicleOpen && (
                <div className="absolute inset-0 z-30 flex items-center justify-center rounded-[2rem] bg-black/50 p-4 backdrop-blur-sm sm:rounded-[2.25rem]">
                  <div className={`${vi} w-full max-w-sm p-6 shadow-xl`}>
                    <h3 className="mb-2 flex items-center gap-2 text-[17px] font-semibold text-zinc-900 dark:text-white">
                      <Trash2 className="h-5 w-5 text-red-500" />
                      Excluir veículo do sistema
                    </h3>
                    <p className="mb-4 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                      Este veículo será arquivado (OS cancelada). Digite a senha configurada em &quot;Alterar senhas&quot; para confirmar.
                    </p>
                    <input
                      type="password"
                      value={deleteVehiclePassword}
                      onChange={(e) => setDeleteVehiclePassword(e.target.value)}
                      placeholder="Senha"
                      className={`${vin} mb-3`}
                      autoFocus
                    />
                    {deleteVehicleError && (
                      <p className="text-sm text-red-600 dark:text-red-400 mb-3">{deleteVehicleError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setIsDeleteVehicleOpen(false); setDeleteVehiclePassword(''); setDeleteVehicleError(null); }}
                        className="flex-1 rounded-2xl border border-zinc-200/90 py-3 text-[15px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/[0.12] dark:text-zinc-300 dark:hover:bg-white/[0.06]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDeleteVehicle}
                        disabled={deleteVehicleSaving || !deleteVehiclePassword.trim()}
                        className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
                      >
                        {deleteVehicleSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                  <div className="border-b border-zinc-200/50 p-8 pb-8 dark:border-white/[0.06] md:px-12 md:pb-10">
                     <div className="mb-6 flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {(serviceOrderDetail?.os_number ?? selectedCard.osNumber) != null && (
                            <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider bg-zinc-200/80 dark:bg-zinc-700/80 text-zinc-600 dark:text-zinc-300 border border-zinc-300/60 dark:border-zinc-600/60">
                              OS #{(serviceOrderDetail?.os_number ?? selectedCard.osNumber)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleOpenMoveModal(selectedCard, e);
                            }}
                            title="Alterar etapa"
                            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-black uppercase tracking-widest shadow-xl border-2 transition-all hover:brightness-110 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/45 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0a0a0a] ${getStatusConfig(lists.find(l => l.id === selectedCard.idList)?.name || '', selectedCard.idList).style}`}
                          >
                            {lists.find(l => l.id === selectedCard.idList)?.name}
                            <ChevronDown className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                          </button>
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
                        {!isModuleMode &&
                        (serviceOrderDetail?.vehicle_brand || selectedCard.vehicleBrand)?.trim() ? (
                          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                            {(serviceOrderDetail?.vehicle_brand || selectedCard.vehicleBrand || '').trim()}
                          </p>
                        ) : null}
                        <div className="mt-0.5 flex min-w-0 items-end gap-3">
                          <h1
                            className={`font-vehicle min-w-0 flex-1 truncate text-5xl md:text-7xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase italic leading-none ${vehicleModalTitleShadow}`}
                            title={selectedCardTitleParts?.vehicle}
                          >
                            {selectedCardTitleParts?.vehicle}
                          </h1>
                          {!isModuleMode && (
                            <div className="inline-flex shrink-0 origin-right scale-[1.2] items-center justify-center">
                              <MercosulPlateMockup
                                plate={selectedCardTitleParts?.plateOrModule || '---'}
                                blurPlates={blurPlates}
                                size="modal"
                                selectable
                              />
                            </div>
                          )}
                        </div>
                        {!isModuleMode &&
                        (serviceOrderDetail?.vehicle_color || selectedCard.vehicleColor)?.trim() ? (
                          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500/90 dark:text-zinc-400">
                            Cor ·{' '}
                            {(serviceOrderDetail?.vehicle_color || selectedCard.vehicleColor || '').trim()}
                          </p>
                        ) : null}
                        {/* Placa, cliente e km — cartão no mesmo idioma visual das demais seções */}
                        <div className={`${vi} relative mt-3 overflow-hidden shadow-[0_6px_24px_-10px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_32px_-14px_rgba(0,0,0,0.45)]`}>
                          <div
                            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.07),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(245,208,11,0.08),transparent_50%)] dark:bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.11),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(245,208,11,0.1),transparent_52%)]"
                            aria-hidden
                          />
                          <div
                            className="pointer-events-none absolute -right-10 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-gradient-to-br from-[#007AFF]/14 to-transparent opacity-80 blur-2xl dark:from-[#007AFF]/22"
                            aria-hidden
                          />
                          <div className="relative flex flex-col items-center gap-3 px-3 py-4 sm:px-5 sm:py-4 lg:flex-row lg:flex-nowrap lg:items-center lg:justify-center lg:gap-x-6 xl:gap-x-8 lg:gap-y-0 lg:py-4">
                            <div className="flex w-full min-w-0 max-w-xl flex-1 items-stretch justify-center lg:w-auto lg:max-w-xl lg:flex-1 lg:self-center [&>div]:w-full">
                              <div className="flex min-h-[52px] w-full min-w-0 items-center gap-2.5 rounded-xl border border-zinc-200/95 bg-gradient-to-b from-white to-zinc-50/95 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_6px_-2px_rgba(0,0,0,0.05),0_6px_16px_-6px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.02)] dark:border-white/[0.1] dark:from-white/[0.08] dark:to-white/[0.03] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_-4px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)]">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-200/90 bg-white shadow-sm dark:border-white/[0.08] dark:bg-white/[0.06]">
                                  <User className="h-4 w-4 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2.25} aria-hidden />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#007AFF] dark:text-[#7ab8ff]">Cliente</p>
                                  <button
                                    type="button"
                                    onClick={handleJumpToCustomerNameEdit}
                                    disabled={!can('canEditFicha')}
                                    className={`truncate text-left text-[15px] font-semibold leading-tight transition-colors ${
                                      can('canEditFicha')
                                        ? 'text-zinc-900 hover:text-[#007AFF] dark:text-white dark:hover:text-[#93c5fd]'
                                        : 'text-zinc-900 dark:text-white'
                                    }`}
                                    title={can('canEditFicha') ? 'Editar nome do cliente em Dados da ficha' : 'Dados do cliente'}
                                  >
                                    {selectedCardTitleParts?.customer || '—'}
                                  </button>
                                </div>
                              </div>
                            </div>
                            {!isModuleMode && can('canEditMileage') && (
                              <div className="flex min-h-[52px] min-w-0 shrink-0 w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-zinc-200/95 bg-gradient-to-b from-white to-zinc-50/95 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_6px_-2px_rgba(0,0,0,0.05),0_6px_16px_-6px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.02)] dark:border-white/[0.1] dark:from-white/[0.07] dark:to-white/[0.03] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_12px_-4px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] sm:justify-start lg:h-full lg:w-auto lg:flex-nowrap lg:self-center lg:justify-center lg:py-2">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-200/90 bg-white shadow-sm dark:border-white/[0.08] dark:bg-white/[0.06]">
                                  <Gauge className="h-4 w-4 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2.25} aria-hidden />
                                </div>
                                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#007AFF] dark:text-[#7ab8ff]">Km</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={mileageEditValue}
                                  onChange={(e) => setMileageEditValue(e.target.value)}
                                  placeholder="Ex: 45000"
                                  className="w-[6.5rem] rounded-xl border border-zinc-300/90 bg-zinc-50 px-2.5 py-1.5 text-[13px] text-zinc-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] placeholder:text-zinc-400 focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.12] dark:bg-zinc-950/50 dark:text-white dark:placeholder:text-zinc-500 sm:w-28"
                                />
                                <button
                                  type="button"
                                  onClick={handleSaveMileage}
                                  disabled={savingMileage || mileageEditValue.trim() === lastSavedMileage}
                                  className={`inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-md transition-all disabled:opacity-50 ${
                                    mileageEditValue.trim() !== lastSavedMileage
                                      ? 'bg-[#007AFF] shadow-blue-500/20 hover:opacity-95 active:scale-[0.98]'
                                      : 'bg-zinc-600 shadow-none dark:bg-zinc-700'
                                  }`}
                                >
                                  {savingMileage ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                  Salvar
                                </button>
                                {mileageSavedMessage && (
                                  <span className="text-[11px] font-semibold text-green-600 dark:text-green-400 animate-in fade-in">Salvo!</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Dados da ficha — cabeçalho com camadas, tipografia forte e chips de resumo */}
                        {serviceOrderDetail && (
                        <div ref={customerDataSectionRef} className="mt-2 w-full">
                      <div className={`${vi} overflow-hidden shadow-[0_8px_32px_-12px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.5)]`}>
                        <div className="relative border-b border-black/[0.06] bg-white dark:border-white/[0.08] dark:bg-zinc-950/25">
                          <div
                            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.11),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(245,208,11,0.12),transparent_50%)] dark:bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.18),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(245,208,11,0.14),transparent_52%)]"
                            aria-hidden
                          />
                          <div
                            className="pointer-events-none absolute -right-12 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-gradient-to-br from-[#007AFF]/18 to-transparent opacity-70 blur-2xl dark:from-[#007AFF]/26"
                            aria-hidden
                          />
                          <button
                            type="button"
                            onClick={() => setIsDadosFichaExpanded((v) => !v)}
                            className="group relative flex min-h-0 w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-zinc-50/90 active:bg-zinc-100/85 dark:hover:bg-white/[0.06] dark:active:bg-white/[0.09] sm:gap-3 sm:px-4 sm:py-3"
                          >
                            <div className="pointer-events-none absolute inset-y-2 left-2.5 w-[2px] rounded-full bg-gradient-to-b from-[#007AFF] via-brand-yellow to-[#007AFF]/75 shadow-[0_0_10px_rgba(0,122,255,0.28)] dark:shadow-[0_0_14px_rgba(0,122,255,0.38)] sm:left-3 sm:inset-y-2.5" aria-hidden />
                            <div className="min-w-0 flex-1 pl-4 sm:pl-5">
                              <p className="bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-600 bg-clip-text text-[16px] font-bold leading-tight tracking-[-0.03em] text-transparent sm:text-[17px] dark:from-white dark:via-zinc-100 dark:to-zinc-400">
                                Dados da ficha
                              </p>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {isModuleMode ? (
                                  <>
                                    <span className="inline-flex max-w-full items-center rounded-lg border border-zinc-200/95 bg-white/90 px-2 py-0.5 text-[11px] font-bold tabular-nums tracking-tight text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_8px_-4px_rgba(0,0,0,0.12)] dark:border-white/[0.12] dark:bg-white/[0.07] dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                                      <span className="mr-1.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
                                        Ref.
                                      </span>
                                      <span className="truncate font-mono">
                                        {(serviceOrderDetail.module_identification || '—').trim()}
                                      </span>
                                    </span>
                                    {(serviceOrderDetail.vehicle_model ?? '').trim() ? (
                                      <span className="inline-flex max-w-[min(100%,18rem)] items-center rounded-lg border border-zinc-200/90 bg-gradient-to-b from-zinc-50 to-zinc-100/90 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-tight text-zinc-900 shadow-sm dark:border-white/[0.1] dark:from-white/[0.09] dark:to-white/[0.04] dark:text-white">
                                        {(serviceOrderDetail.vehicle_model ?? '').trim().toUpperCase()}
                                      </span>
                                    ) : null}
                                  </>
                                ) : (
                                  <>
                                    {(serviceOrderDetail.vehicle_model ?? '').trim() ? (
                                      <span className="inline-flex max-w-[min(100%,16rem)] items-center rounded-lg border border-zinc-200/95 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase leading-tight tracking-tight text-zinc-900 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.08)] dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-white">
                                        {(serviceOrderDetail.vehicle_model ?? '').trim().toUpperCase()}
                                      </span>
                                    ) : null}
                                    {(serviceOrderDetail.vehicle_color ?? '').trim() ? (
                                      <span className="inline-flex items-center rounded-lg border border-zinc-200/80 bg-zinc-50/95 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-zinc-700 normal-case dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-zinc-300">
                                        {(serviceOrderDetail.vehicle_color ?? '').trim().toLowerCase()}
                                      </span>
                                    ) : null}
                                  </>
                                )}
                                <span className="inline-flex max-w-[min(100%,20rem)] items-center gap-1 rounded-lg border border-[#007AFF]/25 bg-[#007AFF]/[0.09] px-2 py-0.5 text-[11px] font-semibold uppercase text-[#004999] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:border-[#007AFF]/35 dark:bg-[#007AFF]/15 dark:text-[#b8d9ff] dark:shadow-none">
                                  <User className="h-3 w-3 shrink-0 opacity-80" aria-hidden strokeWidth={2.5} />
                                  <span className="truncate">{firstTwoNames(serviceOrderDetail.customers?.name?.trim() || 'Cliente').toUpperCase()}</span>
                                </span>
                              </div>
                            </div>
                            <ChevronRight
                              strokeWidth={2.25}
                              className={`relative z-[1] h-3.5 w-3.5 shrink-0 text-[#007AFF]/55 transition-transform duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:text-[#007AFF]/85 dark:text-[#7ab8ff]/70 dark:group-hover:text-[#7ab8ff] ${isDadosFichaExpanded ? 'rotate-90' : ''}`}
                              aria-hidden
                            />
                          </button>
                        </div>
                        {isDadosFichaExpanded && (
                        <div className="flex flex-col gap-6 bg-zinc-50/90 p-5 dark:bg-white/[0.02] sm:p-6">
                          {can('canEditFicha') ? (
                            <>
                              <div className="order-1">
                              {serviceOrderDetail.customers && (
                                <div className="space-y-3">
                                  <p className={`${iosLabel} ml-0.5`}>Cliente</p>
                                  <div className={`${vi} space-y-4 p-4 sm:p-5`}>
                                    <div>
                                      <label className={iosLabel}>Nome</label>
                                      <input ref={customerNameInputRef} value={editFichaForm.name} onChange={(e) => setEditFichaForm(f => ({ ...f, name: e.target.value }))} className={vin} placeholder="Nome do cliente" />
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                      <div>
                                        <label className={iosLabel}>Telefone</label>
                                        <input value={editFichaForm.phone} onChange={(e) => setEditFichaForm(f => ({ ...f, phone: e.target.value }))} className={vin} placeholder="(11) 99999-9999" />
                                      </div>
                                      <div>
                                        <label className={iosLabel}>E-mail</label>
                                        <input type="email" value={editFichaForm.email} onChange={(e) => setEditFichaForm(f => ({ ...f, email: e.target.value }))} className={vin} placeholder="email@exemplo.com" />
                                      </div>
                                    </div>
                                    <div>
                                      <label className={iosLabel}>CPF</label>
                                      <input value={editFichaForm.cpf} onChange={(e) => setEditFichaForm(f => ({ ...f, cpf: e.target.value }))} className={vin} placeholder="000.000.000-00" />
                                    </div>
                                  </div>
                                  <p className={`${iosLabel} ml-0.5`}>Endereço</p>
                                  <div className={`${vi} space-y-4 p-4 sm:p-5`}>
                                    <div>
                                      <label className={iosLabel}>Logradouro</label>
                                      <input value={editFichaForm.address} onChange={(e) => setEditFichaForm(f => ({ ...f, address: e.target.value }))} className={vin} placeholder="Rua, bairro..." />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                                      <div>
                                        <label className={iosLabel}>Nº</label>
                                        <input value={editFichaForm.addressNumber} onChange={(e) => setEditFichaForm(f => ({ ...f, addressNumber: e.target.value }))} className={vin} placeholder="Nº" />
                                      </div>
                                      <div>
                                        <label className={iosLabel}>CEP</label>
                                        <input value={editFichaForm.cep} onChange={(e) => setEditFichaForm(f => ({ ...f, cep: e.target.value }))} className={vin} placeholder="00000-000" />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                              </div>
                              <div className="order-2">
                              <div className="space-y-3">
                                <div className="ml-0.5 flex flex-wrap items-center justify-between gap-2">
                                  <p className={iosLabel}>{isModuleMode ? 'Módulo' : 'Veículo'}</p>
                                  {!isModuleMode && (
                                    <button
                                      type="button"
                                      onClick={() => setIsVehicleCategoryModalOpen(true)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-[#007AFF]/30 bg-[#007AFF]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#007AFF] transition-colors hover:bg-[#007AFF]/15 dark:border-[#007AFF]/35 dark:bg-[#007AFF]/15 dark:text-[#b8d9ff] dark:hover:bg-[#007AFF]/22"
                                      title="Alterar categoria do veículo"
                                    >
                                      {headerVehicleCategoryLabel || 'Categoria'}
                                      <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    </button>
                                  )}
                                </div>
                                <div className={`${vi} space-y-4 p-4 sm:p-5`}>
                                  {!isModuleMode && (
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                      <div>
                                        <label className={iosLabel}>Marca / montadora</label>
                                        <input value={editFichaForm.vehicleBrand} onChange={(e) => setEditFichaForm(f => ({ ...f, vehicleBrand: e.target.value }))} className={vin} placeholder="Ex: Renault" />
                                      </div>
                                      <div>
                                        <label className={iosLabel}>Modelo (no card)</label>
                                        <input value={editFichaForm.vehicleModel} onChange={(e) => setEditFichaForm(f => ({ ...f, vehicleModel: e.target.value }))} className={vin} placeholder="Ex: Logan 1.6" />
                                      </div>
                                    </div>
                                  )}
                                  {isModuleMode && (
                                    <>
                                      <div>
                                        <label className={iosLabel}>Veículo / referência</label>
                                        <input value={editFichaForm.vehicleModel} onChange={(e) => setEditFichaForm(f => ({ ...f, vehicleModel: e.target.value }))} className={vin} placeholder="Ex: BMW 320i" />
                                      </div>
                                      <div>
                                        <label className={iosLabel}>Identificação do módulo</label>
                                        <input value={editFichaForm.moduleIdentification} onChange={(e) => setEditFichaForm(f => ({ ...f, moduleIdentification: e.target.value }))} className={vin} placeholder="Ex: Módulo ABS XYZ" />
                                      </div>
                                    </>
                                  )}
                                  {!isModuleMode && (
                                    <>
                                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div>
                                          <label className={iosLabel}>Placa</label>
                                          <div className="space-y-2">
                                            <input
                                              value={editFichaForm.plate}
                                              onChange={(e) => {
                                                const next = e.target.value.toUpperCase();
                                                setEditFichaForm((f) => ({ ...f, plate: next }));
                                                setEditFichaPlateLookupError(null);
                                                const n = next.replace(/[^A-Za-z0-9]/g, '');
                                                if (lastEditFichaPlateFetchedRef.current && lastEditFichaPlateFetchedRef.current !== n) {
                                                  lastEditFichaPlateFetchedRef.current = null;
                                                }
                                              }}
                                              onBlur={() => {
                                                if (editFichaForm.plate.trim().length >= 7) void handleEditFichaPlateLookup();
                                              }}
                                              maxLength={8}
                                              className={`${vin} font-mono uppercase`}
                                              placeholder="ABC1D23"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => void handleEditFichaPlateLookup(true)}
                                              disabled={editFichaPlateLookupLoading}
                                              className="inline-flex items-center gap-1.5 rounded-xl border border-[#007AFF]/30 bg-[#007AFF]/10 px-3 py-1.5 text-[12px] font-semibold text-[#007AFF] transition-colors hover:bg-[#007AFF]/15 disabled:opacity-50 dark:border-[#007AFF]/35 dark:bg-[#007AFF]/15 dark:text-[#b8d9ff] dark:hover:bg-[#007AFF]/22"
                                            >
                                              {editFichaPlateLookupLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                                              Buscar placa e preencher veículo
                                            </button>
                                            {editFichaPlateLookupError && (
                                              <p className="text-[11px] font-medium text-red-600 dark:text-red-400">{editFichaPlateLookupError}</p>
                                            )}
                                          </div>
                                        </div>
                                        <div>
                                          <label className={iosLabel}>Quilometragem</label>
                                          <input value={editFichaForm.mileageKm} onChange={(e) => setEditFichaForm(f => ({ ...f, mileageKm: e.target.value }))} className={vin} placeholder="45000" />
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                        <div>
                                          <label className={iosLabel}>Cor</label>
                                          <input value={editFichaForm.vehicleColor} onChange={(e) => setEditFichaForm(f => ({ ...f, vehicleColor: e.target.value }))} className={vin} placeholder="Ex: Branca" />
                                        </div>
                                        <div>
                                          <label className={iosLabel}>Ano</label>
                                          <input value={editFichaForm.vehicleYear} onChange={(e) => setEditFichaForm(f => ({ ...f, vehicleYear: e.target.value }))} className={vin} placeholder="2010 / 2010" />
                                        </div>
                                        <div>
                                          <label className={iosLabel}>Motor</label>
                                          <input value={editFichaForm.vehicleEngineInfo} onChange={(e) => setEditFichaForm(f => ({ ...f, vehicleEngineInfo: e.target.value }))} className={vin} placeholder="Cilindradas / combustível" />
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col gap-6">
                              <div className="order-1">
                              <div className="space-y-3">
                                <div className="ml-0.5 flex flex-wrap items-center justify-between gap-2">
                                  <p className={iosLabel}>{isModuleMode ? 'Módulo' : 'Veículo'}</p>
                                  {!isModuleMode && (
                                    <button
                                      type="button"
                                      onClick={() => setIsVehicleCategoryModalOpen(true)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-[#007AFF]/30 bg-[#007AFF]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#007AFF] transition-colors hover:bg-[#007AFF]/15 dark:border-[#007AFF]/35 dark:bg-[#007AFF]/15 dark:text-[#b8d9ff] dark:hover:bg-[#007AFF]/22"
                                      title="Alterar categoria do veículo"
                                    >
                                      {headerVehicleCategoryLabel || 'Categoria'}
                                      <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    </button>
                                  )}
                                </div>
                                <div className={`${vi} divide-y divide-zinc-200/60 overflow-hidden p-0 dark:divide-white/[0.06]`}>
                                  {!isModuleMode && serviceOrderDetail.vehicle_brand?.trim() ? (
                                    <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                                      <Tag className="h-[18px] w-[18px] shrink-0 text-[#007AFF]/85" />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Marca</p>
                                        <p className="mt-0.5 text-[15px] font-medium text-zinc-900 dark:text-white">{serviceOrderDetail.vehicle_brand.trim()}</p>
                                      </div>
                                    </div>
                                  ) : null}
                                  <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                                    <PatioCarIcon className="h-[18px] w-[18px] shrink-0 text-[#007AFF]/85" />
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{isModuleMode ? 'Referência' : 'Modelo'}</p>
                                      <p className="font-vehicle mt-0.5 text-[15px] font-medium text-zinc-900 dark:text-white">{serviceOrderDetail.vehicle_model || '—'}</p>
                                    </div>
                                  </div>
                                  {isModuleMode && (
                                    <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                                      <FlaskConical className="h-[18px] w-[18px] shrink-0 text-[#007AFF]/85" />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Identificação</p>
                                        <p className="mt-0.5 text-[15px] font-medium text-zinc-900 dark:text-white">{serviceOrderDetail.module_identification || '—'}</p>
                                      </div>
                                    </div>
                                  )}
                                  {!isModuleMode && (
                                    <>
                                      <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                                        <FileText className="h-[18px] w-[18px] shrink-0 text-[#007AFF]/85" />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Placa</p>
                                          <p className="mt-0.5 font-mono text-[16px] font-bold uppercase tracking-wider text-zinc-900 dark:text-white">{(serviceOrderDetail.plate || '—').toUpperCase()}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                                        <Hash className="h-[18px] w-[18px] shrink-0 text-[#007AFF]/85" />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Quilometragem</p>
                                          <p className="mt-0.5 text-[15px] font-medium text-zinc-900 dark:text-white">{serviceOrderDetail.mileage_km || '—'}</p>
                                        </div>
                                      </div>
                                      {(serviceOrderDetail.vehicle_color ||
                                        serviceOrderDetail.vehicle_year ||
                                        serviceOrderDetail.vehicle_engine_info) && (
                                        <>
                                          {serviceOrderDetail.vehicle_color ? (
                                            <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                                              <FileText className="h-[18px] w-[18px] shrink-0 text-[#007AFF]/85" />
                                              <div className="min-w-0 flex-1">
                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Cor</p>
                                                <p className="mt-0.5 text-[15px] font-medium text-zinc-900 dark:text-white">{serviceOrderDetail.vehicle_color}</p>
                                              </div>
                                            </div>
                                          ) : null}
                                          {serviceOrderDetail.vehicle_year ? (
                                            <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                                              <FileText className="h-[18px] w-[18px] shrink-0 text-[#007AFF]/85" />
                                              <div className="min-w-0 flex-1">
                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Ano</p>
                                                <p className="mt-0.5 text-[15px] font-medium text-zinc-900 dark:text-white">{serviceOrderDetail.vehicle_year}</p>
                                              </div>
                                            </div>
                                          ) : null}
                                          {serviceOrderDetail.vehicle_engine_info ? (
                                            <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                                              <FileText className="h-[18px] w-[18px] shrink-0 text-[#007AFF]/85" />
                                              <div className="min-w-0 flex-1">
                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Motor</p>
                                                <p className="mt-0.5 text-[15px] font-medium text-zinc-900 dark:text-white">{serviceOrderDetail.vehicle_engine_info}</p>
                                              </div>
                                            </div>
                                          ) : null}
                                        </>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                              </div>
                              <div className="order-2">
                              {serviceOrderDetail.customers && (
                                <>
                                  <div className="space-y-3">
                                    <p className={`${iosLabel} ml-0.5`}>Cliente</p>
                                    <div className={`${vi} divide-y divide-zinc-200/60 overflow-hidden p-0 dark:divide-white/[0.06]`}>
                                      <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                                        <User className="h-[18px] w-[18px] shrink-0 text-[#007AFF]/85" />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Nome</p>
                                          <p className="mt-0.5 text-[15px] font-medium leading-snug text-zinc-900 dark:text-white">{serviceOrderDetail.customers.name || '—'}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                                        <Smartphone className="h-[18px] w-[18px] shrink-0 text-[#007AFF]/85" />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Telefone</p>
                                          <p className="mt-0.5 text-[15px] font-medium text-zinc-900 dark:text-white">{serviceOrderDetail.customers.phone || '—'}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                                        <Mail className="h-[18px] w-[18px] shrink-0 text-[#007AFF]/85" />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">E-mail</p>
                                          <p className="mt-0.5 truncate text-[15px] font-medium text-zinc-900 dark:text-white">{serviceOrderDetail.customers.email || '—'}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                                        <FileText className="h-[18px] w-[18px] shrink-0 text-[#007AFF]/85" />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">CPF</p>
                                          <p className="mt-0.5 text-[15px] font-medium text-zinc-900 dark:text-white">{serviceOrderDetail.customers.cpf || '—'}</p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="space-y-3">
                                    <p className={`${iosLabel} ml-0.5`}>Endereço</p>
                                    <div className={`${vi} px-4 py-4 sm:px-5 sm:py-4`}>
                                      <div className="flex gap-3">
                                        <MapPin className="h-[18px] w-[18px] shrink-0 text-[#007AFF]/85 mt-0.5" />
                                        <p className="text-[15px] font-medium leading-relaxed text-zinc-900 dark:text-white">
                                          {[serviceOrderDetail.customers.address, serviceOrderDetail.customers.address_number, serviceOrderDetail.customers.cep].filter(Boolean).join(' · ') || '—'}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </>
                              )}
                              </div>
                            </div>
                          )}
                          {can('canEditFicha') && (
                            <div className="order-3 flex flex-wrap items-center gap-2 border-t border-zinc-200/50 pt-4 dark:border-white/[0.06]">
                              <button
                                type="button"
                                onClick={() => {
                                  if (!serviceOrderDetail) return;
                                  const c = serviceOrderDetail.customers;
                                  setEditFichaForm({
                                    name: c?.name ?? '', cpf: c?.cpf ?? '', phone: c?.phone ?? '', email: c?.email ?? '',
                                    cep: c?.cep ?? '', address: c?.address ?? '', addressNumber: c?.address_number ?? '',
                                    vehicleModel: serviceOrderDetail.vehicle_model ?? '', vehicleBrand: serviceOrderDetail.vehicle_brand ?? '', moduleIdentification: serviceOrderDetail.module_identification ?? '',
                                    plate: (serviceOrderDetail.plate ?? '').toUpperCase(), mileageKm: serviceOrderDetail.mileage_km ?? '',
                                    vehicleColor: serviceOrderDetail.vehicle_color ?? '',
                                    vehicleYear: serviceOrderDetail.vehicle_year ?? '',
                                    vehicleEngineInfo: serviceOrderDetail.vehicle_engine_info ?? '',
                                  });
                                  setIsDadosFichaExpanded(false);
                                }}
                                className="flex-1 min-w-[108px] rounded-lg border border-zinc-200/90 px-3 py-1.5 text-[12px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-white/[0.12] dark:text-zinc-300 dark:hover:bg-white/[0.06] dark:hover:text-white sm:flex-none"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveEditFicha}
                                disabled={editFichaSaving}
                                className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-1 rounded-lg bg-[#007AFF] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm shadow-blue-500/20 transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-45 sm:flex-none"
                              >
                                {editFichaSaving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                Salvar
                              </button>
                            </div>
                          )}
                        </div>
                        )}
                      </div>
                    </div>
                  )}
                        {/* Técnico + Data de entrega — compactos (mesmo idioma visual, menos altura) */}
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5">
                          {can('canAssignTechnician') && (
                          <button
                            type="button"
                            onClick={() => setCardForMemberAssignment(selectedCard)}
                            className={`${vi} group relative w-full overflow-hidden text-left shadow-[0_6px_24px_-10px_rgba(0,0,0,0.1)] transition-all duration-200 active:scale-[0.99] hover:border-[#007AFF]/28 dark:shadow-[0_10px_32px_-14px_rgba(0,0,0,0.45)] dark:hover:border-white/[0.12]`}
                          >
                            <div
                              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.07),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(245,208,11,0.08),transparent_50%)] dark:bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.11),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(245,208,11,0.1),transparent_52%)]"
                              aria-hidden
                            />
                            <div
                              className="pointer-events-none absolute -right-10 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-gradient-to-br from-[#007AFF]/14 to-transparent opacity-80 blur-2xl dark:from-[#007AFF]/22"
                              aria-hidden
                            />
                            <div className="relative flex items-center gap-2 px-2.5 py-2 sm:gap-2.5 sm:px-3 sm:py-2.5">
                              {selectedCard.members && selectedCard.members.length > 0 ? (
                                <>
                                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl shadow-md ${getMechanicButtonStyle(selectedCard.members[0].fullName, selectedCard.members[0].id)}`}>
                                    <Wrench className="h-4 w-4 text-white opacity-95 [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.35))]" strokeWidth={2.35} aria-hidden />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-600 bg-clip-text text-[12px] font-bold leading-tight tracking-[-0.02em] text-transparent dark:from-white dark:via-zinc-100 dark:to-zinc-400 sm:text-[13px]">
                                      Técnico responsável
                                    </p>
                                    <p className="mt-0.5 truncate text-[12px] font-semibold leading-tight text-zinc-900 dark:text-white">
                                      {capitalizeFirst(selectedCard.members[0].fullName)}
                                    </p>
                                  </div>
                                  <ChevronRight strokeWidth={2.25} className="relative z-[1] h-3.5 w-3.5 shrink-0 text-[#007AFF]/55 transition-transform duration-200 group-hover:text-[#007AFF]/85 dark:text-[#7ab8ff]/70 dark:group-hover:text-[#7ab8ff]" aria-hidden />
                                </>
                              ) : (
                                <>
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-dashed border-[#007AFF]/35 bg-[#007AFF]/[0.08] dark:border-[#007AFF]/45 dark:bg-[#007AFF]/12">
                                    <Wrench className="h-4 w-4 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2.35} aria-hidden />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-600 bg-clip-text text-[12px] font-bold leading-tight tracking-[-0.02em] text-transparent dark:from-white dark:via-zinc-100 dark:to-zinc-400 sm:text-[13px]">
                                      Técnico responsável
                                    </p>
                                    <p className="mt-0.5 text-[12px] font-semibold leading-tight text-[#007AFF] dark:text-[#7ab8ff]">
                                      Toque para atribuir
                                    </p>
                                  </div>
                                  <ChevronRight strokeWidth={2.25} className="relative z-[1] h-3.5 w-3.5 shrink-0 text-zinc-400 transition-colors group-hover:text-[#007AFF]/70 dark:text-zinc-500 dark:group-hover:text-[#7ab8ff]" aria-hidden />
                                </>
                              )}
                            </div>
                          </button>
                          )}
                          {can('canEditDeliveryDate') && (
                          <div className={`${vi} relative overflow-hidden shadow-[0_6px_24px_-10px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_32px_-14px_rgba(0,0,0,0.45)]`}>
                            <div
                              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.07),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(245,208,11,0.08),transparent_50%)] dark:bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.11),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(245,208,11,0.1),transparent_52%)]"
                              aria-hidden
                            />
                            <div
                              className="pointer-events-none absolute -right-10 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-gradient-to-br from-brand-yellow/18 to-transparent opacity-70 blur-2xl dark:from-brand-yellow/15"
                              aria-hidden
                            />
                            <div className="relative flex flex-col gap-2 px-2.5 py-2 sm:flex-row sm:items-center sm:gap-2.5 sm:px-3 sm:py-2.5">
                              <div className="flex shrink-0 items-center gap-2 sm:contents">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-200/95 bg-gradient-to-b from-white to-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_-4px_rgba(0,0,0,0.1)] dark:border-white/[0.1] dark:from-white/[0.12] dark:to-white/[0.04]">
                                  <Calendar className="h-4 w-4 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2.25} aria-hidden />
                                </div>
                                <div className="min-w-0 flex-1 sm:pb-0">
                                  <p className="bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-600 bg-clip-text text-[12px] font-bold leading-tight tracking-[-0.02em] text-transparent dark:from-white dark:via-zinc-100 dark:to-zinc-400 sm:text-[13px]">
                                    Data de entrega
                                  </p>
                                </div>
                              </div>
                              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:justify-end">
                                <input
                                  type="date"
                                  value={deliveryDateEditValue}
                                  onChange={(e) => setDeliveryDateEditValue(e.target.value)}
                                  className="min-w-0 flex-1 rounded-xl border border-zinc-300/90 bg-zinc-50 px-2.5 py-1.5 text-[13px] text-zinc-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.1] dark:bg-zinc-950/50 dark:text-white sm:max-w-[180px] sm:flex-none"
                                />
                                <button
                                  type="button"
                                  onClick={handleSaveDeliveryDate}
                                  disabled={savingDeliveryDate || deliveryDateEditValue === lastSavedDeliveryDate}
                                  className={`inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-md transition-all disabled:opacity-50 ${
                                    deliveryDateEditValue !== lastSavedDeliveryDate
                                      ? 'bg-[#007AFF] shadow-blue-500/20 hover:opacity-95 active:scale-[0.98]'
                                      : 'bg-zinc-600 shadow-none dark:bg-zinc-700'
                                  }`}
                                >
                                  {savingDeliveryDate ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                  Salvar
                                </button>
                                {deliveryDateSavedMessage && (
                                  <span className="text-[11px] font-semibold text-green-600 dark:text-green-400">Salvo!</span>
                                )}
                              </div>
                            </div>
                          </div>
                          )}
                        </div>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 p-8 pt-3 md:px-12 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)] lg:gap-7 lg:items-start xl:grid-cols-[minmax(0,1fr)_minmax(232px,288px)]">
                      
                      <div className="min-w-0 space-y-6">
                        <div ref={descriptionSectionRef}>
                          <div className={`${vi} min-w-0 overflow-hidden shadow-[0_8px_30px_-8px_rgba(0,0,0,0.12),0_2px_12px_-6px_rgba(0,0,0,0.06)] dark:shadow-[0_14px_38px_-12px_rgba(0,0,0,0.5),0_4px_14px_-8px_rgba(0,0,0,0.28)]`}>
                            <div className="relative min-w-0">
                            <div
                              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.07),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(245,208,11,0.08),transparent_50%)] dark:bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.11),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(245,208,11,0.1),transparent_52%)]"
                              aria-hidden
                            />
                            <div
                              className="pointer-events-none absolute -right-10 top-8 h-24 w-24 rounded-full bg-gradient-to-br from-[#007AFF]/14 to-transparent opacity-80 blur-2xl dark:from-[#007AFF]/22"
                              aria-hidden
                            />

                            <div className="relative flex items-center justify-between gap-2 border-b border-black/[0.06] bg-white/85 px-2.5 py-2 pl-3 backdrop-blur-[2px] dark:border-white/[0.08] dark:bg-zinc-950/35 sm:gap-3 sm:px-3 sm:py-2.5 sm:pl-4">
                              <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-200/95 bg-gradient-to-b from-white to-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_-4px_rgba(0,0,0,0.1)] dark:border-white/[0.1] dark:from-white/[0.12] dark:to-white/[0.04]">
                                  <FileText className="h-4 w-4 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2.25} aria-hidden />
                                </div>
                                <p className="bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-600 bg-clip-text text-[16px] font-bold leading-tight tracking-[-0.03em] text-transparent dark:from-white dark:via-zinc-100 dark:to-zinc-400 sm:text-[17px]">
                                  Queixa do cliente
                                </p>
                              </div>
                              {can('canEditQueixa') && !isEditingDesc && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsEditingDesc(true);
                                    setDescText(selectedCard.desc || '');
                                  }}
                                  className="relative z-[1] inline-flex shrink-0 items-center gap-1 rounded-xl border border-[#007AFF]/25 bg-[#007AFF]/[0.09] px-2.5 py-1 text-[11px] font-semibold text-[#007AFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-colors hover:border-[#007AFF]/40 hover:bg-[#007AFF]/15 dark:border-[#007AFF]/35 dark:bg-[#007AFF]/15 dark:text-[#b8d9ff] dark:hover:bg-[#007AFF]/22"
                                >
                                  <Pencil className="h-3 w-3" aria-hidden strokeWidth={2.5} />
                                  Editar
                                </button>
                              )}
                            </div>

                            {isEditingDesc ? (
                              <div className="animate-in fade-in duration-200 flex flex-col gap-3 bg-zinc-50/90 px-3 py-3 pl-3 dark:bg-white/[0.02] sm:px-4 sm:py-4 sm:pl-4">
                                <textarea
                                  data-queixa-textarea
                                  value={descText}
                                  onChange={(e) => setDescText(e.target.value)}
                                  className={`${vin} relative z-[2] min-h-[180px] resize-none cursor-text text-[15px] leading-relaxed !caret-[#007AFF] dark:text-white dark:!caret-[#93c5fd]`}
                                  placeholder="Digite a queixa do cliente..."
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setIsEditingDesc(false)}
                                    disabled={isSavingDesc}
                                    className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-zinc-500 transition-colors hover:bg-black/5 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSaveDescription}
                                    disabled={isSavingDesc}
                                    className="inline-flex items-center gap-1 rounded-lg bg-[#007AFF] px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-sm shadow-blue-500/20 transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-45"
                                  >
                                    {isSavingDesc ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                    Salvar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="border-t border-zinc-200/60 bg-zinc-50/90 px-3 py-3 pl-3 dark:border-white/[0.06] dark:bg-white/[0.02] sm:px-4 sm:py-4 sm:pl-4">
                                <div className={uiReadBody}>
                                  <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponentsApp}>
                                    {selectedCard.desc || 'Nenhuma descrição disponível para este veículo.'}
                                  </ReactMarkdown>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        </div>

                        <div className="h-px bg-zinc-200/80 dark:bg-white/[0.06]" />

                         {/* Orçamentos: cabeçalho iOS; lista com aro em gradiente nos itens */}
                         {can('canEditBudgets') && (
                         <div ref={budgetsSectionRef}>
                          <div className={`${vi} min-w-0 overflow-hidden shadow-[0_8px_30px_-8px_rgba(0,0,0,0.12),0_2px_12px_-6px_rgba(0,0,0,0.06)] dark:shadow-[0_14px_38px_-12px_rgba(0,0,0,0.5),0_4px_14px_-8px_rgba(0,0,0,0.28)]`}>
                            <div className="relative min-w-0">
                              <div
                                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.07),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(245,208,11,0.08),transparent_50%)] dark:bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.11),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(245,208,11,0.1),transparent_52%)]"
                                aria-hidden
                              />
                              <div
                                className="pointer-events-none absolute -right-10 top-8 h-24 w-24 rounded-full bg-gradient-to-br from-[#007AFF]/14 to-transparent opacity-80 blur-2xl dark:from-[#007AFF]/22"
                                aria-hidden
                              />

                              <div className="relative flex items-center gap-2 border-b border-black/[0.06] bg-white/85 px-2.5 py-2 pl-3 backdrop-blur-[2px] dark:border-white/[0.08] dark:bg-zinc-950/35 sm:gap-3 sm:px-3 sm:py-2.5 sm:pl-4">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-200/95 bg-gradient-to-b from-white to-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_-4px_rgba(0,0,0,0.1)] dark:border-white/[0.1] dark:from-white/[0.12] dark:to-white/[0.04]">
                                  <Calculator className="h-4 w-4 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2.25} aria-hidden />
                                </div>
                                <p className="bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-600 bg-clip-text text-[16px] font-bold leading-tight tracking-[-0.03em] text-transparent dark:from-white dark:via-zinc-100 dark:to-zinc-400 sm:text-[17px]">
                                  Orçamentos
                                </p>
                              </div>

                              <div className="relative space-y-3 border-t border-zinc-200/60 bg-zinc-50/90 px-3 py-3 dark:border-white/[0.06] dark:bg-white/[0.02] sm:px-4 sm:py-4">
                                <button
                                  type="button"
                                  onClick={() => openBudgetModal()}
                                  className="group w-full rounded-xl bg-[#4FA8FF] px-3 py-3.5 text-left text-white shadow-[0_4px_14px_-4px_rgba(79,168,255,0.55)] transition-[filter,transform,background-color,box-shadow] hover:bg-[#3397F8] hover:shadow-[0_8px_22px_-6px_rgba(79,168,255,0.45)] active:scale-[0.99] dark:bg-white dark:text-zinc-950 dark:shadow-[0_4px_22px_-8px_rgba(255,255,255,0.22)] dark:hover:bg-zinc-100 dark:hover:shadow-[0_8px_26px_-8px_rgba(255,255,255,0.28)]"
                                >
                                  <span className="flex items-center justify-between gap-3">
                                    <span className="font-semibold">Criar orçamento</span>
                                    <Calculator className="h-5 w-5 shrink-0 text-white transition-transform group-hover:scale-110 dark:text-[#007AFF]" strokeWidth={2.25} />
                                  </span>
                                </button>

                                <div className="max-h-[380px] space-y-2.5 overflow-y-auto rounded-xl border border-zinc-200/75 bg-white/95 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-white/[0.08] dark:bg-zinc-950/50">
                              {savedBudgets
                                .filter((b) => b.serviceOrderId === selectedCard.id)
                                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                                .map((budget, index) => {
                                  const preview =
                                    budget.diagnosis?.split('\n')[0]?.slice(0, 42) ||
                                    budget.services[0]?.description?.slice(0, 42) ||
                                    (budget.parts[0] ? `${budget.parts[0].quantity}x ${budget.parts[0].description?.slice(0, 30)}` : '') ||
                                    'Orçamento';
                                  const dateStr = new Date(budget.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                                  const numero = index + 1;
                                  return (
                                    <div
                                      key={budget.id}
                                      className="rounded-[18px] bg-gradient-to-r from-[#007AFF] via-brand-yellow to-[#007AFF] p-[2px] shadow-[0_6px_16px_-8px_rgba(0,122,255,0.33)] dark:shadow-[0_10px_24px_-12px_rgba(59,130,246,0.32)]"
                                    >
                                    <button
                                      type="button"
                                      onClick={() => setViewingBudget(budget)}
                                      className="group relative w-full overflow-hidden rounded-[16px] border border-white/85 bg-white/95 p-3.5 text-left shadow-[0_6px_16px_-8px_rgba(0,0,0,0.22)] ring-1 ring-transparent transition-all duration-200 hover:-translate-y-[1px] hover:border-white hover:shadow-[0_10px_22px_-8px_rgba(0,122,255,0.33)] hover:ring-[#007AFF]/20 active:translate-y-0 dark:border-white/[0.08] dark:bg-zinc-950/85 dark:shadow-[0_8px_20px_-10px_rgba(0,0,0,0.6)] dark:hover:border-[#93c5fd]/35 dark:hover:shadow-[0_12px_26px_-10px_rgba(59,130,246,0.28)] dark:hover:ring-[#7ab8ff]/20"
                                    >
                                      <div className="mb-2.5 flex items-center justify-between gap-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-100">
                                          Orçamento {numero}
                                        </span>
                                        <span className="h-1.5 w-1.5 rounded-full bg-[#007AFF] dark:bg-[#93c5fd]" aria-hidden />
                                      </div>
                                      <p className="mb-2 line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
                                        {preview}
                                      </p>
                                      <div className="mb-2 flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                                        <span>{budget.services.length} serviço{budget.services.length !== 1 ? 's' : ''}</span>
                                        <span>·</span>
                                        <span>{budget.parts.length} peça{budget.parts.length !== 1 ? 's' : ''}</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-2 border-t border-zinc-200/80 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:border-white/[0.08] dark:text-zinc-400">
                                        <span>{dateStr}</span>
                                        <span className="text-[#007AFF] dark:text-[#93c5fd]">Toque para abrir</span>
                                      </div>
                                    </button>
                                    </div>
                                  );
                                })}
                              {savedBudgets.filter((b) => b.serviceOrderId === selectedCard.id).length === 0 && (
                                <div className="rounded-xl border border-dashed border-zinc-300/95 bg-zinc-50/90 p-5 text-center dark:border-white/[0.12] dark:bg-white/[0.04]">
                                  <Calculator className="mx-auto mb-2 h-9 w-9 text-[#007AFF]/75 dark:text-[#7ab8ff]" />
                                  <p className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Nenhum orçamento</p>
                                  <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">Crie um orçamento pelo botão acima</p>
                                </div>
                              )}
                              </div>

                              {can('canApproveBudgetItems') && savedBudgets.filter((b) => b.serviceOrderId === selectedCard.id).length > 0 && (
                                <div className="rounded-xl border border-zinc-200/75 bg-white/90 p-3 shadow-sm dark:border-white/[0.08] dark:bg-zinc-950/35">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">Aprovar orçamento</p>
                                  <p className="mt-1 text-[11px] leading-snug text-zinc-600 dark:text-zinc-500">Selecione um orçamento para marcar cada serviço e peça como aprovado ou reprovado.</p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {savedBudgets
                                      .filter((b) => b.serviceOrderId === selectedCard.id)
                                      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                                      .map((budget, idx) => (
                                        <button
                                          key={budget.id}
                                          type="button"
                                          onClick={() => openBudgetApproval(budget)}
                                          className="inline-flex items-center gap-2 rounded-xl border border-[#007AFF]/25 bg-[#007AFF]/[0.08] px-3 py-2 text-[13px] font-semibold text-[#007AFF] shadow-sm transition-colors hover:border-[#007AFF]/40 hover:bg-[#007AFF]/14 dark:border-[#007AFF]/35 dark:bg-[#007AFF]/15 dark:text-[#b8d9ff] dark:hover:bg-[#007AFF]/22"
                                        >
                                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                                          Aprovar orçamento {idx + 1}
                                        </button>
                                      ))}
                                  </div>
                                </div>
                              )}
                              </div>
                            </div>
                          </div>
                         </div>
                         )}

                        <div className="h-px bg-zinc-200/80 dark:bg-white/[0.06]" />

                         {/* Anexos (fotos) + Documentos (arquivos) */}
                         <div className={`${vi} overflow-hidden shadow-[0_8px_30px_-8px_rgba(0,0,0,0.1),0_2px_10px_-6px_rgba(0,0,0,0.06)] dark:shadow-[0_12px_34px_-12px_rgba(0,0,0,0.45)]`}>
                            <div className="border-b border-zinc-200/70 bg-white/85 px-3 py-3 dark:border-white/[0.08] dark:bg-zinc-950/35 sm:px-4 sm:py-3.5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-200/95 bg-gradient-to-b from-white to-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_-4px_rgba(0,0,0,0.1)] dark:border-white/[0.1] dark:from-white/[0.12] dark:to-white/[0.04]">
                                      <Paperclip className="h-4 w-4 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2.25} aria-hidden />
                                    </div>
                                    <p className="bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-600 bg-clip-text text-[16px] font-bold leading-tight tracking-[-0.03em] text-transparent dark:from-white dark:via-zinc-100 dark:to-zinc-400 sm:text-[17px]">
                                      Anexos
                                    </p>
                                  </div>
                                  <p className="mt-1.5 max-w-md text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                                    Links úteis ficam logo abaixo dos botões. Cada foto pode ter um nome — aparece abaixo da miniatura. Use o lápis para renomear e a lixeira para excluir (fotos e documentos).
                                  </p>
                                </div>
                                <div className="grid grid-cols-3 gap-2 sm:gap-2 sm:justify-items-end sm:shrink-0">
                                    <input 
                                        type="file" 
                                        ref={galleryInputRef} 
                                        className="hidden" 
                                        accept="image/*,application/pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.pdf"
                                        multiple
                                        onChange={handleGallerySelect}
                                    />
                                    <input 
                                        type="file" 
                                        ref={cameraInputRef} 
                                        className="hidden" 
                                        accept="image/*,.png,.jpg,.jpeg,.webp,.heic,.heif,.bmp"
                                        capture="environment"
                                        onChange={handleCameraFileSelect}
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => cameraInputRef.current?.click()}
                                        disabled={isUploading}
                                        className="flex items-center justify-center w-12 h-12 sm:w-10 sm:h-10 rounded-2xl sm:rounded-xl bg-white/90 dark:bg-white/[0.08] border border-zinc-200/80 dark:border-white/10 shadow-sm active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.12] transition-all duration-200"
                                        title="Abrir câmera do dispositivo"
                                    >
                                        <Camera className="w-6 h-6 sm:w-5 sm:h-5 shrink-0" strokeWidth={2} />
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => galleryInputRef.current?.click()}
                                        disabled={isUploading}
                                        className="flex items-center justify-center w-12 h-12 sm:w-10 sm:h-10 rounded-2xl sm:rounded-xl bg-white/90 dark:bg-white/[0.08] border border-zinc-200/80 dark:border-white/10 shadow-sm active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.12] transition-all duration-200"
                                        title="Galeria / Documentos"
                                    >
                                        <ImageIcon className="w-6 h-6 sm:w-5 sm:h-5 shrink-0" strokeWidth={2} />
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => galleryInputRef.current?.click()}
                                        disabled={isUploading}
                                        className="flex items-center justify-center w-12 h-12 sm:w-10 sm:h-10 rounded-2xl sm:rounded-xl bg-white/90 dark:bg-white/[0.08] border border-zinc-200/80 dark:border-white/10 shadow-sm active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.12] transition-all duration-200"
                                        title="Arquivos do dispositivo"
                                    >
                                        <FolderOpen className="w-6 h-6 sm:w-5 sm:h-5 shrink-0" strokeWidth={2} />
                                    </button>
                                </div>
                            </div>
                            </div>

                            {serviceOrderDetail && (referenceLinksDraft.length > 0 || can('canEditFicha')) && (
                              <div className="px-3 py-4 sm:px-4 sm:py-5">
                                <div
                                  className={`${vi} overflow-hidden p-4 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.08)] dark:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.45)] sm:p-5`}
                                >
                                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                                    <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                                      <Link2 className="h-3.5 w-3.5" />
                                      Links úteis
                                    </h3>
                                    {can('canEditFicha') && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setReferenceLinksDraft((prev) => [
                                            ...prev,
                                            { id: crypto.randomUUID(), label: '', url: '' },
                                          ])
                                        }
                                        className="inline-flex items-center gap-1 rounded-xl border border-zinc-200/90 px-3 py-1.5 text-[12px] font-semibold text-[#007AFF] transition-colors hover:bg-zinc-100 dark:border-white/[0.12] dark:hover:bg-white/[0.06]"
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                        Adicionar link
                                      </button>
                                    )}
                                  </div>
                                  {referenceLinksDraft.length === 0 ? (
                                    <p className="text-[14px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                                      Nenhum link anexado.
                                    </p>
                                  ) : (
                                    <ul className="space-y-3">
                                      {referenceLinksDraft.map((link) => (
                                        <li
                                          key={link.id}
                                          className="flex flex-col gap-2 rounded-2xl border border-zinc-200/70 bg-zinc-50/50 p-3 dark:border-white/[0.08] dark:bg-white/[0.03] sm:flex-row sm:items-end sm:gap-3"
                                        >
                                          {can('canEditFicha') ? (
                                            <>
                                              <div className="min-w-0 flex-1 space-y-2">
                                                <div>
                                                  <label className={`${iosLabel} !mb-1`}>Título</label>
                                                  <input
                                                    value={link.label}
                                                    onChange={(e) => {
                                                      const v = e.target.value;
                                                      setReferenceLinksDraft((prev) =>
                                                        prev.map((x) => (x.id === link.id ? { ...x, label: v } : x))
                                                      );
                                                    }}
                                                    placeholder="Ex.: Manual do proprietário"
                                                    className={vin}
                                                  />
                                                </div>
                                                <div>
                                                  <label className={`${iosLabel} !mb-1`}>URL</label>
                                                  <input
                                                    value={link.url}
                                                    onChange={(e) => {
                                                      const v = e.target.value;
                                                      setReferenceLinksDraft((prev) =>
                                                        prev.map((x) => (x.id === link.id ? { ...x, url: v } : x))
                                                      );
                                                    }}
                                                    placeholder="https://..."
                                                    inputMode="url"
                                                    autoComplete="off"
                                                    className={vin}
                                                  />
                                                </div>
                                              </div>
                                              <div className="flex shrink-0 gap-2 sm:flex-col">
                                                {link.url.trim() && /^https?:\/\//i.test(link.url.trim()) ? (
                                                  <a
                                                    href={link.url.trim()}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-zinc-200/90 px-3 py-2 text-[13px] font-semibold text-zinc-700 transition-colors hover:bg-white dark:border-white/[0.12] dark:text-zinc-200 dark:hover:bg-white/[0.06]"
                                                  >
                                                    <ExternalLink className="h-4 w-4" />
                                                    Abrir
                                                  </a>
                                                ) : null}
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setReferenceLinksDraft((prev) => prev.filter((x) => x.id !== link.id))
                                                  }
                                                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-red-200/90 px-3 py-2 text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-950/40"
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                  Remover
                                                </button>
                                              </div>
                                            </>
                                          ) : (
                                            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                                              <span className="text-[15px] font-medium text-zinc-900 dark:text-white">
                                                {link.label?.trim() || link.url}
                                              </span>
                                              {link.url.trim() ? (
                                                <a
                                                  href={
                                                    link.url.trim().match(/^https?:\/\//i)
                                                      ? link.url.trim()
                                                      : `https://${link.url.trim().replace(/^\/+/, '')}`
                                                  }
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#007AFF] hover:underline dark:text-[#64B5FF]"
                                                >
                                                  Abrir <ExternalLink className="h-4 w-4" />
                                                </a>
                                              ) : null}
                                            </div>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  {can('canEditFicha') && referenceLinksDraft.length > 0 && (
                                    <div className="mt-4 flex justify-end border-t border-zinc-200/60 pt-4 dark:border-white/[0.06]">
                                      <button
                                        type="button"
                                        onClick={handleSaveReferenceLinks}
                                        disabled={referenceLinksSaving}
                                        className={`${iosPrimaryButton} inline-flex items-center gap-2 px-6 py-2.5`}
                                      >
                                        {referenceLinksSaving ? (
                                          <RefreshCw className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Save className="h-4 w-4" />
                                        )}
                                        Salvar links
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

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
                                    const images = attachments.filter(att => att.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp)$/i.test(att.url));
                                    const others = attachments.filter(att => !(att.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp)$/i.test(att.url)));
                                    const visibleImages = images.slice(0, vehicleModalPhotoVisibleCount);
                                    const hiddenPhotoCount = images.length - visibleImages.length;
                                    return (
                                      <div className="space-y-8">
                                        {images.length > 0 && (
                                          <div>
                                            <div className="mb-2 flex min-w-0 items-center gap-2 pl-0.5 sm:gap-2.5 sm:pl-1">
                                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-200/95 bg-gradient-to-b from-white to-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_-4px_rgba(0,0,0,0.1)] dark:border-white/[0.1] dark:from-white/[0.12] dark:to-white/[0.04]">
                                                <ImageIcon className="h-4 w-4 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2.25} aria-hidden />
                                              </div>
                                              <p className="bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-600 bg-clip-text text-[16px] font-bold leading-tight tracking-[-0.03em] text-transparent dark:from-white dark:via-zinc-100 dark:to-zinc-400 sm:text-[17px]">
                                                Fotos
                                              </p>
                                            </div>
                                            <div className="rounded-2xl border border-zinc-200/70 bg-white/70 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] dark:border-white/[0.08] dark:bg-white/[0.03]">
                                            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 md:gap-3">
                                            {visibleImages.map(att => {
                                              const isLoadingThis = loadingAttachmentId === att.id;
                                              const isDeletingThis = deletingAttachmentId === att.id;
                                              const attachmentPath = att.id;
                                              const canRename = attachmentPath && !/^\d+$/.test(String(attachmentPath));
                                              const isEditingName = renameAttachmentId === att.id;
                                              const isRenamingThis = renamingAttachmentId === att.id;
                                              const label = attachmentDisplayName(att.name);
                                              return (
                                                <div
                                                  key={att.id}
                                                  className="flex min-w-0 flex-col gap-1"
                                                >
                                                  {isEditingName ? (
                                                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
                                                      <input
                                                        type="text"
                                                        value={renameAttachmentNewName}
                                                        onChange={(e) => setRenameAttachmentNewName(e.target.value)}
                                                        onKeyDown={(e) => {
                                                          if (e.key === "Enter") {
                                                            e.preventDefault();
                                                            if (selectedCard && renameAttachmentNewName.trim()) {
                                                              setRenamingAttachmentId(att.id);
                                                              renameServiceOrderPhoto(selectedCard.id, attachmentPath, renameAttachmentNewName.trim())
                                                                .then(() => getServiceOrderPhotos(selectedCard.id))
                                                                .then((photos) => {
                                                                  setCardDetails((prev) =>
                                                                    prev
                                                                      ? {
                                                                          ...prev,
                                                                          attachments: photos.map((p, i) => ({
                                                                            id: p.path || String(i),
                                                                            name: p.name,
                                                                            url: p.url,
                                                                            mimeType: attachmentMimeType(p.name),
                                                                            previews: [{ url: p.url, width: 200, height: 200 }],
                                                                          })),
                                                                        }
                                                                      : null
                                                                  );
                                                                })
                                                                .catch((err) => alert(err?.message ?? "Erro ao renomear."))
                                                                .finally(() => {
                                                                  setRenameAttachmentId(null);
                                                                  setRenamingAttachmentId(null);
                                                                });
                                                            }
                                                          }
                                                          if (e.key === "Escape") {
                                                            setRenameAttachmentId(null);
                                                            setRenameAttachmentNewName("");
                                                          }
                                                        }}
                                                        className="w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-[12px] text-zinc-800 focus:outline-none focus:ring-2 focus:ring-brand-yellow/40 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                                                        placeholder="Nome da foto"
                                                        autoFocus
                                                        disabled={isRenamingThis}
                                                      />
                                                      <div className="mt-1.5 flex justify-end gap-1">
                                                        <button
                                                          type="button"
                                                          onClick={() => {
                                                            setRenameAttachmentId(null);
                                                            setRenameAttachmentNewName("");
                                                          }}
                                                          className="rounded-lg px-2 py-1 text-[11px] text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                                                        >
                                                          Cancelar
                                                        </button>
                                                        <button
                                                          type="button"
                                                          disabled={isRenamingThis || !renameAttachmentNewName.trim()}
                                                          onClick={() => {
                                                            if (!selectedCard || !renameAttachmentNewName.trim()) return;
                                                            setRenamingAttachmentId(att.id);
                                                            renameServiceOrderPhoto(selectedCard.id, attachmentPath, renameAttachmentNewName.trim())
                                                              .then(() => getServiceOrderPhotos(selectedCard.id))
                                                              .then((photos) => {
                                                                setCardDetails((prev) =>
                                                                  prev
                                                                    ? {
                                                                        ...prev,
                                                                        attachments: photos.map((p, i) => ({
                                                                          id: p.path || String(i),
                                                                          name: p.name,
                                                                          url: p.url,
                                                                          mimeType: attachmentMimeType(p.name),
                                                                          previews: [{ url: p.url, width: 200, height: 200 }],
                                                                        })),
                                                                      }
                                                                    : null
                                                                );
                                                              })
                                                              .catch((err) => alert(err?.message ?? "Erro ao renomear."))
                                                              .finally(() => {
                                                                setRenameAttachmentId(null);
                                                                setRenamingAttachmentId(null);
                                                              });
                                                          }}
                                                          className="rounded-lg bg-brand-yellow px-2 py-1 text-[11px] font-semibold text-black disabled:opacity-50"
                                                        >
                                                          {isRenamingThis ? "…" : "OK"}
                                                        </button>
                                                      </div>
                                                    </div>
                                                  ) : (
                                                    <>
                                                      <div className="relative rounded-[14px] bg-gradient-to-r from-[#007AFF] via-brand-yellow to-[#007AFF] p-[2px] shadow-[0_8px_18px_-10px_rgba(0,122,255,0.45)] dark:shadow-[0_10px_24px_-12px_rgba(59,130,246,0.4)]">
                                                      <div className="group relative aspect-square overflow-hidden rounded-[12px] bg-zinc-100 dark:bg-zinc-900">
                                                        <button
                                                          type="button"
                                                          onClick={() =>
                                                            !isLoadingThis &&
                                                            setPreviewImages({
                                                              urls: images.map((a) => a.url),
                                                              currentIndex: images.findIndex((a) => a.url === att.url),
                                                            })
                                                          }
                                                          className="absolute inset-0 h-full w-full rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-yellow/50 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
                                                        >
                                                          {isLoadingThis ? (
                                                            <div className="absolute inset-0 flex items-center justify-center bg-zinc-200/80 dark:bg-zinc-800/80">
                                                              <RefreshCw className="w-6 h-6 text-brand-yellow animate-spin" />
                                                            </div>
                                                          ) : (
                                                            <>
                                                              <StorageThumbImg
                                                                src={att.url}
                                                                alt={label}
                                                                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                                                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 28vw, 180px"
                                                                thumbMaxWidth={200}
                                                                thumbMaxHeight={200}
                                                                thumbQuality={50}
                                                              />
                                                              <div className="absolute inset-0 flex items-end justify-between bg-gradient-to-t from-black/50 via-transparent to-transparent px-2 pb-2 opacity-0 transition-opacity group-hover:opacity-100">
                                                                <button
                                                                  type="button"
                                                                  onClick={(e) => handleShareImage(e, { url: att.url, name: att.name })}
                                                                  className="rounded-lg bg-black/40 p-1.5 text-white drop-shadow-lg hover:bg-black/60"
                                                                  title="Compartilhar (ex.: WhatsApp)"
                                                                >
                                                                  <Share2 className="w-5 h-5" />
                                                                </button>
                                                                <ZoomIn className="h-6 w-6 text-white drop-shadow-lg" />
                                                              </div>
                                                            </>
                                                          )}
                                                        </button>
                                                      </div>
                                                      </div>
                                                      <div className="flex min-h-[2rem] items-start gap-1">
                                                        <span
                                                          className="min-w-0 flex-1 break-words text-[10px] font-medium leading-tight text-zinc-600 dark:text-zinc-300 sm:text-[11px]"
                                                          title={label}
                                                        >
                                                          {label}
                                                        </span>
                                                        {canRename && (
                                                          <>
                                                            <button
                                                              type="button"
                                                              onClick={() => {
                                                                setRenameAttachmentId(att.id);
                                                                setRenameAttachmentNewName(attachmentDisplayName(att.name));
                                                              }}
                                                              className="shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-800 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                                                              title="Nomear ou renomear foto"
                                                              aria-label="Nomear ou renomear foto"
                                                              disabled={isDeletingThis}
                                                            >
                                                              <Pencil className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button
                                                              type="button"
                                                              onClick={() =>
                                                                handleDeleteAttachment(String(attachmentPath), att.id, att.url)
                                                              }
                                                              disabled={isDeletingThis}
                                                              className="shrink-0 rounded-md p-1 text-red-500/90 transition-colors hover:bg-red-500/15 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
                                                              title="Excluir foto"
                                                              aria-label="Excluir foto"
                                                            >
                                                              {isDeletingThis ? (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                              ) : (
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                              )}
                                                            </button>
                                                          </>
                                                        )}
                                                      </div>
                                                    </>
                                                  )}
                                                </div>
                                              );
                                            })}
                                            </div>
                                            </div>
                                            {hiddenPhotoCount > 0 && (
                                              <button
                                                type="button"
                                                className="mt-2 w-full rounded-xl border border-zinc-200/80 bg-zinc-50 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-200 dark:hover:bg-white/[0.08]"
                                                onClick={() =>
                                                  setVehicleModalPhotoVisibleCount((n) => n + VEHICLE_MODAL_PHOTOS_BATCH)
                                                }
                                              >
                                                Mostrar mais ({hiddenPhotoCount}{' '}
                                                {hiddenPhotoCount === 1 ? 'foto' : 'fotos'})
                                              </button>
                                            )}
                                          </div>
                                        )}
                                        {others.length > 0 && (
                                          <div>
                                            <h3 className={uiSectionTitleRow}>
                                              <FileText className="h-3.5 w-3.5" />
                                              Documentos
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                              {others.map(att => {
                                                const isPdf = isPdfAttachment(att.mimeType, att.url);
                                                const isLoadingThis = loadingAttachmentId === att.id;
                                                const isDeletingThis = deletingAttachmentId === att.id;
                                                const isRenamingThis = renamingAttachmentId === att.id;
                                                const isEditingName = renameAttachmentId === att.id;
                                                const attachmentPath = att.id;
                                                // Permite renomear quando temos um path real (vindo da API); id numérico é fallback do índice
                                                const canRename = attachmentPath && !/^\d+$/.test(String(attachmentPath));
                                                return (
                                                  <div key={att.id} className="flex items-center gap-2 min-w-0 max-w-full">
                                                    {isEditingName ? (
                                                      <div className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                                                        <FileText className="w-5 h-5 text-zinc-500 shrink-0" />
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
                                                            <FileText className="w-5 h-5 text-zinc-500 shrink-0" />
                                                          )}
                                                          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">{attachmentDisplayName(att.name)}</span>
                                                          {(isPdf || !att.mimeType?.startsWith('image/')) && <ExternalLink className="w-4 h-4 text-zinc-400 shrink-0" />}
                                                        </a>
                                                        {canRename && (
                                                          <>
                                                            <button
                                                              type="button"
                                                              onClick={() => {
                                                                setRenameAttachmentId(att.id);
                                                                setRenameAttachmentNewName(attachmentDisplayName(att.name));
                                                              }}
                                                              className="shrink-0 p-2 rounded-lg text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-300 disabled:opacity-50"
                                                              title="Renomear arquivo"
                                                              disabled={isDeletingThis}
                                                            >
                                                              <Pencil className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                              type="button"
                                                              onClick={() =>
                                                                handleDeleteAttachment(String(attachmentPath), att.id, att.url)
                                                              }
                                                              disabled={isDeletingThis}
                                                              className="shrink-0 p-2 rounded-lg text-red-500/90 hover:bg-red-500/15 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
                                                              title="Excluir arquivo"
                                                              aria-label="Excluir arquivo"
                                                            >
                                                              {isDeletingThis ? (
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                              ) : (
                                                                <Trash2 className="w-4 h-4" />
                                                              )}
                                                            </button>
                                                          </>
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

                      <div className="min-w-0 space-y-8">
                        <div ref={commentsSectionRef}>
                           <h3 className={`${uiSectionTitleRow} lg:mb-2`}>
                             <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                             Comentários
                          </h3>

                          <div className={`${vi} overflow-hidden`}>
                             <div ref={commentsListRef} className="custom-scrollbar max-h-[min(420px,52vh)] space-y-5 overflow-y-auto bg-zinc-50/40 p-4 dark:bg-black/25 sm:p-5 sm:space-y-6 lg:max-h-[min(220px,32vh)] lg:space-y-3 lg:p-3">
                                {loadingDetails ? (
                                   <div className="flex justify-center py-8 lg:py-6">
                                      <RefreshCw className="h-6 w-6 animate-spin text-[#007AFF] lg:h-5 lg:w-5" />
                                   </div>
                                ) : cardDetails?.actions && cardDetails.actions.length > 0 ? (
                                   cardDetails.actions.map(action => {
                                      const avatar = getCommentAuthorAvatar(action.memberCreator.fullName, action.memberCreator.avatarUrl);
                                      return (
                                      <div key={action.id} className="flex gap-3 group/comment lg:gap-2">
                                         <div className={`flex h-10 w-10 shrink-0 flex-shrink-0 overflow-hidden rounded-full lg:h-8 lg:w-8 ${avatar.useLogo ? 'bg-brand-yellow' : ''}`}>
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
                                                   <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponentsApp}>
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
                             <div className="flex items-end gap-2 border-t border-zinc-200/50 bg-white/50 p-3 dark:border-white/[0.06] dark:bg-white/[0.03] sm:p-4">
                                <input 
                                   type="text" 
                                   value={newComment}
                                   onChange={(e) => setNewComment(e.target.value)}
                                   placeholder="Escreva um comentário..."
                                   className={`${vin} min-h-[48px] flex-1 py-3 text-[15px]`}
                                   onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) handleSendComment() }}
                                />
                                <button 
                                   type="button"
                                   onClick={handleSendComment}
                                   disabled={sendingComment || !newComment.trim()}
                                   className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#007AFF] text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:opacity-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                   {sendingComment ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" strokeWidth={2.2} />}
                                </button>
                             </div>
                             )}
                          </div>
                        </div>

                         <div>
                            <p className={`${iosLabel} mb-3`}>Alterar status</p>
                            <button 
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleOpenMoveModal(selectedCard, e);
                                }}
                                className={`group flex w-full items-center justify-between rounded-2xl border-2 p-4 transition-all hover:brightness-110 hover:scale-[1.01] active:scale-[0.99] ${getStatusConfig(lists.find(l => l.id === selectedCard.idList)?.name ?? '', selectedCard.idList).style}`}
                              >
                                <span className="font-bold">{getStatusConfig(lists.find(l => l.id === selectedCard.idList)?.name ?? '', selectedCard.idList).label}</span>
                                <ChevronDown className="h-5 w-5 opacity-90" />
                            </button>
                         </div>

                         <div className="h-px bg-zinc-200 dark:bg-zinc-800"></div>

                         <div>
                             <p className={`${iosLabel} mb-3`}>Checklists</p>
                             {checklistTemplates.length === 0 ? (
                               <p className="text-sm text-zinc-500 dark:text-zinc-400">Nenhum checklist configurado. Crie na página inicial em Administração → Checklists do Pátio.</p>
                             ) : (
                               <div className="space-y-3">
                                 {checklistTemplates.map((tpl) => (
                                   <button
                                     key={tpl.id}
                                     type="button"
                                     onClick={() => { setActiveChecklistCardId(selectedCard.id); setActiveChecklistTemplateId(tpl.id); }}
                                     className="w-full p-4 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-brand-yellow hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl flex items-center gap-3 group transition-all text-left"
                                   >
                                     <div className="w-10 h-10 rounded-full bg-brand-yellow/10 flex items-center justify-center text-brand-yellow group-hover:bg-brand-yellow group-hover:text-black transition-colors">
                                       <ClipboardList className="w-5 h-5" />
                                     </div>
                                     <div>
                                       <p className="font-bold text-zinc-900 dark:text-white">Checklist {tpl.name}</p>
                                       <p className="text-xs text-zinc-500">{tpl.items.length} {tpl.items.length === 1 ? 'item' : 'itens'}</p>
                                     </div>
                                   </button>
                                 ))}
                               </div>
                             )}
                         </div>

                         {/* Portabilidade: transferir cadastro entre Pátio (veículo) e Laboratório (módulo) */}
                         <div className="h-px bg-zinc-200 dark:bg-zinc-800 mt-6"></div>
                         <div className="pt-6">
                            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                               <ArrowRightLeft className="h-3.5 w-3.5" />
                               Portabilidade
                            </h3>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                               Este cadastro foi registrado como {(serviceOrderDetail?.order_type ?? orderType) === 'module' ? 'módulo (Laboratório)' : 'veículo (Pátio)'}. 
                               Se estiver errado, transfira para a outra área.
                            </p>
                            {selectedCard && (() => {
                               const currentType = (serviceOrderDetail?.order_type ?? orderType) as ServiceOrderType;
                               const targetType: ServiceOrderType = currentType === 'vehicle' ? 'module' : 'vehicle';
                               const targetLabel = targetType === 'vehicle' ? 'Pátio (veículo)' : 'Laboratório (módulo)';
                               return (
                                  <button
                                     type="button"
                                     disabled={isConvertingType}
                                     onClick={async () => {
                                        if (!selectedCard || !confirm(`Transferir este cadastro para o ${targetLabel}? Ele sairá da lista atual e aparecerá na outra área.`)) return;
                                        setIsConvertingType(true);
                                        try {
                                           await updateServiceOrderType(selectedCard.id, targetType, actorOptions);
                                           await fetchData(true);
                                           setServiceOrderDetail(prev => prev ? { ...prev, order_type: targetType } : null);
                                           setSelectedCard(null);
                                           setCardDetails(null);
                                        } catch (err: any) {
                                           alert(err?.message ?? 'Erro ao transferir.');
                                        } finally {
                                           setIsConvertingType(false);
                                        }
                                     }}
                                     className="inline-flex max-w-full items-center gap-2 self-start rounded-xl border-2 border-brand-yellow bg-brand-yellow px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-sm transition-[filter,transform] hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                     {isConvertingType ? (
                                        <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                                     ) : (
                                        <ArrowRightLeft className="w-4 h-4 shrink-0" />
                                     )}
                                     <span>Transferir para o {targetLabel}</span>
                                  </button>
                               );
                            })()}
                         </div>

                      </div>
                  </div>
              </div>
           </div>
        </div>
        </ModalPortal>
      );
      })()}

      {/* --- MODAL DE LEMBRETES (PÁTIO / LABORATÓRIO) — portal em body + z acima da TabBar (igual orçamento) --- */}
      {isRemindersOpen && (
        <ModalPortal>
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 backdrop-blur-[20px] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6 sm:p-6 animate-in fade-in duration-200">
          <div
            className={`relative flex max-h-[min(90vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem))] w-full max-w-xl min-h-0 flex-col overflow-hidden ${iosModalShell} animate-in zoom-in-95 duration-200`}
          >
            <button
              type="button"
              onClick={() => {
                setReminderSaveError(null);
                setIsRemindersOpen(false);
              }}
              className={iosModalClose}
              aria-label="Fechar lembretes"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="shrink-0 border-b border-zinc-200/60 px-6 pb-5 pt-7 dark:border-white/[0.07] sm:px-8 sm:pt-8">
              <div className="flex items-start gap-3 pr-10">
                <IosAccentIconSquircle variant="modal" strokeWidth={2.2}>
                  <ReminderIcon />
                </IosAccentIconSquircle>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                    {isModuleMode ? 'Laboratório' : 'Pátio'}
                  </p>
                  <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[26px]">
                    Lembretes
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-yellow" strokeWidth={2} />
                    Visível para todo o time e admin — não deixe nada passar.
                  </p>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-b border-zinc-200/50 px-6 py-4 dark:border-white/[0.06] sm:px-8">
              <p className={iosLabel}>Novo lembrete</p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const trimmed = newReminder.trim();
                  if (!trimmed || reminderSubmitting) return;
                  const createdBy = (commentAuthorName && commentAuthorName.trim()) || (isModuleMode ? 'Laboratório' : 'Pátio');
                  setReminderSubmitting(true);
                  setReminderSaveError(null);
                  try {
                    const created = await createWorkshopReminder({
                      scope: remindersScopeApi,
                      text: trimmed,
                      createdBy,
                    });
                    const next: Reminder = {
                      id: created.id,
                      text: created.text,
                      createdAt: created.createdAt,
                      done: created.done,
                      createdBy:
                        created.createdBy ||
                        commentAuthorName ||
                        (isModuleMode ? 'Laboratório' : 'Pátio'),
                    };
                    setReminders((prev) => [next, ...prev.filter((r) => r.id !== next.id)]);
                    setNewReminder('');
                    window.dispatchEvent(
                      new CustomEvent('workshop-reminders-updated', {
                        detail: { scope: isModuleMode ? 'laboratorio' : 'patio' },
                      })
                    );
                    await fetchReminders();
                  } catch (err) {
                    const msg =
                      err instanceof Error ? err.message : 'Não foi possível salvar o lembrete.';
                    setReminderSaveError(msg);
                  } finally {
                    setReminderSubmitting(false);
                  }
                }}
                className={`${iosModalInsetCard} p-4 sm:p-5`}
              >
                {reminderSaveError && (
                  <p className="mb-3 text-[13px] font-medium text-red-600 dark:text-red-400" role="alert">
                    {reminderSaveError}
                  </p>
                )}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                  <div className="min-w-0 flex-1">
                    <input
                      type="text"
                      value={newReminder}
                      onChange={(e) => {
                        setNewReminder(e.target.value);
                        if (reminderSaveError) setReminderSaveError(null);
                      }}
                      placeholder={isModuleMode ? 'Algo importante para os módulos…' : 'Algo importante para o pátio…'}
                      className={iosInput}
                      disabled={reminderSubmitting}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!newReminder.trim() || reminderSubmitting}
                    className="flex h-12 w-12 shrink-0 items-center justify-center self-center rounded-2xl border border-black/10 bg-brand-yellow text-zinc-950 shadow-lg shadow-brand-yellow/30 transition-transform active:scale-[0.98] hover:brightness-110 disabled:opacity-45 dark:border-black/25 sm:h-auto sm:w-14 sm:rounded-2xl"
                    aria-label="Adicionar lembrete"
                  >
                    {reminderSubmitting ? (
                      <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2.2} />
                    ) : (
                      <Plus className="h-6 w-6" strokeWidth={2.2} />
                    )}
                  </button>
                </div>
              </form>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 custom-scrollbar sm:px-8">
              {remindersLoading && reminders.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                  <Loader2 className="h-9 w-9 animate-spin text-[#007AFF]" strokeWidth={2} />
                  <p className="text-[14px] text-zinc-500 dark:text-zinc-400">Carregando lembretes…</p>
                </div>
              ) : reminders.length === 0 ? (
                <div className={`${iosModalInsetCard} py-12 text-center`}>
                  <p className="text-[15px] font-medium text-zinc-700 dark:text-zinc-200">Nada por aqui ainda</p>
                  <p className="mt-2 text-[13px] text-zinc-500 dark:text-zinc-400">
                    Adicione lembretes para o time não esquecer o que importa.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {reminders.map((r) => (
                    <li
                      key={r.id}
                      className={`${iosModalInsetCard} flex items-start gap-3 p-3.5 transition-opacity ${
                        r.done ? 'opacity-70' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await updateWorkshopReminderRemote(r.id, {
                              scope: remindersScopeApi,
                              done: !r.done,
                            });
                            window.dispatchEvent(
                              new CustomEvent('workshop-reminders-updated', {
                                detail: { scope: isModuleMode ? 'laboratorio' : 'patio' },
                              })
                            );
                            await fetchReminders();
                          } catch {
                            // ignore
                          }
                        }}
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          r.done
                            ? 'border-[#007AFF] bg-[#007AFF] text-white'
                            : 'border-zinc-300 text-transparent hover:border-[#007AFF]/50 dark:border-white/25 dark:hover:border-[#64B5FF]/60'
                        }`}
                        aria-label={r.done ? 'Marcar como pendente' : 'Marcar como feito'}
                      >
                        {r.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-[15px] leading-snug text-zinc-900 break-words dark:text-zinc-100 ${
                            r.done ? 'line-through decoration-zinc-400 dark:decoration-zinc-500' : ''
                          }`}
                        >
                          {r.text}
                        </p>
                        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                          <span className="font-medium text-zinc-600 dark:text-zinc-300">
                            {r.createdBy || (isModuleMode ? 'Laboratório' : 'Pátio')}
                          </span>
                          <span className="mx-1.5 text-zinc-400 dark:text-zinc-600">·</span>
                          <span>
                            {new Date(r.createdAt).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await deleteWorkshopReminderRemote(r.id, remindersScopeApi);
                            window.dispatchEvent(
                              new CustomEvent('workshop-reminders-updated', {
                                detail: { scope: isModuleMode ? 'laboratorio' : 'patio' },
                              })
                            );
                            await fetchReminders();
                          } catch {
                            // ignore
                          }
                        }}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-200/80 bg-black/[0.03] text-zinc-500 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-600 active:scale-95 dark:border-white/[0.08] dark:bg-white/[0.06] dark:text-zinc-400 dark:hover:text-red-400"
                        aria-label="Excluir lembrete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Modal: buscar placa no Pátio (veículos ativos + consulta PlacaFipe) */}
      {isPatioPlateSearchModalOpen && !isModuleMode && (
        <ModalPortal>
          <div
            role="presentation"
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 backdrop-blur-[20px] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 animate-in fade-in duration-200"
            onClick={() => closePatioPlateSearchModal()}
          >
            <div
              className={`relative flex max-h-[min(90vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem))] w-full max-w-lg min-h-0 flex-col overflow-hidden ${iosModalShell} animate-in zoom-in-95 duration-200`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="patio-plate-search-title"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => closePatioPlateSearchModal()}
                className={iosModalClose}
                aria-label="Fechar busca por placa"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="shrink-0 border-b border-zinc-200/60 px-6 pb-5 pt-7 dark:border-white/[0.07] sm:px-8 sm:pt-8">
                <div className="flex items-start gap-3 pr-10">
                  <IosAccentIconSquircle variant="modal" strokeWidth={2.2}>
                    <Search />
                  </IosAccentIconSquircle>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                      Pátio
                    </p>
                    <h2
                      id="patio-plate-search-title"
                      className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[26px]"
                    >
                      Buscar por placa
                    </h2>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-yellow" strokeWidth={2} />
                      Confira se o veículo já está na oficina ou consulte os dados pela placa.
                    </p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-5 custom-scrollbar sm:px-8">
                <div>
                  <p className={iosLabel}>Placa</p>
                  <div className={`${iosModalInsetCard} p-4 sm:p-5`}>
                    <input
                      ref={patioPlateSearchInputRef}
                      type="text"
                      value={patioPlateSearchInput}
                      onChange={(e) => {
                        setPatioPlateSearchInput(e.target.value.toUpperCase());
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handlePatioPlateSearch();
                      }}
                      placeholder="Ex.: ABC1D23"
                      maxLength={8}
                      className={`${iosInput} font-mono text-[16px] font-bold uppercase tracking-wider`}
                      aria-label="Digite a placa"
                    />
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    Mercosul ou formato antigo — mínimo 7 caracteres. A lista do pátio atualiza automaticamente a cada poucos segundos.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handlePatioPlateSearch()}
                  disabled={patioPlateSearchLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-brand-yellow/90 bg-brand-yellow py-3.5 text-[15px] font-bold text-zinc-950 shadow-md transition-[filter,transform] hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {patioPlateSearchLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  ) : (
                    <Search className="h-5 w-5 shrink-0" aria-hidden />
                  )}
                  Buscar
                </button>

                {(patioPlateSearchMessage ||
                  patioPlateSearchInPatioCards.length > 0 ||
                  patioPlateSearchApiInfo) && (
                  <div
                    className={`rounded-2xl border px-4 py-3.5 text-[14px] leading-snug ${
                      patioPlateSearchInPatioCards.length > 0
                        ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-950 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-100'
                        : patioPlateSearchApiInfo
                          ? 'border-zinc-200/90 bg-zinc-50/90 text-zinc-800 dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-zinc-200'
                          : 'border-amber-400/40 bg-amber-500/10 text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100'
                    }`}
                    role="status"
                  >
                    {patioPlateSearchMessage ? <p>{patioPlateSearchMessage}</p> : null}
                    {patioPlateSearchInPatioCards.length > 0 && (
                      <div className="mt-3 flex flex-col gap-2">
                        {patioPlateSearchInPatioCards.map((c) => {
                          const tp = parsePatioCardTitle(c.name);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setSelectedCard(c);
                                closePatioPlateSearchModal();
                              }}
                              className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/95 px-4 py-3 text-left shadow-sm ring-1 ring-emerald-600/20 transition-colors hover:bg-white dark:bg-zinc-900/90 dark:ring-emerald-400/25"
                            >
                              <span className="min-w-0 font-vehicle text-[15px] font-semibold italic text-emerald-950 dark:text-emerald-50">
                                {tp.vehicle || 'Veículo'}
                              </span>
                              <span className="shrink-0 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">
                                Abrir ficha →
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {patioPlateSearchApiInfo && (
                      <div
                        className={
                          patioPlateSearchMessage || patioPlateSearchInPatioCards.length > 0 ? 'mt-3 border-t border-zinc-200/70 pt-3 dark:border-white/[0.08]' : ''
                        }
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                          Consulta de placa
                        </p>
                        <p className="mt-1 text-[14px] font-medium text-zinc-800 dark:text-zinc-100">
                          {[patioPlateSearchApiInfo.vehicleBrand, patioPlateSearchApiInfo.vehicleModel]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                          {patioPlateSearchApiInfo.vehicleColor ? ` · ${patioPlateSearchApiInfo.vehicleColor}` : ''}
                          {patioPlateSearchApiInfo.vehicleYear ? ` · ${patioPlateSearchApiInfo.vehicleYear}` : ''}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* MODAL EDITAR NOME DO VEÍCULO / PLACA — tipografia do nome nos inputs inalterada pelo usuário */}
      {isVehicleEditOpen && selectedCard && (
        <ModalPortal>
        <div className={`${iosModalOverlay} animate-in fade-in duration-200 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-6`}>
          <div className={`relative flex max-h-[90vh] w-full max-w-md flex-col ${iosModalShell} animate-in zoom-in-95 duration-200`}>
            <div className="border-b border-zinc-200/60 px-5 py-5 dark:border-white/[0.07] sm:px-6">
              <h3 className="flex items-center gap-2 text-[17px] font-semibold text-zinc-900 dark:text-white">
                <Pencil className="h-5 w-5 text-[#007AFF]" />
                Editar veículo
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">Corrija o nome do veículo ou a placa, se estiver errado.</p>
              {(selectedCard.vehicleBrand ?? '').trim() || (selectedCard.vehicleColor ?? '').trim() ? (
                <p className="mt-2 text-[12px] text-zinc-500/90 dark:text-zinc-400">
                  {(selectedCard.vehicleBrand ?? '').trim() ? (
                    <>
                      Marca:{' '}
                      <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                        {(selectedCard.vehicleBrand ?? '').trim()}
                      </span>
                      {(selectedCard.vehicleColor ?? '').trim() ? ' · ' : ''}
                    </>
                  ) : null}
                  {(selectedCard.vehicleColor ?? '').trim() ? (
                    <>
                      Cor:{' '}
                      <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                        {(selectedCard.vehicleColor ?? '').trim()}
                      </span>
                    </>
                  ) : null}{' '}
                  (edição completa em Dados da ficha)
                </p>
              ) : null}
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
            <div className="flex justify-end gap-3 px-5 pb-5 pt-2 sm:px-6">
              <button
                type="button"
                onClick={() => setIsVehicleEditOpen(false)}
                className="rounded-2xl border border-zinc-200/90 px-5 py-2.5 text-[15px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/[0.12] dark:text-zinc-300 dark:hover:bg-white/[0.06]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveVehicleEdit}
                disabled={savingVehicleEdit || !vehicleEditModel.trim() || !vehicleEditPlate.trim()}
                className={`${iosPrimaryButton} flex items-center gap-2 px-5 py-2.5 disabled:opacity-50`}
              >
                {savingVehicleEdit ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
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
        <PdfViewerModal src={previewPdf} onClose={() => setPreviewPdf(null)} />
      )}

      {/* MODAL VISUALIZAR ORÇAMENTO — papel envelhecido no modal inteiro, textos em preto (portal: acima da TabBar) */}
      {viewingBudget && (selectedCard || selectedHistoryCard) && (
        <ModalPortal>
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] animate-modal-backdrop">
          <div
            className="relative w-full max-w-2xl max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] flex flex-col min-h-0 overflow-hidden rounded-lg animate-modal-sheet"
            style={{
              backgroundColor: '#ece5d8',
              border: '1px solid rgba(0,0,0,0.1)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.42) inset, 0 2px 4px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.13), 0 20px 50px rgba(0,0,0,0.08)',
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23grain)' opacity='0.045'/%3E%3C/svg%3E")`,
            }}
          >
            <div className="absolute inset-0 pointer-events-none rounded-lg" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)' }} aria-hidden />
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 shrink-0 relative z-10">
              <div>
                <h2 className="text-lg font-bold" style={{ color: '#000000' }}>
                  {(() => {
                    const sourceBudgets = selectedCard
                      ? savedBudgets.filter((b) => b.serviceOrderId === selectedCard.id)
                      : historySavedBudgets;
                    const sorted = [...sourceBudgets].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                    const num = sorted.findIndex((b) => b.id === viewingBudget.id) + 1;
                    return `Orçamento ${num}`;
                  })()}
                </h2>
                <p className="text-sm mt-0.5 font-medium" style={{ color: '#000000' }}>
                  {new Date(viewingBudget.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                {(selectedCard?.mileageKm || historyServiceOrderDetail?.mileage_km) && (
                  <p className="text-sm mt-1 font-medium" style={{ color: '#000000' }}>
                    <span className="font-semibold">Km</span> {selectedCard?.mileageKm ?? historyServiceOrderDetail?.mileage_km}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewingBudget(null)}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:opacity-80"
                  style={{ color: '#000000' }}
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-6 relative z-10 [-webkit-overflow-scrolling:touch]">
              {viewingBudget.diagnosis && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#000000' }}>Diagnóstico</h3>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#000000' }}>{viewingBudget.diagnosis}</div>
                </section>
              )}
              {viewingBudget.services.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#000000' }}>Serviços</h3>
                  <ul className="list-none space-y-2 text-sm">
                    {viewingBudget.services.map((s, i) => (
                      <li
                        key={i}
                        className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${budgetReadRowClass(s.approved, 'paper', viewingBudgetApprovalContrast)}`}
                        style={{ color: '#000000' }}
                      >
                        {s.approved === true && <Check className="w-4 h-4 shrink-0 text-emerald-700" aria-label="Aprovado" />}
                        {s.approved === false && <X className="w-4 h-4 shrink-0 text-red-700" aria-label="Reprovado" />}
                        {s.approved !== true && s.approved !== false && <span className="w-4 h-4 shrink-0 font-bold" style={{ color: '#000000' }} aria-label="Pendente">—</span>}
                        <span className={viewingBudgetApprovalContrast && s.approved === true ? 'font-medium' : ''} style={{ color: '#000000' }}>{s.description}</span>
                        {s.labor_hours != null && Number.isFinite(Number(s.labor_hours)) ? (
                          <span className="text-[13px] font-semibold tabular-nums opacity-90" style={{ color: '#000000' }}>
                            ({formatLaborLabel(Number(s.labor_hours))})
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {viewingBudget.parts.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#000000' }}>Peças</h3>
                  <ul className="space-y-2 text-sm">
                    {viewingBudget.parts.map((p, i) => (
                      <li
                        key={i}
                        className={`flex items-center gap-2 ${budgetReadRowClass(p.approved, 'paper', viewingBudgetApprovalContrast)}`}
                        style={{ color: '#000000' }}
                      >
                        {p.approved === true && <Check className="w-4 h-4 shrink-0 text-emerald-700" aria-label="Aprovado" />}
                        {p.approved === false && <X className="w-4 h-4 shrink-0 text-red-700" aria-label="Reprovado" />}
                        {p.approved !== true && p.approved !== false && <span className="w-4 h-4 shrink-0 font-bold" style={{ color: '#000000' }} aria-label="Pendente">—</span>}
                        <span style={{ color: '#000000' }}>
                          <span
                            className={
                              viewingBudgetApprovalContrast && p.approved === true
                                ? 'font-semibold'
                                : 'font-medium'
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
              {viewingBudget.observations && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#000000' }}>Observações</h3>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#000000' }}>{viewingBudget.observations}</div>
                </section>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-black/10 shrink-0 relative z-10 flex-wrap">
              {can('canEditBudgets') && !!selectedCard ? (
                <button
                  type="button"
                  onClick={handleDeleteBudget}
                  disabled={!!deletingBudgetId}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-red-400 text-red-800 font-medium text-sm hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  {deletingBudgetId ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deletingBudgetId ? 'Excluindo…' : 'Excluir orçamento'}
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-3 flex-wrap justify-end">
                {can('canApproveBudgetItems') && !!selectedCard && (
                  <button
                    type="button"
                    onClick={() => {
                      const b = viewingBudget;
                      setViewingBudget(null);
                      openBudgetApproval(b);
                    }}
                    disabled={!!deletingBudgetId}
                    className="inline-flex items-center gap-2 rounded-lg border border-brand-yellow/50 bg-brand-yellow/10 px-5 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-brand-yellow/20 disabled:opacity-50 dark:text-zinc-100"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Aprovar itens
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    printBudget(
                      viewingBudget,
                      selectedCard?.mileageKm ?? historyServiceOrderDetail?.mileage_km ?? null
                    )
                  }
                  disabled={!!deletingBudgetId}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-black/20 font-medium text-sm hover:bg-black/5 transition-colors disabled:opacity-50"
                  style={{ color: '#000000' }}
                >
                  <Printer className="w-4 h-4" /> Imprimir
                </button>
                <button
                  type="button"
                  onClick={() =>
                    printBudgetMechanicCopy(
                      viewingBudget,
                      selectedCard?.mileageKm ?? historyServiceOrderDetail?.mileage_km ?? null
                    )
                  }
                  disabled={!!deletingBudgetId}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-black/20 font-medium text-sm hover:bg-black/5 transition-colors disabled:opacity-50"
                  style={{ color: '#000000' }}
                >
                  <Printer className="w-4 h-4" /> Via mecânico
                </button>
                <button
                  type="button"
                  onClick={() => { setViewingBudget(null); openBudgetModal(viewingBudget); }}
                  disabled={!!deletingBudgetId || !can('canEditBudgets') || !selectedCard}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-black/20 font-medium text-sm hover:bg-black/5 transition-colors disabled:opacity-50"
                  style={{ color: '#000000' }}
                >
                  <Pencil className="w-4 h-4" /> Editar orçamento
                </button>
                <button
                  type="button"
                  onClick={() => setViewingBudget(null)}
                  disabled={!!deletingBudgetId}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-opacity hover:opacity-90 disabled:opacity-50 text-white"
                  style={{ backgroundColor: '#3d3932' }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Modal: Aprovar orçamento — mesmo idioma dos outros modais iOS */}
      {budgetApprovalTarget && selectedCard && (
        <ModalPortal>
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[20px] sm:p-6 animate-in fade-in duration-200">
          <div className={`relative flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] w-full max-w-lg min-h-0 flex-col overflow-hidden rounded-[2rem] animate-in zoom-in-95 duration-200 shadow-[0_10px_36px_-12px_rgba(0,0,0,0.18)] dark:shadow-[0_16px_44px_-14px_rgba(0,0,0,0.55)] ${iosModalShell}`}>
            <button type="button" onClick={closeBudgetApproval} className={iosModalClose} aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
            <div className="shrink-0 border-b border-zinc-200/60 px-5 pb-5 pt-7 dark:border-white/[0.07] sm:px-8 sm:pt-8">
              <div className="flex items-start gap-3 pr-10">
                <IosAccentIconSquircle variant="modal" strokeWidth={2.2}>
                  <CheckCircle2 />
                </IosAccentIconSquircle>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Aprovação</p>
                  <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white">Aprovar orçamento</h2>
                  <p className="mt-1 flex items-start gap-1.5 text-[13px] leading-snug text-zinc-600 dark:text-zinc-400">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-yellow" strokeWidth={2} />
                    Ligue = aprovado, desligue = reprovado. O técnico verá ✓ ou ✗ em cada item.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5 custom-scrollbar sm:px-8 space-y-6">
              {budgetApprovalTarget.services.length > 0 && (
                <section>
                  <h3 className={`${iosLabel} mb-2`}>Serviços</h3>
                  <ul className="space-y-2">
                    {budgetApprovalTarget.services.map((s, i) => (
                      <li key={i} className={`flex items-center gap-3 p-3.5 ${iosModalInsetCard}`}>
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
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 block">{s.description}</span>
                          {s.labor_hours != null && Number.isFinite(Number(s.labor_hours)) ? (
                            <span className="text-[12px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400 mt-0.5 block">
                              {formatLaborLabel(Number(s.labor_hours))}
                            </span>
                          ) : null}
                        </div>
                        <span className={`text-xs font-semibold shrink-0 ${approvalServices[i] ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {approvalServices[i] ? 'Aprovado' : 'Reprovado'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {budgetApprovalTarget.parts.length > 0 && (
                <section>
                  <h3 className={`${iosLabel} mb-2`}>Peças</h3>
                  <ul className="space-y-2">
                    {budgetApprovalTarget.parts.map((p, i) => (
                      <li key={i} className={`flex items-center gap-3 p-3.5 ${iosModalInsetCard}`}>
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
            <div className="flex shrink-0 flex-col gap-3 border-t border-zinc-200/60 px-4 py-4 dark:border-white/[0.07] sm:flex-row sm:px-6">
              <button
                type="button"
                onClick={closeBudgetApproval}
                className="flex-1 rounded-xl border border-zinc-200/90 py-3 text-[15px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/[0.12] dark:text-zinc-300 dark:hover:bg-white/[0.06]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveApproval}
                disabled={savingApproval}
                className={`${iosAccentPrimaryButton} flex flex-1 items-center justify-center gap-2 py-3 text-[15px] disabled:opacity-50`}
              >
                {savingApproval ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                {savingApproval ? 'Salvando…' : 'Salvar aprovação'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* MODAL CRIAR/EDITAR ORÇAMENTO — papel envelhecido (sem barra lateral) */}
      {isBudgetOpen && selectedCard && (
        <ModalPortal>
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[20px] sm:p-5 lg:p-6 animate-in fade-in duration-200">
          <div
            className={`relative flex max-h-[min(92vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem))] w-full min-h-0 flex-col overflow-hidden rounded-[2rem] animate-in zoom-in-95 duration-200 sm:rounded-[2.25rem] max-w-2xl shadow-[0_8px_30px_-8px_rgba(0,0,0,0.12),0_2px_12px_-6px_rgba(0,0,0,0.08)] dark:shadow-[0_14px_38px_-12px_rgba(0,0,0,0.5),0_4px_14px_-8px_rgba(0,0,0,0.28)] lg:max-h-[min(94vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.25rem))] lg:max-w-[min(96vw,85rem)] xl:max-w-[min(94vw,96rem)] ${budgetModalPaperShell}`}
          >
            <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
            <button type="button" onClick={closeBudgetModal} className="absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.06] text-[#5c534c] transition-colors hover:bg-[#ebe4d6] hover:text-[#2d2820]" aria-label="Fechar orçamento">
              <X className="h-5 w-5" />
            </button>

            <div className="shrink-0 border-b border-[#e8dfd0] bg-[#faf6ed] px-6 pb-5 pt-7 sm:px-8 sm:pt-8">
              <div className="flex items-start gap-3 pr-10">
                <IosAccentIconSquircle variant="modal" strokeWidth={2.2}>
                  <Calculator />
                </IosAccentIconSquircle>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6b6560]">
                    Orçamento
                  </p>
                  <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-[#2d2820] sm:text-[26px]">
                    {editingBudget ? 'Editar orçamento' : 'Novo orçamento'}
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-[#5c534c]">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-yellow" strokeWidth={2} />
                    <span className="min-w-0 break-words">
                      {(selectedCard.vehicleBrand ?? '').trim() ? (
                        <span className="text-[#7a6f5f]/90">
                          {(selectedCard.vehicleBrand ?? '').trim()}
                          {' · '}
                        </span>
                      ) : null}
                      {(selectedCard.vehicleColor ?? '').trim() ? (
                        <span className="text-[#7a6f5f]/90">
                          {(selectedCard.vehicleColor ?? '').trim()}
                          {' · '}
                        </span>
                      ) : null}
                      {blurPlates ? (() => {
                        const p = selectedCard.name.split(' - ');
                        return p.length >= 3 ? (
                          <>
                            {p[0]} <span className="blur-plate">{p[1]}</span> {p.slice(2).join(' - ')}
                          </>
                        ) : (
                          selectedCard.name
                        );
                      })() : (
                        selectedCard.name
                      )}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#faf6ed] px-5 py-5 text-[#2d2820] custom-scrollbar sm:px-8">
                  <div className="space-y-5">
                    <div>
                      <p className={budgetModalFieldLabel}>Descrição do diagnóstico</p>
                      <div className={`${budgetModalPaperInset} overflow-hidden p-0`}>
                        <textarea
                          className={`${budgetModalInput} min-h-[120px] resize-y border-0 bg-[#fffef8] py-3.5 text-[15px] leading-relaxed shadow-none focus:ring-2`}
                          placeholder="Descreva o diagnóstico técnico…"
                          value={budgetDiagnosis}
                          onChange={(e) => setBudgetDiagnosis(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className={`${budgetModalFieldLabel} mb-0`}>Serviços</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {workshopServices.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setIsServiceListOpen(true)}
                              className="inline-flex items-center gap-1.5 rounded-2xl border border-[#e0d6c8] bg-[#fffef8] px-3 py-2 text-[13px] font-semibold text-[#2d2820] shadow-sm transition-colors hover:border-[#c4b8a4] hover:bg-[#f5efe0]"
                            >
                              Inserir da lista
                              <ChevronDown className="h-4 w-4 opacity-80" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={addServiceRow}
                            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#5c534c] transition-colors hover:text-[#2d2820]"
                          >
                            <Plus className="h-4 w-4" strokeWidth={2.2} />
                            Adicionar
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2.5">
                        {budgetServices.map((item) => {
                          const isFocused = suggestionsForServiceId === item.id;
                          return (
                            <div
                              key={item.id}
                              ref={isFocused ? focusedServiceInputRef : undefined}
                              className="relative"
                            >
                              <div className="flex items-center gap-2 sm:gap-3">
                                <div className="min-w-0 flex-1 space-y-1">
                                  <input
                                    type="text"
                                    placeholder="Digite ou escolha um serviço…"
                                    className={budgetModalInput}
                                    value={item.description}
                                    onChange={(e) => updateServiceDescription(item.id, e.target.value)}
                                    onFocus={() => handleServiceInputFocus(item.id)}
                                    onBlur={handleServiceInputBlur}
                                  />
                                  {item.laborHours != null && Number.isFinite(Number(item.laborHours)) ? (
                                    <p className="text-[12px] font-semibold tabular-nums text-[#7a6f5f]">
                                      Duração: {formatLaborLabel(Number(item.laborHours))}
                                    </p>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeServiceRow(item.id)}
                                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#e0d6c8] text-[#9a928c] transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                                  aria-label="Remover serviço"
                                >
                                  <Trash2 className="h-5 w-5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Modal: lista de serviços cadastrados */}
                    {isServiceListOpen && (
                      <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-4" onClick={() => setIsServiceListOpen(false)}>
                        <div
                          className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-[1.75rem] border border-[#e8dfd0] bg-[#faf6ed] shadow-xl"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-between border-b border-[#e8dfd0] px-5 py-4">
                            <span className="text-[17px] font-semibold tracking-tight text-[#2d2820]">Serviços cadastrados</span>
                            <button
                              type="button"
                              onClick={() => setIsServiceListOpen(false)}
                              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ebe4d6] text-[#5c534c] transition-colors hover:bg-[#e0d6c8]"
                              aria-label="Fechar"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </div>
                          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
                            {workshopServices.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => addServiceFromList(s)}
                                className="flex w-full items-start justify-between gap-3 border-b border-[#e8dfd0] px-5 py-3.5 text-left text-[15px] text-[#2d2820] transition-colors last:border-0 hover:bg-[#f5efe0]"
                              >
                                <span className="min-w-0 flex-1 leading-snug">{s.name}</span>
                                {s.labor_hours != null && Number.isFinite(Number(s.labor_hours)) ? (
                                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[#5c534c]">
                                    {formatLaborLabel(Number(s.labor_hours))}
                                  </span>
                                ) : null}
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
                          <div className="fixed inset-0 z-[215] bg-black/35" onClick={() => setSuggestionsForServiceId(null)} />
                          <div
                            className="fixed z-[216] max-h-[200px] overflow-y-auto overflow-hidden rounded-[18px] border border-[#e8dfd0] bg-[#fffef8] py-1 shadow-[0_16px_48px_-12px_rgba(40,30,20,0.18)]"
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
                                onMouseDown={() => suggestionsForServiceId && applySuggestion(suggestionsForServiceId, s)}
                                className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[14px] text-[#2d2820] transition-colors hover:bg-[#f5efe0]"
                              >
                                <span className="min-w-0 flex-1">{s.name}</span>
                                {s.labor_hours != null && Number.isFinite(Number(s.labor_hours)) ? (
                                  <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#7a6f5f]">
                                    {formatLaborLabel(Number(s.labor_hours))}
                                  </span>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        </>
                      );
                    })()}

                    <div>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className={`${budgetModalFieldLabel} mb-0`}>Peças</p>
                        <button
                          type="button"
                          onClick={addPartRow}
                          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#5c534c] transition-colors hover:text-[#2d2820]"
                        >
                          <Plus className="h-4 w-4" strokeWidth={2.2} />
                          Adicionar
                        </button>
                      </div>
                      <div className="space-y-2.5">
                        {budgetParts.map((item) => {
                          const isFocusedPart = suggestionsForPartId === item.id;
                          return (
                            <div
                              key={item.id}
                              ref={isFocusedPart ? focusedPartInputRef : undefined}
                              className={`${budgetModalPaperInset} flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center`}
                            >
                              <input
                                type="text"
                                placeholder="Nome da peça…"
                                className={`${budgetModalInput} min-w-0 flex-1`}
                                value={item.description}
                                onChange={(e) => updatePartDescription(item.id, e.target.value)}
                                onFocus={() => handlePartInputFocus(item.id)}
                                onBlur={handlePartInputBlur}
                              />
                              <div className="flex shrink-0 items-center justify-end gap-2 sm:justify-start">
                                <div className="flex items-center overflow-hidden rounded-2xl border border-[#e0d6c8] bg-[#fffef8]">
                                  <button
                                    type="button"
                                    onClick={() => updatePartQuantity(item.id, -1)}
                                    className="flex h-10 w-10 items-center justify-center text-[#5c534c] transition-colors hover:bg-[#f5efe0]"
                                    aria-label="Diminuir quantidade"
                                  >
                                    <Minus className="h-4 w-4" />
                                  </button>
                                  <span className="w-10 text-center text-[14px] font-semibold tabular-nums text-[#2d2820]">
                                    {item.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => updatePartQuantity(item.id, 1)}
                                    className="flex h-10 w-10 items-center justify-center text-[#5c534c] transition-colors hover:bg-[#f5efe0]"
                                    aria-label="Aumentar quantidade"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removePartRow(item.id)}
                                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#e0d6c8] text-[#9a928c] transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                                  aria-label="Remover peça"
                                >
                                  <Trash2 className="h-5 w-5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Modal: sugestões de peças ao digitar (igual serviços) */}
                    {partSuggestionBoxPosition && suggestionsForPartId && (() => {
                      const suggestions = budgetParts.find(i => i.id === suggestionsForPartId)
                        ? getPartSuggestions(budgetParts.find(i => i.id === suggestionsForPartId)!.description)
                        : [];
                      if (suggestions.length === 0) return null;
                      return (
                        <>
                          <div className="fixed inset-0 z-[215] bg-black/35" onClick={() => setSuggestionsForPartId(null)} />
                          <div
                            className="fixed z-[216] max-h-[200px] overflow-y-auto overflow-hidden rounded-[18px] border border-[#e8dfd0] bg-[#fffef8] py-1 shadow-[0_16px_48px_-12px_rgba(40,30,20,0.18)]"
                            style={{
                              top: partSuggestionBoxPosition.top,
                              left: partSuggestionBoxPosition.left,
                              width: partSuggestionBoxPosition.width,
                            }}
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            {suggestions.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onMouseDown={() => suggestionsForPartId && applyPartSuggestion(suggestionsForPartId, p.name)}
                                className="w-full px-4 py-2.5 text-left text-[14px] text-[#2d2820] transition-colors hover:bg-[#f5efe0]"
                              >
                                {p.name}
                              </button>
                            ))}
                          </div>
                        </>
                      );
                    })()}

                    <div>
                      <p className={budgetModalFieldLabel}>Observações</p>
                      <div className={`${budgetModalPaperInset} overflow-hidden p-0`}>
                        <textarea
                          className={`${budgetModalInput} min-h-[88px] resize-y border-0 bg-[#fffef8] py-3.5 text-[15px] leading-relaxed shadow-none focus:ring-2`}
                          placeholder="Prazos, condições, etc."
                          value={budgetObservations}
                          onChange={(e) => setBudgetObservations(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
            </div>

            <div className={`shrink-0 px-5 py-4 sm:px-8 ${budgetModalPaperFooter}`}>
              <button
                type="button"
                onClick={handleCreateBudget}
                disabled={sendingBudget}
                className={`${budgetModalCreateBudgetButton} flex w-full items-center justify-center gap-2 px-6 py-3.5`}
              >
                {sendingBudget ? <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.2} /> : <CheckCircle2 className="h-5 w-5" strokeWidth={2} />}
                {sendingBudget ? 'Salvando…' : editingBudget ? 'Salvar alterações' : 'Criar orçamento'}
              </button>
            </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* MODAL DE SELEÇÃO DE ETAPA (MOVE) — portal em body para ficar acima da TabBar */}
      {cardInTransition && (
        <ModalPortal>
        <div className={`${iosModalOverlay} animate-in fade-in duration-200 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6`}>
          <div
            className={`relative flex max-h-[min(90vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem))] w-full max-w-md min-h-0 flex-col overflow-hidden ${iosModalShell} animate-in zoom-in-95 duration-200`}
          >
            <button
              type="button"
              onClick={() => setCardInTransition(null)}
              className={iosModalClose}
              aria-label="Fechar"
              disabled={isMoving}
            >
              <X className="h-5 w-5" />
            </button>

            <div className="shrink-0 border-b border-zinc-200/60 px-6 pb-5 pt-7 dark:border-white/[0.07] sm:px-8 sm:pt-8">
              <div className="flex items-start gap-3 pr-10">
                <IosAccentIconSquircle variant="modal" strokeWidth={2.2}>
                  <ArrowRightLeft />
                </IosAccentIconSquircle>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                    {isModuleMode ? 'Laboratório' : 'Pátio'}
                  </p>
                  <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[24px]">
                    Alterar etapa
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-yellow" strokeWidth={2} />
                    <span
                      className={`font-vehicle min-w-0 truncate font-medium text-zinc-700 dark:text-zinc-200 ${vehicleModalSubtitleNameShadow}`}
                    >
                      {cardInTransitionTitleParts?.vehicle}
                    </span>
                    <span className="text-zinc-400 dark:text-zinc-500">—</span>
                    <span>Toque na etapa de destino.</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 custom-scrollbar sm:px-8">
              <p className={iosLabel}>Etapas</p>
              {isMoving && (
                <p className="mb-3 flex items-center gap-2 text-[13px] font-medium text-[#007AFF] dark:text-[#64B5FF]">
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                  Atualizando etapa…
                </p>
              )}
              <div className="space-y-2.5">
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
                        group flex min-h-[52px] w-full items-center justify-between gap-3 rounded-[22px] border-2 px-4 py-3.5 text-left transition-all duration-200 sm:px-5
                        ${
                          isCurrent
                            ? `${iosModalInsetCard} cursor-not-allowed border-zinc-200/80 opacity-75 shadow-none dark:border-white/[0.08]`
                            : `border-transparent ${config.style} shadow-[0_2px_12px_-2px_rgba(0,0,0,0.12)] hover:brightness-110 active:scale-[0.99] disabled:opacity-55 dark:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]`
                        }
                      `}
                    >
                      <span className="text-[15px] font-semibold uppercase tracking-wide">{list.name}</span>
                      {isCurrent ? (
                        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                          <Check className="h-5 w-5 shrink-0 text-[#007AFF] dark:text-[#64B5FF]" strokeWidth={2.5} />
                          Atual
                        </span>
                      ) : (
                        <ChevronRight
                          className={`h-5 w-5 shrink-0 opacity-80 transition-transform group-hover:translate-x-0.5 ${isMoving ? 'opacity-30' : ''}`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="shrink-0 border-t border-zinc-200/60 px-4 py-3 dark:border-white/[0.07] sm:px-6">
              <button
                type="button"
                onClick={() => setCardInTransition(null)}
                disabled={isMoving}
                className="w-full rounded-2xl py-3.5 text-[15px] font-semibold text-zinc-500 transition-colors hover:bg-black/[0.04] hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* MODAL CATEGORIA DO VEÍCULO — mesmo padrão do modal de etapas */}
      {isVehicleCategoryModalOpen &&
        selectedCard &&
        !isModuleMode &&
        (() => {
          const currentCat =
            resolveVehicleCategoryLabel(
              serviceOrderDetail?.vehicle_category ?? null,
              serviceOrderDetail?.issue_description ?? null
            ) ?? selectedCard.vehicleCategory ?? null;
          return (
            <ModalPortal>
            <div
              className={`${iosModalOverlay} animate-in fade-in duration-200 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6`}
            >
              <div
                className={`relative flex max-h-[min(90vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem))] w-full max-w-md min-h-0 flex-col overflow-hidden ${iosModalShell} animate-in zoom-in-95 duration-200`}
              >
                <button
                  type="button"
                  onClick={() => setIsVehicleCategoryModalOpen(false)}
                  className={iosModalClose}
                  aria-label="Fechar"
                  disabled={savingVehicleCategory}
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="shrink-0 border-b border-zinc-200/60 px-6 pb-5 pt-7 dark:border-white/[0.07] sm:px-8 sm:pt-8">
                  <div className="flex items-start gap-3 pr-10">
                    <IosAccentIconSquircle variant="modal" strokeWidth={2.2}>
                      <Tag />
                    </IosAccentIconSquircle>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                        Pátio
                      </p>
                      <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[24px]">
                        Categoria do veículo
                      </h2>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-yellow" strokeWidth={2} />
                        <span
                          className={`font-vehicle min-w-0 truncate font-medium text-zinc-700 dark:text-zinc-200 ${vehicleModalSubtitleNameShadow}`}
                        >
                          {selectedCardTitleParts?.vehicle}
                        </span>
                        <span className="text-zinc-400 dark:text-zinc-500">—</span>
                        <span>Toque na categoria desejada.</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 custom-scrollbar sm:px-8">
                  <p className={iosLabel}>Categorias</p>
                  {savingVehicleCategory && (
                    <p className="mb-3 flex items-center gap-2 text-[13px] font-medium text-[#007AFF] dark:text-[#64B5FF]">
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                      Salvando…
                    </p>
                  )}
                  <div className="space-y-2.5">
                    {VEHICLE_CATEGORIES_MODAL.map((cat) => {
                      const isCurrent = currentCat === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => handleSelectVehicleCategory(cat)}
                          disabled={isCurrent || savingVehicleCategory}
                          className={`
                        group flex min-h-[52px] w-full items-center justify-between gap-3 rounded-[22px] border-2 px-4 py-3.5 text-left transition-all duration-200 sm:px-5
                        ${
                          isCurrent
                            ? `${iosModalInsetCard} cursor-not-allowed border-zinc-200/80 opacity-75 shadow-none dark:border-white/[0.08]`
                            : 'border-transparent bg-zinc-100/90 text-zinc-900 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.12)] hover:brightness-110 active:scale-[0.99] disabled:opacity-55 dark:bg-zinc-800/90 dark:text-zinc-100 dark:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]'
                        }
                      `}
                        >
                          <span className="text-[15px] font-semibold uppercase tracking-wide">{cat}</span>
                          {isCurrent ? (
                            <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                              <Check className="h-5 w-5 shrink-0 text-[#007AFF] dark:text-[#64B5FF]" strokeWidth={2.5} />
                              Atual
                            </span>
                          ) : (
                            <ChevronRight
                              className={`h-5 w-5 shrink-0 opacity-80 transition-transform group-hover:translate-x-0.5 ${savingVehicleCategory ? 'opacity-30' : ''}`}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="shrink-0 border-t border-zinc-200/60 px-4 py-3 dark:border-white/[0.07] sm:px-6">
                  <button
                    type="button"
                    onClick={() => setIsVehicleCategoryModalOpen(false)}
                    disabled={savingVehicleCategory}
                    className="w-full rounded-2xl py-3.5 text-[15px] font-semibold text-zinc-500 transition-colors hover:bg-black/[0.04] hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
            </ModalPortal>
          );
        })()}

      {/* MODAL DE SELEÇÃO DE MECÂNICO — portal em body para ficar acima da TabBar */}
      {cardForMemberAssignment && (
        <ModalPortal>
        <div className={`${iosModalOverlay} animate-in fade-in duration-200 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-6`}>
          <div
            className={`relative flex max-h-[min(90vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem))] w-full max-w-md min-h-0 flex-col overflow-hidden ${iosModalShell} animate-in zoom-in-95 duration-200`}
          >
            <button
              type="button"
              onClick={() => setCardForMemberAssignment(null)}
              className={iosModalClose}
              aria-label="Fechar"
              disabled={isAssigning}
            >
              <X className="h-5 w-5" />
            </button>

            <div className="shrink-0 border-b border-zinc-200/60 px-6 pb-5 pt-7 dark:border-white/[0.07] sm:px-8 sm:pt-8">
              <div className="flex items-start gap-3 pr-10">
                <IosAccentIconSquircle variant="modal" strokeWidth={2.2}>
                  <Users />
                </IosAccentIconSquircle>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                    Equipe
                  </p>
                  <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[24px]">
                    Selecionar técnico
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-yellow" strokeWidth={2} />
                    {isModuleMode
                      ? 'Responsável pelo módulo — escolha quem acompanha esta OS.'
                      : 'Responsável pelo veículo — escolha quem acompanha esta OS.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 custom-scrollbar sm:px-8">
              <p className={iosLabel}>Atribuição</p>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => handleAssignTechnician(null)}
                  disabled={isAssigning}
                  className={`${iosModalInsetCard} group flex w-full items-center justify-between gap-3 border-2 border-dashed border-zinc-300/90 p-4 text-left transition-all hover:bg-black/[0.03] active:scale-[0.99] disabled:opacity-50 dark:border-white/[0.12] dark:hover:bg-white/[0.04]`}
                >
                  <span className="text-[15px] font-semibold tracking-tight text-zinc-700 dark:text-zinc-200">
                    Nenhum / Remover técnico
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 dark:text-zinc-500" />
                </button>
                {TECHNICIANS.map((tech) => (
                  <button
                    key={tech.id}
                    type="button"
                    onClick={() => handleAssignTechnician(tech)}
                    disabled={isAssigning}
                    className={`group flex w-full items-center gap-3 rounded-[22px] border-2 p-3.5 text-left shadow-[0_2px_12px_-2px_rgba(0,0,0,0.1)] transition-all duration-200 hover:brightness-[1.06] active:scale-[0.99] disabled:opacity-50 dark:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.45)] ${tech.style}`}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/25 bg-black/15 shadow-inner">
                      {tech.photo_url ? (
                        <img src={tech.photo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <MechanicIcon className="h-5 w-5 opacity-95" />
                      )}
                    </div>
                    <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug tracking-tight">
                      {tech.name}
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 opacity-80 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
              {isAssigning && (
                <p className="mt-4 flex items-center justify-center gap-2 text-[13px] font-medium text-[#007AFF] dark:text-[#64B5FF]">
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                  Salvando atribuição…
                </p>
              )}
            </div>

            <div className="shrink-0 border-t border-zinc-200/60 px-4 py-3 dark:border-white/[0.07] sm:px-6">
              <button
                type="button"
                onClick={() => setCardForMemberAssignment(null)}
                disabled={isAssigning}
                className="w-full rounded-2xl py-3.5 text-[15px] font-semibold text-zinc-500 transition-colors hover:bg-black/[0.04] hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* MODAL DE CHECKLIST (templates criados pelo admin) — portal em body */}
      {activeChecklistCard && activeChecklistTemplate && (
         <ModalPortal>
         <div className={`${iosModalOverlay} animate-in fade-in duration-200 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-6`}>
           <div className={`relative flex max-h-[min(90vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem))] w-full max-w-lg flex-col ${iosModalShell} animate-in zoom-in-95 duration-200`}>
             
             {/* Header Checklist */}
             <div className="relative shrink-0 border-b border-zinc-200/60 px-5 pb-4 pt-6 dark:border-white/[0.07] sm:px-7 sm:pt-7">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                     <IosAccentIconSquircle variant="modal" strokeWidth={2.2}>
                        <ClipboardList />
                     </IosAccentIconSquircle>
                     <div className="min-w-0">
                       <h2 className="text-[22px] font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-[24px]">Checklist {activeChecklistTemplate.name}</h2>
                       <p className="mt-0.5 text-[13px] font-medium text-zinc-500 dark:text-zinc-400">{activeChecklistCardTitleParts?.vehicle}</p>
                     </div>
                  </div>
                  <button 
                    type="button"
                    onClick={closeChecklistModal} 
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-zinc-600 transition-colors hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                {/* Progress Bar Header */}
                {(() => {
                   const items = activeChecklistTemplate.items;
                   const total = items.length;
                   const completed = total === 0 ? 0 : items.filter((i) => (checklistState[i.id] ?? 'incomplete') === 'complete').length;
                   const pct = total > 0 ? (completed / total) * 100 : 0;
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
                             className={`h-full transition-all duration-500 ease-out ${pct === 100 ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-brand-yellow'}`}
                             style={{ width: `${pct}%` }}
                           />
                        </div>
                     </div>
                   );
                })()}
             </div>

             {/* Itens do Checklist */}
             <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-zinc-50/80 p-4 dark:bg-black/25 custom-scrollbar">
                {checklistStateLoading ? (
                  <div className="flex justify-center py-12">
                    <RefreshCw className="w-8 h-8 text-brand-yellow animate-spin" />
                  </div>
                ) : activeChecklistTemplate.items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-4">
                    <AlertCircle className="w-10 h-10 opacity-50" />
                    <p>Este checklist não tem itens. Edite-o na página inicial (Administração → Checklists do Pátio).</p>
                  </div>
                ) : (
                  activeChecklistTemplate.items.map((item) => {
                    const isComplete = (checklistState[item.id] ?? 'incomplete') === 'complete';
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleToggleChecklistItem(item.id, isComplete ? 'complete' : 'incomplete')}
                        className={`
                           w-full p-4 rounded-xl border flex items-center justify-between transition-all duration-300 group
                           ${isComplete 
                             ? 'bg-[#1A251D] border-green-900/30 text-green-100' 
                             : 'bg-light-elevated dark:bg-[#1C1C1E] border-light-border dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-700 hover:bg-light-card dark:hover:bg-[#242426]'}
                        `}
                      >
                         <span className={`text-sm font-bold text-left ${isComplete ? 'line-through opacity-70' : ''}`}>
                            {item.text}
                         </span>
                         
                         <div className={`
                            w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300
                            ${isComplete ? 'bg-green-500 text-black scale-110' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 group-hover:bg-zinc-300 dark:group-hover:bg-zinc-700'}
                         `}>
                            {isComplete ? <Check className="w-4 h-4" /> : <div className="w-2 h-2 rounded-full bg-current opacity-50" />}
                         </div>
                      </button>
                    );
                  })
                )}
             </div>

             {/* Footer Modal */}
             <div className="shrink-0 border-t border-zinc-200/60 bg-white/40 px-4 py-3 text-center dark:border-white/[0.07] dark:bg-zinc-950/30 sm:px-5">
               <button 
                 type="button"
                 onClick={closeChecklistModal}
                 className="w-full rounded-2xl bg-zinc-900 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white/15 dark:hover:bg-white/20"
               >
                 Fechar checklist
               </button>
             </div>

           </div>
         </div>
         </ModalPortal>
      )}

      {/* CAMERA MODAL — portal em body */}
      {isCameraOpen && (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-modal-backdrop">
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
        </ModalPortal>
      )}

      {/* PHOTO PREVIEW MODAL — portal em body */}
      {photoPreview && (
        <ModalPortal>
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-modal-backdrop">
            <div className="relative flex-1 bg-black flex items-center justify-center">
                <img src={photoPreview} alt="Preview" className="max-w-full max-h-full object-contain" />
                
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/85 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-16 sm:px-6">
                    <label className="mx-auto mb-3 block max-w-md text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                      Nome da foto (opcional)
                      <input
                        type="text"
                        value={photoUploadLabel}
                        onChange={(e) => setPhotoUploadLabel(e.target.value)}
                        placeholder="Ex.: Frente, placa, detalhe do freio…"
                        className="mt-1.5 w-full rounded-xl border border-white/15 bg-zinc-900/90 px-3 py-2.5 text-[15px] font-normal normal-case text-white placeholder:text-zinc-500 focus:border-brand-yellow/50 focus:outline-none focus:ring-2 focus:ring-brand-yellow/30"
                      />
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                    <button 
                        type="button"
                        onClick={clearPhoto}
                        className="px-6 py-3 rounded-xl bg-zinc-800 text-white font-bold hover:bg-zinc-700 transition-colors"
                    >
                        Descartar
                    </button>
                    <button 
                        type="button"
                        onClick={uploadPhoto}
                        disabled={isUploading}
                        className="px-6 py-3 rounded-xl bg-brand-yellow text-black font-bold hover:bg-[#fcd61e] transition-colors flex items-center gap-2"
                    >
                        {isUploading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                        Enviar foto
                    </button>
                    </div>
                </div>
            </div>
        </div>
        </ModalPortal>
      )}

    </div>
  );
};