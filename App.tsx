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
import { BudgetsHubView } from './components/views/BudgetsHubView';
import { usePatioBudgetsHubNotifier } from './hooks/usePatioBudgetsHubNotifier';
import { LoginView, getStoredAuth, setStoredAuth, clearStoredAuth } from './components/views/LoginView';
import { useOrientation } from './components/views/useOrientation';
import {
  type AuthSession,
  type Notification,
  type SystemUserPermissions,
  type ServiceOrderType,
  effectivePatioApproveBudgetItems,
  getWorkshopSettings,
} from './services/apiService';
import { AssistantChat } from './components/AssistantChat';
import { KeepAliveTabPanel } from './components/KeepAliveTabPanel';
import { ArrowLeft, X } from 'lucide-react';
import { applyAccentToRoot, DEFAULT_ACCENT } from './utils/appAppearance';
import { ModalLayerProvider } from './components/ui/ModalLayerContext';
import { BackNavigationProvider, useBrowserBackLayer } from './components/ui/BackNavigationContext';
import { DesktopEscapeCloseBridge } from './components/ui/DesktopEscapeCloseBridge';

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
  /** Dispara entrega do aviso pela Zaya (modal + voz). */
  const [pendingZayaNotification, setPendingZayaNotification] = useState<Notification | null>(null);
  /** Abrir modal do Pátio via assistente (Zaya). */
  const [assistantPatioOpenOrderId, setAssistantPatioOpenOrderId] = useState<string | null>(null);
  /** Quando definido com orderId, abre o modal de leitura deste orçamento após carregar. */
  const [assistantPatioOpenBudgetId, setAssistantPatioOpenBudgetId] = useState<string | null>(null);
  /** Incrementa para abrir o modal de histórico de arquivados no Pátio/Laboratório (Zaya). */
  const [assistantPatioOpenHistoryTrigger, setAssistantPatioOpenHistoryTrigger] = useState(0);

  const handleNewCommentNotification = (n: Notification) => {
    playNotificationSound();
    setCommentPopUpNotification(n);
  };

  const handleNewZayaAlert = (n: Notification) => {
    playNotificationSound();
    setPendingZayaNotification(n);
  };

  const clearPendingZayaNotification = useCallback(() => setPendingZayaNotification(null), []);

  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Efeitos do app (animações, 3D nos cards, etc.) — chave liga/desliga
  const [effectsEnabled, setEffectsEnabled] = useState(true);

  // Modo cinematográfico: embaçar placas em todo o app (para gravar tela / redes sociais)
  const [cinematographicMode, setCinematographicMode] = useState(false);

  // Device Orientation
  const orientation = useOrientation();

  // Appointments State
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Estado para transferir dados do Histórico (Pátio) para a Recepção
  const [prefillData, setPrefillData] = useState<Customer | null>(null);
  const [receptionForcedMode, setReceptionForcedMode] = useState<'vehicle' | 'module' | null>(null);
  /** Ao fechar a Recepção aberta a partir do Pátio/Lab (criar veículo/módulo ou “usar dados”), voltar para esta aba em vez do Início. */
  const [returnTabAfterReception, setReturnTabAfterReception] = useState<TabId | null>(null);

  // Nome do admin (vem das configurações da oficina; atualizado ao salvar no Perfil do administrador)
  const [adminDisplayName, setAdminDisplayName] = useState<string>('Rei do ABS');
  const [adminPhotoUrl, setAdminPhotoUrl] = useState<string | null>(null);
  // Dispara refresh da lista em "Usuários do sistema" quando o admin salva o perfil
  const [systemUsersRefreshTrigger, setSystemUsersRefreshTrigger] = useState(0);

  // Usuário limitado: abas conforme permissões (full_access = todas as abas)
  function permissionsToTabs(perms: SystemUserPermissions | undefined): TabId[] {
    if (!perms) return ['home'];
    if (perms.full_access) return ['home', 'reception', 'agenda', 'patio', 'orcamentos', 'laboratorio'];
    const t: TabId[] = [];
    if (perms.access_home) t.push('home');
    if (perms.access_reception) t.push('reception');
    if (perms.access_agenda) t.push('agenda');
    if (perms.access_patio) {
      t.push('patio');
      t.push('orcamentos');
    }
    if (perms.access_laboratorio) t.push('laboratorio');
    return t.length ? t : ['home'];
  }
  const userAllowedTabs = authSession?.role === 'user' ? permissionsToTabs(authSession.permissions) : [];
  const hasFullAccess = authSession?.role === 'user' && !!authSession?.permissions?.full_access;
  const isLimitedSystemUser = authSession?.role === 'user' && !hasFullAccess;
  const [userTab, setUserTab] = useState<TabId>('home');
  const activeAppTab: TabId = isLimitedSystemUser ? userTab : currentTab;

  const patioBudgetsHub = usePatioBudgetsHubNotifier({
    enabled: Boolean(authSession),
    activeAppTab,
  });

  const handleOpenBudgetFromHub = useCallback(
    (serviceOrderId: string, budgetId: string) => {
      if (isLimitedSystemUser) {
        if (!userAllowedTabs.includes('patio')) return;
        setUserTab('patio');
      } else {
        setCurrentTab('patio');
      }
      setAssistantPatioOpenOrderId(serviceOrderId);
      setAssistantPatioOpenBudgetId(budgetId);
    },
    [isLimitedSystemUser, userAllowedTabs]
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
    if (isLimitedSystemUser) setUserTab('home');
    else setCurrentTab('home');
  }, [returnTabAfterReception, isLimitedSystemUser, userAllowedTabs]);

  const handleReceptionIntakeSuccess = useCallback(
    (orderType: 'vehicle' | 'module') => {
      setReturnTabAfterReception(null);
      const target: TabId = orderType === 'module' ? 'laboratorio' : 'patio';
      if (isLimitedSystemUser) {
        if (userAllowedTabs.includes(target)) setUserTab(target);
        else setUserTab('home');
      } else {
        setCurrentTab(target);
      }
    },
    [isLimitedSystemUser, userAllowedTabs]
  );

  /** Enquanto existir “volta para Pátio/Lab”, o modo veículo/módulo define qual aba ao usar voltar. */
  const syncReturnTabFromReceptionMode = useCallback((mode: ServiceOrderType) => {
    setReturnTabAfterReception((prev) => {
      if (prev === null) return null;
      return mode === 'module' ? 'laboratorio' : 'patio';
    });
  }, []);

  useEffect(() => {
    if (activeAppTab !== 'reception') {
      setReturnTabAfterReception(null);
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

  // Função chamada pelo Pátio / histórico da Recepção para preencher o cadastro com dados de uma OS
  const handleUseCustomerData = (data: Customer) => {
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
    }
    setCurrentTab(app);
  };

  const handleCreateRegistrationFromArea = useCallback(
    (mode: 'vehicle' | 'module') => {
      try {
        localStorage.setItem('app_reception_mode', mode);
      } catch (_) {}
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
    return (
      <ModalLayerProvider>
      <BackNavigationProvider>
      <div
        className="min-h-screen flex flex-col bg-light-page dark:bg-black relative overflow-hidden font-sans text-zinc-900 dark:text-white transition-colors duration-300"
        data-effects={effectsEnabled ? 'on' : 'off'}
      >
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-yellow/5 rounded-full blur-[120px] pointer-events-none z-0" />
        {userTab !== 'home' && (
          <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={handleOverlayCloseOrBack}
              className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/75 bg-white/80 text-zinc-700 shadow-[0_4px_18px_-8px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all hover:bg-white/95 active:scale-[0.97] dark:border-white/[0.12] dark:bg-zinc-900/75 dark:text-zinc-200 dark:hover:bg-zinc-900/90"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleOverlayCloseOrBack}
              className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/75 bg-white/80 text-zinc-700 shadow-[0_4px_18px_-8px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all hover:bg-white/95 active:scale-[0.97] dark:border-white/[0.12] dark:bg-zinc-900/75 dark:text-zinc-200 dark:hover:bg-zinc-900/90"
              aria-label="Fechar página"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <main className="relative z-10 flex-1 min-h-0 flex flex-col overflow-hidden">
          <KeepAliveTabPanel
            tabId="home"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 overflow-y-auto p-0"
          >
            <HomeView
              isTechnician={authSession.isTechnician ?? false}
              technicianName={authSession.displayName ?? 'Usuário'}
              allowedTabs={userAllowedTabs}
              onOpenApp={(app) => {
                if (app === 'reception') setReturnTabAfterReception(null);
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
            />
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="orcamentos"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 flex flex-col overflow-hidden"
          >
            <BudgetsHubView
              blurPlates={cinematographicMode}
              onOpenBudgetInPatio={handleOpenBudgetFromHub}
              onIngestNotifierBaseline={patioBudgetsHub.ingestBaselineFromItems}
              onClearHubBadge={patioBudgetsHub.clearBadge}
            />
          </KeepAliveTabPanel>
          <KeepAliveTabPanel
            tabId="reception"
            activeTab={userTab}
            visitedTabs={visitedUserTabs}
            className="flex-1 min-h-0 w-full overflow-y-auto p-0"
          >
            <ReceptionView
              initialData={prefillData}
              onDataLoaded={() => setPrefillData(null)}
              forcedMode={receptionForcedMode}
              blurPlates={cinematographicMode}
              onUseCustomerData={handleUseCustomerData}
              onIntakeSuccess={handleReceptionIntakeSuccess}
              onReceptionModeChangeForBack={syncReturnTabFromReceptionMode}
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
              openServiceOrderId={assistantPatioOpenOrderId}
              openServiceOrderSection={assistantPatioOpenBudgetId ? 'budgets' : null}
              openBudgetIdAfterLoad={assistantPatioOpenBudgetId}
              onOpenServiceOrderHandled={() => {
                setAssistantPatioOpenOrderId(null);
                setAssistantPatioOpenBudgetId(null);
              }}
              openHistoryRequested={assistantPatioOpenHistoryTrigger}
              actorOptions={{ actor: 'technician', actorTechnicianSlug: authSession.userId, actorTechnicianName: authSession.displayName ?? authSession.username }}
              patioPermissions={patioPerms}
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
              openServiceOrderId={null}
              openServiceOrderSection={null}
              onOpenServiceOrderHandled={() => {}}
              openHistoryRequested={assistantPatioOpenHistoryTrigger}
              actorOptions={{ actor: 'technician', actorTechnicianSlug: authSession.userId, actorTechnicianName: authSession.displayName ?? authSession.username }}
              patioPermissions={patioPerms}
            />
          </KeepAliveTabPanel>
        </main>
        <div className="sr-only" aria-hidden="true">
          <NotificationCenter
            theme={theme}
            onNewCommentNotification={handleNewCommentNotification}
            onNewZayaAlert={handleNewZayaAlert}
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
        <AssistantChat
          theme={theme}
          allowedTabs={userAllowedTabs}
          onNavigateTab={setUserTab}
          onOpenSettings={() => setIsSettingsOpen(true)}
          serviceOrderActor={{
            actor: 'technician',
            actorTechnicianSlug: authSession.userId,
            actorTechnicianName: authSession.displayName ?? authSession.username ?? '',
          }}
          assistantAuthorDisplayName={authSession.displayName ?? authSession.username ?? 'Usuário'}
          assistantCommentActor="technician"
          currentTechnicianUserId={authSession.userId}
          relaySessionRole={
            authSession.isTechnician && authSession.userId
              ? 'technician'
              : authSession.userId
                ? 'management'
                : 'none'
          }
          onOpenPatioVehicle={(id) => {
            setUserTab('patio');
            setAssistantPatioOpenOrderId(id);
          }}
          onOpenPatioHistory={(target) => {
            setUserTab(target);
            setAssistantPatioOpenHistoryTrigger((n) => n + 1);
          }}
          pendingZayaNotification={pendingZayaNotification}
          onPendingZayaConsumed={clearPendingZayaNotification}
        />
        <DesktopEscapeCloseBridge activeAppTab={userTab} onCloseOverlayPage={handleOverlayCloseOrBack} />
      </div>
      </BackNavigationProvider>
      </ModalLayerProvider>
    );
  }

  return (
    <ModalLayerProvider>
    <BackNavigationProvider>
    <div
      className="min-h-screen flex flex-col bg-light-page dark:bg-black relative overflow-hidden font-sans text-zinc-900 dark:text-white transition-colors duration-300"
      data-effects={effectsEnabled ? 'on' : 'off'}
    >
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-yellow/5 rounded-full blur-[120px] pointer-events-none z-0" />
      {currentTab !== 'home' && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={handleOverlayCloseOrBack}
            className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/75 bg-white/80 text-zinc-700 shadow-[0_4px_18px_-8px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all hover:bg-white/95 active:scale-[0.97] dark:border-white/[0.12] dark:bg-zinc-900/75 dark:text-zinc-200 dark:hover:bg-zinc-900/90"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={handleOverlayCloseOrBack}
            className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/75 bg-white/80 text-zinc-700 shadow-[0_4px_18px_-8px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all hover:bg-white/95 active:scale-[0.97] dark:border-white/[0.12] dark:bg-zinc-900/75 dark:text-zinc-200 dark:hover:bg-zinc-900/90"
            aria-label="Fechar página"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <main className="relative z-10 flex-1 min-h-0 flex flex-col overflow-hidden">
        <KeepAliveTabPanel
          tabId="home"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 overflow-y-auto p-0"
        >
          <HomeView
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
          />
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="orcamentos"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          <BudgetsHubView
            blurPlates={cinematographicMode}
            onOpenBudgetInPatio={handleOpenBudgetFromHub}
            onIngestNotifierBaseline={patioBudgetsHub.ingestBaselineFromItems}
            onClearHubBadge={patioBudgetsHub.clearBadge}
          />
        </KeepAliveTabPanel>

        <KeepAliveTabPanel
          tabId="reception"
          activeTab={currentTab}
          visitedTabs={visitedTabs}
          className="flex-1 min-h-0 w-full overflow-y-auto p-0"
        >
          <ReceptionView
            initialData={prefillData}
            onDataLoaded={() => setPrefillData(null)}
            forcedMode={receptionForcedMode}
            blurPlates={cinematographicMode}
            onUseCustomerData={handleUseCustomerData}
            onIntakeSuccess={handleReceptionIntakeSuccess}
            onReceptionModeChangeForBack={syncReturnTabFromReceptionMode}
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
            openServiceOrderId={assistantPatioOpenOrderId}
            openServiceOrderSection={assistantPatioOpenBudgetId ? 'budgets' : null}
            openBudgetIdAfterLoad={assistantPatioOpenBudgetId}
            onOpenServiceOrderHandled={() => {
              setAssistantPatioOpenOrderId(null);
              setAssistantPatioOpenBudgetId(null);
            }}
            openHistoryRequested={assistantPatioOpenHistoryTrigger}
            actorOptions={authSession?.role === 'admin' ? { actor: 'admin' } : { actor: 'technician', actorTechnicianSlug: authSession?.userId, actorTechnicianName: authSession?.displayName ?? authSession?.username }}
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
            openServiceOrderId={null}
            openServiceOrderSection={null}
            onOpenServiceOrderHandled={() => {}}
            openHistoryRequested={assistantPatioOpenHistoryTrigger}
            actorOptions={authSession?.role === 'admin' ? { actor: 'admin' } : { actor: 'technician', actorTechnicianSlug: authSession?.userId, actorTechnicianName: authSession?.displayName ?? authSession?.username }}
          />
        </KeepAliveTabPanel>
      </main>

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

      {/* Central de notificações: admin vê notificações do admin; técnicos veem as deles (target_slug = userId). Só ativa modo técnico quando userId existe para o pop-up de comentários aparecer. */}
      <div className="sr-only" aria-hidden="true">
        <NotificationCenter
          theme={theme}
          onNewCommentNotification={handleNewCommentNotification}
          onNewZayaAlert={handleNewZayaAlert}
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
      <AssistantChat
        theme={theme}
        allowedTabs={['home', 'reception', 'agenda', 'patio', 'orcamentos', 'laboratorio']}
        onNavigateTab={setCurrentTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        serviceOrderActor={
          authSession?.role === 'admin'
            ? { actor: 'admin' }
            : {
                actor: 'technician',
                actorTechnicianSlug: authSession?.userId,
                actorTechnicianName: authSession?.displayName ?? authSession?.username ?? '',
              }
        }
        assistantAuthorDisplayName={
          authSession?.role === 'admin'
            ? adminDisplayName
            : (authSession?.displayName ?? authSession?.username ?? 'Usuário')
        }
        assistantCommentActor={authSession?.role === 'admin' ? 'admin' : 'technician'}
        currentTechnicianUserId={authSession?.role === 'user' ? authSession.userId : undefined}
        relaySessionRole={
          authSession?.role === 'admin'
            ? 'management'
            : authSession?.role === 'user' &&
                authSession.userId &&
                hasFullAccess &&
                authSession.isTechnician
              ? 'both'
              : authSession?.role === 'user' && hasFullAccess
                ? 'management'
                : authSession?.role === 'user' &&
                    authSession.isTechnician &&
                    authSession.userId
                  ? 'technician'
                  : 'none'
        }
        onOpenPatioVehicle={(id, opts) => {
          setCurrentTab('patio');
          setAssistantPatioOpenOrderId(id);
          setAssistantPatioOpenBudgetId(opts?.budgetId ?? null);
        }}
        onOpenPatioHistory={(target) => {
          setCurrentTab(target);
          setAssistantPatioOpenHistoryTrigger((n) => n + 1);
        }}
        pendingZayaNotification={pendingZayaNotification}
        onPendingZayaConsumed={clearPendingZayaNotification}
      />
      <DesktopEscapeCloseBridge activeAppTab={currentTab} onCloseOverlayPage={handleOverlayCloseOrBack} />
    </div>
    </BackNavigationProvider>
    </ModalLayerProvider>
  );
}