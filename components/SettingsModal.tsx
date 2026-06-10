import React from 'react';
import { X } from 'lucide-react';
import { iosModalShell, iosModalClose, iosModalInsetCard, resolveIosModalOverlayClass } from './ui/iosModalStyles';
import { ModalPortal } from './ui/ModalPortal';
import { IosModalHeader } from './ui/IosModalHeader';
import { useRegisterModalOpen } from './ui/ModalLayerContext';
import { useDeviceTypeContext } from './ui/DeviceTypeContext';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { IosSwitch } from './ui/IosSwitch';

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
        <button
          type="button"
          onClick={onClose}
          className={`${iosModalClose} z-50 shadow-sm ring-1 ring-zinc-200/80 dark:ring-white/10`}
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className="px-6 sm:px-8 pt-8 pb-4 shrink-0 pr-14">
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
              <div className="flex items-center justify-between gap-4">
                <div>
                  <label className="text-[15px] font-medium text-zinc-900 dark:text-white block">
                    Tema escuro
                  </label>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Desligado usa o tema claro em todo o sistema
                  </p>
                </div>
                <IosSwitch
                  id="settings-modal-dark-theme"
                  checked={theme === 'dark'}
                  onChange={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
                  ariaLabel="Ativar tema escuro"
                />
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
                  <IosSwitch
                    id="settings-modal-cinematic-mode"
                    checked={cinematographicMode}
                    onChange={() => onCinematographicModeChange(!cinematographicMode)}
                    ariaLabel="Ativar modo cinematográfico"
                  />
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
