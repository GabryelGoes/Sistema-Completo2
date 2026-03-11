import React, { useState, useEffect } from 'react';
import { X, Lock, KeyRound, Loader2, Check, Trash2 } from 'lucide-react';
import { getWorkshopSettings, updateWorkshopSettings } from '../services/apiService';

interface ChangePasswordsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordsModal: React.FC<ChangePasswordsModalProps> = ({ isOpen, onClose }) => {
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirm, setAdminConfirm] = useState('');
  const [patioPin, setPatioPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [vehicleDeletePassword, setVehicleDeletePassword] = useState('');
  const [vehicleDeleteConfirm, setVehicleDeleteConfirm] = useState('');
  const [savingVehicleDelete, setSavingVehicleDelete] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAdminNewPassword('');
      setAdminConfirm('');
      setMessage(null);
      setLoadingSettings(true);
      getWorkshopSettings()
        .then((s) => setPatioPin(s.patioPin || '4366'))
        .catch(() => setPatioPin('4366'))
        .finally(() => setLoadingSettings(false));
    }
  }, [isOpen]);

  const handleSaveAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (adminNewPassword.trim().length < 4) {
      setMessage({ type: 'err', text: 'A senha deve ter pelo menos 4 caracteres.' });
      return;
    }
    if (adminNewPassword !== adminConfirm) {
      setMessage({ type: 'err', text: 'As senhas não coincidem.' });
      return;
    }
    setSavingAdmin(true);
    try {
      await updateWorkshopSettings({ adminPassword: adminNewPassword.trim() });
      setMessage({ type: 'ok', text: 'Senha do administrador alterada!' });
      setAdminNewPassword('');
      setAdminConfirm('');
    } catch (e) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Erro ao salvar.' });
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!/^\d{4,8}$/.test(patioPin)) {
      setMessage({ type: 'err', text: 'O PIN deve ter de 4 a 8 dígitos.' });
      return;
    }
    setSavingPin(true);
    try {
      await updateWorkshopSettings({ patioPin: patioPin.trim() });
      setMessage({ type: 'ok', text: 'PIN dos técnicos alterado!' });
    } catch (e) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Erro ao salvar.' });
    } finally {
      setSavingPin(false);
    }
  };

  const handleSaveVehicleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (vehicleDeletePassword.trim().length < 4) {
      setMessage({ type: 'err', text: 'A senha deve ter pelo menos 4 caracteres.' });
      return;
    }
    if (vehicleDeletePassword !== vehicleDeleteConfirm) {
      setMessage({ type: 'err', text: 'As senhas não coincidem.' });
      return;
    }
    setSavingVehicleDelete(true);
    try {
      await updateWorkshopSettings({ vehicleDeletePassword: vehicleDeletePassword.trim() });
      setMessage({ type: 'ok', text: 'Senha para excluir veículos salva!' });
      setVehicleDeletePassword('');
      setVehicleDeleteConfirm('');
    } catch (e) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Erro ao salvar.' });
    } finally {
      setSavingVehicleDelete(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-modal-backdrop">
      <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-zinc-200/60 dark:border-white/[0.08] rounded-[1.5rem] w-full max-w-md shadow-xl overflow-hidden animate-modal-sheet flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-zinc-200/60 dark:border-white/[0.08] bg-zinc-50/80 dark:bg-white/[0.04] shrink-0">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-amber-500" />
            Alterar senhas
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-zinc-200/80 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {message && (
            <div
              className={`px-4 py-3 rounded-xl text-sm ${
                message.type === 'ok'
                  ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Senha do administrador */}
          <section className="bg-zinc-100/80 dark:bg-white/[0.06] p-4 rounded-2xl border border-zinc-200/60 dark:border-white/[0.08]">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-5 h-5 text-amber-500" />
              <h3 className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Senha do administrador
              </h3>
            </div>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mb-4">
              Define a senha usada no login &quot;Acesso total&quot;.
            </p>
            <form onSubmit={handleSaveAdmin} className="space-y-3">
              <input
                type="password"
                value={adminNewPassword}
                onChange={(e) => setAdminNewPassword(e.target.value)}
                placeholder="Nova senha"
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 text-[15px]"
              />
              <input
                type="password"
                value={adminConfirm}
                onChange={(e) => setAdminConfirm(e.target.value)}
                placeholder="Confirmar nova senha"
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 text-[15px]"
              />
              <button
                type="submit"
                disabled={savingAdmin || !adminNewPassword.trim() || adminNewPassword !== adminConfirm}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold text-[15px] flex items-center justify-center gap-2"
              >
                {savingAdmin ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                Salvar senha do admin
              </button>
            </form>
          </section>

          {/* PIN dos técnicos */}
          <section className="bg-zinc-100/80 dark:bg-white/[0.06] p-4 rounded-2xl border border-zinc-200/60 dark:border-white/[0.08]">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="w-5 h-5 text-emerald-500" />
              <h3 className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                PIN dos técnicos
              </h3>
            </div>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mb-4">
              PIN usado pelos mecânicos no login &quot;Pátio&quot;. De 4 a 8 dígitos.
            </p>
            {loadingSettings ? (
              <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            ) : (
              <form onSubmit={handleSavePin} className="space-y-3">
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={patioPin}
                  onChange={(e) => setPatioPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="Ex: 4366"
                  className="w-full px-4 py-3 rounded-xl bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 text-[15px]"
                />
                <button
                  type="submit"
                  disabled={savingPin || patioPin.length < 4}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold text-[15px] flex items-center justify-center gap-2"
                >
                  {savingPin ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                  Salvar PIN
                </button>
              </form>
            )}
          </section>

          {/* Senha para excluir veículos */}
          <section className="bg-zinc-100/80 dark:bg-white/[0.06] p-4 rounded-2xl border border-zinc-200/60 dark:border-white/[0.08]">
            <div className="flex items-center gap-2 mb-3">
              <Trash2 className="w-5 h-5 text-red-500" />
              <h3 className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Senha para excluir veículos
              </h3>
            </div>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mb-4">
              Exigida no modal do veículo (Pátio) ao excluir um carro do sistema (arquiva a OS como cancelada).
            </p>
            <form onSubmit={handleSaveVehicleDelete} className="space-y-3">
              <input
                type="password"
                value={vehicleDeletePassword}
                onChange={(e) => setVehicleDeletePassword(e.target.value)}
                placeholder="Nova senha"
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-500/40 text-[15px]"
              />
              <input
                type="password"
                value={vehicleDeleteConfirm}
                onChange={(e) => setVehicleDeleteConfirm(e.target.value)}
                placeholder="Confirmar senha"
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-500/40 text-[15px]"
              />
              <button
                type="submit"
                disabled={savingVehicleDelete || !vehicleDeletePassword.trim() || vehicleDeletePassword !== vehicleDeleteConfirm}
                className="w-full py-3 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold text-[15px] flex items-center justify-center gap-2"
              >
                {savingVehicleDelete ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                Salvar senha para excluir veículos
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};
