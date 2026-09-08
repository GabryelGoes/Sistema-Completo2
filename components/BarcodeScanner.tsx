import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CameraOff, Flashlight, Loader2, Minus, Plus, X, ZoomIn } from 'lucide-react';
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

/** Formatos nativos do BarcodeDetector (quando o Safari/Chrome expõe a API). */
const NATIVE_DETECTOR_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
] as const;

const DUPLICATE_GUARD_MS = 2500;
const NO_READ_HINT_MS = 7000;
const MODERATE_ZOOM_FACTOR = 1.4;

export type BarcodeScannerProps = {
  isOpen: boolean;
  onDetected: (code: string) => void;
  onClose: () => void;
  title?: string;
};

type ZoomState = {
  supported: boolean;
  min: number;
  max: number;
  step: number;
  value: number;
};

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ pode se reportar como Mac.
  const iPadOs =
    navigator.platform === 'MacIntel' && typeof navigator.maxTouchPoints === 'number'
      ? navigator.maxTouchPoints > 1
      : false;
  return iOS || iPadOs;
}

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
    return 'Permissão da câmera negada. Em Ajustes → Safari (ou o PWA) → Câmera, permita o acesso e tente de novo.';
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
 * Escolhe a câmera traseira “principal” (Wide), evitando Ultra Wide quando possível.
 * No iPhone 15 Pro Max isso costuma melhorar bastante a leitura de EAN.
 */
async function pickRearCameraId(): Promise<string | null> {
  try {
    // Precisa de permissão prévia para labels preenchidos no iOS.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    });
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    // segue mesmo sem labels
  }

  try {
    const devices = await Html5Qrcode.getCameras();
    if (!devices.length) return null;

    const scored = devices.map((d) => {
      const label = (d.label || '').toLowerCase();
      let score = 0;
      if (/back|rear|traseir|environment/.test(label)) score += 20;
      if (/ultra\s*wide|ultrawide/.test(label)) score -= 40;
      if (/tele|telephoto|zoom/.test(label)) score -= 10; // telefoto dificulta EAN de perto
      if (/wide|principal|0\.5|1x|back camera/.test(label) && !/ultra/.test(label)) score += 30;
      if (!label) score += 5; // sem label: ainda pode ser a traseira pedida via facingMode
      return { id: d.id, label, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.id ?? null;
  } catch {
    return null;
  }
}

function resolutionLadder(apple: boolean): Array<{ width: number; height: number }> {
  // iPhone: começa em 1280×720 (estável no Safari); evita advanced constraints.
  if (apple) {
    return [
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
      { width: 960, height: 540 },
    ];
  }
  return [
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
    { width: 960, height: 540 },
    { width: 640, height: 480 },
  ];
}

/** Guia visual largo; a análise no iOS usa o frame quase inteiro. */
function barcodeQrBox(viewfinderWidth: number, viewfinderHeight: number, apple: boolean) {
  if (apple) {
    // Quase full-frame: no iOS o crop apertado do html5-qrcode costuma falhar em EAN.
    return {
      width: Math.max(260, Math.floor(viewfinderWidth * 0.98)),
      height: Math.max(160, Math.floor(viewfinderHeight * 0.55)),
    };
  }
  const width = Math.floor(Math.min(viewfinderWidth * 0.94, Math.max(280, viewfinderWidth * 0.92)));
  const height = Math.floor(
    Math.min(Math.max(120, viewfinderHeight * 0.34), Math.max(110, width * 0.38))
  );
  return {
    width: Math.max(240, Math.min(width, viewfinderWidth - 8)),
    height: Math.max(100, Math.min(height, viewfinderHeight - 8)),
  };
}

function buildVideoConstraints(
  res: { width: number; height: number },
  apple: boolean
): MediaTrackConstraints {
  const base: Record<string, unknown> = {
    facingMode: { ideal: 'environment' },
    width: { ideal: res.width },
    height: { ideal: res.height },
  };
  // advanced focus/exposure quebra com frequência o getUserMedia no Safari iOS.
  if (!apple) {
    base.advanced = [
      { focusMode: 'continuous' },
      { focusMode: 'auto' },
      { exposureMode: 'continuous' },
      { whiteBalanceMode: 'continuous' },
    ];
  }
  return base as MediaTrackConstraints;
}

async function applyTrackEnhancements(
  scanner: Html5Qrcode,
  apple: boolean
): Promise<{ zoom: ZoomState | null; torchSupported: boolean }> {
  if (!apple) {
    try {
      const caps = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & {
        focusMode?: string[];
        exposureMode?: string[];
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
        await scanner.applyVideoConstraints({ advanced } as MediaTrackConstraints);
      }
    } catch {
      // ignore
    }
  }

  let zoom: ZoomState | null = null;
  let torchSupported = false;
  try {
    const camCaps = scanner.getRunningTrackCameraCapabilities();
    const zoomFeature = camCaps.zoomFeature();
    if (zoomFeature.isSupported()) {
      zoom = {
        supported: true,
        min: zoomFeature.min(),
        max: zoomFeature.max(),
        step: zoomFeature.step() || 0.1,
        value: zoomFeature.value() ?? zoomFeature.min(),
      };
    }
    torchSupported = camCaps.torchFeature().isSupported();
  } catch {
    // ignore
  }

  // Fallback torch via MediaTrackCapabilities (alguns iOS).
  if (!torchSupported) {
    try {
      const caps = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & {
        torch?: boolean;
      };
      torchSupported = caps.torch === true;
    } catch {
      // ignore
    }
  }

  return { zoom, torchSupported };
}

function getNativeBarcodeDetector(): BarcodeDetectorLike | null {
  const w = window as Window & {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
  };
  if (typeof w.BarcodeDetector !== 'function') return null;
  try {
    return new w.BarcodeDetector({ formats: [...NATIVE_DETECTOR_FORMATS] });
  } catch {
    try {
      return new w.BarcodeDetector();
    } catch {
      return null;
    }
  }
}

/**
 * Scanner otimizado também para iPhone (Safari/PWA).
 * Nota: LiDAR / telefoto / 48MP fusion do Pro Max NÃO são expostos ao navegador.
 */
export function BarcodeScanner({
  isOpen,
  onDetected,
  onClose,
  title = 'Ler código de barras',
}: BarcodeScannerProps) {
  const isDesktopShell = useDesktopShellLayout();
  const apple = isAppleMobile();
  const reactId = useId().replace(/:/g, '');
  const elementId = `barcode-scanner-${reactId}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startingRef = useRef(false);
  const handledRef = useRef(false);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const onDetectedRef = useRef(onDetected);
  const nativeLoopRef = useRef<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const stopNativeLoop = useCallback(() => {
    if (nativeLoopRef.current != null) {
      window.clearTimeout(nativeLoopRef.current);
      nativeLoopRef.current = null;
    }
  }, []);

  const stopScanner = useCallback(async () => {
    stopNativeLoop();
    const scanner = scannerRef.current;
    scannerRef.current = null;
    startingRef.current = false;
    if (!scanner) return;
    try {
      const state = scanner.getState();
      if (state === 2 || state === 3) await scanner.stop();
    } catch {
      // ignore
    }
    try {
      scanner.clear();
    } catch {
      // ignore
    }
  }, [stopNativeLoop]);

  const emitCode = useCallback(
    async (raw: string) => {
      if (handledRef.current) return;
      const code = normalizeBarcodeInput(raw);
      if (!code) return;
      const now = Date.now();
      const prev = lastCodeRef.current;
      if (prev && prev.code === code && now - prev.at < DUPLICATE_GUARD_MS) return;
      lastCodeRef.current = { code, at: now };
      handledRef.current = true;
      setHint(null);
      try {
        await stopScanner();
      } finally {
        onDetectedRef.current(code);
      }
    },
    [stopScanner]
  );

  const handleClose = useCallback(() => {
    void stopScanner().finally(() => onClose());
  }, [onClose, stopScanner]);

  const applyZoomValue = useCallback(
    async (next: number) => {
      const scanner = scannerRef.current;
      const current = zoom;
      if (!scanner || !current?.supported) return;
      const clamped = Math.min(current.max, Math.max(current.min, next));
      try {
        const feature = scanner.getRunningTrackCameraCapabilities().zoomFeature();
        if (!feature.isSupported()) return;
        await feature.apply(clamped);
        setZoom({ ...current, value: clamped });
      } catch {
        // ignore
      }
    },
    [zoom]
  );

  const toggleModerateZoom = useCallback(() => {
    if (!zoom?.supported) return;
    const target = Math.min(zoom.max, Math.max(zoom.min * MODERATE_ZOOM_FACTOR, zoom.min + zoom.step));
    const nearMin = Math.abs(zoom.value - zoom.min) < Math.max(zoom.step, 0.05) * 1.5;
    void applyZoomValue(nearMin ? target : zoom.min);
  }, [applyZoomValue, zoom]);

  const toggleTorch = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    const next = !torchOn;
    try {
      const torch = scanner.getRunningTrackCameraCapabilities().torchFeature();
      if (torch.isSupported()) {
        await torch.apply(next);
        setTorchOn(next);
        return;
      }
    } catch {
      // tenta fallback
    }
    try {
      await scanner.applyVideoConstraints({
        advanced: [{ torch: next }],
      } as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      try {
        await scanner.applyVideoConstraints({ torch: next } as MediaTrackConstraints);
        setTorchOn(next);
      } catch {
        setHint('Este iPhone/Safari não permite controlar a lanterna pelo navegador.');
      }
    }
  }, [torchOn]);

  useEffect(() => {
    if (!isOpen) {
      handledRef.current = false;
      lastCodeRef.current = null;
      setError(null);
      setHint(null);
      setZoom(null);
      setTorchOn(false);
      setTorchSupported(false);
      setStarting(false);
      void stopScanner();
      return;
    }

    let cancelled = false;
    let hintTimer: ReturnType<typeof setTimeout> | null = null;
    handledRef.current = false;

    const startNativeAssist = (scanner: Html5Qrcode) => {
      const detector = getNativeBarcodeDetector();
      if (!detector) return;

      const tick = async () => {
        if (cancelled || handledRef.current) return;
        try {
          const video = document
            .getElementById(elementId)
            ?.querySelector('video') as HTMLVideoElement | null;
          if (video && video.readyState >= 2) {
            const codes = await detector.detect(video);
            const raw = codes.find((c) => c.rawValue)?.rawValue;
            if (raw) {
              await emitCode(raw);
              return;
            }
          }
        } catch {
          // frame sem código / API instável
        }
        if (!cancelled && !handledRef.current) {
          nativeLoopRef.current = window.setTimeout(() => {
            void tick();
          }, apple ? 180 : 250);
        }
      };

      nativeLoopRef.current = window.setTimeout(() => {
        void tick();
      }, 400);
    };

    const start = async () => {
      if (startingRef.current) return;
      startingRef.current = true;
      setStarting(true);
      setError(null);
      setHint(null);
      setZoom(null);
      setTorchOn(false);
      setTorchSupported(false);

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
          // No Safari, se existir BarcodeDetector, acelera; senão usa decoder da lib.
          useBarCodeDetectorIfSupported: true,
        });
        scannerRef.current = scanner;

        const onSuccess = (decodedText: string) => {
          void emitCode(decodedText);
        };

        const fps = apple ? 15 : 12;
        const ladder = resolutionLadder(apple);
        const rearId = await pickRearCameraId();
        let started = false;
        let lastErr: unknown = null;

        const cameraConfigs: Array<string | MediaTrackConstraints> = [];
        if (rearId) cameraConfigs.push(rearId);
        cameraConfigs.push({ facingMode: 'environment' });

        for (const cam of cameraConfigs) {
          if (started || cancelled) break;
          for (const res of ladder) {
            if (cancelled) break;
            try {
              await scanner.start(
                cam,
                {
                  fps,
                  qrbox: (w, h) => barcodeQrBox(w, h, apple),
                  disableFlip: false,
                  videoConstraints: buildVideoConstraints(res, apple),
                },
                onSuccess,
                () => undefined
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
        }

        if (!started && !cancelled) {
          try {
            await scanner.start(
              { facingMode: 'environment' },
              {
                fps,
                qrbox: (w, h) => barcodeQrBox(w, h, apple),
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

        if (!started) throw lastErr ?? new Error('Não foi possível iniciar a câmera.');
        if (cancelled) {
          await stopScanner();
          return;
        }

        const enh = await applyTrackEnhancements(scanner, apple);
        if (!cancelled) {
          setZoom(enh.zoom);
          setTorchSupported(enh.torchSupported);
        }

        // Assistência nativa em paralelo (quando o browser expõe BarcodeDetector).
        startNativeAssist(scanner);

        hintTimer = setTimeout(() => {
          if (!cancelled && !handledRef.current) {
            setHint(
              apple
                ? 'Ainda não li o código. No iPhone: boa luz, código na horizontal, inteiro na faixa, ~15–25 cm de distância. Evite reflexo plástico. Tente a lanterna ou o zoom moderado.'
                : 'Ainda não li o código. Mantenha-o inteiro na faixa, na horizontal, sem reflexo. Afaste/aproxime até ficar nítido.'
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
  }, [apple, elementId, emitCode, isOpen, stopScanner]);

  if (!isOpen) return null;

  const overlayClass = resolveIosModalOverlayClass(isDesktopShell, SCANNER_Z);
  const zoomNearMin =
    zoom?.supported && Math.abs(zoom.value - zoom.min) <= Math.max(zoom.step, 0.05) * 1.5;

  return (
    <RegistrationPortal>
      <div className={overlayClass} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-[1.75rem] border border-white/20 bg-zinc-950 text-white shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-bold">{title}</h2>
              <p className="text-[12px] text-zinc-400">
                EAN-13 · EAN-8 · UPC · Code 128
                {apple ? ' · iPhone (câmera Wide)' : ' · câmera traseira'}
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
              className="barcode-scanner-viewport mx-auto min-h-[320px] w-full overflow-hidden rounded-2xl bg-zinc-900"
            />

            {/* Guia visual horizontal (não corta o decoder — só orientação). */}
            {!starting && !error ? (
              <div className="pointer-events-none absolute inset-x-3 inset-y-3 flex items-center justify-center">
                <div className="relative h-[42%] w-[94%] rounded-xl border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]">
                  <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-300/90" />
                </div>
              </div>
            ) : null}

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
                <li>• Código na horizontal, inteiro dentro da faixa verde.</li>
                <li>• Distância típica no iPhone: cerca de 15–25 cm.</li>
                <li>• Evite reflexo (plástico/vidro) e sombra forte.</li>
                {apple ? (
                  <li>• LiDAR/telefoto do Pro Max não entram pelo navegador — usamos a câmera Wide.</li>
                ) : null}
              </ul>

              <div className="flex flex-wrap gap-2">
                {torchSupported ? (
                  <button
                    type="button"
                    onClick={() => void toggleTorch()}
                    className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold ${
                      torchOn ? 'bg-amber-400/25 text-amber-100' : 'bg-white/10 hover:bg-white/15'
                    }`}
                  >
                    <Flashlight className="h-4 w-4" />
                    {torchOn ? 'Lanterna ligada' : 'Lanterna'}
                  </button>
                ) : null}

                {zoom?.supported ? (
                  <div className="flex min-w-[12rem] flex-1 items-center gap-2">
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
              </div>

              {hint ? (
                <p className="rounded-xl border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-[13px] text-amber-100">
                  {hint}
                </p>
              ) : (
                <p className="text-center text-[12px] text-zinc-500">
                  Leitura automática em tempo real — sem tirar foto.
                </p>
              )}
            </div>
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
