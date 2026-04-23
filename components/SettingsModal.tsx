import React from 'react';
import { X, RefreshCw, Palette } from 'lucide-react';
import { iosModalOverlay, iosModalShell, iosModalClose, iosModalInsetCard } from './ui/iosModalStyles';
import { IosModalHeader } from './ui/IosModalHeader';
import { AccentColorPicker } from './AccentColorPicker';
import { COLORFUL_TAB_ACCENTS, type AppAppearance } from '../utils/appAppearance';
import { useRegisterModalOpen } from './ui/ModalLayerContext';

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
  /** Cor de destaque da oficina — só com login admin ou permissão «acesso completo ao sistema» (`full_access`). */
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
  useRegisterModalOpen(isOpen);
  if (!isOpen) return null;

  return (
    <div className={iosModalOverlay}>
      <div
        className={`${iosModalShell} max-h-[94vh] ${
          showWorkspaceAppearance && workspaceAppearance ? 'max-w-2xl' : 'max-w-xl'
        }`}
      >
        <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="px-6 sm:px-8 pt-8 pb-4 pr-14 shrink-0">
            <IosModalHeader
              icon={<img src="/icons/configuracoes.svg" alt="" className="h-6 w-6 object-contain" />}
              title="Configurações"
              subtitle="Aparência e experiência do app"
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
                <div className={`${iosModalInsetCard} p-4 sm:p-5`}>
                  <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <Palette className="h-4 w-4" />
                    Cores da navegação
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-zinc-900 dark:text-white">Modo colorido</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                        Cada aba da barra inferior com cor própria; botões e destaques seguem a tela em foco (como em versões anteriores do app).
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={workspaceAppearance.colorfulNavigation}
                      disabled={workspaceAppearanceSaving}
                      onClick={() =>
                        onWorkspaceAppearanceChange({
                          ...workspaceAppearance,
                          colorfulNavigation: !workspaceAppearance.colorfulNavigation,
                        })
                      }
                      className={`
                        relative shrink-0 w-12 h-7 rounded-full transition-colors duration-200
                        ${workspaceAppearance.colorfulNavigation ? 'bg-brand-yellow' : 'bg-zinc-300 dark:bg-zinc-600'}
                        ${workspaceAppearanceSaving ? 'opacity-50 pointer-events-none' : ''}
                      `}
                    >
                      <span
                        className={`
                          absolute top-1 w-5 h-5 rounded-full bg-white shadow-md
                          transition-transform duration-200 ease-out
                          ${workspaceAppearance.colorfulNavigation ? 'translate-x-6 left-0.5' : 'translate-x-0 left-0.5'}
                        `}
                      />
                    </button>
                  </div>
                  {workspaceAppearance.colorfulNavigation ? (
                    <p className="mt-3 rounded-xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-2 text-[11px] leading-snug text-zinc-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-300">
                      Paleta fixa: recepção {COLORFUL_TAB_ACCENTS.reception} · agenda {COLORFUL_TAB_ACCENTS.agenda} · início{' '}
                      {COLORFUL_TAB_ACCENTS.home} · pátio {COLORFUL_TAB_ACCENTS.patio} · laboratório{' '}
                      {COLORFUL_TAB_ACCENTS.laboratorio}.
                    </p>
                  ) : null}
                </div>

                <div className={`${iosModalInsetCard} p-4 sm:p-5`}>
                  <div className="mb-4 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <Palette className="h-4 w-4" />
                    Cor única da oficina
                  </div>
                  <AccentColorPicker
                    value={workspaceAppearance.accentHex}
                    disabled={workspaceAppearanceSaving}
                    intro={
                      workspaceAppearance.colorfulNavigation
                        ? 'Com o modo colorido ligado, a cor ativa no app muda ao trocar de aba. A cor escolhida abaixo é usada quando o modo colorido estiver desligado.'
                        : undefined
                    }
                    onChange={(hex) =>
                      onWorkspaceAppearanceChange({
                        ...workspaceAppearance,
                        accentHex: hex,
                      })
                    }
                  />
                </div>
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
                    'Salvar cor da oficina'
                  )}
                </button>
                <p className="text-center text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-500">
                  Visível para todos os usuários desta oficina.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
