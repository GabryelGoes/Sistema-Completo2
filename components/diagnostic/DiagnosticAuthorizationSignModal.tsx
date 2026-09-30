import React, { useCallback, useEffect, useRef, useState } from "react";
import { PenLine, X, Eraser, Check, Upload, MousePointer2 } from "lucide-react";
import { useTabletPhonePortraitFullscreen } from "../../hooks/useTabletPhonePortraitFullscreen";
import { useDeviceTypeOptional } from "../ui/DeviceTypeContext";
import { ModalPortal } from "../ui/ModalPortal";
import {
  DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL,
  DIAGNOSTIC_AUTHORIZATION_TITLE,
} from "../../utils/diagnosticAuthorizationTerm";
import { DiagnosticAuthorizationTermBody } from "./DiagnosticAuthorizationTermBody";

export interface DiagnosticAuthorizationSignModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (blob: Blob, meta: { signaturePreviewDataUrl: string }) => void;
}

type SignMode = "draw" | "upload";

function setupCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2.5, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const w = Math.max(360, Math.floor(rect.width || 360));
  const h = Math.max(200, Math.floor(rect.height || 220));
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  applyStrokeStyle(ctx);
  return { ctx, cssW: w, cssH: h };
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "rgba(15,23,42,0.92)";
  ctx.fillStyle = "rgba(15,23,42,0.92)";
  ctx.lineWidth = 2.35;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

/** Converte imagem (foto/scan da assinatura) em PNG branco + tinta escura, encaixada no pad. */
async function rasterizeSignatureImage(file: File): Promise<{ blob: Blob; dataUrl: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Falha ao ler a imagem."));
    };
    reader.onerror = () => reject(new Error("Falha ao ler a imagem."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Imagem inválida."));
    el.src = dataUrl;
  });

  const maxW = 1200;
  const maxH = 480;
  const scale = Math.min(1, maxW / Math.max(img.naturalWidth || 1, 1), maxH / Math.max(img.naturalHeight || 1, 1));
  const w = Math.max(320, Math.round((img.naturalWidth || 320) * scale));
  const h = Math.max(160, Math.round((img.naturalHeight || 160) * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Não foi possível gerar a assinatura."))),
      "image/png",
      0.92
    );
  });
  const outUrl = canvas.toDataURL("image/png", 0.92);
  return { blob, dataUrl: outUrl };
}

export const DiagnosticAuthorizationSignModal: React.FC<DiagnosticAuthorizationSignModalProps> = ({
  open,
  onClose,
  onConfirm,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const hasInkRef = useRef(false);
  const fullScreenPortrait = useTabletPhonePortraitFullscreen();
  const { isDesktop } = useDeviceTypeOptional();

  const [signMode, setSignMode] = useState<SignMode>("draw");
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [uploadBlob, setUploadBlob] = useState<Blob | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const redrawBase = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setupCanvas(canvas);
    hasInkRef.current = false;
  }, []);

  useEffect(() => {
    if (!open) {
      setSignMode("draw");
      setUploadPreviewUrl(null);
      setUploadBlob(null);
      setUploadBusy(false);
      setUploadError(null);
      hasInkRef.current = false;
      return;
    }
    const t = window.setTimeout(() => redrawBase(), 50);
    return () => window.clearTimeout(t);
  }, [open, redrawBase]);

  useEffect(() => {
    if (!open || signMode !== "draw") return;
    const t = window.setTimeout(() => redrawBase(), 40);
    return () => window.clearTimeout(t);
  }, [open, signMode, redrawBase]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      if (signMode === "draw") redrawBase();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, redrawBase, signMode]);

  useEffect(() => {
    if (!open || signMode !== "draw") return;
    const t = window.setTimeout(() => redrawBase(), 80);
    return () => window.clearTimeout(t);
  }, [open, fullScreenPortrait, redrawBase, signMode]);

  const clientToLocal = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Mouse, caneta e toque — Pointer Events cobrem o PC.
    e.preventDefault();
    e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    applyStrokeStyle(ctx);
    const p = clientToLocal(e);
    lastRef.current = p;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    ctx.stroke();
    hasInkRef.current = true;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    applyStrokeStyle(ctx);
    const p = clientToLocal(e);
    const last = lastRef.current;
    if (last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      hasInkRef.current = true;
    }
    lastRef.current = p;
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas && e.pointerId != null) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    drawingRef.current = false;
    lastRef.current = null;
  };

  const handleClear = () => {
    if (signMode === "upload") {
      setUploadPreviewUrl(null);
      setUploadBlob(null);
      setUploadError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    redrawBase();
  };

  const handleFilePicked = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Selecione uma imagem (JPG, PNG, etc.).");
      return;
    }
    setUploadBusy(true);
    setUploadError(null);
    try {
      const { blob, dataUrl } = await rasterizeSignatureImage(file);
      setUploadBlob(blob);
      setUploadPreviewUrl(dataUrl);
    } catch (err) {
      setUploadBlob(null);
      setUploadPreviewUrl(null);
      setUploadError(err instanceof Error ? err.message : "Não foi possível usar esta imagem.");
    } finally {
      setUploadBusy(false);
    }
  };

  const handleConfirm = () => {
    if (signMode === "upload") {
      if (!uploadBlob || !uploadPreviewUrl) {
        window.alert("Anexe uma imagem da assinatura do cliente antes de confirmar.");
        return;
      }
      onConfirm(uploadBlob, { signaturePreviewDataUrl: uploadPreviewUrl });
      onClose();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || !hasInkRef.current) {
      window.alert(
        isDesktop
          ? "Desenhe a assinatura com o mouse (ou trackpad) na área indicada antes de confirmar."
          : "Desenhe sua assinatura na área indicada antes de confirmar."
      );
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          window.alert("Não foi possível gerar a imagem da assinatura. Tente novamente.");
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          const url = typeof reader.result === "string" ? reader.result : null;
          if (!url) {
            window.alert("Não foi possível preparar a visualização da assinatura.");
            return;
          }
          onConfirm(blob, { signaturePreviewDataUrl: url });
          onClose();
        };
        reader.readAsDataURL(blob);
      },
      "image/png",
      0.92
    );
  };

  if (!open) return null;

  const hintDraw = isDesktop
    ? "Leia o termo e assine com o mouse ou trackpad na área branca."
    : "Leia o texto abaixo e assine com o dedo ou caneta.";

  return (
    <ModalPortal>
      <div
        className={
          fullScreenPortrait
            ? "fixed inset-0 z-[240] flex items-stretch justify-stretch bg-black/80 backdrop-blur-md pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
            : "fixed inset-0 z-[240] flex items-end justify-center bg-black/55 p-0 pt-10 backdrop-blur-md sm:items-center sm:p-6 sm:pt-[max(1rem,env(safe-area-inset-top))] sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="diag-auth-modal-title"
      >
        <div
          className={
            fullScreenPortrait
              ? "flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden border-0 bg-zinc-200 shadow-none dark:bg-zinc-950"
              : "flex max-h-[min(92dvh,920px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-zinc-200/90 bg-zinc-200 shadow-[0_-12px_48px_-16px_rgba(0,0,0,0.35)] dark:border-white/[0.1] dark:bg-zinc-950 sm:max-h-[min(90vh,940px)] sm:max-w-xl sm:rounded-[28px] sm:shadow-2xl"
          }
          onClick={(ev) => ev.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-300/70 bg-zinc-200 px-5 py-4 dark:border-white/[0.08] dark:bg-zinc-950">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#007AFF]/25 bg-[#007AFF]/[0.1] dark:border-[#007AFF]/35 dark:bg-[#007AFF]/15">
                <PenLine className="h-5 w-5 text-[#007AFF] dark:text-[#93c5fd]" strokeWidth={2.25} aria-hidden />
              </div>
              <div className="min-w-0">
                <h2
                  id="diag-auth-modal-title"
                  className="text-[16px] font-bold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[17px]"
                >
                  {DIAGNOSTIC_AUTHORIZATION_TITLE}
                </h2>
                <p className="mt-0.5 text-[13px] font-medium text-zinc-600 dark:text-zinc-400 sm:text-[14px]">
                  {signMode === "upload"
                    ? "Anexe a foto ou o scan da assinatura do cliente."
                    : hintDraw}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-300/60 text-zinc-700 transition-colors hover:bg-zinc-300 dark:bg-white/[0.08] dark:text-zinc-300 dark:hover:bg-white/[0.12]"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div
            className={
              fullScreenPortrait
                ? "min-h-0 flex-1 overflow-y-auto overscroll-contain bg-zinc-200 px-4 py-3 [-webkit-overflow-scrolling:touch] dark:bg-zinc-950"
                : "min-h-0 flex-1 overflow-y-auto overscroll-contain bg-zinc-200 px-5 py-4 [-webkit-overflow-scrolling:touch] dark:bg-zinc-950"
            }
          >
            <DiagnosticAuthorizationTermBody
              className="rounded-2xl border border-zinc-200/80 bg-zinc-50/90 p-4 text-[16px] leading-relaxed text-zinc-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-white/[0.08] dark:bg-zinc-900/40 dark:text-zinc-100 sm:p-5 sm:text-[17px] sm:leading-relaxed"
              paragraphClassName="[&:not(:first-child)]:mt-3"
              calloutClassName="font-extrabold uppercase tracking-wide text-zinc-950 dark:text-white"
            />

            <div className="mt-5 flex gap-2 rounded-2xl border border-zinc-300/80 bg-zinc-100/80 p-1 dark:border-white/[0.1] dark:bg-white/[0.04]">
              <button
                type="button"
                onClick={() => setSignMode("draw")}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                  signMode === "draw"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {isDesktop ? (
                  <MousePointer2 className="h-4 w-4 shrink-0" aria-hidden />
                ) : (
                  <PenLine className="h-4 w-4 shrink-0" aria-hidden />
                )}
                {isDesktop ? "Assinar com mouse" : "Desenhar"}
              </button>
              <button
                type="button"
                onClick={() => setSignMode("upload")}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                  signMode === "upload"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                <Upload className="h-4 w-4 shrink-0" aria-hidden />
                Anexar imagem
              </button>
            </div>

            <p className="mt-4 text-[13px] font-bold uppercase tracking-[0.14em] text-zinc-700 dark:text-zinc-300 sm:text-[14px]">
              {DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL}
            </p>

            {signMode === "draw" ? (
              <div className="mt-2 overflow-hidden rounded-2xl border-2 border-dashed border-zinc-300/95 bg-white p-2 dark:border-white/[0.14] dark:bg-zinc-900/40">
                {isDesktop ? (
                  <p className="mb-2 px-1 text-center text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                    Clique e arraste o mouse nesta área para assinar
                  </p>
                ) : null}
                <canvas
                  ref={canvasRef}
                  className={`touch-none block w-full select-none rounded-xl bg-white ${
                    isDesktop
                      ? "min-h-[240px] h-[min(320px,42vh)] cursor-crosshair"
                      : "min-h-[200px] h-[min(280px,44vh)] cursor-crosshair"
                  }`}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endStroke}
                  onPointerCancel={endStroke}
                  onPointerLeave={(e) => {
                    if (drawingRef.current) endStroke(e);
                  }}
                />
              </div>
            ) : (
              <div className="mt-2 space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    void handleFilePicked(file);
                  }}
                />
                <button
                  type="button"
                  disabled={uploadBusy}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300/95 bg-white px-4 py-8 text-center transition-colors hover:border-[#007AFF]/45 hover:bg-zinc-50 disabled:opacity-60 dark:border-white/[0.14] dark:bg-zinc-900/40 dark:hover:bg-zinc-900/70"
                >
                  <Upload className="h-6 w-6 text-[#007AFF]" aria-hidden />
                  <span className="text-[14px] font-semibold text-zinc-800 dark:text-zinc-100">
                    {uploadBusy ? "Preparando imagem…" : "Escolher foto ou scan da assinatura"}
                  </span>
                  <span className="max-w-sm text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                    Ideal no computador: fotografe o termo assinado no papel ou use um scan da assinatura.
                  </span>
                </button>
                {uploadError ? (
                  <p className="text-[13px] font-medium text-red-600 dark:text-red-400">{uploadError}</p>
                ) : null}
                {uploadPreviewUrl ? (
                  <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3 dark:border-white/[0.1] dark:bg-zinc-900/50">
                    <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Pré-visualização
                    </p>
                    <img
                      src={uploadPreviewUrl}
                      alt="Pré-visualização da assinatura"
                      className="mx-auto max-h-48 w-auto max-w-full object-contain"
                    />
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div
            className={
              fullScreenPortrait
                ? "flex shrink-0 flex-row items-stretch gap-2 border-t border-zinc-300/70 bg-zinc-200 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-white/[0.08] dark:bg-zinc-950"
                : "flex shrink-0 flex-col gap-2 border-t border-zinc-300/70 bg-zinc-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-white/[0.08] dark:bg-zinc-950 sm:flex-row sm:justify-end"
            }
          >
            <button
              type="button"
              onClick={handleClear}
              className={
                fullScreenPortrait
                  ? "inline-flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-1 rounded-2xl border border-zinc-300/90 bg-zinc-50 px-2 text-[12px] font-semibold leading-tight text-zinc-800 transition-colors hover:bg-zinc-100 active:scale-[0.99] dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-zinc-100 dark:hover:bg-white/[0.1]"
                  : "inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-zinc-300/90 bg-zinc-50 px-4 text-[14px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 active:scale-[0.99] dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-zinc-100 dark:hover:bg-white/[0.1] sm:order-1 sm:h-11"
              }
            >
              <Eraser className="h-4 w-4 shrink-0" aria-hidden />
              Limpar
            </button>
            <button
              type="button"
              onClick={onClose}
              className={
                fullScreenPortrait
                  ? "inline-flex min-h-[48px] min-w-0 flex-1 items-center justify-center rounded-2xl border border-zinc-300/90 px-2 text-[12px] font-semibold leading-tight text-zinc-700 transition-colors hover:bg-zinc-100/80 active:scale-[0.99] dark:border-white/[0.12] dark:text-zinc-300 dark:hover:bg-white/[0.06]"
                  : "inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-300/90 px-4 text-[14px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 active:scale-[0.99] dark:border-white/[0.12] dark:text-zinc-300 dark:hover:bg-white/[0.06] sm:order-2 sm:h-11"
              }
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={uploadBusy}
              className={
                fullScreenPortrait
                  ? "inline-flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-1 rounded-2xl bg-[#007AFF] px-2 text-[12px] font-semibold leading-tight text-white shadow-lg shadow-blue-500/25 transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-50"
                  : "inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#007AFF] px-5 text-[14px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-50 sm:order-3 sm:h-11"
              }
            >
              <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
              {fullScreenPortrait ? (
                <span className="text-center leading-snug">Confirmar assinatura</span>
              ) : (
                "Confirmar assinatura"
              )}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
