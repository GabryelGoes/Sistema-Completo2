import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Loader2, Save, Trash2, X } from 'lucide-react';
import { ModalPortal } from './ui/ModalPortal';
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
    setError(null);
  };

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
                    <ul className="space-y-2">
                      {attachments.map((att) => (
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
    </ModalPortal>
  );
};
