import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, Sparkles, Search, Save } from 'lucide-react';
import { ProcessingStatus } from '../types';

interface ProcessingOverlayProps {
  status: ProcessingStatus;
  onClose: () => void;
}

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({ status, onClose }) => {
  if (status.step === 'idle') return null;

  const isProcessing = ['analyzing', 'searching', 'updating', 'creating'].includes(status.step);
  const isSuccess = status.step === 'success';
  const isError = status.step === 'error';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-black/90 backdrop-blur-md animate-modal-backdrop">
      <div className="text-center max-w-sm px-6">
        
        {/* Icon Container */}
        <div className="mb-6 relative flex justify-center">
          {isProcessing && (
            <div className="relative">
              <div className="absolute inset-0 bg-brand-yellow/20 blur-xl rounded-full animate-pulse"></div>
              <Loader2 className="w-16 h-16 text-brand-yellow animate-spin relative z-10" />
            </div>
          )}
          
          {isSuccess && (
            <div className="relative animate-modal-sheet">
              <div className="absolute inset-0 bg-green-500/20 blur-xl rounded-full"></div>
              <CheckCircle2 className="w-16 h-16 text-green-500 relative z-10" />
            </div>
          )}
          
          {isError && (
            <div className="relative animate-in shake duration-500">
              <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full"></div>
              <AlertCircle className="w-16 h-16 text-red-500 relative z-10" />
            </div>
          )}
        </div>

        {/* Text: usa a mensagem quando fornecida, senão títulos genéricos */}
        <h3 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2 tracking-tight">
          {status.message
            ? status.message
            : (status.step === 'analyzing' && 'Consultando IA...') ||
              (status.step === 'searching' && 'Buscando Trello...') ||
              (status.step === 'updating' && 'Atualizando Card...') ||
              (status.step === 'creating' && 'Criando Registro...') ||
              (status.step === 'success' && 'Concluído') ||
              (status.step === 'error' && 'Erro')}
        </h3>
        
        {!status.message && (
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8 leading-relaxed">
            Processando sua solicitação com segurança.
          </p>
        )}
        {status.message && <div className="mb-8" />}

        {/* Steps Visualization (apenas quando não há mensagem customizada) */}
        {isProcessing && !status.message && (
          <div className="flex justify-center gap-2 mb-4">
            <StepIndicator active={status.step === 'analyzing'} icon={<Sparkles className="w-3 h-3"/>} />
            <div className="w-4 h-0.5 bg-zinc-200 dark:bg-zinc-800 self-center" />
            <StepIndicator active={status.step === 'searching'} icon={<Search className="w-3 h-3"/>} />
            <div className="w-4 h-0.5 bg-zinc-200 dark:bg-zinc-800 self-center" />
            <StepIndicator active={status.step === 'creating' || status.step === 'updating'} icon={<Save className="w-3 h-3"/>} />
          </div>
        )}

        {(isSuccess || isError) && (
          <button 
            onClick={onClose}
            className="bg-brand-surfaceHighlight border border-zinc-200 dark:border-zinc-700 text-white px-8 py-2.5 rounded-full hover:bg-zinc-800 transition-colors text-sm font-medium"
          >
            Fechar
          </button>
        )}
      </div>
    </div>
  );
};

const StepIndicator = ({ active, icon }: { active: boolean, icon: React.ReactNode }) => (
  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300 ${active ? 'bg-brand-yellow text-black' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500'}`}>
    {icon}
  </div>
);
