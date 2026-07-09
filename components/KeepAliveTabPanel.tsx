import React from 'react';
import type { TabId } from './TabBar';

/**
 * Mantém o filho montado após a primeira visita à aba, ocultando com `hidden`
 * quando outra aba está ativa — preserva estado local (formulários, scroll, etc.).
 */
export function KeepAliveTabPanel({
  tabId,
  activeTab,
  visitedTabs,
  children,
  className,
}: {
  tabId: TabId;
  activeTab: TabId;
  visitedTabs: Set<TabId>;
  children: React.ReactNode;
  /** Aplicado só enquanto a aba está ativa (altura + scroll + padding). */
  className?: string;
}) {
  if (!visitedTabs.has(tabId)) return null;
  const active = activeTab === tabId;
  /* inert: abas ocultas não interceptam toques (evita “app por baixo” em alguns navegadores). */
  return (
    <div
      role="tabpanel"
      hidden={!active}
      inert={active ? undefined : true}
      aria-hidden={!active}
      className={active ? [className, 'overscroll-contain'].filter(Boolean).join(' ') : undefined}
    >
      {children}
    </div>
  );
}
