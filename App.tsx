import React, { useState, useEffect, useRef } from 'react';
import { LogOut } from 'lucide-react';
import { TrelloConfig, Customer, Appointment } from './types';
import { SettingsModal } from './components/SettingsModal';
import { TabBar, type TabId } from './components/TabBar';
import { NotificationCenter } from './components/NotificationCenter';
import { CommentPopUp } from './components/CommentPopUp';
import { playNotificationSound } from './utils/notificationSound';
import type { Notification } from './services/apiService';
import { ReceptionView } from './components/views/ReceptionView';
import { PatioView } from './components/views/PatioView';
import { AgendaView } from './components/views/AgendaView';
import { ExternalPatioView } from './components/views/ExternalPatioView';
import { HomeView, type HomeAppId } from './components/views/HomeView';
import { LoginView, getStoredAuth, setStoredAuth, clearStoredAuth } from './components/views/LoginView';
import { useOrientation } from './components/views/useOrientation';
import type { AuthSession } from './services/apiService';
import { getWorkshopSettings, getWorkshopTechnicians } from './services/apiService';

// --- Trello: use variáveis de ambiente (arquivo .env) — nunca coloque token no código ---
const getTrelloEnv = () => ({
  apiKey: import.meta.env.VITE_TRELLO_API_KEY ?? '',
  token: import.meta.env.VITE_TRELLO_TOKEN ?? '',
  listId: import.meta.env.VITE_TRELLO_LIST_ID ?? '',
  agendamentoListId: import.meta.env.VITE_TRELLO_AGENDAMENTO_LIST_ID ?? '',
});

export default function App() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => getStoredAuth());
  const [currentTab, setCurrentTab] = useState<TabId>('home');

  const trelloEnv = getTrelloEnv();
  const [trelloConfig, setTrelloConfig] = useState<TrelloConfig>({
    apiKey: trelloEnv.apiKey,
    token: trelloEnv.token,
    listId: trelloEnv.listId,
    agendamentoListId: trelloEnv.agendamentoListId || undefined,
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [commentPopUpNotification, setCommentPopUpNotification] = useState<Notification | null>(null);
  const [notificationNavigate, setNotificationNavigate] = useState<{ serviceOrderId: string; section: 'comments' | 'budgets' | 'description' | null } | null>(null);
  const [technicianNotificationNavigate, setTechnicianNotificationNavigate] = useState<{ serviceOrderId: string; section: 'comments' | 'budgets' | 'description' | null } | null>(null);
  const [adminHeaderVisible, setAdminHeaderVisible] = useState(false);
  const adminHeaderRef = useRef<HTMLDivElement>(null);
  const adminHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Efeitos do app (animações, 3D nos cards, etc.) — chave liga/desliga
  const [effectsEnabled, setEffectsEnabled] = useState(true);

  // Device Orientation
  const orientation = useOrientation();

  // Appointments State
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Estado para transferir dados do Histórico (Pátio) para a Recepção
  const [prefillData, setPrefillData] = useState<Customer | null>(null);

  // Modo técnico: abas permitidas (carregadas das configurações)
  const [technicianAllowedTabs, setTechnicianAllowedTabs] = useState<TabId[]>(['patio']);
  const [technicianTab, setTechnicianTab] = useState<TabId>('patio');
  
  // Load appointments from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('rei_do_abs_agenda');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const withDates = parsed.map((app: any) => ({
          ...app,
          date: new Date(app.date)
        }));
        setAppointments(withDates);
      } catch (e) {
        console.error("Failed to load appointments", e);
      }
    }
  }, []);

  // Save appointments to localStorage
  useEffect(() => {
    localStorage.setItem('rei_do_abs_agenda', JSON.stringify(appointments));
  }, [appointments]);

  // Load config and theme on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('trello_config');
    const savedTheme = localStorage.getItem('app_theme') as 'dark' | 'light';
    
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      setTrelloConfig(prev => ({ 
        ...prev, 
        ...parsed,
        // Garante que o ID fixo de agendamento seja usado se não houver um salvo
        agendamentoListId: parsed.agendamentoListId || trelloEnv.agendamentoListId
      }));
    } else if (trelloEnv.apiKey && trelloEnv.token && trelloEnv.listId) {
      setTrelloConfig(prev => ({
        ...prev,
        apiKey: trelloEnv.apiKey,
        token: trelloEnv.token,
        listId: trelloEnv.listId,
        agendamentoListId: trelloEnv.agendamentoListId || undefined,
      }));
    } else {
      setIsSettingsOpen(true);
    }

    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      setTheme('light');
    }

    const savedEffects = localStorage.getItem('app_effects_enabled');
    if (savedEffects !== null) {
      setEffectsEnabled(savedEffects === 'true');
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

  const handleSaveSettings = (newConfig: TrelloConfig) => {
    setTrelloConfig(newConfig);
    localStorage.setItem('trello_config', JSON.stringify(newConfig));
  };

  // Função chamada pelo Pátio (ou Recepção) para usar dados de um card arquivado
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

  // Completar sessão do técnico se tiver slug mas não id (ex.: login antigo antes de retornar id)
  useEffect(() => {
    if (authSession?.role !== 'patio' || authSession.technicianId || !authSession.technicianSlug) return;
    getWorkshopTechnicians()
      .then((list) => {
        const tech = list.find((t) => t.slug === authSession.technicianSlug);
        if (tech) {
          const next: AuthSession = { ...authSession, technicianId: tech.id };
          setStoredAuth(next);
          setAuthSession(next);
        }
      })
      .catch(() => {});
  }, [authSession?.role, authSession?.technicianId, authSession?.technicianSlug]);

  // Carregar configuração de acesso dos técnicos quando logado como técnico (home + abas permitidas)
  useEffect(() => {
    if (authSession?.role !== 'patio') return;
    getWorkshopSettings()
      .then((s) => {
        const tabs: TabId[] = ['home'];
        if (s.technicianAccessReception) tabs.push('reception');
        if (s.technicianAccessAgenda) tabs.push('agenda');
        if (s.technicianAccessPatio !== false) tabs.push('patio');
        setTechnicianAllowedTabs(tabs);
        setTechnicianTab((current) => (tabs.includes(current) ? current : 'home'));
      })
      .catch(() => {
        setTechnicianAllowedTabs(['home', 'patio']);
        setTechnicianTab('home');
      });
  }, [authSession?.role]);

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

  const handleNewCommentNotification = (n: Notification) => {
    playNotificationSound();
    setCommentPopUpNotification(n);
  };

  const handleNotificationClick = (n: Notification) => {
    const id = n.payload?.service_order_id;
    if (!id) return;
    let section: 'comments' | 'budgets' | 'description' | null = null;
    if (n.type === 'comment') section = 'comments';
    else if (n.type === 'budget_created' || n.type === 'budget_edited') section = 'budgets';
    else if (n.type === 'complaint_edited') section = 'description';
    setNotificationNavigate({ serviceOrderId: id, section });
    setCurrentTab('patio');
  };

  const handleTechnicianNotificationClick = (n: Notification) => {
    const id = n.payload?.service_order_id;
    if (!id) return;
    let section: 'comments' | 'budgets' | 'description' | null = null;
    if (n.type === 'comment') section = 'comments';
    else if (n.type === 'budget_created' || n.type === 'budget_edited') section = 'budgets';
    else if (n.type === 'complaint_edited') section = 'description';
    setTechnicianNotificationNavigate({ serviceOrderId: id, section });
    setTechnicianTab('patio');
  };

  // Mostrar barra ao passar o mouse perto do topo (desktop) ou ao deslizar de cima para baixo (touch)
  useEffect(() => {
    const HOVER_ZONE = 56;
    const SWIPE_THRESHOLD = 40;
    const HIDE_DELAY = 400;

    const clearHideTimeout = () => {
      if (adminHideTimeoutRef.current) {
        clearTimeout(adminHideTimeoutRef.current);
        adminHideTimeoutRef.current = null;
      }
    };

    const scheduleHide = () => {
      clearHideTimeout();
      adminHideTimeoutRef.current = setTimeout(() => setAdminHeaderVisible(false), HIDE_DELAY);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY <= HOVER_ZONE) {
        clearHideTimeout();
        setAdminHeaderVisible(true);
      } else {
        const header = adminHeaderRef.current;
        const inHeader = header && e.target instanceof Node && header.contains(e.target as Node);
        if (!inHeader) scheduleHide();
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      if (y < HOVER_ZONE) touchStartYRef.current = y;
      else touchStartYRef.current = null;
      if (y > 80 && adminHeaderRef.current && e.target instanceof Node && !adminHeaderRef.current.contains(e.target as Node)) {
        scheduleHide();
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartYRef.current === null) return;
      const y = e.touches[0]?.clientY ?? 0;
      if (y - touchStartYRef.current > SWIPE_THRESHOLD) {
        clearHideTimeout();
        setAdminHeaderVisible(true);
        touchStartYRef.current = null;
      }
    };

    const handleTouchEnd = () => {
      touchStartYRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      clearHideTimeout();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  // Modo técnico: abas configuráveis (Recepção, Agenda, Pátio) + botão Sair
  if (authSession.role === 'patio') {
    return (
      <div
        className="min-h-screen flex flex-col bg-zinc-50 dark:bg-black relative overflow-hidden font-sans text-zinc-900 dark:text-white transition-colors duration-300"
        data-effects={effectsEnabled ? 'on' : 'off'}
      >
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-yellow/5 rounded-full blur-[120px] pointer-events-none z-0" />
        <header className="relative z-20 flex items-center justify-between px-4 py-3 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-200/60 dark:border-white/10">
          {technicianTab === 'home' ? (
            <>
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Logado como <strong className="text-zinc-900 dark:text-white">{authSession.technicianName ?? 'Pátio'}</strong>
              </span>
              <div className="flex items-center gap-2">
                {authSession.technicianSlug && (
                  <NotificationCenter
                    theme={theme}
                    forTechnician
                    technicianSlug={authSession.technicianSlug}
                    onNewCommentNotification={handleNewCommentNotification}
                    onNotificationClick={handleTechnicianNotificationClick}
                  />
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/80 dark:hover:bg-white/10 transition-colors text-sm font-medium"
                >
                  <LogOut className="w-4 h-4" />
                  Sair
                </button>
              </div>
            </>
          ) : (
            <>
              <span />
              {authSession.technicianSlug && (
                <NotificationCenter
                  theme={theme}
                  forTechnician
                  technicianSlug={authSession.technicianSlug}
                  onNewCommentNotification={handleNewCommentNotification}
                  onNotificationClick={handleTechnicianNotificationClick}
                />
              )}
            </>
          )}
        </header>
        <main className={`flex-1 overflow-y-auto z-10 ${technicianTab === 'home' ? 'p-0' : 'p-4 md:p-8 pt-8'}`}>
          {technicianTab === 'home' && (
            <HomeView
              isTechnician
              technicianId={authSession.technicianId}
              technicianName={authSession.technicianName ?? 'Pátio'}
              technicianSlug={authSession.technicianSlug}
              allowedTabs={technicianAllowedTabs}
              onOpenApp={(app) => setTechnicianTab(app)}
              onLogout={handleLogout}
              onProfileUpdated={(name) => {
                setAuthSession((prev) => {
                  if (!prev || prev.role !== 'patio') return prev;
                  const next = { ...prev, technicianName: name };
                  setStoredAuth(next);
                  return next;
                });
              }}
            />
          )}
          {technicianTab === 'reception' && (
            <ReceptionView
              trelloConfig={trelloConfig}
              initialData={prefillData}
              onDataLoaded={() => setPrefillData(null)}
              onAppointmentConverted={(cardId) => {
                setAppointments((prev) => prev.filter((app) => app.trelloCardId !== cardId));
              }}
            />
          )}
          {technicianTab === 'agenda' && (
            <AgendaView
              trelloConfig={trelloConfig}
              onChegouAoPatio={handleUseCustomerData}
              appointments={appointments}
              setAppointments={setAppointments}
            />
          )}
          {technicianTab === 'patio' && (
            <PatioView
              onUseCustomerData={() => {}}
              effectsEnabled={effectsEnabled}
              commentAuthorName={authSession.technicianName ?? 'Pátio'}
              openServiceOrderId={technicianNotificationNavigate?.serviceOrderId ?? null}
              openServiceOrderSection={technicianNotificationNavigate?.section ?? null}
              onOpenServiceOrderHandled={() => setTechnicianNotificationNavigate(null)}
            />
          )}
        </main>
        <TabBar
          currentTab={technicianTab}
          onTabChange={setTechnicianTab}
          allowedTabs={technicianAllowedTabs}
        />
        {commentPopUpNotification && (
          <CommentPopUp
            theme={theme}
            notification={commentPopUpNotification}
            onClose={() => setCommentPopUpNotification(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col bg-zinc-50 dark:bg-black relative overflow-hidden font-sans text-zinc-900 dark:text-white transition-colors duration-300"
      data-effects={effectsEnabled ? 'on' : 'off'}
    >
      {/* Barra superior admin: aparece ao passar o mouse no topo ou deslizar de cima para baixo (touch) */}
      <header
        ref={adminHeaderRef}
        className={`fixed top-0 left-0 right-0 z-30 flex items-center justify-end px-4 pt-[env(safe-area-inset-top)] pb-2 pt-4 h-14 safe-area-inset transition-transform duration-300 ease-out ${
          adminHeaderVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="absolute inset-0 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl border-b border-zinc-200/40 dark:border-white/5 pointer-events-none" />
        <div className="relative flex items-center gap-2">
          <NotificationCenter
            theme={theme}
            onNewCommentNotification={handleNewCommentNotification}
            onNotificationClick={handleNotificationClick}
          />
        </div>
      </header>

      {/* Background Ambience - Global */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-yellow/5 rounded-full blur-[120px] pointer-events-none z-0" />

      {/* Main Content Area */}
      <main
        className={`flex-1 overflow-y-auto z-10 pt-14 ${currentTab === 'home' ? 'p-0 pt-14' : 'p-4 md:p-8 pt-8'}`}
      >
        {currentTab === 'home' && (
          <HomeView onOpenApp={handleHomeOpenApp} onLogout={handleLogout} />
        )}

        {currentTab === 'reception' && (
          <ReceptionView 
            trelloConfig={trelloConfig} 
            initialData={prefillData}
            onDataLoaded={() => setPrefillData(null)}
            onAppointmentConverted={(cardId) => {
              setAppointments(prev => prev.filter(app => app.trelloCardId !== cardId));
            }}
          />
        )}

        {currentTab === 'agenda' && (
          <AgendaView 
            trelloConfig={trelloConfig}
            onChegouAoPatio={handleUseCustomerData}
            appointments={appointments}
            setAppointments={setAppointments}
          />
        )}
        
        {currentTab === 'patio' && (
          <PatioView
            onUseCustomerData={handleUseCustomerData}
            effectsEnabled={effectsEnabled}
            commentAuthorName={authSession?.role === 'admin' ? 'Rei do ABS' : (authSession?.technicianName ?? 'Rei do ABS')}
            openServiceOrderId={notificationNavigate?.serviceOrderId ?? null}
            openServiceOrderSection={notificationNavigate?.section ?? null}
            onOpenServiceOrderHandled={() => setNotificationNavigate(null)}
          />
        )}

        {/* External View is rendered conditionally, overlaying everything if active via its own z-index, 
            but logically we can just render it here. */}
        {currentTab === 'external-patio' && (
          <ExternalPatioView onClose={() => setCurrentTab('patio')} />
        )}
      </main>

      {/* Navigation - Oculta na home e na visão externa (tela cheia) */}
      {currentTab !== 'home' && currentTab !== 'external-patio' && (
        <TabBar currentTab={currentTab} onTabChange={setCurrentTab} />
      )}

      {/* Global Modals */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        config={trelloConfig}
        onSave={handleSaveSettings}
        theme={theme}
        onThemeChange={setTheme}
        effectsEnabled={effectsEnabled}
        onEffectsChange={setEffectsEnabled}
        orientation={orientation}
        showPatioAccess={authSession?.role === 'admin'}
      />

      {/* Pop-up de comentário (estilo WhatsApp) — canto inferior esquerdo */}
      {commentPopUpNotification && (
        <CommentPopUp
          theme={theme}
          notification={commentPopUpNotification}
          onClose={() => setCommentPopUpNotification(null)}
        />
      )}
    </div>
  );
}