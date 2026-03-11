import React from 'react';
import { X, Settings } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  onThemeChange: (theme: 'dark' | 'light') => void;
  effectsEnabled: boolean;
  onEffectsChange: (enabled: boolean) => void;
  cinematographicMode?: boolean;
  onCinematographicModeChange?: (enabled: boolean) => void;
  orientation?: 'portrait' | 'landscape';
  showPatioAccess?: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  theme,
  onThemeChange,
  effectsEnabled,
  onEffectsChange,
  cinematographicMode = false,
  onCinematographicModeChange,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-modal-backdrop">
      <div className="bg-light-elevated/98 dark:bg-[#1C1C1E]/95 backdrop-blur-xl border border-light-border dark:border-white/[0.08] rounded-[1.5rem] w-full max-w-md shadow-[0_2px_24px_-4px_rgba(0,0,0,0.1),0_12px_40px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_32px_-4px_rgba(0,0,0,0.5)] overflow-hidden animate-modal-sheet flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-light-border dark:border-white/[0.08] bg-light-card dark:bg-white/[0.04] shrink-0">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-brand-yellow" />
            Configurações
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-light-border dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="bg-light-card dark:bg-white/[0.06] p-4 rounded-2xl border border-light-border dark:border-white/[0.08]">
            <label className="block text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">Tema do sistema</label>
            <div className="flex bg-zinc-200 dark:bg-black/40 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => onThemeChange('light')}
                className={`flex-1 py-3 px-4 rounded-lg text-[15px] font-semibold transition-all ${
                  theme === 'light'
                    ? 'bg-light-elevated text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                Claro
              </button>
              <button
                type="button"
                onClick={() => onThemeChange('dark')}
                className={`flex-1 py-3 px-4 rounded-lg text-[15px] font-semibold transition-all ${
                  theme === 'dark'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                Escuro
              </button>
            </div>
          </div>

          {/* Efeitos de movimento — chave estilo iOS */}
          <div className="mt-6 bg-light-card dark:bg-white/[0.06] p-4 rounded-2xl border border-light-border dark:border-white/[0.08]">
            <div className="flex items-center justify-between gap-4">
              <label className="text-[15px] font-medium text-zinc-900 dark:text-white">
                Efeitos de Movimento
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={effectsEnabled}
                onClick={() => onEffectsChange(!effectsEnabled)}
                className={`
                  relative shrink-0 w-12 h-7 rounded-full transition-colors duration-200
                  ${effectsEnabled ? 'bg-green-500' : 'bg-zinc-300 dark:bg-zinc-600'}
                `}
              >
                <span
                  className={`
                    absolute top-1 w-5 h-5 rounded-full bg-white shadow-md
                    transition-transform duration-200 ease-out
                    ${effectsEnabled ? 'translate-x-6 left-0.5' : 'translate-x-0 left-0.5'}
                  `}
                />
              </button>
            </div>
          </div>

          {/* Modo cinematográfico — embaça placas para gravar tela / redes sociais */}
          {typeof onCinematographicModeChange === 'function' && (
            <div className="mt-6 bg-light-card dark:bg-white/[0.06] p-4 rounded-2xl border border-light-border dark:border-white/[0.08]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <label className="text-[15px] font-medium text-zinc-900 dark:text-white block">
                    Modo cinematográfico
                  </label>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Embaralha as placas no app para gravar tela e postar em redes sociais
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={cinematographicMode}
                  onClick={() => onCinematographicModeChange(!cinematographicMode)}
                  className={`
                    relative shrink-0 w-12 h-7 rounded-full transition-colors duration-200
                    ${cinematographicMode ? 'bg-brand-yellow' : 'bg-zinc-300 dark:bg-zinc-600'}
                  `}
                >
                  <span
                    className={`
                      absolute top-1 w-5 h-5 rounded-full bg-white shadow-md
                      transition-transform duration-200 ease-out
                      ${cinematographicMode ? 'translate-x-6 left-0.5' : 'translate-x-0 left-0.5'}
                    `}
                  />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
