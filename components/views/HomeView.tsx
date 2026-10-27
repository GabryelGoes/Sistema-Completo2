import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  LogOut,
  Settings,
  User,
  Sparkles,
  X,
} from 'lucide-react';
import { IosAccentIconSquircle } from '../ui/IosAccentIconSquircle';
import { WorkshopServicesModal } from '../WorkshopServicesModal';
import { LabProductTypesModal } from '../LabProductTypesModal';
import { LabQuickServicesModal } from '../LabQuickServicesModal';
import { WorkshopPartsModal } from '../WorkshopPartsModal';
import { PatioChecklistsModal } from '../PatioChecklistsModal';
import { ChangePasswordsModal } from '../ChangePasswordsModal';
import { TechnicianProfileModal } from '../TechnicianProfileModal';
import { AdminProfileModal } from '../AdminProfileModal';
import { SystemUsersModal } from '../SystemUsersModal';
import { SystemNotificationsModal } from '../SystemNotificationsModal';
import { DeviceLayoutSettingsModal } from '../DeviceLayoutSettingsModal';
import { ConnectedDevicesModal } from '../ConnectedDevicesModal';
import { BudgetPreferencesModal } from '../BudgetPreferencesModal';
import { LabelTemplatesEditorModal } from '../LabelTemplatesEditorModal';
import { TvPatioModal } from '../TvPatioModal';
import { UserProfileModal } from '../UserProfileModal';
import { AjustesHubPanel, type AjustesVisibility } from '../ajustes/AjustesHubPanel';
import type { AjustesItemId } from '../../utils/ajustesCatalog';
import { QUALITY_RADAR_ICON } from '../../constants/qualityRadar';
import { ERROR_BULLETIN_ICON, TECHNICAL_BULLETINS_MODULE_LABEL } from '../../constants/errorBulletinIcon';
import { effectiveAccessOrcamentos, type SystemUserPermissions } from '../../services/apiService';
import { warmPatioOrLaboratoryBoard } from '../../services/boardWarmup';
import { useRegisterModalOpen } from '../ui/ModalLayerContext';
import { useBrowserBackLayer } from '../ui/BackNavigationContext';
import { desktopShellViewportOverlayClass } from '../../utils/desktopShellOverlay';
import { clearHomeHubOpenGuard, openHomeHubSafely } from '../../utils/homeHubOpenGuard';
import { ModalPortal } from '../ui/ModalPortal';
import { iosSquircleBackgroundFromHex, SETTINGS_HUB_Z } from '../ui/iosModalStyles';
import { desktopHomeHubCard } from '../ui/desktopCardStyles';
import { useModalExitPresence } from '../../hooks/useModalExitAnimation';
import { useIosHomeAppReorder } from '../../hooks/useIosHomeAppReorder';

/** Portal no body: evita TabBar (z-40) cobrir o hub dentro do `main` (z-10). */
function SettingsHubShell({ children }: { children: React.ReactNode }) {
  return <ModalPortal manageBackLayer={false}>{children}</ModalPortal>;
}

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
  /** Embaçar orçamentos sem verificação (hub de Orçamentos). */
  blurUnverifiedBudgets?: boolean;
  onBlurUnverifiedBudgetsChange?: (enabled: boolean) => void;
  /** Banners macOS — preferências em Notificações do sistema. */
  budgetBannerNotifications?: boolean;
  onBudgetBannerNotificationsChange?: (enabled: boolean) => void;
  commentBannerNotifications?: boolean;
  onCommentBannerNotificationsChange?: (enabled: boolean) => void;
  /** Orientação atual (Dispositivo detectado). */
  orientation?: 'portrait' | 'landscape';
  /** Modais no App (ex.: preferências, senhas) que devem ficar acima do hub de configurações */
  globalOverlayModalOpen?: boolean;
  /** Badge vermelho no ícone Orçamentos (hub do pátio). */
  patioBudgetsHubBadge?: number;
  /** Layout OnMotor (sidebar + cards com borda amarela) — sem cabeçalho duplicado. */
  desktopShell?: boolean;
  /** Registra abertura do hub de configurações (sidebar PC). */
  settingsHubOpenerRef?: React.MutableRefObject<(() => void) | null>;
  /** Fecha o hub de configurações (ex.: ao trocar de módulo na sidebar PC). */
  settingsHubCloserRef?: React.MutableRefObject<(() => void) | null>;
  /** Estado do hub (controlado pelo App). */
  settingsHubOpen?: boolean;
  /** Atualiza abertura do hub (controlado pelo App). */
  onSettingsHubOpenChange?: (open: boolean) => void;
  /** Abre estoque de peças (modal global no App quando definido). */
  onOpenPartsStock?: () => void;
  /** Abre Painéis de TV (modal global no App quando definido). */
  onOpenTvPatio?: () => void;
}

/** Cartões da home mobile sem backdrop-blur (melhor FPS em GPU fraca). */
const mobileHubTileCard =
  'rounded-[22px] border-0 bg-white dark:bg-zinc-900 shadow-none';

const iosSectionTitle =
  'text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-950 dark:text-zinc-400 mb-1';

const iosSectionHint = 'text-[13px] text-zinc-950 dark:text-zinc-400 mb-4 leading-relaxed';
const QUICK_APPS_LAYOUT_KEY = 'app_home_quick_apps_layout_v1';

/** Classe base dos PNGs nos tiles da home — preenche a caixa fixa do squircle. */
const HOME_TILE_ICON_IMG =
  'h-full w-full border-0 object-fill outline-none [box-shadow:none]';

/**
 * Escala visual por ícone (compensação de margem transparente / borda escura no PNG).
 * Medido contra Agenda/Pátio/Orçamentos/Laboratório — não altera os arquivos.
 */
const HOME_TILE_ICON_SHELL_SCALE: Partial<Record<string, string>> = {
  tv_patio: '[&_img]:origin-center [&_img]:scale-[1.11]',
  radar_qualidade: '[&_img]:origin-center [&_img]:scale-[1.07]',
};

const OPERATIONAL_APPS: {
  id: HomeAppId;
  label: string;
  icon: React.ReactElement;
}[] = [
  {
    id: 'agenda',
    label: 'Agenda',
    icon: <img src="/icons/agenda-ios.png" alt="Agenda" className={HOME_TILE_ICON_IMG} />,
  },
  {
    id: 'patio',
    label: 'Pátio',
    icon: <img src="/icons/patio-ios.png" alt="Pátio" className={HOME_TILE_ICON_IMG} />,
  },
  {
    id: 'orcamentos',
    label: 'Orçamentos',
    icon: <img src="/icons/orcamentos-ios.png" alt="" className={HOME_TILE_ICON_IMG} />,
  },
  {
    id: 'laboratorio',
    label: 'Laboratório',
    icon: <img src="/icons/laboratorio-ios.png" alt="Laboratório" className={HOME_TILE_ICON_IMG} />,
  },
];

type QuickTileSize = 'normal' | 'wide';
type QuickTileId =
  | HomeAppId
  | 'tv_patio'
  | 'parts_stock';
type QuickLayoutState = {
  order: QuickTileId[];
  sizes: Partial<Record<QuickTileId, QuickTileSize>>;
};

const DEFAULT_QUICK_ORDER: QuickTileId[] = [...OPERATIONAL_APPS.map((app) => app.id)];
const ALL_QUICK_TILE_IDS: QuickTileId[] = [
  ...DEFAULT_QUICK_ORDER,
  'tv_patio',
  'parts_stock',
  'relatorios',
  'boletim_erros',
  'radar_qualidade',
];
/** Ícone antigo da home — filtrado do layout salvo para não reaparecer. */
const LEGACY_HOME_SETTINGS_TILE_ID = 'settings_hub';

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
  blurUnverifiedBudgets = true,
  onBlurUnverifiedBudgetsChange,
  budgetBannerNotifications = true,
  onBudgetBannerNotificationsChange,
  commentBannerNotifications = true,
  onCommentBannerNotificationsChange,
  orientation,
  globalOverlayModalOpen = false,
  patioBudgetsHubBadge = 0,
  desktopShell = false,
  settingsHubOpenerRef,
  settingsHubCloserRef,
  settingsHubOpen: settingsHubOpenProp = false,
  onSettingsHubOpenChange,
  onOpenPartsStock,
  onOpenTvPatio,
}) => {
  const hubCardClass = desktopShell ? desktopHomeHubCard : mobileHubTileCard;
  const [isServicesModalOpen, setIsServicesModalOpen] = useState(false);
  const [isLabProductTypesOpen, setIsLabProductTypesOpen] = useState(false);
  const [isLabQuickServicesOpen, setIsLabQuickServicesOpen] = useState(false);
  const [isChangePasswordsOpen, setIsChangePasswordsOpen] = useState(false);
  const [isTechnicianProfileOpen, setIsTechnicianProfileOpen] = useState(false);
  const [isAdminProfileOpen, setIsAdminProfileOpen] = useState(false);
  const [isSystemUsersOpen, setIsSystemUsersOpen] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [isPatioChecklistsOpen, setIsPatioChecklistsOpen] = useState(false);
  const [isPartsModalOpen, setIsPartsModalOpen] = useState(false);
  const [isTvPatioOpen, setIsTvPatioOpen] = useState(false);
  const [isSystemNotificationsOpen, setIsSystemNotificationsOpen] = useState(false);
  const [isDeviceLayoutOpen, setIsDeviceLayoutOpen] = useState(false);
  const [isConnectedDevicesOpen, setIsConnectedDevicesOpen] = useState(false);
  const [isBudgetPrefsOpen, setIsBudgetPrefsOpen] = useState(false);
  const [isLabelEditorOpen, setIsLabelEditorOpen] = useState(false);

  const closeAllSettingsChildModals = useCallback(() => {
    setIsServicesModalOpen(false);
    setIsLabProductTypesOpen(false);
    setIsLabQuickServicesOpen(false);
    setIsChangePasswordsOpen(false);
    setIsTechnicianProfileOpen(false);
    setIsAdminProfileOpen(false);
    setIsSystemUsersOpen(false);
    setIsUserProfileOpen(false);
    setIsPatioChecklistsOpen(false);
    setIsSystemNotificationsOpen(false);
    setIsDeviceLayoutOpen(false);
    setIsConnectedDevicesOpen(false);
    setIsBudgetPrefsOpen(false);
    setIsLabelEditorOpen(false);
  }, []);

  const setSettingsHubOpen = useCallback(
    (open: boolean) => {
      if (!open) {
        closeAllSettingsChildModals();
      }
      onSettingsHubOpenChange?.(open);
    },
    [onSettingsHubOpenChange, closeAllSettingsChildModals]
  );

  /** Abre só o hub de Ajustes (sem itens filhos). */
  const openSettingsHubOnly = useCallback(() => {
    closeAllSettingsChildModals();
    onSettingsHubOpenChange?.(true);
  }, [closeAllSettingsChildModals, onSettingsHubOpenChange]);

  const isHomeSettingsHubOpen = settingsHubOpenProp;
  const settingsHubPresence = useModalExitPresence(isHomeSettingsHubOpen);

  useEffect(() => {
    if (!settingsHubOpenerRef) return;
    settingsHubOpenerRef.current = () => openHomeHubSafely(() => openSettingsHubOnly());
    return () => {
      settingsHubOpenerRef.current = null;
    };
  }, [settingsHubOpenerRef, openSettingsHubOnly]);

  useEffect(() => {
    if (!settingsHubCloserRef) return;
    settingsHubCloserRef.current = () => setSettingsHubOpen(false);
    return () => {
      settingsHubCloserRef.current = null;
    };
  }, [settingsHubCloserRef, setSettingsHubOpen]);

  useEffect(() => () => clearHomeHubOpenGuard(), []);
  useEffect(
    () => () => {
      if (launchTimerRef.current) clearTimeout(launchTimerRef.current);
    },
    []
  );
  const [isHeaderProfileMenuOpen, setIsHeaderProfileMenuOpen] = useState(false);
  const [launchingQuickId, setLaunchingQuickId] = useState<QuickTileId | null>(null);
  const launchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerProfileTriggerRef = useRef<HTMLButtonElement>(null);
  const headerProfileMenuRef = useRef<HTMLDivElement>(null);
  const [headerProfileMenuStyle, setHeaderProfileMenuStyle] = useState<React.CSSProperties>({});
  const [quickLayout, setQuickLayout] = useState<QuickLayoutState>(() => {
    try {
      const raw = localStorage.getItem(QUICK_APPS_LAYOUT_KEY);
      if (!raw) return { order: DEFAULT_QUICK_ORDER, sizes: {} };
      const parsed = JSON.parse(raw) as QuickLayoutState;
      if (!parsed || !Array.isArray(parsed.order)) return { order: DEFAULT_QUICK_ORDER, sizes: {} };
      const order = [
        ...parsed.order.filter((id) => {
          const key = String(id);
          if (key === LEGACY_HOME_SETTINGS_TILE_ID) return false;
          return ALL_QUICK_TILE_IDS.includes(key as QuickTileId);
        }),
      ] as QuickTileId[];
      DEFAULT_QUICK_ORDER.forEach((id) => {
        if (!order.includes(id)) order.push(id);
      });
      return { order, sizes: parsed.sizes ?? {} };
    } catch {
      return { order: DEFAULT_QUICK_ORDER, sizes: {} };
    }
  });

  const perms = systemUserPermissions || {};
  const isLimitedSystem = isSystemUser && !perms.full_access;
  const isWorkshopAdmin = !isSystemUser && !isTechnician;
  const showFullAdminHub = isWorkshopAdmin || (isSystemUser && !!perms.full_access);
  const canManageLabProductTypes =
    showFullAdminHub || !!perms.access_servicos_oficina || !!perms.access_laboratorio;
  const hasRichQuickGrid =
    showFullAdminHub ||
    !!perms.access_tv_patio ||
    !!perms.access_estoque_pecas ||
    !!perms.access_relatorios;

  const canOpenTheme =
    showFullAdminHub || (!!perms.access_settings && isSystemUser) || !!onOpenSettings;
  const canOpenPasswords =
    showFullAdminHub ||
    (!!perms.access_change_passwords && isSystemUser) ||
    (!!perms.access_change_passwords && !!onOpenChangePasswords);

  const ajustesVisibility: AjustesVisibility = useMemo(
    () => ({
      perfil: isSystemUser || ((!isTechnician || Boolean(technicianId)) && !isSystemUser),
      usuarios: isWorkshopAdmin || (isSystemUser && !!perms.full_access),
      sair: Boolean(onLogout),
      senhas: canOpenPasswords,
      servicos_oficina: showFullAdminHub || !!perms.access_servicos_oficina,
      checklists_patio: showFullAdminHub || !!perms.access_checklists_patio,
      painel_tv: showFullAdminHub || !!perms.access_tv_patio,
      lab_tipos: canManageLabProductTypes,
      lab_rapidos: canManageLabProductTypes,
      orcamentos_prefs:
        showFullAdminHub || !!perms.full_access || typeof onBlurUnverifiedBudgetsChange === 'function',
      notificacoes_sistema: showFullAdminHub || !!perms.access_notificacoes_sistema,
      tema: canOpenTheme,
      dispositivos_conectados: isWorkshopAdmin || (isSystemUser && !!perms.full_access),
      dispositivo: true,
      etiquetas: showFullAdminHub || !!perms.access_settings || !!perms.full_access,
    }),
    [
      isSystemUser,
      isTechnician,
      technicianId,
      isWorkshopAdmin,
      perms.full_access,
      perms.access_servicos_oficina,
      perms.access_checklists_patio,
      perms.access_tv_patio,
      perms.access_notificacoes_sistema,
      perms.access_settings,
      onLogout,
      canOpenPasswords,
      showFullAdminHub,
      canManageLabProductTypes,
      onBlurUnverifiedBudgetsChange,
      canOpenTheme,
    ]
  );

  const openAjustesItem = useCallback(
    (id: AjustesItemId) => {
      switch (id) {
        case 'perfil':
          if (isSystemUser) setIsUserProfileOpen(true);
          else if (isTechnician) setIsTechnicianProfileOpen(true);
          else setIsAdminProfileOpen(true);
          break;
        case 'usuarios':
          setIsSystemUsersOpen(true);
          break;
        case 'sair':
          setSettingsHubOpen(false);
          onLogout?.();
          break;
        case 'senhas':
          if (onOpenChangePasswords && isLimitedSystem) onOpenChangePasswords();
          else setIsChangePasswordsOpen(true);
          break;
        case 'servicos_oficina':
          setIsServicesModalOpen(true);
          break;
        case 'checklists_patio':
          setIsPatioChecklistsOpen(true);
          break;
        case 'painel_tv':
          break;
        case 'lab_tipos':
          setIsLabProductTypesOpen(true);
          break;
        case 'lab_rapidos':
          setIsLabQuickServicesOpen(true);
          break;
        case 'orcamentos_prefs':
          setIsBudgetPrefsOpen(true);
          break;
        case 'notificacoes_sistema':
          setIsSystemNotificationsOpen(true);
          break;
        case 'tema':
          if (onOpenSettings) onOpenSettings();
          else onOpenApp('settings');
          break;
        case 'dispositivos_conectados':
          setIsConnectedDevicesOpen(true);
          break;
        case 'dispositivo':
          setIsDeviceLayoutOpen(true);
          break;
        case 'etiquetas':
          setIsLabelEditorOpen(true);
          break;
        default:
          break;
      }
    },
    [
      isSystemUser,
      isTechnician,
      isLimitedSystem,
      onLogout,
      onOpenChangePasswords,
      onOpenSettings,
      onOpenApp,
      setSettingsHubOpen,
    ]
  );

  const ajustesPerfilTitle = isSystemUser
    ? 'Configurações de perfil'
    : isTechnician
      ? 'Meu perfil'
      : 'Perfil do administrador';
  const ajustesPerfilSubtitle = isSystemUser
    ? 'Nome, foto e cor'
    : isTechnician
      ? 'Nome e foto'
      : 'Nome e foto da gerência';
  const ajustesPerfilIconSrc = isSystemUser
    ? '/icons/perfil-ios.png'
    : isTechnician
      ? null
      : '/icons/admin-perfil-ios.png';

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
        : 'Ajustes'
      : 'Perfil do administrador';

  const headerProfileMenuProfileHint = isSystemUser
    ? 'Nome, foto e cor'
    : isTechnician
      ? technicianId
        ? 'Nome e foto'
        : 'Hub de Ajustes'
      : 'Nome e foto da gerência';

  /** Abre após o ciclo de eventos + guarda contra click-through nos hubs. */
  const openAfterInputCycle = useCallback((fn: () => void) => {
    openHomeHubSafely(fn);
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
      openSettingsHubOnly();
    });
  }, [isSystemUser, isTechnician, technicianId, openAfterInputCycle, openSettingsHubOnly]);

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
  useRegisterModalOpen(settingsHubPresence.mounted);

  /** Evita fechar a tela de configurações ou fundo enquanto um modal filho está aberto. */
  const childModalStackActive = useMemo(
    () =>
      isSystemUsersOpen ||
      isSystemNotificationsOpen ||
      isServicesModalOpen ||
      isLabProductTypesOpen ||
      isLabQuickServicesOpen ||
      isPartsModalOpen ||
      isPatioChecklistsOpen ||
      isChangePasswordsOpen ||
      isDeviceLayoutOpen ||
      isConnectedDevicesOpen ||
      isBudgetPrefsOpen ||
      isLabelEditorOpen ||
      (!onOpenTvPatio && isTvPatioOpen) ||
      (Boolean(technicianId) && isTechnicianProfileOpen) ||
      isAdminProfileOpen ||
      isUserProfileOpen ||
      globalOverlayModalOpen,
    [
      isSystemUsersOpen,
      isSystemNotificationsOpen,
      isServicesModalOpen,
      isLabProductTypesOpen,
      isLabQuickServicesOpen,
      isPartsModalOpen,
      isPatioChecklistsOpen,
      isChangePasswordsOpen,
      isDeviceLayoutOpen,
      isConnectedDevicesOpen,
      isBudgetPrefsOpen,
      isLabelEditorOpen,
      onOpenTvPatio,
      isTvPatioOpen,
      technicianId,
      isTechnicianProfileOpen,
      isAdminProfileOpen,
      isUserProfileOpen,
      globalOverlayModalOpen,
    ]
  );

  // Pilha LIFO: hub primeiro (base), depois modais na ordem em que tendem a abrir por cima
  useBrowserBackLayer(isHomeSettingsHubOpen, () => setSettingsHubOpen(false));
  useBrowserBackLayer(isAdminProfileOpen, () => setIsAdminProfileOpen(false));
  useBrowserBackLayer(isChangePasswordsOpen, () => setIsChangePasswordsOpen(false));
  // Inventário: ESC via ModalPortal.onRequestClose
  useBrowserBackLayer(isPatioChecklistsOpen, () => setIsPatioChecklistsOpen(false));
  useBrowserBackLayer(isServicesModalOpen, () => setIsServicesModalOpen(false));
  useBrowserBackLayer(isLabProductTypesOpen, () => setIsLabProductTypesOpen(false));
  useBrowserBackLayer(isLabQuickServicesOpen, () => setIsLabQuickServicesOpen(false));
  useBrowserBackLayer(isSystemUsersOpen, () => setIsSystemUsersOpen(false));
  useBrowserBackLayer(Boolean(technicianId) && isTechnicianProfileOpen, () => setIsTechnicianProfileOpen(false));
  useBrowserBackLayer(!onOpenTvPatio && isTvPatioOpen, () => setIsTvPatioOpen(false));
  useBrowserBackLayer(isUserProfileOpen, () => setIsUserProfileOpen(false));
  useBrowserBackLayer(isSystemNotificationsOpen, () => setIsSystemNotificationsOpen(false));
  useBrowserBackLayer(isDeviceLayoutOpen, () => setIsDeviceLayoutOpen(false));
  useBrowserBackLayer(isConnectedDevicesOpen, () => setIsConnectedDevicesOpen(false));
  useBrowserBackLayer(isBudgetPrefsOpen, () => setIsBudgetPrefsOpen(false));
  useBrowserBackLayer(isLabelEditorOpen, () => setIsLabelEditorOpen(false));
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
    const extraTiles: {
      id: QuickTileId;
      label: string;
      icon: React.ReactElement;
      onOpen: () => void;
    }[] = [];
    if (showFullAdminHub || !!perms.access_tv_patio) {
      extraTiles.push({
        id: 'tv_patio',
        label: 'Painéis de TV',
        icon: (
          <img
            src="/icons/tv-patio-ios.png"
            alt="TVs Pátio e Laboratório"
            className={HOME_TILE_ICON_IMG}
          />
        ),
        onOpen: () => (onOpenTvPatio ? onOpenTvPatio() : setIsTvPatioOpen(true)),
      });
    }
    if (showFullAdminHub || !!perms.access_estoque_pecas) {
      extraTiles.push({
        id: 'parts_stock',
        label: 'Estoque',
        icon: <img src="/icons/estoque-ios.png" alt="Estoque" className={HOME_TILE_ICON_IMG} />,
        onOpen: () => (onOpenPartsStock ? onOpenPartsStock() : setIsPartsModalOpen(true)),
      });
    }
    if (showFullAdminHub || !!perms.access_relatorios) {
      extraTiles.push({
        id: 'relatorios',
        label: 'Relatórios',
        icon: <img src="/icons/relatorios-ios.png" alt="Relatórios" className={HOME_TILE_ICON_IMG} />,
        onOpen: () => onOpenApp('relatorios'),
      });
    }
    if (showFullAdminHub || !!perms.access_boletim_erros) {
      extraTiles.push({
        id: 'boletim_erros',
        label: TECHNICAL_BULLETINS_MODULE_LABEL,
        icon: (
          <img
            src={ERROR_BULLETIN_ICON}
            alt={TECHNICAL_BULLETINS_MODULE_LABEL}
            className={HOME_TILE_ICON_IMG}
          />
        ),
        onOpen: () => onOpenApp('boletim_erros'),
      });
    }
    if (showFullAdminHub || !!perms.access_radar_qualidade) {
      extraTiles.push({
        id: 'radar_qualidade',
        label: 'Radar de Qualidade',
        icon: <img src={QUALITY_RADAR_ICON} alt="Radar de Qualidade" className={HOME_TILE_ICON_IMG} />,
        onOpen: () => onOpenApp('radar_qualidade'),
      });
    }
    return [...baseTiles, ...extraTiles];
  }, [
    onOpenApp,
    onOpenPartsStock,
    onOpenTvPatio,
    operationalForView,
    perms,
    showFullAdminHub,
  ]);
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

  const visibleQuickOrder = useMemo(
    () => orderedOperationalApps.map((app) => app.id),
    [orderedOperationalApps]
  );

  useEffect(() => {
    try {
      localStorage.setItem(QUICK_APPS_LAYOUT_KEY, JSON.stringify(quickLayout));
    } catch (_) {}
  }, [quickLayout]);

  const handleQuickActivate = useCallback(
    (id: QuickTileId) => {
      const tile = operationalById[id];
      if (!tile) return;
      // Aquenta chunk/dados antes do gesto terminar — abrir Pátio/Lab fica quase imediato.
      if (id === 'patio') warmPatioOrLaboratoryBoard('vehicle');
      else if (id === 'laboratorio') warmPatioOrLaboratoryBoard('module');
      if (launchTimerRef.current) clearTimeout(launchTimerRef.current);
      setLaunchingQuickId(id);
      launchTimerRef.current = setTimeout(() => {
        launchTimerRef.current = null;
        setLaunchingQuickId(null);
        openHomeHubSafely(() => tile.onOpen());
      }, 180);
    },
    [operationalById]
  );

  const handleQuickReorder = useCallback((nextVisibleOrder: QuickTileId[]) => {
    setQuickLayout((prev) => {
      const visible = new Set(nextVisibleOrder);
      const hiddenTail = prev.order.filter((id) => !visible.has(id));
      return { ...prev, order: [...nextVisibleOrder, ...hiddenTail] };
    });
  }, []);

  const {
    isEditMode: isQuickEditMode,
    draggingId: draggingQuickId,
    ghostMeta: quickGhostMeta,
    gridRef: quickAppsGridRef,
    ghostElRef: quickGhostElRef,
    bindTile: bindQuickTile,
    finishEditMode: finishQuickEditMode,
  } = useIosHomeAppReorder<QuickTileId>({
    order: visibleQuickOrder,
    onReorder: handleQuickReorder,
    onActivate: handleQuickActivate,
    getItemSpan: (id) => ((quickLayout.sizes[id] ?? 'normal') === 'wide' ? 2 : 1),
  });

  useEffect(() => {
    if (!isHomeSettingsHubOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (childModalStackActive) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setSettingsHubOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isHomeSettingsHubOpen, childModalStackActive]);

  useEffect(() => {
    if (!isQuickEditMode || isHomeSettingsHubOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      finishQuickEditMode();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finishQuickEditMode, isHomeSettingsHubOpen, isQuickEditMode]);

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
    <div
      className={
        desktopShell
          ? 'min-h-full flex flex-col px-6 py-5 max-w-6xl mx-auto w-full'
          : 'min-h-full flex flex-col safe-area-pb relative overflow-x-hidden'
      }
    >
      {!desktopShell ? (
        <>
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-zinc-200 via-zinc-100 to-zinc-200/90 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950" />
      <div className="fixed inset-0 -z-10 pointer-events-none opacity-30 dark:opacity-20 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(251,191,36,0.16),transparent),radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(56,189,248,0.08),transparent)]" />
        </>
      ) : null}

      {!desktopShell ? (
      <header className="relative z-10 pt-[max(0.5rem,env(safe-area-inset-top))] pb-4 px-4 sm:px-6 border-b border-zinc-200/70 dark:border-white/[0.08] bg-white/95 dark:bg-zinc-950/95 shadow-[0_1px_0_0_rgba(255,255,255,0.55)_inset] dark:shadow-none">
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
              type="button"
              onClick={() => openSettingsHubOnly()}
              aria-label="Ajustes"
              title="Ajustes"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-200/90 bg-white/90 text-zinc-700 shadow-md ring-1 ring-black/[0.04] transition-transform hover:bg-zinc-50 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white/12 dark:bg-zinc-900/80 dark:text-zinc-200 dark:ring-white/10 dark:hover:bg-zinc-800 dark:focus-visible:ring-offset-zinc-950 sm:h-12 sm:w-12"
            >
              <Settings className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.25} aria-hidden />
            </button>
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
                    className="overflow-hidden rounded-2xl border-0 bg-white py-1.5 text-zinc-900 shadow-none backdrop-blur-xl dark:bg-zinc-900 dark:text-zinc-100"
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
      ) : null}

      <main
        className={
          desktopShell
            ? 'relative z-10 flex-1 w-full'
            : 'relative z-10 flex-1 px-4 sm:px-6 pb-28 max-w-xl lg:max-w-5xl mx-auto w-full touch-pan-y'
        }
      >
        <section className={desktopShell ? 'pb-6' : 'pt-5 pb-6 lg:pt-6'}>
              <p className={desktopShell ? 'text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 mb-2' : iosSectionTitle}>
                Operação
              </p>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className={`${iosSectionHint} mb-0`}>
                  {isQuickEditMode
                    ? 'Segure e arraste para reorganizar. Toque em 2x para cartão largo.'
                    : 'Acesso rápido aos módulos do dia a dia'}
                </p>
                {isQuickEditMode ? (
                  <button
                    type="button"
                    onClick={() => finishQuickEditMode()}
                    className="shrink-0 rounded-full border border-[#007AFF]/45 bg-[#007AFF]/15 px-3 py-1.5 text-[12px] font-semibold text-[#007AFF] transition-all hover:bg-[#007AFF]/20 dark:border-[#64B5FF]/45 dark:bg-[#64B5FF]/14 dark:text-[#8cc8ff]"
                  >
                    Concluir
                  </button>
                ) : null}
              </div>

              <div
                ref={quickAppsGridRef}
                className={`relative isolate z-0 grid gap-3 ${quickGridColsClass} ${isQuickEditMode ? 'touch-none select-none' : 'touch-pan-y'}`}
              >
                {orderedOperationalApps.map((app, tileIndex) => {
                  const isWide = (quickLayout.sizes[app.id] ?? 'normal') === 'wide';
                  const isDragging = draggingQuickId === app.id;
                  const isLaunching = launchingQuickId === app.id;
                  const tileBind = bindQuickTile(app.id, app.label);
                  const { ref: tileRef, ...tilePointerProps } = tileBind;
                  return (
                    <button
                      key={app.id}
                      ref={tileRef}
                      type="button"
                      style={{
                        touchAction: isQuickEditMode || isDragging ? 'none' : 'pan-y',
                        animationDelay: isQuickEditMode
                          ? `${(tileIndex % 5) * 35}ms`
                          : `${Math.min(tileIndex, 8) * 45}ms`,
                        ['--wiggle-delay' as string]: `${(tileIndex % 7) * 40}ms`,
                      }}
                      {...tilePointerProps}
                      className={`group relative flex w-full flex-col items-center gap-3 p-3 sm:p-4 text-center select-none will-change-transform ${
                        isQuickEditMode ? '' : 'animate-home-tile-in'
                      } ${hubCardClass} border-[#007AFF]/0 hover:border-[#007AFF]/15 dark:hover:border-[#0A84FF]/20 hover:shadow-none transition-[border-color,box-shadow,opacity] duration-300 ${
                        isWide ? 'col-span-2' : ''
                      } ${isDragging ? 'opacity-25 scale-[0.98]' : ''} ${
                        isQuickEditMode ? 'touch-none select-none' : 'active:scale-[0.99]'
                      } ${isLaunching ? 'animate-home-tile-launch z-[1]' : ''}`}
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
                        <span
                          className={`relative inline-flex shrink-0 ${
                            isQuickEditMode && !isDragging ? 'home-tile-wiggle' : ''
                          } ${isDragging ? 'home-tile-lift' : ''}`}
                          style={
                            isQuickEditMode
                              ? { animationDelay: `var(--wiggle-delay, ${(tileIndex % 7) * 40}ms)` }
                              : undefined
                          }
                        >
                          <IosAccentIconSquircle
                            variant="tile"
                            className={`pointer-events-none shrink-0 transition-transform duration-300 group-hover:scale-105 ${
                              HOME_TILE_ICON_SHELL_SCALE[app.id] ?? ''
                            }`.trim()}
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
              {quickGhostMeta && operationalById[quickGhostMeta.id as QuickTileId] ? (
                <div
                  ref={quickGhostElRef}
                  className="pointer-events-none fixed left-0 top-0 z-[80] will-change-transform"
                  style={{
                    width: `${quickGhostMeta.width}px`,
                    height: `${quickGhostMeta.height}px`,
                    transform: 'translate3d(-9999px,-9999px,0)',
                  }}
                >
                  <div
                    className={`group relative flex h-full w-full flex-col items-center gap-3 p-3 sm:p-4 text-center ${hubCardClass} border-[#007AFF]/40 shadow-[0_22px_50px_-18px_rgba(0,0,0,0.45)] scale-[1.05] home-tile-lift`}
                  >
                    <IosAccentIconSquircle
                      variant="tile"
                      className={`scale-105 ${HOME_TILE_ICON_SHELL_SCALE[quickGhostMeta.id] ?? ''}`.trim()}
                      strokeWidth={2.2}
                    >
                      {operationalById[quickGhostMeta.id as QuickTileId].icon}
                    </IosAccentIconSquircle>
                    <span className="text-[15px] font-semibold text-zinc-900 dark:text-white leading-tight">
                      {operationalById[quickGhostMeta.id as QuickTileId].label}
                    </span>
                  </div>
                </div>
              ) : null}
            </section>
      </main>

      {settingsHubPresence.mounted ? (
        <SettingsHubShell>
          <div
            data-home-hub-overlay=""
            className={`${desktopShell ? desktopShellViewportOverlayClass(true, SETTINGS_HUB_Z) : `fixed inset-0 ${SETTINGS_HUB_Z}`} flex min-h-0 flex-col overflow-hidden bg-light-page dark:bg-black ${
              settingsHubPresence.exiting ? 'animate-home-hub-out' : 'animate-home-hub-in'
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="Ajustes"
          >
            <header className={`shrink-0 border-b border-zinc-200/80 bg-white shadow-[0_1px_0_0_rgba(255,255,255,0.55)_inset] dark:border-white/[0.08] dark:bg-zinc-950 dark:shadow-none ${desktopShell ? 'px-5 py-3' : 'px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]'}`}>
              <div className="relative w-full">
                {!desktopShell ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (childModalStackActive) return;
                      setSettingsHubOpen(false);
                    }}
                    className="absolute left-0 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200/75 bg-white/80 text-zinc-700 shadow-[0_4px_18px_-8px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all hover:bg-white/95 active:scale-[0.97] dark:border-white/[0.12] dark:bg-zinc-900/75 dark:text-zinc-200 dark:hover:bg-zinc-900/90"
                    aria-label="Voltar"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (childModalStackActive) return;
                      setSettingsHubOpen(false);
                    }}
                    className="absolute right-0 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200/75 bg-white/90 text-zinc-700 shadow-[0_4px_18px_-8px_rgba(0,0,0,0.2)] transition-all hover:bg-zinc-50 active:scale-[0.97] dark:border-white/[0.12] dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    aria-label="Fechar"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
                <div className={`mx-auto flex min-h-[2.5rem] max-w-xl flex-col items-center justify-center text-center lg:max-w-5xl ${desktopShell ? 'px-12' : 'px-12'}`}>
                  <div className="mb-0.5 flex h-9 w-9 items-center justify-center overflow-hidden rounded-2xl border border-zinc-300/75 bg-zinc-100 shadow-inner dark:border-white/[0.12] dark:bg-zinc-800/95">
                    <img src="/icons/configuracoes-ios.png" alt="" className="h-full w-full object-cover" />
                  </div>
                  <h1 className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white">
                    Ajustes
                  </h1>
                </div>
              </div>
            </header>

            <div
              className={`min-h-0 w-full flex-1 overflow-hidden pb-[max(0.75rem,env(safe-area-inset-bottom))] ${
                desktopShell ? 'px-5 pt-3' : 'px-3 pt-3 sm:px-4'
              }`}
            >
              <AjustesHubPanel
                desktopShell={Boolean(desktopShell)}
                perfilTitle={ajustesPerfilTitle}
                perfilSubtitle={ajustesPerfilSubtitle}
                perfilIconSrc={ajustesPerfilIconSrc}
                visibility={ajustesVisibility}
                onOpenItem={openAjustesItem}
              />
            </div>
      </div>
        </SettingsHubShell>
      ) : null}

      {!isTechnician && (
        <>
          <SystemUsersModal isOpen={isSystemUsersOpen} onClose={() => setIsSystemUsersOpen(false)} refreshTrigger={systemUsersRefreshTrigger} />
          <SystemNotificationsModal
            isOpen={isSystemNotificationsOpen}
            onClose={() => setIsSystemNotificationsOpen(false)}
            budgetBannerNotifications={budgetBannerNotifications}
            onBudgetBannerNotificationsChange={onBudgetBannerNotificationsChange}
            commentBannerNotifications={commentBannerNotifications}
            onCommentBannerNotificationsChange={onCommentBannerNotificationsChange}
          />
          <DeviceLayoutSettingsModal
            isOpen={isDeviceLayoutOpen}
            onClose={() => setIsDeviceLayoutOpen(false)}
            orientation={orientation}
          />
          {typeof onBlurUnverifiedBudgetsChange === 'function' ? (
            <BudgetPreferencesModal
              isOpen={isBudgetPrefsOpen}
              onClose={() => setIsBudgetPrefsOpen(false)}
              blurUnverifiedBudgets={blurUnverifiedBudgets}
              onBlurUnverifiedBudgetsChange={onBlurUnverifiedBudgetsChange}
            />
          ) : null}
          <LabelTemplatesEditorModal
            open={isLabelEditorOpen}
            onClose={() => setIsLabelEditorOpen(false)}
          />
          <WorkshopServicesModal isOpen={isServicesModalOpen} onClose={() => setIsServicesModalOpen(false)} />
          <LabProductTypesModal isOpen={isLabProductTypesOpen} onClose={() => setIsLabProductTypesOpen(false)} />
          <LabQuickServicesModal isOpen={isLabQuickServicesOpen} onClose={() => setIsLabQuickServicesOpen(false)} />
          {!onOpenPartsStock ? (
            <WorkshopPartsModal isOpen={isPartsModalOpen} onClose={() => setIsPartsModalOpen(false)} />
          ) : null}
          <PatioChecklistsModal isOpen={isPatioChecklistsOpen} onClose={() => setIsPatioChecklistsOpen(false)} />
          <ChangePasswordsModal isOpen={isChangePasswordsOpen} onClose={() => setIsChangePasswordsOpen(false)} />
        </>
      )}
      <ConnectedDevicesModal
        isOpen={isConnectedDevicesOpen}
        onClose={() => setIsConnectedDevicesOpen(false)}
      />
      {!onOpenTvPatio ? (
        <TvPatioModal isOpen={isTvPatioOpen} onClose={() => setIsTvPatioOpen(false)} />
      ) : null}
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
