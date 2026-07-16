import React from 'react';
import { X } from 'lucide-react';
import { iosModalShell, iosModalClose, iosModalInsetCard, resolveIosModalOverlayClass } from './ui/iosModalStyles';
import { ModalPortal } from './ui/ModalPortal';
import { IosModalHeader } from './ui/IosModalHeader';
import { useRegisterModalOpen } from './ui/ModalLayerContext';
import { useDeviceTypeContext } from './ui/DeviceTypeContext';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { IosSwitch } from './ui/IosSwitch';
import {
  DEVICE_TYPE_LABELS,
  type DeviceTypeOverride,
} from '../utils/deviceType';

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

const DEVICE_OVERRIDE_OPTIONS: { value: DeviceTypeOverride; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'smartphone', label: 'Smartphone' },
  { value: 'tablet', label: 'Tablet' },
];

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
  const {
    label: deviceLabel,
    deviceType,
    viewportWidth,
    isTouch,
    detectedDeviceType,
    deviceTypeOverride,
    setDeviceTypeOverride,
  } = useDeviceTypeContext();
  const orientationLabel =
    orientation === 'landscape' ? 'Paisagem' : orientation === 'portrait' ? 'Retrato' : '—';
  if (!isOpen) return null;

  const detectedLabel = DEVICE_TYPE_LABELS[detectedDeviceType];
  const usingManualOverride = deviceTypeOverride !== 'auto';

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
              <p className="text-[15px] font-semibold text-zinc-900 dark:text-white">
                {usingManualOverride ? `${deviceLabel} (manual)` : deviceLabel}
              </p>
              <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">
                Automático: {detectedLabel} · {viewportWidth}px de largura
                {orientation ? ` · ${orientationLabel}` : ''}
                {isTouch ? ' · Touch' : ' · Mouse'}
              </p>

              <p className="mt-4 text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                Usar layout de
              </p>
              <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                Escolha smartphone ou tablet quando a detecção automática confundir o tamanho da tela
              </p>
              <div
                className="mt-3 grid grid-cols-3 gap-2"
                role="group"
                aria-label="Selecionar tipo de dispositivo"
              >
                {DEVICE_OVERRIDE_OPTIONS.map(({ value, label }) => {
                  const selected = deviceTypeOverride === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDeviceTypeOverride(value)}
                      aria-pressed={selected}
                      className={
                        selected
                          ? 'rounded-xl border border-[#007AFF]/45 bg-[#007AFF]/12 px-2 py-2.5 text-[13px] font-semibold text-[#007AFF] shadow-sm transition-all active:scale-[0.98] dark:border-[#0A84FF]/50 dark:bg-[#0A84FF]/18 dark:text-[#7ab8ff]'
                          : 'rounded-xl border border-zinc-200/80 bg-white/80 px-2 py-2.5 text-[13px] font-semibold text-zinc-700 transition-all hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.98] dark:border-white/10 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:bg-zinc-900'
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {usingManualOverride ? (
                <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Layout forçado: {DEVICE_TYPE_LABELS[deviceType]}. Toque em Automático para voltar à detecção.
                </p>
              ) : null}
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
