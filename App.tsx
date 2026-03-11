import React, { useState, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import { Customer, Appointment } from './types';
import { SettingsModal } from './components/SettingsModal';
import { TabBar, type TabId } from './components/TabBar';
import { NotificationCenter } from './components/NotificationCenter';
import { CommentPopUp } from './components/CommentPopUp';
import { playNotificationSound } from './utils/notificationSound';
import type { Notification } from './services/apiService';
import { ReceptionView } from './components/views/ReceptionView';
import { PatioView } from './components/views/PatioView';
import { AgendaView } from './components/views/AgendaView';
import { HomeView, type HomeAppId } from './components/views/HomeView';
import { LoginView, getStoredAuth, setStoredAuth, clearStoredAuth } from './components/views/LoginView';
import { useOrientation } from './components/views/useOrientation';
import type { AuthSession, SystemUserPermissions } from './services/apiService';
import { getWorkshopSettings } from './services/apiService';

export default function App() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => {
    try {
      return getStoredAuth();
    } catch {
      return null;
    }
  });
  const [currentTab, setCurrentTab] = useState<TabId>('home');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [commentPopUpNotification, setCommentPopUpNotification] = useState<Notification | null>(null);

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

  // Appointments State
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Estado para transferir dados do Histórico (Pátio) para a Recepção
  const [prefillData, setPrefillData] = useState<Customer | null>(null);

  // Usuário limitado: abas conforme permissões
  function permissionsToTabs(perms: SystemUserPermissions | undefined): TabId[] {
    if (!perms) return ['home'];
    const t: TabId[] = [];
    if (perms.access_home) t.push('home');
    if (perms.access_reception) t.push('reception');
    if (perms.access_agenda) t.push('agenda');
    if (perms.access_patio) t.push('patio');
    if (perms.access_laboratorio) t.push('laboratorio');
    return t.length ? t : ['home'];
  }
  const userAllowedTabs = authSession?.role === 'user' ? permissionsToTabs(authSession.permissions) : [];
  const [userTab, setUserTab] = useState<TabId>('home');

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

  // Função chamada pelo Pátio para preencher a Recepção com dados de um veículo
  const handleUseCustomerData = (data: Customer) => {
    setPrefillData(data);
    setCurrentTab('reception');
  };

  const handleHomeOpenApp = (app: HomeAppId) => {
    if (app === 'settings') {
      setIsSettingsOpen(true);
      return;
    }
    setCurrentTab(app);
  };

  const handleLogout = () => {
    try {
      clearStoredAuth();
    } catch (_) {}
    setAuthSession(null);
  };

  // Quando for usuário limitado, garantir que a aba atual está na lista permitida
  useEffect(() => {
    if (authSession?.role !== 'user' || userAllowedTabs.length === 0) return;
    setUserTab((current) => (userAllowedTabs.includes(current) ? current : userAllowedTabs[0]));
  }, [authSession?.role, userAllowedTabs.join(',')]);

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

  // Usuário limitado (logins criados pelo admin): abas e ações conforme permissões
  if (authSession.role === 'user') {
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
    return (
      <div
        className="min-h-screen flex flex-col bg-light-page dark:bg-black relative overflow-hidden font-sans text-zinc-900 dark:text-white transition-colors duration-300"
        data-effects={effectsEnabled ? 'on' : 'off'}
      >
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-yellow/5 rounded-full blur-[120px] pointer-events-none z-0" />
        <header className="relative z-20 flex items-center justify-between px-4 py-3 bg-light-card/95 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-light-border dark:border-white/10">
          {userTab === 'home' ? (
            <>
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Logado como <strong className="text-zinc-900 dark:text-white">{authSession.displayName ?? 'Usuário'}</strong>
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/80 dark:hover:bg-white/10 transition-colors text-sm font-medium"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </>
          ) : (
            <span />
          )}
        </header>
        <main className={`flex-1 overflow-y-auto z-10 ${userTab === 'home' ? 'p-0' : 'p-4 md:p-8 pt-8'}`}>
          {userTab === 'home' && (
            <HomeView
              isTechnician
              technicianName={authSession.displayName ?? 'Usuário'}
              allowedTabs={userAllowedTabs}
              onOpenApp={(app) => setUserTab(app as TabId)}
              onLogout={handleLogout}
              isSystemUser
              systemUserUsername={authSession.username ?? ''}
              systemUserDisplayName={authSession.displayName ?? ''}
              systemUserPhotoUrl={authSession.photoUrl ?? null}
              onSystemUserProfileUpdated={(data) => {
                if (authSession?.role !== 'user') return;
                const next = {
                  ...authSession,
                  ...(data.displayName !== undefined && { displayName: data.displayName }),
                  ...(data.photoUrl !== undefined && { photoUrl: data.photoUrl }),
                };
                setAuthSession(next);
                try {
                  setStoredAuth(next);
                } catch (_) {}
              }}
            />
          )}
          {userTab === 'reception' && (
            <ReceptionView
              initialData={prefillData}
              onDataLoaded={() => setPrefillData(null)}
              blurPlates={cinematographicMode}
            />
          )}
          {userTab === 'agenda' && (
            <AgendaView
              appointments={appointments}
              setAppointments={setAppointments}
              blurPlates={cinematographicMode}
            />
          )}
          {userTab === 'patio' && (
            <PatioView
              onUseCustomerData={handleUseCustomerData}
              effectsEnabled={effectsEnabled}
              commentAuthorName={authSession.displayName ?? 'Usuário'}
              blurPlates={cinematographicMode}
              openServiceOrderId={null}
              openServiceOrderSection={null}
              onOpenServiceOrderHandled={() => {}}
              actorOptions={{ actor: 'admin' }}
              patioPermissions={patioPerms}
            />
          )}
          {userTab === 'laboratorio' && (
            <PatioView
              orderType="module"
              onUseCustomerData={() => {}}
              effectsEnabled={effectsEnabled}
              commentAuthorName={authSession.displayName ?? 'Usuário'}
              blurPlates={cinematographicMode}
              openServiceOrderId={null}
              openServiceOrderSection={null}
              onOpenServiceOrderHandled={() => {}}
              actorOptions={{ actor: 'admin' }}
              patioPermissions={patioPerms}
            />
          )}
        </main>
        <TabBar
          currentTab={userTab}
          onTabChange={setUserTab}
          allowedTabs={userAllowedTabs}
        />
        {commentPopUpNotification && (
          <CommentPopUp
            theme={theme}
            notification={commentPopUpNotification}
            replyAuthorName={authSession.displayName ?? 'Rei do ABS'}
            blurPlates={cinematographicMode}
            onClose={() => setCommentPopUpNotification(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col bg-light-page dark:bg-black relative overflow-hidden font-sans text-zinc-900 dark:text-white transition-colors duration-300"
      data-effects={effectsEnabled ? 'on' : 'off'}
    >
      {/* Background Ambience - Global */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-yellow/5 rounded-full blur-[120px] pointer-events-none z-0" />

      {/* Main Content Area */}
      <main
        className={`flex-1 overflow-y-auto z-10 ${currentTab === 'home' ? 'p-0 pt-4' : 'p-4 md:p-8 pt-8'}`}
      >
        {currentTab === 'home' && (
          <HomeView onOpenApp={handleHomeOpenApp} onLogout={handleLogout} />
        )}

        {currentTab === 'reception' && (
          <ReceptionView
            initialData={prefillData}
            onDataLoaded={() => setPrefillData(null)}
            blurPlates={cinematographicMode}
          />
        )}

        {currentTab === 'agenda' && (
          <AgendaView
            appointments={appointments}
            setAppointments={setAppointments}
            blurPlates={cinematographicMode}
          />
        )}
        
        {currentTab === 'patio' && (
          <PatioView
            onUseCustomerData={handleUseCustomerData}
            effectsEnabled={effectsEnabled}
            commentAuthorName={authSession?.role === 'admin' ? 'Rei do ABS' : (authSession?.technicianName ?? 'Rei do ABS')}
            blurPlates={cinematographicMode}
            openServiceOrderId={null}
            openServiceOrderSection={null}
            onOpenServiceOrderHandled={() => {}}
            actorOptions={authSession?.role === 'admin' ? { actor: 'admin' } : { actor: 'technician', actorTechnicianSlug: authSession?.technicianSlug, actorTechnicianName: authSession?.technicianName }}
          />
        )}

        {currentTab === 'laboratorio' && (
          <PatioView
            orderType="module"
            onUseCustomerData={() => {}}
            effectsEnabled={effectsEnabled}
            commentAuthorName={authSession?.role === 'admin' ? 'Rei do ABS' : (authSession?.technicianName ?? 'Rei do ABS')}
            blurPlates={cinematographicMode}
            openServiceOrderId={null}
            openServiceOrderSection={null}
            onOpenServiceOrderHandled={() => {}}
            actorOptions={authSession?.role === 'admin' ? { actor: 'admin' } : { actor: 'technician', actorTechnicianSlug: authSession?.technicianSlug, actorTechnicianName: authSession?.technicianName }}
          />
        )}

      </main>

      {/* Navigation - Oculta na home */}
      {currentTab !== 'home' && (
        <TabBar currentTab={currentTab} onTabChange={setCurrentTab} />
      )}

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
        showPatioAccess={authSession?.role === 'admin'}
      />

      {/* Central de notificações oculta: mantém o polling e dispara o pop-up de comentário */}
      <div className="sr-only" aria-hidden="true">
        <NotificationCenter
          theme={theme}
          onNewCommentNotification={handleNewCommentNotification}
        />
      </div>
      {commentPopUpNotification && (
        <CommentPopUp
          theme={theme}
          notification={commentPopUpNotification}
          replyAuthorName={authSession?.role === 'admin' ? 'Rei do ABS' : (authSession?.technicianName ?? 'Rei do ABS')}
          blurPlates={cinematographicMode}
          onClose={() => setCommentPopUpNotification(null)}
        />
      )}
    </div>
  );
}