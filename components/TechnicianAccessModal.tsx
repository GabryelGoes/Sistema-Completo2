import React, { useState, useEffect } from 'react';
import { X, Loader2, Save, ClipboardList, Calendar, Eye, EyeOff } from 'lucide-react';
import { PatioCarIcon } from './ui/PatioCarIcon';
import { getWorkshopSettings, updateWorkshopSettings } from '../services/apiService';

interface TechnicianAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TechnicianAccessModal: React.FC<TechnicianAccessModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reception, setReception] = useState(false);
  const [agenda, setAgenda] = useState(false);
  const [patio, setPatio] = useState(true);
  const [patioLoginEnabled, setPatioLoginEnabled] = useState(true);
  const [patioPin, setPatioPin] = useState('');
  const [showPatioPin, setShowPatioPin] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setLoading(true);
    getWorkshopSettings()
      .then((s) => {
        setReception(s.technicianAccessReception ?? false);
        setAgenda(s.technicianAccessAgenda ?? false);
        setPatio(s.technicianAccessPatio !== false);
        setPatioLoginEnabled(s.patioLoginEnabled);
        setPatioPin(s.patioPin || '');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await updateWorkshopSettings({
        technicianAccessReception: reception,
        technicianAccessAgenda: agenda,
        technicianAccessPatio: patio,
        patioLoginEnabled,
        patioPin: patioPin.trim(),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-modal-backdrop">
      <div className="bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-zinc-200/60 dark:border-white/[0.08] rounded-[1.5rem] w-full max-w-md shadow-xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-zinc-200/60 dark:border-white/[0.08] bg-zinc-50/80 dark:bg-white/[0.04]">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
            Controle dos Técnicos
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-zinc-200/80 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mb-6">
            Escolha o que o login de <strong className="text-zinc-700 dark:text-zinc-300">Técnicos</strong> pode acessar no sistema.
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-brand-yellow" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-zinc-100/80 dark:bg-white/[0.06] border border-zinc-200/60 dark:border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <ClipboardList className="w-5 h-5 text-amber-500 shrink-0" />
                  <span className="text-[15px] font-medium text-zinc-900 dark:text-white">Recepção</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={reception}
                  onClick={() => setReception((v) => !v)}
                  className={`relative shrink-0 w-12 h-7 rounded-full transition-colors duration-200 ${reception ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                >
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${reception ? 'translate-x-6 left-0.5' : 'translate-x-0 left-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-zinc-100/80 dark:bg-white/[0.06] border border-zinc-200/60 dark:border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-blue-500 shrink-0" />
                  <span className="text-[15px] font-medium text-zinc-900 dark:text-white">Agenda</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={agenda}
                  onClick={() => setAgenda((v) => !v)}
                  className={`relative shrink-0 w-12 h-7 rounded-full transition-colors duration-200 ${agenda ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                >
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${agenda ? 'translate-x-6 left-0.5' : 'translate-x-0 left-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-zinc-100/80 dark:bg-white/[0.06] border border-zinc-200/60 dark:border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <PatioCarIcon className="w-5 h-5 text-emerald-500 shrink-0" strokeWidth={2} />
                  <span className="text-[15px] font-medium text-zinc-900 dark:text-white">Pátio</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={patio}
                  onClick={() => setPatio((v) => !v)}
                  className={`relative shrink-0 w-12 h-7 rounded-full transition-colors duration-200 ${patio ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                >
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${patio ? 'translate-x-6 left-0.5' : 'translate-x-0 left-0.5'}`} />
                </button>
              </div>
            </div>
          )}

          {/* Acesso ao login do pátio */}
          {!loading && (
            <div className="mt-6 pt-6 border-t border-zinc-200/60 dark:border-white/[0.08]">
              <div className="flex items-center gap-2 mb-2">
                <PatioCarIcon className="w-5 h-5 text-emerald-500" strokeWidth={2} />
                <span className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Acesso ao login do pátio</span>
              </div>
              <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mb-4">
                Controle o login dos mecânicos nos tablets. Se desativar, ninguém conseguirá entrar como &quot;Técnicos&quot; até ativar de novo.
              </p>
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="text-[15px] font-medium text-zinc-900 dark:text-white">Permitir login dos técnicos</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={patioLoginEnabled}
                  onClick={() => setPatioLoginEnabled((v) => !v)}
                  className={`relative shrink-0 w-12 h-7 rounded-full transition-colors duration-200 ${patioLoginEnabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                >
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${patioLoginEnabled ? 'translate-x-6 left-0.5' : 'translate-x-0 left-0.5'}`} />
                </button>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">PIN do pátio</label>
                <div className="relative">
                  <input
                    type={showPatioPin ? 'text' : 'password'}
                    inputMode="numeric"
                    value={patioPin}
                    onChange={(e) => setPatioPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="Ex: 1234"
                    className="w-full px-4 py-2.5 pr-12 rounded-xl bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 text-[15px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPatioPin((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/10 transition-colors"
                    aria-label={showPatioPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                  >
                    {showPatioPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-500 mt-1">Os mecânicos usam esse PIN ao entrar como &quot;Técnicos&quot;.</p>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-4 text-[13px] text-red-600 dark:text-red-400">{error}</p>
          )}

          {!loading && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-6 w-full py-3.5 rounded-xl bg-brand-yellow hover:bg-[#fcd61e] disabled:opacity-50 text-black font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
