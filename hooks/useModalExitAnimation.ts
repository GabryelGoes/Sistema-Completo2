import { useCallback, useEffect, useRef, useState } from 'react';

/** Duração padrão da saída dos modais (ms). */
export const MODAL_EXIT_MS = 340;

export function getModalExitMs(): number {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 140;
  }
  return MODAL_EXIT_MS;
}

export function modalBackdropAnimClass(
  exiting: boolean,
  enterClass = 'animate-in fade-in duration-200'
): string {
  return exiting ? 'animate-modal-backdrop-out pointer-events-none' : enterClass;
}

export function modalSheetAnimClass(
  exiting: boolean,
  enterClass = 'animate-in zoom-in-95 duration-200'
): string {
  return exiting ? 'animate-modal-sheet-out pointer-events-none' : enterClass;
}

export function modalWpAppAnimClass(exiting: boolean): string {
  return exiting ? 'animate-modal-wp-app-out pointer-events-none' : 'animate-modal-wp-app';
}

/** Troca classes de entrada Tailwind por saída no overlay (fade). */
export function withModalExitOverlayClass(baseClass: string, exiting: boolean): string {
  if (!exiting) return baseClass;
  const cleaned = baseClass
    .replace(/\banimate-in\b/g, '')
    .replace(/\bfade-in\b/g, '')
    .replace(/\bduration-200\b/g, '')
    .replace(/\bduration-300\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${cleaned} animate-modal-backdrop-out pointer-events-none`;
}

/**
 * Fecha com animação: o caller mantém o estado aberto até `onFlush` rodar após a saída.
 * Durante a saída `isActive` continua true — só cancela se reabrir (false → true).
 */
export function useAnimatedModalClose(isActive: boolean, onFlush: () => void) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFlushRef = useRef(onFlush);
  const wasActiveRef = useRef(isActive);
  onFlushRef.current = onFlush;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isActive;
    // Reabriu enquanto saía: cancela o flush pendente.
    if (isActive && !wasActive) {
      clearTimer();
      setExiting(false);
    }
  }, [isActive, clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const requestClose = useCallback(() => {
    if (exiting) return;
    if (!isActive) {
      onFlushRef.current();
      return;
    }
    setExiting(true);
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setExiting(false);
      onFlushRef.current();
    }, getModalExitMs());
  }, [exiting, isActive, clearTimer]);

  const closeImmediate = useCallback(() => {
    clearTimer();
    setExiting(false);
    onFlushRef.current();
  }, [clearTimer]);

  return { exiting, requestClose, closeImmediate };
}

/**
 * Mantém o conteúdo montado enquanto a animação de saída roda após `open` virar false.
 */
export function useModalExitPresence(open: boolean, durationMs?: number) {
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  const mountedRef = useRef(open);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (open) {
      mountedRef.current = true;
      setMounted(true);
      setExiting(false);
      return;
    }
    if (!mountedRef.current) return;
    setExiting(true);
    const ms = durationMs ?? getModalExitMs();
    timerRef.current = setTimeout(() => {
      mountedRef.current = false;
      setMounted(false);
      setExiting(false);
      timerRef.current = null;
    }, ms);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, durationMs]);

  return { mounted, exiting };
}

/**
 * Como presença booleana, mas preserva o último valor nullable durante a saída.
 */
export function useModalExitValue<T>(value: T | null, durationMs?: number) {
  const open = value != null;
  const [displayed, setDisplayed] = useState<T | null>(value);
  const [exiting, setExiting] = useState(false);
  const displayedRef = useRef<T | null>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (open) {
      displayedRef.current = value;
      setDisplayed(value);
      setExiting(false);
      return;
    }
    if (displayedRef.current == null) return;
    setExiting(true);
    const ms = durationMs ?? getModalExitMs();
    timerRef.current = setTimeout(() => {
      displayedRef.current = null;
      setDisplayed(null);
      setExiting(false);
      timerRef.current = null;
    }, ms);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, value, durationMs]);

  return { displayed, exiting, mounted: displayed != null };
}
