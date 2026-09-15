import { useEffect, useRef } from 'react';
import {
  isLikelyBarcodeWedgeKeystroke,
  normalizeBarcodeInput,
} from '../utils/workshopPartBarcode';

export type UseBarcodeWedgeListenerOptions = {
  /** Quando false, não captura teclas. */
  enabled: boolean;
  /** Chamado ao detectar sequência de pistola USB (termina em Enter). */
  onScan: (code: string) => void;
  /**
   * Se true, ainda captura mesmo com focus em INPUT/TEXTAREA
   * (útil com modal de leitura aberto — a pistola troca o produto).
   * Campos lentos (digitação humana) continuam ignorados pela heurística de timing.
   */
  captureWhileFocused?: boolean;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type || 'text';
    if (['button', 'checkbox', 'radio', 'file', 'submit', 'reset', 'range', 'color'].includes(type)) {
      return false;
    }
    return true;
  }
  return target.isContentEditable;
}

/**
 * Listener global para pistola USB (HID keyboard wedge).
 * Bufferiza teclas rápidas e dispara em Enter quando a heurística indica leitura de código.
 */
export function useBarcodeWedgeListener({
  enabled,
  onScan,
  captureWhileFocused = false,
}: UseBarcodeWedgeListenerOptions): void {
  const bufferRef = useRef('');
  const startedAtRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) {
      bufferRef.current = '';
      startedAtRef.current = 0;
      return;
    }

    const reset = () => {
      bufferRef.current = '';
      startedAtRef.current = 0;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.isComposing) return;

      const focusedEditable = isEditableTarget(e.target);
      if (focusedEditable && !captureWhileFocused) {
        reset();
        return;
      }

      if (e.key === 'Enter') {
        const raw = bufferRef.current;
        const elapsed = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
        const code = normalizeBarcodeInput(raw);
        reset();
        if (
          code &&
          isLikelyBarcodeWedgeKeystroke({ elapsedMs: elapsed || 1, length: code.length })
        ) {
          e.preventDefault();
          e.stopPropagation();
          onScanRef.current(code);
        }
        return;
      }

      if (e.key === 'Escape') {
        reset();
        return;
      }

      if (e.key.length !== 1) return;

      const now = Date.now();
      if (!bufferRef.current) startedAtRef.current = now;
      else if (now - startedAtRef.current > 1400) {
        bufferRef.current = '';
        startedAtRef.current = now;
      }
      bufferRef.current += e.key;

      if (focusedEditable && captureWhileFocused) {
        /* deixa o input também receber; o Enter do wedge dispara a busca */
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, captureWhileFocused]);
}
