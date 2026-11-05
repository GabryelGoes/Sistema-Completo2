import React from 'react';
import { ModalPortal } from '../ui/ModalPortal';
import { SETTINGS_CHILD_MODAL_Z } from '../ui/iosModalStyles';
import { desktopShellViewportOverlayClass } from '../../utils/desktopShellOverlay';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  desktopShell?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
};

/**
 * Shell full-screen dos painéis RDA abertos pelo Hub de Ajustes.
 * Acima do hub (`SETTINGS_CHILD_MODAL_Z` = z-[160]); no PC respeita a sidebar.
 * Fechar só este painel — o hub permanece aberto.
 */
export const RdaSettingsChildShell: React.FC<Props> = ({
  isOpen,
  onClose,
  desktopShell,
  ariaLabel,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <ModalPortal manageBackLayer={false} onRequestClose={onClose}>
      <div
        className={`${desktopShellViewportOverlayClass(
          Boolean(desktopShell),
          SETTINGS_CHILD_MODAL_Z
        )} flex min-h-0 flex-col overflow-hidden bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </ModalPortal>
  );
};
