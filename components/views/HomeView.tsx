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
  ExternalLink,
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
  /** Nome do admin (configurações); usado quando for admin */
  adminDisplayName?: string;
  /** Chamado após salvar o perfil do administrador (nome/foto) para o App atualizar o nome exibido */
  onAdminProfileSaved?: () => void;
}

/** Módulos operacionais: ícones com fundo sólido e ícone branco */
const OPERATIONAL_APPS: { id: HomeAppId; label: string; description: string; icon: React.ReactNode; iconBg: string; bg: string; border: string }[] = [
  { id: 'reception', label: 'Recepção', description: 'Cadastro de clientes e veículos', icon: <ClipboardList className="w-7 h-7 text-white" strokeWidth={2.5} />, iconBg: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/90 border-amber-200 dark:border-amber-800', border: 'border-amber-200 dark:border-amber-800' },
  { id: 'agenda', label: 'Agenda', description: 'Agendamentos e compromissos', icon: <Calendar className="w-7 h-7 text-white" strokeWidth={2.5} />, iconBg: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/90 border-blue-200 dark:border-blue-800', border: 'border-blue-200 dark:border-blue-800' },
  { id: 'patio', label: 'Pátio', description: 'Veículos em atendimento', icon: <PatioCarIcon className="w-7 h-7 text-white" strokeWidth={2.5} />, iconBg: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800', border: 'border-emerald-200 dark:border-emerald-800' },
  { id: 'laboratorio', label: 'Laboratório', description: 'Módulos e eletrônica', icon: <FlaskConical className="w-7 h-7 text-white" strokeWidth={2.5} />, iconBg: 'bg-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/90 border-violet-200 dark:border-violet-800', border: 'border-violet-200 dark:border-violet-800' },
];

const QUICK_APPS: { id: HomeAppId; label: string; icon: React.ReactNode; iconBg: string }[] = [
  { id: 'reception', label: 'Recepção', icon: <ClipboardList className="w-6 h-6 text-white" strokeWidth={2.5} />, iconBg: 'bg-amber-500' },
  { id: 'agenda', label: 'Agenda', icon: <Calendar className="w-6 h-6 text-white" strokeWidth={2.5} />, iconBg: 'bg-blue-500' },
  { id: 'patio', label: 'Pátio', icon: <PatioCarIcon className="w-6 h-6 text-white" strokeWidth={2.5} />, iconBg: 'bg-emerald-500' },
  { id: 'laboratorio', label: 'Laboratório', icon: <FlaskConical className="w-6 h-6 text-white" strokeWidth={2.5} />, iconBg: 'bg-violet-500' },
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
  adminDisplayName,
  onAdminProfileSaved,
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
    <div className="min-h-screen flex flex-col bg-zinc-100 dark:bg-zinc-950 safe-area-pb relative">
      {/* Fundo sutil */}
      <div className="fixed inset-0 pointer-events-none z-0 bg-gradient-to-b from-amber-50/80 dark:from-amber-950/30 to-transparent" />
      <div className="fixed bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-zinc-200/90 dark:from-zinc-900/90 to-transparent pointer-events-none z-0" />

      {/* Header: identidade da oficina */}
      <header className="relative z-10 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-5 px-4 sm:px-6 border-b-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="max-w-xl mx-auto flex items-center gap-4">
          <img
            src="/logo.png"
            alt="Rei do ABS"
            className="w-14 h-14 sm:w-16 sm:h-16 object-contain rounded-xl border-2 border-zinc-200 dark:border-zinc-700 shadow-md"
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight truncate">
              Rei do ABS
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
              {isTechnician ? `Olá, ${technicianName}` : 'Sistema de gestão da oficina'}
            </p>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 px-4 sm:px-6 pb-28 max-w-xl mx-auto w-full">
        {/* Operação: módulos principais */}
        <section className="pt-6 pb-4">
          <h2 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Operação</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">Acesso rápido aos módulos do dia a dia</p>
          {isTechnician && operationalForView.length <= 2 ? (
            <div className={`grid gap-3 ${operationalForView.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {operationalForView.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => onOpenApp(app.id)}
                  className={`flex flex-col items-center gap-2 p-5 rounded-xl border-2 ${app.bg} ${app.border} hover:shadow-md active:scale-[0.99] transition-all`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${app.iconBg}`}>{app.icon}</div>
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
                  className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 ${app.bg} ${app.border} hover:shadow-md active:scale-[0.99] transition-all text-left`}
                >
                  <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${app.iconBg}`}>{app.icon}</div>
                  <span className="text-[15px] font-semibold text-zinc-900 dark:text-white leading-tight">{app.label}</span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 leading-tight">{app.description}</span>
                </button>
              ))}
            </div>
          )}

          {/* Link para o Painel do Pátio (TV) */}
          <a
            href="https://patio-view.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center gap-3 p-4 rounded-xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/90 hover:shadow-md active:scale-[0.99] transition-all text-left"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-emerald-500">
              <PatioCarIcon className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[15px] font-semibold text-zinc-900 dark:text-white block">Painel do Pátio (TV)</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Abrir em nova aba</span>
            </div>
            <ExternalLink className="w-5 h-5 shrink-0 text-zinc-500 dark:text-zinc-400" />
          </a>
        </section>

        {/* Administração (só admin) */}
        {!isTechnician && (
          <section className="pt-4 pb-4">
            <h2 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Administração</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">Usuários, configurações e senhas</p>
            <div className="rounded-xl overflow-hidden border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm">
              <button type="button" onClick={() => setIsSystemUsersOpen(true)} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-violet-500"><User className="w-5 h-5 text-white" strokeWidth={2.5} /></div>
                <span className="flex-1 text-left text-[15px] font-medium text-zinc-900 dark:text-white">Usuários do sistema</span>
                <ChevronRight className="w-5 h-5 shrink-0 text-zinc-500" />
              </button>
              <button type="button" onClick={() => onOpenApp('settings')} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-zinc-500"><Settings className="w-5 h-5 text-white" strokeWidth={2.5} /></div>
                <span className="flex-1 text-left text-[15px] font-medium text-zinc-900 dark:text-white">Configurações</span>
                <ChevronRight className="w-5 h-5 shrink-0 text-zinc-500" />
              </button>
              <button type="button" onClick={() => setIsServicesModalOpen(true)} className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-amber-500"><Wrench className="w-5 h-5 text-white" strokeWidth={2.5} /></div>
                <span className="flex-1 text-left text-[15px] font-medium text-zinc-900 dark:text-white">Serviços da oficina</span>
                <ChevronRight className="w-5 h-5 shrink-0 text-zinc-500" />
              </button>
              <button type="button" onClick={() => setIsChangePasswordsOpen(true)} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-zinc-600"><Lock className="w-5 h-5 text-white" strokeWidth={2.5} /></div>
                <span className="flex-1 text-left text-[15px] font-medium text-zinc-900 dark:text-white">Alterar senhas</span>
                <ChevronRight className="w-5 h-5 shrink-0 text-zinc-500" />
              </button>
            </div>
          </section>
        )}

        {/* Conta: perfil e sair */}
        <section className="pt-4 pb-4">
          <h2 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Conta</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">Perfil e encerrar sessão</p>
          <div className="rounded-xl overflow-hidden border-2 border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm">
            {isSystemUser && (
            <button
              type="button"
              onClick={() => setIsUserProfileOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-violet-500"><User className="w-5 h-5 text-white" strokeWidth={2.5} /></div>
              <span className="flex-1 text-left text-[15px] font-medium text-zinc-900 dark:text-white">Configurações de perfil</span>
              <ChevronRight className="w-5 h-5 shrink-0 text-zinc-500" />
            </button>
            )}
            {(!isTechnician || technicianId) && !isSystemUser && (
            <button
              type="button"
              onClick={() => (isTechnician ? setIsTechnicianProfileOpen(true) : setIsAdminProfileOpen(true))}
              className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-violet-500"><User className="w-5 h-5 text-white" strokeWidth={2.5} /></div>
              <span className="flex-1 text-left text-[15px] font-medium text-zinc-900 dark:text-white">{isTechnician ? 'Meu perfil' : 'Perfil do administrador'}</span>
              <ChevronRight className="w-5 h-5 shrink-0 text-zinc-500" />
            </button>
            )}
            {onLogout && (
              <button type="button" onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-red-50 dark:hover:bg-red-950/50 active:bg-red-100 dark:active:bg-red-900/30 transition-colors">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-red-500"><LogOut className="w-5 h-5 text-white" strokeWidth={2.5} /></div>
                <span className="flex-1 text-left text-[15px] font-medium text-zinc-900 dark:text-white">Sair</span>
                <ChevronRight className="w-5 h-5 shrink-0 text-zinc-500" />
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
