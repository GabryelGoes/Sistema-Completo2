import React from 'react';
import { X } from 'lucide-react';
import { Customer } from '../types';
import { iosModalShell, iosModalClose } from './ui/iosModalStyles';
import { IosModalHeader } from './ui/IosModalHeader';
import { useRegisterModalOpen } from './ui/ModalLayerContext';
import { ReceptionView } from './views/ReceptionView';
import type { ServiceOrderUpdateActor } from '../services/apiService';

interface ReceptionModalProps {
  isOpen: boolean;
  initialData: Customer | null;
  blurPlates?: boolean;
  /** Troca de instância ao abrir outro agendamento (reseta estado interno da recepção). */
  remountKey?: string | null;
  actorOptions?: ServiceOrderUpdateActor;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ReceptionModal: React.FC<ReceptionModalProps> = ({
  isOpen,
  initialData,
  blurPlates = false,
  remountKey = null,
  actorOptions,
  onClose,
  onSuccess,
}) => {
  useRegisterModalOpen(isOpen);

  if (!isOpen || !initialData) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-[20px] p-3 sm:p-6 animate-in fade-in duration-200">
      <div
        className={`${iosModalShell} w-full max-w-4xl max-h-[90vh] animate-in zoom-in-95 duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>

        <div className="px-6 sm:px-8 pt-8 pb-4 pr-14 shrink-0 border-b border-zinc-200/50 dark:border-white/[0.06]">
          <IosModalHeader
            icon={<img src="/icons/patio-ios.png" alt="" className="h-full w-full min-h-0 object-cover" />}
            title="Chegou ao pátio"
            subtitle="Confirme os dados do agendamento, assinatura do termo e crie a ficha"
            gradientClass="from-emerald-500 to-teal-700"
          />
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 px-3 sm:px-6 pb-6 custom-scrollbar">
          <ReceptionView
            key={remountKey ?? 'agenda-intake'}
            hidePageChrome
            initialData={initialData}
            forcedMode="vehicle"
            blurPlates={blurPlates}
            isReceptionTabActive={isOpen}
            actorOptions={actorOptions}
            onIntakeSuccess={() => {
              onSuccess?.();
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
};
