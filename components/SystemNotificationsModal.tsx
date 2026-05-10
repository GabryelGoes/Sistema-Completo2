import React, { useEffect, useState } from "react";
import { Bell, Loader2, Sparkles, Trash2, X } from "lucide-react";
import {
  getSystemNotificationsConfig,
  saveSystemNotificationsConfig,
  type WorkshopUserOption,
} from "../services/apiService";
import { SYSTEM_NOTIFICATION_TYPE_OPTIONS } from "../constants/systemNotificationTypes";
import {
  iosModalClose,
  iosModalInsetCard,
  iosModalOverlay,
  iosModalShell,
  iosInput,
  iosLabel,
  iosPrimaryButton,
} from "./ui/iosModalStyles";
import { IosModalHeader } from "./ui/IosModalHeader";
import { useRegisterModalOpen } from "./ui/ModalLayerContext";

type UserDraft = { systemUserId: string; displayName: string };
type SystemUserDraft = UserDraft & { notificationTypes: string[] };

function toggle(arr: string[], id: string): string[] {
  return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
}

function IosSwitch({
  checked,
  onChange,
  id,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  id: string;
  ariaLabel: string;
}) {
  return (
    <label htmlFor={id} className="relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
        aria-checked={checked}
        aria-label={ariaLabel}
      />
      <span
        className="absolute inset-0 rounded-full bg-[#E9E9EA] transition-colors duration-200 ease-out dark:bg-zinc-600 peer-checked:bg-[#34C759] peer-focus-visible:ring-2 peer-focus-visible:ring-[#34C759]/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white dark:peer-focus-visible:ring-offset-zinc-900"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.12),0_1.5px_1px_rgba(0,0,0,0.08)] transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-transform peer-checked:translate-x-[20px]"
        aria-hidden
      />
    </label>
  );
}

function TypeSwitches(props: {
  selected: string[];
  onToggle: (id: string) => void;
  idPrefix: string;
  options: readonly { id: string; label: string; description: string }[];
}) {
  return (
    <div className="divide-y divide-zinc-200/80 dark:divide-white/[0.08] rounded-xl overflow-hidden border border-zinc-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-zinc-950/30">
      {props.options.map((opt) => {
        const checked = props.selected.includes(opt.id);
        const cid = `${props.idPrefix}-${opt.id}`;
        return (
          <div key={opt.id} className="flex items-center justify-between gap-3 px-3 py-3 sm:px-3.5 sm:py-3.5 min-h-[3.25rem]">
            <div className="min-w-0 flex-1 pr-1">
              <p className="text-[14px] font-medium text-zinc-900 dark:text-white leading-snug">{opt.label}</p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{opt.description}</p>
            </div>
            <IosSwitch
              id={cid}
              checked={checked}
              onChange={() => props.onToggle(opt.id)}
              ariaLabel={checked ? `${opt.label}: ativado` : `${opt.label}: desativado`}
            />
          </div>
        );
      })}
    </div>
  );
}

interface SystemNotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemNotificationsModal: React.FC<SystemNotificationsModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [availableUsers, setAvailableUsers] = useState<WorkshopUserOption[]>([]);
  const [systemAdminTypes, setSystemAdminTypes] = useState<string[]>([]);
  const [systemSubscribers, setSystemSubscribers] = useState<SystemUserDraft[]>([]);
  const [pickSystemUserId, setPickSystemUserId] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setMessage(null);
    setAdminPassword("");
    setPickSystemUserId("");
    getSystemNotificationsConfig()
      .then((sys) => {
        setAvailableUsers(sys.availableUsers || []);
        setSystemAdminTypes(sys.adminNotificationTypes || []);
        setSystemSubscribers(
          (sys.subscribers || []).map((s) => ({
            systemUserId: s.systemUserId,
            notificationTypes: [...(s.notificationTypes || [])],
            displayName: s.displayName,
          }))
        );
      })
      .catch((e) => setMessage({ type: "err", text: e instanceof Error ? e.message : "Erro ao carregar." }))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const systemIds = new Set(systemSubscribers.map((s) => s.systemUserId));
  const systemPickOptions = availableUsers.filter((u) => !systemIds.has(u.id));

  const addSystemUser = () => {
    const u = availableUsers.find((x) => x.id === pickSystemUserId);
    if (!u) return;
    setSystemSubscribers((prev) => [...prev, { systemUserId: u.id, notificationTypes: [], displayName: u.displayName || u.username }]);
    setPickSystemUserId("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!adminPassword.trim()) {
      setMessage({ type: "err", text: "Informe a senha da gerência." });
      return;
    }
    setSaving(true);
    try {
      await saveSystemNotificationsConfig({
        adminPassword: adminPassword.trim(),
        adminNotificationTypes: systemAdminTypes,
        subscribers: systemSubscribers
          .filter((s) => s.notificationTypes.length > 0)
          .map((s) => ({ systemUserId: s.systemUserId, notificationTypes: s.notificationTypes })),
      });
      setMessage({ type: "ok", text: "Configuração de notificações salva." });
      setAdminPassword("");
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Erro ao salvar." });
    } finally {
      setSaving(false);
    }
  };

  useRegisterModalOpen(isOpen);
  if (!isOpen) return null;

  return (
    <div className={iosModalOverlay}>
      <div className={`${iosModalShell} w-full max-w-lg sm:max-w-2xl lg:max-w-4xl max-h-[92vh] overflow-y-auto`}>
        <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>
        <div className="p-5 sm:p-6 pt-14">
          <IosModalHeader
            icon={<Bell className="w-6 h-6 text-white" strokeWidth={2.2} />}
            title="Notificações do sistema"
            subtitle="Controle central de todos os tipos de notificações da oficina"
            gradientClass="from-sky-500 to-blue-700"
          />

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-5 mt-4">
              <div className={`${iosModalInsetCard} p-4`}>
                <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 mb-1">Central (comentários, orçamentos e OS)</p>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-3">Gerencie quem recebe notificações operacionais da oficina.</p>
                <div className="space-y-4">
                  <div>
                    <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Gerência (admin)</p>
                    <TypeSwitches
                      idPrefix="sys-admin"
                      options={SYSTEM_NOTIFICATION_TYPE_OPTIONS}
                      selected={systemAdminTypes}
                      onToggle={(id) => setSystemAdminTypes((prev) => toggle(prev, id))}
                    />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 mb-2">Usuários do sistema</p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      <select value={pickSystemUserId} onChange={(e) => setPickSystemUserId(e.target.value)} className={`${iosInput} flex-1 min-w-[180px] py-2.5 text-[14px]`}>
                        <option value="">Adicionar usuário…</option>
                        {systemPickOptions.map((u) => (
                          <option key={u.id} value={u.id}>{u.displayName}</option>
                        ))}
                      </select>
                      <button type="button" onClick={addSystemUser} disabled={!pickSystemUserId} className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.08] px-4 py-2.5 text-[14px] font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100/80 dark:hover:bg-white/[0.06] disabled:opacity-40">Adicionar</button>
                    </div>
                    <div className="space-y-4">
                      {systemSubscribers.map((s) => (
                        <div key={s.systemUserId} className="rounded-xl border border-zinc-200/80 dark:border-white/[0.08] p-3 bg-zinc-50/80 dark:bg-black/20">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[14px] font-medium text-zinc-900 dark:text-white truncate">{s.displayName}</span>
                            <button type="button" onClick={() => setSystemSubscribers((prev) => prev.filter((x) => x.systemUserId !== s.systemUserId))} className="shrink-0 p-2 rounded-xl text-rose-600 hover:bg-rose-500/10" aria-label="Remover"><Trash2 className="w-4 h-4" /></button>
                          </div>
                          <TypeSwitches
                            idPrefix={`sys-sub-${s.systemUserId}`}
                            options={SYSTEM_NOTIFICATION_TYPE_OPTIONS}
                            selected={s.notificationTypes}
                            onToggle={(id) => setSystemSubscribers((prev) => prev.map((x) => (x.systemUserId === s.systemUserId ? { ...x, notificationTypes: toggle(x.notificationTypes, id) } : x)))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="system-notif-admin-pw" className={iosLabel}>Senha da gerência</label>
                <input
                  id="system-notif-admin-pw"
                  type="password"
                  autoComplete="current-password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className={iosInput}
                  placeholder="Obrigatória para salvar"
                />
              </div>

              {message ? (
                <p className={`text-[14px] ${message.type === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {message.text}
                </p>
              ) : null}

              <button type="submit" disabled={saving} className={`${iosPrimaryButton} w-full flex items-center justify-center gap-2`}>
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                Salvar notificações
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
