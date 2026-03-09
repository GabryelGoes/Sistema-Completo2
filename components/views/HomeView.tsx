import React, { useState } from 'react';
import {
  ClipboardList,
  Calendar,
  LayoutGrid,
  Settings,
  ChevronRight,
  Wrench,
  Users,
  Lock,
  LogOut,
  ShieldCheck,
  User,
} from 'lucide-react';
import { PatioCarIcon } from '../ui/PatioCarIcon';
import { WorkshopServicesModal } from '../WorkshopServicesModal';
import { WorkshopTechniciansModal } from '../WorkshopTechniciansModal';
import { TechnicianAccessModal } from '../TechnicianAccessModal';
import { ChangePasswordsModal } from '../ChangePasswordsModal';
import { TechnicianProfileModal } from '../TechnicianProfileModal';
import { AdminProfileModal } from '../AdminProfileModal';

export type HomeAppId = 'reception' | 'agenda' | 'patio' | 'external-patio' | 'settings';

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
}

const APPS: { id: HomeAppId; label: string; icon: React.ReactNode; accent: string }[] = [
  { id: 'reception', label: 'Recepção', icon: <ClipboardList className="w-6 h-6" strokeWidth={2} />, accent: 'text-amber-500' },
  { id: 'agenda', label: 'Agenda', icon: <Calendar className="w-6 h-6" strokeWidth={2} />, accent: 'text-blue-500' },
  { id: 'patio', label: 'Pátio', icon: <PatioCarIcon className="w-6 h-6" strokeWidth={2} />, accent: 'text-emerald-500' },
  { id: 'external-patio', label: 'Visão do Pátio', icon: <LayoutGrid className="w-6 h-6" strokeWidth={2} />, accent: 'text-violet-500' },
  { id: 'settings', label: 'Configurações', icon: <Settings className="w-6 h-6" strokeWidth={2} />, accent: 'text-zinc-500 dark:text-zinc-400' },
];

const QUICK_APPS: { id: HomeAppId; label: string; icon: React.ReactNode; accent: string }[] = [
  { id: 'reception', label: 'Recepção', icon: <ClipboardList className="w-6 h-6" strokeWidth={2} />, accent: 'text-amber-500' },
  { id: 'agenda', label: 'Agenda', icon: <Calendar className="w-6 h-6" strokeWidth={2} />, accent: 'text-blue-500' },
  { id: 'patio', label: 'Pátio', icon: <PatioCarIcon className="w-6 h-6" strokeWidth={2} />, accent: 'text-emerald-500' },
];

export const HomeView: React.FC<HomeViewProps> = ({
  onOpenApp,
  onLogout,
  isTechnician = false,
  technicianId,
  technicianName = 'Pátio',
  allowedTabs = [],
  onProfileUpdated,
}) => {
  const [isServicesModalOpen, setIsServicesModalOpen] = useState(false);
  const [isTechniciansModalOpen, setIsTechniciansModalOpen] = useState(false);
  const [isTechnicianAccessModalOpen, setIsTechnicianAccessModalOpen] = useState(false);
  const [isChangePasswordsOpen, setIsChangePasswordsOpen] = useState(false);
  const [isTechnicianProfileOpen, setIsTechnicianProfileOpen] = useState(false);
  const [isAdminProfileOpen, setIsAdminProfileOpen] = useState(false);

  const quickApps = isTechnician
    ? QUICK_APPS.filter((a) => allowedTabs.includes(a.id))
    : QUICK_APPS;

  return (
    <div className="min-h-screen flex flex-col bg-light-page dark:bg-black safe-area-pb relative">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-yellow/5 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[40%] left-1/2 -translate-x-1/2 w-[120%] h-[80%] rounded-full bg-light-card/80 dark:bg-zinc-900/40 blur-[100px]" />
      </div>

      <header className="relative z-10 flex flex-col items-center pt-[env(safe-area-inset-top)] pt-12 pb-8 px-6">
        <img
          src="/logo.png"
          alt="Rei do ABS"
          className="w-20 h-20 sm:w-24 sm:h-24 object-contain flex-shrink-0 rounded-2xl shadow-sm dark:shadow-none"
        />
        <h1 className="mt-5 text-2xl sm:text-3xl font-semibold text-zinc-900 dark:text-white tracking-tight text-center">
          Rei do ABS
        </h1>
        <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400 font-medium">
          {isTechnician ? `Olá, ${technicianName}` : 'Oficina'}
        </p>
      </header>

      {/* Acesso rápido */}
      <div className="relative z-10 px-4 sm:px-6 pb-6 max-w-lg mx-auto w-full">
        <p className="text-[13px] font-medium text-zinc-500 dark:text-zinc-400 mb-3">Acesso rápido</p>
        <div className={`grid gap-3 ${quickApps.length === 3 ? 'grid-cols-3' : quickApps.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {quickApps.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => onOpenApp(app.id)}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-light-elevated dark:bg-white/[0.06] border border-light-border dark:border-white/[0.08] shadow-sm hover:opacity-90 transition-all active:scale-[0.98]"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-light-card dark:bg-white/[0.08] ${app.accent}`}>
                {app.icon}
              </div>
              <span className="text-[13px] font-semibold text-zinc-900 dark:text-white text-center leading-tight">{app.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Lista: para técnico só Perfil + Sair; para admin lista completa + Perfil */}
      <div className="relative z-10 flex-1 px-4 sm:px-6 pb-24 max-w-lg mx-auto w-full">
        <div className="rounded-2xl overflow-hidden bg-light-elevated dark:bg-white/[0.06] border border-light-border dark:border-white/[0.08] shadow-sm dark:shadow-none">
          {!isTechnician && (
            <>
              {APPS.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => onOpenApp(app.id)}
                  className="w-full flex items-center gap-4 px-4 py-4 sm:py-5 bg-transparent hover:bg-light-card/80 dark:hover:bg-white/[0.06] active:bg-light-border/50 dark:active:bg-white/[0.1] transition-colors min-h-[56px] border-b border-light-border/80 dark:border-white/[0.06]"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-light-card dark:bg-white/[0.08] ${app.accent}`}>{app.icon}</div>
                  <span className="flex-1 text-left text-[17px] font-medium text-zinc-900 dark:text-white">{app.label}</span>
                  <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400 dark:text-zinc-500" />
                </button>
              ))}
              <button type="button" onClick={() => setIsServicesModalOpen(true)} className="w-full flex items-center gap-4 px-4 py-4 sm:py-5 bg-transparent hover:bg-light-card/80 dark:hover:bg-white/[0.06] active:bg-light-border/50 min-h-[56px]">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-light-card dark:bg-white/[0.08] text-amber-500"><Wrench className="w-6 h-6" strokeWidth={2} /></div>
                <span className="flex-1 text-left text-[17px] font-medium text-zinc-900 dark:text-white">Serviços da oficina</span>
                <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400 dark:text-zinc-500" />
              </button>
              <button type="button" onClick={() => setIsTechniciansModalOpen(true)} className="w-full flex items-center gap-4 px-4 py-4 sm:py-5 bg-transparent hover:bg-light-card/80 dark:hover:bg-white/[0.06] active:bg-light-border/50 min-h-[56px]">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-light-card dark:bg-white/[0.08] text-violet-500"><Users className="w-6 h-6" strokeWidth={2} /></div>
                <span className="flex-1 text-left text-[17px] font-medium text-zinc-900 dark:text-white">Técnicos</span>
                <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400 dark:text-zinc-500" />
              </button>
              <button type="button" onClick={() => setIsTechnicianAccessModalOpen(true)} className="w-full flex items-center gap-4 px-4 py-4 sm:py-5 bg-transparent hover:bg-light-card/80 dark:hover:bg-white/[0.06] active:bg-light-border/50 min-h-[56px]">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-light-card dark:bg-white/[0.08] text-brand-yellow"><ShieldCheck className="w-6 h-6" strokeWidth={2} /></div>
                <span className="flex-1 text-left text-[17px] font-medium text-zinc-900 dark:text-white">Controle dos Técnicos</span>
                <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400 dark:text-zinc-500" />
              </button>
              <button type="button" onClick={() => setIsChangePasswordsOpen(true)} className="w-full flex items-center gap-4 px-4 py-4 sm:py-5 bg-transparent hover:bg-light-card/80 dark:hover:bg-white/[0.06] active:bg-light-border/50 min-h-[56px]">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-light-card dark:bg-white/[0.08] text-amber-500"><Lock className="w-6 h-6" strokeWidth={2} /></div>
                <span className="flex-1 text-left text-[17px] font-medium text-zinc-900 dark:text-white">Alterar senhas</span>
                <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400 dark:text-zinc-500" />
              </button>
            </>
          )}

          {/* Perfil (admin ou técnico) */}
          <button
            type="button"
            onClick={() => (isTechnician ? setIsTechnicianProfileOpen(true) : setIsAdminProfileOpen(true))}
            className="w-full flex items-center gap-4 px-4 py-4 sm:py-5 bg-transparent hover:bg-zinc-100/80 dark:hover:bg-white/[0.06] active:bg-zinc-200/80 min-h-[56px] border-b border-zinc-200/50 dark:border-white/[0.06]"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-light-card dark:bg-white/[0.08] text-violet-500">
              <User className="w-6 h-6" strokeWidth={2} />
            </div>
            <span className="flex-1 text-left text-[17px] font-medium text-zinc-900 dark:text-white">
              {isTechnician ? 'Meu perfil' : 'Perfil do administrador'}
            </span>
            <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400 dark:text-zinc-500" />
          </button>

          {onLogout && (
            <button type="button" onClick={onLogout} className="w-full flex items-center gap-4 px-4 py-4 sm:py-5 bg-transparent hover:bg-zinc-100/80 dark:hover:bg-white/[0.06] active:bg-zinc-200/80 min-h-[56px] border-t border-zinc-200/50 dark:border-white/[0.06]">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-light-card dark:bg-white/[0.08] text-red-500"><LogOut className="w-6 h-6" strokeWidth={2} /></div>
              <span className="flex-1 text-left text-[17px] font-medium text-zinc-900 dark:text-white">Sair</span>
              <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400 dark:text-zinc-500" />
            </button>
          )}
        </div>
        <p className="mt-6 text-center text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">Toque para abrir</p>
      </div>

      {!isTechnician && (
        <>
          <WorkshopServicesModal isOpen={isServicesModalOpen} onClose={() => setIsServicesModalOpen(false)} />
          <WorkshopTechniciansModal isOpen={isTechniciansModalOpen} onClose={() => setIsTechniciansModalOpen(false)} />
          <TechnicianAccessModal isOpen={isTechnicianAccessModalOpen} onClose={() => setIsTechnicianAccessModalOpen(false)} />
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
    </div>
  );
};
