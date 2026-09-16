import React, { useEffect, useMemo, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bluetooth,
  BluetoothConnected,
  Bold,
  Loader2,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  Tag,
  X,
} from 'lucide-react';
import {
  NIIMBOT_MODEL_LABEL,
  NIIMBOT_SIZE_LABEL,
  niimbotService,
  type NiimbotServiceSnapshot,
} from '../services/niimbotService';
import {
  DEFAULT_PATIO_KEY_LABEL_STYLE,
  loadPatioKeyLabelStyle,
  normalizePatioKeyLabelStyle,
  PATIO_KEY_LABEL_FONTS,
  renderPatioKeyLabelDataUrl,
  savePatioKeyLabelStyle,
  type PatioKeyLabelInput,
  type PatioKeyLabelStyle,
} from '../utils/patioKeyLabelRender';
import { NIIMBOT_LABEL_H_PX, NIIMBOT_LABEL_W_PX } from '../utils/niimbotLabelRender';
import { ModalPortal } from './ui/ModalPortal';
import { IosModalHeader } from './ui/IosModalHeader';
import { iosModalClose, iosModalShell } from './ui/iosModalStyles';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

export type PatioKeyLabelPrintModalProps = {
  open: boolean;
  label: PatioKeyLabelInput | null;
  onClose: () => void;
};

function Stepper({
  label,
  value,
  display,
  onDec,
  onInc,
  disabled,
}: {
  label: string;
  value: string | number;
  display?: string;
  onDec: () => void;
  onInc: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12px] font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onDec}
          disabled={disabled}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-200/80 text-zinc-800 disabled:opacity-40 dark:bg-white/10 dark:text-zinc-100"
          aria-label={`Diminuir ${label}`}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-[3.25rem] text-center text-[13px] font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
          {display ?? value}
        </span>
        <button
          type="button"
          onClick={onInc}
          disabled={disabled}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-200/80 text-zinc-800 disabled:opacity-40 dark:bg-white/10 dark:text-zinc-100"
          aria-label={`Aumentar ${label}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="flex flex-wrap gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-white/[0.06]">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[12px] font-semibold transition ${
                active
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
              } disabled:opacity-40`}
            >
              {opt.icon}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PatioKeyLabelPrintModal({ open, label, onClose }: PatioKeyLabelPrintModalProps) {
  const [snap, setSnap] = useState<NiimbotServiceSnapshot>(() => niimbotService.snapshot());
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [style, setStyle] = useState<PatioKeyLabelStyle>(() => loadPatioKeyLabelStyle());
  const [showEditor, setShowEditor] = useState(true);

  useBrowserBackLayer(open, onClose);

  useEffect(() => {
    if (!open) return;
    setStyle(loadPatioKeyLabelStyle());
    return niimbotService.subscribe(setSnap);
  }, [open]);

  const normalizedStyle = useMemo(() => normalizePatioKeyLabelStyle(style), [style]);

  useEffect(() => {
    if (!open || !label) {
      setPreviewUrl(null);
      return;
    }
    try {
      setLocalError(null);
      setPreviewUrl(renderPatioKeyLabelDataUrl(label, normalizedStyle));
      savePatioKeyLabelStyle(normalizedStyle);
    } catch (err) {
      setPreviewUrl(null);
      setLocalError(err instanceof Error ? err.message : 'Falha ao montar etiqueta');
    }
  }, [open, label, normalizedStyle]);

  if (!open || !label) return null;

  const unsupported = snap.status === 'unsupported';
  const printing = snap.status === 'printing' || busy;
  const connected = snap.status === 'connected' || snap.status === 'printing';

  const patchStyle = (partial: Partial<PatioKeyLabelStyle>) => {
    setStyle((prev) => normalizePatioKeyLabelStyle({ ...prev, ...partial }));
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setLocalError(null);
    try {
      await fn();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Operação falhou');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[240] flex items-center justify-center bg-black/50 p-3 sm:p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          className={`${iosModalShell} relative flex max-h-[min(94dvh,860px)] w-full max-w-lg flex-col overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="patio-key-label-print-title"
        >
          <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>

          <div className="shrink-0 border-b border-zinc-200/70 bg-white px-5 pb-4 pt-8 pr-24 dark:border-white/[0.06] dark:bg-transparent">
            <IosModalHeader
              icon={<Tag className="h-5 w-5 text-zinc-800" />}
              title="Imprimir etiqueta"
              subtitle={`${NIIMBOT_MODEL_LABEL} · chave · ${NIIMBOT_SIZE_LABEL}`}
            />
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 custom-scrollbar">
            <div>
              <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
                {label.customerName}
              </p>
              <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                {[label.vehicleModel, label.vehicleColor, label.plate].filter(Boolean).join(' · ')}
              </p>
            </div>

            {previewUrl ? (
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  Pré-visualização 50 × 30 mm
                </p>
                <div className="flex justify-center rounded-xl bg-zinc-100 p-4 dark:bg-white/[0.04]">
                  <img
                    src={previewUrl}
                    alt="Prévia da etiqueta de chave 50×30 mm"
                    width={NIIMBOT_LABEL_W_PX}
                    height={NIIMBOT_LABEL_H_PX}
                    className="h-auto w-full max-w-[320px] border border-zinc-300 bg-white dark:border-white/20"
                    style={{
                      aspectRatio: `${NIIMBOT_LABEL_W_PX} / ${NIIMBOT_LABEL_H_PX}`,
                      imageRendering: 'pixelated',
                    }}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                Editor da etiqueta
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={printing}
                  onClick={() => setStyle({ ...DEFAULT_PATIO_KEY_LABEL_STYLE })}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Resetar
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditor((v) => !v)}
                  className="rounded-lg px-2 py-1 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                >
                  {showEditor ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            {showEditor ? (
              <div className="space-y-3 rounded-2xl border-0 bg-zinc-50 p-3 dark:bg-white/[0.03]">
                <label className="block space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    Fonte
                  </span>
                  <select
                    value={normalizedStyle.fontFamily}
                    disabled={printing}
                    onChange={(e) =>
                      patchStyle({
                        fontFamily: e.target.value as PatioKeyLabelStyle['fontFamily'],
                      })
                    }
                    className="w-full rounded-xl border-0 bg-white px-3 py-2.5 text-[14px] font-medium text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {PATIO_KEY_LABEL_FONTS.map((f) => (
                      <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>

                <Stepper
                  label="Tamanho"
                  value={normalizedStyle.fontSize}
                  display={`${normalizedStyle.fontSize} px`}
                  disabled={printing}
                  onDec={() => patchStyle({ fontSize: normalizedStyle.fontSize - 1 })}
                  onInc={() => patchStyle({ fontSize: normalizedStyle.fontSize + 1 })}
                />

                <Segmented
                  label="Espessura"
                  value={normalizedStyle.fontWeight}
                  disabled={printing}
                  onChange={(fontWeight) => patchStyle({ fontWeight })}
                  options={[
                    { value: 'normal', label: 'Normal' },
                    { value: 'bold', label: 'Negrito', icon: <Bold className="h-3.5 w-3.5" /> },
                    { value: '900', label: 'Extra' },
                  ]}
                />

                <Stepper
                  label="Espaçamento de letras"
                  value={normalizedStyle.letterSpacing}
                  display={`${normalizedStyle.letterSpacing.toFixed(1)}`}
                  disabled={printing}
                  onDec={() =>
                    patchStyle({ letterSpacing: Math.round((normalizedStyle.letterSpacing - 0.5) * 10) / 10 })
                  }
                  onInc={() =>
                    patchStyle({ letterSpacing: Math.round((normalizedStyle.letterSpacing + 0.5) * 10) / 10 })
                  }
                />

                <Stepper
                  label="Espaçamento de linhas"
                  value={normalizedStyle.lineSpacing}
                  display={`${normalizedStyle.lineSpacing.toFixed(2)}×`}
                  disabled={printing}
                  onDec={() =>
                    patchStyle({
                      lineSpacing: Math.round((normalizedStyle.lineSpacing - 0.05) * 100) / 100,
                    })
                  }
                  onInc={() =>
                    patchStyle({
                      lineSpacing: Math.round((normalizedStyle.lineSpacing + 0.05) * 100) / 100,
                    })
                  }
                />

                <Segmented
                  label="Alinhamento horizontal"
                  value={normalizedStyle.align}
                  disabled={printing}
                  onChange={(align) => patchStyle({ align })}
                  options={[
                    { value: 'left', label: 'Esq.', icon: <AlignLeft className="h-3.5 w-3.5" /> },
                    { value: 'center', label: 'Centro', icon: <AlignCenter className="h-3.5 w-3.5" /> },
                    { value: 'right', label: 'Dir.', icon: <AlignRight className="h-3.5 w-3.5" /> },
                  ]}
                />

                <Segmented
                  label="Alinhamento vertical"
                  value={normalizedStyle.vAlign}
                  disabled={printing}
                  onChange={(vAlign) => patchStyle({ vAlign })}
                  options={[
                    { value: 'top', label: 'Topo' },
                    { value: 'middle', label: 'Meio' },
                    { value: 'bottom', label: 'Base' },
                  ]}
                />

                <Stepper
                  label="Posição X"
                  value={normalizedStyle.offsetX}
                  display={`${normalizedStyle.offsetX} px`}
                  disabled={printing}
                  onDec={() => patchStyle({ offsetX: normalizedStyle.offsetX - 1 })}
                  onInc={() => patchStyle({ offsetX: normalizedStyle.offsetX + 1 })}
                />

                <Stepper
                  label="Posição Y"
                  value={normalizedStyle.offsetY}
                  display={`${normalizedStyle.offsetY} px`}
                  disabled={printing}
                  onDec={() => patchStyle({ offsetY: normalizedStyle.offsetY - 1 })}
                  onInc={() => patchStyle({ offsetY: normalizedStyle.offsetY + 1 })}
                />

                <Stepper
                  label="Margem"
                  value={normalizedStyle.margin}
                  display={`${normalizedStyle.margin} px`}
                  disabled={printing}
                  onDec={() => patchStyle({ margin: normalizedStyle.margin - 1 })}
                  onInc={() => patchStyle({ margin: normalizedStyle.margin + 1 })}
                />

                <Stepper
                  label="Espaço entre faces"
                  value={normalizedStyle.halfGap}
                  display={`${normalizedStyle.halfGap} px`}
                  disabled={printing}
                  onDec={() => patchStyle({ halfGap: normalizedStyle.halfGap - 1 })}
                  onInc={() => patchStyle({ halfGap: normalizedStyle.halfGap + 1 })}
                />

                <label className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 dark:bg-zinc-900">
                  <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-200">
                    Mostrar rótulos (Cliente:, Carro:…)
                  </span>
                  <input
                    type="checkbox"
                    checked={normalizedStyle.showLabels}
                    disabled={printing}
                    onChange={(e) => patchStyle({ showLabels: e.target.checked })}
                    className="h-4 w-4 accent-emerald-600"
                  />
                </label>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-white/[0.03]">
              <div className="flex min-w-0 items-center gap-2">
                {connected ? (
                  <BluetoothConnected className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Bluetooth className="h-4 w-4 shrink-0 text-zinc-500" />
                )}
                <p className="truncate text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                  {snap.message ||
                    (connected
                      ? snap.printerLabel || 'Conectada'
                      : unsupported
                        ? 'Web Bluetooth indisponível'
                        : 'Desconectada')}
                </p>
              </div>
              {!unsupported ? (
                connected && snap.status !== 'printing' ? (
                  <button
                    type="button"
                    onClick={() => run(() => niimbotService.disconnect())}
                    disabled={printing}
                    className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-200/60 disabled:opacity-50 dark:text-zinc-300"
                  >
                    Desconectar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => run(() => niimbotService.connect())}
                    disabled={printing}
                    className="shrink-0 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Conectar
                  </button>
                )
              ) : null}
            </div>

            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                Quantidade
              </span>
              <input
                type="number"
                min={1}
                max={99}
                value={copies}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setCopies(Number.isFinite(n) ? Math.max(1, Math.min(99, Math.floor(n))) : 1);
                }}
                disabled={printing}
                className="mt-1 w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-[15px] tabular-nums text-zinc-900 outline-none disabled:opacity-50 dark:bg-white/[0.06] dark:text-zinc-100"
              />
            </label>

            {(localError || unsupported) && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:bg-red-950/40 dark:text-red-200">
                {localError || snap.message}
              </p>
            )}
          </div>

          <div className="shrink-0 border-t border-zinc-200/60 px-5 py-4 dark:border-white/[0.06]">
            <button
              type="button"
              disabled={printing || unsupported || !previewUrl}
              onClick={() =>
                run(async () => {
                  const url = renderPatioKeyLabelDataUrl(label, normalizedStyle);
                  await niimbotService.printLabelImageUrl(url, { copies });
                })
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[15px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {printing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Printer className="h-5 w-5" />
              )}
              {printing ? 'Imprimindo…' : copies > 1 ? `Imprimir ${copies} etiquetas` : 'Imprimir etiqueta'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
