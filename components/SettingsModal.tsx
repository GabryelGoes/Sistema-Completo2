import React from 'react';
import { X, Settings, RefreshCw } from 'lucide-react';
import { iosModalOverlay, iosModalShell, iosModalClose, iosModalInsetCard } from './ui/iosModalStyles';
import { IosModalHeader } from './ui/IosModalHeader';
import { AppearanceSettingsSection } from './AppearanceSettingsSection';
import type { AppAppearance } from '../utils/appAppearance';

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
  /** Aparência da oficina (cor + wallpapers) — admin e usuários com acesso total */
  showWorkspaceAppearance?: boolean;
  workspaceAppearance?: AppAppearance;
  onWorkspaceAppearanceChange?: (next: AppAppearance) => void;
  onSaveWorkspaceAppearance?: () => void | Promise<void>;
  workspaceAppearanceSaving?: boolean;
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
  showWorkspaceAppearance = false,
  workspaceAppearance,
  onWorkspaceAppearanceChange,
  onSaveWorkspaceAppearance,
  workspaceAppearanceSaving = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className={iosModalOverlay}>
      <div className={`${iosModalShell} ${showWorkspaceAppearance ? 'max-w-xl' : 'max-w-md'} max-h-[94vh]`}>
        <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="px-6 sm:px-8 pt-8 pb-4 pr-14 shrink-0">
            <IosModalHeader
              icon={<Settings className="w-6 h-6 text-white" strokeWidth={2.2} />}
              title="Configurações"
              subtitle="Aparência e experiência do app"
              gradientClass="from-amber-400/90 to-orange-600"
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 pb-8 space-y-6">
          <div className={`${iosModalInsetCard} p-4 sm:p-5`}>
            <label className="block text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">
              Tema do sistema
            </label>
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
          <div className={`${iosModalInsetCard} p-4 sm:p-5`}>
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
            <div className={`${iosModalInsetCard} p-4 sm:p-5`}>
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

          {showWorkspaceAppearance &&
            workspaceAppearance &&
            onWorkspaceAppearanceChange &&
            onSaveWorkspaceAppearance && (
              <div className="space-y-4">
                <AppearanceSettingsSection
                  value={workspaceAppearance}
                  onChange={onWorkspaceAppearanceChange}
                  disabled={workspaceAppearanceSaving}
                />
                <button
                  type="button"
                  onClick={() => void onSaveWorkspaceAppearance()}
                  disabled={workspaceAppearanceSaving}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-yellow py-3.5 text-[15px] font-bold text-black shadow-sm transition-opacity hover:opacity-95 disabled:opacity-50"
                >
                  {workspaceAppearanceSaving ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      Salvando…
                    </>
                  ) : (
                    'Salvar aparência da oficina'
                  )}
                </button>
                <p className="text-center text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-500">
                  As alterações ficam visíveis para todos os usuários desta oficina. Imagens muito grandes em base64 podem
                  deixar o salvamento lento — prefira hospedar a imagem e colar apenas o link.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
