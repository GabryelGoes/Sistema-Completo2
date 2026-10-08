import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { Customer, Appointment } from './types';
import { SettingsModal } from './components/SettingsModal';
import { ChangePasswordsModal } from './components/ChangePasswordsModal';
import { type TabId } from './components/TabBar';
import { NotificationCenter, type NotificationCenterProps } from './components/NotificationCenter';
import {
  MacOsBudgetBannerStack,
  type MacOsBudgetBannerItem,
} from './components/MacOsBudgetBannerStack';
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
  getSupportUnreadCount,
  markNotificationRead,
  getServiceOrderById,
  registerOficinaRetorno,
  registerOficinaSaida,
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
import { tryActiveBarcodeScanClaim } from './utils/activeBarcodeScanClaim';
import { parseLabOsQrPayload } from './utils/labOsQrCode';
import type { WorkshopPartsBootIntent } from './components/WorkshopPartsModal';
import { LabOsScanQuickModal } from './components/LabOsScanQuickModal';
import { LabScanBatchPanel, type LabScanBatchItem } from './components/lab/LabScanBatchPanel';
import {
  loadLabScanMode,
  saveLabScanMode,
  type LabScanMode,
} from './utils/labScanMode';

import { lazyWithRetry } from './utils/lazyWithRetry';

type ShellProfileModal = 'user' | 'admin' | null;

const LazyWorkshopPartsModal = lazyWithRetry(() =>
  import('./components/WorkshopPartsModal').then((m) => ({ default: m.WorkshopPartsModal }))
);
const LazyTvPatioModal = lazyWithRetry(() =>
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
  /** Token para forçar reabertura do modal ao reescanear a mesma OS. */
  const [laboratorioPendingScanToken, setLaboratorioPendingScanToken] = useState(0);
  /** Modal rápido ao escanear QR da peça do laboratório (qualquer tela). */
  const [labOsScanQuick, setLabOsScanQuick] = useState<{ id: string; token: number } | null>(null);
  /** Modo da pistola no Laboratório: consultar | saida | retorno */
  const [labScanMode, setLabScanMode] = useState<LabScanMode>(() => loadLabScanMode());
  const [labScanBatch, setLabScanBatch] = useState<LabScanBatchItem[]>([]);
  const [labScanBatchConfirming, setLabScanBatchConfirming] = useState(false);
  const labScanBusyRef = useRef(false);
  const [patioPendingOrderId, setPatioPendingOrderId] = useState<string | null>(null);
  const [shellProfileModal, setShellProfileModal] = useState<ShellProfileModal>(null);
  const [isPartsModalOpen, setIsPartsModalOpen] = useState(false);
  const [partsBootIntent, setPartsBootIntent] = useState<WorkshopPartsBootIntent | null>(null);
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

  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [patioActiveCount, setPatioActiveCount] = useState(0);
  const [vehicleModalOsLabel, setVehicleModalOsLabel] = useState<string | null>(null);
  const [laboratorioActiveCount, setLaboratorioActiveCount] = useState(0);

  // Modo cinematográfico: embaçar placas em todo o app (para gravar tela / redes sociais)
  const [cinematographicMode, setCinematographicMode] = useState(false);
  /** Banners macOS de orçamento (ligado por padrão). */
  const [budgetBannerNotifications, setBudgetBannerNotifications] = useState(true);
  /** Banners macOS de comentários (ligado por padrão). */
  const [commentBannerNotifications, setCommentBannerNotifications] = useState(true);
  /** Embaça orçamentos sem verificação (ligado por padrão). */
  const [blurUnverifiedBudgets, setBlurUnverifiedBudgets] = useState(true);
  const [budgetBannerItems, setBudgetBannerItems] = useState<MacOsBudgetBannerItem[]>([]);
  const [minimizedBudgetBanners, setMinimizedBudgetBanners] = useState<MacOsBudgetBannerItem[]>([]);

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
      ? { actor: 'admin' as const, actorDisplayName: adminDisplayName }
      : authSession?.role === 'user'
        ? {
            actor: 'technician' as const,
            actorTechnicianSlug: authSession.userId,
            actorTechnicianName: authSession.displayName ?? authSession.username,
            actorDisplayName: authSession.displayName ?? authSession.username,
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

  const handleOpenBudgetFromHub = useCallback((serviceOrderId: string, budgetId: string) => {
    setHubBudgetViewer({ serviceOrderId, budgetId });
  }, []);

  const goToOrcamentosTab = useCallback(() => {
    if (isLimitedSystemUser) {
      setVisitedUserTabs((prev) => {
        if (prev.has('orcamentos')) return prev;
        const next = new Set(prev);
        next.add('orcamentos');
        return next;
      });
      setUserTab('orcamentos');
    } else {
      setVisitedTabs((prev) => {
        if (prev.has('orcamentos')) return prev;
        const next = new Set(prev);
        next.add('orcamentos');
        return next;
      });
      setCurrentTab('orcamentos');
    }
  }, [isLimitedSystemUser]);

  const openBudgetFromBanner = useCallback(
    (item: MacOsBudgetBannerItem) => {
      if (item.kind === 'comment') {
        if (item.commentNotification) {
          setCommentPopUpNotification(item.commentNotification);
        }
        return;
      }
      if (item.kind === 'lab_sem_conserto') {
        const soId = item.serviceOrderId?.trim() || '';
        if (!soId) return;
        setLabOsScanQuick(null);
        setLaboratorioPendingOrderId(soId);
        setLaboratorioPendingScanToken(Date.now());
        setIsPartsModalOpen(false);
        setPartsBootIntent(null);
        setIsTvPatioModalOpen(false);
        setSettingsHubOpen(false);
        setIsSettingsOpen(false);
        setIsSupportChatOpen(false);
        if (isLimitedSystemUser) {
          setVisitedUserTabs((prev) => {
            if (prev.has('laboratorio')) return prev;
            const next = new Set(prev);
            next.add('laboratorio');
            return next;
          });
          if (userAllowedTabs.includes('laboratorio')) setUserTab('laboratorio');
          else setUserTab('home');
        } else {
          setVisitedTabs((prev) => {
            if (prev.has('laboratorio')) return prev;
            const next = new Set(prev);
            next.add('laboratorio');
            return next;
          });
          setCurrentTab('laboratorio');
        }
        return;
      }
      const soId = item.serviceOrderId?.trim() || '';
      const budgetId = item.budgetId?.trim() || '';
      if (!soId || !budgetId) return;
      goToOrcamentosTab();
      setHubBudgetViewer({ serviceOrderId: soId, budgetId });
    },
    [goToOrcamentosTab, isLimitedSystemUser, userAllowedTabs]
  );

  const handleMinimizeBudgetBanners = useCallback((items: MacOsBudgetBannerItem[]) => {
    setMinimizedBudgetBanners((prev) => {
      const byId = new Map(prev.map((x) => [x.id, x]));
      for (const it of items) byId.set(it.id, it);
      return Array.from(byId.values());
    });
    const ids = new Set(items.map((x) => x.id));
    setBudgetBannerItems((prev) => prev.filter((x) => !ids.has(x.id)));
  }, []);

  const handleMinimizedBudgetActivate = useCallback(
    (item: MacOsBudgetBannerItem) => {
      setMinimizedBudgetBanners((prev) => prev.filter((x) => x.id !== item.id));
      openBudgetFromBanner(item);
    },
    [openBudgetFromBanner]
  );

  const pushBudgetBanner = useCallback(
    (item: MacOsBudgetBannerItem) => {
      if (!isDesktopShell) return;
      const isComment = item.kind === 'comment';
      const isLabSemConserto = item.kind === 'lab_sem_conserto';
      if (isComment && !commentBannerNotifications) return;
      if (!isComment && !isLabSemConserto && !budgetBannerNotifications) return;
      setMinimizedBudgetBanners((prev) =>
        prev.filter((x) => {
          if (isComment) {
            return !(x.kind === 'comment' && x.id === item.id);
          }
          if (isLabSemConserto) {
            return !(
              x.kind === 'lab_sem_conserto' && x.serviceOrderId === item.serviceOrderId
            );
          }
          return !(x.budgetId === item.budgetId && x.kind === item.kind);
        })
      );
      setBudgetBannerItems((prev) => {
        if (
          prev.some((x) =>
            isComment
              ? x.id === item.id || (x.kind === 'comment' && x.commentNotification?.id === item.id)
              : isLabSemConserto
                ? x.id === item.id ||
                  (x.kind === 'lab_sem_conserto' && x.serviceOrderId === item.serviceOrderId)
                : x.id === item.id || (x.budgetId === item.budgetId && x.kind === item.kind)
          )
        ) {
          return prev;
        }
        // Sem corte agressivo: novos banners sempre entram; soft-cap alto só para memória.
        return [item, ...prev].slice(0, 80);
      });
    },
    [isDesktopShell, budgetBannerNotifications, commentBannerNotifications]
  );

  const handleNewCommentNotification = useCallback(
    (n: Notification) => {
      // Toque próprio de comentário (diferente do arpejo de orçamento).
      playNotificationSound();
      if (isDesktopShell && commentBannerNotifications) {
        const soId =
          typeof n.payload.service_order_id === 'string' ? n.payload.service_order_id.trim() : '';
        const author =
          (typeof n.payload.author_display_name === 'string' && n.payload.author_display_name.trim()) ||
          (typeof n.payload.technician_name === 'string' && n.payload.technician_name.trim()) ||
          null;
        const authorPhotoUrl =
          typeof n.payload.author_photo_url === 'string' && n.payload.author_photo_url.trim()
            ? n.payload.author_photo_url.trim()
            : null;
        const commentText =
          typeof n.payload.text === 'string' ? n.payload.text : null;
        pushBudgetBanner({
          id: n.id,
          kind: 'comment',
          serviceOrderId: soId,
          vehicleModel:
            typeof n.payload.vehicle_model === 'string' ? n.payload.vehicle_model : null,
          vehiclePlate:
            typeof n.payload.vehicle_plate === 'string' ? n.payload.vehicle_plate : null,
          customerName:
            typeof n.payload.customer_name === 'string' ? n.payload.customer_name : null,
          authorName: author,
          authorPhotoUrl,
          commentText,
          commentNotification: n,
        });
        // No PC com banners: o alerta fica no canto; clique abre o pop-up de resposta.
        return;
      }
      setCommentPopUpNotification(n);
    },
    [isDesktopShell, commentBannerNotifications, pushBudgetBanner]
  );

  const handleBudgetHubEvents = useCallback(
    (events: import('./hooks/usePatioBudgetsHubNotifier').PatioBudgetHubEvent[]) => {
      if (!isDesktopShell || !budgetBannerNotifications) return;
      for (const ev of events) {
        const kind =
          ev.kind === 'created'
            ? 'budget_created'
            : ev.kind === 'edited'
              ? 'budget_edited'
              : ev.kind === 'approved'
                ? 'budget_items_approved'
                : 'budget_verified';
        const authorName =
          ev.kind === 'verified'
            ? ev.item.verifiedByName
            : ev.item.lastActorName ?? null;
        const authorPhotoUrl =
          ev.kind === 'verified'
            ? ev.item.verifiedByPhotoUrl ?? null
            : ev.item.lastActorPhotoUrl ?? null;
        pushBudgetBanner({
          id: `${ev.kind}-${ev.item.budgetId}-${ev.item.contentSignature.slice(0, 12)}-${ev.item.approvalFingerprint ?? ''}-${ev.item.verifiedAt ?? ''}`,
          kind,
          serviceOrderId: ev.item.serviceOrderId,
          budgetId: ev.item.budgetId,
          vehicleModel: ev.item.vehicleModel || ev.item.cardName,
          vehiclePlate: ev.item.plate,
          authorName,
          authorPhotoUrl,
          budgetNumber: ev.budgetNumber,
          approvedItemsCount:
            ev.kind === 'approved' ? ev.item.approvedItemsCount ?? null : null,
        });
      }
    },
    [isDesktopShell, budgetBannerNotifications, pushBudgetBanner]
  );

  const patioBudgetsHub = usePatioBudgetsHubNotifier({
    enabled: Boolean(authSession),
    activeTab: activeAppTab,
    /** No PC com banners: poll mais rápido para aparecer o alerta. */
    pollMs: isDesktopShell && budgetBannerNotifications ? 8000 : 60000,
    onBudgetEvents: isDesktopShell && budgetBannerNotifications ? handleBudgetHubEvents : undefined,
  });

  /** Banner imediato ao salvar aprovação neste cliente (não depende do poll/race do hub). */
  useEffect(() => {
    if (!isDesktopShell || !budgetBannerNotifications) return;
    const onLocalApproved = (ev: Event) => {
      const d = (ev as CustomEvent<{
        serviceOrderId?: string;
        budgetId?: string;
        cardName?: string;
        approvedItemsCount?: number;
        authorName?: string | null;
      }>).detail;
      const soId = typeof d?.serviceOrderId === 'string' ? d.serviceOrderId.trim() : '';
      const budgetId = typeof d?.budgetId === 'string' ? d.budgetId.trim() : '';
      if (!soId || !budgetId) return;
      pushBudgetBanner({
        id: `local-approved-${budgetId}-${Date.now()}`,
        kind: 'budget_items_approved',
        serviceOrderId: soId,
        budgetId,
        vehicleModel: typeof d.cardName === 'string' && d.cardName.trim() ? d.cardName.trim() : null,
        authorName: typeof d.authorName === 'string' && d.authorName.trim() ? d.authorName.trim() : null,
        approvedItemsCount:
          typeof d.approvedItemsCount === 'number' && d.approvedItemsCount >= 0
            ? Math.floor(d.approvedItemsCount)
            : null,
      });
    };
    window.addEventListener('rda-budget-items-approved', onLocalApproved);
    return () => window.removeEventListener('rda-budget-items-approved', onLocalApproved);
  }, [isDesktopShell, budgetBannerNotifications, pushBudgetBanner]);

  const handleBudgetBannerNotification = useCallback(
    (n: Notification) => {
      if (!isDesktopShell) return;
      if (n.type === 'lab_sem_conserto') {
        const soId =
          typeof n.payload.service_order_id === 'string' ? n.payload.service_order_id.trim() : '';
        if (!soId) return;
        const author =
          (typeof n.payload.author_display_name === 'string' && n.payload.author_display_name.trim()) ||
          (typeof n.payload.technician_name === 'string' && n.payload.technician_name.trim()) ||
          null;
        const authorPhotoUrl =
          typeof n.payload.author_photo_url === 'string' && n.payload.author_photo_url.trim()
            ? n.payload.author_photo_url.trim()
            : null;
        const osRaw = n.payload.os_number;
        const osNumber =
          typeof osRaw === 'number' && osRaw >= 1
            ? Math.floor(osRaw)
            : typeof osRaw === 'string' && Number(osRaw) >= 1
              ? Math.floor(Number(osRaw))
              : null;
        const moduleIdent =
          typeof n.payload.module_identification === 'string' && n.payload.module_identification.trim()
            ? n.payload.module_identification.trim()
            : null;
        const vehicleModel =
          (typeof n.payload.vehicle_model === 'string' && n.payload.vehicle_model.trim()
            ? n.payload.vehicle_model.trim()
            : null) || moduleIdent;
        pushBudgetBanner({
          id: n.id,
          kind: 'lab_sem_conserto',
          serviceOrderId: soId,
          vehicleModel,
          vehiclePlate:
            typeof n.payload.vehicle_plate === 'string' ? n.payload.vehicle_plate : null,
          customerName:
            typeof n.payload.customer_name === 'string' ? n.payload.customer_name : null,
          authorName: author,
          authorPhotoUrl,
          osNumber,
        });
        return;
      }
      if (!budgetBannerNotifications) return;
      if (
        n.type !== 'budget_created' &&
        n.type !== 'budget_edited' &&
        n.type !== 'budget_items_approved'
      ) {
        return;
      }
      const soId =
        typeof n.payload.service_order_id === 'string' ? n.payload.service_order_id.trim() : '';
      const budgetId =
        typeof n.payload.budget_id === 'string' ? n.payload.budget_id.trim() : '';
      if (!soId || !budgetId) return;
      const numRaw = n.payload.budget_number;
      const budgetNumber =
        typeof numRaw === 'number' && numRaw >= 1
          ? Math.floor(numRaw)
          : typeof numRaw === 'string' && Number(numRaw) >= 1
            ? Math.floor(Number(numRaw))
            : null;
      const author =
        (typeof n.payload.author_display_name === 'string' && n.payload.author_display_name.trim()) ||
        (typeof n.payload.technician_name === 'string' && n.payload.technician_name.trim()) ||
        null;
      const authorPhotoUrl =
        typeof n.payload.author_photo_url === 'string' && n.payload.author_photo_url.trim()
          ? n.payload.author_photo_url.trim()
          : null;
      const approvedRaw = n.payload.approved_items_count;
      const approvedItemsCount =
        typeof approvedRaw === 'number' && approvedRaw >= 0
          ? Math.floor(approvedRaw)
          : typeof approvedRaw === 'string' && Number(approvedRaw) >= 0
            ? Math.floor(Number(approvedRaw))
            : null;
      pushBudgetBanner({
        id: n.id,
        kind: n.type,
        serviceOrderId: soId,
        budgetId,
        vehicleModel:
          typeof n.payload.vehicle_model === 'string' ? n.payload.vehicle_model : null,
        vehiclePlate:
          typeof n.payload.vehicle_plate === 'string' ? n.payload.vehicle_plate : null,
        authorName: author,
        authorPhotoUrl,
        budgetNumber,
        approvedItemsCount: n.type === 'budget_items_approved' ? approvedItemsCount : null,
      });
    },
    [isDesktopShell, budgetBannerNotifications, pushBudgetBanner]
  );

  const handleNotificationClick = useCallback(
    (n: Notification) => {
      if (n.type === 'comment') {
        setCommentPopUpNotification(n);
        void markNotificationRead(
          n.id,
          authSession?.role === 'user' && authSession.userId
            ? { for: 'technician', technicianSlug: authSession.userId }
            : undefined
        ).catch(() => {});
        return;
      }
      if (n.type === 'lab_sem_conserto') {
        const soId =
          typeof n.payload.service_order_id === 'string' ? n.payload.service_order_id.trim() : '';
        if (soId) {
          setLabOsScanQuick(null);
          setLaboratorioPendingOrderId(soId);
          setLaboratorioPendingScanToken(Date.now());
          setIsPartsModalOpen(false);
          setPartsBootIntent(null);
          setIsTvPatioModalOpen(false);
          setSettingsHubOpen(false);
          setIsSettingsOpen(false);
          setIsSupportChatOpen(false);
          if (isLimitedSystemUser) {
            setVisitedUserTabs((prev) => {
              if (prev.has('laboratorio')) return prev;
              const next = new Set(prev);
              next.add('laboratorio');
              return next;
            });
            if (userAllowedTabs.includes('laboratorio')) setUserTab('laboratorio');
            else setUserTab('home');
          } else {
            setVisitedTabs((prev) => {
              if (prev.has('laboratorio')) return prev;
              const next = new Set(prev);
              next.add('laboratorio');
              return next;
            });
            setCurrentTab('laboratorio');
          }
        }
        void markNotificationRead(
          n.id,
          authSession?.role === 'user' && authSession.userId
            ? { for: 'technician', technicianSlug: authSession.userId }
            : undefined
        ).catch(() => {});
        return;
      }
      if (n.type === 'budget_created' || n.type === 'budget_edited' || n.type === 'budget_items_approved') {
        const soId =
          typeof n.payload.service_order_id === 'string' ? n.payload.service_order_id.trim() : '';
        const budgetId =
          typeof n.payload.budget_id === 'string' ? n.payload.budget_id.trim() : '';
        if (!soId || !budgetId) return;
        goToOrcamentosTab();
        setHubBudgetViewer({ serviceOrderId: soId, budgetId });
        void markNotificationRead(
          n.id,
          authSession?.role === 'user' && authSession.userId
            ? { for: 'technician', technicianSlug: authSession.userId }
            : undefined
        ).catch(() => {});
      }
    },
    [authSession, goToOrcamentosTab, isLimitedSystemUser, userAllowedTabs]
  );

  const notificationCenterProps = useMemo((): Omit<NotificationCenterProps, 'placement'> | undefined => {
    if (!authSession) return undefined;
    return {
      theme,
      onNewCommentNotification: handleNewCommentNotification,
      onBudgetBannerNotification: handleBudgetBannerNotification,
      onNotificationClick: handleNotificationClick,
      forTechnician: authSession.role === 'user' && !!authSession.userId,
      technicianSlug: authSession.role === 'user' ? authSession.userId : undefined,
      minimizedBudgetBanners,
      onMinimizedBudgetActivate: handleMinimizedBudgetActivate,
      onMinimizedBudgetDismiss: (id) =>
        setMinimizedBudgetBanners((prev) => prev.filter((x) => x.id !== id)),
      onMinimizedBudgetClearAll: () => setMinimizedBudgetBanners([]),
    };
  }, [
    authSession,
    theme,
    handleNewCommentNotification,
    handleBudgetBannerNotification,
    handleNotificationClick,
    minimizedBudgetBanners,
    handleMinimizedBudgetActivate,
  ]);

  const handleOpenLaboratoryOrderFromPatio = useCallback(
    (serviceOrderId: string) => {
      setLabOsScanQuick(null);
      setLaboratorioPendingOrderId(serviceOrderId);
      setLaboratorioPendingScanToken(Date.now());
      // Fecha overlays que cobririam o modal da OS.
      setIsPartsModalOpen(false);
      setPartsBootIntent(null);
      setIsTvPatioModalOpen(false);
      setSettingsHubOpen(false);
      setIsSettingsOpen(false);
      setIsSupportChatOpen(false);
      if (isLimitedSystemUser) {
        setVisitedUserTabs((prev) => {
          if (prev.has('laboratorio')) return prev;
          const next = new Set(prev);
          next.add('laboratorio');
          return next;
        });
        if (userAllowedTabs.includes('laboratorio')) setUserTab('laboratorio');
        else setUserTab('home');
      } else {
        setVisitedTabs((prev) => {
          if (prev.has('laboratorio')) return prev;
          const next = new Set(prev);
          next.add('laboratorio');
          return next;
        });
        setCurrentTab('laboratorio');
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

  const handleLabScanModeChange = useCallback((mode: LabScanMode) => {
    setLabScanMode(mode);
    saveLabScanMode(mode);
    if (mode === 'consultar') {
      setLabScanBatch([]);
    }
  }, []);

  type LabScanOrderMeta = {
    os_number?: number | null;
    vehicle_model?: string | null;
    module_kind?: string | null;
    module_product_other?: string | null;
    module_identification?: string | null;
    bench_slot?: number | null;
    customer_name?: string | null;
    customers?: { name?: string | null } | null;
  };

  const buildLabBatchItem = useCallback(
    (
      osId: string,
      result: LabScanOrderMeta | null | undefined,
      opts: { feedback: string; ok: boolean; already?: boolean }
    ): LabScanBatchItem => {
      const r = result ?? {};
      const customerName =
        (typeof r.customers?.name === 'string' ? r.customers.name : '').trim() ||
        (typeof r.customer_name === 'string' ? r.customer_name : '').trim() ||
        null;
      return {
        id: osId,
        osNumber: typeof r.os_number === 'number' ? r.os_number : null,
        label: (r.vehicle_model || '').trim() || osId.slice(0, 8),
        vehicleModel: (r.vehicle_model || '').trim() || null,
        customerName,
        moduleKind: r.module_kind ?? null,
        moduleProductOther: r.module_product_other ?? null,
        moduleIdentification: (r.module_identification || '').trim() || null,
        benchSlot: typeof r.bench_slot === 'number' ? r.bench_slot : null,
        feedback: opts.feedback,
        ok: opts.ok,
        already: opts.already,
      };
    },
    []
  );

  const appendLabBatchItem = useCallback((item: LabScanBatchItem) => {
    setLabScanBatch((prev) => {
      const withoutDup = prev.filter((p) => p.id !== item.id);
      return [...withoutDup, item];
    });
  }, []);

  const appendLabBatchFromScan = useCallback(
    async (
      osId: string,
      result: LabScanOrderMeta | null | undefined,
      opts: { feedback: string; ok: boolean; already?: boolean }
    ) => {
      let enriched: LabScanOrderMeta | null | undefined = result;
      try {
        const hasCustomer =
          Boolean(enriched?.customers?.name?.trim()) ||
          Boolean(enriched?.customer_name?.trim());
        const missingMeta =
          !enriched?.module_kind ||
          !enriched?.vehicle_model ||
          !enriched?.module_identification ||
          !hasCustomer;
        if (missingMeta) {
          try {
            enriched = { ...enriched, ...(await getServiceOrderById(osId)) };
          } catch {
            /* mantém o que veio da movimentação */
          }
        }
        appendLabBatchItem(buildLabBatchItem(osId, enriched, opts));
      } catch (err: unknown) {
        appendLabBatchItem({
          id: osId,
          label: osId.slice(0, 8),
          feedback: opts.feedback || (err instanceof Error ? err.message : 'Erro ao exibir peça'),
          ok: opts.ok,
          already: opts.already,
        });
      }
    },
    [appendLabBatchItem, buildLabBatchItem]
  );

  /**
   * Pistola USB: se o modal da OS reivindicar (caixa de estoque), trata lá;
   * senão, QR de OS do Laboratório (RDA-OS) — Consultar / Saída / Retorno.
   */
  const handleGlobalBarcodeScan = useCallback((code: string) => {
    void (async () => {
      if (await tryActiveBarcodeScanClaim(code)) return;
      const osId = parseLabOsQrPayload(code);
      if (!osId) return;
      setIsPartsModalOpen(false);
      setPartsBootIntent(null);
      setIsTvPatioModalOpen(false);
      setSettingsHubOpen(false);
      setIsSettingsOpen(false);
      setIsSupportChatOpen(false);

      const mode = labScanMode;
      if (mode === 'consultar') {
        setLabOsScanQuick({ id: osId, token: Date.now() });
        return;
      }

      if (labScanBusyRef.current) return;
      labScanBusyRef.current = true;
      const actorName =
        authSession?.displayName ?? authSession?.username ?? 'Usuário';
      const actorUserId = authSession?.userId ?? null;
      try {
        if (mode === 'saida') {
          try {
            const result = await registerOficinaSaida(osId, { actorName, actorUserId });
            playNotificationSound();
            await appendLabBatchFromScan(osId, result, {
              feedback: result.move?.feedback || 'OK · Laboratório',
              ok: true,
            });
          } catch (err: unknown) {
            const e = err as Error & {
              already?: boolean;
              location?: { kind: string; value: string | null };
            };
            if (e.already) {
              playNotificationSound();
              await appendLabBatchFromScan(osId, null, {
                feedback:
                  e.location?.kind === 'deposito' && e.location.value
                    ? `Já no laboratório · ${e.location.value}`
                    : e.message || 'Já no destino',
                ok: true,
                already: true,
              });
            } else {
              await appendLabBatchFromScan(osId, null, {
                feedback: e.message || 'Falha na saída',
                ok: false,
              });
            }
          }
        } else if (mode === 'retorno') {
          try {
            const result = await registerOficinaRetorno(osId, { actorName, actorUserId });
            playNotificationSound();
            await appendLabBatchFromScan(osId, result, {
              feedback: result.move?.feedback || 'OK · Oficina',
              ok: true,
            });
          } catch (err: unknown) {
            const e = err as Error & {
              already?: boolean;
              location?: { kind: string; value: string | null };
            };
            if (e.already) {
              playNotificationSound();
              await appendLabBatchFromScan(osId, null, {
                feedback:
                  e.location?.kind === 'oficina' && e.location.value
                    ? `Já na oficina · ${e.location.value}`
                    : e.message || 'Já no destino',
                ok: true,
                already: true,
              });
            } else {
              await appendLabBatchFromScan(osId, null, {
                feedback: e.message || 'Falha no retorno',
                ok: false,
              });
            }
          }
        }
      } finally {
        labScanBusyRef.current = false;
      }
    })();
  }, [
    appendLabBatchFromScan,
    authSession?.displayName,
    authSession?.userId,
    authSession?.username,
    labScanMode,
  ]);

  const handleLabBatchUndoLast = useCallback(() => {
    void (async () => {
      const last = labScanBatch[labScanBatch.length - 1];
      if (!last?.ok || last.already) {
        setLabScanBatch((prev) => prev.slice(0, -1));
        return;
      }
      setLabScanBatchConfirming(true);
      const actorName =
        authSession?.displayName ?? authSession?.username ?? 'Usuário';
      const actorUserId = authSession?.userId ?? null;
      try {
        // Desfaz invertendo o movimento
        if (labScanMode === 'saida') {
          await registerOficinaRetorno(last.id, { actorName, actorUserId, force: true });
        } else if (labScanMode === 'retorno') {
          await registerOficinaSaida(last.id, { actorName, actorUserId, force: true });
        }
        setLabScanBatch((prev) => prev.slice(0, -1));
      } catch (err: unknown) {
        window.alert(err instanceof Error ? err.message : 'Não foi possível desfazer.');
      } finally {
        setLabScanBatchConfirming(false);
      }
    })();
  }, [
    authSession?.displayName,
    authSession?.userId,
    authSession?.username,
    labScanBatch,
    labScanMode,
  ]);

  const handleLabBatchConfirm = useCallback(() => {
    setLabScanBatch([]);
  }, []);

  useBarcodeWedgeListener({
    enabled: Boolean(authSession),
    captureWhileFocused: true,
    onScan: handleGlobalBarcodeScan,
  });

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
    const savedBudgetBanners = localStorage.getItem('app_budget_banner_notifications');
    if (savedBudgetBanners !== null) {
      setBudgetBannerNotifications(savedBudgetBanners === 'true');
    }
    const savedCommentBanners = localStorage.getItem('app_comment_banner_notifications');
    if (savedCommentBanners !== null) {
      setCommentBannerNotifications(savedCommentBanners === 'true');
    }
    const savedBlurUnverified = localStorage.getItem('app_blur_unverified_budgets');
    if (savedBlurUnverified !== null) {
      setBlurUnverifiedBudgets(savedBlurUnverified === 'true');
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

  useEffect(() => {
    localStorage.setItem('app_budget_banner_notifications', String(budgetBannerNotifications));
    if (!budgetBannerNotifications) {
      setBudgetBannerItems((prev) => prev.filter((x) => x.kind === 'comment'));
      setMinimizedBudgetBanners((prev) => prev.filter((x) => x.kind === 'comment'));
    }
  }, [budgetBannerNotifications]);

  useEffect(() => {
    localStorage.setItem('app_comment_banner_notifications', String(commentBannerNotifications));
    if (!commentBannerNotifications) {
      setBudgetBannerItems((prev) => prev.filter((x) => x.kind !== 'comment'));
      setMinimizedBudgetBanners((prev) => prev.filter((x) => x.kind !== 'comment'));
    }
  }, [commentBannerNotifications]);

  useEffect(() => {
    localStorage.setItem('app_blur_unverified_budgets', String(blurUnverifiedBudgets));
  }, [blurUnverifiedBudgets]);

  useEffect(() => {
    if (!isDesktopShell) {
      setBudgetBannerItems([]);
      setMinimizedBudgetBanners([]);
    }
  }, [isDesktopShell]);

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
                blurUnverifiedBudgets={blurUnverifiedBudgets && !canVerifyBudgetsApp}
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
              markAsFromAgenda={Boolean(agendaIntakeSourceAppointmentId)}
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
              onBudgetBannerNotification={handleBudgetBannerNotification}
              onNotificationClick={handleNotificationClick}
              onNewCommentNotification={handleNewCommentNotification}
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
            className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-3 pb-4 pt-1 sm:px-4 md:px-6 md:pb-6 md:pt-2 lg:p-8 lg:pt-6"
          >
            <LazyTabBoundary label="Laboratório">
              <LazyPatioView
              orderType="module"
              onUseCustomerData={handleUseCustomerData}
              onCreateRegistration={handleCreateRegistrationFromArea}
              commentAuthorName={authSession.displayName ?? 'Usuário'}
              onBudgetBannerNotification={handleBudgetBannerNotification}
              onNotificationClick={handleNotificationClick}
              onNewCommentNotification={handleNewCommentNotification}
              blurPlates={cinematographicMode}
              isAppTabActive={userTab === 'laboratorio'}
              suppressVehiclePortals={isDesktopShell && shellOverlayTopbar !== null}
              openServiceOrderId={laboratorioPendingOrderId}
              openServiceOrderScanToken={laboratorioPendingScanToken}
              openServiceOrderSection={null}
              onOpenServiceOrderHandled={handleLaboratoryOrderHandled}
              onActiveCardsCountChange={setLaboratorioActiveCount}
              onVehicleModalOsLabelChange={setVehicleModalOsLabel}
              onClosePage={isDesktopShell ? undefined : navigateToHomeApp}
              actorOptions={{ actor: 'technician', actorTechnicianSlug: authSession.userId, actorTechnicianName: authSession.displayName ?? authSession.username }}
              patioPermissions={patioPerms}
              labScanMode={labScanMode}
              onLabScanModeChange={handleLabScanModeChange}
              />
            </LazyTabBoundary>
          </KeepAliveTabPanel>
        {labScanMode === 'saida' || labScanMode === 'retorno' ? (
          <LabScanBatchPanel
            mode={labScanMode}
            items={labScanBatch}
            confirming={labScanBatchConfirming}
            onConfirm={handleLabBatchConfirm}
            onUndoLast={handleLabBatchUndoLast}
            onClear={handleLabBatchConfirm}
          />
        ) : null}
        {showMobileBackgroundNotifications ? (
          <div className="sr-only" aria-hidden="true">
            <NotificationCenter
              theme={theme}
              onNewCommentNotification={handleNewCommentNotification}
              onBudgetBannerNotification={handleBudgetBannerNotification}
              onNotificationClick={handleNotificationClick}
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
            replyAuthorUserId={authSession.userId}
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
          budgetBannerNotifications={budgetBannerNotifications}
          onBudgetBannerNotificationsChange={setBudgetBannerNotifications}
          commentBannerNotifications={commentBannerNotifications}
          onCommentBannerNotificationsChange={setCommentBannerNotifications}
          blurUnverifiedBudgets={blurUnverifiedBudgets}
          onBlurUnverifiedBudgetsChange={setBlurUnverifiedBudgets}
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
            blurUnverifiedBudgets={blurUnverifiedBudgets && !canVerifyBudgetsApp}
          />
        ) : null}
        {isDesktopShell ? (
          <MacOsBudgetBannerStack
            items={budgetBannerItems}
            theme={theme}
            onDismiss={(id) => setBudgetBannerItems((prev) => prev.filter((x) => x.id !== id))}
            onDismissAll={() => setBudgetBannerItems([])}
            onMinimize={handleMinimizeBudgetBanners}
            onActivate={(item) => openBudgetFromBanner(item)}
          />
        ) : null}
        <LabOsScanQuickModal
          serviceOrderId={labOsScanQuick?.id ?? null}
          scanToken={labOsScanQuick?.token ?? 0}
          onClose={() => setLabOsScanQuick(null)}
          onOpenFullOs={handleOpenLaboratoryOrderFromPatio}
          actorOptions={budgetHubActorOptions}
        />
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
                blurUnverifiedBudgets={blurUnverifiedBudgets && !canVerifyBudgetsApp}
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
            markAsFromAgenda={Boolean(agendaIntakeSourceAppointmentId)}
            actorOptions={
              authSession?.role === 'admin'
                ? { actor: 'admin', actorDisplayName: adminDisplayName }
                : {
                    actor: 'technician',
                    actorTechnicianSlug: authSession?.userId,
                    actorTechnicianName: authSession?.displayName ?? authSession?.username,
                    actorDisplayName: authSession?.displayName ?? authSession?.username,
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
            onBudgetBannerNotification={handleBudgetBannerNotification}
            onNotificationClick={handleNotificationClick}
            onNewCommentNotification={handleNewCommentNotification}
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
            requiresExplicitCommentRead={canVerifyBudgetsApp}
            canApproveBudgetItems={canApproveBudgetItemsApp}
            actorOptions={authSession?.role === 'admin' ? { actor: 'admin', actorDisplayName: adminDisplayName } : { actor: 'technician', actorTechnicianSlug: authSession?.userId, actorTechnicianName: authSession?.displayName ?? authSession?.username, actorDisplayName: authSession?.displayName ?? authSession?.username }}
            />
          </LazyTabBoundary>
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="laboratorio"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-3 pb-4 pt-1 sm:px-4 md:px-6 md:pb-6 md:pt-2 lg:p-8 lg:pt-6"
        >
          <LazyTabBoundary label="Laboratório">
            <LazyPatioView
            orderType="module"
            onUseCustomerData={handleUseCustomerData}
            onCreateRegistration={handleCreateRegistrationFromArea}
            commentAuthorName={authSession?.role === 'admin' ? adminDisplayName : (authSession?.displayName ?? authSession?.username ?? 'Rei do ABS')}
            onBudgetBannerNotification={handleBudgetBannerNotification}
            onNotificationClick={handleNotificationClick}
            onNewCommentNotification={handleNewCommentNotification}
            blurPlates={cinematographicMode}
            isAppTabActive={currentTab === 'laboratorio'}
            suppressVehiclePortals={isDesktopShell && shellOverlayTopbar !== null}
            onActiveCardsCountChange={setLaboratorioActiveCount}
              onVehicleModalOsLabelChange={setVehicleModalOsLabel}
            onClosePage={isDesktopShell ? undefined : navigateToHomeApp}
            openServiceOrderId={laboratorioPendingOrderId}
            openServiceOrderScanToken={laboratorioPendingScanToken}
            openServiceOrderSection={null}
            onOpenServiceOrderHandled={handleLaboratoryOrderHandled}
            canVerifyBudgets={canVerifyBudgetsApp}
            requiresExplicitCommentRead={canVerifyBudgetsApp}
            canApproveBudgetItems={canApproveBudgetItemsApp}
            actorOptions={authSession?.role === 'admin' ? { actor: 'admin', actorDisplayName: adminDisplayName } : { actor: 'technician', actorTechnicianSlug: authSession?.userId, actorTechnicianName: authSession?.displayName ?? authSession?.username, actorDisplayName: authSession?.displayName ?? authSession?.username }}
            labScanMode={labScanMode}
            onLabScanModeChange={handleLabScanModeChange}
            />
          </LazyTabBoundary>
        </KeepAliveTabPanel>

      {labScanMode === 'saida' || labScanMode === 'retorno' ? (
        <LabScanBatchPanel
          mode={labScanMode}
          items={labScanBatch}
          confirming={labScanBatchConfirming}
          onConfirm={handleLabBatchConfirm}
          onUndoLast={handleLabBatchUndoLast}
          onClear={handleLabBatchConfirm}
        />
      ) : null}

      {/* Global Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        cinematographicMode={cinematographicMode}
        onCinematographicModeChange={setCinematographicMode}
        budgetBannerNotifications={budgetBannerNotifications}
        onBudgetBannerNotificationsChange={setBudgetBannerNotifications}
        commentBannerNotifications={commentBannerNotifications}
        onCommentBannerNotificationsChange={setCommentBannerNotifications}
        blurUnverifiedBudgets={blurUnverifiedBudgets}
        onBlurUnverifiedBudgetsChange={setBlurUnverifiedBudgets}
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
            blurUnverifiedBudgets={blurUnverifiedBudgets && !canVerifyBudgetsApp}
        />
      ) : null}
      {isDesktopShell ? (
        <MacOsBudgetBannerStack
          items={budgetBannerItems}
          theme={theme}
          onDismiss={(id) => setBudgetBannerItems((prev) => prev.filter((x) => x.id !== id))}
          onDismissAll={() => setBudgetBannerItems([])}
          onMinimize={handleMinimizeBudgetBanners}
          onActivate={(item) => openBudgetFromBanner(item)}
        />
      ) : null}
      <LabOsScanQuickModal
        serviceOrderId={labOsScanQuick?.id ?? null}
        scanToken={labOsScanQuick?.token ?? 0}
        onClose={() => setLabOsScanQuick(null)}
        onOpenFullOs={handleOpenLaboratoryOrderFromPatio}
        actorOptions={budgetHubActorOptions}
      />
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
            onBudgetBannerNotification={handleBudgetBannerNotification}
            onNotificationClick={handleNotificationClick}
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
          replyAuthorUserId={authSession?.role === 'user' ? authSession.userId : null}
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