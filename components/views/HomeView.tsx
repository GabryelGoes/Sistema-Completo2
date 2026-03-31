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
  Package,
  Monitor,
  Sparkles,
} from 'lucide-react';
import { PatioCarIcon } from '../ui/PatioCarIcon';
import { WorkshopServicesModal } from '../WorkshopServicesModal';
import { WorkshopPartsModal } from '../WorkshopPartsModal';
import { PatioChecklistsModal } from '../PatioChecklistsModal';
import { ChangePasswordsModal } from '../ChangePasswordsModal';
import { TechnicianProfileModal } from '../TechnicianProfileModal';
import { AdminProfileModal } from '../AdminProfileModal';
import { SystemUsersModal } from '../SystemUsersModal';
import { ZayaAlertsModal } from '../ZayaAlertsModal';
import { TvPatioModal } from '../TvPatioModal';
import { UserProfileModal } from '../UserProfileModal';
import type { SystemUserPermissions } from '../../services/apiService';

export type HomeAppId = 'reception' | 'agenda' | 'patio' | 'laboratorio' | 'settings';

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
  onAdminProfileSaved?: () => void;
  systemUsersRefreshTrigger?: number;
  systemUserPermissions?: SystemUserPermissions;
  onOpenSettings?: () => void;
  onOpenChangePasswords?: () => void;
}

/** Alinhado ao modal TV do pátio: vidro, sombra suave, cantos iOS. */
const iosCard =
  'rounded-[22px] border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-zinc-900/40 backdrop-blur-2xl shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]';

const iosSectionTitle =
  'text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400 mb-1';

const iosSectionHint = 'text-[13px] text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed';

const iconSquircle =
  'flex items-center justify-center rounded-[1.35rem] shadow-[0_8px_28px_-6px_rgba(0,0,0,0.38),inset_0_1px_0_0_rgba(255,255,255,0.38)]';

/** Tamanho do quadrado gradiente + ícone branco dentro (estilo app iOS). */
const opSquircleSize = 'w-[4.75rem] h-[4.75rem] sm:w-[5.5rem] sm:h-[5.5rem]';
const opGlyphSize = 'w-10 h-10 sm:w-11 sm:h-11';

type AppGradient =
  | 'from-amber-400 via-amber-500 to-orange-600'
  | 'from-sky-400 via-blue-500 to-indigo-600'
  | 'from-emerald-400 via-teal-500 to-cyan-700'
  | 'from-violet-400 via-purple-500 to-fuchsia-700';

const OPERATIONAL_APPS: {
  id: HomeAppId;
  label: string;
  icon: React.ReactNode;
  gradient: AppGradient;
}[] = [
  {
    id: 'reception',
    label: 'Recepção',
    icon: <ClipboardList className={`${opGlyphSize} text-white`} strokeWidth={2.2} />,
    gradient: 'from-amber-400 via-amber-500 to-orange-600',
  },
  {
    id: 'agenda',
    label: 'Agenda',
    icon: <Calendar className={`${opGlyphSize} text-white`} strokeWidth={2.2} />,
    gradient: 'from-sky-400 via-blue-500 to-indigo-600',
  },
  {
    id: 'patio',
    label: 'Pátio',
    icon: <PatioCarIcon className={`${opGlyphSize} text-white`} strokeWidth={2.2} />,
    gradient: 'from-emerald-400 via-teal-500 to-cyan-700',
  },
  {
    id: 'laboratorio',
    label: 'Laboratório',
    icon: <FlaskConical className={`${opGlyphSize} text-white`} strokeWidth={2.2} />,
    gradient: 'from-violet-400 via-purple-500 to-fuchsia-700',
  },
];

function SettingsRow({
  onClick,
  icon,
  title,
  subtitle,
  danger,
  className = '',
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full flex items-center gap-3 px-3 py-3 sm:px-4 sm:py-3.5 text-left rounded-2xl transition-all duration-200 hover:bg-zinc-100/90 dark:hover:bg-white/[0.06] active:scale-[0.99] ${danger ? 'hover:bg-red-500/10 dark:hover:bg-red-500/10' : ''} ${className}`}
    >
      {icon}
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-medium text-zinc-900 dark:text-white leading-snug">{title}</span>
        {subtitle ? <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">{subtitle}</span> : null}
      </span>
      <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400 dark:text-zinc-500 group-hover:text-[#007AFF] dark:group-hover:text-[#0A84FF] transition-colors" />
    </button>
  );
}

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
  systemUsersRefreshTrigger,
  systemUserPermissions,
  onOpenSettings,
  onOpenChangePasswords,
}) => {
  const [isServicesModalOpen, setIsServicesModalOpen] = useState(false);
  const [isChangePasswordsOpen, setIsChangePasswordsOpen] = useState(false);
  const [isTechnicianProfileOpen, setIsTechnicianProfileOpen] = useState(false);
  const [isAdminProfileOpen, setIsAdminProfileOpen] = useState(false);
  const [isSystemUsersOpen, setIsSystemUsersOpen] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [isPatioChecklistsOpen, setIsPatioChecklistsOpen] = useState(false);
  const [isPartsModalOpen, setIsPartsModalOpen] = useState(false);
  const [isTvPatioOpen, setIsTvPatioOpen] = useState(false);
  const [isZayaAlertsOpen, setIsZayaAlertsOpen] = useState(false);

  const perms = systemUserPermissions || {};
  const hasToolsAccess = isSystemUser && (perms.access_settings || perms.access_change_passwords || perms.access_technicians);
  const showAdminSection = (!isTechnician && !isSystemUser) || (isSystemUser && !!perms.full_access);
  const showToolsSection = hasToolsAccess && !perms.full_access;

  const operationalForView = isTechnician ? OPERATIONAL_APPS.filter((a) => allowedTabs.includes(a.id)) : OPERATIONAL_APPS;

  return (
    <div className="min-h-screen flex flex-col safe-area-pb relative overflow-x-hidden">
      {/* Fundo atmosférico (mesma família visual do modal TV) */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-zinc-100 via-white to-zinc-100/95 dark:from-zinc-950 dark:via-zinc-900 dark:to-black" />
      <div className="fixed inset-0 -z-10 pointer-events-none opacity-40 dark:opacity-30 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(251,191,36,0.22),transparent),radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(56,189,248,0.12),transparent),radial-gradient(ellipse_50%_35%_at_0%_100%,rgba(167,139,250,0.1),transparent)]" />
      <div className="fixed inset-0 -z-10 pointer-events-none backdrop-blur-[2px]" />

      {/* Cabeçalho em vidro */}
      <header className="relative z-10 pt-[calc(env(safe-area-inset-top)+1rem)] pb-6 px-4 sm:px-6 border-b border-zinc-200/60 dark:border-white/[0.06] bg-white/65 dark:bg-zinc-950/55 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset] dark:shadow-none">
        <div className="max-w-xl lg:max-w-5xl mx-auto flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="absolute -inset-0.5 rounded-[1.15rem] bg-gradient-to-br from-amber-400/50 via-white/20 to-cyan-400/40 opacity-80 dark:opacity-60 blur-[1px]" />
            <img
              src="/logo.png"
              alt="Rei do ABS"
              className="relative w-14 h-14 sm:w-[4.25rem] sm:h-[4.25rem] object-contain rounded-2xl border border-white/60 dark:border-white/10 shadow-lg shadow-black/5 dark:shadow-black/40 ring-1 ring-black/5 dark:ring-white/10"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400 mb-0.5">Oficina</p>
            <h1 className="text-[1.35rem] sm:text-[1.65rem] font-semibold tracking-tight text-zinc-900 dark:text-white leading-tight">
              Rei do ABS
            </h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1.5 flex-wrap">
              <Sparkles className="w-3.5 h-3.5 text-amber-500/90 shrink-0" />
              {isTechnician ? (
                <span>
                  Olá, <span className="font-medium text-zinc-700 dark:text-zinc-200">{technicianName}</span>
                </span>
              ) : (
                <span>
                  {adminDisplayName && adminDisplayName !== 'Rei do ABS'
                    ? `${adminDisplayName} · toque em um módulo para começar`
                    : 'Sistema de gestão — toque em um módulo para começar'}
                </span>
              )}
            </p>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 px-4 sm:px-6 pb-28 max-w-xl lg:max-w-5xl mx-auto w-full">
        <div className="lg:grid lg:grid-cols-2 lg:gap-10 lg:items-start">
          <div className="lg:space-y-8">
            <section className="pt-7 pb-2 lg:pt-8 lg:pb-0">
              <p className={iosSectionTitle}>Operação</p>
              <p className={iosSectionHint}>Acesso rápido aos módulos do dia a dia</p>

              {isTechnician && operationalForView.length <= 2 ? (
                <div className={`grid gap-3 ${operationalForView.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} lg:grid-cols-2`}>
                  {operationalForView.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => onOpenApp(app.id)}
                      className={`group flex flex-col items-center gap-3 p-6 ${iosCard} border-[#007AFF]/0 hover:border-[#007AFF]/20 dark:hover:border-[#0A84FF]/25 hover:shadow-[0_12px_40px_-12px_rgba(0,122,255,0.25)] transition-all duration-300 active:scale-[0.98]`}
                    >
                      <div
                        className={`${opSquircleSize} bg-gradient-to-br ${app.gradient} ${iconSquircle} group-hover:scale-[1.05] transition-transform duration-300`}
                      >
                        {app.icon}
                      </div>
                      <span className="text-[15px] font-semibold text-zinc-900 dark:text-white text-center tracking-tight">
                        {app.label}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {operationalForView.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => onOpenApp(app.id)}
                      className={`group flex flex-col items-center gap-3 p-4 sm:p-5 text-center ${iosCard} border-[#007AFF]/0 hover:border-[#007AFF]/15 dark:hover:border-[#0A84FF]/20 hover:shadow-[0_12px_40px_-12px_rgba(0,122,255,0.2)] transition-all duration-300 active:scale-[0.99]`}
                    >
                      <div
                        className={`${opSquircleSize} bg-gradient-to-br ${app.gradient} ${iconSquircle} group-hover:scale-[1.05] transition-transform duration-300`}
                      >
                        {app.icon}
                      </div>
                      <span className="text-[15px] font-semibold text-zinc-900 dark:text-white leading-tight">{app.label}</span>
                    </button>
                  ))}
                </div>
              )}

              <a
                href="https://patio-view.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-5 flex items-center gap-4 p-4 sm:p-5 ${iosCard} border-emerald-400/20 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-50/90 to-white/80 dark:from-emerald-950/50 dark:to-zinc-900/50 hover:border-emerald-400/35 dark:hover:border-emerald-400/30 hover:shadow-[0_12px_36px_-10px_rgba(16,185,129,0.35)] transition-all duration-300 active:scale-[0.995]`}
              >
                <div
                  className={`w-12 h-12 shrink-0 bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-700 ${iconSquircle}`}
                >
                  <PatioCarIcon className="w-6 h-6 text-white" strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[15px] font-semibold text-zinc-900 dark:text-white block leading-tight">Painel do Pátio (TV)</span>
                  <span className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">Abrir em nova aba</span>
                </div>
                <ExternalLink className="w-5 h-5 shrink-0 text-zinc-400 dark:text-zinc-500" />
              </a>
            </section>
          </div>

          <div className="lg:space-y-8 lg:pt-8">
            {showToolsSection && (
              <section className="pt-2 pb-2 lg:pt-0">
                <p className={iosSectionTitle}>Ferramentas</p>
                <p className={iosSectionHint}>Configurações liberadas para você</p>
                <div className={`${iosCard} p-2 space-y-0.5`}>
                  {perms.access_settings && onOpenSettings && (
                    <SettingsRow
                      onClick={onOpenSettings}
                      title="Configurações"
                      subtitle="Preferências da oficina"
                      icon={
                        <div className={`w-11 h-11 shrink-0 bg-gradient-to-br from-zinc-500 to-zinc-700 ${iconSquircle}`}>
                          <Settings className="w-5 h-5 text-white m-auto" strokeWidth={2.2} />
                        </div>
                      }
                    />
                  )}
                  {perms.access_change_passwords && onOpenChangePasswords && (
                    <SettingsRow
                      onClick={onOpenChangePasswords}
                      title="Alterar senhas"
                      subtitle="Segurança de acessos"
                      icon={
                        <div className={`w-11 h-11 shrink-0 bg-gradient-to-br from-slate-500 to-slate-800 ${iconSquircle}`}>
                          <Lock className="w-5 h-5 text-white m-auto" strokeWidth={2.2} />
                        </div>
                      }
                    />
                  )}
                </div>
              </section>
            )}

            {showAdminSection && (
              <section className="pt-2 pb-2 lg:pt-0">
                <p className={iosSectionTitle}>Administração</p>
                <p className={iosSectionHint}>Usuários, estoque, TV e configurações</p>
                <div className={`${iosCard} p-2 lg:grid lg:grid-cols-2 lg:gap-0 lg:p-2`}>
                  <div className="lg:grid lg:grid-cols-1 space-y-0.5">
                    <SettingsRow
                      onClick={() => setIsSystemUsersOpen(true)}
                      title="Usuários do sistema"
                      subtitle="Acessos e permissões"
                      icon={
                        <div className={`w-11 h-11 shrink-0 bg-gradient-to-br from-violet-500 to-purple-800 ${iconSquircle}`}>
                          <User className="w-5 h-5 text-white m-auto" strokeWidth={2.2} />
                        </div>
                      }
                    />
                    <SettingsRow
                      onClick={() => setIsZayaAlertsOpen(true)}
                      title="Avisos da Zaya"
                      subtitle="Etapas, orçamentos e destinatários"
                      icon={
                        <div className={`w-11 h-11 shrink-0 bg-gradient-to-br from-fuchsia-500 to-violet-800 ${iconSquircle}`}>
                          <Sparkles className="w-5 h-5 text-white m-auto" strokeWidth={2.2} />
                        </div>
                      }
                    />
                    <SettingsRow
                      onClick={() => onOpenApp('settings')}
                      title="Configurações"
                      subtitle="Oficina e integrações"
                      icon={
                        <div className={`w-11 h-11 shrink-0 bg-gradient-to-br from-zinc-500 to-zinc-800 ${iconSquircle}`}>
                          <Settings className="w-5 h-5 text-white m-auto" strokeWidth={2.2} />
                        </div>
                      }
                    />
                    <SettingsRow
                      onClick={() => setIsServicesModalOpen(true)}
                      title="Serviços da oficina"
                      subtitle="Catálogo e valores"
                      icon={
                        <div className={`w-11 h-11 shrink-0 bg-gradient-to-br from-amber-400 to-orange-600 ${iconSquircle}`}>
                          <Wrench className="w-5 h-5 text-white m-auto" strokeWidth={2.2} />
                        </div>
                      }
                    />
                    <SettingsRow
                      onClick={() => setIsPartsModalOpen(true)}
                      title="Estoque de peças"
                      subtitle="Peças e quantidades"
                      icon={
                        <div className={`w-11 h-11 shrink-0 bg-gradient-to-br from-emerald-500 to-teal-800 ${iconSquircle}`}>
                          <Package className="w-5 h-5 text-white m-auto" strokeWidth={2.2} />
                        </div>
                      }
                    />
                  </div>
                  <div className="lg:grid lg:grid-cols-1 space-y-0.5 lg:border-l lg:border-zinc-200/60 dark:lg:border-white/[0.06] lg:pl-2">
                    <SettingsRow
                      onClick={() => setIsPatioChecklistsOpen(true)}
                      title="Checklists do Pátio"
                      subtitle="Modelos por etapa"
                      icon={
                        <div className={`w-11 h-11 shrink-0 bg-gradient-to-br from-emerald-400 to-teal-700 ${iconSquircle}`}>
                          <ClipboardList className="w-5 h-5 text-white m-auto" strokeWidth={2.2} />
                        </div>
                      }
                    />
                    <SettingsRow
                      onClick={() => setIsTvPatioOpen(true)}
                      title="Conteúdo da TV do pátio"
                      subtitle="Slides e meta semanal"
                      icon={
                        <div className={`w-11 h-11 shrink-0 bg-gradient-to-br from-cyan-400 to-blue-600 ${iconSquircle}`}>
                          <Monitor className="w-5 h-5 text-white m-auto" strokeWidth={2.2} />
                        </div>
                      }
                    />
                    <SettingsRow
                      onClick={() => setIsChangePasswordsOpen(true)}
                      title="Alterar senhas"
                      subtitle="Gerência e equipe"
                      icon={
                        <div className={`w-11 h-11 shrink-0 bg-gradient-to-br from-slate-500 to-slate-800 ${iconSquircle}`}>
                          <Lock className="w-5 h-5 text-white m-auto" strokeWidth={2.2} />
                        </div>
                      }
                    />
                  </div>
                </div>
              </section>
            )}

            <section className="pt-2 pb-6 lg:pt-0">
              <p className={iosSectionTitle}>Conta</p>
              <p className={iosSectionHint}>Perfil e sessão</p>
              <div className={`${iosCard} p-2 space-y-0.5`}>
                {isSystemUser && (
                  <SettingsRow
                    onClick={() => setIsUserProfileOpen(true)}
                    title="Configurações de perfil"
                    subtitle="Nome, foto e cor"
                    icon={
                      <div className={`w-11 h-11 shrink-0 bg-gradient-to-br from-violet-500 to-fuchsia-700 ${iconSquircle}`}>
                        <User className="w-5 h-5 text-white m-auto" strokeWidth={2.2} />
                      </div>
                    }
                  />
                )}
                {(!isTechnician || technicianId) && !isSystemUser && (
                  <SettingsRow
                    onClick={() => (isTechnician ? setIsTechnicianProfileOpen(true) : setIsAdminProfileOpen(true))}
                    title={isTechnician ? 'Meu perfil' : 'Perfil do administrador'}
                    subtitle={isTechnician ? 'Nome e foto' : 'Nome e foto da gerência'}
                    icon={
                      <div className={`w-11 h-11 shrink-0 bg-gradient-to-br from-violet-500 to-indigo-700 ${iconSquircle}`}>
                        <User className="w-5 h-5 text-white m-auto" strokeWidth={2.2} />
                      </div>
                    }
                  />
                )}
                {onLogout && (
                  <SettingsRow
                    onClick={onLogout}
                    title="Sair"
                    subtitle="Encerrar sessão neste dispositivo"
                    danger
                    icon={
                      <div className={`w-11 h-11 shrink-0 bg-gradient-to-br from-red-500 to-rose-700 ${iconSquircle}`}>
                        <LogOut className="w-5 h-5 text-white m-auto" strokeWidth={2.2} />
                      </div>
                    }
                  />
                )}
              </div>
            </section>
          </div>
        </div>
      </main>

      {!isTechnician && (
        <>
          <SystemUsersModal isOpen={isSystemUsersOpen} onClose={() => setIsSystemUsersOpen(false)} refreshTrigger={systemUsersRefreshTrigger} />
          <ZayaAlertsModal isOpen={isZayaAlertsOpen} onClose={() => setIsZayaAlertsOpen(false)} />
          <WorkshopServicesModal isOpen={isServicesModalOpen} onClose={() => setIsServicesModalOpen(false)} />
          <WorkshopPartsModal isOpen={isPartsModalOpen} onClose={() => setIsPartsModalOpen(false)} />
          <PatioChecklistsModal isOpen={isPatioChecklistsOpen} onClose={() => setIsPatioChecklistsOpen(false)} />
          <TvPatioModal isOpen={isTvPatioOpen} onClose={() => setIsTvPatioOpen(false)} />
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
