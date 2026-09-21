import { useEffect, useRef } from 'react';
import {
  isLikelyBarcodeWedgeKeystroke,
  normalizeBarcodeInput,
} from '../utils/workshopPartBarcode';

export type UseBarcodeWedgeListenerOptions = {
  /** Quando false, não captura teclas. */
  enabled: boolean;
  /** Chamado ao detectar sequência de pistola USB (termina em Enter/Tab). */
  onScan: (code: string) => void;
  /**
   * Se true, ainda observa teclas com focus em INPUT/TEXTAREA.
   * Digitação humana NÃO é engolida — só remove o código do campo se a
   * sequência for confirmada como pistola no Enter/Tab.
   * Use `data-wedge-local` (ou type=password) para não interceptar o campo.
   */
  captureWhileFocused?: boolean;
};

/** Pausa máxima entre teclas da mesma leitura (ms). Acima disso, reinicia o buffer. */
const MAX_INTER_KEY_GAP_MS = 120;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type || 'text';
    if (['button', 'checkbox', 'radio', 'file', 'submit', 'reset', 'range', 'color', 'hidden'].includes(type)) {
      return false;
    }
    return true;
  }
  return target.isContentEditable;
}

function isLocalWedgeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[data-wedge-local]')) return true;
  if (target instanceof HTMLInputElement && target.type === 'password') return true;
  return false;
}

function setNativeInputValue(el: HTMLInputElement | HTMLTextAreaElement, next: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  desc?.set?.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function isTerminatorKey(e: KeyboardEvent): boolean {
  return (
    e.key === 'Enter' ||
    e.key === 'Tab' ||
    e.code === 'Enter' ||
    e.code === 'NumpadEnter' ||
    e.code === 'Tab'
  );
}

function charFromKeyEvent(e: KeyboardEvent): string | null {
  if (e.key.length === 1) return e.key;
  if (/^Digit[0-9]$/.test(e.code) || /^Numpad[0-9]$/.test(e.code)) {
    return e.code.replace(/^(Digit|Numpad)/, '');
  }
  // Alguns SO/leitores mandam Unidentified; tenta pelo code de letra.
  if (e.key === 'Unidentified' && /^Key[A-Z]$/.test(e.code)) {
    const letter = e.code.slice(3);
    return e.shiftKey ? letter : letter.toLowerCase();
  }
  return null;
}

/**
 * Listener global para pistola USB (HID keyboard wedge).
 * Funciona em qualquer tela autenticada, inclusive com campo de busca focado.
 * Nunca chama preventDefault em teclas de caractere com campo editável focado
 * (evita “comer” letras de quem digita rápido).
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

    const commitIfWedge = (e: KeyboardEvent) => {
      const raw = bufferRef.current;
      const elapsed = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
      const code = normalizeBarcodeInput(raw);
      reset();
      if (
        !code ||
        !isLikelyBarcodeWedgeKeystroke({ elapsedMs: elapsed || 1, length: code.length })
      ) {
        return false;
      }

      e.preventDefault();
      e.stopPropagation();

      if (
        isEditableTarget(e.target) &&
        (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        const el = e.target;
        const v = el.value || '';
        if (v === code || v.endsWith(code)) {
          setNativeInputValue(el, v === code ? '' : v.slice(0, Math.max(0, v.length - code.length)));
        }
      }

      onScanRef.current(code);
      return true;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.isComposing) return;
      if (e.repeat && !isTerminatorKey(e)) return;

      const focusedEditable = isEditableTarget(e.target);
      if (isLocalWedgeTarget(e.target)) {
        reset();
        return;
      }
      if (focusedEditable && !captureWhileFocused) {
        reset();
        return;
      }

      if (isTerminatorKey(e)) {
        commitIfWedge(e);
        return;
      }

      if (e.key === 'Escape') {
        reset();
        return;
      }

      const ch = charFromKeyEvent(e);
      if (ch == null) return;

      const now = Date.now();
      if (!bufferRef.current) {
        startedAtRef.current = now;
        lastKeyAtRef.current = now;
        bufferRef.current = ch;
        return;
      }

      const gap = now - lastKeyAtRef.current;
      if (gap > MAX_INTER_KEY_GAP_MS) {
        // Digitação humana / pausa: descarta buffer anterior e recomeça.
        bufferRef.current = ch;
        startedAtRef.current = now;
        lastKeyAtRef.current = now;
        return;
      }

      lastKeyAtRef.current = now;
      bufferRef.current += ch;
      // Importante: NÃO preventDefault aqui — engolir teclas quebrava digitação rápida.
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, captureWhileFocused]);
}
