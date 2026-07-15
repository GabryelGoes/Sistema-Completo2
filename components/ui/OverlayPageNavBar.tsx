import { X } from 'lucide-react';
import { useContext } from 'react';
import { ModalLayerContext } from './ModalLayerContext';

/**
 * Botão "Fechar" fixo em páginas abertas pela Home (fora da aba Início).
 * Oculto quando há modal em portal (ex.: visualização de orçamento no hub), que traz o próprio fechar.
 */
export function OverlayPageNavBar({
  visible,
  onBack,
  label = 'Fechar',
}: {
  visible: boolean;
  onBack: () => void;
  /** aria-label / title do botão (ex.: "Voltar ao Pátio"). */
  label?: string;
}) {
  const ctx = useContext(ModalLayerContext);
  const openCount = ctx?.openCount ?? 0;
  if (!visible || openCount > 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-start px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <button
        type="button"
        onClick={onBack}
        className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/75 bg-white/80 text-zinc-700 shadow-[0_4px_18px_-8px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all hover:bg-white/95 active:scale-[0.97] dark:border-white/[0.12] dark:bg-zinc-900/75 dark:text-zinc-200 dark:hover:bg-zinc-900/90"
        aria-label={label}
        title={label}
      >
        <X className="h-5 w-5" strokeWidth={2.25} />
      </button>
    </div>
  );
}
