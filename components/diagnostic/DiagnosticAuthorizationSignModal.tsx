import React, { useCallback, useEffect, useRef } from "react";
import { Eraser, Check, X } from "lucide-react";
import { useTabletPhonePortraitFullscreen } from "../../hooks/useTabletPhonePortraitFullscreen";
import { useDeviceTypeOptional } from "../ui/DeviceTypeContext";
import { ModalPortal } from "../ui/ModalPortal";
import {
  DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL,
  DIAGNOSTIC_AUTHORIZATION_TITLE,
} from "../../utils/diagnosticAuthorizationTerm";
import { formatDiagnosticAuthorizationVehicleLabel } from "../../utils/diagnosticAuthorizationPrint";
import { DiagnosticAuthorizationTermBody } from "./DiagnosticAuthorizationTermBody";

export interface DiagnosticAuthorizationSignModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (blob: Blob, meta: { signaturePreviewDataUrl: string }) => void;
  /** Enquanto grava a assinatura no servidor. */
  confirming?: boolean;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  plate?: string | null;
  mileageKm?: string | null;
}

function formatKmDisplay(mileageKm?: string | null): string {
  const raw = (mileageKm ?? "").trim();
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `Km ${grouped}`;
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "rgba(15,23,42,0.92)";
  ctx.fillStyle = "rgba(15,23,42,0.92)";
  ctx.lineWidth = 2.35;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function setupCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2.5, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const w = Math.max(360, Math.floor(rect.width || 360));
  const h = Math.max(160, Math.floor(rect.height || 180));
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

export const DiagnosticAuthorizationSignModal: React.FC<DiagnosticAuthorizationSignModalProps> = ({
  open,
  onClose,
  onConfirm,
  confirming = false,
  vehicleBrand,
  vehicleModel,
  plate,
  mileageKm,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const hasInkRef = useRef(false);
  const fullScreenPortrait = useTabletPhonePortraitFullscreen();
  const { isDesktop } = useDeviceTypeOptional();

  const redrawBase = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setupCanvas(canvas);
    hasInkRef.current = false;
  }, []);

  useEffect(() => {
    if (!open) {
      hasInkRef.current = false;
      return;
    }
    const t = window.setTimeout(() => redrawBase(), 50);
    return () => window.clearTimeout(t);
  }, [open, redrawBase]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => redrawBase();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, redrawBase]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => redrawBase(), 80);
    return () => window.clearTimeout(t);
  }, [open, fullScreenPortrait, redrawBase]);

  const clientToLocal = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (confirming) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
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
    if (!drawingRef.current || confirming) return;
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

  const handleClear = () => redrawBase();

  const handleConfirm = () => {
    if (confirming) return;
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
        };
        reader.readAsDataURL(blob);
      },
      "image/png",
      0.92
    );
  };

  if (!open) return null;

  const vehicleLabel = formatDiagnosticAuthorizationVehicleLabel(vehicleBrand, vehicleModel);
  const plateLabel = (plate ?? "").trim().toUpperCase() || "—";
  const kmLabel = formatKmDisplay(mileageKm);
  const hasVehicleMeta =
    Boolean((vehicleBrand ?? "").trim()) ||
    Boolean((vehicleModel ?? "").trim()) ||
    Boolean((plate ?? "").trim()) ||
    Boolean((mileageKm ?? "").trim());

  return (
    <ModalPortal>
      <div
        className={
          fullScreenPortrait
            ? "fixed inset-0 z-[240] flex items-stretch justify-stretch bg-black/55 animate-modal-backdrop pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
            : "fixed inset-0 z-[240] flex items-center justify-center bg-black/50 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] animate-modal-backdrop"
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="diag-auth-modal-title"
      >
        <div
          className={
            fullScreenPortrait
              ? "relative flex h-full min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden rounded-none border-0 bg-white animate-modal-sheet"
              : "relative flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_24px_64px_-24px_rgba(0,0,0,0.35)] animate-modal-sheet"
          }
          onClick={(ev) => ev.stopPropagation()}
        >
          <div className="relative z-10 flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-6 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Documento
              </p>
              <h2
                id="diag-auth-modal-title"
                className="mt-1 text-[17px] font-bold tracking-tight text-zinc-950 sm:text-lg"
              >
                {DIAGNOSTIC_AUTHORIZATION_TITLE}
              </h2>
              <p className="mt-1.5 text-[13px] font-medium text-zinc-500">
                {isDesktop
                  ? "Leia o termo e assine com o mouse ou trackpad sobre a linha."
                  : "Leia o termo e assine com o dedo ou caneta sobre a linha."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={confirming}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch] sm:p-8">
            <div className="mx-auto w-full max-w-xl">
              <header className="border-b border-zinc-200 pb-4">
                <h3 className="text-center text-[15px] font-bold uppercase tracking-[0.08em] text-zinc-950 sm:text-[16px]">
                  {DIAGNOSTIC_AUTHORIZATION_TITLE}
                </h3>
              </header>

              {hasVehicleMeta ? (
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                  <div className="min-w-0 border-b border-zinc-200 pb-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                      Veículo
                    </p>
                    <p className="mt-1 text-[14px] font-semibold text-zinc-900">{vehicleLabel}</p>
                  </div>
                  <div className="min-w-0 border-b border-zinc-200 pb-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                      Placa
                    </p>
                    <p className="mt-1 text-[14px] font-semibold uppercase tracking-wide text-zinc-900">
                      {plateLabel}
                    </p>
                  </div>
                  <div className="min-w-0 border-b border-zinc-200 pb-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                      Quilometragem
                    </p>
                    <p className="mt-1 text-[14px] font-semibold text-zinc-900">{kmLabel}</p>
                  </div>
                </div>
              ) : null}

              <DiagnosticAuthorizationTermBody
                className="mt-6 space-y-4 text-[15px] leading-relaxed text-zinc-800 sm:text-[16px] sm:leading-relaxed"
                paragraphClassName="text-zinc-800"
                calloutClassName="font-extrabold uppercase tracking-wide text-zinc-950"
              />

              <div className="mt-10">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  {DIAGNOSTIC_AUTHORIZATION_SIGNATURE_LABEL}
                </p>
                <div className="relative mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white">
                  {/* Linha-guia visual (não entra no PNG exportado). */}
                  <div
                    className="pointer-events-none absolute inset-x-4 bottom-[22%] z-[1] border-b border-zinc-400"
                    aria-hidden
                  />
                  <canvas
                    ref={canvasRef}
                    className={`touch-none relative z-0 block w-full select-none bg-white ${
                      isDesktop
                        ? "h-[min(220px,32vh)] min-h-[180px] cursor-crosshair"
                        : "h-[min(240px,36vh)] min-h-[170px] cursor-crosshair"
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
              </div>
            </div>
          </div>

          <div
            className={
              fullScreenPortrait
                ? "relative z-10 flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-zinc-200 bg-white px-6 py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                : "relative z-10 flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-zinc-200 bg-white px-6 py-4"
            }
          >
            <button
              type="button"
              onClick={handleClear}
              disabled={confirming}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 disabled:opacity-50"
            >
              <Eraser className="h-4 w-4" aria-hidden />
              Limpar
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={confirming}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 disabled:opacity-50"
            >
              Agora não
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              {confirming ? "Salvando…" : "Confirmar assinatura"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
