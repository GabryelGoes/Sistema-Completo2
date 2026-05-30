import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  LayoutGrid,
  Car,
  User,
  ShieldCheck,
  Lock,
  ChevronDown,
  ChevronLeft,
  UsersRound,
} from 'lucide-react';
import {
  iosModalShell,
  iosModalClose,
  iosInput,
  iosModalInsetCard,
  iosAccentPrimaryButton,
  resolveIosModalOverlayClass,
} from './ui/iosModalStyles';
import { IosAccentIconSquircle } from './ui/IosAccentIconSquircle';
import { ModalPortal } from './ui/ModalPortal';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { IosModalHeader } from './ui/IosModalHeader';
import { SYSTEM_NOTIFICATIONS_ICON } from '../constants/systemNotificationsIcon';
import { QUALITY_RADAR_ICON } from '../constants/qualityRadar';
import { ERROR_BULLETIN_ICON } from '../constants/errorBulletinIcon';
import type { SystemUserPermissions, SystemUser } from '../services/apiService';
import {
  getSystemUsers,
  createSystemUser,
  updateSystemUser,
  deleteSystemUser,
  effectivePatioApproveBudgetItems,
} from '../services/apiService';
import { useRegisterModalOpen } from './ui/ModalLayerContext';

/** Switch reutilizável para permissões */
function PermSwitch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 py-2 ${disabled ? 'opacity-60' : ''}`}>
      <div className="min-w-0">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 block">{label}</span>
        {description && <span className="text-xs text-zinc-500 dark:text-zinc-400 block mt-0.5">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-0 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900 disabled:cursor-not-allowed ${
          checked ? 'bg-[#34C759] dark:bg-[#30D158]' : 'bg-zinc-300 dark:bg-zinc-600'
        } ${disabled ? '' : 'cursor-pointer'}`}
      >
        <span
          className={`pointer-events-none inline-block h-6 w-6 shrink-0 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
            checked ? 'translate-x-6' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

/** Cartão com ícone (como na home) + interruptor — módulos da página inicial e hub */
function PermModuleCard({
  iconSrc,
  iconAlt,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  iconSrc: string;
  iconAlt: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-2xl border border-zinc-200/85 bg-white/85 p-3 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] dark:border-zinc-600/70 dark:bg-zinc-900/45 dark:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.35)] ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-[14px] border border-zinc-200/80 bg-zinc-50 ring-1 ring-black/[0.04] dark:border-white/[0.08] dark:bg-zinc-800/90 dark:ring-white/[0.06]">
          <img src={iconSrc} alt={iconAlt} className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug block">{label}</span>
          {description ? (
            <span className="mt-1 block text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{description}</span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative mt-0.5 flex h-7 w-12 shrink-0 items-center rounded-full border-0 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900 ${
          checked ? 'bg-[#34C759] dark:bg-[#30D158]' : 'bg-zinc-300 dark:bg-zinc-600'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`pointer-events-none inline-block h-6 w-6 shrink-0 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
            checked ? 'translate-x-6' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

/** Telas, abas e módulos exibidos na página inicial / hub de configurações (um interruptor por módulo). */
const HOME_MODULE_ACCESS: {
  key: keyof SystemUserPermissions;
  label: string;
  description?: string;
  icon: string;
  iconAlt: string;
}[] = [
  { key: 'access_home', label: 'Tela inicial', description: 'Página inicial e atalho ao hub de configurações', icon: '/logo.png', iconAlt: 'Tela inicial' },
  { key: 'access_reception', label: 'Recepção', description: 'Aba de cadastro de clientes e veículos', icon: '/icons/recepcao-ios.png', iconAlt: 'Recepção' },
  { key: 'access_agenda', label: 'Agenda', description: 'Agendamentos', icon: '/icons/agenda-ios.png', iconAlt: 'Agenda' },
  { key: 'access_patio', label: 'Pátio', description: 'Veículos em atendimento', icon: '/icons/patio-ios.png', iconAlt: 'Pátio' },
  {
    key: 'access_orcamentos',
    label: 'Orçamentos',
    description: 'Hub de orçamentos (aba). Se desligado, o usuário pode manter só o Pátio sem o hub.',
    icon: '/icons/orcamentos-ios.png',
    iconAlt: 'Orçamentos',
  },
  { key: 'access_laboratorio', label: 'Laboratório', description: 'Módulos e eletrônica', icon: '/icons/laboratorio-ios.png', iconAlt: 'Laboratório' },
  {
    key: 'access_relatorios',
    label: 'Relatórios',
    description: 'Centro de relatórios na página inicial — entradas, entregas, técnicos, garantia e modelos',
    icon: '/icons/relatorios-ios.svg',
    iconAlt: 'Relatórios',
  },
  {
    key: 'access_boletim_erros',
    label: 'Boletim de Erros',
    description: 'Base de DTC, sintomas, soluções e anexos técnicos',
    icon: ERROR_BULLETIN_ICON,
    iconAlt: 'Boletim de Erros',
  },
  {
    key: 'access_radar_qualidade',
    label: 'Radar de Qualidade',
    description: 'Registro de ocorrências por mecânico e relatório da equipe',
    icon: QUALITY_RADAR_ICON,
    iconAlt: 'Radar de Qualidade',
  },
  { key: 'access_tv_patio', label: 'TV do Pátio', description: 'Modal na home e link do painel externo nas configurações', icon: '/icons/tv-patio-ios.png', iconAlt: 'TV do Pátio' },
  {
    key: 'access_centro_atendimento',
    label: 'Central do atendimento',
    description: 'Acompanhamento de OS em tela cheia',
    icon: '/icons/recepcao-ios.png',
    iconAlt: 'Central do atendimento',
  },
  { key: 'access_estoque_pecas', label: 'Estoque de peças', description: 'Catálogo e estoque na home', icon: '/icons/estoque-ios.png', iconAlt: 'Estoque de peças' },
  {
    key: 'access_settings',
    label: 'Preferências da oficina',
    description: 'Tema, efeitos e modo cinema (cor global só com acesso completo)',
    icon: '/icons/configuracoes-ios.png',
    iconAlt: 'Preferências',
  },
  { key: 'access_change_passwords', label: 'Alterar senhas', description: 'Senha de gerência e exclusão de veículos', icon: '/icons/senhas-ios.png', iconAlt: 'Senhas' },
  { key: 'access_technicians', label: 'Técnicos', description: 'Lista para atribuição nos cards do Pátio', icon: '/icons/usuarios-ios.png', iconAlt: 'Técnicos' },
  { key: 'access_servicos_oficina', label: 'Serviços da oficina', description: 'Catálogo no hub de configurações', icon: '/icons/servicos-oficina-ios.png', iconAlt: 'Serviços' },
  { key: 'access_checklists_patio', label: 'Checklists do Pátio', description: 'Modelos por etapa', icon: '/icons/checklist-patio-ios.png', iconAlt: 'Checklists' },
  {
    key: 'access_notificacoes_sistema',
    label: 'Notificações do sistema',
    description: 'Modal de alertas e lembretes',
    icon: SYSTEM_NOTIFICATIONS_ICON,
    iconAlt: 'Notificações',
  },
];

/** Permissões dentro do Pátio/Laboratório */
const PATIO_DATA_LABELS: { key: keyof SystemUserPermissions; label: string }[] = [
  { key: 'patio_edit_ficha', label: 'Editar dados da ficha' },
  { key: 'patio_edit_queixa', label: 'Editar queixa do cliente' },
  { key: 'patio_edit_delivery_date', label: 'Editar data de entrega' },
  { key: 'patio_edit_mileage', label: 'Editar quilometragem' },
  { key: 'patio_assign_technician', label: 'Alterar técnico responsável' },
];

const PATIO_OTHER_LABELS: { key: keyof SystemUserPermissions; label: string }[] = [
  { key: 'patio_edit_budgets', label: 'Criar e editar orçamentos' },
  { key: 'patio_add_comments', label: 'Adicionar comentários' },
  { key: 'patio_archive_card', label: 'Arquivar card (Entregue)' },
  { key: 'patio_delete_cards', label: 'Excluir cards (veículos/módulos)' },
];

const DEFAULT_PERMISSIONS: SystemUserPermissions = {};

function userListInitial(u: SystemUser): string {
  const n = (u.display_name || u.username || '?').trim();
  return n ? n.charAt(0).toUpperCase() : '?';
}

/** Bloco estilo iOS Ajustes com `<summary>` customizado */
function CollapsibleSection({
  title,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details defaultOpen={defaultOpen} className={`${iosModalInsetCard} group overflow-hidden`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 marker:content-none [&::-webkit-details-marker]:hidden hover:bg-zinc-100/60 dark:hover:bg-white/[0.04]">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-200/80 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            {icon}
          </span>
          <span className="text-[15px] font-semibold text-zinc-900 dark:text-white">{title}</span>
        </span>
        <ChevronDown className="h-5 w-5 shrink-0 text-zinc-400 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="border-t border-zinc-200/70 px-4 pb-4 pt-1 dark:border-white/[0.06]">{children}</div>
    </details>
  );
}

interface SystemUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Quando mudar (ex.: após admin salvar perfil), recarrega a lista se o modal estiver desbloqueado */
  refreshTrigger?: number;
}

export const SystemUsersModal: React.FC<SystemUsersModalProps> = ({ isOpen, onClose, refreshTrigger }) => {
  const isDesktopShell = useDesktopShellLayout();
  const [adminPassword, setAdminPassword] = useState('');
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formJobTitle, setFormJobTitle] = useState('');
  const [formIsTechnician, setFormIsTechnician] = useState(false);
  const [formPermissions, setFormPermissions] = useState<SystemUserPermissions>({ ...DEFAULT_PERMISSIONS });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingApproveUserId, setTogglingApproveUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setUnlocked(false);
      setAdminPassword('');
      setUsers([]);
      setEditingId(null);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && unlocked && adminPassword && refreshTrigger != null && refreshTrigger > 0) {
      loadUsers();
    }
  }, [refreshTrigger]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const list = await getSystemUsers(adminPassword);
      setUsers(list);
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Senha incorreta.');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    if (!adminPassword) return;
    try {
      const list = await getSystemUsers(adminPassword);
      setUsers(list);
    } catch (_) {}
  };

  const startAdd = () => {
    setEditingId('new');
    setFormUsername('');
    setFormPassword('');
    setFormDisplayName('');
    setFormJobTitle('');
    setFormIsTechnician(false);
    setFormPermissions({ ...DEFAULT_PERMISSIONS });
    setError(null);
  };

  const startEdit = (u: SystemUser) => {
    setEditingId(u.id);
    setFormUsername(u.username);
    setFormPassword('');
    setFormDisplayName(u.display_name || '');
    setFormJobTitle(u.job_title ?? '');
    setFormIsTechnician(u.is_technician ?? false);
    setFormPermissions({ ...DEFAULT_PERMISSIONS, ...u.permissions });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError(null);
  };

  const setPerm = (key: keyof SystemUserPermissions, value: boolean) => {
    setFormPermissions((p) => ({ ...p, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassword) return;
    setError(null);
    setSaving(true);
    try {
      if (editingId === 'new') {
        if (!formUsername.trim()) {
          setError('Informe o nome de usuário.');
          setSaving(false);
          return;
        }
        if (!formPassword || formPassword.length < 4) {
          setError('Senha deve ter no mínimo 4 caracteres.');
          setSaving(false);
          return;
        }
        const created = await createSystemUser(adminPassword, {
          username: formUsername.trim(),
          password: formPassword,
          displayName: formDisplayName.trim() || undefined,
          permissions: formPermissions,
          isTechnician: formIsTechnician,
          jobTitle: formJobTitle.trim() || null,
        });
        setUsers((prev) => [...prev, created]);
      } else {
        const updated = await updateSystemUser(editingId, adminPassword, {
          password: formPassword.length >= 4 ? formPassword : undefined,
          displayName: formDisplayName.trim() || undefined,
          permissions: formPermissions,
          isTechnician: formIsTechnician,
          jobTitle: formJobTitle.trim() || null,
        });
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      }
      cancelEdit();
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickApprovePermission = async (u: SystemUser, enabled: boolean) => {
    if (!adminPassword) return;
    setTogglingApproveUserId(u.id);
    setError(null);
    try {
      const nextPerms: SystemUserPermissions = { ...(u.permissions || {}), patio_approve_budget_items: enabled };
      const updated = await updateSystemUser(u.id, adminPassword, {
        permissions: nextPerms,
        displayName: u.display_name?.trim() || undefined,
        isTechnician: u.is_technician ?? false,
        jobTitle: u.job_title ?? null,
      });
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar permissão de aprovação.');
    } finally {
      setTogglingApproveUserId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!adminPassword || !confirm('Excluir este usuário? Ele não poderá mais entrar no sistema.')) return;
    setDeletingId(id);
    try {
      await deleteSystemUser(id, adminPassword);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      if (editingId === id) cancelEdit();
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir.');
    } finally {
      setDeletingId(null);
    }
  };

  useRegisterModalOpen(isOpen);

  if (!isOpen) return null;

  return (
    <ModalPortal>
    <div className={resolveIosModalOverlayClass(isDesktopShell)}>
      <div className={`${iosModalShell} max-w-3xl w-full max-h-[min(92vh,860px)]`}>
        <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-zinc-200/70 bg-gradient-to-b from-white/90 to-white/40 px-5 pb-4 pt-7 pr-14 dark:border-white/[0.06] dark:from-zinc-900/80 dark:to-zinc-950/40">
            <IosModalHeader
              icon={<img src="/icons/usuarios-ios.png" alt="" className="h-full w-full min-h-0 object-cover" />}
              title="Usuários do sistema"
              subtitle="Logins da oficina, permissões por módulo e aprovação de orçamentos"
              gradientClass="from-violet-500 to-indigo-700"
            />
          </div>

          {!unlocked ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-6 sm:px-8">
              <form onSubmit={handleUnlock} className={`${iosModalInsetCard} mx-auto w-full max-w-md space-y-5 p-6 sm:p-8`}>
                <div className="flex flex-col items-center text-center">
                  <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-600 ring-1 ring-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20">
                    <Lock className="h-7 w-7" strokeWidth={2} />
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">Confirmar gerência</h3>
                  <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                    Digite a senha de <strong className="font-semibold text-zinc-800 dark:text-zinc-200">Gerência</strong> para
                    listar e editar usuários do sistema.
                  </p>
                </div>
                <div className="space-y-3">
                  <label className="sr-only" htmlFor="system-users-admin-password">
                    Senha do administrador
                  </label>
                  <input
                    id="system-users-admin-password"
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Senha do admin"
                    autoComplete="current-password"
                    className={iosInput}
                  />
                  <button
                    type="submit"
                    disabled={loading || !adminPassword.trim()}
                    className={`${iosAccentPrimaryButton} flex w-full items-center justify-center gap-2 py-3.5`}
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                    {loading ? 'Verificando…' : 'Continuar'}
                  </button>
                </div>
                {error ? (
                  <p className="rounded-xl bg-red-500/10 px-3 py-2 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
                ) : null}
              </form>
            </div>
          ) : editingId ? (
            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200/70 px-5 py-3 dark:border-white/[0.06] sm:px-8">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-medium text-[#007AFF] transition-colors hover:bg-[#007AFF]/10 dark:text-[#64B5FF] dark:hover:bg-[#64B5FF]/10"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Lista
                </button>
                <span className="min-w-0 flex-1 truncate text-center text-[13px] font-medium text-zinc-500 dark:text-zinc-400 sm:text-left">
                  {editingId === 'new' ? 'Novo usuário' : formUsername}
                </span>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8">
                <section className={`${iosModalInsetCard} space-y-4 p-4 sm:p-5`}>
                  <h3 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    <User className="h-4 w-4 text-violet-600 dark:text-violet-400" strokeWidth={2} />
                    Identidade
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Usuário (login)</label>
                      <input
                        type="text"
                        value={formUsername}
                        onChange={(e) => setFormUsername(e.target.value)}
                        placeholder="Ex: joao"
                        disabled={editingId !== 'new'}
                        className="w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-[15px] text-zinc-900 shadow-sm focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 disabled:opacity-60 dark:border-white/[0.08] dark:bg-zinc-950/50 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {editingId === 'new' ? 'Senha (mín. 4 caracteres)' : 'Nova senha (opcional)'}
                      </label>
                      <input
                        type="password"
                        value={formPassword}
                        onChange={(e) => setFormPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-[15px] text-zinc-900 shadow-sm focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.08] dark:bg-zinc-950/50 dark:text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Nome de exibição (opcional)</label>
                    <input
                      type="text"
                      value={formDisplayName}
                      onChange={(e) => setFormDisplayName(e.target.value)}
                      placeholder="Ex: João Silva"
                      className="w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-[15px] text-zinc-900 shadow-sm focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.08] dark:bg-zinc-950/50 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">Cargo (opcional)</label>
                    <input
                      type="text"
                      value={formJobTitle}
                      onChange={(e) => setFormJobTitle(e.target.value)}
                      placeholder="Ex: Mecânico, Recepcionista"
                      className="w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-[15px] text-zinc-900 shadow-sm focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.08] dark:bg-zinc-950/50 dark:text-white"
                    />
                  </div>
                  <div className="border-t border-zinc-200/70 pt-3 dark:border-white/[0.06]">
                    <PermSwitch
                      label="Técnico da oficina"
                      description="Aparece como mecânico nos cards do Pátio/Laboratório"
                      checked={formIsTechnician}
                      onChange={setFormIsTechnician}
                    />
                  </div>
                </section>

                <div className="rounded-2xl border-2 border-amber-300/80 bg-gradient-to-br from-amber-50 to-orange-50/80 p-4 dark:border-amber-700/50 dark:from-amber-950/40 dark:to-orange-950/20">
                  <PermSwitch
                    label="Acesso completo ao sistema"
                    description="Igual ao administrador: todas as telas, Administração e todas as ações no Pátio/Laboratório."
                    checked={!!formPermissions.full_access}
                    onChange={(v) => setPerm('full_access', v)}
                  />
                  {formPermissions.full_access ? (
                    <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs leading-snug text-amber-900 dark:text-amber-200">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      As permissões detalhadas abaixo são ignoradas quando o acesso completo está ativo.
                    </p>
                  ) : null}
                </div>

                <CollapsibleSection
                  title="Telas e navegação"
                  icon={<LayoutGrid className="h-4 w-4" strokeWidth={2} />}
                  defaultOpen
                >
                  <p className="mb-3 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    Abas, ícones da página inicial e entradas do hub de configurações.
                  </p>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {HOME_MODULE_ACCESS.map(({ key, label, description, icon, iconAlt }) => (
                      <PermModuleCard
                        key={key}
                        iconSrc={icon}
                        iconAlt={iconAlt}
                        label={label}
                        description={description}
                        checked={!!formPermissions[key]}
                        onChange={(v) => setPerm(key, v)}
                        disabled={!!formPermissions.full_access}
                      />
                    ))}
                  </div>
                </CollapsibleSection>

                <CollapsibleSection title="Pátio e Laboratório" icon={<Car className="h-4 w-4" strokeWidth={2} />} defaultOpen>
                  <p className="mb-3 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    Ações dentro dos cards (com acesso às telas Pátio/Laboratório).
                  </p>
                  <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-3 dark:border-zinc-600/60 dark:bg-zinc-950/40">
                    <p className="pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Dados do card</p>
                    {PATIO_DATA_LABELS.map(({ key, label }) => (
                      <PermSwitch
                        key={key}
                        label={label}
                        checked={!!formPermissions[key]}
                        onChange={(v) => setPerm(key, v)}
                        disabled={!!formPermissions.full_access}
                      />
                    ))}
                    <p className="border-t border-zinc-200/80 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 dark:border-zinc-600/60">
                      Orçamentos e ações
                    </p>
                    {PATIO_OTHER_LABELS.map(({ key, label }) => (
                      <PermSwitch
                        key={key}
                        label={label}
                        checked={!!formPermissions[key]}
                        onChange={(v) => setPerm(key, v)}
                        disabled={!!formPermissions.full_access}
                      />
                    ))}
                    {formPermissions.full_access ? (
                      <p className="mt-2 border-t border-zinc-200/80 pt-2 text-xs text-zinc-500 dark:border-zinc-600/60 dark:text-zinc-400">
                        Com acesso completo, aprovar itens do orçamento fica sempre permitido.
                      </p>
                    ) : (
                      <PermSwitch
                        label="Aprovar itens do orçamento"
                        description="Aprovar ou reprovar serviços e peças no modal de orçamento. Se nunca foi salvo, segue a regra de «Criar e editar orçamentos»."
                        checked={effectivePatioApproveBudgetItems(formPermissions)}
                        onChange={(v) => setPerm('patio_approve_budget_items', v)}
                        disabled={!!formPermissions.full_access}
                      />
                    )}
                  </div>
                </CollapsibleSection>

                {error ? <p className="text-center text-sm text-red-600 dark:text-red-400">{error}</p> : null}
              </div>

              <div className="flex shrink-0 gap-3 border-t border-zinc-200/80 bg-white/90 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md dark:border-white/[0.08] dark:bg-zinc-950/90 sm:px-8">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="flex-1 rounded-2xl border border-zinc-300/90 py-3.5 text-[15px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800/80 sm:flex-none sm:px-8"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`${iosAccentPrimaryButton} flex flex-[2] items-center justify-center gap-2 py-3.5 sm:flex-1`}
                >
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                  Salvar
                </button>
              </div>
            </form>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 flex-col gap-3 border-b border-zinc-200/70 px-5 py-4 dark:border-white/[0.06] sm:flex-row sm:items-center sm:justify-between sm:px-8">
                <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <UsersRound className="h-4 w-4 shrink-0 text-zinc-400" />
                  <span>
                    <strong className="font-semibold text-zinc-900 dark:text-white">{users.length}</strong>
                    {users.length === 1 ? ' usuário' : ' usuários'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={startAdd}
                  className={`${iosAccentPrimaryButton} inline-flex w-full items-center justify-center gap-2 py-3 sm:w-auto sm:px-5`}
                >
                  <Plus className="h-4 w-4" />
                  Novo usuário
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8">
                {users.length > 0 ? (
                  <section className={`${iosModalInsetCard} overflow-hidden`}>
                    <div className="border-b border-amber-200/60 bg-amber-50/50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-950/25">
                      <div className="flex gap-3">
                        <IosAccentIconSquircle variant="row" strokeWidth={2.2} className="shrink-0 scale-95">
                          <img src="/icons/orcamentos-ios.png" alt="" className="h-full w-full object-cover" />
                        </IosAccentIconSquircle>
                        <div className="min-w-0">
                          <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-white">Aprovação de orçamento</h3>
                          <p className="mt-0.5 text-[12px] leading-snug text-zinc-600 dark:text-zinc-400">
                            Quem pode aprovar ou reprovar itens no Pátio e no Laboratório. Quem tem{' '}
                            <strong className="text-zinc-800 dark:text-zinc-200">acesso completo</strong> já dispensa esta opção.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                      {users.map((u) => {
                        const label = (u.display_name || '').trim() || u.username;
                        const sub = label !== u.username ? u.username : u.job_title || undefined;
                        if (u.permissions?.full_access) {
                          return (
                            <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
                              <div className="min-w-0">
                                <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">Acesso completo</span>
                              </div>
                              <ShieldCheck className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                            </div>
                          );
                        }
                        return (
                          <div key={u.id} className="px-2 py-1">
                            <PermSwitch
                              label={label}
                              description={sub}
                              checked={effectivePatioApproveBudgetItems(u.permissions || {})}
                              onChange={(v) => void handleQuickApprovePermission(u, v)}
                              disabled={togglingApproveUserId === u.id}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                <div className="space-y-3">
                  {users.length === 0 ? (
                    <div className={`${iosModalInsetCard} py-12 text-center`}>
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-200/80 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                        <UsersRound className="h-6 w-6" />
                      </div>
                      <p className="text-[15px] font-medium text-zinc-800 dark:text-zinc-200">Nenhum usuário ainda</p>
                      <p className="mx-auto mt-2 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
                        Crie um login para a equipe entrar com usuário e senha neste dispositivo.
                      </p>
                      <button
                        type="button"
                        onClick={startAdd}
                        className={`${iosAccentPrimaryButton} mx-auto mt-6 inline-flex items-center gap-2 px-6`}
                      >
                        <Plus className="h-4 w-4" />
                        Criar primeiro usuário
                      </button>
                    </div>
                  ) : (
                    users.map((u) => (
                      <div
                        key={u.id}
                        className={`${iosModalInsetCard} flex items-center gap-3 p-3.5 sm:gap-4`}
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-200 to-zinc-300 text-lg font-semibold text-zinc-700 shadow-inner dark:from-zinc-700 dark:to-zinc-800 dark:text-zinc-100">
                          {userListInitial(u)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-zinc-900 dark:text-white">{u.username}</p>
                          {(u.display_name || u.job_title) && (
                            <p className="truncate text-[13px] text-zinc-500 dark:text-zinc-400">
                              {[u.display_name, u.job_title].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {u.permissions?.full_access ? (
                              <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                                Acesso total
                              </span>
                            ) : null}
                            {u.is_technician ? (
                              <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                                Técnico
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(u)}
                            className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-600 transition-colors hover:bg-zinc-200/90 dark:text-zinc-300 dark:hover:bg-zinc-800/80"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(u.id)}
                            disabled={deletingId === u.id}
                            className="flex h-10 w-10 items-center justify-center rounded-xl text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
                            title="Excluir"
                          >
                            {deletingId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};
