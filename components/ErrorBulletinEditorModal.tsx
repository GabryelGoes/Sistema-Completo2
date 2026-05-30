import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Car,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Save,
  Search,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react';
import { Lightbox } from './Lightbox';
import { PdfViewerModal } from './PdfViewerModal';
import { ModalPortal } from './ui/ModalPortal';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { desktopShellViewportOverlayClass } from '../utils/desktopShellOverlay';
import { TECHNICAL_BULLETINS_MODULE_LABEL } from '../constants/errorBulletinIcon';
import { StorageThumbImg } from './ui/StorageThumbImg';
import {
  addErrorBulletinLink,
  createErrorBulletin,
  deleteErrorBulletin,
  deleteErrorBulletinAttachment,
  getErrorBulletinById,
  getServiceOrders,
  updateErrorBulletin,
  uploadErrorBulletinAttachment,
  type ErrorBulletinAttachment,
  type ErrorBulletinDetail,
  type ErrorBulletinStatus,
  type ServiceOrderListItem,
} from '../services/apiService';
import { CANCELLED_STATUS } from '../constants/serviceOrderStages';
import {
  filterOrders,
  formatOrderPickLabel,
  sortOrdersByRecent,
  type VehiclePickMode,
} from '../utils/vehicleOrderPicker';
import { compressImageForUpload } from '../utils/imageUpload';
import { isAttachmentImage, isAttachmentPdf } from '../utils/attachmentPreviewHelpers';

const inputClass =
  'w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-[14px] text-zinc-900 outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-white/[0.12] dark:bg-zinc-950 dark:text-white';
const labelClass = 'mb-1 block text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400';

type Props = {
  open: boolean;
  bulletinId: string | null;
  authorName?: string;
  authorUserId?: string | null;
  onClose: () => void;
  /** `savedId` informado após criar um boletim novo. */
  onSaved: (savedId?: string) => void;
};

type PendingFile = {
  localId: string;
  file: File;
  previewUrl: string | null;
  name: string;
};

type PendingLink = {
  localId: string;
  name: string;
  url: string;
};

function newLocalId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseDtcLines(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export const ErrorBulletinEditorModal: React.FC<Props> = ({
  open,
  bulletinId,
  authorName = '',
  authorUserId = null,
  onClose,
  onSaved,
}) => {
  const isDesktopShell = useDesktopShellLayout();
  const isEdit = !!bulletinId;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ErrorBulletinAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [pendingLinks, setPendingLinks] = useState<PendingLink[]>([]);

  const [title, setTitle] = useState('');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [plate, setPlate] = useState('');
  const [engineInfo, setEngineInfo] = useState('');
  const [dtcCodes, setDtcCodes] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [possibleCauses, setPossibleCauses] = useState('');
  const [probableCauses, setProbableCauses] = useState('');
  const [solution, setSolution] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ErrorBulletinStatus>('published');
  const [tagsRaw, setTagsRaw] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [previewImages, setPreviewImages] = useState<{ urls: string[]; currentIndex: number } | null>(null);
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);

  const { imageAttachments, pdfAttachments, otherAttachments } = useMemo(() => {
    const images: ErrorBulletinAttachment[] = [];
    const pdfs: ErrorBulletinAttachment[] = [];
    const others: ErrorBulletinAttachment[] = [];
    for (const att of attachments) {
      if (isAttachmentImage(att)) images.push(att);
      else if (isAttachmentPdf(att)) pdfs.push(att);
      else others.push(att);
    }
    return { imageAttachments: images, pdfAttachments: pdfs, otherAttachments: others };
  }, [attachments]);

  const pendingImageFiles = useMemo(
    () => pendingFiles.filter((p) => p.file.type.startsWith('image/')),
    [pendingFiles]
  );
  const pendingPdfFiles = useMemo(
    () => pendingFiles.filter((p) => p.file.type === 'application/pdf' || /\.pdf$/i.test(p.name)),
    [pendingFiles]
  );
  const pendingOtherFiles = useMemo(
    () =>
      pendingFiles.filter(
        (p) => !p.file.type.startsWith('image/') && p.file.type !== 'application/pdf' && !/\.pdf$/i.test(p.name)
      ),
    [pendingFiles]
  );

  const revokePendingPreviews = useCallback((files: PendingFile[]) => {
    for (const item of files) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
  }, []);

  const [vehiclePickMode, setVehiclePickMode] = useState<VehiclePickMode>('manual');
  const [patioOrders, setPatioOrders] = useState<ServiceOrderListItem[]>([]);
  const [archivedOrders, setArchivedOrders] = useState<ServiceOrderListItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const applyDetail = (d: ErrorBulletinDetail) => {
    setTitle(d.title);
    setVehicleBrand(d.vehicleBrand);
    setVehicleModel(d.vehicleModel);
    setVehicleYear(d.vehicleYear);
    setPlate(d.plate);
    setEngineInfo(d.engineInfo);
    setDtcCodes(d.dtcCodes);
    setSymptoms(d.symptoms);
    setPossibleCauses(d.possibleCauses);
    setProbableCauses(d.probableCauses);
    setSolution(d.solution);
    setNotes(d.notes);
    setStatus(d.status);
    setTagsRaw((d.tags ?? []).join(', '));
    setAttachments(d.attachments ?? []);
  };

  const resetForm = useCallback(() => {
    setPendingFiles((prev) => {
      revokePendingPreviews(prev);
      return [];
    });
    setTitle('');
    setVehicleBrand('');
    setVehicleModel('');
    setVehicleYear('');
    setPlate('');
    setEngineInfo('');
    setDtcCodes('');
    setSymptoms('');
    setPossibleCauses('');
    setProbableCauses('');
    setSolution('');
    setNotes('');
    setStatus('published');
    setTagsRaw('');
    setAttachments([]);
    setPendingLinks([]);
    setLinkName('');
    setLinkUrl('');
    setVehiclePickMode('manual');
    setPatioOrders([]);
    setArchivedOrders([]);
    setVehicleSearch('');
    setSelectedOrderId(null);
    setError(null);
  }, [revokePendingPreviews]);

  const applyOrderToForm = useCallback((o: ServiceOrderListItem) => {
    setVehicleBrand((o.vehicle_brand ?? '').trim());
    setVehicleModel((o.vehicle_model ?? '').trim());
    setVehicleYear((o.vehicle_year ?? '').trim());
    setPlate((o.plate ?? '').trim().toUpperCase());
    setEngineInfo((o.vehicle_engine_info ?? '').trim());
    setSelectedOrderId(o.id);
  }, []);

  useEffect(() => {
    if (open) return;
    setPendingFiles((prev) => {
      revokePendingPreviews(prev);
      return [];
    });
    setPendingLinks([]);
  }, [open, revokePendingPreviews]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setOrdersLoading(true);
    void (async () => {
      try {
        const [activeAll, archived] = await Promise.all([
          getServiceOrders(undefined, 'vehicle'),
          getServiceOrders(CANCELLED_STATUS, 'vehicle'),
        ]);
        if (cancelled) return;
        const patio = sortOrdersByRecent(
          activeAll.filter((o) => o.status !== CANCELLED_STATUS && (o.order_type ?? 'vehicle') === 'vehicle')
        );
        setPatioOrders(patio);
        setArchivedOrders(sortOrdersByRecent(archived));
      } catch {
        if (!cancelled) {
          setPatioOrders([]);
          setArchivedOrders([]);
        }
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const pickerOrders = vehiclePickMode === 'archived' ? archivedOrders : patioOrders;
  const filteredPickerOrders = useMemo(
    () => filterOrders(pickerOrders, vehicleSearch),
    [pickerOrders, vehicleSearch]
  );

  useEffect(() => {
    if (!open) return;
    if (!bulletinId) {
      resetForm();
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getErrorBulletinById(bulletinId)
      .then((d) => {
        if (!cancelled) applyDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, bulletinId]);

  const buildPayload = () => ({
    title: title.trim() || `${vehicleBrand} ${vehicleModel}`.trim() || 'Boletim sem título',
    vehicleBrand: vehicleBrand.trim(),
    vehicleModel: vehicleModel.trim(),
    vehicleYear: vehicleYear.trim(),
    plate: plate.trim(),
    engineInfo: engineInfo.trim(),
    dtcCodes: parseDtcLines(dtcCodes).join('\n'),
    symptoms: symptoms.trim(),
    possibleCauses: possibleCauses.trim(),
    probableCauses: probableCauses.trim(),
    solution: solution.trim(),
    notes: notes.trim(),
    status,
    tags: tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      let savedId = bulletinId ?? undefined;
      if (isEdit && bulletinId) {
        await updateErrorBulletin(bulletinId, buildPayload());
      } else {
        const created = await createErrorBulletin({
          ...buildPayload(),
          createdByName: authorName,
          createdByUserId: authorUserId,
        });
        savedId = created.id;
        for (const pending of pendingFiles) {
          const att = await uploadErrorBulletinAttachment(savedId, pending.file);
          setAttachments((prev) => [...prev, att]);
        }
        for (const pending of pendingLinks) {
          const att = await addErrorBulletinLink(savedId, {
            name: pending.name,
            url: pending.url,
          });
          setAttachments((prev) => [...prev, att]);
        }
        setPendingFiles((prev) => {
          revokePendingPreviews(prev);
          return [];
        });
        setPendingLinks([]);
      }
      onSaved(savedId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!bulletinId) return;
    if (!window.confirm('Excluir este boletim permanentemente?')) return;
    setSaving(true);
    try {
      await deleteErrorBulletin(bulletinId);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir.');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setSaving(true);
      setError(null);
      try {
        for (const file of Array.from(files)) {
          const toSend = file.type.startsWith('image/') ? await compressImageForUpload(file) : file;
          if (bulletinId) {
            const att = await uploadErrorBulletinAttachment(bulletinId, toSend);
            setAttachments((prev) => [...prev, att]);
          } else {
            const previewUrl = toSend.type.startsWith('image/') ? URL.createObjectURL(toSend) : null;
            setPendingFiles((prev) => [
              ...prev,
              {
                localId: newLocalId(),
                file: toSend,
                previewUrl,
                name: toSend.name,
              },
            ]);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha no upload.');
      } finally {
        setSaving(false);
      }
    },
    [bulletinId]
  );

  const handleAddLink = async () => {
    if (!linkUrl.trim()) return;
    const payload = { name: linkName.trim() || 'Link', url: linkUrl.trim() };
    if (bulletinId) {
      setSaving(true);
      try {
        const att = await addErrorBulletinLink(bulletinId, payload);
        setAttachments((prev) => [...prev, att]);
        setLinkName('');
        setLinkUrl('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha ao adicionar link.');
      } finally {
        setSaving(false);
      }
      return;
    }
    setPendingLinks((prev) => [...prev, { localId: newLocalId(), ...payload }]);
    setLinkName('');
    setLinkUrl('');
  };

  const handleRemovePendingFile = (localId: string) => {
    setPendingFiles((prev) => {
      const target = prev.find((p) => p.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.localId !== localId);
    });
  };

  const handleRemovePendingLink = (localId: string) => {
    setPendingLinks((prev) => prev.filter((p) => p.localId !== localId));
  };

  const handleRemoveAttachment = async (att: ErrorBulletinAttachment) => {
    if (!bulletinId) return;
    try {
      await deleteErrorBulletinAttachment(bulletinId, att.id);
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao remover anexo.');
    }
  };

  if (!open) return null;

  const dtcPreview = parseDtcLines(dtcCodes);

  return (
    <ModalPortal>
      <div
        className={
          isDesktopShell
            ? `${desktopShellViewportOverlayClass(true, 'z-[280]')} flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm`
            : 'fixed inset-0 z-[280] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4'
        }
      >
        <div
          className={
            isDesktopShell
              ? 'flex h-[min(96%,960px)] w-full max-w-6xl flex-col overflow-hidden rounded-[22px] border border-zinc-200/90 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-zinc-900'
              : 'flex max-h-[min(96vh,920px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-[22px] border border-zinc-200/90 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-zinc-900 sm:rounded-[22px]'
          }
          role="dialog"
          aria-modal="true"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-amber-500 px-5 py-4 dark:border-white/[0.08]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-100">
                {TECHNICAL_BULLETINS_MODULE_LABEL}
              </p>
              <h2 className="text-lg font-bold text-white">
                {isEdit ? 'Editar registro' : 'Novo registro'}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-white/20 p-2 text-white transition hover:bg-white/30"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className={`min-h-0 flex-1 overflow-y-auto space-y-5 ${isDesktopShell ? 'p-6 lg:p-8' : 'p-5'}`}>
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-16 text-zinc-500">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                <p>Carregando boletim…</p>
              </div>
            ) : (
              <>
                {error ? (
                  <p className="rounded-xl bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-300">
                    {error}
                  </p>
                ) : null}

                <div className={`grid gap-4 sm:grid-cols-2 ${isDesktopShell ? 'lg:grid-cols-3' : ''}`}>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelClass}>Título do registro</label>
                    <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Falha ABS — Corolla 2018" />
                  </div>

                  <div className="sm:col-span-2 lg:col-span-3 rounded-2xl border border-zinc-200/90 bg-zinc-50/80 p-4 dark:border-white/[0.1] dark:bg-zinc-950/50">
                    <p className={labelClass}>Veículo</p>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {(
                        [
                          { id: 'manual' as const, label: 'Digitar manualmente' },
                          { id: 'patio' as const, label: 'No pátio', icon: Car },
                          { id: 'archived' as const, label: 'Arquivados', icon: Archive },
                        ] as const
                      ).map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setVehiclePickMode(id);
                            setVehicleSearch('');
                            if (id === 'manual') setSelectedOrderId(null);
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
                            vehiclePickMode === id
                              ? 'bg-amber-500 text-white shadow-sm'
                              : 'bg-white text-zinc-700 ring-1 ring-zinc-200/90 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-white/[0.12] dark:hover:bg-zinc-800'
                          }`}
                        >
                          {Icon ? <Icon className="h-4 w-4 shrink-0" strokeWidth={2} /> : null}
                          {label}
                        </button>
                      ))}
                    </div>

                    {vehiclePickMode !== 'manual' ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                          <input
                            className={`${inputClass} pl-9`}
                            value={vehicleSearch}
                            onChange={(e) => setVehicleSearch(e.target.value)}
                            placeholder={
                              vehiclePickMode === 'patio'
                                ? 'Buscar placa, modelo, cliente ou OS…'
                                : 'Buscar veículo arquivado…'
                            }
                          />
                        </div>
                        {ordersLoading ? (
                          <div className="flex items-center gap-2 py-6 text-[13px] text-zinc-500">
                            <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                            Carregando veículos…
                          </div>
                        ) : filteredPickerOrders.length === 0 ? (
                          <p className="py-4 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
                            {vehiclePickMode === 'patio'
                              ? 'Nenhum veículo no pátio.'
                              : 'Nenhum veículo arquivado encontrado.'}
                          </p>
                        ) : (
                          <ul className="max-h-44 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-zinc-200/80 bg-white p-1 dark:border-white/[0.08] dark:bg-zinc-950">
                            {filteredPickerOrders.map((o) => {
                              const selected = selectedOrderId === o.id;
                              return (
                                <li key={o.id}>
                                  <button
                                    type="button"
                                    onClick={() => applyOrderToForm(o)}
                                    className={`w-full rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors ${
                                      selected
                                        ? 'bg-amber-500/15 font-semibold text-amber-900 ring-1 ring-amber-500/40 dark:text-amber-100'
                                        : 'text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06]'
                                    }`}
                                  >
                                    {formatOrderPickLabel(o)}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {selectedOrderId ? (
                          <p className="text-[12px] text-emerald-700 dark:text-emerald-400">
                            Veículo selecionado — os campos abaixo foram preenchidos e podem ser ajustados.
                          </p>
                        ) : (
                          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                            Toque em um veículo da lista para preencher marca, modelo, placa e motor.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <label className={labelClass}>Marca</label>
                    <input className={inputClass} value={vehicleBrand} onChange={(e) => setVehicleBrand(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Modelo</label>
                    <input className={inputClass} value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Ano</label>
                    <input className={inputClass} value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Placa</label>
                    <input className={inputClass} value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelClass}>Motor / sistema</label>
                    <input className={inputClass} value={engineInfo} onChange={(e) => setEngineInfo(e.target.value)} placeholder="Ex.: 2.0 flex, módulo ABS" />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelClass}>Status</label>
                    <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as ErrorBulletinStatus)}>
                      <option value="published">Publicado</option>
                      <option value="draft">Rascunho</option>
                      <option value="archived">Arquivado</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelClass}>Códigos DTC (scanner)</label>
                    <textarea
                      className={`${inputClass} min-h-[88px] font-mono text-[13px]`}
                      value={dtcCodes}
                      onChange={(e) => setDtcCodes(e.target.value)}
                      placeholder="Um código por linha: C1201, P0500…"
                    />
                    {dtcPreview.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {dtcPreview.map((code) => (
                          <span
                            key={code}
                            className="rounded-lg bg-amber-500 px-2 py-0.5 font-mono text-[12px] font-bold text-white"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelClass}>Sintomas / defeito</label>
                    <textarea className={`${inputClass} min-h-[100px]`} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelClass}>Diagnóstico</label>
                    <textarea
                      className={`${inputClass} min-h-[100px]`}
                      value={possibleCauses}
                      onChange={(e) => setPossibleCauses(e.target.value)}
                      placeholder="Ex.: falha intermitente no circuito do sensor ABS dianteiro esquerdo…"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelClass}>Solução aplicada</label>
                    <textarea className={`${inputClass} min-h-[100px]`} value={solution} onChange={(e) => setSolution(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelClass}>Possíveis causas</label>
                    <textarea
                      className={`${inputClass} min-h-[100px]`}
                      value={probableCauses}
                      onChange={(e) => setProbableCauses(e.target.value)}
                      placeholder="Ex.: sensor de roda com falha, chicote rompido, módulo com umidade…"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelClass}>Observações internas</label>
                    <textarea className={`${inputClass} min-h-[72px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelClass}>Tags (vírgula)</label>
                    <input className={inputClass} value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="ABS, Toyota, intermitente" />
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-white/[0.08] dark:bg-zinc-950/40">
                    <p className="mb-3 text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">
                      Anexos (fotos, documentos, links)
                    </p>
                    {!isEdit ? (
                      <p className="mb-3 text-[12px] text-zinc-500 dark:text-zinc-400">
                        Você pode adicionar arquivos agora; eles serão enviados ao salvar o boletim.
                      </p>
                    ) : null}
                    <div className="mb-3 flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-zinc-800 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-zinc-700">
                        <ImageIcon className="h-4 w-4" />
                        Enviar arquivo
                        <input
                          type="file"
                          multiple
                          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                          className="hidden"
                          onChange={(e) => void handleUploadFiles(e.target.files)}
                        />
                      </label>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      <input
                        className={`${inputClass} min-w-[120px] flex-1`}
                        placeholder="Nome do link"
                        value={linkName}
                        onChange={(e) => setLinkName(e.target.value)}
                      />
                      <input
                        className={`${inputClass} min-w-[160px] flex-[2]`}
                        placeholder="https://…"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => void handleAddLink()}
                        disabled={!linkUrl.trim() || saving}
                        className="inline-flex items-center gap-1 rounded-xl bg-sky-500 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                      >
                        <Link2 className="h-4 w-4" /> Link
                      </button>
                    </div>
                    {(imageAttachments.length > 0 || pendingImageFiles.length > 0) ? (
                      <div className="mb-4">
                        <div className="mb-2 flex items-center gap-2">
                          <ImageIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
                          <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                            Fotos
                          </p>
                        </div>
                        <div className="rounded-xl border border-zinc-200/70 bg-white/70 p-2.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                            {imageAttachments.map((att) => (
                              <div key={att.id} className="flex min-w-0 flex-col gap-1">
                                <div className="relative rounded-[14px] bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 p-[2px] shadow-[0_6px_16px_-8px_rgba(245,158,11,0.35)]">
                                  <div className="group relative aspect-square overflow-hidden rounded-[12px] bg-zinc-100 dark:bg-zinc-900">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPreviewImages({
                                          urls: imageAttachments.map((a) => a.url),
                                          currentIndex: imageAttachments.findIndex((a) => a.id === att.id),
                                        })
                                      }
                                      className="absolute inset-0 h-full w-full focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                                    >
                                      <StorageThumbImg
                                        src={att.url}
                                        alt={att.name}
                                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                        sizes="(max-width: 640px) 45vw, 180px"
                                        thumbMaxWidth={200}
                                        thumbMaxHeight={200}
                                        thumbQuality={50}
                                      />
                                      <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/50 via-transparent to-transparent pb-2 opacity-0 transition-opacity group-hover:opacity-100">
                                        <ZoomIn className="h-6 w-6 text-white drop-shadow-lg" />
                                      </div>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleRemoveAttachment(att)}
                                      className="absolute right-1.5 top-1.5 rounded-lg bg-black/50 p-1.5 text-white transition hover:bg-red-600"
                                      aria-label="Remover foto"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <span
                                  className="line-clamp-2 text-[10px] font-medium leading-tight text-zinc-600 dark:text-zinc-400 sm:text-[11px]"
                                  title={att.name}
                                >
                                  {att.name}
                                </span>
                              </div>
                            ))}
                            {pendingImageFiles.map((att) => (
                              <div key={att.localId} className="flex min-w-0 flex-col gap-1">
                                <div className="relative rounded-[14px] bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 p-[2px] shadow-[0_6px_16px_-8px_rgba(245,158,11,0.35)]">
                                  <div className="relative aspect-square overflow-hidden rounded-[12px] bg-zinc-100 dark:bg-zinc-900">
                                    {att.previewUrl ? (
                                      <img src={att.previewUrl} alt={att.name} className="h-full w-full object-cover" />
                                    ) : (
                                      <div className="flex h-full items-center justify-center text-zinc-400">
                                        <ImageIcon className="h-8 w-8" />
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleRemovePendingFile(att.localId)}
                                      className="absolute right-1.5 top-1.5 rounded-lg bg-black/50 p-1.5 text-white transition hover:bg-red-600"
                                      aria-label="Remover foto"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <span
                                  className="line-clamp-2 text-[10px] font-medium leading-tight text-zinc-600 dark:text-zinc-400 sm:text-[11px]"
                                  title={att.name}
                                >
                                  {att.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {(pdfAttachments.length > 0 || pendingPdfFiles.length > 0) ? (
                      <div className="mb-4">
                        <div className="mb-2 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
                          <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                            Documentos PDF
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {pdfAttachments.map((att) => (
                            <div
                              key={att.id}
                              className="relative flex min-w-[140px] max-w-[200px] flex-col rounded-xl border border-zinc-200/80 bg-white dark:border-white/[0.08] dark:bg-zinc-950/40"
                            >
                              <button
                                type="button"
                                onClick={() => setPreviewPdf(att.url)}
                                className="flex flex-col items-center gap-2 p-4 text-center transition hover:border-amber-400/40"
                              >
                                <FileText className="h-8 w-8 text-red-500" />
                                <span className="line-clamp-2 break-all text-xs font-medium text-zinc-700 dark:text-zinc-200">
                                  {att.name}
                                </span>
                                <span className="text-[10px] font-bold text-red-500">Toque para ver</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleRemoveAttachment(att)}
                                className="absolute right-1 top-1 rounded-lg bg-black/40 p-1 text-white hover:bg-red-600"
                                aria-label="Remover PDF"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          {pendingPdfFiles.map((att) => (
                            <div
                              key={att.localId}
                              className="relative flex min-w-[140px] max-w-[200px] flex-col rounded-xl border border-dashed border-amber-300/80 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-950/20"
                            >
                              <div className="flex flex-col items-center gap-2 p-4 text-center">
                                <FileText className="h-8 w-8 text-red-500" />
                                <span className="line-clamp-2 break-all text-xs font-medium text-zinc-700 dark:text-zinc-200">
                                  {att.name}
                                </span>
                                <span className="text-[10px] font-bold text-amber-700">Aguardando salvar</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemovePendingFile(att.localId)}
                                className="absolute right-1 top-1 rounded-lg bg-black/40 p-1 text-white hover:bg-red-600"
                                aria-label="Remover PDF"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {(otherAttachments.length > 0 || pendingOtherFiles.length > 0 || pendingLinks.length > 0) ? (
                      <ul className="space-y-2">
                        {otherAttachments.map((att) => (
                          <li
                            key={att.id}
                            className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200/80 bg-white px-3 py-2 dark:border-white/[0.08] dark:bg-zinc-900"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              {att.kind === 'link' ? (
                                <Link2 className="h-4 w-4 shrink-0 text-sky-600" />
                              ) : (
                                <FileText className="h-4 w-4 shrink-0 text-zinc-500" />
                              )}
                              <a
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-w-0 truncate text-[13px] font-medium text-sky-700 hover:underline dark:text-sky-300"
                              >
                                {att.name}
                              </a>
                              <a
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 p-1 text-zinc-500"
                                aria-label="Abrir em nova aba"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleRemoveAttachment(att)}
                              className="shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-500/10"
                              aria-label="Remover anexo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                        {pendingOtherFiles.map((att) => (
                          <li
                            key={att.localId}
                            className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-zinc-300/80 bg-white px-3 py-2 dark:border-white/[0.08] dark:bg-zinc-900"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <FileText className="h-4 w-4 shrink-0 text-zinc-500" />
                              <span className="min-w-0 truncate text-[13px] font-medium text-zinc-700 dark:text-zinc-200">
                                {att.name}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemovePendingFile(att.localId)}
                              className="shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-500/10"
                              aria-label="Remover anexo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                        {pendingLinks.map((att) => (
                          <li
                            key={att.localId}
                            className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-sky-300/80 bg-white px-3 py-2 dark:border-sky-500/30 dark:bg-zinc-900"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <Link2 className="h-4 w-4 shrink-0 text-sky-600" />
                              <span className="min-w-0 truncate text-[13px] font-medium text-sky-700 dark:text-sky-300">
                                {att.name}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemovePendingLink(att.localId)}
                              className="shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-500/10"
                              aria-label="Remover link"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {attachments.length === 0 &&
                    pendingFiles.length === 0 &&
                    pendingLinks.length === 0 ? (
                      <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Nenhum anexo ainda.</p>
                    ) : null}
                  </div>
              </>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 border-t border-zinc-200/80 bg-zinc-50/90 p-4 dark:border-white/[0.08] dark:bg-zinc-950/60">
            {isEdit ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={saving || loading}
                className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-500 px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Excluir
              </button>
            ) : null}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-zinc-200/90 px-4 py-2.5 text-[14px] font-semibold text-zinc-700 dark:border-white/[0.12] dark:text-zinc-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || loading}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-[14px] font-semibold text-white shadow-md disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </button>
          </div>
        </div>
      </div>
      {previewImages ? (
        <Lightbox
          images={previewImages.urls}
          initialIndex={previewImages.currentIndex}
          onClose={() => setPreviewImages(null)}
        />
      ) : null}
      {previewPdf ? <PdfViewerModal src={previewPdf} onClose={() => setPreviewPdf(null)} /> : null}
    </ModalPortal>
  );
};