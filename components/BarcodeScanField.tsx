import React, { useCallback, useRef, useState } from 'react';
import { Camera, Keyboard, Loader2, Search } from 'lucide-react';
import { normalizeBarcodeInput } from '../utils/workshopPartBarcode';
import { BarcodeScanner } from './BarcodeScanner';

export type BarcodeScanFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmitCode: (code: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
};

/**
 * Campo de código: digitação, pistola USB (Enter) e câmera em tempo real (html5-qrcode).
 */
export function BarcodeScanField({
  value,
  onChange,
  onSubmitCode,
  disabled,
  placeholder = 'Código de barras, ABS-000001 ou nome',
  autoFocus,
  className = '',
}: BarcodeScanFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async (raw: string) => {
      const code = normalizeBarcodeInput(raw);
      if (!code || disabled || submitting) return;
      setSubmitting(true);
      try {
        await onSubmitCode(code);
        onChange('');
      } finally {
        setSubmitting(false);
        inputRef.current?.focus();
      }
    },
    [disabled, onChange, onSubmitCode, submitting]
  );

  const handleDetected = useCallback(
    (code: string) => {
      setScannerOpen(false);
      onChange(code);
      void submit(code);
    },
    [onChange, submit]
  );

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoFocus={autoFocus}
            disabled={disabled || submitting}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit(value);
              }
            }}
            placeholder={placeholder}
            className="w-full rounded-2xl border border-zinc-300 bg-white py-3 pl-10 pr-3 text-[15px] text-zinc-900 outline-none ring-emerald-500/30 focus:ring-2 dark:border-white/15 dark:bg-white/5 dark:text-white"
            aria-label="Código do produto ou módulo ABS"
          />
        </div>
        <button
          type="button"
          disabled={disabled || submitting || !normalizeBarcodeInput(value)}
          onClick={() => void submit(value)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-[14px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </button>
        <button
          type="button"
          disabled={disabled || submitting}
          onClick={() => setScannerOpen(true)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-white px-3 py-3 text-[14px] font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 disabled:opacity-50"
          title="Ler com a câmera"
        >
          <Camera className="h-4 w-4" />
          <span className="hidden sm:inline">Câmera</span>
        </button>
      </div>

      <BarcodeScanner
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleDetected}
      />
    </div>
  );
}
