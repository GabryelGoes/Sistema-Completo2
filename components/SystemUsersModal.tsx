import React, { useState, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Loader2, LayoutGrid, Settings, Car, User } from 'lucide-react';
import type { SystemUserPermissions, SystemUser } from '../services/apiService';
import {
  getSystemUsers,
  createSystemUser,
  updateSystemUser,
  deleteSystemUser,
} from '../services/apiService';

/** Switch reutilizável para permissões */
function PermSwitch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 block">{label}</span>
        {description && <span className="text-xs text-zinc-500 dark:text-zinc-400 block mt-0.5">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-0 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900 ${
          checked ? 'bg-[#34C759] dark:bg-[#30D158]' : 'bg-zinc-300 dark:bg-zinc-600'
        }`}
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

/** Telas que o usuário pode acessar (abas e início) */
const NAV_LABELS: { key: keyof SystemUserPermissions; label: string; description?: string }[] = [
  { key: 'access_home', label: 'Tela inicial', description: 'Ver a página inicial' },
  { key: 'access_reception', label: 'Recepção', description: 'Cadastro de clientes e veículos' },
  { key: 'access_agenda', label: 'Agenda', description: 'Agendamentos' },
  { key: 'access_patio', label: 'Pátio', description: 'Veículos em atendimento' },
  { key: 'access_laboratorio', label: 'Laboratório', description: 'Módulos e eletrônica' },
];

/** Ferramentas administrativas (configurações, senhas, técnicos) */
const TOOLS_LABELS: { key: keyof SystemUserPermissions; label: string; description?: string }[] = [
  { key: 'access_settings', label: 'Configurações', description: 'Tema, efeitos e opções do app' },
  { key: 'access_change_passwords', label: 'Alterar senhas', description: 'Senha de gerência e exclusão de veículos' },
  { key: 'access_technicians', label: 'Técnicos', description: 'Lista de técnicos da oficina (atribuição nos cards)' },
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Usuários do sistema</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                  className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
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
                <form onSubmit={handleSave} className="space-y-5">
                  {/* Dados do usuário */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                      <User className="w-4 h-4" />
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

                  {/* Acesso às telas */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                      <LayoutGrid className="w-4 h-4" />
                      Telas e navegação
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Quais abas e a tela inicial o usuário pode acessar.</p>
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-600 bg-zinc-50/50 dark:bg-zinc-800/30 p-3 space-y-0">
                      {NAV_LABELS.map(({ key, label, description }) => (
                        <PermSwitch key={key} label={label} description={description} checked={!!formPermissions[key]} onChange={(v) => setPerm(key, v)} />
                      ))}
                    </div>
                  </section>

                  {/* Ferramentas (configurações, senhas, técnicos) */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Ferramentas da oficina
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Acesso a configurações, alterar senhas e lista de técnicos.</p>
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-600 bg-zinc-50/50 dark:bg-zinc-800/30 p-3 space-y-0">
                      {TOOLS_LABELS.map(({ key, label, description }) => (
                        <PermSwitch key={key} label={label} description={description} checked={!!formPermissions[key]} onChange={(v) => setPerm(key, v)} />
                      ))}
                    </div>
                  </section>

                  {/* Permissões no Pátio / Laboratório */}
                  <section className="space-y-3">
                    <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                      <Car className="w-4 h-4" />
                      Permissões no Pátio e Laboratório
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">O que o usuário pode fazer dentro dos cards (quando tiver acesso às telas Pátio/Laboratório).</p>
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-600 bg-zinc-50/50 dark:bg-zinc-800/30 p-3 space-y-0">
                      <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pt-1 pb-2">Dados do card</p>
                      {PATIO_DATA_LABELS.map(({ key, label }) => (
                        <PermSwitch key={key} label={label} checked={!!formPermissions[key]} onChange={(v) => setPerm(key, v)} />
                      ))}
                      <p className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider pt-3 pb-2">Orçamentos, comentários e ações</p>
                      {PATIO_OTHER_LABELS.map(({ key, label }) => (
                        <PermSwitch key={key} label={label} checked={!!formPermissions[key]} onChange={(v) => setPerm(key, v)} />
                      ))}
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
  );
};
