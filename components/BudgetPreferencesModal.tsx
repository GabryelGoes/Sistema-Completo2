import React from 'react';
import { X } from 'lucide-react';
import { iosModalShell, iosModalClose, iosModalInsetCard, resolveIosModalOverlayClass } from './ui/iosModalStyles';
import { ModalPortal } from './ui/ModalPortal';
import { IosModalHeader } from './ui/IosModalHeader';
import { useRegisterModalOpen } from './ui/ModalLayerContext';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { IosSwitch } from './ui/IosSwitch';

interface BudgetPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  blurUnverifiedBudgets: boolean;
  onBlurUnverifiedBudgetsChange: (enabled: boolean) => void;
}

export const BudgetPreferencesModal: React.FC<BudgetPreferencesModalProps> = ({
  isOpen,
  onClose,
  blurUnverifiedBudgets,
  onBlurUnverifiedBudgetsChange,
}) => {
  useRegisterModalOpen(isOpen);
  const isDesktopShell = useDesktopShellLayout();
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
                icon={
                  <img
                    src="/icons/orcamentos-ios.png"
                    alt=""
                    className="h-full w-full min-h-0 object-cover"
                  />
                }
                title="Ajustes de orçamentos"
                subtitle="Preferências do hub e da visualização de orçamentos"
              />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 pb-8">
              <div className={`${iosModalInsetCard} p-4 sm:p-5`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="text-[15px] font-medium text-zinc-900 dark:text-white block">
                      Embaçar orçamentos sem verificação
                    </label>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      No hub de Orçamentos, itens ainda não verificados ficam embassados com
                      “Aguardando aprovação” (não vale para admin / acesso total)
                    </p>
                  </div>
                  <IosSwitch
                    id="budget-prefs-blur-unverified"
                    checked={blurUnverifiedBudgets}
                    onChange={() => onBlurUnverifiedBudgetsChange(!blurUnverifiedBudgets)}
                    ariaLabel="Embaçar orçamentos sem verificação"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
