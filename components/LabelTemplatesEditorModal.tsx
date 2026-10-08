import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Eye,
  EyeOff,
  Minus,
  Move,
  Plus,
  RotateCcw,
  Tag,
  Type,
  X,
} from 'lucide-react';
import {
  LABEL_FONTS,
  LABEL_SAMPLE_DATA,
  LABEL_TEMPLATE_META,
  createDefaultTemplate,
  cssFontForElement,
  loadAllLabelTemplates,
  normalizeLabelTemplate,
  saveAllLabelTemplates,
  type LabelElementDef,
  type LabelFontFamily,
  type LabelFontWeight,
  type LabelTemplateId,
  type LabelTemplateLayout,
  type LabelTemplatesStore,
} from '../utils/labelTemplates';
import { renderLabOsLabelDataUrl } from '../utils/labOsLabelRender';
import { NIIMBOT_LABEL_H_PX, NIIMBOT_LABEL_W_PX, renderNiimbotPartLabelDataUrl } from '../utils/niimbotLabelRender';
import { renderPatioKeyLabelDataUrl } from '../utils/patioKeyLabelRender';
import { ModalPortal } from './ui/ModalPortal';
import { IosModalHeader } from './ui/IosModalHeader';
import { iosModalClose, iosModalShell } from './ui/iosModalStyles';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

export type LabelTemplatesEditorModalProps = {
  open: boolean;
  onClose: () => void;
  /** Qual etiqueta abrir primeiro. */
  initialTemplateId?: LabelTemplateId;
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
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  onChange: (v: T) => void;
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
              onClick={() => onChange(opt.value)}
              className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[12px] font-semibold transition ${
                active
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
              }`}
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

async function buildPreview(
  id: LabelTemplateId,
  layout: LabelTemplateLayout
): Promise<string> {
  if (id === 'lab_os') {
    return renderLabOsLabelDataUrl({ ...LABEL_SAMPLE_DATA.lab_os }, layout);
  }
  if (id === 'estoque') {
    return renderNiimbotPartLabelDataUrl({ ...LABEL_SAMPLE_DATA.estoque }, layout);
  }
  return renderPatioKeyLabelDataUrl({ ...LABEL_SAMPLE_DATA.chave }, layout);
}

export function LabelTemplatesEditorModal({
  open,
  onClose,
  initialTemplateId = 'lab_os',
}: LabelTemplatesEditorModalProps) {
  const [store, setStore] = useState<LabelTemplatesStore>(() => loadAllLabelTemplates());
  const [activeId, setActiveId] = useState<LabelTemplateId>(initialTemplateId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [drag, setDrag] = useState<{
    elId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const previewWrapRef = useRef<HTMLDivElement | null>(null);

  useBrowserBackLayer(open, onClose);

  useEffect(() => {
    if (!open) return;
    const loaded = loadAllLabelTemplates();
    setStore(loaded);
    setActiveId(initialTemplateId);
    setSelectedId(loaded[initialTemplateId]?.elements[0]?.id ?? null);
  }, [open, initialTemplateId]);

  const layout = store[activeId];
  const selected = useMemo(
    () => layout.elements.find((e) => e.id === selectedId) ?? null,
    [layout.elements, selectedId]
  );

  const persist = useCallback((next: LabelTemplatesStore) => {
    const normalized: LabelTemplatesStore = {
      lab_os: normalizeLabelTemplate('lab_os', next.lab_os),
      estoque: normalizeLabelTemplate('estoque', next.estoque),
      chave: normalizeLabelTemplate('chave', next.chave),
    };
    setStore(normalized);
    saveAllLabelTemplates(normalized);
  }, []);

  const patchLayout = useCallback(
    (partial: Partial<LabelTemplateLayout>) => {
      persist({
        ...store,
        [activeId]: normalizeLabelTemplate(activeId, { ...layout, ...partial }),
      });
    },
    [persist, store, activeId, layout]
  );

  const patchElement = useCallback(
    (elId: string, partial: Partial<LabelElementDef>) => {
      const elements = layout.elements.map((e) =>
        e.id === elId ? { ...e, ...partial } : e
      );
      patchLayout({ elements });
    },
    [layout.elements, patchLayout]
  );

  const resetActive = () => {
    const fresh = createDefaultTemplate(activeId);
    persist({ ...store, [activeId]: fresh });
    setSelectedId(fresh.elements[0]?.id ?? null);
  };

  useEffect(() => {
    if (!open) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    setBuilding(true);
    void buildPreview(activeId, layout)
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      })
      .finally(() => {
        if (!cancelled) setBuilding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, activeId, layout]);

  const onPointerDownOverlay = (e: React.PointerEvent, elId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(elId);
    const elDef = layout.elements.find((x) => x.id === elId);
    if (!elDef) return;
    setDrag({
      elId,
      startX: e.clientX,
      startY: e.clientY,
      origX: elDef.x,
      origY: elDef.y,
    });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag || !previewWrapRef.current) return;
    const rect = previewWrapRef.current.getBoundingClientRect();
    const scaleX = NIIMBOT_LABEL_W_PX / rect.width;
    const scaleY = NIIMBOT_LABEL_H_PX / rect.height;
    const dx = (e.clientX - drag.startX) * scaleX;
    const dy = (e.clientY - drag.startY) * scaleY;
    patchElement(drag.elId, {
      x: Math.round(drag.origX + dx),
      y: Math.round(drag.origY + dy),
    });
  };

  const onPointerUp = () => setDrag(null);

  if (!open) return null;

  const overlayElements =
    activeId === 'chave'
      ? [] // chave é composta/rotacionada — edição por painel
      : layout.elements.filter((e) => e.visible);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[250] flex items-center justify-center bg-black/55 p-2 sm:p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          className={`${iosModalShell} relative flex h-[min(98dvh,1040px)] w-full max-w-6xl flex-col overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="label-templates-editor-title"
        >
          <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>

          <div className="shrink-0 border-b border-zinc-200/70 bg-white px-5 pb-3 pt-8 pr-24 dark:border-white/[0.06] dark:bg-transparent sm:px-6">
            <IosModalHeader
              icon={<Tag className="h-5 w-5 text-zinc-800" />}
              title="Editor de etiquetas"
              subtitle="Laboratório, estoque, chave · 50 × 30 mm · salvo neste dispositivo"
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {LABEL_TEMPLATE_META.map((meta) => {
                const active = meta.id === activeId;
                return (
                  <button
                    key={meta.id}
                    type="button"
                    onClick={() => {
                      setActiveId(meta.id);
                      setSelectedId(store[meta.id].elements[0]?.id ?? null);
                    }}
                    className={`rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
                      active
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-200'
                    }`}
                  >
                    {meta.title}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {/* Prévia + overlays de arraste */}
            <div className="shrink-0 space-y-3 border-b border-zinc-200/60 bg-white px-5 py-4 dark:border-white/[0.06] dark:bg-transparent sm:px-6 lg:w-[min(48%,520px)] lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  Pré-visualização
                </p>
                <button
                  type="button"
                  onClick={resetActive}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Resetar esta etiqueta
                </button>
              </div>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                {LABEL_TEMPLATE_META.find((m) => m.id === activeId)?.description}
                {activeId !== 'chave'
                  ? ' · Arraste os blocos na prévia para reposicionar.'
                  : ' · Ajuste campos e opções no painel à direita.'}
              </p>
              <div
                ref={previewWrapRef}
                className="relative mx-auto w-full max-w-[440px] select-none rounded-xl bg-zinc-100 p-3 dark:bg-white/[0.04]"
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Prévia da etiqueta"
                    width={NIIMBOT_LABEL_W_PX}
                    height={NIIMBOT_LABEL_H_PX}
                    className="pointer-events-none h-auto w-full border border-zinc-300 bg-white dark:border-white/20"
                    style={{
                      aspectRatio: `${NIIMBOT_LABEL_W_PX} / ${NIIMBOT_LABEL_H_PX}`,
                      imageRendering: 'pixelated',
                    }}
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-[160px] items-center justify-center text-[13px] text-zinc-500">
                    {building ? 'Montando prévia…' : 'Sem prévia'}
                  </div>
                )}
                {previewUrl && overlayElements.length > 0 ? (
                  <div className="pointer-events-none absolute inset-3">
                    {overlayElements.map((elDef) => {
                      const left = `${(elDef.x / NIIMBOT_LABEL_W_PX) * 100}%`;
                      const top = `${(elDef.y / NIIMBOT_LABEL_H_PX) * 100}%`;
                      const width = `${(elDef.w / NIIMBOT_LABEL_W_PX) * 100}%`;
                      const height = `${(elDef.h / NIIMBOT_LABEL_H_PX) * 100}%`;
                      const active = selectedId === elDef.id;
                      return (
                        <button
                          key={elDef.id}
                          type="button"
                          className={`pointer-events-auto absolute touch-none rounded-sm border-2 ${
                            active
                              ? 'border-sky-500 bg-sky-400/15 shadow-[0_0_0_1px_rgba(14,165,233,0.5)]'
                              : 'border-transparent hover:border-sky-300/80 hover:bg-sky-300/10'
                          }`}
                          style={{ left, top, width, height, cursor: 'move' }}
                          onPointerDown={(e) => onPointerDownOverlay(e, elDef.id)}
                          title={`Arrastar: ${elDef.name}`}
                          aria-label={`Selecionar ${elDef.name}`}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <p className="text-center text-[11px] text-emerald-700 dark:text-emerald-300">
                Alterações salvas automaticamente neste dispositivo
              </p>

              {/* Lista de elementos */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  Elementos
                </p>
                <div className="max-h-[180px] space-y-1 overflow-y-auto custom-scrollbar">
                  {layout.elements.map((elDef) => {
                    const active = selectedId === elDef.id;
                    return (
                      <button
                        key={elDef.id}
                        type="button"
                        onClick={() => setSelectedId(elDef.id)}
                        className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition ${
                          active
                            ? 'bg-sky-50 text-sky-950 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-800'
                            : 'bg-zinc-50 text-zinc-800 hover:bg-zinc-100 dark:bg-white/[0.04] dark:text-zinc-200'
                        }`}
                      >
                        {elDef.visible ? (
                          <Eye className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5 shrink-0 opacity-40" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{elDef.name}</span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-400">
                          {elDef.kind}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Painel de propriedades */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 custom-scrollbar sm:px-6">
              {!selected ? (
                <p className="text-[13px] text-zinc-500">Selecione um elemento para editar.</p>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                        {selected.name}
                      </p>
                      <p className="mt-0.5 text-[12px] text-zinc-500">
                        id: {selected.id} · {selected.kind}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => patchElement(selected.id, { visible: !selected.visible })}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold ${
                        selected.visible
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                          : 'bg-zinc-100 text-zinc-500 dark:bg-white/10'
                      }`}
                    >
                      {selected.visible ? (
                        <>
                          <Eye className="h-3.5 w-3.5" /> Visível
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-3.5 w-3.5" /> Oculto
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-3 rounded-2xl border-0 bg-zinc-50 p-3.5 dark:bg-white/[0.03] sm:p-4">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      <Type className="h-3.5 w-3.5" />
                      Texto e fonte
                    </div>

                    {selected.kind !== 'qr' && selected.kind !== 'barcode' ? (
                      <label className="block space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                          Rótulo / prefixo
                        </span>
                        <input
                          type="text"
                          value={selected.labelText}
                          onChange={(e) =>
                            patchElement(selected.id, { labelText: e.target.value })
                          }
                          placeholder="Ex.: Cliente: ou OFICINA"
                          className="w-full rounded-xl border-0 bg-white px-3 py-2.5 text-[14px] font-medium text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <p className="text-[11px] text-zinc-500">
                          Deixe vazio para imprimir só o valor (sem legenda).
                        </p>
                      </label>
                    ) : null}

                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                        Fonte
                      </span>
                      <select
                        value={selected.fontFamily}
                        onChange={(e) =>
                          patchElement(selected.id, {
                            fontFamily: e.target.value as LabelFontFamily,
                          })
                        }
                        className="w-full rounded-xl border-0 bg-white px-3 py-2.5 text-[14px] font-medium text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100"
                      >
                        {LABEL_FONTS.map((f) => (
                          <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <Stepper
                      label="Tamanho do rótulo"
                      value={selected.fontSize}
                      display={`${selected.fontSize} px`}
                      onDec={() =>
                        patchElement(selected.id, { fontSize: selected.fontSize - 1 })
                      }
                      onInc={() =>
                        patchElement(selected.id, { fontSize: selected.fontSize + 1 })
                      }
                    />

                    {(selected.kind === 'banner' ||
                      selected.kind === 'text_field' ||
                      selected.kind === 'text' ||
                      selected.kind === 'human_code') && (
                      <Stepper
                        label="Tamanho do valor"
                        value={selected.valueFontSize}
                        display={`${selected.valueFontSize} px`}
                        onDec={() =>
                          patchElement(selected.id, {
                            valueFontSize: selected.valueFontSize - 1,
                          })
                        }
                        onInc={() =>
                          patchElement(selected.id, {
                            valueFontSize: selected.valueFontSize + 1,
                          })
                        }
                      />
                    )}

                    <Segmented<LabelFontWeight>
                      label="Espessura"
                      value={selected.fontWeight}
                      onChange={(fontWeight) => patchElement(selected.id, { fontWeight })}
                      options={[
                        { value: 'normal', label: 'Normal' },
                        {
                          value: 'bold',
                          label: 'Negrito',
                          icon: <Bold className="h-3.5 w-3.5" />,
                        },
                        { value: '900', label: 'Extra' },
                      ]}
                    />

                    <Segmented
                      label="Alinhamento"
                      value={selected.align}
                      onChange={(align) => patchElement(selected.id, { align })}
                      options={[
                        {
                          value: 'left',
                          label: 'Esq.',
                          icon: <AlignLeft className="h-3.5 w-3.5" />,
                        },
                        {
                          value: 'center',
                          label: 'Centro',
                          icon: <AlignCenter className="h-3.5 w-3.5" />,
                        },
                        {
                          value: 'right',
                          label: 'Dir.',
                          icon: <AlignRight className="h-3.5 w-3.5" />,
                        },
                      ]}
                    />

                    {(selected.kind === 'text_field' || selected.kind === 'text') && (
                      <Stepper
                        label="Máx. linhas"
                        value={selected.maxLines}
                        onDec={() =>
                          patchElement(selected.id, {
                            maxLines: Math.max(1, selected.maxLines - 1),
                          })
                        }
                        onInc={() =>
                          patchElement(selected.id, { maxLines: selected.maxLines + 1 })
                        }
                      />
                    )}
                  </div>

                  <div className="space-y-3 rounded-2xl border-0 bg-zinc-50 p-3.5 dark:bg-white/[0.03] sm:p-4">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      <Move className="h-3.5 w-3.5" />
                      Posição e tamanho
                    </div>
                    <Stepper
                      label="X"
                      value={selected.x}
                      display={`${selected.x} px`}
                      onDec={() => patchElement(selected.id, { x: selected.x - 1 })}
                      onInc={() => patchElement(selected.id, { x: selected.x + 1 })}
                    />
                    <Stepper
                      label="Y"
                      value={selected.y}
                      display={`${selected.y} px`}
                      onDec={() => patchElement(selected.id, { y: selected.y - 1 })}
                      onInc={() => patchElement(selected.id, { y: selected.y + 1 })}
                    />
                    <Stepper
                      label="Largura"
                      value={selected.w}
                      display={`${selected.w} px`}
                      onDec={() => patchElement(selected.id, { w: selected.w - 2 })}
                      onInc={() => patchElement(selected.id, { w: selected.w + 2 })}
                    />
                    <Stepper
                      label="Altura"
                      value={selected.h}
                      display={`${selected.h} px`}
                      onDec={() => patchElement(selected.id, { h: selected.h - 2 })}
                      onInc={() => patchElement(selected.id, { h: selected.h + 2 })}
                    />
                  </div>
                </>
              )}

              {activeId === 'chave' && layout.keyOptions ? (
                <div className="space-y-3 rounded-2xl border-0 bg-zinc-50 p-3.5 dark:bg-white/[0.03] sm:p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    Opções da etiqueta de chave
                  </p>
                  <Stepper
                    label="Espaçamento de letras"
                    value={layout.keyOptions.letterSpacing}
                    display={`${layout.keyOptions.letterSpacing.toFixed(1)}`}
                    onDec={() =>
                      patchLayout({
                        keyOptions: {
                          ...layout.keyOptions!,
                          letterSpacing:
                            Math.round((layout.keyOptions!.letterSpacing - 0.5) * 10) / 10,
                        },
                      })
                    }
                    onInc={() =>
                      patchLayout({
                        keyOptions: {
                          ...layout.keyOptions!,
                          letterSpacing:
                            Math.round((layout.keyOptions!.letterSpacing + 0.5) * 10) / 10,
                        },
                      })
                    }
                  />
                  <Stepper
                    label="Espaçamento de linhas"
                    value={layout.keyOptions.lineSpacing}
                    display={`${layout.keyOptions.lineSpacing.toFixed(2)}×`}
                    onDec={() =>
                      patchLayout({
                        keyOptions: {
                          ...layout.keyOptions!,
                          lineSpacing:
                            Math.round((layout.keyOptions!.lineSpacing - 0.05) * 100) / 100,
                        },
                      })
                    }
                    onInc={() =>
                      patchLayout({
                        keyOptions: {
                          ...layout.keyOptions!,
                          lineSpacing:
                            Math.round((layout.keyOptions!.lineSpacing + 0.05) * 100) / 100,
                        },
                      })
                    }
                  />
                  <Stepper
                    label="Margem"
                    value={layout.keyOptions.margin}
                    display={`${layout.keyOptions.margin} px`}
                    onDec={() =>
                      patchLayout({
                        keyOptions: {
                          ...layout.keyOptions!,
                          margin: layout.keyOptions!.margin - 1,
                        },
                      })
                    }
                    onInc={() =>
                      patchLayout({
                        keyOptions: {
                          ...layout.keyOptions!,
                          margin: layout.keyOptions!.margin + 1,
                        },
                      })
                    }
                  />
                  <Stepper
                    label="Espaço entre faces"
                    value={layout.keyOptions.halfGap}
                    display={`${layout.keyOptions.halfGap} px`}
                    onDec={() =>
                      patchLayout({
                        keyOptions: {
                          ...layout.keyOptions!,
                          halfGap: layout.keyOptions!.halfGap - 1,
                        },
                      })
                    }
                    onInc={() =>
                      patchLayout({
                        keyOptions: {
                          ...layout.keyOptions!,
                          halfGap: layout.keyOptions!.halfGap + 1,
                        },
                      })
                    }
                  />
                  <Stepper
                    label="Offset X"
                    value={layout.keyOptions.offsetX}
                    display={`${layout.keyOptions.offsetX} px`}
                    onDec={() =>
                      patchLayout({
                        keyOptions: {
                          ...layout.keyOptions!,
                          offsetX: layout.keyOptions!.offsetX - 1,
                        },
                      })
                    }
                    onInc={() =>
                      patchLayout({
                        keyOptions: {
                          ...layout.keyOptions!,
                          offsetX: layout.keyOptions!.offsetX + 1,
                        },
                      })
                    }
                  />
                  <Stepper
                    label="Offset Y"
                    value={layout.keyOptions.offsetY}
                    display={`${layout.keyOptions.offsetY} px`}
                    onDec={() =>
                      patchLayout({
                        keyOptions: {
                          ...layout.keyOptions!,
                          offsetY: layout.keyOptions!.offsetY - 1,
                        },
                      })
                    }
                    onInc={() =>
                      patchLayout({
                        keyOptions: {
                          ...layout.keyOptions!,
                          offsetY: layout.keyOptions!.offsetY + 1,
                        },
                      })
                    }
                  />
                  <Segmented
                    label="Alinhamento vertical"
                    value={layout.keyOptions.vAlign}
                    onChange={(vAlign) =>
                      patchLayout({
                        keyOptions: { ...layout.keyOptions!, vAlign },
                      })
                    }
                    options={[
                      { value: 'top', label: 'Topo' },
                      { value: 'middle', label: 'Meio' },
                      { value: 'bottom', label: 'Base' },
                    ]}
                  />
                  <label className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 dark:bg-zinc-900">
                    <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-200">
                      Duas faces (cópia invertida)
                    </span>
                    <input
                      type="checkbox"
                      checked={layout.keyOptions.dualCopy !== false}
                      onChange={(e) =>
                        patchLayout({
                          keyOptions: {
                            ...layout.keyOptions!,
                            dualCopy: e.target.checked,
                          },
                        })
                      }
                      className="h-4 w-4 accent-emerald-600"
                    />
                  </label>
                </div>
              ) : null}

              <div className="rounded-xl bg-zinc-100/80 px-3 py-2.5 text-[11px] leading-relaxed text-zinc-600 dark:bg-white/[0.04] dark:text-zinc-400">
                Fonte de amostra na prévia:{' '}
                <span style={{ fontFamily: selected ? cssFontForElement(selected) : undefined }}>
                  {selected?.fontFamily ?? '—'}
                </span>
                . Novas etiquetas do sistema passam a usar este mesmo editor automaticamente.
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-zinc-200/60 px-5 py-4 dark:border-white/[0.06] sm:px-6">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-4 py-3 text-[15px] font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Concluir
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
