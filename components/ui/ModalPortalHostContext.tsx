import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ModalPortalHostValue = {
  /** Elemento onde `ModalPortal` deve montar (ex.: shell do Ver OS em 80%). */
  host: HTMLElement | null;
  setHost: (el: HTMLElement | null) => void;
};

const ModalPortalHostContext = createContext<ModalPortalHostValue | null>(null);

export function ModalPortalHostProvider({ children }: { children: ReactNode }) {
  const [host, setHostState] = useState<HTMLElement | null>(null);
  const setHost = useCallback((el: HTMLElement | null) => {
    setHostState(el);
  }, []);
  const value = useMemo(() => ({ host, setHost }), [host, setHost]);
  return (
    <ModalPortalHostContext.Provider value={value}>{children}</ModalPortalHostContext.Provider>
  );
}

export function useModalPortalHost(): ModalPortalHostValue {
  const ctx = useContext(ModalPortalHostContext);
  if (!ctx) {
    return {
      host: null,
      setHost: () => {},
    };
  }
  return ctx;
}

export function useOptionalModalPortalHost(): ModalPortalHostValue | null {
  return useContext(ModalPortalHostContext);
}
