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

type RdaHistoryWindow = Window & {
  __rdaModalBackHandledAt?: number;
  /** Ignora o próximo popstate do App (fechar modal via X / cleanup da pilha). */
  __rdaIgnoreAppPopstate?: boolean;
};

/** Marca que o próximo popstate é interno (fechar overlay) — o App não deve ir à Home. */
export function markProgrammaticHistoryBack() {
  const w = window as RdaHistoryWindow;
  w.__rdaModalBackHandledAt = Date.now();
  w.__rdaIgnoreAppPopstate = true;
}

function touchModalBackHandledFlag() {
  const w = window as RdaHistoryWindow;
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
        // Mantém __rdaIgnoreAppPopstate para o listener do App (pode rodar depois).
        touchModalBackHandledFlag();
        return;
      }
      const fn = stackRef.current.pop();
      if (fn) {
        try {
          fn();
        } catch (_) {}
        markProgrammaticHistoryBack();
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
        // Marca ANTES do history.back(): o App também escuta popstate e, se
        // rodar primeiro, não deve tratar isso como “voltar à Home”.
        suppressPopstateRef.current = true;
        markProgrammaticHistoryBack();
        window.history.back();
      }
    };
  }, []);

  const tryCloseTopLayer = useCallback(() => {
    if (stackRef.current.length === 0) return false;
    markProgrammaticHistoryBack();
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
