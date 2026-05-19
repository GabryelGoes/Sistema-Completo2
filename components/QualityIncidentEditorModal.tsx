import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, Image as ImageIcon, Loader2, Save, Trash2, X, ZoomIn } from 'lucide-react';
import { Lightbox } from './Lightbox';
import { PdfViewerModal } from './PdfViewerModal';
import { ModalPortal } from './ui/ModalPortal';
import { StorageThumbImg } from './ui/StorageThumbImg';
import {
  addQualityIncidentLink,
  createQualityIncident,
  deleteQualityIncident,
  deleteQualityIncidentAttachment,
  getQualityIncidentById,
  updateQualityIncident,
  uploadQualityIncidentAttachment,
  type QualityIncidentAttachment,
  type QualityIncidentCategory,
  type QualityIncidentSeverity,
  type QualityIncidentStatus,
} from '../services/apiService';
import {
  getQualityRadarTechnicianOptions,
  qualityRadarTechnicianSelectValue,
  resolveQualityRadarTechnicianPayload,
  type QualityRadarTechnicianOption,
} from '../utils/qualityRadarTechnicians';
import {
  QUALITY_CATEGORIES,
  QUALITY_SEVERITIES,
  QUALITY_STATUSES,
} from '../constants/qualityRadar';
import { compressImageForUpload } from '../utils/imageUpload';
import { isAttachmentImage, isAttachmentPdf } from '../utils/attachmentPreviewHelpers';
import { VehicleOrderPickerSection } from './VehicleOrderPickerSection';
import {
  serviceOrderLabelFromOrder,
  vehicleSummaryFromOrder,
} from '../utils/vehicleOrderPicker';
import type { ServiceOrderListItem } from '../services/apiService';

const inputClass =
  'w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-[14px] text-zinc-900 outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-white/[0.12] dark:bg-zinc-950 dark:text-white';
const labelClass = 'mb-1 block text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400';

type Props = {
  open: boolean;
  incidentId: string | null;
  authorName?: string;
  authorUserId?: string | null;
  onClose: () => void;
  onSaved: () => void;
};

function toLocalDatetimeValue(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const QualityIncidentEditorModal: React.FC<Props> = ({
  open,
  incidentId,
  authorName = '',
  authorUserId = null,
  onClose,
  onSaved,
}) => {
  const isEdit = !!incidentId;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<QualityRadarTechnicianOption[]>([]);
  const [attachments, setAttachments] = useState<QualityIncidentAttachment[]>([]);

  const [technicianId, setTechnicianId] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<QualityIncidentCategory>('outro');
  const [severity, setSeverity] = useState<QualityIncidentSeverity>('media');
  const [status, setStatus] = useState<QualityIncidentStatus>('aberta');
  const [occurredAt, setOccurredAt] = useState('');
  const [description, setDescription] = useState('');
  const [impact, setImpact] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [preventiveAction, setPreventiveAction] = useState('');
  const [lessonLearned, setLessonLearned] = useState('');
  const [plate, setPlate] = useState('');
  const [vehicleSummary, setVehicleSummary] = useState('');
  const [serviceOrderLabel, setServiceOrderLabel] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [previewImages, setPreviewImages] = useState<{ urls: string[]; currentIndex: number } | null>(null);
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const { imageAttachments, pdfAttachments, otherAttachments } = useMemo(() => {
    const images: QualityIncidentAttachment[] = [];
    const pdfs: QualityIncidentAttachment[] = [];
    const others: QualityIncidentAttachment[] = [];
    for (const att of attachments) {
      if (isAttachmentImage(att)) images.push(att);
      else if (isAttachmentPdf(att)) pdfs.push(att);
      else others.push(att);
    }
    return { imageAttachments: images, pdfAttachments: pdfs, otherAttachments: others };
  }, [attachments]);

  useEffect(() => {
    if (!open) return;
    void getQualityRadarTechnicianOptions()
      .then(setTechnicians)
      .catch(() => setTechnicians([]));
  }, [open]);

  const resetForm = () => {
    setTechnicianId('');
    setTitle('');
    setCategory('outro');
    setSeverity('media');
    setStatus('aberta');
    setOccurredAt(toLocalDatetimeValue(new Date().toISOString()));
    setDescription('');
    setImpact('');
    setRootCause('');
    setCorrectiveAction('');
    setPreventiveAction('');
    setLessonLearned('');
    setPlate('');
    setVehicleSummary('');
    setServiceOrderLabel('');
    setTagsRaw('');
    setAttachments([]);
    setLinkName('');
    setLinkUrl('');
    setSelectedOrderId(null);
    setError(null);
  };

  const applyOrderToForm = useCallback((o: ServiceOrderListItem) => {
    setPlate((o.plate ?? '').trim().toUpperCase());
    setVehicleSummary(vehicleSummaryFromOrder(o));
    setServiceOrderLabel(serviceOrderLabelFromOrder(o));
    setSelectedOrderId(o.id);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!incidentId) {
      resetForm();
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getQualityIncidentById(incidentId)
      .then(async (d) => {
        if (cancelled) return;
        const opts = technicians.length ? technicians : await getQualityRadarTechnicianOptions();
        if (!cancelled && !technicians.length) setTechnicians(opts);
        setTechnicianId(qualityRadarTechnicianSelectValue(d.technicianId, d.technicianName, opts));
        setTitle(d.title);
        setCategory(d.category);
        setSeverity(d.severity);
        setStatus(d.status);
        setOccurredAt(toLocalDatetimeValue(d.occurredAt));
        setDescription(d.description);
        setImpact(d.impact);
        setRootCause(d.rootCause);
        setCorrectiveAction(d.correctiveAction);
        setPreventiveAction(d.preventiveAction);
        setLessonLearned(d.lessonLearned);
        setPlate(d.plate);
        setVehicleSummary(d.vehicleSummary);
        setServiceOrderLabel(d.serviceOrderLabel);
        setTagsRaw((d.tags ?? []).join(', '));
        setAttachments(d.attachments ?? []);
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
  }, [open, incidentId]);

  const buildPayload = () => {
    const { technicianId: wtId, technicianName } = resolveQualityRadarTechnicianPayload(
      technicianId,
      technicians
    );
    return {
    technicianId: wtId,
    technicianName,
    title: title.trim() || 'Ocorrência sem título',
    category,
    severity,
    status,
    occurredAt: occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString(),
    description: description.trim(),
    impact: impact.trim(),
    rootCause: rootCause.trim(),
    correctiveAction: correctiveAction.trim(),
    preventiveAction: preventiveAction.trim(),
    lessonLearned: lessonLearned.trim(),
    plate: plate.trim(),
    vehicleSummary: vehicleSummary.trim(),
    serviceOrderLabel: serviceOrderLabel.trim(),
    tags: tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    resolvedByName: status === 'resolvida' ? authorName : undefined,
  };
  };

  const handleSave = async () => {
    const { technicianName: techName } = resolveQualityRadarTechnicianPayload(technicianId, technicians);
    if (!technicianId || !techName) {
      setError('Selecione o mecânico responsável pela ocorrência.');
      return;
    }
    if (!description.trim()) {
      setError('Descreva o que aconteceu.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && incidentId) {
        await updateQualityIncident(incidentId, buildPayload());
      } else {
        await createQualityIncident({
          ...buildPayload(),
          registeredByName: authorName,
          registeredByUserId: authorUserId,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!incidentId) return;
    if (!window.confirm('Excluir esta ocorrência permanentemente?')) return;
    setSaving(true);
    try {
      await deleteQualityIncident(incidentId);
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
      if (!files?.length || !incidentId) return;
      setSaving(true);
      setError(null);
      try {
        for (const file of Array.from(files)) {
          const toSend = file.type.startsWith('image/') ? await compressImageForUpload(file) : file;
          const att = await uploadQualityIncidentAttachment(incidentId, toSend);
          setAttachments((prev) => [...prev, att]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha no upload.');
      } finally {
        setSaving(false);
      }
    },
    [incidentId]
  );

  const handleAddLink = async () => {
    if (!incidentId || !linkUrl.trim()) return;
    setSaving(true);
    try {
      const att = await addQualityIncidentLink(incidentId, {
        name: linkName.trim() || 'Link',
        url: linkUrl.trim(),
      });
      setAttachments((prev) => [...prev, att]);
      setLinkName('');
      setLinkUrl('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao adicionar link.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAttachment = async (att: QualityIncidentAttachment) => {
    if (!incidentId) return;
    try {
      await deleteQualityIncidentAttachment(incidentId, att.id);
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao remover anexo.');
    }
  };

  if (!open) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[280] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div
          className="flex max-h-[min(96vh,920px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-[22px] border border-zinc-200/90 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-zinc-900 sm:rounded-[22px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-rose-600 px-5 py-4 dark:border-white/[0.08]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-100">Radar de Qualidade</p>
              <h2 className="text-lg font-bold text-white">{isEdit ? 'Editar ocorrência' : 'Nova ocorrência'}</h2>
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

          <div className="min-h-0 flex-1 overflow-y-auto space-y-5 p-5">
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-16 text-zinc-500">
                <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
                <p>Carregando ocorrência…</p>
              </div>
            ) : (
              <>
                {error ? (
                  <p className="rounded-xl bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-300">{error}</p>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Mecânico *</label>
                    <select
                      className={inputClass}
                      value={technicianId}
                      onChange={(e) => setTechnicianId(e.target.value)}
                    >
                      <option value="">Selecione…</option>
                      {technicians.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Título resumido</label>
                    <input
                      className={inputClass}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex.: Retrabalho na pastilha dianteira"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Categoria</label>
                    <select
                      className={inputClass}
                      value={category}
                      onChange={(e) => setCategory(e.target.value as QualityIncidentCategory)}
                    >
                      {QUALITY_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Severidade</label>
                    <select
                      className={inputClass}
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value as QualityIncidentSeverity)}
                    >
                      {QUALITY_SEVERITIES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Status</label>
                    <select
                      className={inputClass}
                      value={status}
                      onChange={(e) => setStatus(e.target.value as QualityIncidentStatus)}
                    >
                      {QUALITY_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Data da ocorrência</label>
                    <input
                      type="datetime-local"
                      className={inputClass}
                      value={occurredAt}
                      onChange={(e) => setOccurredAt(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>O que aconteceu? *</label>
                    <textarea
                      className={`${inputClass} min-h-[88px]`}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Descreva o erro ou desvio com objetividade…"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Impacto (cliente, prazo, custo)</label>
                    <textarea
                      className={`${inputClass} min-h-[72px]`}
                      value={impact}
                      onChange={(e) => setImpact(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Causa provável</label>
                    <textarea
                      className={`${inputClass} min-h-[72px]`}
                      value={rootCause}
                      onChange={(e) => setRootCause(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Ação corretiva</label>
                    <textarea
                      className={`${inputClass} min-h-[72px]`}
                      value={correctiveAction}
                      onChange={(e) => setCorrectiveAction(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Ação preventiva</label>
                    <textarea
                      className={`${inputClass} min-h-[72px]`}
                      value={preventiveAction}
                      onChange={(e) => setPreventiveAction(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Lição aprendida</label>
                    <textarea
                      className={`${inputClass} min-h-[72px]`}
                      value={lessonLearned}
                      onChange={(e) => setLessonLearned(e.target.value)}
                    />
                  </div>
                  <VehicleOrderPickerSection
                    open={open}
                    accent="rose"
                    inputClass={inputClass}
                    labelClass={labelClass}
                    selectedOrderId={selectedOrderId}
                    onSelectOrder={applyOrderToForm}
                    onClearSelection={() => setSelectedOrderId(null)}
                  />
                  <div>
                    <label className={labelClass}>Placa</label>
                    <input className={inputClass} value={plate} onChange={(e) => setPlate(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Veículo / OS</label>
                    <input
                      className={inputClass}
                      value={vehicleSummary}
                      onChange={(e) => setVehicleSummary(e.target.value)}
                      placeholder="Ex.: HB20 1.0 — OS #1240"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Referência da OS (opcional)</label>
                    <input
                      className={inputClass}
                      value={serviceOrderLabel}
                      onChange={(e) => setServiceOrderLabel(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Tags (vírgula)</label>
                    <input className={inputClass} value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} />
                  </div>
                </div>

                {isEdit && incidentId ? (
                  <div className="rounded-2xl border border-zinc-200/80 p-4 dark:border-white/[0.08]">
                    <p className="mb-3 text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">Anexos</p>
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx"
                      className="mb-3 w-full text-[13px]"
                      onChange={(e) => void handleUploadFiles(e.target.files)}
                    />
                    <div className="mb-3 flex flex-wrap gap-2">
                      <input
                        className={`${inputClass} flex-1 min-w-[120px]`}
                        placeholder="Nome do link"
                        value={linkName}
                        onChange={(e) => setLinkName(e.target.value)}
                      />
                      <input
                        className={`${inputClass} flex-[2] min-w-[160px]`}
                        placeholder="https://…"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => void handleAddLink()}
                        className="rounded-xl bg-rose-600 px-4 py-2 text-[13px] font-semibold text-white"
                      >
                        Link
                      </button>
                    </div>
                    {imageAttachments.length > 0 ? (
                      <div className="mb-4">
                        <div className="mb-2 flex items-center gap-2">
                          <ImageIcon className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden />
                          <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                            Fotos
                          </p>
                        </div>
                        <div className="rounded-xl border border-zinc-200/70 bg-white/70 p-2.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                            {imageAttachments.map((att) => (
                              <div key={att.id} className="flex min-w-0 flex-col gap-1">
                                <div className="relative rounded-[14px] bg-gradient-to-r from-rose-500 via-rose-400 to-rose-600 p-[2px] shadow-[0_6px_16px_-8px_rgba(244,63,94,0.35)]">
                                  <div className="group relative aspect-square overflow-hidden rounded-[12px] bg-zinc-100 dark:bg-zinc-900">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPreviewImages({
                                          urls: imageAttachments.map((a) => a.url),
                                          currentIndex: imageAttachments.findIndex((a) => a.id === att.id),
                                        })
                                      }
                                      className="absolute inset-0 h-full w-full focus:outline-none focus:ring-2 focus:ring-rose-500/50"
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
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {pdfAttachments.length > 0 ? (
                      <div className="mb-4">
                        <div className="mb-2 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden />
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
                                className="flex flex-col items-center gap-2 p-4 text-center transition hover:border-rose-400/40"
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
                        </div>
                      </div>
                    ) : null}

                    {otherAttachments.length > 0 ? (
                      <ul className="space-y-2">
                        {otherAttachments.map((att) => (
                          <li
                            key={att.id}
                            className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-950/50"
                          >
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex min-w-0 items-center gap-2 text-[13px] text-rose-600 dark:text-rose-400"
                            >
                              <ExternalLink className="h-4 w-4 shrink-0" />
                              <span className="truncate">{att.name}</span>
                            </a>
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
                      </ul>
                    ) : null}

                    {attachments.length === 0 ? (
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Nenhum anexo ainda.</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                    Após salvar, você poderá adicionar fotos, documentos e links nesta ocorrência.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-zinc-200/80 p-4 dark:border-white/[0.08]">
            {isEdit ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={saving}
                className="rounded-xl border border-red-300/80 px-4 py-2.5 text-[13px] font-semibold text-red-600 dark:border-red-500/40 dark:text-red-400"
              >
                Excluir
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-zinc-600 dark:text-zinc-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || loading}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </button>
            </div>
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
