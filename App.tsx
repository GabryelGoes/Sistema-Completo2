import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from 'react';
import { Customer, Appointment } from './types';
import { SettingsModal } from './components/SettingsModal';
import { ChangePasswordsModal } from './components/ChangePasswordsModal';
import { type TabId } from './components/TabBar';
import { NotificationCenter, type NotificationCenterProps } from './components/NotificationCenter';
import { CommentPopUp } from './components/CommentPopUp';
import { playNotificationSound } from './utils/notificationSound';
import { HomeView, type HomeAppId } from './components/views/HomeView';
import { BudgetHubViewerModal } from './components/BudgetHubViewerModal';
import {
  LazyAgendaView,
  LazyBudgetsHubView,
  LazyErrorBulletinView,
  LazyPatioView,
  LazyQualityRadarView,
  LazyReceptionView,
  LazyReportsView,
} from './components/views/lazyViews';
import { ViewLoadingFallback } from './components/ui/ViewLoadingFallback';
import { usePatioBudgetsHubNotifier } from './hooks/usePatioBudgetsHubNotifier';
import { LoginView, getStoredAuth, setStoredAuth, clearStoredAuth } from './components/views/LoginView';
import { useOrientation } from './components/views/useOrientation';
import {
  type AuthSession,
  type Notification,
  type SystemUserPermissions,
  type ServiceOrderType,
  effectivePatioApproveBudgetItems,
  effectiveAccessOrcamentos,
  getWorkshopSettings,
  deleteAppointment,
  getServiceOrderById,
  getSupportUnreadCount,
} from './services/apiService';
import type { ServiceOrderStatus } from './constants/serviceOrderStages';
import { KeepAliveTabPanel } from './components/KeepAliveTabPanel';
import { applyAccentToRoot, DEFAULT_ACCENT, moduleAccentColor } from './utils/appAppearance';
import { setLabProductKinds } from './utils/moduleMetadata';
import { setLabQuickServices } from './utils/labQuickServices';
import { ModalLayerProvider } from './components/ui/ModalLayerContext';
import { BackNavigationProvider, useBrowserBackLayer } from './components/ui/BackNavigationContext';
import { DesktopEscapeCloseBridge } from './components/ui/DesktopEscapeCloseBridge';
import { AuthenticatedAppFrame } from './components/layout/AuthenticatedAppFrame';
import { useDesktopShell } from './hooks/useDesktopShell';
import { AdminProfileModal } from './components/AdminProfileModal';
import { UserProfileModal } from './components/UserProfileModal';
import { SupportBugsChatModal } from './components/SupportBugsChatModal';
import {
  resolveDesktopSidebarAccess,
  type DesktopSidebarActionId,
} from './utils/desktopShellNav';
import {
  resolveActiveDesktopSidebarAction,
  resolveDesktopShellOverlayTopbar,
} from './utils/desktopShellOverlayModules';
import { useBarcodeWedgeListener } from './hooks/useBarcodeWedgeListener';
import { parseLabOsQrPayload } from './utils/labOsQrCode';
import { WorkshopPartScanHubModal } from './components/WorkshopPartScanHubModal';
import type { WorkshopPartsBootIntent } from './components/WorkshopPartsModal';
import type { WorkshopPart } from './services/apiService';

type ShellProfileModal = 'user' | 'admin' | null;

const LazyWorkshopPartsModal = lazy(() =>
  import('./components/WorkshopPartsModal').then((m) => ({ default: m.WorkshopPartsModal }))
);
const LazyTvPatioModal = lazy(() =>
  import('./components/TvPatioModal').then((m) => ({ default: m.TvPatioModal }))
);

function LazyTabBoundary({ label, children }: { label: string; children: React.ReactNode }) {
  return <Suspense fallback={<ViewLoadingFallback label={label} />}>{children}</Suspense>;
}

export default function App() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => {
    try {
      return getStoredAuth();
    } catch {
      return null;
    }
  });
  const [currentTab, setCurrentTab] = useState<TabId>('home');
  /** Abas já visitadas (admin / full access): mantém views montadas para preservar estado. */
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => new Set(['home']));
  /** Abas já visitadas (usuário limitado). */
  const [visitedUserTabs, setVisitedUserTabs] = useState<Set<TabId>>(() => new Set(['home']));

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUserChangePasswordsOpen, setIsUserChangePasswordsOpen] = useState(false);
  const [commentPopUpNotification, setCommentPopUpNotification] = useState<Notification | null>(null);
  /** Visualizar orçamento a partir do hub (permanece na aba Orçamentos). */
  const [hubBudgetViewer, setHubBudgetViewer] = useState<{ serviceOrderId: string; budgetId: string } | null>(null);
  const [laboratorioPendingOrderId, setLaboratorioPendingOrderId] = useState<string | null>(null);
  const [patioPendingOrderId, setPatioPendingOrderId] = useState<string | null>(null);
  const [shellProfileModal, setShellProfileModal] = useState<ShellProfileModal>(null);
  const [isPartsModalOpen, setIsPartsModalOpen] = useState(false);
  const [partsBootIntent, setPartsBootIntent] = useState<WorkshopPartsBootIntent | null>(null);
  const [globalPartScan, setGlobalPartScan] = useState<{ code: string; token: number } | null>(null);
  const [isTvPatioModalOpen, setIsTvPatioModalOpen] = useState(false);
  const [settingsHubOpen, setSettingsHubOpen] = useState(false);
  const [isSupportChatOpen, setIsSupportChatOpen] = useState(false);
  const [supportUnreadBadge, setSupportUnreadBadge] = useState(0);
  const homeSettingsHubOpenerRef = useRef<(() => void) | null>(null);
  const homeSettingsHubCloserRef = useRef<(() => void) | null>(null);


  /** Fecha modais/hubs abertos pelos atalhos da sidebar (modo PC). */
  const dismissDesktopShellOverlays = useCallback(() => {
    setIsPartsModalOpen(false);
    setIsTvPatioModalOpen(false);
    setIsSettingsOpen(false);
    setSettingsHubOpen(false);
    setIsSupportChatOpen(false);
  }, []);

  const desktopSidebarAccess = useMemo(
    () =>
      resolveDesktopSidebarAccess(
        authSession?.role === 'admin' ? 'admin' : authSession?.role === 'user' ? 'user' : undefined,
        authSession?.role === 'user' ? authSession.permissions : undefined
      ),
    [authSession]
  );

  const handleDesktopSidebarAction = useCallback(
    (action: DesktopSidebarActionId) => {
      if (action === 'estoque_pecas') {
        dismissDesktopShellOverlays();
        setIsPartsModalOpen(true);
        return;
      }
      if (action === 'tvs_oficina') {
        dismissDesktopShellOverlays();
        setIsTvPatioModalOpen(true);
        return;
      }
      if (action === 'configuracoes') {
            setIsPartsModalOpen(false);
        setIsSettingsOpen(false);
        setSettingsHubOpen(true);
        return;
      }
    },
[dismissDesktopShellOverlays]
  );

  const handleDesktopTabChange = useCallback(
    (tab: TabId, setTab: React.Dispatch<React.SetStateAction<TabId>>) => {
      dismissDesktopShellOverlays();
      setTab(tab);
    },
    [dismissDesktopShellOverlays]
  );

  const handleNewCommentNotification = (n: Notification) => {
    playNotificationSound();
    setCommentPopUpNotification(n);
  };

  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [patioActiveCount, setPatioActiveCount] = useState(0);
  const [vehicleModalOsLabel, setVehicleModalOsLabel] = useState<string | null>(null);
  const [laboratorioActiveCount, setLaboratorioActiveCount] = useState(0);

  const notificationCenterProps = useMemo((): Omit<NotificationCenterProps, 'placement'> | undefined => {
    if (!authSession) return undefined;
    return {
      theme,
      onNewCommentNotification: handleNewCommentNotification,
      forTechnician: authSession.role === 'user' && !!authSession.userId,
      technicianSlug: authSession.role === 'user' ? authSession.userId : undefined,
    };
  }, [authSession, theme]);


  // Modo cinematográfico: embaçar placas em todo o app (para gravar tela / redes sociais)
  const [cinematographicMode, setCinematographicMode] = useState(false);

  // Device Orientation
  const orientation = useOrientation();
  const isDesktopShell = useDesktopShell();

  const activeDesktopSidebarAction = useMemo(() => {
    if (!isDesktopShell) return null;
    return resolveActiveDesktopSidebarAction(
      isPartsModalOpen,
      isTvPatioModalOpen,
      isSettingsOpen,
      settingsHubOpen
    );
  }, [
    isDesktopShell,
    isPartsModalOpen,
    isTvPatioModalOpen,
    isSettingsOpen,
    settingsHubOpen,
  ]);

  // Appointments State
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Estado para transferir dados do Histórico (Pátio) para a Recepção
  const [prefillData, setPrefillData] = useState<Customer | null>(null);
  const [receptionForcedMode, setReceptionForcedMode] = useState<'vehicle' | 'module' | null>(null);
  const [receptionUiMode, setReceptionUiMode] = useState<'vehicle' | 'module'>('vehicle');
  const [receptionInitialModuleStatus, setReceptionInitialModuleStatus] =
    useState<ServiceOrderStatus | null>(null);
  /** Ao fechar a Recepção aberta a partir do Pátio/Lab (criar veículo/módulo ou “usar dados”), voltar para esta aba em vez do Início. */
  const [returnTabAfterReception, setReturnTabAfterReception] = useState<TabId | null>(null);
  /** Agenda → “Chegou ao pátio”: id do agendamento (excluir após ficha criada; gesto voltar reabre o modal de detalhe). */
  const [agendaIntakeSourceAppointmentId, setAgendaIntakeSourceAppointmentId] = useState<string | null>(null);
  /** Após voltar da Recepção para a Agenda: reabrir modal de detalhe deste id (uma vez). */
  const [agendaPendingDetailAppointmentId, setAgendaPendingDetailAppointmentId] = useState<string | null>(null);

  // Nome do admin (vem das configurações da oficina; atualizado ao salvar no Perfil do administrador)
  const [adminDisplayName, setAdminDisplayName] = useState<string>('Rei do ABS');
  const [adminPhotoUrl, setAdminPhotoUrl] = useState<string | null>(null);
  // Dispara refresh da lista em "Usuários do sistema" quando o admin salva o perfil
  const [systemUsersRefreshTrigger, setSystemUsersRefreshTrigger] = useState(0);

  // Usuário limitado: abas conforme permissões (full_access = todas as abas)
  function permissionsToTabs(perms: SystemUserPermissions | undefined): TabId[] {
    if (!perms) return ['home'];
    if (perms.full_access)
      return ['home', 'reception', 'agenda', 'patio', 'orcamentos', 'relatorios', 'laboratorio', 'boletim_erros', 'radar_qualidade'];
    const t: TabId[] = [];
    if (perms.access_home) t.push('home');
    if (perms.access_reception) t.push('reception');
    if (perms.access_agenda) t.push('agenda');
    if (perms.access_patio) t.push('patio');
    if (effectiveAccessOrcamentos(perms)) t.push('orcamentos');
    if (perms.access_relatorios) t.push('relatorios');
    if (perms.access_boletim_erros) t.push('boletim_erros');
    if (perms.access_radar_qualidade) t.push('radar_qualidade');
    if (perms.access_laboratorio) t.push('laboratorio');
    return t.length ? t : ['home'];
  }
  const userAllowedTabs = authSession?.role === 'user' ? permissionsToTabs(authSession.permissions) : [];
  const hasFullAccess = authSession?.role === 'user' && !!authSession?.permissions?.full_access;
  const isLimitedSystemUser = authSession?.role === 'user' && !hasFullAccess;
  const canVerifyBudgetsApp = authSession?.role === 'admin' || hasFullAccess;
  const canApproveBudgetItemsApp =
    authSession?.role === 'admin' ||
    (authSession?.role === 'user' && effectivePatioApproveBudgetItems(authSession.permissions));
  const budgetHubActorOptions =
    authSession?.role === 'admin'
      ? { actor: 'admin' as const }
      : authSession?.role === 'user'
        ? {
            actor: 'technician' as const,
            actorTechnicianSlug: authSession.userId,
            actorTechnicianName: authSession.displayName ?? authSession.username,
          }
        : undefined;
  /** Qualquer usuário logado pode tentar excluir; a senha do admin (ou de exclusão) é a proteção. */
  const canDeleteOrdersInReports = Boolean(authSession);
  const [userTab, setUserTab] = useState<TabId>('home');
  const activeAppTab: TabId = isLimitedSystemUser ? userTab : currentTab;
  const showMobileBackgroundNotifications =
    !isDesktopShell && activeAppTab !== 'patio' && activeAppTab !== 'laboratorio';

  const shellOverlayTopbar = useMemo(() => {
    if (!isDesktopShell) return null;
    const moduleBar = resolveDesktopShellOverlayTopbar(
      isPartsModalOpen,
      isTvPatioModalOpen,
      isSettingsOpen,
      settingsHubOpen
    );
    if (moduleBar) return moduleBar;
    if (activeAppTab === 'reception') {
      return {
        title: receptionUiMode === 'module' ? 'Cadastro de Peças' : 'Cadastro de Veículos',
        accent: moduleAccentColor('reception'),
        tone: 'light' as const,
      };
    }
    return null;
  }, [
    isDesktopShell,
    isPartsModalOpen,
    isTvPatioModalOpen,
    isSettingsOpen,
    settingsHubOpen,
    activeAppTab,
    receptionUiMode,
  ]);

  useEffect(() => {
    if (!authSession || isDesktopShell) return;
    const prefetchHeavyViews = () => {
      void import('./components/views/PatioView');
      void import('./components/views/ReceptionView');
      void import('./components/views/AgendaView');
      void import('./components/views/BudgetsHubView');
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(prefetchHeavyViews, { timeout: 3500 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(prefetchHeavyViews, 1800);
    return () => window.clearTimeout(timer);
  }, [authSession, isDesktopShell]);

  const desktopTopbarCountLabel = useMemo(() => {
    if (!isDesktopShell || shellOverlayTopbar) return undefined;
    if (vehicleModalOsLabel) return vehicleModalOsLabel;
    if (activeAppTab === 'patio') {
      return patioActiveCount === 1 ? '1 veículo' : `${patioActiveCount} veículos`;
    }
    if (activeAppTab === 'laboratorio') {
      return laboratorioActiveCount === 1 ? '1 módulo' : `${laboratorioActiveCount} módulos`;
    }
    return undefined;
  }, [isDesktopShell, shellOverlayTopbar, activeAppTab, patioActiveCount, laboratorioActiveCount, vehicleModalOsLabel]);

  const patioBudgetsHub = usePatioBudgetsHubNotifier({
    enabled: Boolean(authSession),
    activeTab: activeAppTab,
    /** ≥60s — badge Home sem polling agressivo (custo Vercel). */
    pollMs: 60000,
  });

  const handleOpenBudgetFromHub = useCallback((serviceOrderId: string, budgetId: string) => {
    setHubBudgetViewer({ serviceOrderId, budgetId });
  }, []);

  const handleOpenLaboratoryOrderFromPatio = useCallback(
    (serviceOrderId: string) => {
      setLaboratorioPendingOrderId(serviceOrderId);
      if (isLimitedSystemUser) {
        if (userAllowedTabs.includes('laboratorio')) setUserTab('laboratorio');
        else setUserTab('home');
      } else {
        setCurrentTab('laboratorio');
      }
    },
    [isLimitedSystemUser, userAllowedTabs]
  );

  const handleOpenPatioOrderFromScan = useCallback(
    (serviceOrderId: string) => {
      setPatioPendingOrderId(serviceOrderId);
      if (isLimitedSystemUser) {
        if (userAllowedTabs.includes('patio')) setUserTab('patio');
        else setUserTab('home');
      } else {
        setCurrentTab('patio');
      }
    },
    [isLimitedSystemUser, userAllowedTabs]
  );

  const handleLaboratoryOrderHandled = useCallback(() => {
    setLaboratorioPendingOrderId(null);
  }, []);

  const handlePatioOrderHandled = useCallback(() => {
    setPatioPendingOrderId(null);
  }, []);

  /** Pistola USB em qualquer página: QR da OS abre a OS; demais códigos abrem peça. */
  const handleGlobalBarcodeScan = useCallback((code: string) => {
    const osId = parseLabOsQrPayload(code);
    if (osId) {
      setGlobalPartScan(null);
      void (async () => {
        try {
          const detail = await getServiceOrderById(osId);
          if (detail.order_type === 'module') {
            handleOpenLaboratoryOrderFromPatio(osId);
          } else {
            handleOpenPatioOrderFromScan(osId);
          }
        } catch {
          handleOpenLaboratoryOrderFromPatio(osId);
        }
      })();
      return;
    }
    setGlobalPartScan({ code, token: Date.now() });
  }, [handleOpenLaboratoryOrderFromPatio, handleOpenPatioOrderFromScan]);

  useBarcodeWedgeListener({
    enabled: Boolean(authSession),
    captureWhileFocused: true,
    onScan: handleGlobalBarcodeScan,
  });

  const openPartsWithIntent = useCallback((intent: WorkshopPartsBootIntent) => {
    setGlobalPartScan(null);
    setPartsBootIntent(intent);
    setIsPartsModalOpen(true);
  }, []);

  const handleGlobalPartEdit = useCallback(
    (part: WorkshopPart) => openPartsWithIntent({ type: 'edit', part }),
    [openPartsWithIntent]
  );
  const handleGlobalPartStockEntry = useCallback(
    (part: WorkshopPart) => openPartsWithIntent({ type: 'inbound', part }),
    [openPartsWithIntent]
  );
  const handleGlobalPartRegister = useCallback(
    (barcode: string) => openPartsWithIntent({ type: 'create', barcode }),
    [openPartsWithIntent]
  );
  const handleGlobalPartSale = useCallback(
    (part: WorkshopPart) => openPartsWithIntent({ type: 'outbound', mode: 'sale', part }),
    [openPartsWithIntent]
  );
  const handleGlobalPartConsumable = useCallback(
    (part: WorkshopPart) => openPartsWithIntent({ type: 'outbound', mode: 'consumable', part }),
    [openPartsWithIntent]
  );

  const navigateToHomeApp = useCallback(() => {
    if (isLimitedSystemUser) {
      setUserTab('home');
    } else {
      setCurrentTab('home');
    }
  }, [isLimitedSystemUser]);

  const handleOverlayCloseOrBack = useCallback(() => {
    if (returnTabAfterReception === 'patio' || returnTabAfterReception === 'laboratorio') {
      const target = returnTabAfterReception;
      setReturnTabAfterReception(null);
      if (isLimitedSystemUser) {
        if (userAllowedTabs.includes(target)) setUserTab(target);
        else setUserTab('home');
      } else {
        setCurrentTab(target);
      }
      return;
    }
    if (returnTabAfterReception === 'agenda') {
      setReturnTabAfterReception(null);
      if (agendaIntakeSourceAppointmentId) {
        setAgendaPendingDetailAppointmentId(agendaIntakeSourceAppointmentId);
      }
      if (isLimitedSystemUser) {
        if (userAllowedTabs.includes('agenda')) setUserTab('agenda');
        else setUserTab('home');
      } else {
        setCurrentTab('agenda');
      }
      return;
    }
    if (isLimitedSystemUser) setUserTab('home');
    else setCurrentTab('home');
  }, [returnTabAfterReception, agendaIntakeSourceAppointmentId, isLimitedSystemUser, userAllowedTabs]);

  const handleReceptionIntakeSuccess = useCallback(
    async (orderType: 'vehicle' | 'module') => {
      if (agendaIntakeSourceAppointmentId) {
        try {
          await deleteAppointment(agendaIntakeSourceAppointmentId);
          setAppointments((prev) => prev.filter((a) => a.id !== agendaIntakeSourceAppointmentId));
        } catch (err) {
          console.error('Erro ao remover agendamento após criar ficha', err);
        }
        setAgendaIntakeSourceAppointmentId(null);
      }
      setAgendaPendingDetailAppointmentId(null);
      setReturnTabAfterReception(null);
      setReceptionInitialModuleStatus(null);
      const target: TabId = orderType === 'module' ? 'laboratorio' : 'patio';
      if (isLimitedSystemUser) {
        if (userAllowedTabs.includes(target)) setUserTab(target);
        else setUserTab('home');
      } else {
        setCurrentTab(target);
      }
    },
    [agendaIntakeSourceAppointmentId, isLimitedSystemUser, userAllowedTabs]
  );

  const handleOpenReceptionFromAgenda = useCallback(
    (customer: Customer, appointmentId: string) => {
      setPrefillData(customer);
      setReceptionForcedMode('vehicle');
      setReturnTabAfterReception('agenda');
      setAgendaIntakeSourceAppointmentId(appointmentId);
      if (isLimitedSystemUser) {
        setUserTab('reception');
      } else {
        setCurrentTab('reception');
      }
    },
    [isLimitedSystemUser]
  );

  const clearAgendaPendingDetailAppointment = useCallback(() => {
    setAgendaPendingDetailAppointmentId(null);
  }, []);

  /** Enquanto existir “volta para Pátio/Lab”, o modo veículo/módulo define qual aba ao usar voltar. */
  const syncReturnTabFromReceptionMode = useCallback((mode: ServiceOrderType) => {
    setReceptionUiMode(mode === 'module' ? 'module' : 'vehicle');
    setReturnTabAfterReception((prev) => {
      if (prev === null) return null;
      if (prev === 'agenda') return 'agenda';
      return mode === 'module' ? 'laboratorio' : 'patio';
    });
  }, []);

  useEffect(() => {
    if (activeAppTab !== 'reception') {
      setReturnTabAfterReception(null);
      if (activeAppTab !== 'agenda') {
        setAgendaIntakeSourceAppointmentId(null);
      }
    }
  }, [activeAppTab]);

  // Agenda é carregada pela AgendaView via API (Supabase); não usa mais localStorage.

  // Load theme and preferences on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('app_theme') as 'dark' | 'light';
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      setTheme('light');
    }

    const savedCinematographic = localStorage.getItem('app_cinematographic_mode');
    if (savedCinematographic !== null) {
      setCinematographicMode(savedCinematographic === 'true');
    }
  }, []);

  // Apply theme to document
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('app_cinematographic_mode', String(cinematographicMode));
  }, [cinematographicMode]);

  // Configurações da oficina (nome do admin + aparência global) após login
  useEffect(() => {
    if (!authSession) return;
    let cancelled = false;
    getWorkshopSettings()
      .then((s) => {
        if (cancelled) return;
        setLabProductKinds(s.labProductKinds ?? null);
        setLabQuickServices(s.labQuickServices ?? null);
        if (authSession.role === 'admin') {
          setAdminDisplayName(s.adminDisplayName ?? 'Rei do ABS');
          setAdminPhotoUrl(s.adminPhotoUrl ?? null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authSession]);

  useEffect(() => {
    applyAccentToRoot(document.documentElement, DEFAULT_ACCENT);
  }, []);

  const handleAdminProfileSaved = () => {
    getWorkshopSettings()
      .then((s) => {
        setAdminDisplayName(s.adminDisplayName ?? 'Rei do ABS');
        setAdminPhotoUrl(s.adminPhotoUrl ?? null);
      })
      .catch(() => {});
    setSystemUsersRefreshTrigger((t) => t + 1);
  };

  const openShellProfileEditor = useCallback(() => {
    if (!authSession) return;
    if (authSession.role === 'admin') setShellProfileModal('admin');
    else if (authSession.role === 'user') setShellProfileModal('user');
  }, [authSession]);

  const handleShellUserProfileUpdated = useCallback(
    (data: { displayName?: string; photoUrl?: string | null; accentColor?: string | null }) => {
      if (authSession?.role !== 'user') return;
      const next = {
        ...authSession,
        ...(data.displayName !== undefined && { displayName: data.displayName }),
        ...(data.photoUrl !== undefined && { photoUrl: data.photoUrl }),
        ...(data.accentColor !== undefined && { accentColor: data.accentColor }),
      };
      setAuthSession(next);
      try {
        setStoredAuth(next);
      } catch (_) {}
    },
    [authSession]
  );

  // Função chamada pelo Pátio / histórico da Recepção para preencher o cadastro com dados de uma OS
  const handleUseCustomerData = (data: Customer) => {
    setAgendaIntakeSourceAppointmentId(null);
    setPrefillData(data);
    const inferredMode: 'vehicle' | 'module' =
      data.moduleKind ||
      data.moduleVehicleKind ||
      (data.moduleIdentification ?? '').trim().length > 0
        ? 'module'
        : 'vehicle';
    setReceptionForcedMode(inferredMode);
    setReturnTabAfterReception(inferredMode === 'module' ? 'laboratorio' : 'patio');
    if (authSession?.role === 'user' && !hasFullAccess) {
      setUserTab('reception');
    } else {
      setCurrentTab('reception');
    }
  };

  const handleHomeOpenApp = (app: HomeAppId) => {
    if (app === 'settings') {
      setIsSettingsOpen(true);
      return;
    }
    if (app === 'reception') {
      setReturnTabAfterReception(null);
      setAgendaIntakeSourceAppointmentId(null);
    }
    setCurrentTab(app);
  };

  const handleCreateRegistrationFromArea = useCallback(
    (mode: 'vehicle' | 'module', initialModuleStatus?: ServiceOrderStatus) => {
      try {
        localStorage.setItem('app_reception_mode', mode);
      } catch (_) {}
      setAgendaIntakeSourceAppointmentId(null);
      setPrefillData(null);
      setReceptionForcedMode(mode);
      setReceptionInitialModuleStatus(
        mode === 'module' && initialModuleStatus ? initialModuleStatus : null
      );
      setReturnTabAfterReception(mode === 'module' ? 'laboratorio' : 'patio');
      if (isLimitedSystemUser) {
        setUserTab('reception');
      } else {
        setCurrentTab('reception');
      }
    },
    [isLimitedSystemUser]
  );

  const handleLogout = () => {
    if (
      !window.confirm(
        "Deseja sair do app?\n\nVocê precisará entrar de novo com usuário e senha para acessar o sistema."
      )
    ) {
      return;
    }
    try {
      clearStoredAuth();
    } catch (_) {}
    setVisitedTabs(new Set(['home']));
    setVisitedUserTabs(new Set(['home']));
    setAuthSession(null);
  };

  // Quando for usuário limitado, garantir que a aba atual está na lista permitida
  useEffect(() => {
    if (authSession?.role !== 'user' || userAllowedTabs.length === 0) return;
    setUserTab((current) => (userAllowedTabs.includes(current) ? current : userAllowedTabs[0]));
  }, [authSession?.role, userAllowedTabs.join(',')]);

  // Memória de telas: registrar aba ativa (admin / usuário com acesso total)
  useEffect(() => {
    if (!authSession || (authSession.role === 'user' && !hasFullAccess)) return;
    setVisitedTabs((prev) => {
      if (prev.has(currentTab)) return prev;
      const next = new Set(prev);
      next.add(currentTab);
      return next;
    });
  }, [authSession, currentTab, hasFullAccess]);

  // Memória de telas: usuário limitado
  useEffect(() => {
    if (!authSession || authSession.role !== 'user' || hasFullAccess) return;
    setVisitedUserTabs((prev) => {
      if (prev.has(userTab)) return prev;
      const next = new Set(prev);
      next.add(userTab);
      return next;
    });
  }, [authSession, userTab, hasFullAccess]);

  // Navegação mobile (gesto voltar Android/iOS): se estiver fora da Home, volta para Home.
  useEffect(() => {
    if (!authSession) return;
    if (activeAppTab === 'home') return;
    window.history.pushState({ rdaMobileNav: true, tab: activeAppTab }, '');
  }, [authSession, activeAppTab]);

  useEffect(() => {
    if (!authSession) return;
    const handlePopState = (event: PopStateEvent) => {
      const w = window as Window & {
        __rdaModalBackHandledAt?: number;
        __rdaIgnoreAppPopstate?: boolean;
      };
      // Fechar modal (X / cleanup da pilha): nunca tratar como “voltar à Home”.
      if (w.__rdaIgnoreAppPopstate) {
        w.__rdaIgnoreAppPopstate = false;
        return;
      }
      if (w.__rdaModalBackHandledAt && Date.now() - w.__rdaModalBackHandledAt < 1200) {
        return;
      }
      const state = event.state as { rdaMobileNav?: boolean; rdaAppLayer?: number; tab?: string } | null;
      // Voltou para o estado da aba atual (ex.: fechou histórico) — permanece no Pátio/Lab.
      if (state?.rdaMobileNav && state.tab === activeAppTab) {
        return;
      }
      if (activeAppTab === 'reception') {
        handleOverlayCloseOrBack();
        return;
      }
      if (activeAppTab !== 'home') {
        navigateToHomeApp();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [authSession, activeAppTab, navigateToHomeApp, handleOverlayCloseOrBack]);

  useEffect(() => {
    if (authSession) return;
    setVisitedTabs(new Set(['home']));
    setVisitedUserTabs(new Set(['home']));
  }, [authSession]);

  useBrowserBackLayer(!!commentPopUpNotification, () => setCommentPopUpNotification(null));
  useBrowserBackLayer(isSettingsOpen, () => setIsSettingsOpen(false));
  useBrowserBackLayer(isUserChangePasswordsOpen, () => setIsUserChangePasswordsOpen(false));
  useBrowserBackLayer(!!hubBudgetViewer, () => setHubBudgetViewer(null));
  // Inventário / TVs: ESC via ModalPortal.onRequestClose (evita pilha duplicada).

  const closePartsModalToHome = useCallback(() => {
    setIsPartsModalOpen(false);
    setPartsBootIntent(null);
    navigateToHomeApp();
  }, [navigateToHomeApp]);

  const closeTvPatioModal = useCallback(() => {
    setIsTvPatioModalOpen(false);
  }, []);

  useEffect(() => {
    if (!authSession || !isDesktopShell) {
      setSupportUnreadBadge(0);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      if (isSupportChatOpen) {
        if (!cancelled) setSupportUnreadBadge(0);
        return;
      }
      void getSupportUnreadCount()
        .then((n) => {
          if (!cancelled) setSupportUnreadBadge(n);
        })
        .catch(() => {
          /* tabela pode ainda não existir / rede */
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authSession, isDesktopShell, isSupportChatOpen]);


  // Tela de login (antes de entrar no app)
  if (!authSession) {
    return (
      <LoginView
        onLogin={(session) => {
          try {
            setStoredAuth(session);
          } catch (_) {}
          setAuthSession(session);
        }}
      />
    );
  }

  // Usuário limitado (logins criados pelo admin): abas e ações conforme permissões (full_access usa o app completo abaixo)
  if (authSession.role === 'user' && !hasFullAccess) {
    const perms = authSession.permissions || {};
    const patioPerms = {
      canDeleteCards: perms.patio_delete_cards,
      canAssignTechnician: perms.patio_assign_technician,
      canEditFicha: perms.patio_edit_ficha,
      canEditQueixa: perms.patio_edit_queixa,
      canEditDeliveryDate: perms.patio_edit_delivery_date,
      canEditMileage: perms.patio_edit_mileage,
      canEditBudgets: perms.patio_edit_budgets,
      canAddComments: perms.patio_add_comments,
      canArchiveCard: perms.patio_archive_card,
    };
    const userDisplayName = authSession.displayName ?? authSession.username ?? 'Usuário';
    return (
      <ModalLayerProvider>
      <BackNavigationProvider>
      <AuthenticatedAppFrame
        isDesktopShell={isDesktopShell}
        currentTab={userTab}
        onTabChange={(tab) => handleDesktopTabChange(tab, setUserTab)}
        onBackFromOverlay={handleOverlayCloseOrBack}
        allowedTabs={userAllowedTabs}
        desktopSidebarAccess={desktopSidebarAccess}
        onDesktopSidebarAction={handleDesktopSidebarAction}
        displayName={userDisplayName}
        photoUrl={authSession.photoUrl ?? null}
        onOpenSettings={() => setSettingsHubOpen(true)}
        onOpenProfileEditor={openShellProfileEditor}
        onLogout={handleLogout}
        onOpenSupport={() => setIsSupportChatOpen(true)}
        supportUnreadBadge={supportUnreadBadge}
        orcamentosBadge={patioBudgetsHub.badgeCount}
        notificationCenter={isDesktopShell ? notificationCenterProps : undefined}
        shellOverlayTopbar={shellOverlayTopbar}
        activeSidebarAction={activeDesktopSidebarAction}
        topbarCountLabel={desktopTopbarCountLabel}
        theme={theme}
        onThemeChange={setTheme}
      >
          <KeepAliveTabPanel
            tabId="home"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-0 touch-pan-y [-webkit-overflow-scrolling:touch]"
          >
            <HomeView
              desktopShell={isDesktopShell}
              settingsHubOpen={settingsHubOpen}
              onSettingsHubOpenChange={(open) => {
                setSettingsHubOpen(open);
                if (open) {
                  // Só o hub — não manter Tema/Preferências aberto por cima
                  setIsSettingsOpen(false);
                  setIsUserChangePasswordsOpen(false);
                }
              }}
              settingsHubOpenerRef={homeSettingsHubOpenerRef}
              settingsHubCloserRef={homeSettingsHubCloserRef}
              onOpenPartsStock={() => setIsPartsModalOpen(true)}
              onOpenTvPatio={() => setIsTvPatioModalOpen(true)}
              isTechnician={authSession.isTechnician ?? false}
              technicianName={authSession.displayName ?? 'Usuário'}
              allowedTabs={userAllowedTabs}
              onOpenApp={(app) => {
                if (app === 'reception') {
                  setReturnTabAfterReception(null);
                  setAgendaIntakeSourceAppointmentId(null);
                }
                if (app === 'settings') {
                  setIsSettingsOpen(true);
                  return;
                }
                setUserTab(app as TabId);
              }}
              onLogout={handleLogout}
              isSystemUser
              systemUserUsername={authSession.username ?? ''}
              systemUserDisplayName={authSession.displayName ?? ''}
              systemUserPhotoUrl={authSession.photoUrl ?? null}
              systemUserAccentColor={authSession.accentColor ?? null}
              systemUserProfileToken={authSession.profileToken}
              systemUserIsTechnician={authSession.isTechnician ?? false}
              onSystemUserProfileUpdated={(data) => {
                if (authSession?.role !== 'user') return;
                const next = {
                  ...authSession,
                  ...(data.displayName !== undefined && { displayName: data.displayName }),
                  ...(data.photoUrl !== undefined && { photoUrl: data.photoUrl }),
                  ...(data.accentColor !== undefined && { accentColor: data.accentColor }),
                };
                setAuthSession(next);
                try {
                  setStoredAuth(next);
                } catch (_) {}
              }}
              systemUserPermissions={authSession.permissions}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenChangePasswords={() => setIsUserChangePasswordsOpen(true)}
              globalOverlayModalOpen={isUserChangePasswordsOpen || isSettingsOpen || isTvPatioModalOpen}
              patioBudgetsHubBadge={patioBudgetsHub.badgeCount}
            />
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="orcamentos"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="budgets-hub-no-scrollbar flex flex-1 min-h-0 w-full flex-col overflow-hidden"
          >
            <div className="flex h-full min-h-0 flex-1 flex-col">
              <LazyTabBoundary label="Orçamentos">
                <LazyBudgetsHubView
                blurPlates={cinematographicMode}
                isHubTabActive={userTab === 'orcamentos'}
                onOpenBudgetInPatio={handleOpenBudgetFromHub}
                onIngestNotifierBaseline={patioBudgetsHub.ingestBaselineFromItems}
                onClearHubBadge={patioBudgetsHub.clearBadge}
                consumePendingHubBudgetHighlights={patioBudgetsHub.consumePendingHubBudgetHighlights}
                />
              </LazyTabBoundary>
            </div>
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="relatorios"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
          >
            <LazyTabBoundary label="Relatórios">
              <LazyReportsView blurPlates={cinematographicMode} canDeleteOrders={canDeleteOrdersInReports} />
            </LazyTabBoundary>
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="boletim_erros"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
          >
            <LazyTabBoundary label="Boletim técnico">
              <LazyErrorBulletinView authSession={authSession} />
            </LazyTabBoundary>
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="radar_qualidade"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
          >
            <LazyTabBoundary label="Radar de Qualidade">
              <LazyQualityRadarView authSession={authSession} />
            </LazyTabBoundary>
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="reception"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 w-full flex flex-col overflow-y-auto p-0"
          >
            <LazyTabBoundary label="Recepção">
              <LazyReceptionView
              initialData={prefillData}
              onDataLoaded={() => setPrefillData(null)}
              forcedMode={receptionForcedMode}
              initialModuleStatus={receptionInitialModuleStatus}
              blurPlates={cinematographicMode}
              hidePageChrome={isDesktopShell}
              onUseCustomerData={handleUseCustomerData}
              onIntakeSuccess={handleReceptionIntakeSuccess}
              onReceptionModeChangeForBack={syncReturnTabFromReceptionMode}
              isReceptionTabActive={userTab === 'reception'}
              actorOptions={{
                actor: 'technician',
                actorTechnicianSlug: authSession.userId,
                actorTechnicianName: authSession.displayName ?? authSession.username,
              }}
              />
            </LazyTabBoundary>
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="agenda"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 w-full overflow-y-auto p-0"
          >
            <LazyTabBoundary label="Agenda">
              <LazyAgendaView
              appointments={appointments}
              setAppointments={setAppointments}
              blurPlates={cinematographicMode}
              isAgendaTabActive={userTab === 'agenda'}
              onChegouAoPatioNavigateToReception={handleOpenReceptionFromAgenda}
              pendingDetailAppointmentId={agendaPendingDetailAppointmentId}
              onPendingDetailAppointmentConsumed={clearAgendaPendingDetailAppointment}
              />
            </LazyTabBoundary>
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="patio"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 pt-1 sm:px-4 md:px-6 md:pb-6 md:pt-2 lg:p-8 lg:pt-6"
          >
            <LazyTabBoundary label="Pátio">
              <LazyPatioView
              onUseCustomerData={handleUseCustomerData}
              onCreateRegistration={handleCreateRegistrationFromArea}
              commentAuthorName={authSession.displayName ?? 'Usuário'}
              blurPlates={cinematographicMode}
              isAppTabActive={userTab === 'patio'}
              suppressVehiclePortals={isDesktopShell && shellOverlayTopbar !== null}
              openServiceOrderId={patioPendingOrderId}
              onOpenServiceOrderHandled={handlePatioOrderHandled}
              onOpenLaboratoryOrder={handleOpenLaboratoryOrderFromPatio}
              onActiveCardsCountChange={setPatioActiveCount}
              onVehicleModalOsLabelChange={setVehicleModalOsLabel}
              onClosePage={isDesktopShell ? undefined : navigateToHomeApp}
              actorOptions={{ actor: 'technician', actorTechnicianSlug: authSession.userId, actorTechnicianName: authSession.displayName ?? authSession.username }}
              patioPermissions={patioPerms}
              canApproveBudgetItems={canApproveBudgetItemsApp}
              />
            </LazyTabBoundary>
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="laboratorio"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 pt-1 sm:px-4 md:px-6 md:pb-6 md:pt-2 lg:p-8 lg:pt-6"
          >
            <LazyTabBoundary label="Laboratório">
              <LazyPatioView
              orderType="module"
              onUseCustomerData={handleUseCustomerData}
              onCreateRegistration={handleCreateRegistrationFromArea}
              commentAuthorName={authSession.displayName ?? 'Usuário'}
              blurPlates={cinematographicMode}
              isAppTabActive={userTab === 'laboratorio'}
              suppressVehiclePortals={isDesktopShell && shellOverlayTopbar !== null}
              openServiceOrderId={laboratorioPendingOrderId}
              openServiceOrderSection={null}
              onOpenServiceOrderHandled={handleLaboratoryOrderHandled}
              onActiveCardsCountChange={setLaboratorioActiveCount}
              onVehicleModalOsLabelChange={setVehicleModalOsLabel}
              onClosePage={isDesktopShell ? undefined : navigateToHomeApp}
              actorOptions={{ actor: 'technician', actorTechnicianSlug: authSession.userId, actorTechnicianName: authSession.displayName ?? authSession.username }}
              patioPermissions={patioPerms}
              />
            </LazyTabBoundary>
          </KeepAliveTabPanel>
        {showMobileBackgroundNotifications ? (
          <div className="sr-only" aria-hidden="true">
            <NotificationCenter
              theme={theme}
              onNewCommentNotification={handleNewCommentNotification}
              forTechnician={!!authSession.userId}
              technicianSlug={authSession.userId}
            />
          </div>
        ) : null}
        {commentPopUpNotification && (
          <CommentPopUp
            theme={theme}
            notification={commentPopUpNotification}
            replyAuthorName={authSession.displayName ?? 'Rei do ABS'}
            replyActor="technician"
            blurPlates={cinematographicMode}
            onClose={() => setCommentPopUpNotification(null)}
          />
        )}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          theme={theme}
          onThemeChange={setTheme}
          cinematographicMode={cinematographicMode}
          onCinematographicModeChange={setCinematographicMode}
          orientation={orientation}
          showPatioAccess={false}
        />
        <ChangePasswordsModal isOpen={isUserChangePasswordsOpen} onClose={() => setIsUserChangePasswordsOpen(false)} />
        {hubBudgetViewer ? (
          <BudgetHubViewerModal
            key={`${hubBudgetViewer.serviceOrderId}-${hubBudgetViewer.budgetId}`}
            serviceOrderId={hubBudgetViewer.serviceOrderId}
            budgetId={hubBudgetViewer.budgetId}
            onClose={() => setHubBudgetViewer(null)}
            canApproveBudgetItems={canApproveBudgetItemsApp}
            actorOptions={budgetHubActorOptions}
          />
        ) : null}
        {isPartsModalOpen ? (
          <Suspense fallback={null}>
            <LazyWorkshopPartsModal
              isOpen={isPartsModalOpen}
              onClose={closePartsModalToHome}
              bootIntent={partsBootIntent}
              onBootIntentConsumed={() => setPartsBootIntent(null)}
            />
          </Suspense>
        ) : null}
        {globalPartScan ? (
          <WorkshopPartScanHubModal
            isOpen
            overlayZClass="z-[230]"
            externalScanCode={globalPartScan.code}
            externalScanToken={globalPartScan.token}
            onExternalScanConsumed={() => {}}
            onClose={() => setGlobalPartScan(null)}
            onEditProduct={handleGlobalPartEdit}
            onStockEntry={handleGlobalPartStockEntry}
            onRegisterProduct={handleGlobalPartRegister}
            onSaleOutbound={handleGlobalPartSale}
            onConsumableOutbound={handleGlobalPartConsumable}
          />
        ) : null}
        {isTvPatioModalOpen ? (
          <Suspense fallback={null}>
            <LazyTvPatioModal isOpen={isTvPatioModalOpen} onClose={closeTvPatioModal} />
          </Suspense>
        ) : null}
        <SupportBugsChatModal
          isOpen={isSupportChatOpen}
          onClose={() => setIsSupportChatOpen(false)}
          onUnreadChange={setSupportUnreadBadge}
        />
        {authSession.role === 'user' ? (
          <UserProfileModal
            isOpen={shellProfileModal === 'user'}
            username={authSession.username ?? ''}
            initialDisplayName={authSession.displayName ?? ''}
            initialPhotoUrl={authSession.photoUrl ?? null}
            initialAccentColor={authSession.accentColor ?? null}
            profileToken={authSession.profileToken}
            isTechnician={authSession.isTechnician ?? false}
            onClose={() => setShellProfileModal(null)}
            onProfileUpdated={handleShellUserProfileUpdated}
          />
        ) : null}
        <DesktopEscapeCloseBridge activeAppTab={userTab} onCloseOverlayPage={handleOverlayCloseOrBack} />
      </AuthenticatedAppFrame>
      </BackNavigationProvider>
      </ModalLayerProvider>
    );
  }

  const adminDisplayNameResolved =
    authSession?.role === 'admin'
      ? adminDisplayName
      : authSession?.role === 'user'
        ? (authSession.displayName ?? authSession.username ?? 'Usuário')
        : 'Rei do ABS';
  const adminPhotoResolved =
    authSession?.role === 'admin'
      ? adminPhotoUrl
      : authSession?.role === 'user'
        ? authSession.photoUrl ?? null
        : null;
  const adminAllowedTabs =
    authSession?.role === 'user' && authSession.permissions
      ? permissionsToTabs(authSession.permissions)
      : undefined;

  return (
    <ModalLayerProvider>
    <BackNavigationProvider>
    <AuthenticatedAppFrame
      isDesktopShell={isDesktopShell}
      currentTab={currentTab}
      onTabChange={(tab) => handleDesktopTabChange(tab, setCurrentTab)}
      onBackFromOverlay={handleOverlayCloseOrBack}
      allowedTabs={adminAllowedTabs}
      desktopSidebarAccess={desktopSidebarAccess}
      onDesktopSidebarAction={handleDesktopSidebarAction}
      displayName={adminDisplayNameResolved}
      photoUrl={adminPhotoResolved}
      onOpenSettings={
        authSession?.role === 'admin' ||
        hasFullAccess ||
        authSession?.permissions?.access_settings
          ? () => setSettingsHubOpen(true)
          : undefined
      }
      onOpenProfileEditor={openShellProfileEditor}
      onLogout={handleLogout}
      onOpenSupport={() => setIsSupportChatOpen(true)}
      supportUnreadBadge={supportUnreadBadge}
      orcamentosBadge={patioBudgetsHub.badgeCount}
      notificationCenter={isDesktopShell ? notificationCenterProps : undefined}
      shellOverlayTopbar={shellOverlayTopbar}
      activeSidebarAction={activeDesktopSidebarAction}
      topbarCountLabel={desktopTopbarCountLabel}
      theme={theme}
      onThemeChange={setTheme}
    >
        <KeepAliveTabPanel
          tabId="home"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-0 touch-pan-y [-webkit-overflow-scrolling:touch]"
        >
          <HomeView
            desktopShell={isDesktopShell}
            settingsHubOpen={settingsHubOpen}
            onSettingsHubOpenChange={(open) => {
              setSettingsHubOpen(open);
              if (open) {
                // Só o hub — não manter Tema/Preferências aberto por cima
                setIsSettingsOpen(false);
                setIsUserChangePasswordsOpen(false);
              }
            }}
            settingsHubOpenerRef={homeSettingsHubOpenerRef}
            settingsHubCloserRef={homeSettingsHubCloserRef}
            onOpenPartsStock={() => setIsPartsModalOpen(true)}
            onOpenTvPatio={() => setIsTvPatioModalOpen(true)}
            onOpenApp={handleHomeOpenApp}
            onLogout={handleLogout}
            isTechnician={false}
            isSystemUser={authSession?.role === 'user'}
            systemUserUsername={authSession?.role === 'user' ? (authSession.username ?? '') : ''}
            systemUserDisplayName={authSession?.role === 'user' ? (authSession.displayName ?? '') : ''}
            systemUserPhotoUrl={authSession?.role === 'user' ? authSession.photoUrl ?? null : null}
            systemUserAccentColor={authSession?.role === 'user' ? authSession.accentColor ?? null : null}
            systemUserProfileToken={authSession?.role === 'user' ? authSession.profileToken : undefined}
            systemUserIsTechnician={authSession?.role === 'user' ? (authSession.isTechnician ?? false) : false}
            systemUserPermissions={authSession?.role === 'user' ? authSession.permissions : undefined}
            onSystemUserProfileUpdated={authSession?.role === 'user' ? (data) => {
              if (authSession?.role !== 'user') return;
              const next = { ...authSession, ...(data.displayName !== undefined && { displayName: data.displayName }), ...(data.photoUrl !== undefined && { photoUrl: data.photoUrl }), ...(data.accentColor !== undefined && { accentColor: data.accentColor }) };
              setAuthSession(next);
              try { setStoredAuth(next); } catch (_) {}
            } : undefined}
            adminDisplayName={authSession?.role === 'admin' ? adminDisplayName : undefined}
            adminPhotoUrl={authSession?.role === 'admin' ? adminPhotoUrl : undefined}
            onAdminProfileSaved={authSession?.role === 'admin' ? handleAdminProfileSaved : undefined}
            systemUsersRefreshTrigger={authSession?.role === 'admin' ? systemUsersRefreshTrigger : undefined}
            onOpenSettings={() => setIsSettingsOpen(true)}
            globalOverlayModalOpen={isUserChangePasswordsOpen || isSettingsOpen || isTvPatioModalOpen}
            patioBudgetsHubBadge={patioBudgetsHub.badgeCount}
          />
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="orcamentos"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="budgets-hub-no-scrollbar flex flex-1 min-h-0 w-full flex-col overflow-hidden"
        >
          <div className="flex h-full min-h-0 flex-1 flex-col">
            <LazyTabBoundary label="Orçamentos">
              <LazyBudgetsHubView
              blurPlates={cinematographicMode}
              isHubTabActive={currentTab === 'orcamentos'}
              onOpenBudgetInPatio={handleOpenBudgetFromHub}
              onIngestNotifierBaseline={patioBudgetsHub.ingestBaselineFromItems}
              onClearHubBadge={patioBudgetsHub.clearBadge}
              consumePendingHubBudgetHighlights={patioBudgetsHub.consumePendingHubBudgetHighlights}
              />
            </LazyTabBoundary>
          </div>
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="relatorios"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
        >
          <LazyTabBoundary label="Relatórios">
            <LazyReportsView blurPlates={cinematographicMode} canDeleteOrders={canDeleteOrdersInReports} />
          </LazyTabBoundary>
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="boletim_erros"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
        >
          <LazyTabBoundary label="Boletim técnico">
            <LazyErrorBulletinView authSession={authSession} />
          </LazyTabBoundary>
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="radar_qualidade"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
        >
          <LazyTabBoundary label="Radar de Qualidade">
            <LazyQualityRadarView authSession={authSession} />
          </LazyTabBoundary>
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="reception"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 w-full flex flex-col overflow-y-auto p-0"
        >
          <LazyTabBoundary label="Recepção">
            <LazyReceptionView
            initialData={prefillData}
            onDataLoaded={() => setPrefillData(null)}
            forcedMode={receptionForcedMode}
            initialModuleStatus={receptionInitialModuleStatus}
            blurPlates={cinematographicMode}
            hidePageChrome={isDesktopShell}
            onUseCustomerData={handleUseCustomerData}
            onIntakeSuccess={handleReceptionIntakeSuccess}
            onReceptionModeChangeForBack={syncReturnTabFromReceptionMode}
            isReceptionTabActive={currentTab === 'reception'}
            actorOptions={
              authSession?.role === 'admin'
                ? { actor: 'admin' }
                : {
                    actor: 'technician',
                    actorTechnicianSlug: authSession?.userId,
                    actorTechnicianName: authSession?.displayName ?? authSession?.username,
                  }
            }
            />
          </LazyTabBoundary>
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="agenda"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 w-full overflow-y-auto p-0"
        >
          <LazyTabBoundary label="Agenda">
            <LazyAgendaView
            appointments={appointments}
            setAppointments={setAppointments}
            blurPlates={cinematographicMode}
            isAgendaTabActive={currentTab === 'agenda'}
            onChegouAoPatioNavigateToReception={handleOpenReceptionFromAgenda}
            pendingDetailAppointmentId={agendaPendingDetailAppointmentId}
            onPendingDetailAppointmentConsumed={clearAgendaPendingDetailAppointment}
            />
          </LazyTabBoundary>
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="patio"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 pt-1 sm:px-4 md:px-6 md:pb-6 md:pt-2 lg:p-8 lg:pt-6"
        >
          <LazyTabBoundary label="Pátio">
            <LazyPatioView
            onUseCustomerData={handleUseCustomerData}
            onCreateRegistration={handleCreateRegistrationFromArea}
            commentAuthorName={authSession?.role === 'admin' ? adminDisplayName : (authSession?.displayName ?? authSession?.username ?? 'Rei do ABS')}
            blurPlates={cinematographicMode}
            isAppTabActive={currentTab === 'patio'}
            suppressVehiclePortals={isDesktopShell && shellOverlayTopbar !== null}
            openServiceOrderId={patioPendingOrderId}
            onOpenServiceOrderHandled={handlePatioOrderHandled}
            onOpenLaboratoryOrder={handleOpenLaboratoryOrderFromPatio}
            onActiveCardsCountChange={setPatioActiveCount}
              onVehicleModalOsLabelChange={setVehicleModalOsLabel}
            onClosePage={isDesktopShell ? undefined : navigateToHomeApp}
            canVerifyBudgets={canVerifyBudgetsApp}
            canApproveBudgetItems={canApproveBudgetItemsApp}
            actorOptions={authSession?.role === 'admin' ? { actor: 'admin' } : { actor: 'technician', actorTechnicianSlug: authSession?.userId, actorTechnicianName: authSession?.displayName ?? authSession?.username }}
            />
          </LazyTabBoundary>
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="laboratorio"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 pt-1 sm:px-4 md:px-6 md:pb-6 md:pt-2 lg:p-8 lg:pt-6"
        >
          <LazyTabBoundary label="Laboratório">
            <LazyPatioView
            orderType="module"
            onUseCustomerData={handleUseCustomerData}
            onCreateRegistration={handleCreateRegistrationFromArea}
            commentAuthorName={authSession?.role === 'admin' ? adminDisplayName : (authSession?.displayName ?? authSession?.username ?? 'Rei do ABS')}
            blurPlates={cinematographicMode}
            isAppTabActive={currentTab === 'laboratorio'}
            suppressVehiclePortals={isDesktopShell && shellOverlayTopbar !== null}
            onActiveCardsCountChange={setLaboratorioActiveCount}
              onVehicleModalOsLabelChange={setVehicleModalOsLabel}
            onClosePage={isDesktopShell ? undefined : navigateToHomeApp}
            openServiceOrderId={laboratorioPendingOrderId}
            openServiceOrderSection={null}
            onOpenServiceOrderHandled={handleLaboratoryOrderHandled}
            actorOptions={authSession?.role === 'admin' ? { actor: 'admin' } : { actor: 'technician', actorTechnicianSlug: authSession?.userId, actorTechnicianName: authSession?.displayName ?? authSession?.username }}
            />
          </LazyTabBoundary>
        </KeepAliveTabPanel>

      {/* Global Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        cinematographicMode={cinematographicMode}
        onCinematographicModeChange={setCinematographicMode}
        orientation={orientation}
        showPatioAccess={authSession?.role === 'admin' || hasFullAccess}
      />
      {hubBudgetViewer ? (
        <BudgetHubViewerModal
          key={`${hubBudgetViewer.serviceOrderId}-${hubBudgetViewer.budgetId}`}
          serviceOrderId={hubBudgetViewer.serviceOrderId}
          budgetId={hubBudgetViewer.budgetId}
          onClose={() => setHubBudgetViewer(null)}
          canApproveBudgetItems={canApproveBudgetItemsApp}
          actorOptions={budgetHubActorOptions}
        />
      ) : null}
      {isPartsModalOpen ? (
        <Suspense fallback={null}>
          <LazyWorkshopPartsModal
            isOpen={isPartsModalOpen}
            onClose={closePartsModalToHome}
            bootIntent={partsBootIntent}
            onBootIntentConsumed={() => setPartsBootIntent(null)}
          />
        </Suspense>
      ) : null}
      {globalPartScan ? (
        <WorkshopPartScanHubModal
          isOpen
          overlayZClass="z-[230]"
          externalScanCode={globalPartScan.code}
          externalScanToken={globalPartScan.token}
          onExternalScanConsumed={() => {}}
          onClose={() => setGlobalPartScan(null)}
          onEditProduct={handleGlobalPartEdit}
          onStockEntry={handleGlobalPartStockEntry}
          onRegisterProduct={handleGlobalPartRegister}
          onSaleOutbound={handleGlobalPartSale}
          onConsumableOutbound={handleGlobalPartConsumable}
        />
      ) : null}
      {isTvPatioModalOpen ? (
        <Suspense fallback={null}>
          <LazyTvPatioModal isOpen={isTvPatioModalOpen} onClose={closeTvPatioModal} />
        </Suspense>
      ) : null}
      <SupportBugsChatModal
        isOpen={isSupportChatOpen}
        onClose={() => setIsSupportChatOpen(false)}
        onUnreadChange={setSupportUnreadBadge}
      />
      {authSession?.role === 'admin' ? (
        <AdminProfileModal
          isOpen={shellProfileModal === 'admin'}
          onClose={() => setShellProfileModal(null)}
          onSaved={handleAdminProfileSaved}
        />
      ) : null}
      {authSession?.role === 'user' ? (
        <UserProfileModal
          isOpen={shellProfileModal === 'user'}
          username={authSession.username ?? ''}
          initialDisplayName={authSession.displayName ?? ''}
          initialPhotoUrl={authSession.photoUrl ?? null}
          initialAccentColor={authSession.accentColor ?? null}
          profileToken={authSession.profileToken}
          isTechnician={authSession.isTechnician ?? false}
          onClose={() => setShellProfileModal(null)}
          onProfileUpdated={handleShellUserProfileUpdated}
        />
      ) : null}

      {/* Central de notificações (mobile/tablet): no PC o sino fica na barra superior do shell. */}
      {showMobileBackgroundNotifications ? (
        <div className="sr-only" aria-hidden="true">
          <NotificationCenter
            theme={theme}
            onNewCommentNotification={handleNewCommentNotification}
            forTechnician={authSession?.role === 'user' && !!authSession?.userId}
            technicianSlug={authSession?.role === 'user' ? authSession.userId : undefined}
          />
        </div>
      ) : null}
      {commentPopUpNotification && (
        <CommentPopUp
          theme={theme}
          notification={commentPopUpNotification}
          replyAuthorName={authSession?.role === 'admin' ? adminDisplayName : (authSession?.displayName ?? authSession?.username ?? 'Rei do ABS')}
          replyActor={authSession?.role === 'admin' ? 'admin' : 'technician'}
          blurPlates={cinematographicMode}
          onClose={() => setCommentPopUpNotification(null)}
        />
      )}
      <DesktopEscapeCloseBridge activeAppTab={currentTab} onCloseOverlayPage={handleOverlayCloseOrBack} />
    </AuthenticatedAppFrame>
    </BackNavigationProvider>
    </ModalLayerProvider>
  );
}