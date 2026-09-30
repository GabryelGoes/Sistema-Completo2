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
 *
 * Suporta FLIP a partir de um botão (`sourceExpandOrigin`) e um painel
 * «underlay» visível atrás da transição (ex.: Pátio atrás do cadastro).
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
  underlayVisible = false,
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
  /**
   * Mantém o painel visível atrás da transição (ex.: Pátio sob o cadastro),
   * sem receber input — só montagem local, sem refetch.
   */
  underlayVisible?: boolean;
  onSourceExpandOpenDone?: () => void;
  onSourceExpandCloseDone?: () => void;
}) {
  const active = activeTab === tabId;
  const wasActiveRef = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [enterAnimClass, setEnterAnimClass] = useState('');
  const openAnimGenRef = useRef(0);
  const closeAnimGenRef = useRef(0);
  const closeStartedRef = useRef(false);

  const setChildrenOpacity = (panel: HTMLElement, opacity: string, withTransition: boolean) => {
    const child = panel.firstElementChild as HTMLElement | null;
    if (!child) return;
    if (withTransition) {
      child.style.willChange = 'opacity';
      child.style.transition = `opacity ${Math.round(IOS_SOURCE_EXPAND_MS * 0.7)}ms ${IOS_SOURCE_EXPAND_EASING}`;
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

  const clearPanelMotionStyles = (panel: HTMLElement) => {
    panel.style.willChange = '';
    panel.style.transition = '';
    panel.style.transform = '';
    panel.style.transformOrigin = '';
    panel.style.borderRadius = '';
    panel.style.overflow = '';
    clearChildrenOpacity(panel);
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
    // Cancela qualquer fechamento pendente
    closeAnimGenRef.current += 1;
    closeStartedRef.current = false;

    panel.style.position = 'relative';
    panel.style.zIndex = '30';
    panel.style.willChange = 'transform, border-radius';
    panel.style.transformOrigin = 'top left';
    panel.style.transition = 'none';
    panel.style.overflow = 'hidden';

    const last = panel.getBoundingClientRect();
    const invert = computeSourceExpandInvert(sourceExpandOrigin, last);
    panel.style.transform = invert.transform;
    panel.style.borderRadius = invert.borderRadius;
    setChildrenOpacity(panel, '0.22', false);

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

    const done = (ev?: Event) => {
      if (ev && ev instanceof TransitionEvent) {
        if (ev.target !== panel) return;
        if (ev.propertyName !== 'transform') return;
      }
      if (openAnimGenRef.current !== gen) return;
      clearPanelMotionStyles(panel);
      panel.style.position = '';
      panel.style.zIndex = '';
      onSourceExpandOpenDone?.();
    };

    panel.addEventListener('transitionend', done);
    const fallback = window.setTimeout(() => done(), IOS_SOURCE_EXPAND_MS + 100);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(fallback);
      panel.removeEventListener('transitionend', done);
    };
  }, [active, sourceExpandOrigin, sourceExpandClosing, onSourceExpandOpenDone]);

  // Fechamento FLIP → botão (Pátio já visível atrás)
  useLayoutEffect(() => {
    if (!sourceExpandClosing) {
      closeStartedRef.current = false;
      return;
    }
    if (!sourceExpandCloseTarget) return;
    if (prefersReducedMotion()) {
      onSourceExpandCloseDone?.();
      return;
    }
    const panel = panelRef.current;
    if (!panel) {
      onSourceExpandCloseDone?.();
      return;
    }

    // Evita reiniciar a animação se o target for só atualizado
    if (closeStartedRef.current) return;
    closeStartedRef.current = true;

    const gen = ++closeAnimGenRef.current;
    // Cancela abertura em curso
    openAnimGenRef.current += 1;

    // Congela em tela cheia (Last) antes de inverter para o botão
    panel.style.position = 'fixed';
    panel.style.inset = '0';
    panel.style.zIndex = '80';
    panel.style.width = '100%';
    panel.style.height = '100%';
    panel.style.transformOrigin = 'top left';
    panel.style.transition = 'none';
    panel.style.transform = 'none';
    panel.style.borderRadius = '';
    panel.style.overflow = 'hidden';
    panel.style.willChange = 'transform, border-radius';
    setChildrenOpacity(panel, '1', false);
    void panel.offsetWidth;

    const last = panel.getBoundingClientRect();
    const invert = computeSourceExpandInvert(sourceExpandCloseTarget, last);

    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        if (closeAnimGenRef.current !== gen) return;
        panel.style.transition = `transform ${IOS_SOURCE_EXPAND_MS}ms ${IOS_SOURCE_EXPAND_EASING}, border-radius ${IOS_SOURCE_EXPAND_MS}ms ${IOS_SOURCE_EXPAND_EASING}`;
        panel.style.transform = invert.transform;
        panel.style.borderRadius = invert.borderRadius;
        setChildrenOpacity(panel, '0.12', true);
      });
    });

    const done = (ev?: Event) => {
      if (ev && ev instanceof TransitionEvent) {
        if (ev.target !== panel) return;
        if (ev.propertyName !== 'transform') return;
      }
      if (closeAnimGenRef.current !== gen) return;
      clearPanelMotionStyles(panel);
      panel.style.position = '';
      panel.style.inset = '';
      panel.style.zIndex = '';
      panel.style.width = '';
      panel.style.height = '';
      closeStartedRef.current = false;
      onSourceExpandCloseDone?.();
    };

    panel.addEventListener('transitionend', done);
    const fallback = window.setTimeout(() => done(), IOS_SOURCE_EXPAND_MS + 100);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(fallback);
      panel.removeEventListener('transitionend', done);
    };
  }, [sourceExpandClosing, sourceExpandCloseTarget, onSourceExpandCloseDone]);

  if (!visitedTabs.has(tabId)) return null;

  const showAsOverlay = sourceExpandClosing;
  const showAsUnderlay = underlayVisible && !active && !showAsOverlay;
  const showPanel = active || showAsOverlay || showAsUnderlay;

  return (
    <div
      ref={panelRef}
      role="tabpanel"
      data-keepalive-tab={tabId}
      data-keepalive-underlay={showAsUnderlay ? '1' : undefined}
      hidden={!showPanel}
      inert={active && !showAsOverlay ? undefined : true}
      aria-hidden={!active || showAsOverlay ? !showPanel || showAsUnderlay : false}
      className={
        showPanel
          ? [
              className,
              'overscroll-contain',
              enterAnimClass,
              showAsOverlay || (active && sourceExpandOrigin) ? 'bg-zinc-100 dark:bg-zinc-950' : '',
            ]
              .filter(Boolean)
              .join(' ')
          : undefined
      }
      style={
        showAsOverlay
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 80,
            }
          : showAsUnderlay
            ? {
                position: 'absolute',
                inset: 0,
                zIndex: 0,
                pointerEvents: 'none',
                // Fora do fluxo flex para não empurrar o painel ativo
                flex: 'none',
              }
            : active && sourceExpandOrigin
              ? {
                  position: 'relative',
                  zIndex: 30,
                }
              : undefined
      }
    >
      {children}
    </div>
  );
}
