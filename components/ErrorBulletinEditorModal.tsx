import React, { useCallback, useEffect, useState } from 'react';
import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { ModalPortal } from './ui/ModalPortal';
import {
  addErrorBulletinLink,
  createErrorBulletin,
  deleteErrorBulletin,
  deleteErrorBulletinAttachment,
  getErrorBulletinById,
  updateErrorBulletin,
  uploadErrorBulletinAttachment,
  type ErrorBulletinAttachment,
  type ErrorBulletinDetail,
  type ErrorBulletinStatus,
} from '../services/apiService';
import { compressImageForUpload } from '../utils/imageUpload';

const inputClass =
  'w-full rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-[14px] text-zinc-900 outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-white/[0.12] dark:bg-zinc-950 dark:text-white';
const labelClass = 'mb-1 block text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400';

type Props = {
  open: boolean;
  bulletinId: string | null;
  authorName?: string;
  authorUserId?: string | null;
  onClose: () => void;
  onSaved: () => void;
};

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
  const isEdit = !!bulletinId;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<ErrorBulletinAttachment[]>([]);

  const [title, setTitle] = useState('');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [plate, setPlate] = useState('');
  const [engineInfo, setEngineInfo] = useState('');
  const [dtcCodes, setDtcCodes] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [solution, setSolution] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ErrorBulletinStatus>('published');
  const [tagsRaw, setTagsRaw] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const applyDetail = (d: ErrorBulletinDetail) => {
    setTitle(d.title);
    setVehicleBrand(d.vehicleBrand);
    setVehicleModel(d.vehicleModel);
    setVehicleYear(d.vehicleYear);
    setPlate(d.plate);
    setEngineInfo(d.engineInfo);
    setDtcCodes(d.dtcCodes);
    setSymptoms(d.symptoms);
    setSolution(d.solution);
    setNotes(d.notes);
    setStatus(d.status);
    setTagsRaw((d.tags ?? []).join(', '));
    setAttachments(d.attachments ?? []);
  };

  const resetForm = () => {
    setTitle('');
    setVehicleBrand('');
    setVehicleModel('');
    setVehicleYear('');
    setPlate('');
    setEngineInfo('');
    setDtcCodes('');
    setSymptoms('');
    setSolution('');
    setNotes('');
    setStatus('published');
    setTagsRaw('');
    setAttachments([]);
    setLinkName('');
    setLinkUrl('');
    setError(null);
  };

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
      if (isEdit && bulletinId) {
        await updateErrorBulletin(bulletinId, buildPayload());
      } else {
        await createErrorBulletin({
          ...buildPayload(),
          createdByName: authorName,
          createdByUserId: authorUserId,
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
      if (!files?.length || !bulletinId) return;
      setSaving(true);
      setError(null);
      try {
        for (const file of Array.from(files)) {
          const toSend = file.type.startsWith('image/') ? await compressImageForUpload(file) : file;
          const att = await uploadErrorBulletinAttachment(bulletinId, toSend);
          setAttachments((prev) => [...prev, att]);
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
    if (!bulletinId || !linkUrl.trim()) return;
    setSaving(true);
    try {
      const att = await addErrorBulletinLink(bulletinId, {
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
      <div className="fixed inset-0 z-[280] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div
          className="flex max-h-[min(96vh,920px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-[22px] border border-zinc-200/90 bg-white shadow-2xl dark:border-white/[0.1] dark:bg-zinc-900 sm:rounded-[22px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200/80 bg-amber-500 px-5 py-4 dark:border-white/[0.08]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-100">
                Boletim de Erros
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

          <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Título do registro</label>
                    <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Falha ABS — Corolla 2018" />
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
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Motor / sistema</label>
                    <input className={inputClass} value={engineInfo} onChange={(e) => setEngineInfo(e.target.value)} placeholder="Ex.: 2.0 flex, módulo ABS" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Status</label>
                    <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as ErrorBulletinStatus)}>
                      <option value="published">Publicado</option>
                      <option value="draft">Rascunho</option>
                      <option value="archived">Arquivado</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
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
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Sintomas / defeito</label>
                    <textarea className={`${inputClass} min-h-[100px]`} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Solução aplicada</label>
                    <textarea className={`${inputClass} min-h-[100px]`} value={solution} onChange={(e) => setSolution(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Observações internas</label>
                    <textarea className={`${inputClass} min-h-[72px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Tags (vírgula)</label>
                    <input className={inputClass} value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="ABS, Toyota, intermitente" />
                  </div>
                </div>

                {isEdit ? (
                  <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-white/[0.08] dark:bg-zinc-950/40">
                    <p className="mb-3 text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">
                      Anexos (fotos, documentos, links)
                    </p>
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
                    {attachments.length === 0 ? (
                      <p className="text-[13px] text-zinc-500">Nenhum anexo ainda.</p>
                    ) : (
                      <ul className="space-y-2">
                        {attachments.map((att) => (
                          <li
                            key={att.id}
                            className="flex items-center gap-2 rounded-xl border border-zinc-200/80 bg-white px-3 py-2 dark:border-white/[0.08] dark:bg-zinc-900"
                          >
                            {att.kind === 'photo' ? (
                              <ImageIcon className="h-4 w-4 shrink-0 text-amber-600" />
                            ) : att.kind === 'link' ? (
                              <Link2 className="h-4 w-4 shrink-0 text-sky-600" />
                            ) : (
                              <FileText className="h-4 w-4 shrink-0 text-zinc-500" />
                            )}
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-w-0 flex-1 truncate text-[13px] font-medium text-sky-700 hover:underline dark:text-sky-300"
                            >
                              {att.name}
                            </a>
                            <a href={att.url} target="_blank" rel="noopener noreferrer" className="p-1 text-zinc-500">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                            <button
                              type="button"
                              onClick={() => void handleRemoveAttachment(att)}
                              className="p-1 text-red-500 hover:bg-red-500/10 rounded-lg"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[13px] text-amber-900 dark:text-amber-200">
                    Após salvar, você poderá adicionar fotos, documentos e links neste registro.
                  </p>
                )}
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
    </ModalPortal>
  );
};