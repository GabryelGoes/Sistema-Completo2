import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';

type BackNavigationValue = {
  registerLayer: (onPop: () => void) => () => void;
  /** Desktop Escape: há camada na pilha — dispara `history.back()` e retorna true. */
  tryCloseTopLayer: () => boolean;
};

export const BackNavigationContext = createContext<BackNavigationValue | null>(null);

function touchModalBackHandledFlag() {
  const w = window as Window & { __rdaModalBackHandledAt?: number };
  w.__rdaModalBackHandledAt = Date.now();
}

/**
 * Pilha LIFO + `history`: cada camada faz `pushState`; o gesto voltar consome a **última** camada
 * (último overlay aberto fecha primeiro).
 */
export function BackNavigationProvider({ children }: { children: React.ReactNode }) {
  const stackRef = useRef<Array<() => void>>([]);
  const suppressPopstateRef = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      if (suppressPopstateRef.current) {
        suppressPopstateRef.current = false;
        touchModalBackHandledFlag();
        return;
      }
      const fn = stackRef.current.pop();
      if (fn) {
        try {
          fn();
        } catch (_) {}
        touchModalBackHandledFlag();
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const registerLayer = useCallback((onPop: () => void) => {
    stackRef.current.push(onPop);
    window.history.pushState({ rdaAppLayer: stackRef.current.length }, '');
    return () => {
      const stack = stackRef.current;
      const idx = stack.lastIndexOf(onPop);
      if (idx === -1) return;
      const wasLast = idx === stack.length - 1;
      stack.splice(idx, 1);
      if (wasLast) {
        suppressPopstateRef.current = true;
        window.history.back();
      }
    };
  }, []);

  const tryCloseTopLayer = useCallback(() => {
    if (stackRef.current.length === 0) return false;
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

export function useBrowserBackLayer(isOpen: boolean, onClose: () => void) {
  const ctx = useContext(BackNavigationContext);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!ctx || !isOpen) return;
    return ctx.registerLayer(() => onCloseRef.current());
  }, [ctx, isOpen]);
}
