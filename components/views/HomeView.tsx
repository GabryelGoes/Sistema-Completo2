import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
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
import { ZayaAlertsModal } from '../ZayaAlertsModal';
import { TvPatioModal } from '../TvPatioModal';
import { UserProfileModal } from '../UserProfileModal';
import type { SystemUserPermissions } from '../../services/apiService';
import { ModalPortal } from '../ui/ModalPortal';

export type HomeAppId = 'reception' | 'agenda' | 'patio' | 'laboratorio' | 'settings';

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
  onAdminProfileSaved?: () => void;
  systemUsersRefreshTrigger?: number;
  systemUserPermissions?: SystemUserPermissions;
  onOpenSettings?: () => void;
  onOpenChangePasswords?: () => void;
  /** Modais no App (ex.: preferências, senhas) que devem ficar acima do hub de configurações */
  globalOverlayModalOpen?: boolean;
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
    id: 'laboratorio',
    label: 'Laboratório',
    icon: <img src="/icons/laboratorio-ios.png" alt="Laboratório" className="h-full w-full object-cover" />,
  },
];

type QuickTileSize = 'normal' | 'wide';
type QuickTileId = HomeAppId | 'tv_patio' | 'parts_stock' | 'settings_hub';
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
const ALL_QUICK_TILE_IDS: QuickTileId[] = [...DEFAULT_QUICK_ORDER, 'tv_patio', 'parts_stock'];

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
  onAdminProfileSaved,
  systemUsersRefreshTrigger,
  systemUserPermissions,
  onOpenSettings,
  onOpenChangePasswords,
  globalOverlayModalOpen = false,
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
  const [isZayaAlertsOpen, setIsZayaAlertsOpen] = useState(false);
  const [isHomeSettingsHubOpen, setIsHomeSettingsHubOpen] = useState(false);
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
  const hasToolsAccess = isSystemUser && (perms.access_settings || perms.access_change_passwords || perms.access_technicians);
  const showAdminSection = (!isTechnician && !isSystemUser) || (isSystemUser && !!perms.full_access);
  const showToolsSection = hasToolsAccess && !perms.full_access;

  /** Evita fechar a tela de configurações ou fundo enquanto um modal filho está aberto. */
  const childModalStackActive = useMemo(
    () =>
      isSystemUsersOpen ||
      isZayaAlertsOpen ||
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
      isZayaAlertsOpen,
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

  const operationalForView = isTechnician ? OPERATIONAL_APPS.filter((a) => allowedTabs.includes(a.id)) : OPERATIONAL_APPS;
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
    if (!showAdminSection) return [...baseTiles, settingsTile];
    return [
      ...baseTiles,
      {
        id: 'tv_patio' as QuickTileId,
        label: 'TV do Pátio',
        icon: <img src="/icons/tv-patio-ios.png" alt="TV do Pátio" className="h-full w-full object-cover" />,
        onOpen: () => setIsTvPatioOpen(true),
      },
      {
        id: 'parts_stock' as QuickTileId,
        label: 'Estoque de peças',
        icon: <img src="/icons/estoque-ios.png" alt="Estoque de peças" className="h-full w-full object-cover" />,
        onOpen: () => setIsPartsModalOpen(true),
      },
      settingsTile,
    ];
  }, [onOpenApp, operationalForView, showAdminSection]);
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
      if (!isQuickEditMode && !longPressTriggeredRef.current) {
        app.onOpen();
      }
      if (!longPressTriggeredRef.current) {
        endQuickDrag();
      }
      longPressTriggeredRef.current = false;
    },
    [clearLongPressTimer, endQuickDrag, isQuickEditMode]
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
        : showAdminSection
          ? 'grid-cols-2 lg:grid-cols-3'
          : 'grid-cols-2 lg:grid-cols-4';

  return (
    <div className="min-h-screen flex flex-col safe-area-pb relative overflow-x-hidden">
      {/* Fundo um pouco mais acinzentado para contraste com os cartões */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-zinc-200/90 via-zinc-100 to-zinc-200/85 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950" />
      <div className="fixed inset-0 -z-10 pointer-events-none opacity-35 dark:opacity-25 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(251,191,36,0.18),transparent),radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(56,189,248,0.1),transparent),radial-gradient(ellipse_50%_35%_at_0%_100%,rgba(167,139,250,0.08),transparent)]" />
      <div className="fixed inset-0 -z-10 pointer-events-none backdrop-blur-[2px]" />

      {/* Cabeçalho em vidro — alinhado ao topo (safe area apenas onde necessário) */}
      <header className="relative z-10 pt-[max(0.5rem,env(safe-area-inset-top))] pb-4 px-4 sm:px-6 border-b border-zinc-200/70 dark:border-white/[0.08] bg-white/70 dark:bg-zinc-950/60 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.55)_inset] dark:shadow-none">
        <div className="max-w-xl lg:max-w-5xl mx-auto flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="absolute -inset-0.5 rounded-[1.15rem] bg-gradient-to-br from-amber-400/50 via-white/20 to-cyan-400/40 opacity-80 dark:opacity-60 blur-[1px]" />
            <img
              src="/logo.png"
              alt="Rei do ABS"
              className="relative w-14 h-14 sm:w-[4.25rem] sm:h-[4.25rem] object-contain rounded-2xl border border-white/60 dark:border-white/10 shadow-lg shadow-black/5 dark:shadow-black/40 ring-1 ring-black/5 dark:ring-white/10"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-950 dark:text-zinc-400 mb-0.5">Oficina</p>
            <h1 className="text-[1.35rem] sm:text-[1.65rem] font-semibold tracking-tight text-zinc-900 dark:text-white leading-tight">
              Rei do ABS
            </h1>
            <p className="text-[13px] text-zinc-950 dark:text-zinc-400 mt-1 flex items-center gap-1.5 flex-wrap">
              <Sparkles className="w-3.5 h-3.5 text-brand-yellow shrink-0" />
              {isTechnician ? (
                <span>
                  Olá, <span className="font-medium text-zinc-700 dark:text-zinc-200">{technicianName}</span>
                </span>
              ) : (
                <span>
                  {adminDisplayName && adminDisplayName !== 'Rei do ABS'
                    ? `${adminDisplayName} · toque em um módulo para começar`
                    : 'Sistema de gestão — toque em um módulo para começar'}
                </span>
              )}
            </p>
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
                      className={`group relative flex flex-col items-center gap-3 p-4 sm:p-5 text-center ${iosCard} border-[#007AFF]/0 hover:border-[#007AFF]/15 dark:hover:border-[#0A84FF]/20 hover:shadow-[0_12px_40px_-12px_rgba(0,122,255,0.2)] transition-all duration-300 active:scale-[0.99] ${
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
                          className="absolute right-2 top-2 z-10 rounded-full border border-[#007AFF]/35 bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#007AFF] shadow-sm backdrop-blur-md transition-all hover:bg-white dark:border-[#64B5FF]/45 dark:bg-zinc-900/80 dark:text-[#8cc8ff]"
                        >
                          2x
                        </span>
                      )}
                      <IosAccentIconSquircle
                        variant="tile"
                        className="transition-transform duration-300 group-hover:scale-105"
                        strokeWidth={2.2}
                      >
                        {app.icon}
                      </IosAccentIconSquircle>
                      <span className="text-[15px] font-semibold text-zinc-900 dark:text-white leading-tight">{app.label}</span>
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
        <ModalPortal>
          <div
            className={
              'fixed inset-0 flex flex-col overflow-hidden !z-[90] ' +
              'bg-gradient-to-b from-zinc-200/90 via-zinc-100 to-zinc-200/85 ' +
              'dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950'
            }
            role="dialog"
            aria-modal="true"
            aria-label="Configurações"
          >
            <header className="shrink-0 border-b border-zinc-200/70 bg-white/75 px-4 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-2xl dark:border-white/[0.08] dark:bg-zinc-950/65">
              <div className="relative mx-auto flex max-w-xl items-center justify-center lg:max-w-5xl">
                <button
                  type="button"
                  onClick={() => {
                    if (childModalStackActive) return;
                    setIsHomeSettingsHubOpen(false);
                  }}
                  className="absolute left-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200/75 bg-white/85 text-zinc-700 shadow-sm backdrop-blur-xl transition-all hover:bg-white active:scale-[0.97] dark:border-white/[0.12] dark:bg-zinc-900/80 dark:text-zinc-200"
                  aria-label="Voltar"
                >
                  <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
                </button>
                <div className="flex flex-col items-center px-12 text-center">
                  <div className="mb-0.5 flex h-9 w-9 items-center justify-center overflow-hidden rounded-2xl border border-zinc-300/75 bg-zinc-100 shadow-inner dark:border-white/[0.12] dark:bg-zinc-800/95">
                    <img src="/icons/configuracoes-ios.png" alt="" className="h-full w-full object-cover" />
                  </div>
                  <h1 className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white">
                    Configurações
                  </h1>
                  <p className="mt-0.5 max-w-sm text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">
                    Conta, ferramentas e administração
                  </p>
                </div>
              </div>
            </header>

            <div className="mx-auto min-h-0 w-full max-w-xl flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 lg:max-w-5xl">
              <div className="space-y-6">
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
                          <SettingsRow
                            onClick={() => setIsZayaAlertsOpen(true)}
                            title="Avisos da Zaya"
                            subtitle="Etapas, orçamentos e destinatários"
                            icon={
                              <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
                                <Sparkles />
                              </IosAccentIconSquircle>
                            }
                          />
                          <SettingsRow
                            onClick={() => {
                              setIsHomeSettingsHubOpen(false);
                              onOpenApp('settings');
                            }}
                            title="Oficina e integrações"
                            subtitle="Configurações da oficina"
                            icon={
                              <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
                                <img
                                  src="/icons/configuracoes-ios.png"
                                  alt="Configurações da oficina"
                                  className="h-full w-full object-cover"
                                />
                              </IosAccentIconSquircle>
                            }
                          />
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
                        </div>
                        <div className="space-y-0.5 lg:border-l lg:border-zinc-200/60 lg:pl-2 dark:lg:border-white/[0.06]">
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
                        </div>
                      </div>
                    </section>
                  )}
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}

      {!isTechnician && (
        <>
          <SystemUsersModal isOpen={isSystemUsersOpen} onClose={() => setIsSystemUsersOpen(false)} refreshTrigger={systemUsersRefreshTrigger} />
          <ZayaAlertsModal isOpen={isZayaAlertsOpen} onClose={() => setIsZayaAlertsOpen(false)} />
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
