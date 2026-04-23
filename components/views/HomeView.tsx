import React, { useState } from 'react';
import {
  ClipboardList,
  ChevronRight,
  LogOut,
  User,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { IosAccentIconSquircle } from '../ui/IosAccentIconSquircle';
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
import { COLORFUL_TAB_ACCENTS, type NavigationTabId } from '../../utils/appAppearance';

/** Cores extras na home quando o modo colorido está ligado (não são abas da barra). */
type HomeSquircleExtraKey =
  | NavigationTabId
  | 'servicos'
  | 'pecas'
  | 'tv'
  | 'settings_gear'
  | 'users'
  | 'zaya'
  | 'checklists'
  | 'patio_link'
  | 'lock'
  | 'profile'
  | 'logout';

function homeSquircleAccentHex(colorful: boolean | undefined, key: HomeSquircleExtraKey): string | undefined {
  if (!colorful) return undefined;
  switch (key) {
    case 'servicos':
      return '#EAB308';
    case 'pecas':
      return '#EA580C';
    case 'tv':
    case 'checklists':
    case 'patio_link':
      return COLORFUL_TAB_ACCENTS.patio;
    case 'zaya':
      return '#7C3AED';
    case 'lock':
      return '#78716C';
    case 'logout':
      return '#DC2626';
    case 'settings_gear':
    case 'users':
    case 'profile':
    case 'home':
      return COLORFUL_TAB_ACCENTS.home;
    default:
      return COLORFUL_TAB_ACCENTS[key as NavigationTabId];
  }
}

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
  /** Com modo colorido, cada ícone da home usa a cor do módulo correspondente. */
  colorfulNavigation?: boolean;
}

/** Alinhado ao modal TV do pátio: vidro, sombra suave, cantos iOS. */
const iosCard =
  'rounded-[22px] border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-zinc-900/40 backdrop-blur-2xl shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]';

const iosSectionTitle =
  'text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-950 dark:text-zinc-400 mb-1';

const iosSectionHint = 'text-[13px] text-zinc-950 dark:text-zinc-400 mb-4 leading-relaxed';

const OPERATIONAL_APPS: {
  id: HomeAppId;
  label: string;
  icon: React.ReactElement;
}[] = [
  {
    id: 'reception',
    label: 'Recepção',
    icon: <img src="/icons/recepcao.svg" alt="Recepção" className="h-6 w-6 object-contain" />,
  },
  {
    id: 'agenda',
    label: 'Agenda',
    icon: <img src="/icons/agenda.svg" alt="Agenda" className="h-6 w-6 object-contain" />,
  },
  {
    id: 'patio',
    label: 'Pátio',
    icon: <img src="/icons/patio.svg" alt="Pátio" className="h-6 w-6 object-contain" />,
  },
  {
    id: 'laboratorio',
    label: 'Laboratório',
    icon: <img src="/icons/laboratorio.svg" alt="Laboratório" className="h-6 w-6 object-contain" />,
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
        {subtitle ? <span className="block text-[12px] text-zinc-950 dark:text-zinc-400 mt-0.5">{subtitle}</span> : null}
      </span>
      <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400 group-hover:text-brand-yellow transition-colors" />
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
  colorfulNavigation = false,
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
      {/* Fundo um pouco mais acinzentado para contraste com os cartões */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-zinc-200/90 via-zinc-100 to-zinc-200/85 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950" />
      <div className="fixed inset-0 -z-10 pointer-events-none opacity-35 dark:opacity-25 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(251,191,36,0.18),transparent),radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(56,189,248,0.1),transparent),radial-gradient(ellipse_50%_35%_at_0%_100%,rgba(167,139,250,0.08),transparent)]" />
      <div className="fixed inset-0 -z-10 pointer-events-none backdrop-blur-[2px]" />

      {/* Cabeçalho em vidro — alinhado ao topo (safe area apenas onde necessário) */}
      <header className="relative z-10 pt-[max(0.5rem,env(safe-area-inset-top))] pb-4 px-4 sm:px-6 border-b border-zinc-200/70 dark:border-white/[0.08] bg-white/70 dark:bg-zinc-950/60 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.55)_inset] dark:shadow-none">
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-950 dark:text-zinc-400 mb-0.5">Oficina</p>
            <h1 className="text-[1.35rem] sm:text-[1.65rem] font-semibold tracking-tight text-zinc-900 dark:text-white leading-tight">
              Rei do ABS
            </h1>
            <p className="text-[13px] text-zinc-950 dark:text-zinc-400 mt-1 flex items-center gap-1.5 flex-wrap">
              <Sparkles className="w-3.5 h-3.5 text-brand-yellow shrink-0" />
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
            <section className="pt-5 pb-2 lg:pt-6 lg:pb-0">
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
                      <IosAccentIconSquircle
                        variant="tile"
                        className="transition-transform duration-300 group-hover:scale-105"
                        strokeWidth={2.2}
                        accentHex={homeSquircleAccentHex(colorfulNavigation, app.id as NavigationTabId)}
                      >
                        {app.icon}
                      </IosAccentIconSquircle>
                      <span className="text-[15px] font-semibold text-zinc-900 dark:text-white text-center tracking-tight">
                        {app.label}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div
                  className={`grid grid-cols-2 gap-3 ${showAdminSection ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}
                >
                  {operationalForView.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => onOpenApp(app.id)}
                      className={`group flex flex-col items-center gap-3 p-4 sm:p-5 text-center ${iosCard} border-[#007AFF]/0 hover:border-[#007AFF]/15 dark:hover:border-[#0A84FF]/20 hover:shadow-[0_12px_40px_-12px_rgba(0,122,255,0.2)] transition-all duration-300 active:scale-[0.99]`}
                    >
                      <IosAccentIconSquircle
                        variant="tile"
                        className="transition-transform duration-300 group-hover:scale-105"
                        strokeWidth={2.2}
                        accentHex={homeSquircleAccentHex(colorfulNavigation, app.id as NavigationTabId)}
                      >
                        {app.icon}
                      </IosAccentIconSquircle>
                      <span className="text-[15px] font-semibold text-zinc-900 dark:text-white leading-tight">{app.label}</span>
                    </button>
                  ))}
                  {showAdminSection && (
                    <>
                      <button
                        type="button"
                        onClick={() => setIsServicesModalOpen(true)}
                        className={`group flex flex-col items-center gap-3 p-4 sm:p-5 text-center ${iosCard} border-[#007AFF]/0 hover:border-[#007AFF]/15 dark:hover:border-[#0A84FF]/20 hover:shadow-[0_12px_40px_-12px_rgba(0,122,255,0.2)] transition-all duration-300 active:scale-[0.99]`}
                      >
                        <IosAccentIconSquircle
                          variant="tile"
                          className="transition-transform duration-300 group-hover:scale-105"
                          strokeWidth={2.2}
                          accentHex={homeSquircleAccentHex(colorfulNavigation, 'servicos')}
                        >
                          <img
                            src="/icons/servicos-oficina.svg"
                            alt="Serviços da oficina"
                            className="h-6 w-6 object-contain"
                          />
                        </IosAccentIconSquircle>
                        <span className="text-[15px] font-semibold text-zinc-900 dark:text-white leading-tight">
                          Serviços da oficina
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPartsModalOpen(true)}
                        className={`group flex flex-col items-center gap-3 p-4 sm:p-5 text-center ${iosCard} border-[#007AFF]/0 hover:border-[#007AFF]/15 dark:hover:border-[#0A84FF]/20 hover:shadow-[0_12px_40px_-12px_rgba(0,122,255,0.2)] transition-all duration-300 active:scale-[0.99]`}
                      >
                        <IosAccentIconSquircle
                          variant="tile"
                          className="transition-transform duration-300 group-hover:scale-105"
                          strokeWidth={2.2}
                          accentHex={homeSquircleAccentHex(colorfulNavigation, 'pecas')}
                        >
                          <img
                            src="/icons/workshop-services.svg"
                            alt="Estoque de peças"
                            className="h-6 w-6 object-contain"
                          />
                        </IosAccentIconSquircle>
                        <span className="text-[15px] font-semibold text-zinc-900 dark:text-white leading-tight">
                          Estoque de peças
                        </span>
                      </button>
                    </>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setIsTvPatioOpen(true)}
                className={`mt-5 w-full flex items-center gap-4 p-4 sm:p-5 text-left ${iosCard} border-[#007AFF]/20 dark:border-[#0A84FF]/25 bg-gradient-to-br from-sky-50/95 to-white/80 dark:from-blue-950/45 dark:to-zinc-900/50 hover:border-[#007AFF]/35 dark:hover:border-[#0A84FF]/35 hover:shadow-[0_12px_36px_-10px_rgba(0,122,255,0.28)] transition-all duration-300 active:scale-[0.995]`}
              >
                <IosAccentIconSquircle
                  variant="modal"
                  strokeWidth={2.2}
                  accentHex={homeSquircleAccentHex(colorfulNavigation, 'tv')}
                >
                  <img src="/icons/tv-patio.svg" alt="TV do Pátio" className="h-6 w-6 object-contain" />
                </IosAccentIconSquircle>
                <div className="flex-1 min-w-0">
                  <span className="text-[15px] font-semibold text-zinc-900 dark:text-white block leading-tight">
                    Configurações da TV do Pátio
                  </span>
                  <span className="text-[12px] text-zinc-950 dark:text-zinc-400 mt-0.5">Slides e meta semanal</span>
                </div>
                <ChevronRight className="w-5 h-5 shrink-0 text-zinc-400" />
              </button>
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
                        <IosAccentIconSquircle
                          variant="row"
                          strokeWidth={2.2}
                          accentHex={homeSquircleAccentHex(colorfulNavigation, 'settings_gear')}
                        >
                          <img src="/icons/configuracoes.svg" alt="Configurações" className="h-5 w-5 object-contain" />
                        </IosAccentIconSquircle>
                      }
                    />
                  )}
                  {perms.access_change_passwords && onOpenChangePasswords && (
                    <SettingsRow
                      onClick={onOpenChangePasswords}
                      title="Alterar senhas"
                      subtitle="Segurança de acessos"
                      icon={
                        <IosAccentIconSquircle
                          variant="row"
                          strokeWidth={2.2}
                          accentHex={homeSquircleAccentHex(colorfulNavigation, 'lock')}
                        >
                          <img src="/icons/senhas.svg" alt="Alterar senhas" className="h-5 w-5 object-contain" />
                        </IosAccentIconSquircle>
                      }
                    />
                  )}
                </div>
              </section>
            )}

            {showAdminSection && (
              <section className="pt-2 pb-2 lg:pt-0">
                <p className={iosSectionTitle}>Administração</p>
                <p className={iosSectionHint}>Usuários, avisos, TV e configurações — serviços e peças ficam em Operação</p>
                <div className={`${iosCard} p-2 lg:grid lg:grid-cols-2 lg:gap-0 lg:p-2`}>
                  <div className="lg:grid lg:grid-cols-1 space-y-0.5">
                    <SettingsRow
                      onClick={() => setIsSystemUsersOpen(true)}
                      title="Usuários do sistema"
                      subtitle="Acessos e permissões"
                      icon={
                        <IosAccentIconSquircle
                          variant="row"
                          strokeWidth={2.2}
                          accentHex={homeSquircleAccentHex(colorfulNavigation, 'users')}
                        >
                          <img src="/icons/usuarios-sistema.svg" alt="Usuários do sistema" className="h-5 w-5 object-contain" />
                        </IosAccentIconSquircle>
                      }
                    />
                    <SettingsRow
                      onClick={() => setIsZayaAlertsOpen(true)}
                      title="Avisos da Zaya"
                      subtitle="Etapas, orçamentos e destinatários"
                      icon={
                        <IosAccentIconSquircle
                          variant="row"
                          strokeWidth={2.2}
                          accentHex={homeSquircleAccentHex(colorfulNavigation, 'zaya')}
                        >
                          <Sparkles />
                        </IosAccentIconSquircle>
                      }
                    />
                    <SettingsRow
                      onClick={() => onOpenApp('settings')}
                      title="Configurações"
                      subtitle="Oficina e integrações"
                      icon={
                        <IosAccentIconSquircle
                          variant="row"
                          strokeWidth={2.2}
                          accentHex={homeSquircleAccentHex(colorfulNavigation, 'settings_gear')}
                        >
                          <img src="/icons/configuracoes.svg" alt="Configurações" className="h-5 w-5 object-contain" />
                        </IosAccentIconSquircle>
                      }
                    />
                  </div>
                  <div className="lg:grid lg:grid-cols-1 space-y-0.5 lg:border-l lg:border-zinc-200/60 dark:lg:border-white/[0.06] lg:pl-2">
                    <SettingsRow
                      onClick={() => setIsPatioChecklistsOpen(true)}
                      title="Checklists do Pátio"
                      subtitle="Modelos por etapa"
                      icon={
                        <IosAccentIconSquircle
                          variant="row"
                          strokeWidth={2.2}
                          accentHex={homeSquircleAccentHex(colorfulNavigation, 'checklists')}
                        >
                          <img src="/icons/checklist-patio.svg" alt="Checklists do Pátio" className="h-5 w-5 object-contain" />
                        </IosAccentIconSquircle>
                      }
                    />
                    <a
                      href="https://patio-view.vercel.app/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group w-full flex items-center gap-3 px-3 py-3 sm:px-4 sm:py-3.5 text-left rounded-2xl transition-all duration-200 hover:bg-zinc-100/90 dark:hover:bg-white/[0.06] active:scale-[0.99]"
                    >
                      <IosAccentIconSquircle
                        variant="row"
                        strokeWidth={2.2}
                        accentHex={homeSquircleAccentHex(colorfulNavigation, 'patio_link')}
                      >
                        <img src="/icons/patio.svg" alt="Pátio" className="h-5 w-5 object-contain" />
                      </IosAccentIconSquircle>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-medium text-zinc-900 dark:text-white leading-snug">
                          Painel do Pátio (TV)
                        </span>
                        <span className="block text-[12px] text-zinc-950 dark:text-zinc-400 mt-0.5">Abrir em nova aba</span>
                      </span>
                      <ExternalLink className="w-5 h-5 shrink-0 text-zinc-400 group-hover:text-brand-yellow transition-colors" />
                    </a>
                    <SettingsRow
                      onClick={() => setIsChangePasswordsOpen(true)}
                      title="Alterar senhas"
                      subtitle="Gerência e equipe"
                      icon={
                        <IosAccentIconSquircle
                          variant="row"
                          strokeWidth={2.2}
                          accentHex={homeSquircleAccentHex(colorfulNavigation, 'lock')}
                        >
                          <img src="/icons/senhas.svg" alt="Alterar senhas" className="h-5 w-5 object-contain" />
                        </IosAccentIconSquircle>
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
                        <IosAccentIconSquircle
                          variant="row"
                          strokeWidth={2.2}
                          accentHex={homeSquircleAccentHex(colorfulNavigation, 'profile')}
                        >
                          <img src="/icons/perfil.svg" alt="Configurações de perfil" className="h-5 w-5 object-contain" />
                        </IosAccentIconSquircle>
                      }
                  />
                )}
                {(!isTechnician || technicianId) && !isSystemUser && (
                  <SettingsRow
                    onClick={() => (isTechnician ? setIsTechnicianProfileOpen(true) : setIsAdminProfileOpen(true))}
                    title={isTechnician ? 'Meu perfil' : 'Perfil do administrador'}
                    subtitle={isTechnician ? 'Nome e foto' : 'Nome e foto da gerência'}
                      icon={
                        <IosAccentIconSquircle
                          variant="row"
                          strokeWidth={2.2}
                          accentHex={homeSquircleAccentHex(colorfulNavigation, 'profile')}
                        >
                          <User />
                        </IosAccentIconSquircle>
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
                        <IosAccentIconSquircle
                          variant="row"
                          strokeWidth={2.2}
                          accentHex={homeSquircleAccentHex(colorfulNavigation, 'logout')}
                        >
                          <LogOut />
                        </IosAccentIconSquircle>
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
          <ChangePasswordsModal isOpen={isChangePasswordsOpen} onClose={() => setIsChangePasswordsOpen(false)} />
        </>
      )}
      <TvPatioModal isOpen={isTvPatioOpen} onClose={() => setIsTvPatioOpen(false)} />
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
