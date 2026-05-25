import React, { useState, useEffect, useCallback } from 'react';
import { Customer, Appointment } from './types';
import { SettingsModal } from './components/SettingsModal';
import { ChangePasswordsModal } from './components/ChangePasswordsModal';
import { type TabId } from './components/TabBar';
import { NotificationCenter } from './components/NotificationCenter';
import { CommentPopUp } from './components/CommentPopUp';
import { playNotificationSound } from './utils/notificationSound';
import { ReceptionView } from './components/views/ReceptionView';
import { PatioView } from './components/views/PatioView';
import { AgendaView } from './components/views/AgendaView';
import { HomeView, type HomeAppId } from './components/views/HomeView';
import { BudgetHubViewerModal } from './components/BudgetHubViewerModal';
import { BudgetsHubView } from './components/views/BudgetsHubView';
import { ReportsView } from './components/views/ReportsView';
import { ErrorBulletinView } from './components/views/ErrorBulletinView';
import { QualityRadarView } from './components/views/QualityRadarView';
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
} from './services/apiService';
import { KeepAliveTabPanel } from './components/KeepAliveTabPanel';
import { applyAccentToRoot, DEFAULT_ACCENT } from './utils/appAppearance';
import { ModalLayerProvider } from './components/ui/ModalLayerContext';
import { OverlayPageNavBar } from './components/ui/OverlayPageNavBar';
import { BackNavigationProvider, useBrowserBackLayer } from './components/ui/BackNavigationContext';
import { DesktopEscapeCloseBridge } from './components/ui/DesktopEscapeCloseBridge';
import { AuthenticatedAppFrame } from './components/layout/AuthenticatedAppFrame';
import { useDesktopShell } from './hooks/useDesktopShell';
import { PublicVehicleAccompanimentPage } from './components/public/PublicVehicleAccompanimentPage';
import { VehicleAccompanimentModal } from './components/VehicleAccompanimentModal';
import { AdminProfileModal } from './components/AdminProfileModal';
import { UserProfileModal } from './components/UserProfileModal';

type ShellProfileModal = 'user' | 'admin' | null;

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
  const [vehicleAccompanimentOpen, setVehicleAccompanimentOpen] = useState(false);
  const [vehicleAccompanimentPresetId, setVehicleAccompanimentPresetId] = useState<string | null>(null);
  const [shellProfileModal, setShellProfileModal] = useState<ShellProfileModal>(null);

  const openVehicleAccompaniment = useCallback((serviceOrderId?: string | null) => {
    setVehicleAccompanimentPresetId(serviceOrderId ?? null);
    setVehicleAccompanimentOpen(true);
  }, []);

  const closeVehicleAccompaniment = useCallback(() => {
    setVehicleAccompanimentOpen(false);
    setVehicleAccompanimentPresetId(null);
  }, []);

  const handleNewCommentNotification = (n: Notification) => {
    playNotificationSound();
    setCommentPopUpNotification(n);
  };

  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Efeitos do app (animações, 3D nos cards, etc.) — chave liga/desliga
  const [effectsEnabled, setEffectsEnabled] = useState(true);

  // Modo cinematográfico: embaçar placas em todo o app (para gravar tela / redes sociais)
  const [cinematographicMode, setCinematographicMode] = useState(false);

  // Device Orientation
  const orientation = useOrientation();
  const isDesktopShell = useDesktopShell();

  // Appointments State
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Estado para transferir dados do Histórico (Pátio) para a Recepção
  const [prefillData, setPrefillData] = useState<Customer | null>(null);
  const [receptionForcedMode, setReceptionForcedMode] = useState<'vehicle' | 'module' | null>(null);
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
  /** Qualquer usuário logado pode tentar excluir; a senha do admin (ou de exclusão) é a proteção. */
  const canDeleteOrdersInReports = Boolean(authSession);
  const [userTab, setUserTab] = useState<TabId>('home');
  const activeAppTab: TabId = isLimitedSystemUser ? userTab : currentTab;

  const patioBudgetsHub = usePatioBudgetsHubNotifier({
    enabled: Boolean(authSession),
    activeTab: activeAppTab,
    /** ≥60s — badge Home sem polling agressivo (custo Vercel). */
    pollMs: 60000,
  });

  const handleOpenBudgetFromHub = useCallback((serviceOrderId: string, budgetId: string) => {
    setHubBudgetViewer({ serviceOrderId, budgetId });
  }, []);

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

    const savedEffects = localStorage.getItem('app_effects_enabled');
    if (savedEffects !== null) {
      setEffectsEnabled(savedEffects === 'true');
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
    localStorage.setItem('app_effects_enabled', String(effectsEnabled));
  }, [effectsEnabled]);

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
      (data.moduleIdentification ?? '').trim().length > 0 ? 'module' : 'vehicle';
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
    (mode: 'vehicle' | 'module') => {
      try {
        localStorage.setItem('app_reception_mode', mode);
      } catch (_) {}
      setAgendaIntakeSourceAppointmentId(null);
      setPrefillData(null);
      setReceptionForcedMode(mode);
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
    const handlePopState = () => {
      const w = window as Window & { __rdaModalBackHandledAt?: number };
      if (w.__rdaModalBackHandledAt && Date.now() - w.__rdaModalBackHandledAt < 120) {
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

  const publicAccompToken =
    typeof window !== 'undefined'
      ? (() => {
          const m = window.location.pathname.match(/^\/acompanhamento\/([^/]+)\/?$/);
          return m?.[1] ? decodeURIComponent(m[1]) : null;
        })()
      : null;
  if (publicAccompToken) {
    return <PublicVehicleAccompanimentPage token={publicAccompToken} />;
  }

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
      canApproveBudgetItems: effectivePatioApproveBudgetItems(perms),
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
        onTabChange={setUserTab}
        onBackFromOverlay={handleOverlayCloseOrBack}
        allowedTabs={userAllowedTabs}
        displayName={userDisplayName}
        photoUrl={authSession.photoUrl ?? null}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenProfileEditor={openShellProfileEditor}
        onLogout={handleLogout}
        orcamentosBadge={patioBudgetsHub.badgeCount}
        effectsEnabled={effectsEnabled}
      >
          <KeepAliveTabPanel
            tabId="home"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 overflow-y-auto p-0"
          >
            <HomeView
              desktopShell={isDesktopShell}
              isTechnician={authSession.isTechnician ?? false}
              technicianName={authSession.displayName ?? 'Usuário'}
              allowedTabs={userAllowedTabs}
              onOpenApp={(app) => {
                if (app === 'reception') {
                  setReturnTabAfterReception(null);
                  setAgendaIntakeSourceAppointmentId(null);
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
              globalOverlayModalOpen={isSettingsOpen || isUserChangePasswordsOpen}
              patioBudgetsHubBadge={patioBudgetsHub.badgeCount}
              onOpenVehicleAccompaniment={openVehicleAccompaniment}
            />
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="orcamentos"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
          >
            <BudgetsHubView
              blurPlates={cinematographicMode}
              isHubTabActive={userTab === 'orcamentos'}
              onOpenBudgetInPatio={handleOpenBudgetFromHub}
              onIngestNotifierBaseline={patioBudgetsHub.ingestBaselineFromItems}
              onClearHubBadge={patioBudgetsHub.clearBadge}
              consumePendingHubBudgetHighlights={patioBudgetsHub.consumePendingHubBudgetHighlights}
            />
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="relatorios"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
          >
            <ReportsView blurPlates={cinematographicMode} canDeleteOrders={canDeleteOrdersInReports} />
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="boletim_erros"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
          >
            <ErrorBulletinView authSession={authSession} />
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="radar_qualidade"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
          >
            <QualityRadarView authSession={authSession} />
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="reception"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 w-full flex flex-col overflow-y-auto p-0"
          >
            <ReceptionView
              initialData={prefillData}
              onDataLoaded={() => setPrefillData(null)}
              forcedMode={receptionForcedMode}
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
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="agenda"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 w-full overflow-y-auto p-0"
          >
            <AgendaView
              appointments={appointments}
              setAppointments={setAppointments}
              blurPlates={cinematographicMode}
              isAgendaTabActive={userTab === 'agenda'}
              onChegouAoPatioNavigateToReception={handleOpenReceptionFromAgenda}
              pendingDetailAppointmentId={agendaPendingDetailAppointmentId}
              onPendingDetailAppointmentConsumed={clearAgendaPendingDetailAppointment}
            />
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="patio"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 pt-8"
          >
            <PatioView
              onUseCustomerData={handleUseCustomerData}
              onCreateRegistration={handleCreateRegistrationFromArea}
              effectsEnabled={effectsEnabled}
              commentAuthorName={authSession.displayName ?? 'Usuário'}
              blurPlates={cinematographicMode}
              isAppTabActive={userTab === 'patio'}
              actorOptions={{ actor: 'technician', actorTechnicianSlug: authSession.userId, actorTechnicianName: authSession.displayName ?? authSession.username }}
              patioPermissions={patioPerms}
              onOpenVehicleAccompaniment={openVehicleAccompaniment}
            />
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="laboratorio"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 pt-8"
          >
            <PatioView
              orderType="module"
              onUseCustomerData={handleUseCustomerData}
              onCreateRegistration={handleCreateRegistrationFromArea}
              effectsEnabled={effectsEnabled}
              commentAuthorName={authSession.displayName ?? 'Usuário'}
              blurPlates={cinematographicMode}
              isAppTabActive={userTab === 'laboratorio'}
              openServiceOrderId={null}
              openServiceOrderSection={null}
              onOpenServiceOrderHandled={() => {}}
              actorOptions={{ actor: 'technician', actorTechnicianSlug: authSession.userId, actorTechnicianName: authSession.displayName ?? authSession.username }}
              patioPermissions={patioPerms}
            />
          </KeepAliveTabPanel>
        <div className="sr-only" aria-hidden="true">
          <NotificationCenter
            theme={theme}
            onNewCommentNotification={handleNewCommentNotification}
            forTechnician={!!authSession.userId}
            technicianSlug={authSession.userId}
          />
        </div>
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
          effectsEnabled={effectsEnabled}
          onEffectsChange={setEffectsEnabled}
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
          />
        ) : null}
        <VehicleAccompanimentModal
          isOpen={vehicleAccompanimentOpen}
          onClose={closeVehicleAccompaniment}
          initialServiceOrderId={vehicleAccompanimentPresetId}
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
      onTabChange={setCurrentTab}
      onBackFromOverlay={handleOverlayCloseOrBack}
      allowedTabs={adminAllowedTabs}
      displayName={adminDisplayNameResolved}
      photoUrl={adminPhotoResolved}
      onOpenSettings={authSession?.role === 'admin' || hasFullAccess ? () => setIsSettingsOpen(true) : undefined}
      onOpenProfileEditor={openShellProfileEditor}
      onLogout={handleLogout}
      orcamentosBadge={patioBudgetsHub.badgeCount}
      effectsEnabled={effectsEnabled}
    >
        <KeepAliveTabPanel
          tabId="home"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 overflow-y-auto p-0"
        >
          <HomeView
            desktopShell={isDesktopShell}
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
            globalOverlayModalOpen={isSettingsOpen || isUserChangePasswordsOpen}
            patioBudgetsHubBadge={patioBudgetsHub.badgeCount}
            onOpenVehicleAccompaniment={openVehicleAccompaniment}
          />
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="orcamentos"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
        >
          <BudgetsHubView
            blurPlates={cinematographicMode}
            isHubTabActive={currentTab === 'orcamentos'}
            onOpenBudgetInPatio={handleOpenBudgetFromHub}
            onIngestNotifierBaseline={patioBudgetsHub.ingestBaselineFromItems}
            onClearHubBadge={patioBudgetsHub.clearBadge}
            consumePendingHubBudgetHighlights={patioBudgetsHub.consumePendingHubBudgetHighlights}
          />
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="relatorios"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
        >
          <ReportsView blurPlates={cinematographicMode} canDeleteOrders={canDeleteOrdersInReports} />
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="boletim_erros"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
        >
          <ErrorBulletinView authSession={authSession} />
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="radar_qualidade"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
        >
          <QualityRadarView authSession={authSession} />
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="reception"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 w-full flex flex-col overflow-y-auto p-0"
        >
          <ReceptionView
            initialData={prefillData}
            onDataLoaded={() => setPrefillData(null)}
            forcedMode={receptionForcedMode}
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
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="agenda"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 w-full overflow-y-auto p-0"
        >
          <AgendaView
            appointments={appointments}
            setAppointments={setAppointments}
            blurPlates={cinematographicMode}
            isAgendaTabActive={currentTab === 'agenda'}
            onChegouAoPatioNavigateToReception={handleOpenReceptionFromAgenda}
            pendingDetailAppointmentId={agendaPendingDetailAppointmentId}
            onPendingDetailAppointmentConsumed={clearAgendaPendingDetailAppointment}
          />
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="patio"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 pt-8"
        >
          <PatioView
            onUseCustomerData={handleUseCustomerData}
            onCreateRegistration={handleCreateRegistrationFromArea}
            effectsEnabled={effectsEnabled}
            commentAuthorName={authSession?.role === 'admin' ? adminDisplayName : (authSession?.displayName ?? authSession?.username ?? 'Rei do ABS')}
            blurPlates={cinematographicMode}
            isAppTabActive={currentTab === 'patio'}
            actorOptions={authSession?.role === 'admin' ? { actor: 'admin' } : { actor: 'technician', actorTechnicianSlug: authSession?.userId, actorTechnicianName: authSession?.displayName ?? authSession?.username }}
            onOpenVehicleAccompaniment={openVehicleAccompaniment}
          />
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="laboratorio"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 pt-8"
        >
          <PatioView
            orderType="module"
            onUseCustomerData={handleUseCustomerData}
            onCreateRegistration={handleCreateRegistrationFromArea}
            effectsEnabled={effectsEnabled}
            commentAuthorName={authSession?.role === 'admin' ? adminDisplayName : (authSession?.displayName ?? authSession?.username ?? 'Rei do ABS')}
            blurPlates={cinematographicMode}
            isAppTabActive={currentTab === 'laboratorio'}
            openServiceOrderId={null}
            openServiceOrderSection={null}
            onOpenServiceOrderHandled={() => {}}
            actorOptions={authSession?.role === 'admin' ? { actor: 'admin' } : { actor: 'technician', actorTechnicianSlug: authSession?.userId, actorTechnicianName: authSession?.displayName ?? authSession?.username }}
          />
        </KeepAliveTabPanel>

      {/* Global Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        effectsEnabled={effectsEnabled}
        onEffectsChange={setEffectsEnabled}
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
        />
      ) : null}
      <VehicleAccompanimentModal
        isOpen={vehicleAccompanimentOpen}
        onClose={closeVehicleAccompaniment}
        initialServiceOrderId={vehicleAccompanimentPresetId}
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

      {/* Central de notificações: admin vê notificações do admin; técnicos veem as deles (target_slug = userId). Só ativa modo técnico quando userId existe para o pop-up de comentários aparecer. */}
      <div className="sr-only" aria-hidden="true">
        <NotificationCenter
          theme={theme}
          onNewCommentNotification={handleNewCommentNotification}
          forTechnician={authSession?.role === 'user' && !!authSession?.userId}
          technicianSlug={authSession?.role === 'user' ? authSession.userId : undefined}
        />
      </div>
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