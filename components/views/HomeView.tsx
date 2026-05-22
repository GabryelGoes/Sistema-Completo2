import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ChevronRight,
  LogOut,
  User,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { IosAccentIconSquircle } from '../ui/IosAccentIconSquircle';
import { WorkshopServicesModal } from '../WorkshopServicesModal';
import { WorkshopPartsModal } from '../WorkshopPartsModal';
import { PatioChecklistsModal } from '../PatioChecklistsModal';
import { ChangePasswordsModal } from '../ChangePasswordsModal';
import { TechnicianProfileModal } from '../TechnicianProfileModal';
import { AdminProfileModal } from '../AdminProfileModal';
import { SystemUsersModal } from '../SystemUsersModal';
import { SystemNotificationsModal } from '../SystemNotificationsModal';
import { TvPatioModal } from '../TvPatioModal';
import { UserProfileModal } from '../UserProfileModal';
import { SYSTEM_NOTIFICATIONS_ICON } from '../../constants/systemNotificationsIcon';
import { QUALITY_RADAR_ICON } from '../../constants/qualityRadar';
import { ERROR_BULLETIN_ICON } from '../../constants/errorBulletinIcon';
import { effectiveAccessOrcamentos, type SystemUserPermissions } from '../../services/apiService';
import { useRegisterModalOpen } from '../ui/ModalLayerContext';
import { useBrowserBackLayer } from '../ui/BackNavigationContext';
import { iosSquircleBackgroundFromHex } from '../ui/iosModalStyles';

export type HomeAppId =
  | 'reception'
  | 'agenda'
  | 'patio'
  | 'laboratorio'
  | 'orcamentos'
  | 'relatorios'
  | 'boletim_erros'
  | 'radar_qualidade'
  | 'settings';

interface HomeViewProps {
  onOpenApp: (app: HomeAppId) => void;
  onLogout?: () => void;
  isTechnician?: boolean;
  technicianId?: string;
  technicianName?: string;
  technicianSlug?: string;
  allowedTabs?: string[];
  onProfileUpdated?: (newName: string) => void;
  isSystemUser?: boolean;
  systemUserUsername?: string;
  systemUserDisplayName?: string;
  systemUserPhotoUrl?: string | null;
  systemUserAccentColor?: string | null;
  systemUserProfileToken?: string;
  systemUserIsTechnician?: boolean;
  onSystemUserProfileUpdated?: (data: {
    displayName?: string;
    photoUrl?: string | null;
    accentColor?: string | null;
  }) => void;
  adminDisplayName?: string;
  adminPhotoUrl?: string | null;
  onAdminProfileSaved?: () => void;
  systemUsersRefreshTrigger?: number;
  systemUserPermissions?: SystemUserPermissions;
  onOpenSettings?: () => void;
  onOpenChangePasswords?: () => void;
  /** Abre a Central do atendimento em tela cheia (opcional: OS já selecionada). */
  onOpenVehicleAccompaniment?: (serviceOrderId?: string | null) => void;
  /** Modais no App (ex.: preferências, senhas) que devem ficar acima do hub de configurações */
  globalOverlayModalOpen?: boolean;
  /** Badge vermelho no ícone Orçamentos (hub do pátio). */
  patioBudgetsHubBadge?: number;
}

/** Alinhado ao modal TV do pátio: vidro, sombra suave, cantos iOS. */
const iosCard =
  'rounded-[22px] border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-zinc-900/40 backdrop-blur-2xl ' +
  'shadow-[0_10px_36px_-8px_rgba(63,63,70,0.22),0_4px_20px_-6px_rgba(82,82,91,0.14),0_1px_3px_rgba(63,63,70,0.08)] ' +
  'dark:shadow-[0_14px_40px_-10px_rgba(0,0,0,0.46),0_6px_28px_-8px_rgba(0,0,0,0.32),0_2px_12px_-4px_rgba(0,0,0,0.24)]';

const iosSectionTitle =
  'text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-950 dark:text-zinc-400 mb-1';

const iosSectionHint = 'text-[13px] text-zinc-950 dark:text-zinc-400 mb-4 leading-relaxed';
const QUICK_APPS_LAYOUT_KEY = 'app_home_quick_apps_layout_v1';
const LONG_PRESS_MS = 420;
const QUICK_REORDER_HYSTERESIS_HITS = 2;
const QUICK_TARGET_PADDING_PX = 18;

const OPERATIONAL_APPS: {
  id: HomeAppId;
  label: string;
  icon: React.ReactElement;
}[] = [
  {
    id: 'agenda',
    label: 'Agenda',
    icon: <img src="/icons/agenda-ios.png" alt="Agenda" className="h-full w-full object-cover" />,
  },
  {
    id: 'patio',
    label: 'Pátio',
    icon: <img src="/icons/patio-ios.png" alt="Pátio" className="h-full w-full object-cover" />,
  },
  {
    id: 'orcamentos',
    label: 'Orçamentos',
    icon: <img src="/icons/orcamentos-ios.png" alt="" className="h-full w-full object-cover" />,
  },
  {
    id: 'laboratorio',
    label: 'Laboratório',
    icon: <img src="/icons/laboratorio-ios.png" alt="Laboratório" className="h-full w-full object-cover" />,
  },
];

type QuickTileSize = 'normal' | 'wide';
type QuickTileId =
  | HomeAppId
  | 'tv_patio'
  | 'centro_atendimento'
  | 'parts_stock'
  | 'settings_hub';
type QuickLayoutState = {
  order: QuickTileId[];
  sizes: Partial<Record<QuickTileId, QuickTileSize>>;
};
type QuickDragVisual = {
  id: QuickTileId;
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

const DEFAULT_QUICK_ORDER: QuickTileId[] = [...OPERATIONAL_APPS.map((app) => app.id), 'settings_hub'];
const ALL_QUICK_TILE_IDS: QuickTileId[] = [
  ...DEFAULT_QUICK_ORDER,
  'tv_patio',
  'centro_atendimento',
  'parts_stock',
  'relatorios',
  'boletim_erros',
  'radar_qualidade',
];

function SettingsRow({
  onClick,
  icon,
  title,
  subtitle,
  danger,
  className = '',
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full flex items-center gap-3 px-3 py-3 sm:px-4 sm:py-3.5 text-left rounded-2xl transition-all duration-200 hover:bg-zinc-100/90 dark:hover:bg-white/[0.06] active:scale-[0.99] ${danger ? 'hover:bg-red-500/10 dark:hover:bg-red-500/10' : ''} ${className}`}
    >
      {icon}
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-medium text-zinc-900 dark:text-white leading-snug">{title}</span>
        {subtitle ? <span className="block text-[12px] text-zinc-950 dark:text-zinc-400 mt-0.5">{subtitle}</span> : null}
      </span>
      <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400 group-hover:text-brand-yellow transition-colors" />
    </button>
  );
}

export const HomeView: React.FC<HomeViewProps> = ({
  onOpenApp,
  onLogout,
  isTechnician = false,
  technicianId,
  technicianName = 'Pátio',
  allowedTabs = [],
  onProfileUpdated,
  isSystemUser = false,
  systemUserUsername = '',
  systemUserDisplayName = '',
  systemUserPhotoUrl = null,
  systemUserAccentColor = null,
  systemUserProfileToken,
  systemUserIsTechnician = false,
  onSystemUserProfileUpdated,
  adminDisplayName,
  adminPhotoUrl = null,
  onAdminProfileSaved,
  systemUsersRefreshTrigger,
  systemUserPermissions,
  onOpenSettings,
  onOpenChangePasswords,
  globalOverlayModalOpen = false,
  patioBudgetsHubBadge = 0,
  onOpenVehicleAccompaniment,
}) => {
  const [isServicesModalOpen, setIsServicesModalOpen] = useState(false);
  const [isChangePasswordsOpen, setIsChangePasswordsOpen] = useState(false);
  const [isTechnicianProfileOpen, setIsTechnicianProfileOpen] = useState(false);
  const [isAdminProfileOpen, setIsAdminProfileOpen] = useState(false);
  const [isSystemUsersOpen, setIsSystemUsersOpen] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [isPatioChecklistsOpen, setIsPatioChecklistsOpen] = useState(false);
  const [isPartsModalOpen, setIsPartsModalOpen] = useState(false);
  const [isTvPatioOpen, setIsTvPatioOpen] = useState(false);
  const [isSystemNotificationsOpen, setIsSystemNotificationsOpen] = useState(false);
  const [isHomeSettingsHubOpen, setIsHomeSettingsHubOpen] = useState(false);
  const [isHeaderProfileMenuOpen, setIsHeaderProfileMenuOpen] = useState(false);
  const headerProfileTriggerRef = useRef<HTMLButtonElement>(null);
  const headerProfileMenuRef = useRef<HTMLDivElement>(null);
  const [headerProfileMenuStyle, setHeaderProfileMenuStyle] = useState<React.CSSProperties>({});
  const [quickLayout, setQuickLayout] = useState<QuickLayoutState>(() => {
    try {
      const raw = localStorage.getItem(QUICK_APPS_LAYOUT_KEY);
      if (!raw) return { order: DEFAULT_QUICK_ORDER, sizes: {} };
      const parsed = JSON.parse(raw) as QuickLayoutState;
      if (!parsed || !Array.isArray(parsed.order)) return { order: DEFAULT_QUICK_ORDER, sizes: {} };
      const order = [...parsed.order.filter((id) => ALL_QUICK_TILE_IDS.includes(id as QuickTileId))] as QuickTileId[];
      DEFAULT_QUICK_ORDER.forEach((id) => {
        if (!order.includes(id)) order.push(id);
      });
      return { order, sizes: parsed.sizes ?? {} };
    } catch {
      return { order: DEFAULT_QUICK_ORDER, sizes: {} };
    }
  });
  const [isQuickEditMode, setIsQuickEditMode] = useState(false);
  const [draggingQuickId, setDraggingQuickId] = useState<QuickTileId | null>(null);
  const [quickDragVisual, setQuickDragVisual] = useState<QuickDragVisual | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const lastQuickReorderTargetRef = useRef<QuickTileId | null>(null);
  const quickReorderCandidateRef = useRef<QuickTileId | null>(null);
  const quickReorderCandidateHitsRef = useRef(0);
  const dragFrameRef = useRef<number | null>(null);
  /** Limita o reorder ao grid desta home — nunca usa `document` inteiro. */
  const quickAppsGridRef = useRef<HTMLDivElement>(null);

  const perms = systemUserPermissions || {};
  const isLimitedSystem = isSystemUser && !perms.full_access;
  const isWorkshopAdmin = !isSystemUser && !isTechnician;
  const showFullAdminHub = isWorkshopAdmin || (isSystemUser && !!perms.full_access);
  const showGranularAdminHub =
    isLimitedSystem &&
    !!(
      perms.access_notificacoes_sistema ||
      perms.access_servicos_oficina ||
      perms.access_checklists_patio ||
      perms.access_tv_patio ||
      perms.access_estoque_pecas ||
      perms.access_relatorios
    );
  const showAdminSection = showFullAdminHub || showGranularAdminHub;
  const hasRichQuickGrid =
    showFullAdminHub ||
    !!perms.access_tv_patio ||
    !!perms.access_centro_atendimento ||
    !!perms.access_estoque_pecas ||
    !!perms.access_relatorios;
  const hasToolsAccess = isSystemUser && (perms.access_settings || perms.access_change_passwords || perms.access_technicians);
  const showToolsSection = hasToolsAccess && !perms.full_access;

  const headerDisplayName = useMemo(() => {
    if (isSystemUser) {
      const n = (systemUserDisplayName || systemUserUsername || '').trim();
      return n || 'Usuário';
    }
    if (isTechnician && (technicianName || '').trim()) return technicianName.trim();
    return (adminDisplayName || 'Rei do ABS').trim();
  }, [isSystemUser, systemUserDisplayName, systemUserUsername, isTechnician, technicianName, adminDisplayName]);

  const headerPhotoUrl = useMemo(() => {
    if (isSystemUser) return systemUserPhotoUrl;
    return adminPhotoUrl;
  }, [isSystemUser, systemUserPhotoUrl, adminPhotoUrl]);

  const headerInitial = useMemo(
    () => (headerDisplayName ? headerDisplayName.charAt(0).toUpperCase() : '?'),
    [headerDisplayName]
  );

  const headerAvatarAccentStyle: React.CSSProperties | undefined = useMemo(() => {
    if (headerPhotoUrl || !isSystemUser || !systemUserAccentColor) return undefined;
    const h = systemUserAccentColor.trim();
    if (!/^#[0-9A-Fa-f]{6}$/.test(h)) return undefined;
    return iosSquircleBackgroundFromHex(h);
  }, [headerPhotoUrl, isSystemUser, systemUserAccentColor]);

  const headerProfileMenuProfileTitle = isSystemUser
    ? 'Configurações de perfil'
    : isTechnician
      ? technicianId
        ? 'Meu perfil'
        : 'Configurações'
      : 'Perfil do administrador';

  const headerProfileMenuProfileHint = isSystemUser
    ? 'Nome, foto e cor'
    : isTechnician
      ? technicianId
        ? 'Nome e foto'
        : 'Hub de configurações'
      : 'Nome e foto da gerência';

  /** Abre após o ciclo de eventos: evita “click-through” (o `click` após `pointerup` atingir linhas do hub que acabou de montar). */
  const openAfterInputCycle = useCallback((fn: () => void) => {
    window.setTimeout(fn, 0);
  }, []);

  const openHeaderProfileEditor = useCallback(() => {
    setIsHeaderProfileMenuOpen(false);
    openAfterInputCycle(() => {
      if (isSystemUser) {
        setIsUserProfileOpen(true);
        return;
      }
      if (isTechnician && technicianId) {
        setIsTechnicianProfileOpen(true);
        return;
      }
      if (!isTechnician) {
        setIsAdminProfileOpen(true);
        return;
      }
      setIsHomeSettingsHubOpen(true);
    });
  }, [isSystemUser, isTechnician, technicianId, openAfterInputCycle]);

  const handleHeaderProfileClick = useCallback(() => {
    setIsHeaderProfileMenuOpen((prev) => !prev);
  }, []);

  const handleHeaderLogout = useCallback(() => {
    setIsHeaderProfileMenuOpen(false);
    onLogout?.();
  }, [onLogout]);

  const updateHeaderProfileMenuPosition = useCallback(() => {
    const btn = headerProfileTriggerRef.current;
    if (!btn || typeof window === 'undefined') return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 248;
    let left = rect.right - menuWidth;
    left = Math.max(12, Math.min(left, window.innerWidth - menuWidth - 12));
    setHeaderProfileMenuStyle({
      position: 'fixed',
      top: rect.bottom + 8,
      left,
      width: menuWidth,
      zIndex: 99999,
    });
  }, []);

  useLayoutEffect(() => {
    if (!isHeaderProfileMenuOpen) return;
    updateHeaderProfileMenuPosition();
  }, [isHeaderProfileMenuOpen, updateHeaderProfileMenuPosition]);

  useEffect(() => {
    if (!isHeaderProfileMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (headerProfileTriggerRef.current?.contains(t)) return;
      if (headerProfileMenuRef.current?.contains(t)) return;
      setIsHeaderProfileMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setIsHeaderProfileMenuOpen(false);
    };
    window.addEventListener('resize', updateHeaderProfileMenuPosition);
    window.addEventListener('scroll', updateHeaderProfileMenuPosition, true);
    document.addEventListener('click', onDoc, true);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', updateHeaderProfileMenuPosition);
      window.removeEventListener('scroll', updateHeaderProfileMenuPosition, true);
      document.removeEventListener('click', onDoc, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [isHeaderProfileMenuOpen, updateHeaderProfileMenuPosition]);

  /** Oculta TabBar como um modal; sem portal no body (evita cobrir modais renderizados no root). */
  useRegisterModalOpen(isHomeSettingsHubOpen);

  /** Evita fechar a tela de configurações ou fundo enquanto um modal filho está aberto. */
  const childModalStackActive = useMemo(
    () =>
      isSystemUsersOpen ||
      isSystemNotificationsOpen ||
      isServicesModalOpen ||
      isPartsModalOpen ||
      isPatioChecklistsOpen ||
      isChangePasswordsOpen ||
      isTvPatioOpen ||
      (Boolean(technicianId) && isTechnicianProfileOpen) ||
      isAdminProfileOpen ||
      isUserProfileOpen ||
      globalOverlayModalOpen,
    [
      isSystemUsersOpen,
      isSystemNotificationsOpen,
      isServicesModalOpen,
      isPartsModalOpen,
      isPatioChecklistsOpen,
      isChangePasswordsOpen,
      isTvPatioOpen,
      technicianId,
      isTechnicianProfileOpen,
      isAdminProfileOpen,
      isUserProfileOpen,
      globalOverlayModalOpen,
    ]
  );

  // Pilha LIFO: hub primeiro (base), depois modais na ordem em que tendem a abrir por cima
  useBrowserBackLayer(isHomeSettingsHubOpen, () => setIsHomeSettingsHubOpen(false));
  useBrowserBackLayer(isAdminProfileOpen, () => setIsAdminProfileOpen(false));
  useBrowserBackLayer(isChangePasswordsOpen, () => setIsChangePasswordsOpen(false));
  useBrowserBackLayer(isPartsModalOpen, () => setIsPartsModalOpen(false));
  useBrowserBackLayer(isPatioChecklistsOpen, () => setIsPatioChecklistsOpen(false));
  useBrowserBackLayer(isServicesModalOpen, () => setIsServicesModalOpen(false));
  useBrowserBackLayer(isSystemUsersOpen, () => setIsSystemUsersOpen(false));
  useBrowserBackLayer(Boolean(technicianId) && isTechnicianProfileOpen, () => setIsTechnicianProfileOpen(false));
  useBrowserBackLayer(isTvPatioOpen, () => setIsTvPatioOpen(false));
  useBrowserBackLayer(isUserProfileOpen, () => setIsUserProfileOpen(false));
  useBrowserBackLayer(isSystemNotificationsOpen, () => setIsSystemNotificationsOpen(false));
  useBrowserBackLayer(isHeaderProfileMenuOpen, () => setIsHeaderProfileMenuOpen(false));

  const operationalForView = useMemo(() => {
    if (isTechnician) return OPERATIONAL_APPS.filter((a) => allowedTabs.includes(a.id));
    if (isLimitedSystem) {
      return OPERATIONAL_APPS.filter((a) => {
        if (a.id === 'agenda') return !!perms.access_agenda;
        if (a.id === 'patio') return !!perms.access_patio;
        if (a.id === 'orcamentos') return effectiveAccessOrcamentos(perms);
        if (a.id === 'laboratorio') return !!perms.access_laboratorio;
        return false;
      });
    }
    return OPERATIONAL_APPS;
  }, [allowedTabs, isLimitedSystem, isTechnician, perms]);
  const quickTilesForView = useMemo(() => {
    const baseTiles = operationalForView.map((app) => ({
      id: app.id as QuickTileId,
      label: app.label,
      icon: app.icon,
      onOpen: () => onOpenApp(app.id),
    }));
    const settingsTile = {
      id: 'settings_hub' as QuickTileId,
      label: 'Configurações',
      icon: (
        <img src="/icons/configuracoes-ios.png" alt="Configurações" className="h-full w-full object-cover" />
      ),
      onOpen: () => setIsHomeSettingsHubOpen(true),
    };
    const extraTiles: {
      id: QuickTileId;
      label: string;
      icon: React.ReactElement;
      onOpen: () => void;
    }[] = [];
    if (showFullAdminHub || !!perms.access_tv_patio) {
      extraTiles.push({
        id: 'tv_patio',
        label: 'TVs da oficina',
        icon: <img src="/icons/tv-patio-ios.png" alt="TVs Pátio e Laboratório" className="h-full w-full object-cover" />,
        onOpen: () => setIsTvPatioOpen(true),
      });
    }
    if (showFullAdminHub || !!perms.access_centro_atendimento) {
      extraTiles.push({
        id: 'centro_atendimento',
        label: 'Central do atendimento',
        icon: <img src="/icons/recepcao-ios.png" alt="Central do atendimento" className="h-full w-full object-cover" />,
        onOpen: () => onOpenVehicleAccompaniment?.(null),
      });
    }
    if (showFullAdminHub || !!perms.access_estoque_pecas) {
      extraTiles.push({
        id: 'parts_stock',
        label: 'Estoque de peças',
        icon: <img src="/icons/estoque-ios.png" alt="Estoque de peças" className="h-full w-full object-cover" />,
        onOpen: () => setIsPartsModalOpen(true),
      });
    }
    if (showFullAdminHub || !!perms.access_relatorios) {
      extraTiles.push({
        id: 'relatorios',
        label: 'Relatórios',
        icon: (
          <img src="/icons/relatorios-ios.svg" alt="Relatórios" className="h-full w-full object-cover" />
        ),
        onOpen: () => onOpenApp('relatorios'),
      });
    }
    if (showFullAdminHub || !!perms.access_boletim_erros) {
      extraTiles.push({
        id: 'boletim_erros',
        label: 'Boletim de Erros',
        icon: (
          <img src={ERROR_BULLETIN_ICON} alt="Boletim de Erros" className="h-full w-full object-cover" />
        ),
        onOpen: () => onOpenApp('boletim_erros'),
      });
    }
    if (showFullAdminHub || !!perms.access_radar_qualidade) {
      extraTiles.push({
        id: 'radar_qualidade',
        label: 'Radar de Qualidade',
        icon: (
          <img src={QUALITY_RADAR_ICON} alt="Radar de Qualidade" className="h-full w-full object-cover" />
        ),
        onOpen: () => onOpenApp('radar_qualidade'),
      });
    }
    return [...baseTiles, ...extraTiles, settingsTile];
  }, [onOpenApp, onOpenVehicleAccompaniment, operationalForView, perms, showFullAdminHub]);
  const operationalById = useMemo(
    () =>
      Object.fromEntries(quickTilesForView.map((tile) => [tile.id, tile])) as Record<
        QuickTileId,
        { id: QuickTileId; label: string; icon: React.ReactElement; onOpen: () => void }
      >,
    [quickTilesForView]
  );
  const orderedOperationalApps = useMemo(() => {
    const visibleIds = new Set(quickTilesForView.map((tile) => tile.id));
    const fromSaved = quickLayout.order.filter((id) => visibleIds.has(id));
    quickTilesForView.forEach((tile) => {
      if (!fromSaved.includes(tile.id)) fromSaved.push(tile.id);
    });
    return fromSaved.map((id) => operationalById[id]).filter(Boolean);
  }, [operationalById, quickTilesForView, quickLayout.order]);

  useEffect(() => {
    try {
      localStorage.setItem(QUICK_APPS_LAYOUT_KEY, JSON.stringify(quickLayout));
    } catch (_) {}
  }, [quickLayout]);

  const endQuickDrag = useCallback(() => {
    setDraggingQuickId(null);
    setQuickDragVisual(null);
    lastQuickReorderTargetRef.current = null;
    quickReorderCandidateRef.current = null;
    quickReorderCandidateHitsRef.current = 0;
    if (dragFrameRef.current != null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
  }, []);

  const moveQuickApp = useCallback((sourceId: QuickTileId, targetId: QuickTileId) => {
    if (sourceId === targetId) return;
    setQuickLayout((prev) => {
      const order = [...prev.order];
      const from = order.indexOf(sourceId);
      const to = order.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      order.splice(from, 1);
      order.splice(to, 0, sourceId);
      return { ...prev, order };
    });
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      setQuickDragVisual((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          x: event.clientX - prev.offsetX,
          y: event.clientY - prev.offsetY,
        };
      });

      if (!draggingQuickId) return;
      if (dragFrameRef.current != null) return;
        dragFrameRef.current = window.requestAnimationFrame(() => {
        dragFrameRef.current = null;
        const gridRoot = quickAppsGridRef.current;
        if (!gridRoot) return;
        const tileNodes = Array.from(gridRoot.querySelectorAll<HTMLElement>('[data-quick-app-id]'));
        if (tileNodes.length === 0) return;
        let bestId: QuickTileId | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const node of tileNodes) {
          const id = node.dataset.quickAppId as QuickTileId | undefined;
          if (!id || id === draggingQuickId) continue;
          const rect = node.getBoundingClientRect();
          const withinExpandedRect =
            event.clientX >= rect.left - QUICK_TARGET_PADDING_PX &&
            event.clientX <= rect.right + QUICK_TARGET_PADDING_PX &&
            event.clientY >= rect.top - QUICK_TARGET_PADDING_PX &&
            event.clientY <= rect.bottom + QUICK_TARGET_PADDING_PX;
          if (!withinExpandedRect) continue;
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = cx - event.clientX;
          const dy = cy - event.clientY;
          const distance = dx * dx + dy * dy;
          if (distance < bestDistance) {
            bestDistance = distance;
            bestId = id;
          }
        }
        if (!bestId || bestId === lastQuickReorderTargetRef.current) {
          quickReorderCandidateRef.current = null;
          quickReorderCandidateHitsRef.current = 0;
          return;
        }
        if (quickReorderCandidateRef.current !== bestId) {
          quickReorderCandidateRef.current = bestId;
          quickReorderCandidateHitsRef.current = 1;
          return;
        }
        quickReorderCandidateHitsRef.current += 1;
        if (quickReorderCandidateHitsRef.current < QUICK_REORDER_HYSTERESIS_HITS) return;
        quickReorderCandidateRef.current = null;
        quickReorderCandidateHitsRef.current = 0;
        lastQuickReorderTargetRef.current = bestId;
        moveQuickApp(draggingQuickId, bestId);
      });
    };

    const stopDrag = () => endQuickDrag();

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
    };
  }, [draggingQuickId, endQuickDrag, moveQuickApp]);

  useEffect(() => {
    if (!isHomeSettingsHubOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (childModalStackActive) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setIsHomeSettingsHubOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isHomeSettingsHubOpen, childModalStackActive]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const beginQuickDrag = useCallback(
    (
      appId: QuickTileId,
      rect: DOMRect,
      pointer: { clientX: number; clientY: number }
    ) => {
      setDraggingQuickId(appId);
      setQuickDragVisual({
        id: appId,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        offsetX: pointer.clientX - rect.left,
        offsetY: pointer.clientY - rect.top,
      });
    },
    []
  );

  const handleQuickCardPointerDown = useCallback(
    (appId: QuickTileId, event: React.PointerEvent<HTMLButtonElement>) => {
      longPressTriggeredRef.current = false;
      clearLongPressTimer();
      const rect = event.currentTarget.getBoundingClientRect();
      const pointer = { clientX: event.clientX, clientY: event.clientY };

      if (isQuickEditMode) {
        beginQuickDrag(appId, rect, pointer);
        return;
      }

      longPressTimerRef.current = window.setTimeout(() => {
        longPressTriggeredRef.current = true;
        setIsQuickEditMode(true);
        beginQuickDrag(appId, rect, pointer);
      }, LONG_PRESS_MS);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [beginQuickDrag, clearLongPressTimer, isQuickEditMode]
  );

  const handleQuickCardPointerUp = useCallback(
    (app: { id: QuickTileId; onOpen: () => void }) => {
      clearLongPressTimer();
      const shouldOpen = !isQuickEditMode && !longPressTriggeredRef.current;
      if (shouldOpen) {
        openAfterInputCycle(() => app.onOpen());
      }
      if (!longPressTriggeredRef.current) {
        endQuickDrag();
      }
      longPressTriggeredRef.current = false;
    },
    [clearLongPressTimer, endQuickDrag, isQuickEditMode, openAfterInputCycle]
  );

  const toggleQuickTileSize = useCallback((appId: QuickTileId) => {
    setQuickLayout((prev) => {
      const current = prev.sizes[appId] ?? 'normal';
      const next: QuickTileSize = current === 'wide' ? 'normal' : 'wide';
      return {
        ...prev,
        sizes: {
          ...prev.sizes,
          [appId]: next,
        },
      };
    });
  }, []);

  const quickGridColsClass =
    orderedOperationalApps.length <= 1
      ? 'grid-cols-1'
      : orderedOperationalApps.length === 2
        ? 'grid-cols-2'
        : hasRichQuickGrid
          ? 'grid-cols-2 lg:grid-cols-3'
          : 'grid-cols-2 lg:grid-cols-4';

  return (
    <div className="min-h-full flex flex-col safe-area-pb relative overflow-x-hidden">
      {/* Fundo um pouco mais acinzentado para contraste com os cartões */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-zinc-200/90 via-zinc-100 to-zinc-200/85 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950" />
      <div className="fixed inset-0 -z-10 pointer-events-none opacity-35 dark:opacity-25 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(251,191,36,0.18),transparent),radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(56,189,248,0.1),transparent),radial-gradient(ellipse_50%_35%_at_0%_100%,rgba(167,139,250,0.08),transparent)]" />
      <div className="fixed inset-0 -z-10 pointer-events-none backdrop-blur-[2px]" />

      {/* Cabeçalho em vidro — alinhado ao topo (safe area apenas onde necessário) */}
      <header className="relative z-10 pt-[max(0.5rem,env(safe-area-inset-top))] pb-4 px-4 sm:px-6 border-b border-zinc-200/70 dark:border-white/[0.08] bg-white/70 dark:bg-zinc-950/60 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.55)_inset] dark:shadow-none">
        <div className="max-w-xl lg:max-w-5xl mx-auto flex items-center justify-between gap-3 min-w-0">
          <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
            <div className="relative shrink-0">
              <div className="absolute -inset-0.5 rounded-[1.15rem] bg-gradient-to-br from-amber-400/50 via-white/20 to-cyan-400/40 opacity-80 dark:opacity-60 blur-[1px] pointer-events-none" />
        <img
          src="/logo.png"
          alt="Rei do ABS"
                className="relative h-12 w-12 sm:h-14 sm:w-14 object-contain rounded-2xl border border-white/60 shadow-lg shadow-black/5 ring-1 ring-black/5 dark:border-white/10 dark:shadow-black/40 dark:ring-white/10"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400 mb-0.5 truncate">
                Oficina
              </p>
              <h1 className="text-[1.35rem] sm:text-[1.65rem] font-semibold tracking-tight text-zinc-900 dark:text-white leading-tight truncate">
          Rei do ABS
        </h1>
              <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1 flex items-center gap-1.5 min-w-0">
                <Sparkles className="w-3.5 h-3.5 text-brand-yellow shrink-0" />
                <span className="truncate">Toque em um módulo para começar</span>
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3 pl-1">
            <div className="flex min-w-0 max-w-[5.5rem] flex-col items-end text-right min-[400px]:max-w-[8rem] sm:max-w-[11rem]">
              <span className="truncate text-[12px] font-semibold leading-tight text-zinc-900 dark:text-white sm:text-[14px]">
                {headerDisplayName}
              </span>
              <span className="truncate text-[10px] text-zinc-500 dark:text-zinc-400 sm:text-[11px]">
                {isTechnician
                  ? 'Técnico'
                  : isSystemUser
                    ? perms.full_access
                      ? 'Acesso completo'
                      : 'Usuário'
                    : 'Administrador'}
              </span>
            </div>
            <button
              ref={headerProfileTriggerRef}
              type="button"
              onClick={handleHeaderProfileClick}
              aria-label="Menu da conta"
              aria-expanded={isHeaderProfileMenuOpen}
              aria-haspopup="menu"
              className={`relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-zinc-200/90 shadow-md ring-1 ring-black/[0.04] transition-transform hover:opacity-95 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/12 dark:ring-white/10 dark:focus-visible:ring-offset-zinc-950 sm:h-12 sm:w-12 ${
                headerPhotoUrl || headerAvatarAccentStyle
                  ? ''
                  : 'bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-600 dark:to-zinc-700'
              } ${isHeaderProfileMenuOpen ? 'ring-2 ring-[#007AFF]/55' : ''}`}
              style={headerAvatarAccentStyle}
            >
              {headerPhotoUrl ? (
                <img
                  src={headerPhotoUrl}
                  alt=""
                  className="pointer-events-none absolute inset-0 size-full min-h-0 min-w-0 object-cover object-center"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span
                  className={`pointer-events-none relative z-[1] text-[1.1rem] sm:text-[1.2rem] font-semibold drop-shadow-sm ${
                    headerAvatarAccentStyle ? 'text-white' : 'text-zinc-800 dark:text-white'
                  }`}
                >
                  {headerInitial}
              </span>
              )}
            </button>
            {isHeaderProfileMenuOpen && typeof document !== 'undefined'
              ? createPortal(
                  <div
                    ref={headerProfileMenuRef}
                    role="menu"
                    style={headerProfileMenuStyle}
                    className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white py-1.5 text-zinc-900 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)] backdrop-blur-xl dark:border-white/[0.12] dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.55)]"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-zinc-100/90 dark:hover:bg-white/[0.08]"
                      onClick={openHeaderProfileEditor}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-700 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-zinc-200">
                        <User className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold leading-snug">{headerProfileMenuProfileTitle}</span>
                        <span className="mt-0.5 block text-[11px] font-normal leading-snug text-zinc-500 dark:text-zinc-400">
                          {headerProfileMenuProfileHint}
                        </span>
                      </span>
                    </button>
                    {onLogout ? (
                      <>
                        <div className="mx-3 my-1 h-px bg-zinc-100 dark:bg-white/[0.08]" />
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-red-50/90 dark:hover:bg-red-500/10"
                          onClick={handleHeaderLogout}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-200/80 bg-red-50 text-red-600 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-400">
                            <LogOut className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-semibold leading-snug text-red-600 dark:text-red-400">Sair</span>
                            <span className="mt-0.5 block text-[11px] font-normal leading-snug text-red-500/80 dark:text-red-400/70">
                              Encerrar sessão neste dispositivo
                            </span>
                          </span>
                        </button>
                      </>
                    ) : null}
                  </div>,
                  document.body
                )
              : null}
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 px-4 sm:px-6 pb-28 max-w-xl lg:max-w-5xl mx-auto w-full">
        <section className="pt-5 pb-6 lg:pt-6">
              <p className={iosSectionTitle}>Operação</p>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className={`${iosSectionHint} mb-0`}>
                  {isQuickEditMode ? 'Arraste para reorganizar. Toque em 2x para cartão largo.' : 'Acesso rápido aos módulos do dia a dia'}
                </p>
                {isQuickEditMode ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsQuickEditMode(false);
                      endQuickDrag();
                    }}
                    className="shrink-0 rounded-full border border-[#007AFF]/45 bg-[#007AFF]/15 px-3 py-1.5 text-[12px] font-semibold text-[#007AFF] transition-all hover:bg-[#007AFF]/20 dark:border-[#64B5FF]/45 dark:bg-[#64B5FF]/14 dark:text-[#8cc8ff]"
                  >
                    Concluir
                  </button>
                ) : null}
              </div>

              <div
                ref={quickAppsGridRef}
                onPointerUp={() => endQuickDrag()}
                className={`relative isolate z-0 grid gap-3 ${quickGridColsClass} ${isQuickEditMode ? 'touch-none select-none' : ''}`}
              >
                {orderedOperationalApps.map((app) => {
                  const isWide = (quickLayout.sizes[app.id] ?? 'normal') === 'wide';
                  const isDragging = draggingQuickId === app.id;
                  return (
                    <button
                      key={app.id}
                      data-quick-app-id={app.id}
                      type="button"
                      style={{ touchAction: 'manipulation' }}
                      onPointerDown={(event) => handleQuickCardPointerDown(app.id, event)}
                      onPointerUp={() => handleQuickCardPointerUp(app)}
                      onPointerLeave={clearLongPressTimer}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setIsQuickEditMode(true);
                      }}
                      className={`group relative flex w-full flex-col items-center gap-3 p-4 sm:p-5 text-center select-none ${iosCard} border-[#007AFF]/0 hover:border-[#007AFF]/15 dark:hover:border-[#0A84FF]/20 hover:shadow-[0_12px_40px_-12px_rgba(0,122,255,0.2)] transition-all duration-300 active:scale-[0.99] ${
                        isWide ? 'col-span-2' : ''
                      } ${isQuickEditMode ? 'animate-[pulse_2.8s_ease-in-out_infinite]' : ''} ${
                        isDragging ? 'scale-[1.02] border-[#007AFF]/35 shadow-[0_18px_48px_-18px_rgba(0,122,255,0.38)]' : ''
                      } ${isQuickEditMode ? 'touch-none select-none' : ''} ${isDragging ? 'opacity-30' : ''}`}
                    >
                      {isQuickEditMode && (
                        <span
                          role="button"
                          tabIndex={0}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleQuickTileSize(app.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            event.stopPropagation();
                            toggleQuickTileSize(app.id);
                          }}
                          className="pointer-events-auto absolute right-2 top-2 z-10 rounded-full border border-[#007AFF]/35 bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#007AFF] shadow-sm backdrop-blur-md transition-all hover:bg-white dark:border-[#64B5FF]/45 dark:bg-zinc-900/80 dark:text-[#8cc8ff]"
                        >
                          2x
                        </span>
                      )}
                      {/* pointer-events-none: toque registra no <button> inteiro (cartão + squircle), evita área morta em imagens/WebKit */}
                      <span className="pointer-events-none flex w-full flex-col items-center gap-3">
                        <span className="relative inline-flex shrink-0">
                          <IosAccentIconSquircle
                            variant="tile"
                            className="pointer-events-none shrink-0 transition-transform duration-300 group-hover:scale-105"
                            strokeWidth={2.2}
                          >
                            {app.icon}
                          </IosAccentIconSquircle>
                          {app.id === 'orcamentos' && patioBudgetsHubBadge > 0 ? (
                            <span className="pointer-events-none absolute -right-1 -top-1 z-10 flex min-h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-md ring-2 ring-white dark:ring-zinc-950">
                              {patioBudgetsHubBadge > 99 ? "99+" : patioBudgetsHubBadge}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-[15px] font-semibold leading-tight text-zinc-900 dark:text-white">
                          {app.label}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {quickDragVisual && operationalById[quickDragVisual.id] && (
                <div
                  className="pointer-events-none fixed z-[80]"
                  style={{
                    left: `${quickDragVisual.x}px`,
                    top: `${quickDragVisual.y}px`,
                    width: `${quickDragVisual.width}px`,
                    height: `${quickDragVisual.height}px`,
                  }}
                >
                  <div
                    className={`group relative flex h-full w-full flex-col items-center gap-3 p-4 sm:p-5 text-center ${iosCard} border-[#007AFF]/45 shadow-[0_22px_60px_-18px_rgba(0,122,255,0.45)] scale-[1.03]`}
                  >
                    <IosAccentIconSquircle variant="tile" className="scale-105" strokeWidth={2.2}>
                      {operationalById[quickDragVisual.id].icon}
                    </IosAccentIconSquircle>
                    <span className="text-[15px] font-semibold text-zinc-900 dark:text-white leading-tight">
                      {operationalById[quickDragVisual.id].label}
                    </span>
                  </div>
                </div>
              )}
            </section>
      </main>

      {isHomeSettingsHubOpen ? (
          <div
            className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-light-page dark:bg-black"
            role="dialog"
            aria-modal="true"
            aria-label="Configurações"
          >
            <header className="shrink-0 border-b border-zinc-200/80 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[0_1px_0_0_rgba(255,255,255,0.55)_inset] dark:border-white/[0.08] dark:bg-zinc-950 dark:shadow-none">
              <div className="relative w-full">
                <button
                  type="button"
                  onClick={() => {
                    if (childModalStackActive) return;
                    setIsHomeSettingsHubOpen(false);
                  }}
                  className="absolute left-0 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200/75 bg-white/80 text-zinc-700 shadow-[0_4px_18px_-8px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all hover:bg-white/95 active:scale-[0.97] dark:border-white/[0.12] dark:bg-zinc-900/75 dark:text-zinc-200 dark:hover:bg-zinc-900/90"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="mx-auto flex min-h-[2.5rem] max-w-xl flex-col items-center justify-center px-12 text-center lg:max-w-5xl">
                  <div className="mb-0.5 flex h-9 w-9 items-center justify-center overflow-hidden rounded-2xl border border-zinc-300/75 bg-zinc-100 shadow-inner dark:border-white/[0.12] dark:bg-zinc-800/95">
                    <img src="/icons/configuracoes-ios.png" alt="" className="h-full w-full object-cover" />
                  </div>
                  <h1 className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white">
                    Configurações
                  </h1>
                </div>
              </div>
            </header>

            <div className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 [scrollbar-gutter:stable]">
              <div className="mx-auto w-full max-w-xl space-y-6 px-4 sm:px-6 lg:max-w-5xl">
                  <section>
                    <p className={iosSectionTitle}>Conta</p>
                    <p className={iosSectionHint}>Perfil e sessão</p>
                    <div className={`${iosCard} space-y-0.5 p-2`}>
                      {isSystemUser && (
                        <SettingsRow
                          onClick={() => setIsUserProfileOpen(true)}
                          title="Configurações de perfil"
                          subtitle="Nome, foto e cor"
                          icon={
                            <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
                              <img
                                src="/icons/perfil-ios.png"
                                alt="Configurações de perfil"
                                className="h-full w-full object-cover"
                              />
                            </IosAccentIconSquircle>
                          }
                        />
                      )}
                      {(!isTechnician || technicianId) && !isSystemUser && (
                        <SettingsRow
                          onClick={() => {
                            if (isTechnician) setIsTechnicianProfileOpen(true);
                            else setIsAdminProfileOpen(true);
                          }}
                          title={isTechnician ? 'Meu perfil' : 'Perfil do administrador'}
                          subtitle={isTechnician ? 'Nome e foto' : 'Nome e foto da gerência'}
                          icon={
                            <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
                              {isTechnician ? (
                                <User />
                              ) : (
                                <img
                                  src="/icons/admin-perfil-ios.png"
                                  alt="Perfil do administrador"
                                  className="h-full w-full object-cover"
                                />
                              )}
                            </IosAccentIconSquircle>
                          }
                        />
                      )}
                      {onLogout && (
                        <SettingsRow
                          onClick={() => {
                            setIsHomeSettingsHubOpen(false);
                            onLogout();
                          }}
                          title="Sair"
                          subtitle="Encerrar sessão neste dispositivo"
                          danger
                          icon={
                            <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
                              <LogOut className="text-red-500 dark:text-red-400" />
                            </IosAccentIconSquircle>
                          }
                        />
                      )}
                    </div>
                  </section>

                  {showToolsSection && (
                    <section>
                      <p className={iosSectionTitle}>Ferramentas</p>
                      <p className={iosSectionHint}>Opções liberadas para você</p>
                      <div className={`${iosCard} space-y-0.5 p-2`}>
                        {perms.access_settings && onOpenSettings && (
                          <SettingsRow
                            onClick={() => onOpenSettings()}
                            title="Preferências da oficina"
                            subtitle="Tema e experiência do app"
                            icon={
                              <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
                                <img
                                  src="/icons/configuracoes-ios.png"
                                  alt="Preferências"
                                  className="h-full w-full object-cover"
                                />
                              </IosAccentIconSquircle>
                            }
                          />
                        )}
                        {perms.access_change_passwords && onOpenChangePasswords && (
                          <SettingsRow
                            onClick={() => onOpenChangePasswords()}
                            title="Alterar senhas"
                            subtitle="Segurança de acessos"
                            icon={
                              <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
                                <img
                                  src="/icons/senhas-ios.png"
                                  alt="Alterar senhas"
                                  className="h-full w-full object-cover"
                                />
                              </IosAccentIconSquircle>
                            }
                          />
                        )}
                      </div>
                    </section>
                  )}

                  {showAdminSection && (
                    <section>
                      <p className={iosSectionTitle}>Administração</p>
                      <p className={iosSectionHint}>Usuários, avisos e cadastros da oficina</p>
                      <div className={`${iosCard} space-y-0.5 p-2 lg:grid lg:grid-cols-2 lg:gap-0 lg:p-2`}>
                        <div className="space-y-0.5 lg:grid lg:grid-cols-1">
                          {(isWorkshopAdmin || (isSystemUser && !!perms.full_access)) && (
                            <SettingsRow
                              onClick={() => setIsSystemUsersOpen(true)}
                              title="Usuários do sistema"
                              subtitle="Acessos e permissões"
                              icon={
                                <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
                                  <img
                                    src="/icons/usuarios-ios.png"
                                    alt="Usuários do sistema"
                                    className="h-full w-full object-cover"
                                  />
                                </IosAccentIconSquircle>
                              }
                            />
                          )}
                          {(showFullAdminHub || !!perms.access_notificacoes_sistema) && (
                            <SettingsRow
                              onClick={() => setIsSystemNotificationsOpen(true)}
                              title="Notificações do sistema"
                              subtitle="Orçamentos, comentários, OS e lembretes"
                              icon={
                                <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
                                  <img
                                    src={SYSTEM_NOTIFICATIONS_ICON}
                                    alt="Notificações do sistema"
                                    className="h-full w-full object-cover"
                                  />
                                </IosAccentIconSquircle>
                              }
                            />
                          )}
                          {(showFullAdminHub || (!!perms.access_settings && isSystemUser)) && (
                            <SettingsRow
                              onClick={() => {
                                setIsHomeSettingsHubOpen(false);
                                onOpenApp('settings');
                              }}
                              title="Tema do sistema"
                              subtitle="Configurações da oficina"
                              icon={
                                <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
                                  <img
                                    src="/icons/tema-sistema-ios.png"
                                    alt="Tema do sistema"
                                    className="h-full w-full object-cover"
                                  />
                                </IosAccentIconSquircle>
                              }
                            />
                          )}
                          {(showFullAdminHub || !!perms.access_servicos_oficina) && (
                            <SettingsRow
                              onClick={() => setIsServicesModalOpen(true)}
                              title="Serviços da oficina"
                              subtitle="Catálogo e valores"
                              icon={
                                <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
                                  <img
                                    src="/icons/servicos-oficina-ios.png"
                                    alt="Serviços da oficina"
                                    className="h-full w-full object-cover"
                                  />
                                </IosAccentIconSquircle>
                              }
                            />
                          )}
                        </div>
                        <div className="space-y-0.5 lg:border-l lg:border-zinc-200/60 lg:pl-2 dark:lg:border-white/[0.06]">
                          {(showFullAdminHub || !!perms.access_checklists_patio) && (
                            <SettingsRow
                              onClick={() => setIsPatioChecklistsOpen(true)}
                              title="Checklists do Pátio"
                              subtitle="Modelos por etapa"
                              icon={
                                <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
                                  <img
                                    src="/icons/checklist-patio-ios.png"
                                    alt="Checklists do Pátio"
                                    className="h-full w-full object-cover"
                                  />
                                </IosAccentIconSquircle>
                              }
                            />
                          )}
                          {(showFullAdminHub || !!perms.access_tv_patio) && (
                            <a
                              href="https://patio-view.vercel.app/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all duration-200 hover:bg-zinc-100/90 active:scale-[0.99] sm:px-4 sm:py-3.5 dark:hover:bg-white/[0.06]"
                            >
                              <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
                                <img
                                  src="/icons/painel-patio-tv-ios.png"
                                  alt="Painel do Pátio (TV)"
                                  className="h-full w-full object-cover"
                                />
                              </IosAccentIconSquircle>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[15px] font-medium leading-snug text-zinc-900 dark:text-white">
                                  Painel do Pátio (TV)
                                </span>
                                <span className="mt-0.5 block text-[12px] text-zinc-950 dark:text-zinc-400">
                                  Abrir em nova aba
                                </span>
                              </span>
                              <ExternalLink className="h-5 w-5 shrink-0 text-zinc-400 transition-colors group-hover:text-brand-yellow" />
                            </a>
                          )}
                          {(showFullAdminHub || (!!perms.access_change_passwords && isSystemUser)) && (
                            <SettingsRow
                              onClick={() => setIsChangePasswordsOpen(true)}
                              title="Alterar senhas"
                              subtitle="Gerência e equipe"
                              icon={
                                <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
                                  <img
                                    src="/icons/senhas-ios.png"
                                    alt="Alterar senhas"
                                    className="h-full w-full object-cover"
                                  />
                                </IosAccentIconSquircle>
                              }
                            />
                          )}
                        </div>
                      </div>
                    </section>
                  )}
              </div>
            </div>
      </div>
      ) : null}

      {!isTechnician && (
        <>
          <SystemUsersModal isOpen={isSystemUsersOpen} onClose={() => setIsSystemUsersOpen(false)} refreshTrigger={systemUsersRefreshTrigger} />
          <SystemNotificationsModal isOpen={isSystemNotificationsOpen} onClose={() => setIsSystemNotificationsOpen(false)} />
          <WorkshopServicesModal isOpen={isServicesModalOpen} onClose={() => setIsServicesModalOpen(false)} />
          <WorkshopPartsModal isOpen={isPartsModalOpen} onClose={() => setIsPartsModalOpen(false)} />
          <PatioChecklistsModal isOpen={isPatioChecklistsOpen} onClose={() => setIsPatioChecklistsOpen(false)} />
          <ChangePasswordsModal isOpen={isChangePasswordsOpen} onClose={() => setIsChangePasswordsOpen(false)} />
        </>
      )}
      <TvPatioModal isOpen={isTvPatioOpen} onClose={() => setIsTvPatioOpen(false)} />
      {technicianId && (
        <TechnicianProfileModal
          isOpen={isTechnicianProfileOpen}
          technicianId={technicianId}
          initialName={technicianName}
          initialPhotoUrl={null}
          onClose={() => setIsTechnicianProfileOpen(false)}
          onSaved={(newName) => onProfileUpdated?.(newName)}
        />
      )}
      <AdminProfileModal isOpen={isAdminProfileOpen} onClose={() => setIsAdminProfileOpen(false)} onSaved={onAdminProfileSaved} />
      {isSystemUser && (
        <UserProfileModal
          isOpen={isUserProfileOpen}
          username={systemUserUsername}
          initialDisplayName={systemUserDisplayName}
          initialPhotoUrl={systemUserPhotoUrl}
          initialAccentColor={systemUserAccentColor}
          profileToken={systemUserProfileToken}
          isTechnician={systemUserIsTechnician}
          onClose={() => setIsUserProfileOpen(false)}
          onProfileUpdated={onSystemUserProfileUpdated}
        />
      )}
    </div>
  );
};
