import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, Loader2, Search, X } from 'lucide-react';
import { normalizeBarcodeInput } from '../utils/workshopPartBarcode';

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  const w = window as Window & { BarcodeDetector?: BarcodeDetectorCtor };
  return typeof w.BarcodeDetector === 'function' ? w.BarcodeDetector : null;
}

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
 * Campo de código: digitação, pistola USB (wedge + Enter) e câmera (BarcodeDetector).
 */
export function BarcodeScanField({
  value,
  onChange,
  onSubmitCode,
  disabled,
  placeholder = 'Código de barras, original ou numérico',
  autoFocus,
  className = '',
}: BarcodeScanFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDetectRef = useRef(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
    setCameraBusy(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

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

  const startCamera = useCallback(async () => {
    setCameraError(null);
    const Detector = getBarcodeDetectorCtor();
    if (!Detector) {
      setCameraError(
        'Este navegador não lê código pela câmera. Use a pistola USB ou digite o código.'
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Câmera indisponível neste dispositivo.');
      return;
    }
    setCameraBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setCameraOpen(true);
      await new Promise((r) => setTimeout(r, 50));
      const video = videoRef.current;
      if (!video) throw new Error('Pré-visualização indisponível.');
      video.srcObject = stream;
      await video.play();

      const detector = new Detector({
        formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf'],
      });

      const tick = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          rafRef.current = requestAnimationFrame(() => {
            void tick();
          });
          return;
        }
        const now = Date.now();
        if (now - lastDetectRef.current > 350) {
          lastDetectRef.current = now;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes.find((c) => c.rawValue)?.rawValue;
            if (raw) {
              stopCamera();
              onChange(raw);
              await submit(raw);
              return;
            }
          } catch {
            // ignore frame errors
          }
        }
        rafRef.current = requestAnimationFrame(() => {
          void tick();
        });
      };
      rafRef.current = requestAnimationFrame(() => {
        void tick();
      });
    } catch (e) {
      stopCamera();
      setCameraError(e instanceof Error ? e.message : 'Não foi possível abrir a câmera.');
    } finally {
      setCameraBusy(false);
    }
  }, [onChange, stopCamera, submit]);

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
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
            aria-label="Código do produto"
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
          disabled={disabled || cameraBusy}
          onClick={() => (cameraOpen ? stopCamera() : void startCamera())}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-white px-3 py-3 text-[14px] font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 disabled:opacity-50"
          title="Ler com a câmera"
        >
          {cameraBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          <span className="hidden sm:inline">Câmera</span>
        </button>
      </div>

      {cameraError ? (
        <p className="text-[13px] text-amber-800 dark:text-amber-200">{cameraError}</p>
      ) : null}

      {cameraOpen ? (
        <div className="relative overflow-hidden rounded-2xl border border-zinc-300 bg-black dark:border-white/15">
          <video ref={videoRef} className="max-h-56 w-full object-cover" muted playsInline />
          <button
            type="button"
            onClick={stopCamera}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white"
            aria-label="Fechar câmera"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="absolute bottom-0 left-0 right-0 bg-black/55 px-3 py-2 text-center text-[12px] text-white">
            Aponte para o código de barras
          </p>
        </div>
      ) : null}
    </div>
  );
}
