import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CameraOff, Loader2, Minus, Plus, X, ZoomIn } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { normalizeBarcodeInput } from '../utils/workshopPartBarcode';
import { RegistrationPortal } from './ui/RegistrationPortal';
import { resolveIosModalOverlayClass } from './ui/iosModalStyles';
import { useDesktopShellLayout } from './ui/DesktopShellContext';

const SCANNER_Z = 'z-[145]';

/** Formatos de código de barras 1D + QR (módulos ABS). */
const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.QR_CODE,
];

/** Resolução ideal → fallbacks para aparelhos mais simples. */
const RESOLUTION_LADDER: Array<{ width: number; height: number }> = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 960, height: 540 },
  { width: 640, height: 480 },
];

const SCAN_FPS = 12;
const NO_READ_HINT_MS = 8000;
const DUPLICATE_GUARD_MS = 2500;
/** Zoom moderado relativo (não excessivo). */
const MODERATE_ZOOM_FACTOR = 1.35;

export type BarcodeScannerProps = {
  isOpen: boolean;
  onDetected: (code: string) => void;
  onClose: () => void;
  /** Título exibido no topo do scanner. */
  title?: string;
};

type ZoomState = {
  supported: boolean;
  min: number;
  max: number;
  step: number;
  value: number;
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

/** Área larga o bastante para EAN e com altura útil para QR Code. */
function barcodeQrBox(viewfinderWidth: number, viewfinderHeight: number) {
  const width = Math.floor(Math.min(viewfinderWidth * 0.94, Math.max(280, viewfinderWidth * 0.92)));
  // Mais alto que o box 1D puro, para encaixar QR sem prejudicar barras horizontais.
  const height = Math.floor(
    Math.min(Math.max(160, viewfinderHeight * 0.42), Math.max(140, width * 0.55))
  );
  return {
    width: Math.max(240, Math.min(width, viewfinderWidth - 8)),
    height: Math.max(130, Math.min(height, viewfinderHeight - 8)),
  };
}

function buildVideoConstraints(res: { width: number; height: number }): MediaTrackConstraints {
  // focus/exposure via advanced — aceitos em vários mobiles; ignorados se não suportados.
  const constraints: Record<string, unknown> = {
    facingMode: { ideal: 'environment' },
    width: { ideal: res.width },
    height: { ideal: res.height },
    advanced: [
      { focusMode: 'continuous' },
      { focusMode: 'auto' },
      { exposureMode: 'continuous' },
      { whiteBalanceMode: 'continuous' },
    ],
  };
  return constraints as MediaTrackConstraints;
}

async function applyTrackEnhancements(scanner: Html5Qrcode): Promise<ZoomState | null> {
  try {
    const caps = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & {
      focusMode?: string[];
      exposureMode?: string[];
      torch?: boolean;
    };
    const advanced: Record<string, unknown>[] = [];
    if (Array.isArray(caps.focusMode)) {
      if (caps.focusMode.includes('continuous')) advanced.push({ focusMode: 'continuous' });
      else if (caps.focusMode.includes('auto')) advanced.push({ focusMode: 'auto' });
    }
    if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) {
      advanced.push({ exposureMode: 'continuous' });
    }
    if (advanced.length > 0) {
      await scanner.applyVideoConstraints({
        advanced,
      } as MediaTrackConstraints);
    }
  } catch {
    // Nem todos os browsers aceitam advanced constraints.
  }

  try {
    const camCaps = scanner.getRunningTrackCameraCapabilities();
    const zoom = camCaps.zoomFeature();
    if (!zoom.isSupported()) return null;
    const min = zoom.min();
    const max = zoom.max();
    const step = zoom.step() || 0.1;
    const current = zoom.value() ?? min;
    return { supported: true, min, max, step, value: current };
  } catch {
    return null;
  }
}

/**
 * Leitura em tempo real de código de barras via html5-qrcode (PWA / navegador).
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
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const onDetectedRef = useRef(onDetected);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ZoomState | null>(null);

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
      // 2 = SCANNING, 3 = PAUSED
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

  const applyZoomValue = useCallback(async (next: number) => {
    const scanner = scannerRef.current;
    const current = zoom;
    if (!scanner || !current?.supported) return;
    const clamped = Math.min(current.max, Math.max(current.min, next));
    try {
      const camCaps = scanner.getRunningTrackCameraCapabilities();
      const feature = camCaps.zoomFeature();
      if (!feature.isSupported()) return;
      await feature.apply(clamped);
      setZoom({ ...current, value: clamped });
    } catch {
      // ignore unsupported apply
    }
  }, [zoom]);

  const toggleModerateZoom = useCallback(() => {
    if (!zoom?.supported) return;
    const target = Math.min(zoom.max, zoom.min * MODERATE_ZOOM_FACTOR);
    const nearMin = Math.abs(zoom.value - zoom.min) < zoom.step * 1.5;
    void applyZoomValue(nearMin ? target : zoom.min);
  }, [applyZoomValue, zoom]);

  useEffect(() => {
    if (!isOpen) {
      handledRef.current = false;
      lastCodeRef.current = null;
      setError(null);
      setHint(null);
      setZoom(null);
      setStarting(false);
      void stopScanner();
      return;
    }

    let cancelled = false;
    let hintTimer: ReturnType<typeof setTimeout> | null = null;
    handledRef.current = false;

    const start = async () => {
      if (startingRef.current) return;
      startingRef.current = true;
      setStarting(true);
      setError(null);
      setHint(null);
      setZoom(null);

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
          // Usa BarcodeDetector só como aceleração quando existir; senão cai no decoder da lib.
          useBarCodeDetectorIfSupported: true,
        });
        scannerRef.current = scanner;

        const onSuccess = async (decodedText: string) => {
          if (handledRef.current || cancelled) return;
          const code = normalizeBarcodeInput(decodedText);
          if (!code) return;

          const now = Date.now();
          const prev = lastCodeRef.current;
          if (prev && prev.code === code && now - prev.at < DUPLICATE_GUARD_MS) {
            return;
          }
          lastCodeRef.current = { code, at: now };
          handledRef.current = true;
          setHint(null);
          try {
            await stopScanner();
          } finally {
            onDetectedRef.current(code);
          }
        };

        let started = false;
        let lastErr: unknown = null;

        // Preferência: câmera traseira + resolução alta, com fallback automático.
        for (const res of RESOLUTION_LADDER) {
          if (cancelled) return;
          try {
            await scanner.start(
              { facingMode: 'environment' },
              {
                fps: SCAN_FPS,
                qrbox: barcodeQrBox,
                // Sem aspectRatio fixo: em PWA portrait isso costuma cortar demais o sensor.
                disableFlip: false,
                videoConstraints: buildVideoConstraints(res),
              },
              onSuccess,
              () => {
                // Frame sem código — normal.
              }
            );
            started = true;
            break;
          } catch (err) {
            lastErr = err;
            try {
              const state = scanner.getState();
              if (state === 2 || state === 3) await scanner.stop();
            } catch {
              // ignore
            }
          }
        }

        // Último recurso: facingMode simples, sem resolução forçada.
        if (!started && !cancelled) {
          try {
            await scanner.start(
              { facingMode: 'environment' },
              {
                fps: SCAN_FPS,
                qrbox: barcodeQrBox,
                disableFlip: false,
              },
              onSuccess,
              () => undefined
            );
            started = true;
          } catch (err) {
            lastErr = err;
          }
        }

        if (!started) {
          throw lastErr ?? new Error('Não foi possível iniciar a câmera.');
        }

        if (cancelled) {
          await stopScanner();
          return;
        }

        const zoomState = await applyTrackEnhancements(scanner);
        if (!cancelled) setZoom(zoomState);

        hintTimer = setTimeout(() => {
          if (!cancelled && !handledRef.current) {
            setHint(
              'Ainda não li o código. Mantenha-o inteiro na faixa, na horizontal, sem reflexo. Afaste ou aproxime até ficar nítido — ou use o zoom moderado.'
            );
          }
        }, NO_READ_HINT_MS);
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
      if (hintTimer) clearTimeout(hintTimer);
      void stopScanner();
    };
  }, [elementId, isOpen, stopScanner]);

  if (!isOpen) return null;

  const overlayClass = resolveIosModalOverlayClass(isDesktopShell, SCANNER_Z);
  const zoomNearMin =
    zoom?.supported && Math.abs(zoom.value - zoom.min) <= Math.max(zoom.step, 0.05) * 1.5;

  return (
    <RegistrationPortal>
      <div className={overlayClass} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-[1.75rem] border-0 bg-zinc-950 text-white shadow-none">
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
              className="barcode-scanner-viewport mx-auto min-h-[300px] w-full overflow-hidden rounded-2xl bg-zinc-900"
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
            <div className="space-y-3 px-4 pb-3">
              <ul className="space-y-1 text-[12px] leading-snug text-zinc-400">
                <li>• Enquadre o código inteiro na faixa destacada (na horizontal).</li>
                <li>• Evite reflexos e sombra forte sobre as barras.</li>
                <li>• Afaste ou aproxime o celular até o código ficar nítido.</li>
              </ul>

              {zoom?.supported ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void applyZoomValue(zoom.value - Math.max(zoom.step, 0.1))}
                    className="rounded-xl bg-white/10 p-2 hover:bg-white/15 disabled:opacity-40"
                    aria-label="Diminuir zoom"
                    disabled={zoom.value <= zoom.min}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleModerateZoom}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-[13px] font-semibold hover:bg-white/15"
                  >
                    <ZoomIn className="h-4 w-4" />
                    {zoomNearMin ? 'Zoom moderado' : 'Zoom normal'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void applyZoomValue(zoom.value + Math.max(zoom.step, 0.1))}
                    className="rounded-xl bg-white/10 p-2 hover:bg-white/15 disabled:opacity-40"
                    aria-label="Aumentar zoom"
                    disabled={zoom.value >= zoom.max}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ) : null}

              {hint ? (
                <p className="rounded-xl border-0 bg-amber-500/15 px-3 py-2 text-[13px] text-amber-100 shadow-none">
                  {hint}
                </p>
              ) : (
                <p className="text-center text-[12px] text-zinc-500">
                  A leitura é automática em tempo real — sem precisar tirar foto.
                </p>
              )}
            </div>
          ) : null}

          <div className="border-t border-white/10 px-4 py-3">
            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-2xl border-0 bg-white/10 px-4 py-3 text-[15px] font-semibold text-white shadow-none hover:bg-white/15"
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
