import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";

type ModalLayerValue = {
  /** Quantidade de camadas/modais ativos (portal ou registro explícito). */
  openCount: number;
  register: () => void;
  unregister: () => void;
};

export const ModalLayerContext = createContext<ModalLayerValue | null>(null);

export function ModalLayerProvider({ children }: { children: React.ReactNode }) {
  const [openCount, setOpenCount] = useState(0);
  const register = useCallback(() => {
    setOpenCount((c) => c + 1);
  }, []);
  const unregister = useCallback(() => {
    setOpenCount((c) => Math.max(0, c - 1));
  }, []);
  const value = useMemo(
    () => ({ openCount, register, unregister }),
    [openCount, register, unregister]
  );
  return <ModalLayerContext.Provider value={value}>{children}</ModalLayerContext.Provider>;
}

export function useModalLayer(): ModalLayerValue {
  const ctx = useContext(ModalLayerContext);
  if (!ctx) {
    throw new Error("useModalLayer deve ser usado dentro de ModalLayerProvider.");
  }
  return ctx;
}

/** Incrementa o contador enquanto `isOpen` for true (modais sem `ModalPortal`). */
export function useRegisterModalOpen(isOpen: boolean) {
  const ctx = useContext(ModalLayerContext);
  useEffect(() => {
    if (!ctx || !isOpen) return;
    ctx.register();
    return () => ctx.unregister();
  }, [ctx, isOpen]);
}
