import React, { useEffect, useRef, useState } from 'react';
import type { TabId } from './TabBar';
import {
  useHomeLaunchBackdrop,
  useHomeLaunchSession,
  useHomeLaunchSurface,
} from '../hooks/useHomeAppLaunch';

/**
 * Mantém o filho montado após a primeira visita à aba, ocultando com `hidden`
 * quando outra aba está ativa — preserva estado local (formulários, scroll, etc.).
 * Abertura/fechamento pela Home usa shared-element FLIP (ícone ↔ painel).
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
  const active = activeTab === tabId;
  const wasActiveRef = useRef(false);
  const [enterAnimClass, setEnterAnimClass] = useState('');
  const session = useHomeLaunchSession();

  const closingThisTab =
    session?.phase === 'closing' &&
    session.target.kind === 'tab' &&
    session.target.tabId === tabId;

  const { surfaceRef, contentRef, isLaunchSurface } = useHomeLaunchSurface(
    { kind: 'tab', tabId },
    active || closingThisTab
  );

  const { showAsBackdrop, tileId } = useHomeLaunchBackdrop(tabId === 'home');

  // Home fica visível atrás durante opening/closing; a aba de origem permanece
  // montada no fluxo até o flush do fechamento.
  const forceVisibleForLaunch = showAsBackdrop || closingThisTab;
  const visible = active || forceVisibleForLaunch;

  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = active;
    if (!active) {
      setEnterAnimClass('');
      return;
    }
    // Shared-element da Home substitui o fade/slide genérico.
    if (session && session.target.kind === 'tab' && session.target.tabId === tabId) {
      setEnterAnimClass('');
      return;
    }
    if (wasActive) return;
    setEnterAnimClass('');
    const raf = window.requestAnimationFrame(() => {
      setEnterAnimClass('animate-home-module-panel-in');
    });
    return () => window.cancelAnimationFrame(raf);
  }, [active, session, tabId]);

  if (!visitedTabs.has(tabId) && !forceVisibleForLaunch) return null;

  const stackedHomeBackdrop = showAsBackdrop;

  /* inert: abas ocultas / backdrop não interceptam toques. */
  const hideAttr = visible ? undefined : true;
  const inertAttr = active && !stackedHomeBackdrop ? undefined : true;

  return (
    <div
      ref={surfaceRef}
      role="tabpanel"
      hidden={hideAttr}
      inert={inertAttr}
      aria-hidden={!active || stackedHomeBackdrop}
      data-home-launch-surface={isLaunchSurface ? tabId : undefined}
      data-home-launch-backdrop={stackedHomeBackdrop ? '1' : undefined}
      data-home-launch-origin-tile={stackedHomeBackdrop ? tileId ?? undefined : undefined}
      className={
        visible
          ? [
              className,
              'overscroll-contain',
              enterAnimClass,
              stackedHomeBackdrop
                ? 'absolute inset-0 z-[1] home-launch-backdrop pointer-events-none'
                : isLaunchSurface || closingThisTab
                  ? 'relative z-[2] home-launch-surface'
                  : active
                    ? 'relative z-[1]'
                    : undefined,
            ]
              .filter(Boolean)
              .join(' ')
          : undefined
      }
    >
      <div ref={contentRef} className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
