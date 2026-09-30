import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TabId } from './TabBar';
import {
  IOS_SOURCE_EXPAND_EASING,
  IOS_SOURCE_EXPAND_MS,
  computeSourceExpandInvert,
  prefersReducedMotion,
  type SourceExpandRect,
} from '../utils/iosSourceExpandTransition';

/**
 * Mantém o filho montado após a primeira visita à aba, ocultando com `hidden`
 * quando outra aba está ativa — preserva estado local (formulários, scroll, etc.).
 * Ao reativar, aplica uma entrada suave (abrir/fechar módulos pela home),
 * ou FLIP a partir de um botão (`sourceExpandOrigin`) no estilo iOS.
 */
export function KeepAliveTabPanel({
  tabId,
  activeTab,
  visitedTabs,
  children,
  className,
  sourceExpandOrigin = null,
  sourceExpandClosing = false,
  sourceExpandCloseTarget = null,
  onSourceExpandOpenDone,
  onSourceExpandCloseDone,
}: {
  tabId: TabId;
  activeTab: TabId;
  visitedTabs: Set<TabId>;
  children: React.ReactNode;
  /** Aplicado só enquanto a aba está ativa (altura + scroll + padding). */
  className?: string;
  /** Origem (botão) para FLIP de abertura. */
  sourceExpandOrigin?: SourceExpandRect | null;
  /** Quando true, anima o recolhimento até `sourceExpandCloseTarget`. */
  sourceExpandClosing?: boolean;
  sourceExpandCloseTarget?: SourceExpandRect | null;
  onSourceExpandOpenDone?: () => void;
  onSourceExpandCloseDone?: () => void;
}) {
  const active = activeTab === tabId;
  const wasActiveRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [enterAnimClass, setEnterAnimClass] = useState('');
  const openAnimGenRef = useRef(0);
  const closeAnimGenRef = useRef(0);

  const setChildrenOpacity = (panel: HTMLElement, opacity: string, withTransition: boolean) => {
    const child = panel.firstElementChild as HTMLElement | null;
    if (!child) return;
    if (withTransition) {
      child.style.willChange = 'opacity';
      child.style.transition = `opacity ${Math.round(IOS_SOURCE_EXPAND_MS * 0.75)}ms ${IOS_SOURCE_EXPAND_EASING}`;
    } else {
      child.style.transition = 'none';
    }
    child.style.opacity = opacity;
  };

  const clearChildrenOpacity = (panel: HTMLElement) => {
    const child = panel.firstElementChild as HTMLElement | null;
    if (!child) return;
    child.style.willChange = '';
    child.style.transition = '';
    child.style.opacity = '';
  };

  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = active;
    if (!active) {
      setEnterAnimClass('');
      return;
    }
    if (wasActive) return;
    if (sourceExpandOrigin && !prefersReducedMotion()) {
      setEnterAnimClass('');
      return;
    }
    setEnterAnimClass('');
    const raf = window.requestAnimationFrame(() => {
      setEnterAnimClass('animate-home-module-panel-in');
    });
    return () => window.cancelAnimationFrame(raf);
  }, [active, sourceExpandOrigin]);

  // Abertura FLIP
  useLayoutEffect(() => {
    if (!active || !sourceExpandOrigin || sourceExpandClosing) return;
    if (prefersReducedMotion()) {
      onSourceExpandOpenDone?.();
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;

    const gen = ++openAnimGenRef.current;
    const last = panel.getBoundingClientRect();
    const invert = computeSourceExpandInvert(sourceExpandOrigin, last);

    panel.style.willChange = 'transform, border-radius';
    panel.style.transformOrigin = 'top left';
    panel.style.transition = 'none';
    panel.style.transform = invert.transform;
    panel.style.borderRadius = invert.borderRadius;
    panel.style.overflow = 'hidden';
    setChildrenOpacity(panel, '0.28', false);

    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (openAnimGenRef.current !== gen) return;
        panel.style.transition = `transform ${IOS_SOURCE_EXPAND_MS}ms ${IOS_SOURCE_EXPAND_EASING}, border-radius ${IOS_SOURCE_EXPAND_MS}ms ${IOS_SOURCE_EXPAND_EASING}`;
        panel.style.transform = 'none';
        panel.style.borderRadius = '';
        setChildrenOpacity(panel, '1', true);
      });
    });

    const done = (ev?: TransitionEvent) => {
      if (ev && ev.target !== panel) return;
      if (openAnimGenRef.current !== gen) return;
      panel.style.willChange = '';
      panel.style.transition = '';
      panel.style.transform = '';
      panel.style.transformOrigin = '';
      panel.style.borderRadius = '';
      panel.style.overflow = '';
      clearChildrenOpacity(panel);
      onSourceExpandOpenDone?.();
    };

    panel.addEventListener('transitionend', done as EventListener);
    const fallback = window.setTimeout(() => done(), IOS_SOURCE_EXPAND_MS + 80);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(fallback);
      panel.removeEventListener('transitionend', done as EventListener);
    };
  }, [active, sourceExpandOrigin, sourceExpandClosing, onSourceExpandOpenDone]);

  // Fechamento FLIP → botão
  useLayoutEffect(() => {
    if (!sourceExpandClosing || !sourceExpandCloseTarget) return;
    if (prefersReducedMotion()) {
      onSourceExpandCloseDone?.();
      return;
    }
    const panel = panelRef.current;
    if (!panel) {
      onSourceExpandCloseDone?.();
      return;
    }

    const gen = ++closeAnimGenRef.current;
    const last = panel.getBoundingClientRect();
    const invert = computeSourceExpandInvert(sourceExpandCloseTarget, last);

    panel.style.willChange = 'transform, border-radius';
    panel.style.transformOrigin = 'top left';
    panel.style.transition = 'none';
    panel.style.transform = 'none';
    panel.style.borderRadius = '';
    panel.style.overflow = 'hidden';
    setChildrenOpacity(panel, '1', false);

    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (closeAnimGenRef.current !== gen) return;
        panel.style.transition = `transform ${IOS_SOURCE_EXPAND_MS}ms ${IOS_SOURCE_EXPAND_EASING}, border-radius ${IOS_SOURCE_EXPAND_MS}ms ${IOS_SOURCE_EXPAND_EASING}`;
        panel.style.transform = invert.transform;
        panel.style.borderRadius = invert.borderRadius;
        setChildrenOpacity(panel, '0.15', true);
      });
    });

    const done = (ev?: TransitionEvent) => {
      if (ev && ev.target !== panel) return;
      if (closeAnimGenRef.current !== gen) return;
      panel.style.willChange = '';
      panel.style.transition = '';
      panel.style.transform = '';
      panel.style.transformOrigin = '';
      panel.style.borderRadius = '';
      panel.style.overflow = '';
      clearChildrenOpacity(panel);
      onSourceExpandCloseDone?.();
    };

    panel.addEventListener('transitionend', done as EventListener);
    const fallback = window.setTimeout(() => done(), IOS_SOURCE_EXPAND_MS + 80);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(fallback);
      panel.removeEventListener('transitionend', done as EventListener);
    };
  }, [sourceExpandClosing, sourceExpandCloseTarget, onSourceExpandCloseDone]);

  if (!visitedTabs.has(tabId)) return null;

  /* Durante o fechamento FLIP o painel permanece visível mesmo se a aba já não for a ativa. */
  const showPanel = active || sourceExpandClosing;

  return (
    <div
      ref={panelRef}
      role="tabpanel"
      data-keepalive-tab={tabId}
      hidden={!showPanel}
      inert={showPanel ? undefined : true}
      aria-hidden={!showPanel}
      className={
        showPanel
          ? [
              className,
              'overscroll-contain',
              enterAnimClass,
              sourceExpandClosing ? 'bg-zinc-100 dark:bg-zinc-950' : '',
            ]
              .filter(Boolean)
              .join(' ')
          : undefined
      }
      style={
        sourceExpandClosing
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 80,
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
