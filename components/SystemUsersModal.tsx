import React, { useState, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Loader2, LayoutGrid, Car, User, ShieldCheck } from 'lucide-react';
import { iosModalOverlay, iosModalShell, iosModalClose, iosInput } from './ui/iosModalStyles';
import { IosAccentIconSquircle } from './ui/IosAccentIconSquircle';
import { IosModalHeader } from './ui/IosModalHeader';
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
    icon: '/icons/tema-sistema-ios.png',
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

interface SystemUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Quando mudar (ex.: após admin salvar perfil), recarrega a lista se o modal estiver desbloqueado */
  refreshTrigger?: number;
}

export const SystemUsersModal: React.FC<SystemUsersModalProps> = ({ isOpen, onClose, refreshTrigger }) => {
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
    <div className={iosModalOverlay}>
      <div className={`${iosModalShell} max-w-3xl w-full max-h-[92vh]`}>
        <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="px-5 sm:px-8 pt-7 pb-3 pr-14 shrink-0">
            <IosModalHeader
              icon={<img src="/icons/usuarios-ios.png" alt="" className="h-full w-full min-h-0 object-cover" />}
              title="Usuários do sistema"
              subtitle="Logins, permissões de telas e módulos, e aprovação de orçamentos"
              gradientClass="from-violet-500 to-indigo-700"
            />
          </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-8 pb-28 space-y-5">
          {!unlocked ? (
            <form onSubmit={handleUnlock} className="space-y-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Digite a senha de <strong>Gerência</strong> para gerenciar os usuários.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Senha do admin"
                  className={`${iosInput} flex-1`}
                />
                <button
                  type="submit"
                  disabled={loading || !adminPassword.trim()}
                  className="px-4 py-2.5 rounded-xl bg-brand-yellow text-black font-semibold disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Entrar'}
                </button>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </form>
          ) : (
            <>
              {editingId ? (
                <form onSubmit={handleSave} className="space-y-6">
                  {/* Dados do usuário */}
                  <section className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/60 p-4 shadow-sm dark:border-zinc-600/60 dark:bg-zinc-900/35">
                    <h3 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2 mb-3">
                      <User className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                      Dados do usuário
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Usuário (login)</label>
                        <input
                          type="text"
                          value={formUsername}
                          onChange={(e) => setFormUsername(e.target.value)}
                          placeholder="Ex: joao"
                          disabled={editingId !== 'new'}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white disabled:opacity-60"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                          {editingId === 'new' ? 'Senha (mín. 4 caracteres)' : 'Nova senha (deixe em branco para manter)'}
                        </label>
                        <input
                          type="password"
                          value={formPassword}
                          onChange={(e) => setFormPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Nome de exibição (opcional)</label>
                      <input
                        type="text"
                        value={formDisplayName}
                        onChange={(e) => setFormDisplayName(e.target.value)}
                        placeholder="Ex: João Silva"
                        className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Cargo (opcional)</label>
                      <input
                        type="text"
                        value={formJobTitle}
                        onChange={(e) => setFormJobTitle(e.target.value)}
                        placeholder="Ex: Mecânico, Recepcionista"
                        className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                      />
                    </div>
                    <PermSwitch
                      label="Técnico da oficina"
                      description="Aparece como mecânico nos cards do Pátio/Laboratório"
                      checked={formIsTechnician}
                      onChange={setFormIsTechnician}
                    />
                  </section>

                  {/* Acesso completo (igual ao admin) */}
                  <section>
                    <div className="rounded-xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/50 p-4">
                      <PermSwitch
                        label="Acesso completo ao sistema"
                        description="Igual ao administrador: todas as telas, seção Administração (usuários, configurações, serviços, checklists, técnicos, senhas) e todas as ações no Pátio/Laboratório."
                        checked={!!formPermissions.full_access}
                        onChange={(v) => setPerm('full_access', v)}
                      />
                      {formPermissions.full_access && (
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-2 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                          As permissões detalhadas abaixo são ignoradas quando o acesso completo está ativo.
                        </p>
                      )}
                    </div>
                  </section>

                  {/* Telas e módulos da home */}
                  <section className="rounded-[20px] border border-zinc-200/80 bg-white/70 p-4 dark:border-zinc-600/60 dark:bg-zinc-900/30">
                    <h3 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                      Telas e navegação
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 mb-4 leading-relaxed">
                      Abas do app, ícones da página inicial e entradas do hub de configurações. Cada cartão corresponde a um módulo.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  </section>

                  {/* Permissões no Pátio / Laboratório */}
                  <section className="rounded-[20px] border border-zinc-200/80 bg-zinc-50/50 p-4 dark:border-zinc-600/60 dark:bg-zinc-900/25">
                    <h3 className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2 mb-1">
                      <Car className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      Permissões no Pátio e Laboratório
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-3 leading-relaxed">
                      O que o usuário pode fazer dentro dos cards (quando tiver acesso às telas Pátio/Laboratório).
                    </p>
                    <div className="rounded-xl border border-zinc-200/90 dark:border-zinc-600/70 bg-white/60 dark:bg-zinc-950/30 p-3 space-y-0">
                      <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pt-1 pb-2">Dados do card</p>
                      {PATIO_DATA_LABELS.map(({ key, label }) => (
                        <PermSwitch
                          key={key}
                          label={label}
                          checked={!!formPermissions[key]}
                          onChange={(v) => setPerm(key, v)}
                          disabled={!!formPermissions.full_access}
                        />
                      ))}
                      <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pt-3 pb-2">Orçamentos, comentários e ações</p>
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
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 pt-2 border-t border-zinc-200 dark:border-zinc-600 mt-2">
                          Com acesso completo, aprovar itens do orçamento fica sempre permitido (igual ao administrador).
                        </p>
                      ) : (
                        <PermSwitch
                          label="Aprovar itens do orçamento"
                          description="Permite aprovar ou reprovar cada serviço e peça no modal de orçamento. Desligado e salvo: bloqueia essa ação mesmo com «Criar e editar orçamentos». Se nunca foi salvo, vale a mesma regra de editar orçamentos."
                          checked={effectivePatioApproveBudgetItems(formPermissions)}
                          onChange={(v) => setPerm('patio_approve_budget_items', v)}
                          disabled={!!formPermissions.full_access}
                        />
                      )}
                    </div>
                  </section>

                  {error && <p className="text-sm text-red-500">{error}</p>}
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={cancelEdit} className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300">
                      Cancelar
                    </button>
                    <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-brand-yellow text-black font-semibold disabled:opacity-50 flex items-center gap-2">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={startAdd}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-yellow text-black font-semibold hover:bg-[#fcd61e]"
                    >
                      <Plus className="w-4 h-4" />
                      Novo usuário
                    </button>
                  </div>

                  {users.length > 0 && (
                    <section className="rounded-xl border border-amber-200/80 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/30 p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <div className="shrink-0 origin-left scale-[0.92]">
                          <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
                            <img src="/icons/usuarios-ios.png" alt="" className="h-full w-full object-cover" />
                          </IosAccentIconSquircle>
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Quem pode aprovar itens do orçamento</h3>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 leading-snug">
                            Escolha quais logins podem aprovar ou reprovar serviços e peças no Pátio e no Laboratório. Quem tem{' '}
                            <strong className="font-semibold text-zinc-800 dark:text-zinc-200">acesso completo</strong> já pode sempre; não precisa ligar o interruptor abaixo.
                          </p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-600 bg-white/70 dark:bg-zinc-900/40 p-2 space-y-0">
                        {users.map((u) => {
                          const label = (u.display_name || '').trim() || u.username;
                          const sub =
                            label !== u.username
                              ? u.username
                              : u.job_title || undefined;
                          if (u.permissions?.full_access) {
                            return (
                              <div
                                key={u.id}
                                className="flex items-center justify-between gap-3 py-2.5 px-1 border-b border-zinc-100 dark:border-zinc-700/80 last:border-0"
                              >
                                <div className="min-w-0">
                                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 block">{label}</span>
                                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Acesso completo — pode aprovar itens sem configuração extra</span>
                                </div>
                                <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0" aria-hidden />
                              </div>
                            );
                          }
                          return (
                            <div key={u.id} className="border-b border-zinc-100 dark:border-zinc-700/80 last:border-0">
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
                  )}

                  <ul className="space-y-2">
                    {users.length === 0 ? (
                      <li className="text-sm text-zinc-500 dark:text-zinc-400 py-6 text-center rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                        Nenhum usuário cadastrado. Crie um para permitir login com usuário e senha.
                      </li>
                    ) : (
                      users.map((u) => (
                        <li
                          key={u.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-zinc-900 dark:text-white truncate">{u.username}</p>
                            {(u.display_name || u.job_title) && (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                {[u.display_name, u.job_title].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            {u.is_technician && (
                              <span className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">Técnico</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button type="button" onClick={() => startEdit(u)} className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400" title="Editar">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(u.id)}
                              disabled={deletingId === u.id}
                              className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 disabled:opacity-50"
                              title="Excluir"
                            >
                              {deletingId === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};
