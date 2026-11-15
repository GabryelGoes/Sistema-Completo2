import React from 'react';
import { ModalPortal } from '../ui/ModalPortal';
import { SETTINGS_CHILD_MODAL_Z } from '../ui/iosModalStyles';
import { desktopShellViewportOverlayClass } from '../../utils/desktopShellOverlay';
import { ajustesPcRdaClass } from '../ajustes/AjustesPcLayoutContext';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  desktopShell?: boolean;
  /**
   * Chrome visual A4 — somente quando o painel foi aberto a partir do Hub de Ajustes desktop.
   * Não aplicar quando Proativo/Produtividade abrem pelo header/atalhos fora do hub.
   */
  ajustesHubChrome?: boolean;
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
  ajustesHubChrome = false,
  ariaLabel,
  children,
}) => {
  if (!isOpen) return null;

  const pcRda = Boolean(ajustesHubChrome && desktopShell);

  return (
    <ModalPortal manageBackLayer onRequestClose={onClose}>
      <div
        className={`${desktopShellViewportOverlayClass(
          Boolean(desktopShell),
          SETTINGS_CHILD_MODAL_Z
        )} ${ajustesPcRdaClass(pcRda)} flex min-h-0 flex-col overflow-hidden bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-ajustes-rda-chrome={pcRda ? 'true' : undefined}
      >
        {children}
      </div>
    </ModalPortal>
  );
};
