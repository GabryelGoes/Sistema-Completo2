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
   * (útil na Home/estoque — a pistola não depende do foco).
   * Campos lentos (digitação humana) continuam ignorados pela heurística de timing.
   * Use `data-wedge-local` no campo para o listener global não interceptar (ex.: NF-e).
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

/** Campos que devem receber a pistola localmente (não abrir o hub global). */
function isLocalWedgeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[data-wedge-local]')) return true;
  if (target instanceof HTMLInputElement && target.type === 'password') return true;
  return false;
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
  const lastKeyAtRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) {
      bufferRef.current = '';
      startedAtRef.current = 0;
      lastKeyAtRef.current = 0;
      return;
    }

    const reset = () => {
      bufferRef.current = '';
      startedAtRef.current = 0;
      lastKeyAtRef.current = 0;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.isComposing) return;

      const focusedEditable = isEditableTarget(e.target);
      const localWedge = isLocalWedgeTarget(e.target);

      // Campo local (NF-e, senha…): não interfere — deixa o input receber tudo.
      if (localWedge) {
        reset();
        return;
      }

      if (focusedEditable && !captureWhileFocused) {
        reset();
        return;
      }

      if (e.key === 'Enter' || e.key === 'Tab' || e.code === 'NumpadEnter') {
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
          // Se a pistola digitou no input focado, limpa o lixo injetado.
          if (focusedEditable && e.target instanceof HTMLInputElement) {
            const el = e.target;
            const v = el.value || '';
            if (v === code || v.endsWith(code)) {
              el.value = v === code ? '' : v.slice(0, Math.max(0, v.length - code.length));
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
          onScanRef.current(code);
        }
        return;
      }

      if (e.key === 'Escape') {
        reset();
        return;
      }

      // Aceita caractere imprimível (e.key) ou dígitos do teclado numérico via e.code.
      let ch = '';
      if (e.key.length === 1) {
        ch = e.key;
      } else if (/^Digit[0-9]$/.test(e.code) || /^Numpad[0-9]$/.test(e.code)) {
        ch = e.code.replace(/^(Digit|Numpad)/, '');
      } else {
        return;
      }

      const now = Date.now();
      if (!bufferRef.current) {
        startedAtRef.current = now;
        lastKeyAtRef.current = now;
      } else {
        const gap = now - lastKeyAtRef.current;
        // Pausa longa = nova leitura (não misturar com digitação anterior).
        if (gap > 180) {
          bufferRef.current = '';
          startedAtRef.current = now;
        }
        lastKeyAtRef.current = now;
      }
      bufferRef.current += ch;
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, captureWhileFocused]);
}
