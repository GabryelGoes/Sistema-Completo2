import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CameraOff, Loader2, X } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { normalizeBarcodeInput } from '../utils/workshopPartBarcode';
import { RegistrationPortal } from './ui/RegistrationPortal';
import { resolveIosModalOverlayClass } from './ui/iosModalStyles';
import { useDesktopShellLayout } from './ui/DesktopShellContext';

const SCANNER_Z = 'z-[145]';

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
];

export type BarcodeScannerProps = {
  isOpen: boolean;
  onDetected: (code: string) => void;
  onClose: () => void;
  /** Título exibido no topo do scanner. */
  title?: string;
};

function mapCameraError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : 'Não foi possível abrir a câmera.';
  const m = raw.toLowerCase();
  if (
    m.includes('notallowed') ||
    m.includes('permission') ||
    m.includes('denied') ||
    m.includes('not allowed')
  ) {
    return 'Permissão da câmera negada. Ative o acesso à câmera nas configurações do navegador ou do PWA e tente de novo.';
  }
  if (m.includes('notfound') || m.includes('requested device not found') || m.includes('no camera')) {
    return 'Nenhuma câmera encontrada neste dispositivo.';
  }
  if (m.includes('notreadable') || m.includes('trackstart') || m.includes('in use')) {
    return 'A câmera está em uso por outro aplicativo. Feche-o e tente novamente.';
  }
  if (m.includes('secure') || m.includes('https')) {
    return 'A câmera exige conexão segura (HTTPS) ou localhost.';
  }
  return raw;
}

/**
 * Leitura em tempo real de código de barras via html5-qrcode (PWA / navegador).
 * Não depende exclusivamente de BarcodeDetector.
 */
export function BarcodeScanner({
  isOpen,
  onDetected,
  onClose,
  title = 'Ler código de barras',
}: BarcodeScannerProps) {
  const isDesktopShell = useDesktopShellLayout();
  const reactId = useId().replace(/:/g, '');
  const elementId = `barcode-scanner-${reactId}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startingRef = useRef(false);
  const handledRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    startingRef.current = false;
    if (!scanner) return;
    try {
      const state = scanner.getState();
      // 2 = SCANNING, 3 = PAUSED (Html5QrcodeScannerState)
      if (state === 2 || state === 3) {
        await scanner.stop();
      }
    } catch {
      // ignore stop races
    }
    try {
      scanner.clear();
    } catch {
      // ignore
    }
  }, []);

  const handleClose = useCallback(() => {
    void stopScanner().finally(() => onClose());
  }, [onClose, stopScanner]);

  useEffect(() => {
    if (!isOpen) {
      handledRef.current = false;
      setError(null);
      setStarting(false);
      void stopScanner();
      return;
    }

    let cancelled = false;
    handledRef.current = false;

    const start = async () => {
      if (startingRef.current) return;
      startingRef.current = true;
      setStarting(true);
      setError(null);

      // Garante que o container já está no DOM.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      if (cancelled) return;

      const el = document.getElementById(elementId);
      if (!el) {
        setError('Área do scanner indisponível.');
        setStarting(false);
        startingRef.current = false;
        return;
      }

      try {
        await stopScanner();
        const scanner = new Html5Qrcode(elementId, {
          verbose: false,
          formatsToSupport: BARCODE_FORMATS,
          // Preferimos o decoder próprio da lib para consistência entre navegadores.
          useBarCodeDetectorIfSupported: false,
        });
        scannerRef.current = scanner;

        const onSuccess = async (decodedText: string) => {
          if (handledRef.current || cancelled) return;
          const code = normalizeBarcodeInput(decodedText);
          if (!code) return;
          handledRef.current = true;
          try {
            await stopScanner();
          } finally {
            onDetectedRef.current(code);
          }
        };

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const w = Math.floor(Math.min(viewfinderWidth * 0.86, 360));
              const h = Math.floor(Math.min(viewfinderHeight * 0.28, 140));
              return { width: Math.max(180, w), height: Math.max(80, h) };
            },
            aspectRatio: 1.777,
            disableFlip: false,
            videoConstraints: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          onSuccess,
          () => {
            // Erros de frame (sem código) — ignorar.
          }
        );
      } catch (err) {
        if (!cancelled) {
          setError(mapCameraError(err));
          await stopScanner();
        }
      } finally {
        if (!cancelled) setStarting(false);
        startingRef.current = false;
      }
    };

    void start();

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [elementId, isOpen, stopScanner]);

  if (!isOpen) return null;

  const overlayClass = resolveIosModalOverlayClass(isDesktopShell, SCANNER_Z);

  return (
    <RegistrationPortal>
      <div className={overlayClass} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-[1.75rem] border border-white/20 bg-zinc-950 text-white shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-bold">{title}</h2>
              <p className="text-[12px] text-zinc-400">
                EAN-13 · EAN-8 · UPC · Code 128 · câmera traseira
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl bg-white/10 p-2 hover:bg-white/15"
              aria-label="Fechar scanner"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative bg-black px-3 pb-3 pt-3">
            <div
              id={elementId}
              className="barcode-scanner-viewport mx-auto min-h-[260px] w-full overflow-hidden rounded-2xl bg-zinc-900"
            />

            {starting && !error ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-sm">
                <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
                Abrindo câmera…
              </div>
            ) : null}

            {error ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
                <CameraOff className="h-8 w-8 text-amber-300" />
                <p className="text-[14px] text-amber-100">{error}</p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl bg-white/15 px-4 py-2 text-[14px] font-semibold hover:bg-white/25"
                >
                  Fechar
                </button>
              </div>
            ) : null}
          </div>

          {!error ? (
            <p className="px-4 pb-4 text-center text-[13px] text-zinc-400">
              Posicione o código de barras dentro da área destacada. A leitura é automática.
            </p>
          ) : null}

          <div className="border-t border-white/10 px-4 py-3">
            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-[15px] font-semibold text-white hover:bg-white/10"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .barcode-scanner-viewport video {
          width: 100% !important;
          border-radius: 1rem;
          object-fit: cover;
        }
        .barcode-scanner-viewport img {
          display: none !important;
        }
      `}</style>
    </RegistrationPortal>
  );
}
