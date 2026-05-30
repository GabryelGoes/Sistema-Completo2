import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Printer, Trash2, X } from 'lucide-react';
import { ModalPortal } from './ui/ModalPortal';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { desktopShellViewportOverlayClass } from '../utils/desktopShellOverlay';
import { TECHNICAL_BULLETINS_MODULE_LABEL } from '../constants/errorBulletinIcon';
import { StorageThumbImg } from './ui/StorageThumbImg';
import { Lightbox } from './Lightbox';
import {
  deleteErrorBulletin,
  getErrorBulletinById,
  type ErrorBulletinDetail,
  type ErrorBulletinStatus,
} from '../services/apiService';
import { printErrorBulletin } from '../utils/errorBulletinPrintSheet';
import { isAttachmentImage, isAttachmentPdf } from '../utils/attachmentPreviewHelpers';

const STATUS_LABEL: Record<ErrorBulletinStatus, string> = {
  published: 'Publicado',
  draft: 'Rascunho',
  archived: 'Arquivado',
};

type Props = {
  open: boolean;
  bulletinId: string | null;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDeleted: () => void;
};

function parseDtcLines(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function DocSection({ title, children }: { title: string; children: string }) {
  const text = children.trim();
  if (!text) return null;
  return (
    <section className="mb-5 break-inside-avoid">
      <h3 className="mb-2 border-l-[3px] border-amber-500 pl-2 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">
        {title}
      </h3>
      <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-800">{text}</div>
    </section>
  );
}

export const ErrorBulletinViewerModal: React.FC<Props> = ({
  open,
  bulletinId,
  onClose,
  onEdit,
  onDeleted,
}) => {
  const isDesktopShell = useDesktopShellLayout();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ErrorBulletinDetail | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !bulletinId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getErrorBulletinById(bulletinId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar boletim.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, bulletinId]);

  const imageAttachments = useMemo(
    () => (detail?.attachments ?? []).filter(isAttachmentImage),
    [detail?.attachments]
  );

  const handleDelete = async () => {
    if (!bulletinId || !window.confirm('Excluir este boletim permanentemente?')) return;
    setDeleting(true);
    try {
      await deleteErrorBulletin(bulletinId);
      onDeleted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir.');
    } finally {
      setDeleting(false);
    }
  };

  if (!open) return null;

  const vehicle = detail
    ? [detail.vehicleBrand, detail.vehicleModel, detail.vehicleYear].filter(Boolean).join(' ')
    : '';
  const dtcs = detail ? parseDtcLines(detail.dtcCodes) : [];
  const updatedLabel = detail
    ? new Date(detail.updatedAt || detail.createdAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <ModalPortal>
      <div
        className={
          isDesktopShell
            ? `${desktopShellViewportOverlayClass(true, 'z-[275]')} flex flex-col bg-zinc-200/90 backdrop-blur-sm dark:bg-zinc-950/90`
            : 'fixed inset-0 z-[275] flex flex-col bg-zinc-200/90 backdrop-blur-sm dark:bg-zinc-950/90'
        }
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-300/80 bg-white/95 px-4 py-3 dark:border-white/[0.08] dark:bg-zinc-900/95">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
              Visualização do boletim
            </p>
            <p className="truncate text-[15px] font-semibold text-zinc-900 dark:text-white">
              {detail?.title || vehicle || TECHNICAL_BULLETINS_MODULE_LABEL}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={!detail || loading}
              onClick={() => detail && printErrorBulletin(detail)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-white/[0.12] dark:bg-zinc-800 dark:text-zinc-100"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
            <button
              type="button"
              disabled={!bulletinId || loading}
              onClick={() => bulletinId && onEdit(bulletinId)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
            <button
              type="button"
              disabled={!bulletinId || deleting || loading}
              onClick={() => void handleDelete()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-500 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Excluir
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-700 transition hover:bg-zinc-50 dark:border-white/[0.12] dark:bg-zinc-800 dark:text-zinc-200"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-20 text-zinc-500">
              <Loader2 className="h-9 w-9 animate-spin text-amber-500" />
              <p>Carregando boletim…</p>
            </div>
          ) : error ? (
            <p className="mx-auto max-w-3xl rounded-xl bg-red-500/10 px-4 py-3 text-[13px] text-red-700 dark:text-red-300">
              {error}
            </p>
          ) : detail ? (
            <article className="mx-auto max-w-[210mm] rounded-sm border border-zinc-300/90 bg-white px-8 py-10 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.28)] dark:border-zinc-700 dark:bg-zinc-50">
              <header className="mb-8 border-b-[3px] border-amber-500 pb-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">
                  {TECHNICAL_BULLETINS_MODULE_LABEL}
                </p>
                <h1 className="mt-1 font-serif text-[26px] font-bold leading-tight text-zinc-900">
                  {detail.title || vehicle || 'Boletim técnico'}
                </h1>
                <p className="mt-2 text-[13px] text-zinc-600">
                  Atualizado em {updatedLabel}
                  {detail.createdByName ? ` · ${detail.createdByName}` : ''}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-900">
                    {STATUS_LABEL[detail.status]}
                  </span>
                  {detail.plate ? (
                    <span className="rounded-md bg-zinc-800 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      {detail.plate}
                    </span>
                  ) : null}
                </div>
                {vehicle || detail.engineInfo ? (
                  <p className="mt-3 text-[14px] text-zinc-700">
                    {vehicle}
                    {detail.engineInfo ? ` · ${detail.engineInfo}` : ''}
                  </p>
                ) : null}
              </header>

              {dtcs.length > 0 ? (
                <section className="mb-6">
                  <h3 className="mb-2 border-l-[3px] border-amber-500 pl-2 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">
                    Códigos DTC
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {dtcs.map((c) => (
                      <span
                        key={c}
                        className="rounded-md bg-amber-500 px-2 py-1 font-mono text-[12px] font-bold text-white"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              <DocSection title="Sintomas / defeito">{detail.symptoms}</DocSection>
              <DocSection title="Diagnóstico">{detail.possibleCauses}</DocSection>
              <DocSection title="Possíveis causas">{detail.probableCauses}</DocSection>
              <DocSection title="Solução aplicada">{detail.solution}</DocSection>
              <DocSection title="Observações internas">{detail.notes}</DocSection>

              {(detail.tags ?? []).length > 0 ? (
                <section className="mb-5">
                  <h3 className="mb-2 border-l-[3px] border-amber-500 pl-2 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">
                    Tags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-[12px] font-medium text-zinc-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {imageAttachments.length > 0 ? (
                <section className="mb-2">
                  <h3 className="mb-3 border-l-[3px] border-amber-500 pl-2 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">
                    Fotos
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {imageAttachments.map((att, index) => (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() => setPreviewIndex(index)}
                        className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 text-left transition hover:border-amber-400"
                      >
                        <StorageThumbImg
                          src={att.url}
                          alt={att.name}
                          className="aspect-[4/3] w-full object-cover"
                          sizes="(max-width: 640px) 45vw, 200px"
                          thumbMaxWidth={320}
                          thumbMaxHeight={240}
                          thumbQuality={55}
                        />
                        <span className="block truncate px-2 py-1 text-[10px] text-zinc-600">{att.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {(detail.attachments ?? []).some((a) => isAttachmentPdf(a) || a.kind === 'link') ? (
                <section className="mt-6 border-t border-zinc-200 pt-4">
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                    Anexos e links
                  </h3>
                  <ul className="space-y-1.5 text-[13px]">
                    {(detail.attachments ?? [])
                      .filter((a) => !isAttachmentImage(a))
                      .map((att) => (
                        <li key={att.id}>
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-sky-700 hover:underline"
                          >
                            {att.name}
                          </a>
                        </li>
                      ))}
                  </ul>
                </section>
              ) : null}
            </article>
          ) : null}
        </div>
      </div>

      {previewIndex != null && imageAttachments.length > 0 ? (
        <Lightbox
          images={imageAttachments.map((a) => a.url)}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      ) : null}
    </ModalPortal>
  );
};
