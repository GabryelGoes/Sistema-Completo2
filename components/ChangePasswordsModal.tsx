import React, { useState, useEffect } from 'react';
import { X, KeyRound, Loader2, Check, Trash2, Eye, EyeOff } from 'lucide-react';
import { iosModalOverlay, iosModalShell, iosModalClose, iosModalInsetCard, iosInput } from './ui/iosModalStyles';
import { IosModalHeader } from './ui/IosModalHeader';
import { getWorkshopSettings, updateWorkshopSettings } from '../services/apiService';
import { useRegisterModalOpen } from './ui/ModalLayerContext';

interface ChangePasswordsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordsModal: React.FC<ChangePasswordsModalProps> = ({ isOpen, onClose }) => {
  const [patioPin, setPatioPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [vehicleDeletePassword, setVehicleDeletePassword] = useState('');
  const [vehicleDeleteConfirm, setVehicleDeleteConfirm] = useState('');
  const [savingVehicleDelete, setSavingVehicleDelete] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showPatioPin, setShowPatioPin] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMessage(null);
      setShowPatioPin(false);
      setLoadingSettings(true);
      getWorkshopSettings()
        .then((s) => setPatioPin(s.patioPin || '4366'))
        .catch(() => setPatioPin('4366'))
        .finally(() => setLoadingSettings(false));
    }
  }, [isOpen]);

  useRegisterModalOpen(isOpen);

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
    <div className={iosModalOverlay}>
      <div className={`${iosModalShell} max-w-md max-h-[90vh]`}>
        <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="px-6 sm:px-8 pt-8 pb-4 pr-14 shrink-0">
            <IosModalHeader
              icon={<img src="/icons/senhas-ios.png" alt="" className="h-6 w-6 object-cover" />}
              title="Alterar senhas"
              subtitle="PIN do pátio e exclusão de veículos"
              gradientClass="from-slate-600 to-zinc-800"
            />
          </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 pb-8 space-y-6">
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

          {/* PIN dos técnicos */}
          <section className={`${iosModalInsetCard} p-4 sm:p-5`}>
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
                <div className="relative">
                  <input
                    type={showPatioPin ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="off"
                    value={patioPin}
                    onChange={(e) => setPatioPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="Ex: 4366"
                    className={`${iosInput} pr-12`}
                    aria-label="PIN dos técnicos"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPatioPin((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100/80 dark:hover:bg-white/10 transition-colors"
                    aria-label={showPatioPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                  >
                    {showPatioPin ? <EyeOff className="w-5 h-5" strokeWidth={2} /> : <Eye className="w-5 h-5" strokeWidth={2} />}
                  </button>
                </div>
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
          <section className={`${iosModalInsetCard} p-4 sm:p-5`}>
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
                className={iosInput}
              />
              <input
                type="password"
                value={vehicleDeleteConfirm}
                onChange={(e) => setVehicleDeleteConfirm(e.target.value)}
                placeholder="Confirmar senha"
                className={iosInput}
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
    </div>
  );
};
