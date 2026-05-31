import React from 'react';
import { X } from 'lucide-react';
import { iosModalShell, iosModalClose, iosModalInsetCard, resolveIosModalOverlayClass } from './ui/iosModalStyles';
import { ModalPortal } from './ui/ModalPortal';
import { IosModalHeader } from './ui/IosModalHeader';
import { useRegisterModalOpen } from './ui/ModalLayerContext';
import { useDeviceTypeContext } from './ui/DeviceTypeContext';
import { useDesktopShellLayout } from './ui/DesktopShellContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  onThemeChange: (theme: 'dark' | 'light') => void;
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
  cinematographicMode = false,
  onCinematographicModeChange,
  orientation,
}) => {
  useRegisterModalOpen(isOpen);
  const isDesktopShell = useDesktopShellLayout();
  const { label: deviceLabel, deviceType, viewportWidth, isTouch } = useDeviceTypeContext();
  const orientationLabel =
    orientation === 'landscape' ? 'Paisagem' : orientation === 'portrait' ? 'Retrato' : '—';
  if (!isOpen) return null;

  return (
    <ModalPortal>
    <div className={resolveIosModalOverlayClass(isDesktopShell)}>
      <div className={`${iosModalShell} max-h-[94vh] max-w-xl`}>
        {!isDesktopShell ? (
          <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        ) : null}

        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className={`px-6 sm:px-8 pt-8 pb-4 shrink-0 ${isDesktopShell ? 'pr-6 sm:pr-8' : 'pr-14'}`}>
            <IosModalHeader
              icon={<img src="/icons/configuracoes-ios.png" alt="" className="h-full w-full min-h-0 object-cover" />}
              title="Configurações"
              subtitle="Aparência e experiência do app"
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 pb-8 space-y-6">
            <div className={`${iosModalInsetCard} p-4 sm:p-5`}>
              <label className="block text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                Dispositivo detectado
              </label>
              <p className="text-[15px] font-semibold text-zinc-900 dark:text-white">{deviceLabel}</p>
              <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">
                Tipo: {deviceType} · {viewportWidth}px de largura
                {orientation ? ` · ${orientationLabel}` : ''}
                {isTouch ? ' · Touch' : ' · Mouse'}
              </p>
            </div>

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
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};
