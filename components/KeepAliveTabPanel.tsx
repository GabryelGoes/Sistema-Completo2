import React, { useEffect, useRef, useState } from 'react';
import type { TabId } from './TabBar';

/**
 * Mantém o filho montado após a primeira visita à aba, ocultando com `hidden`
 * quando outra aba está ativa — preserva estado local (formulários, scroll, etc.).
 * Ao reativar, aplica uma entrada suave (abrir/fechar módulos pela home).
 */
export function KeepAliveTabPanel({
  tabId,
  activeTab,
  visitedTabs,
  children,
  className,
  /**
   * Quando true, não aplica `inert` mesmo com a aba oculta.
   * Necessário para overlays portaled (ex.: hub de Configurações) abertos
   * a partir desta aba enquanto outra tela está ativa — o React 19 propaga
   * `inert` do fiber pai para portais.
   */
  suppressInert = false,
}: {
  tabId: TabId;
  activeTab: TabId;
  visitedTabs: Set<TabId>;
  children: React.ReactNode;
  /** Aplicado só enquanto a aba está ativa (altura + scroll + padding). */
  className?: string;
  suppressInert?: boolean;
}) {
  const active = activeTab === tabId;
  const wasActiveRef = useRef(false);
  const [enterAnimClass, setEnterAnimClass] = useState('');

  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = active;
    if (!active) {
      setEnterAnimClass('');
      return;
    }
    // Só anima ao tornar-se ativa (abrir o módulo), não no primeiro paint se já estava ativa.
    if (wasActive) return;
    setEnterAnimClass('');
    const raf = window.requestAnimationFrame(() => {
      setEnterAnimClass('animate-home-module-panel-in');
    });
    return () => window.cancelAnimationFrame(raf);
  }, [active]);

  if (!visitedTabs.has(tabId)) return null;

  const interactive = active || suppressInert;

  /* inert: abas ocultas não interceptam toques (evita “app por baixo” em alguns navegadores). */
  return (
    <div
      role="tabpanel"
      hidden={!active}
      inert={interactive ? undefined : true}
      aria-hidden={!active}
      className={
        active
          ? [className, 'overscroll-contain', enterAnimClass].filter(Boolean).join(' ')
          : undefined
      }
    >
      {children}
    </div>
  );
}
