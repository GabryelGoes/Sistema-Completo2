import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Droplets,
  Eye,
  EyeOff,
  Loader2,
  Minus,
  Move,
  Plus,
  Printer,
  RotateCcw,
  RotateCw,
  Tag,
  Type,
  X,
} from 'lucide-react';
import {
  LABEL_FONTS,
  LABEL_PECAS_SIDEBAR_ICONS,
  LABEL_SAMPLE_DATA,
  LABEL_TEMPLATE_META,
  createDefaultPecasOptions,
  createDefaultTemplate,
  cssFontForElement,
  loadAllLabelTemplates,
  normalizeLabelTemplate,
  normalizePecasOptions,
  type LabelElementDef,
  type LabelFontFamily,
  type LabelFontWeight,
  type LabelPecasOptions,
  type LabelPecasSidebarIcon,
  type LabelTemplateId,
  type LabelTemplateLayout,
  type LabelTemplatesStore,
} from '../utils/labelTemplates';
import {
  persistLabelTemplatesToServer,
  syncLabelTemplatesFromServer,
} from '../utils/labelTemplatesSync';
import { formatApiFailureMessage, isApiHttpError } from '../utils/apiHttpError';
import { renderLabOsLabelDataUrl } from '../utils/labOsLabelRender';
import {
  NIIMBOT_LABEL_H_PX,
  NIIMBOT_LABEL_W_PX,
  renderNiimbotAbsModuleLabelDataUrl,
  renderNiimbotPartLabelDataUrl,
} from '../utils/niimbotLabelRender';
import { renderPatioKeyLabelDataUrl } from '../utils/patioKeyLabelRender';
import { renderPatioPecasLabelDataUrl } from '../utils/patioPecasLabelRender';
import { KEY_LABEL_ICON_PRESETS } from '../utils/keyLabelIcons';
import { niimbotService } from '../services/niimbotService';
import { ModalPortal } from './ui/ModalPortal';
import { IosModalHeader } from './ui/IosModalHeader';
import { iosModalClose, iosModalShell, resolveIosModalOverlayClass } from './ui/iosModalStyles';
import { useBrowserBackLayer } from './ui/BackNavigationContext';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { ajustesPcOpsClass } from './ajustes/AjustesPcLayoutContext';
import { AjustesPcOpsEyebrow } from './ajustes/AjustesPcOpsEyebrow';

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
  if (id === 'abs_modulo') {
    return renderNiimbotAbsModuleLabelDataUrl({ ...LABEL_SAMPLE_DATA.abs_modulo }, layout);
  }
  if (id === 'pecas_os') {
    return renderPatioPecasLabelDataUrl({ ...LABEL_SAMPLE_DATA.pecas_os }, layout);
  }
  return await renderPatioKeyLabelDataUrl({ ...LABEL_SAMPLE_DATA.chave }, layout);
}

export function LabelTemplatesEditorModal({
  open,
  onClose,
  initialTemplateId = 'lab_os',
}: LabelTemplatesEditorModalProps) {
  const isDesktopShell = useDesktopShellLayout();
  const [store, setStore] = useState<LabelTemplatesStore>(() => loadAllLabelTemplates());
  const [activeId, setActiveId] = useState<LabelTemplateId>(initialTemplateId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncStatusNote, setSyncStatusNote] = useState<string | null>(null);
  const [remoteSaved, setRemoteSaved] = useState(false);
  const [drag, setDrag] = useState<{
    elId: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [printMsg, setPrintMsg] = useState<string | null>(null);
  const previewWrapRef = useRef<HTMLDivElement | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  /** Invalida resultados de persist/sync ao reabrir ou fechar (evita sucesso remoto fantasma). */
  const uiEpochRef = useRef(0);

  const flushPersist = useCallback(() => {
    if (persistTimerRef.current == null) return;
    window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = null;
    const epochAtStart = uiEpochRef.current;
    void persistLabelTemplatesToServer(store)
      .then((result) => {
        // Fechado ou nova abertura: cache já foi gravado; não pintar sucesso remoto na UI.
        if (epochAtStart !== uiEpochRef.current || !openRef.current) return;
        setRemoteSaved(result.remoteSaved);
        if (result.remoteSaved) {
          setSyncError(null);
          setSyncStatusNote(null);
        }
      })
      .catch((e) => {
        if (epochAtStart !== uiEpochRef.current) return;
        // Mesmo fechado: se o editor ainda estiver montado aberto=false, não afirmamos sync ok.
        if (!openRef.current) {
          setRemoteSaved(false);
          return;
        }
        setRemoteSaved(false);
        setSyncError(
          formatApiFailureMessage(
            e,
            'Não foi possível salvar no servidor. As alterações ficaram só neste dispositivo.'
          )
        );
      });
  }, [store]);

  const handleClose = useCallback(() => {
    uiEpochRef.current += 1;
    flushPersist();
    onClose();
  }, [flushPersist, onClose]);

  useBrowserBackLayer(open, handleClose);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    uiEpochRef.current += 1;
    const epochAtOpen = uiEpochRef.current;
    // Mostra cache local imediatamente; depois sincroniza com o servidor.
    const local = loadAllLabelTemplates();
    setStore(local);
    setActiveId(initialTemplateId);
    setSelectedId(local[initialTemplateId]?.elements[0]?.id ?? null);
    setSyncError(null);
    setSyncStatusNote(null);
    setRemoteSaved(false);
    setSyncing(true);
    void syncLabelTemplatesFromServer({ force: true })
      .then((result) => {
        if (cancelled || epochAtOpen !== uiEpochRef.current) return;
        setStore(result.store);
        setSelectedId((prev) => {
          const still = result.store[initialTemplateId]?.elements.some((e) => e.id === prev);
          return still ? prev : result.store[initialTemplateId]?.elements[0]?.id ?? null;
        });
        if (result.status === 'remote' || result.status === 'uploaded_local') {
          setRemoteSaved(true);
          setSyncStatusNote(null);
        } else if (result.status === 'local_only_forbidden') {
          setRemoteSaved(false);
          setSyncStatusNote(
            'Sem permissão para publicar no servidor. Usando cache local neste dispositivo.'
          );
        } else if (result.status === 'local_only_network') {
          setRemoteSaved(false);
          setSyncStatusNote(
            'Servidor indisponível. Usando cache local neste dispositivo.'
          );
        } else {
          setRemoteSaved(false);
          setSyncStatusNote(null);
        }
      })
      .catch((e) => {
        if (cancelled || epochAtOpen !== uiEpochRef.current) return;
        setRemoteSaved(false);
        setSyncError(formatApiFailureMessage(e, 'Falha ao sincronizar etiquetas.'));
      })
      .finally(() => {
        if (!cancelled && epochAtOpen === uiEpochRef.current) setSyncing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, initialTemplateId]);

  useEffect(() => {
    if (open) return;
    flushPersist();
  }, [open, flushPersist]);

  useEffect(() => {
    return () => {
      uiEpochRef.current += 1;
      if (persistTimerRef.current != null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, []);

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
      pecas_os: normalizeLabelTemplate('pecas_os', next.pecas_os),
      abs_modulo: normalizeLabelTemplate('abs_modulo', next.abs_modulo),
    };
    setStore(normalized);
    setSyncError(null);
    // Debounce: grava no servidor após pausa na edição (e já no cache local).
    if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
    const epochAtSchedule = uiEpochRef.current;
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      if (epochAtSchedule !== uiEpochRef.current || !openRef.current) {
        // Fechou/reabriu: ainda grava local+servidor sem pintar sucesso na UI antiga.
        void persistLabelTemplatesToServer(normalized).catch(() => {
          /* cache local já salvo dentro de persistLabelTemplatesToServer */
        });
        return;
      }
      const epochAtStart = uiEpochRef.current;
      void persistLabelTemplatesToServer(normalized)
        .then((result) => {
          if (epochAtStart !== uiEpochRef.current || !openRef.current) return;
          setRemoteSaved(result.remoteSaved);
          if (result.remoteSaved) {
            setSyncError(null);
            setSyncStatusNote(null);
          }
        })
        .catch((e) => {
          if (epochAtStart !== uiEpochRef.current || !openRef.current) return;
          setRemoteSaved(false);
          if (isApiHttpError(e) && e.kind === 'forbidden') {
            setSyncError(
              'Sem permissão para gravar no servidor. Alterações ficaram só neste dispositivo.'
            );
            return;
          }
          setSyncError(
            formatApiFailureMessage(
              e,
              'Não foi possível salvar no servidor. As alterações ficaram só neste dispositivo.'
            )
          );
        });
    }, 450);
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

  const handlePrintTest = useCallback(async () => {
    if (!previewUrl || printBusy) return;
    setPrintBusy(true);
    setPrintMsg(null);
    try {
      flushPersist();
      const url = await buildPreview(activeId, layout);
      await niimbotService.printLabelImageUrl(url, { copies: 1 });
      setPrintMsg('Etiqueta de teste enviada à impressora.');
    } catch (err) {
      setPrintMsg(err instanceof Error ? err.message : 'Falha ao imprimir etiqueta de teste.');
    } finally {
      setPrintBusy(false);
    }
  }, [previewUrl, printBusy, flushPersist, activeId, layout]);

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
    // padding p-3 → área útil da imagem
    const pad = 12;
    const imgW = Math.max(1, rect.width - pad * 2);
    const imgH = Math.max(1, rect.height - pad * 2);
    const scaleX = NIIMBOT_LABEL_W_PX / imgW;
    const scaleY = NIIMBOT_LABEL_H_PX / imgH;
    const dPrintX = (e.clientX - drag.startX) * scaleX;
    const dPrintY = (e.clientY - drag.startY) * scaleY;
    // Chave: elementos vivem no bloco vertical; a prévia é a impressão rotacionada −90°.
    // printX ≈ blockY · printY ≈ printH − blockX − blockW  →  dBlockX = −dPrintY · dBlockY = dPrintX
    if (activeId === 'chave') {
      patchElement(drag.elId, {
        x: Math.round(drag.origX - dPrintY),
        y: Math.round(drag.origY + dPrintX),
      });
      return;
    }
    patchElement(drag.elId, {
      x: Math.round(drag.origX + dPrintX),
      y: Math.round(drag.origY + dPrintY),
    });
  };

  const onPointerUp = () => setDrag(null);

  if (!open) return null;

  const hasPlateMercosul = false; // chave usa SVG-base fixo; sem overlay Mercosul editável
  const isChaveSvg = activeId === 'chave';
  const isPecasOs = activeId === 'pecas_os';
  const isFixedSvgLabel = isChaveSvg || isPecasOs;
  const pecasOpts = normalizePecasOptions(
    layout.pecasOptions,
    createDefaultPecasOptions()
  );
  const patchPecasOptions = (partial: Partial<LabelPecasOptions>) => {
    patchLayout({
      pecasOptions: normalizePecasOptions(
        { ...pecasOpts, ...partial },
        createDefaultPecasOptions()
      ),
    });
  };
  const patchPecasField = (
    id: 'vehicle' | 'plate' | 'color' | 'customer',
    partial: Partial<LabelElementDef>
  ) => {
    patchElement(id, partial);
  };
  const overlayElements = layout.elements.filter((e) => e.visible);

  return (
    <ModalPortal>
      <div
        className={`${resolveIosModalOverlayClass(isDesktopShell)} ${
          isDesktopShell ? '' : 'bg-black/55'
        } p-2 sm:p-4`}
        onClick={handleClose}
        role="presentation"
      >
        <div
          className={`${iosModalShell} ${ajustesPcOpsClass(isDesktopShell)} relative flex h-[min(98dvh,1040px)] w-full max-w-6xl flex-col overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="label-templates-editor-title"
        >
          <button type="button" onClick={handleClose} className={iosModalClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>

          <div
            className={`shrink-0 bg-white px-5 pb-3 pt-8 pr-24 dark:bg-transparent sm:px-6 ${
              isDesktopShell
                ? 'ajustes-pc-ops-header'
                : 'border-b border-zinc-200/70 dark:border-white/[0.06]'
            }`}
          >
            <AjustesPcOpsEyebrow desktop={isDesktopShell}>Ajustes · Dispositivos · Etiquetas</AjustesPcOpsEyebrow>
            <IosModalHeader
              icon={<Tag className="h-5 w-5 text-zinc-800" />}
              title="Editor de etiquetas"
              titleId="label-templates-editor-title"
              subtitle={
                syncing
                  ? 'Sincronizando com o servidor…'
                  : syncError
                    ? syncError
                    : syncStatusNote
                      ? syncStatusNote
                      : remoteSaved
                        ? 'Lab, estoque, chave, peças · 50 × 30 mm · sincronizado em todos os dispositivos'
                        : 'Lab, estoque, chave, peças · 50 × 30 mm · cache local neste dispositivo'
              }
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

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
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
                {' · Arraste os textos na prévia · gire e edite cada um no painel.'}
                {isPecasOs
                  ? ' Use o painel à direita para ajustar faixa, tipografia e ícones.'
                  : isChaveSvg
                    ? ' Arte fixa do SVG-base (duas faces, textos a −90°). Só os dados da OS mudam na impressão.'
                    : ''}
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
                {previewUrl && overlayElements.length > 0 && !isFixedSvgLabel ? (
                  <div className="pointer-events-none absolute inset-3">
                    {overlayElements.map((elDef) => {
                      const mapped = {
                        left: elDef.x,
                        top: elDef.y,
                        width: elDef.w,
                        height: elDef.h,
                        rot: Number(elDef.rotation) || 0,
                      };
                      const left = `${(mapped.left / NIIMBOT_LABEL_W_PX) * 100}%`;
                      const top = `${(mapped.top / NIIMBOT_LABEL_H_PX) * 100}%`;
                      const width = `${(mapped.width / NIIMBOT_LABEL_W_PX) * 100}%`;
                      const height = `${(mapped.height / NIIMBOT_LABEL_H_PX) * 100}%`;
                      const active = selectedId === elDef.id;
                      const rot = mapped.rot;
                      return (
                        <button
                          key={elDef.id}
                          type="button"
                          className={`pointer-events-auto absolute touch-none rounded-sm border-2 ${
                            active
                              ? 'border-sky-500 bg-sky-400/15 shadow-[0_0_0_1px_rgba(14,165,233,0.5)]'
                              : 'border-transparent hover:border-sky-300/80 hover:bg-sky-300/10'
                          }`}
                          style={{
                            left,
                            top,
                            width,
                            height,
                            cursor: 'move',
                            transform: rot ? `rotate(${rot}deg)` : undefined,
                            transformOrigin: 'center center',
                          }}
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

              <div className="space-y-2">
                <button
                  type="button"
                  disabled={printBusy || !previewUrl || building}
                  onClick={() => void handlePrintTest()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {printBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4" />
                  )}
                  {printBusy ? 'Imprimindo teste…' : 'Imprimir etiqueta teste'}
                </button>
                {printMsg ? (
                  <p
                    className={`rounded-xl px-3 py-2 text-[12px] ${
                      printMsg.includes('enviada')
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                        : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
                    }`}
                  >
                    {printMsg}
                  </p>
                ) : null}
              </div>

              {/* Lista de elementos / resumo peças ou chave SVG */}
              {isChaveSvg ? (
                <div className="space-y-1.5 rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-white/[0.04]">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    SVG-base fixo
                  </p>
                  <p className="text-[12px] leading-snug text-zinc-600 dark:text-zinc-300">
                    Template versionado em assets/labels/etiqueta_chaves_BASE_50x30.svg. A prévia
                    usa o mesmo arquivo preenchido com dados de exemplo.
                  </p>
                </div>
              ) : isPecasOs ? (
                <div className="space-y-1.5 rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-white/[0.04]">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    Editor completo
                  </p>
                  <p className="text-[12px] leading-snug text-zinc-600 dark:text-zinc-300">
                    Ajuste faixa, tipografia e ícones no painel à direita. O preview atualiza na hora.
                  </p>
                </div>
              ) : (
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
              )}
            </div>

            {/* Painel de propriedades */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 custom-scrollbar sm:px-6">
              {isChaveSvg ? (
                <div className="space-y-3 rounded-2xl border-0 bg-zinc-50 p-3.5 dark:bg-white/[0.03] sm:p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                    Etiqueta de chaves (SVG fixo)
                  </p>
                  <p className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-200">
                    A arte (faixas, separadores e moldura da placa) vem do arquivo SVG-base. Na
                    impressão, o sistema preenche modelo, cor, cliente (com prefixo “Cliente: ”) e
                    placa nas duas faces, com textos a −90°, e rasteriza em 384×240 para a Niimbot.
                  </p>
                  <p className="text-[12px] text-zinc-500">
                    Arquivo: assets/labels/etiqueta_chaves_BASE_50x30.svg
                  </p>
                </div>
              ) : isPecasOs ? (
                <>
                  <div className="space-y-3 rounded-2xl border-0 bg-zinc-50 p-3.5 dark:bg-white/[0.03] sm:p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      Faixa preta (esquerda)
                    </p>
                    <Stepper
                      label="Largura da faixa"
                      value={pecasOpts.sidebarWidth}
                      display={`${pecasOpts.sidebarWidth} px`}
                      onDec={() => patchPecasOptions({ sidebarWidth: pecasOpts.sidebarWidth - 2 })}
                      onInc={() => patchPecasOptions({ sidebarWidth: pecasOpts.sidebarWidth + 2 })}
                    />
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                        Texto da faixa
                      </span>
                      <input
                        type="text"
                        value={pecasOpts.sidebarText}
                        maxLength={12}
                        onChange={(e) => patchPecasOptions({ sidebarText: e.target.value })}
                        className="w-full rounded-xl border-0 bg-white px-3 py-2.5 text-[14px] font-semibold text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100"
                      />
                    </label>
                    <Stepper
                      label="Tamanho do texto da faixa"
                      value={pecasOpts.sidebarTextSize}
                      display={`${pecasOpts.sidebarTextSize} px`}
                      onDec={() =>
                        patchPecasOptions({ sidebarTextSize: pecasOpts.sidebarTextSize - 1 })
                      }
                      onInc={() =>
                        patchPecasOptions({ sidebarTextSize: pecasOpts.sidebarTextSize + 1 })
                      }
                    />
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                        Ícone da faixa
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {LABEL_PECAS_SIDEBAR_ICONS.map((opt) => {
                          const active = pecasOpts.sidebarIcon === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() =>
                                patchPecasOptions({
                                  sidebarIcon: opt.value as LabelPecasSidebarIcon,
                                })
                              }
                              className={`rounded-xl px-2.5 py-2 text-left text-[12px] font-semibold transition ${
                                active
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-white text-zinc-800 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <Stepper
                      label="Tamanho do ícone da faixa"
                      value={pecasOpts.sidebarIconSize}
                      display={`${pecasOpts.sidebarIconSize} px`}
                      onDec={() =>
                        patchPecasOptions({ sidebarIconSize: pecasOpts.sidebarIconSize - 2 })
                      }
                      onInc={() =>
                        patchPecasOptions({ sidebarIconSize: pecasOpts.sidebarIconSize + 2 })
                      }
                    />
                    <label className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 dark:bg-zinc-900">
                      <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-200">
                        Barra branca sob o texto
                      </span>
                      <input
                        type="checkbox"
                        checked={pecasOpts.showSidebarBar}
                        onChange={(e) =>
                          patchPecasOptions({ showSidebarBar: e.target.checked })
                        }
                        className="h-4 w-4 accent-emerald-600"
                      />
                    </label>
                  </div>

                  <div className="space-y-3 rounded-2xl border-0 bg-zinc-50 p-3.5 dark:bg-white/[0.03] sm:p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      Tipografia dos campos
                    </p>
                    <Stepper
                      label="Nome do veículo"
                      value={layout.elements.find((e) => e.id === 'vehicle')?.valueFontSize ?? 46}
                      display={`${layout.elements.find((e) => e.id === 'vehicle')?.valueFontSize ?? 46} px`}
                      onDec={() =>
                        patchPecasField('vehicle', {
                          valueFontSize:
                            (layout.elements.find((e) => e.id === 'vehicle')?.valueFontSize ??
                              46) - 1,
                        })
                      }
                      onInc={() =>
                        patchPecasField('vehicle', {
                          valueFontSize:
                            (layout.elements.find((e) => e.id === 'vehicle')?.valueFontSize ??
                              46) + 1,
                        })
                      }
                    />
                    <Stepper
                      label="Detalhe / ano (linha auxiliar)"
                      value={layout.elements.find((e) => e.id === 'vehicle')?.fontSize ?? 15}
                      display={`${layout.elements.find((e) => e.id === 'vehicle')?.fontSize ?? 15} px`}
                      onDec={() =>
                        patchPecasField('vehicle', {
                          fontSize:
                            (layout.elements.find((e) => e.id === 'vehicle')?.fontSize ?? 15) -
                            1,
                        })
                      }
                      onInc={() =>
                        patchPecasField('vehicle', {
                          fontSize:
                            (layout.elements.find((e) => e.id === 'vehicle')?.fontSize ?? 15) +
                            1,
                        })
                      }
                    />
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                        Texto do título PLACA
                      </span>
                      <input
                        type="text"
                        value={layout.elements.find((e) => e.id === 'plate')?.labelText ?? ''}
                        onChange={(e) =>
                          patchPecasField('plate', { labelText: e.target.value })
                        }
                        className="w-full rounded-xl border-0 bg-white px-3 py-2.5 text-[14px] font-medium text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100"
                      />
                    </label>
                    <Stepper
                      label="Tamanho do título PLACA"
                      value={layout.elements.find((e) => e.id === 'plate')?.fontSize ?? 10}
                      display={`${layout.elements.find((e) => e.id === 'plate')?.fontSize ?? 10} px`}
                      onDec={() =>
                        patchPecasField('plate', {
                          fontSize:
                            (layout.elements.find((e) => e.id === 'plate')?.fontSize ?? 10) - 1,
                        })
                      }
                      onInc={() =>
                        patchPecasField('plate', {
                          fontSize:
                            (layout.elements.find((e) => e.id === 'plate')?.fontSize ?? 10) + 1,
                        })
                      }
                    />
                    <Stepper
                      label="Texto da placa"
                      value={layout.elements.find((e) => e.id === 'plate')?.valueFontSize ?? 18}
                      display={`${layout.elements.find((e) => e.id === 'plate')?.valueFontSize ?? 18} px`}
                      onDec={() =>
                        patchPecasField('plate', {
                          valueFontSize:
                            (layout.elements.find((e) => e.id === 'plate')?.valueFontSize ??
                              18) - 1,
                        })
                      }
                      onInc={() =>
                        patchPecasField('plate', {
                          valueFontSize:
                            (layout.elements.find((e) => e.id === 'plate')?.valueFontSize ??
                              18) + 1,
                        })
                      }
                    />
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                        Texto do título COR
                      </span>
                      <input
                        type="text"
                        value={layout.elements.find((e) => e.id === 'color')?.labelText ?? ''}
                        onChange={(e) =>
                          patchPecasField('color', { labelText: e.target.value })
                        }
                        className="w-full rounded-xl border-0 bg-white px-3 py-2.5 text-[14px] font-medium text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100"
                      />
                    </label>
                    <Stepper
                      label="Tamanho do título COR"
                      value={layout.elements.find((e) => e.id === 'color')?.fontSize ?? 10}
                      display={`${layout.elements.find((e) => e.id === 'color')?.fontSize ?? 10} px`}
                      onDec={() =>
                        patchPecasField('color', {
                          fontSize:
                            (layout.elements.find((e) => e.id === 'color')?.fontSize ?? 10) - 1,
                        })
                      }
                      onInc={() =>
                        patchPecasField('color', {
                          fontSize:
                            (layout.elements.find((e) => e.id === 'color')?.fontSize ?? 10) + 1,
                        })
                      }
                    />
                    <Stepper
                      label="Texto da cor"
                      value={layout.elements.find((e) => e.id === 'color')?.valueFontSize ?? 18}
                      display={`${layout.elements.find((e) => e.id === 'color')?.valueFontSize ?? 18} px`}
                      onDec={() =>
                        patchPecasField('color', {
                          valueFontSize:
                            (layout.elements.find((e) => e.id === 'color')?.valueFontSize ??
                              18) - 1,
                        })
                      }
                      onInc={() =>
                        patchPecasField('color', {
                          valueFontSize:
                            (layout.elements.find((e) => e.id === 'color')?.valueFontSize ??
                              18) + 1,
                        })
                      }
                    />
                    <label className="block space-y-1.5">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                        Texto do título CLIENTE
                      </span>
                      <input
                        type="text"
                        value={layout.elements.find((e) => e.id === 'customer')?.labelText ?? ''}
                        onChange={(e) =>
                          patchPecasField('customer', { labelText: e.target.value })
                        }
                        className="w-full rounded-xl border-0 bg-white px-3 py-2.5 text-[14px] font-medium text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100"
                      />
                    </label>
                    <Stepper
                      label="Tamanho do título CLIENTE"
                      value={layout.elements.find((e) => e.id === 'customer')?.fontSize ?? 15}
                      display={`${layout.elements.find((e) => e.id === 'customer')?.fontSize ?? 15} px`}
                      onDec={() =>
                        patchPecasField('customer', {
                          fontSize:
                            (layout.elements.find((e) => e.id === 'customer')?.fontSize ?? 15) -
                            1,
                        })
                      }
                      onInc={() =>
                        patchPecasField('customer', {
                          fontSize:
                            (layout.elements.find((e) => e.id === 'customer')?.fontSize ?? 15) +
                            1,
                        })
                      }
                    />
                    <Stepper
                      label="Nome do cliente"
                      value={
                        layout.elements.find((e) => e.id === 'customer')?.valueFontSize ?? 15
                      }
                      display={`${layout.elements.find((e) => e.id === 'customer')?.valueFontSize ?? 15} px`}
                      onDec={() =>
                        patchPecasField('customer', {
                          valueFontSize:
                            (layout.elements.find((e) => e.id === 'customer')?.valueFontSize ??
                              15) - 1,
                        })
                      }
                      onInc={() =>
                        patchPecasField('customer', {
                          valueFontSize:
                            (layout.elements.find((e) => e.id === 'customer')?.valueFontSize ??
                              15) + 1,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-3 rounded-2xl border-0 bg-zinc-50 p-3.5 dark:bg-white/[0.03] sm:p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      Ícones dos campos
                    </p>
                    <Stepper
                      label="Tamanho dos ícones"
                      value={pecasOpts.fieldIconSize}
                      display={`${pecasOpts.fieldIconSize} px`}
                      onDec={() =>
                        patchPecasOptions({ fieldIconSize: pecasOpts.fieldIconSize - 1 })
                      }
                      onInc={() =>
                        patchPecasOptions({ fieldIconSize: pecasOpts.fieldIconSize + 1 })
                      }
                    />
                    <label className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 dark:bg-zinc-900">
                      <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-200">
                        Ícone da placa
                      </span>
                      <input
                        type="checkbox"
                        checked={pecasOpts.showPlateIcon}
                        onChange={(e) =>
                          patchPecasOptions({ showPlateIcon: e.target.checked })
                        }
                        className="h-4 w-4 accent-emerald-600"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 dark:bg-zinc-900">
                      <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-200">
                        Ícone da cor
                      </span>
                      <input
                        type="checkbox"
                        checked={pecasOpts.showColorIcon}
                        onChange={(e) =>
                          patchPecasOptions({ showColorIcon: e.target.checked })
                        }
                        className="h-4 w-4 accent-emerald-600"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 dark:bg-zinc-900">
                      <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-200">
                        Ícone do cliente
                      </span>
                      <input
                        type="checkbox"
                        checked={pecasOpts.showCustomerIcon}
                        onChange={(e) =>
                          patchPecasOptions({ showCustomerIcon: e.target.checked })
                        }
                        className="h-4 w-4 accent-emerald-600"
                      />
                    </label>
                  </div>
                </>
              ) : !selected ? (
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

                    {selected.kind !== 'qr' &&
                    selected.kind !== 'barcode' &&
                    !(hasPlateMercosul && selected.id === 'plate') ? (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                          Rótulo / prefixo
                        </span>
                        {hasPlateMercosul &&
                        (selected.id === 'customer' ||
                          selected.id === 'vehicle' ||
                          selected.id === 'color') ? (
                          <div className="flex flex-wrap gap-1.5">
                            {KEY_LABEL_ICON_PRESETS.map((preset) => {
                              const active =
                                (selected.labelText || '').trimStart().startsWith(preset.emoji);
                              return (
                                <button
                                  key={preset.emoji}
                                  type="button"
                                  onClick={() =>
                                    patchElement(selected.id, { labelText: preset.labelText })
                                  }
                                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
                                    active
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-white text-zinc-800 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800'
                                  }`}
                                  title={`Usar ícone ${preset.name}`}
                                >
                                  <span className="text-[16px] leading-none">{preset.emoji}</span>
                                  {preset.name}
                                </button>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => patchElement(selected.id, { labelText: '' })}
                              className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${
                                !(selected.labelText || '').trim()
                                  ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                  : 'bg-white text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300'
                              }`}
                            >
                              Sem ícone
                            </button>
                          </div>
                        ) : null}
                        <input
                          type="text"
                          value={selected.labelText}
                          onChange={(e) =>
                            patchElement(selected.id, { labelText: e.target.value })
                          }
                          placeholder={
                            hasPlateMercosul
                              ? 'Ex.: 👤  ou Cliente:'
                              : 'Ex.: Cliente: ou OFICINA'
                          }
                          className="w-full rounded-xl border-0 bg-white px-3 py-2.5 text-[14px] font-medium text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100"
                        />
                        <p className="text-[11px] text-zinc-500">
                          {hasPlateMercosul
                            ? 'Ícones 👤 🚗 🎨 são desenhados em P&B para a Niimbot. Deixe vazio para só o valor.'
                            : 'Deixe vazio para imprimir só o valor (sem legenda).'}
                        </p>
                      </div>
                    ) : null}

                    {hasPlateMercosul && selected.id === 'plate' ? (
                      <p className="rounded-xl bg-white px-3 py-2 text-[11px] text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                        A placa não usa o título &quot;Placa:&quot; — só o número (Mercosul ou
                        texto tradicional).
                      </p>
                    ) : null}

                    {!(hasPlateMercosul && selected.id === 'plate' && layout.keyOptions?.mercosulPlate !== false) ? (
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
                    ) : null}

                    {!(hasPlateMercosul && selected.id === 'plate') ? (
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
                    ) : null}

                    {(selected.kind === 'banner' ||
                      selected.kind === 'text_field' ||
                      selected.kind === 'text' ||
                      selected.kind === 'human_code') && (
                      <Stepper
                        label={
                          hasPlateMercosul && selected.id === 'plate'
                            ? 'Tamanho do texto da placa'
                            : 'Tamanho do valor'
                        }
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
                      label={
                        hasPlateMercosul && selected.id === 'plate'
                          ? 'Largura da placa'
                          : 'Largura'
                      }
                      value={selected.w}
                      display={`${selected.w} px`}
                      onDec={() => patchElement(selected.id, { w: Math.max(24, selected.w - 2) })}
                      onInc={() => patchElement(selected.id, { w: selected.w + 2 })}
                    />
                    <Stepper
                      label={
                        hasPlateMercosul && selected.id === 'plate'
                          ? 'Altura da placa'
                          : 'Altura'
                      }
                      value={selected.h}
                      display={`${selected.h} px`}
                      onDec={() => patchElement(selected.id, { h: Math.max(14, selected.h - 2) })}
                      onInc={() => patchElement(selected.id, { h: selected.h + 2 })}
                    />
                  </div>

                  <div className="space-y-3 rounded-2xl border-0 bg-zinc-50 p-3.5 dark:bg-white/[0.03] sm:p-4">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      <Droplets className="h-3.5 w-3.5" />
                      Marca d&apos;água e rotação
                    </div>

                    <label className="block space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium text-zinc-600 dark:text-zinc-300">
                          Opacidade
                        </span>
                        <span className="tabular-nums text-[12px] font-semibold text-zinc-800 dark:text-zinc-100">
                          {selected.opacity ?? 100}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={100}
                        step={5}
                        value={selected.opacity ?? 100}
                        onChange={(e) =>
                          patchElement(selected.id, {
                            opacity: Math.max(5, Math.min(100, Number(e.target.value) || 100)),
                          })
                        }
                        className="w-full accent-emerald-600"
                        aria-label="Opacidade do elemento"
                      />
                      <p className="text-[11px] text-zinc-500">
                        Valores mais baixos deixam o elemento mais claro (marca d&apos;água na
                        impressão térmica).
                      </p>
                    </label>

                    <div className="flex flex-wrap gap-1.5">
                      {[100, 70, 45, 25].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => patchElement(selected.id, { opacity: pct })}
                          className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold ${
                            (selected.opacity ?? 100) === pct
                              ? 'bg-emerald-600 text-white'
                              : 'bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>

                    <Stepper
                      label="Rotação"
                      value={selected.rotation ?? 0}
                      display={`${selected.rotation ?? 0}°`}
                      onDec={() =>
                        patchElement(selected.id, {
                          rotation: (selected.rotation ?? 0) - 5,
                        })
                      }
                      onInc={() =>
                        patchElement(selected.id, {
                          rotation: (selected.rotation ?? 0) + 5,
                        })
                      }
                    />

                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { deg: -90, label: '-90°' },
                        { deg: -45, label: '-45°' },
                        { deg: 0, label: '0°' },
                        { deg: 45, label: '45°' },
                        { deg: 90, label: '90°' },
                        { deg: 180, label: '180°' },
                      ].map((opt) => (
                        <button
                          key={opt.deg}
                          type="button"
                          onClick={() => patchElement(selected.id, { rotation: opt.deg })}
                          className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold ${
                            (selected.rotation ?? 0) === opt.deg
                              ? 'bg-sky-600 text-white'
                              : 'bg-white text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          patchElement(selected.id, {
                            rotation: (selected.rotation ?? 0) - 90,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                        title="Girar −90°"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          patchElement(selected.id, {
                            rotation: (selected.rotation ?? 0) + 90,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                        title="Girar +90°"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {hasPlateMercosul && layout.keyOptions ? (
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
                  {activeId === 'chave' ? (
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
                  ) : null}
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
                  {activeId === 'chave' ? (
                    <>
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
                      {layout.keyOptions.dualCopy === false ? (
                        <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                          Espelhamento desligado: arraste textos e placa por toda a etiqueta.
                        </p>
                      ) : null}
                    </>
                  ) : null}
                  <label className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 dark:bg-zinc-900">
                    <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-200">
                      Placa Mercosul
                    </span>
                    <input
                      type="checkbox"
                      checked={layout.keyOptions.mercosulPlate !== false}
                      onChange={(e) =>
                        patchLayout({
                          keyOptions: {
                            ...layout.keyOptions!,
                            mercosulPlate: e.target.checked,
                          },
                        })
                      }
                      className="h-4 w-4 accent-emerald-600"
                    />
                  </label>
                  {layout.keyOptions.mercosulPlate === false ? (
                    <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                      Mercosul desligado: a placa aparece só como texto tradicional.
                    </p>
                  ) : null}
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
              onClick={handleClose}
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
