import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Download, X, Loader2, ExternalLink, AlertCircle } from 'lucide-react';
import { ModalPortal } from './ui/ModalPortal';
import { mediaOverlayIconBtn } from './ui/iosModalStyles';

function fileNameFromSrc(src: string, fallback = 'Documento PDF'): string {
  try {
    const clean = decodeURIComponent(src.split('?')[0].split('#')[0]);
    const base = clean.split('/').pop() || '';
    return base.replace(/^\d+_/, '').trim() || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Visualizador PDF em tela cheia dentro do app (não abre aba do navegador).
 * Baixa o arquivo como blob para contornar Content-Disposition:attachment
 * de URLs públicas do storage, que costuma falhar no iframe.
 */
export function PdfViewerModal({
  src,
  title,
  onClose,
}: {
  src: string;
  title?: string;
  onClose: () => void;
}) {
  const displayTitle = (title || '').trim() || fileNameFromSrc(src);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setBlobUrl(null);

    (async () => {
      try {
        const res = await fetch(src, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const pdfBlob =
          blob.type === 'application/pdf'
            ? blob
            : new Blob([blob], { type: 'application/pdf' });
        objectUrl = URL.createObjectURL(pdfBlob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setBlobUrl(objectUrl);
        setLoading(false);
      } catch {
        if (cancelled) return;
        // Fallback: tenta o iframe com a URL original (alguns hosts já servem inline).
        setBlobUrl(null);
        setError(null);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const iframeSrc = useMemo(() => {
    if (blobUrl) return `${blobUrl}#toolbar=1&navpanes=0`;
    // Sem blob: usa URL remota com toolbar enxuta.
    const join = src.includes('#') ? '&' : '#';
    return `${src}${join}toolbar=1&navpanes=0`;
  }, [blobUrl, src]);

  return (
    <ModalPortal>
      <div
        data-media-overlay
        role="dialog"
        aria-modal="true"
        aria-label={displayTitle}
        className="fixed inset-0 z-[300] flex flex-col bg-zinc-950/95 backdrop-blur-xl animate-modal-backdrop"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/80 px-4 py-3 backdrop-blur-md sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-400 ring-1 ring-red-400/25">
              <FileText className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold tracking-tight text-white">
                {displayTitle}
              </p>
              <p className="truncate text-[11px] font-medium text-white/45">
                Visualizador do sistema · Esc para fechar
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={src}
              download={displayTitle}
              className={mediaOverlayIconBtn}
              title="Baixar"
              aria-label="Baixar PDF"
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="h-5 w-5" />
            </a>
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className={mediaOverlayIconBtn}
              title="Abrir no navegador"
              aria-label="Abrir no navegador"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-5 w-5" />
            </a>
            <button
              type="button"
              onClick={onClose}
              className={mediaOverlayIconBtn}
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 bg-zinc-900">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
              <Loader2 className="h-8 w-8 animate-spin text-white/80" aria-hidden />
              <p className="text-[13px] font-medium">Carregando documento…</p>
            </div>
          ) : null}

          {!loading && error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <AlertCircle className="h-8 w-8 text-red-400" aria-hidden />
              <p className="max-w-sm text-[14px] font-medium text-white/80">{error}</p>
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-white/15"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir no navegador
              </a>
            </div>
          ) : null}

          {!loading && !error ? (
            <iframe
              key={iframeSrc}
              src={iframeSrc}
              className="h-full w-full border-0 bg-zinc-800"
              title={displayTitle}
              onError={() =>
                setError('Não foi possível exibir este PDF aqui. Use “Abrir no navegador”.')
              }
            />
          ) : null}
        </div>
      </div>
    </ModalPortal>
  );
}
