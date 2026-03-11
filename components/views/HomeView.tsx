import React, { useState } from 'react';
import {
  ClipboardList,
  Calendar,
  Settings,
  ChevronRight,
  Wrench,
  Lock,
  LogOut,
  User,
  FlaskConical,
} from 'lucide-react';
import { PatioCarIcon } from '../ui/PatioCarIcon';
import { WorkshopServicesModal } from '../WorkshopServicesModal';
import { ChangePasswordsModal } from '../ChangePasswordsModal';
import { TechnicianProfileModal } from '../TechnicianProfileModal';
import { AdminProfileModal } from '../AdminProfileModal';
import { SystemUsersModal } from '../SystemUsersModal';
import { UserProfileModal } from '../UserProfileModal';

export type HomeAppId = 'reception' | 'agenda' | 'patio' | 'laboratorio' | 'settings';

interface HomeViewProps {
  onOpenApp: (app: HomeAppId) => void;
  onLogout?: () => void;
  /** Modo mecânico: esconde Pátio (lista), Serviços, Técnicos, Acesso técnicos, Alterar senhas; mostra só Acesso rápido + Meu perfil + Sair */
  isTechnician?: boolean;
  technicianId?: string;
  technicianName?: string;
  technicianSlug?: string;
  /** Abas que o técnico pode acessar (reception, agenda, patio) para montar os botões de acesso rápido */
  allowedTabs?: string[];
  /** Após salvar o perfil do técnico (nome atualizado) */
  onProfileUpdated?: (newName: string) => void;
  /** Usuário do sistema (perfil criado pelo admin): mostra Configurações de perfil na página inicial */
  isSystemUser?: boolean;
  systemUserUsername?: string;
  systemUserDisplayName?: string;
  systemUserPhotoUrl?: string | null;
  systemUserAccentColor?: string | null;
  systemUserProfileToken?: string;
  systemUserIsTechnician?: boolean;
  /** Após salvar perfil do usuário do sistema (nome/foto/cor) */
  onSystemUserProfileUpdated?: (data: { displayName?: string; photoUrl?: string | null; accentColor?: string | null }) => void;
}

/** Módulos operacionais: atendimento e fluxo de serviço */
const OPERATIONAL_APPS: { id: HomeAppId; label: string; description: string; icon: React.ReactNode; accent: string; bg: string }[] = [
  { id: 'reception', label: 'Recepção', description: 'Cadastro de clientes e veículos', icon: <ClipboardList className="w-7 h-7" strokeWidth={2} />, accent: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/20' },
  { id: 'agenda', label: 'Agenda', description: 'Agendamentos e compromissos', icon: <Calendar className="w-7 h-7" strokeWidth={2} />, accent: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10 dark:bg-blue-500/20 border-blue-500/20' },
  { id: 'patio', label: 'Pátio', description: 'Veículos em atendimento', icon: <PatioCarIcon className="w-7 h-7" strokeWidth={3} />, accent: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10 dark:bg-emerald-500/20 border-emerald-500/20' },
  { id: 'laboratorio', label: 'Laboratório', description: 'Módulos e eletrônica', icon: <FlaskConical className="w-7 h-7" strokeWidth={2} />, accent: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/10 dark:bg-violet-500/20 border-violet-500/20' },
];

const QUICK_APPS: { id: HomeAppId; label: string; icon: React.ReactNode; accent: string }[] = [
  { id: 'reception', label: 'Recepção', icon: <ClipboardList className="w-6 h-6" strokeWidth={2} />, accent: 'text-amber-500' },
  { id: 'agenda', label: 'Agenda', icon: <Calendar className="w-6 h-6" strokeWidth={2} />, accent: 'text-blue-500' },
  { id: 'patio', label: 'Pátio', icon: <PatioCarIcon className="w-6 h-6" strokeWidth={3} />, accent: 'text-emerald-500' },
  { id: 'laboratorio', label: 'Laboratório', icon: <FlaskConical className="w-6 h-6" strokeWidth={2} />, accent: 'text-violet-500' },
];

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
}) => {
  const [isServicesModalOpen, setIsServicesModalOpen] = useState(false);
  const [isChangePasswordsOpen, setIsChangePasswordsOpen] = useState(false);
  const [isTechnicianProfileOpen, setIsTechnicianProfileOpen] = useState(false);
  const [isAdminProfileOpen, setIsAdminProfileOpen] = useState(false);
  const [isSystemUsersOpen, setIsSystemUsersOpen] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);

  const quickApps = isTechnician
    ? QUICK_APPS.filter((a) => allowedTabs.includes(a.id))
    : QUICK_APPS;

  const operationalForView = isTechnician
    ? OPERATIONAL_APPS.filter((a) => allowedTabs.includes(a.id))
    : OPERATIONAL_APPS;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 safe-area-pb relative">
      {/* Fundo sutil */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-[linear-gradient(180deg,var(--tw-gradient-from)_0%,transparent_50%)] from-amber-500/5 dark:from-amber-500/[0.07] to-transparent" />
      <div className="fixed bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-zinc-100/80 dark:from-zinc-900/80 to-transparent pointer-events-none z-0" />

      {/* Header: identidade da oficina */}
      <header className="relative z-10 pt-[env(safe-area-inset-top)] pb-6 px-4 sm:px-6 border-b border-zinc-200/80 dark:border-white/[0.06] bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md">
        <div className="max-w-xl mx-auto flex items-center gap-4">
          <img
            src="/logo.png"
            alt="Rei do ABS"
            className="w-14 h-14 sm:w-16 sm:h-16 object-contain rounded-xl border border-zinc-200/80 dark:border-white/10 shadow-sm"
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight truncate">
              Rei do ABS
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              {isTechnician ? `Olá, ${technicianName}` : 'Sistema de gestão da oficina'}
            </p>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 px-4 sm:px-6 pb-28 max-w-xl mx-auto w-full">
        {/* Operação: módulos principais */}
        <section className="pt-6 pb-6">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
            Operação
          </h2>
          {isTechnician && operationalForView.length <= 2 ? (
            <div className={`grid gap-3 ${operationalForView.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {operationalForView.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => onOpenApp(app.id)}
                  className={`flex flex-col items-center gap-2 p-5 rounded-xl border ${app.bg} hover:opacity-95 active:scale-[0.99] transition-all`}
                >
                  <div className={app.accent}>{app.icon}</div>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white text-center">{app.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {operationalForView.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => onOpenApp(app.id)}
                  className={`flex flex-col items-start gap-2 p-4 rounded-xl border ${app.bg} hover:opacity-95 active:scale-[0.99] transition-all text-left`}
                >
                  <div className={app.accent}>{app.icon}</div>
                  <span className="text-[15px] font-semibold text-zinc-900 dark:text-white leading-tight">{app.label}</span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">{app.description}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Administração (só admin) */}
        {!isTechnician && (
          <section className="pt-2 pb-4">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
              Administração
            </h2>
            <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900/50 shadow-sm">
              <button type="button" onClick={() => setIsSystemUsersOpen(true)} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100 dark:border-white/[0.06] hover:bg-zinc-50 dark:hover:bg-white/[0.04] active:bg-zinc-100 dark:active:bg-white/[0.06] transition-colors">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-violet-500/15 text-violet-600 dark:text-violet-400"><User className="w-5 h-5" strokeWidth={2} /></div>
                <span className="flex-1 text-left text-[15px] font-medium text-zinc-900 dark:text-white">Usuários do sistema</span>
                <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400" />
              </button>
              <button type="button" onClick={() => onOpenApp('settings')} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100 dark:border-white/[0.06] hover:bg-zinc-50 dark:hover:bg-white/[0.04] active:bg-zinc-100 dark:active:bg-white/[0.06] transition-colors">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-400"><Settings className="w-5 h-5" strokeWidth={2} /></div>
                <span className="flex-1 text-left text-[15px] font-medium text-zinc-900 dark:text-white">Configurações</span>
                <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400" />
              </button>
              <button type="button" onClick={() => setIsServicesModalOpen(true)} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100 dark:border-white/[0.06] hover:bg-zinc-50 dark:hover:bg-white/[0.04] active:bg-zinc-100 dark:active:bg-white/[0.06] transition-colors">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-amber-500/15 text-amber-600 dark:text-amber-400"><Wrench className="w-5 h-5" strokeWidth={2} /></div>
                <span className="flex-1 text-left text-[15px] font-medium text-zinc-900 dark:text-white">Serviços da oficina</span>
                <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400" />
              </button>
              <button type="button" onClick={() => setIsChangePasswordsOpen(true)} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-white/[0.04] active:bg-zinc-100 dark:active:bg-white/[0.06] transition-colors">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-zinc-200/80 dark:bg-white/10 text-zinc-600 dark:text-zinc-400"><Lock className="w-5 h-5" strokeWidth={2} /></div>
                <span className="flex-1 text-left text-[15px] font-medium text-zinc-900 dark:text-white">Alterar senhas</span>
                <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400" />
              </button>
            </div>
          </section>
        )}

        {/* Conta: perfil (admin, técnico ou usuário do sistema) e sair */}
        <section className="pt-2 pb-4">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
            Conta
          </h2>
          <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-zinc-900/50 shadow-sm">
            {isSystemUser && (
            <button
              type="button"
              onClick={() => setIsUserProfileOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100 dark:border-white/[0.06] hover:bg-zinc-50 dark:hover:bg-white/[0.04] active:bg-zinc-100 dark:active:bg-white/[0.06] transition-colors"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-violet-500/15 text-violet-600 dark:text-violet-400"><User className="w-5 h-5" strokeWidth={2} /></div>
              <span className="flex-1 text-left text-[15px] font-medium text-zinc-900 dark:text-white">Configurações de perfil</span>
              <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400" />
            </button>
            )}
            {(!isTechnician || technicianId) && !isSystemUser && (
            <button
              type="button"
              onClick={() => (isTechnician ? setIsTechnicianProfileOpen(true) : setIsAdminProfileOpen(true))}
              className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100 dark:border-white/[0.06] hover:bg-zinc-50 dark:hover:bg-white/[0.04] active:bg-zinc-100 dark:active:bg-white/[0.06] transition-colors"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-violet-500/15 text-violet-600 dark:text-violet-400"><User className="w-5 h-5" strokeWidth={2} /></div>
              <span className="flex-1 text-left text-[15px] font-medium text-zinc-900 dark:text-white">{isTechnician ? 'Meu perfil' : 'Perfil do administrador'}</span>
              <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400" />
            </button>
            )}
            {onLogout && (
              <button type="button" onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-red-50/80 dark:hover:bg-red-950/30 active:bg-red-100 dark:active:bg-red-950/50 transition-colors">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-red-500/15 text-red-600 dark:text-red-400"><LogOut className="w-5 h-5" strokeWidth={2} /></div>
                <span className="flex-1 text-left text-[15px] font-medium text-zinc-900 dark:text-white">Sair</span>
                <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400" />
              </button>
            )}
          </div>
        </section>
      </main>

      {!isTechnician && (
        <>
          <SystemUsersModal isOpen={isSystemUsersOpen} onClose={() => setIsSystemUsersOpen(false)} />
          <WorkshopServicesModal isOpen={isServicesModalOpen} onClose={() => setIsServicesModalOpen(false)} />
          <ChangePasswordsModal isOpen={isChangePasswordsOpen} onClose={() => setIsChangePasswordsOpen(false)} />
        </>
      )}
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
      <AdminProfileModal isOpen={isAdminProfileOpen} onClose={() => setIsAdminProfileOpen(false)} />
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
