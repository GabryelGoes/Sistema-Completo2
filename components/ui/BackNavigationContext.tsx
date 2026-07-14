import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { markModalHistorySync } from '../../utils/modalHistoryGuard';

type BackNavigationValue = {
  registerLayer: (onPop: () => void) => () => void;
  /** Desktop Escape: há camada na pilha — dispara o histórico e retorna true. */
  tryCloseTopLayer: () => boolean;
};

export const BackNavigationContext = createContext<BackNavigationValue | null>(null);

/**
 * Pilha LIFO + `history`: cada camada faz `pushState`; o gesto voltar consome a **última** camada.
 *
 * Fechar pelo X remove a camada e sincroniza o histórico **depois do paint**, em lote
 * (`history.go(-n)`), para o modal sumir na hora no mobile e não disparar navegação de aba.
 */
export function BackNavigationProvider({ children }: { children: React.ReactNode }) {
  const stackRef = useRef<Array<() => void>>([]);
  /** Quantos popstates de sincronização ainda ignorar (close programático). */
  const suppressPopCountRef = useRef(0);
  const pendingBackStepsRef = useRef(0);
  const flushScheduledRef = useRef(false);

  const flushHistorySync = useCallback(() => {
    flushScheduledRef.current = false;
    const steps = pendingBackStepsRef.current;
    pendingBackStepsRef.current = 0;
    if (steps <= 0) return;
    // Marca antes do go — no iOS o popstate pode ser assíncrono e lento.
    markModalHistorySync(2000);
    suppressPopCountRef.current += steps;
    try {
      if (steps === 1) window.history.back();
      else window.history.go(-steps);
    } catch (_) {
      suppressPopCountRef.current = Math.max(0, suppressPopCountRef.current - steps);
    }
  }, []);

  const scheduleHistorySync = useCallback(
    (steps = 1) => {
      if (steps <= 0) return;
      pendingBackStepsRef.current += steps;
      // Marca cedo: App não interpreta popstate tardio como “voltar à Home”.
      markModalHistorySync(2000);
      if (flushScheduledRef.current) return;
      flushScheduledRef.current = true;
      // Depois do paint do React — o X fecha o modal imediatamente; history espera.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // setTimeout 0: Safari iOS às vezes atrasa o 2º rAF sob carga de unmount.
          window.setTimeout(flushHistorySync, 0);
        });
      });
    },
    [flushHistorySync]
  );

  useEffect(() => {
    const onPopState = () => {
      if (suppressPopCountRef.current > 0) {
        suppressPopCountRef.current -= 1;
        markModalHistorySync();
        return;
      }
      const fn = stackRef.current.pop();
      if (fn) {
        try {
          fn();
        } catch (_) {}
        markModalHistorySync();
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const registerLayer = useCallback(
    (onPop: () => void) => {
      stackRef.current.push(onPop);
      window.history.pushState({ rdaAppLayer: stackRef.current.length }, '');
      return () => {
        const stack = stackRef.current;
        const idx = stack.lastIndexOf(onPop);
        if (idx === -1) return;
        const wasLast = idx === stack.length - 1;
        stack.splice(idx, 1);
        if (wasLast) {
          // Fechamento pelo X: não history.back() síncrono (trava o fechamento no iPhone).
          scheduleHistorySync(1);
        }
      };
    },
    [scheduleHistorySync]
  );

  const tryCloseTopLayer = useCallback(() => {
    if (stackRef.current.length === 0) return false;
    markModalHistorySync(2000);
    window.history.back();
    return true;
  }, []);

  const value = useMemo(
    () => ({ registerLayer, tryCloseTopLayer }),
    [registerLayer, tryCloseTopLayer]
  );
  return (
    <BackNavigationContext.Provider value={value}>{children}</BackNavigationContext.Provider>
  );
}

export type BrowserBackLayerOptions = {
  /** Se retornar false, ignora popstate (ex.: câmera/galeria nativa aberta no mobile). */
  canPop?: () => boolean;
};

export function useBrowserBackLayer(
  isOpen: boolean,
  onClose: () => void,
  options?: BrowserBackLayerOptions
) {
  const ctx = useContext(BackNavigationContext);
  const onCloseRef = useRef(onClose);
  const canPopRef = useRef(options?.canPop);
  onCloseRef.current = onClose;
  canPopRef.current = options?.canPop;

  useEffect(() => {
    if (!ctx || !isOpen) return;
    return ctx.registerLayer(() => {
      if (canPopRef.current && !canPopRef.current()) return;
      onCloseRef.current();
    });
  }, [ctx, isOpen]);
}
