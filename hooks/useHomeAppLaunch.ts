import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  armHomeLaunch,
  beginHomeLaunchClose,
  clearHomeLaunch,
  completeHomeLaunchClose,
  getHomeLaunchSession,
  HOME_LAUNCH_CLOSE_EASING,
  HOME_LAUNCH_CLOSE_MS,
  HOME_LAUNCH_EASING,
  HOME_LAUNCH_OPEN_MS,
  homeLaunchMatchesOverlay,
  homeLaunchMatchesTab,
  isHomeLaunchTransitioning,
  markHomeLaunchOpen,
  measureLiveHomeLaunchIcon,
  playHomeLaunchFlip,
  prefersHomeLaunchReducedMotion,
  queryHomeLaunchIcon,
  resolveHomeLaunchSurfaceRect,
  subscribeHomeLaunch,
  type HomeLaunchSession,
  type HomeLaunchTarget,
} from '../utils/homeAppLaunchTransition';

function getSnapshot(): HomeLaunchSession | null {
  return getHomeLaunchSession();
}

function getServerSnapshot(): HomeLaunchSession | null {
  return null;
}

export function useHomeLaunchSession(): HomeLaunchSession | null {
  return useSyncExternalStore(subscribeHomeLaunch, getSnapshot, getServerSnapshot);
}

export function useHomeLaunchTransitioning(): boolean {
  const session = useHomeLaunchSession();
  return !!session && (session.phase === 'opening' || session.phase === 'closing');
}

/** Arma a sessão a partir do ícone (posição atual) e devolve se armou. */
export function useArmHomeLaunch() {
  return useCallback((tileId: string, target: HomeLaunchTarget, sourceEl?: Element | null) => {
    return armHomeLaunch({
      tileId,
      target,
      sourceEl: sourceEl ?? queryHomeLaunchIcon(tileId),
    });
  }, []);
}

/**
 * Fecha com animação de retorno ao ícone. Se não houver sessão, chama `flush` na hora.
 * Retorna true se a navegação/desmontagem deve esperar.
 */
export function requestHomeLaunchClose(flush: () => void): boolean {
  return beginHomeLaunchClose(flush);
}

type SurfaceKind = { kind: 'tab'; tabId: string } | { kind: 'overlay'; overlayId: string };

/**
 * Liga um surface (painel de aba ou overlay) à sessão de launch:
 * - opening → FLIP do ícone até o destino
 * - closing → FLIP de volta ao ícone (posição ao vivo)
 */
export function useHomeLaunchSurface(
  kind: SurfaceKind,
  enabled: boolean
): {
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  session: HomeLaunchSession | null;
  isLaunchSurface: boolean;
  isBackdropHome: boolean;
} {
  const session = useHomeLaunchSession();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const runningRef = useRef(false);
  const matches =
    enabled &&
    !!session &&
    (kind.kind === 'tab'
      ? homeLaunchMatchesTab(kind.tabId)
      : homeLaunchMatchesOverlay(kind.overlayId));

  const isLaunchSurface =
    matches && (session!.phase === 'opening' || session!.phase === 'open' || session!.phase === 'closing');

  useEffect(() => {
    if (!enabled || !session || !matches) return;
    if (session.phase !== 'opening' && session.phase !== 'closing') return;
    if (runningRef.current) return;

    const surface = surfaceRef.current;
    if (!surface) return;

    runningRef.current = true;
    let cancelled = false;

    const run = async () => {
      // Duas frames para layout estável (evita jump no primeiro paint).
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      if (cancelled) {
        runningRef.current = false;
        return;
      }

      const surfaceEl = surfaceRef.current;
      if (!surfaceEl) {
        runningRef.current = false;
        if (session.phase === 'opening') markHomeLaunchOpen();
        else completeHomeLaunchClose();
        return;
      }

      const destRect = resolveHomeLaunchSurfaceRect(surfaceEl);
      const liveIcon =
        session.phase === 'closing' ? measureLiveHomeLaunchIcon(session.tileId) : null;
      const iconRect = liveIcon ?? session.sourceRect;

      if (prefersHomeLaunchReducedMotion()) {
        if (session.phase === 'opening') markHomeLaunchOpen();
        else completeHomeLaunchClose();
        runningRef.current = false;
        return;
      }

      try {
        if (session.phase === 'opening') {
          await playHomeLaunchFlip({
            surface: surfaceEl,
            content: contentRef.current,
            from: iconRect,
            to: destRect,
            durationMs: HOME_LAUNCH_OPEN_MS,
            easing: HOME_LAUNCH_EASING,
            direction: 'open',
          });
          if (!cancelled) markHomeLaunchOpen();
        } else {
          await playHomeLaunchFlip({
            surface: surfaceEl,
            content: contentRef.current,
            from: iconRect,
            to: destRect,
            durationMs: HOME_LAUNCH_CLOSE_MS,
            easing: HOME_LAUNCH_CLOSE_EASING,
            direction: 'close',
          });
          if (!cancelled) completeHomeLaunchClose();
        }
      } catch {
        if (session.phase === 'opening') markHomeLaunchOpen();
        else completeHomeLaunchClose();
      } finally {
        runningRef.current = false;
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // session.phase + match identity
  }, [enabled, matches, session?.phase, session?.tileId, kind.kind === 'tab' ? kind.tabId : kind.overlayId]);

  return {
    surfaceRef,
    contentRef,
    session,
    isLaunchSurface: !!isLaunchSurface,
    isBackdropHome: false,
  };
}

/** Home como backdrop durante opening/closing de qualquer launch. */
export function useHomeLaunchBackdrop(isHomeTab: boolean): {
  showAsBackdrop: boolean;
  tileId: string | null;
} {
  const session = useHomeLaunchSession();
  const transitioning = isHomeLaunchTransitioning();
  return {
    showAsBackdrop: isHomeTab && transitioning,
    tileId: session?.tileId ?? null,
  };
}

export function cancelHomeLaunch(): void {
  clearHomeLaunch();
}
