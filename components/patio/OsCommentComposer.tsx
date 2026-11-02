import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, RefreshCw, Send, X } from 'lucide-react';

const MAX_CHAT_PHOTOS = 10;
const ACCEPT_IMAGES = 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/*';

export type OsCommentComposerSendPayload = {
  text: string;
  files: File[];
};

type OsCommentComposerProps = {
  sending: boolean;
  inputClassName: string;
  /** Espelha o rascunho no pai (ref) sem re-render — live-sync pausa enquanto digita. */
  draftRef?: React.MutableRefObject<string>;
  onSend: (payload: OsCommentComposerSendPayload) => void | Promise<void>;
};

type PreviewItem = {
  id: string;
  file: File;
  url: string;
};

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(file.name);
}

/**
 * Composer de comentário estilo WhatsApp: texto + fotos (galeria, câmera, colar, arrastar).
 * Estado local — evita re-render do PatioView a cada tecla.
 */
export function OsCommentComposer({
  sending,
  inputClassName,
  draftRef,
  onSend,
}: OsCommentComposerProps) {
  const [text, setText] = useState('');
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previewsRef = useRef(previews);
  previewsRef.current = previews;

  useEffect(() => {
    if (draftRef) draftRef.current = text;
  }, [text, draftRef]);

  useEffect(() => {
    return () => {
      for (const p of previewsRef.current) URL.revokeObjectURL(p.url);
    };
  }, []);

  const resetHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
  };

  const addFiles = (list: FileList | File[] | null | undefined) => {
    if (!list) return;
    const incoming = Array.from(list).filter(isImageFile);
    if (!incoming.length) return;
    setPreviews((prev) => {
      const room = MAX_CHAT_PHOTOS - prev.length;
      if (room <= 0) return prev;
      const nextItems = incoming.slice(0, room).map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        url: URL.createObjectURL(file),
      }));
      return [...prev, ...nextItems];
    });
  };

  const removePreview = (id: string) => {
    setPreviews((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  };

  const clearPreviews = () => {
    setPreviews((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.url);
      return [];
    });
  };

  const canSend = (text.trim().length > 0 || previews.length > 0) && !sending;

  const submit = async () => {
    const trimmed = text.trim();
    const files = previews.map((p) => p.file);
    if ((!trimmed && files.length === 0) || sending) return;
    const snapshotText = trimmed;
    const snapshotPreviews = previews;
    setText('');
    if (draftRef) draftRef.current = '';
    setPreviews([]);
    resetHeight();
    try {
      await onSend({ text: snapshotText, files });
      for (const p of snapshotPreviews) URL.revokeObjectURL(p.url);
    } catch {
      setText(snapshotText);
      if (draftRef) draftRef.current = snapshotText;
      setPreviews(snapshotPreviews);
    }
  };

  return (
    <div
      className={`border-t border-zinc-200/60 bg-white dark:border-white/[0.06] dark:bg-zinc-950/40 ${
        dragOver ? 'ring-2 ring-inset ring-[#007AFF]/45' : ''
      }`}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      {previews.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto px-2.5 pt-2.5 custom-scrollbar sm:px-3">
          {previews.map((p) => (
            <div
              key={p.id}
              className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-100 shadow-sm dark:border-white/[0.1] dark:bg-zinc-900"
            >
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePreview(p.id)}
                disabled={sending}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white shadow-md backdrop-blur-sm transition hover:bg-black/80 disabled:opacity-50"
                aria-label="Remover foto"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          ))}
          {previews.length < MAX_CHAT_PHOTOS ? (
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              disabled={sending}
              className="flex h-[4.5rem] w-[4.5rem] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#007AFF]/35 bg-[#007AFF]/[0.06] text-[#007AFF] transition hover:bg-[#007AFF]/12 disabled:opacity-50 dark:border-[#007AFF]/45 dark:bg-[#007AFF]/12 dark:text-[#7ab8ff]"
              aria-label="Adicionar mais fotos"
            >
              <ImagePlus className="h-5 w-5" strokeWidth={2.2} />
              <span className="text-[10px] font-semibold">Mais</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {dragOver ? (
        <p className="px-3 pt-2 text-center text-[12px] font-semibold text-[#007AFF] dark:text-[#7ab8ff]">
          Solte as fotos aqui
        </p>
      ) : null}

      <div className="flex items-end gap-1.5 p-2.5 sm:gap-2 sm:p-3">
        <input
          ref={galleryInputRef}
          type="file"
          accept={ACCEPT_IMAGES}
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <div className="flex shrink-0 items-center gap-0.5 pb-0.5">
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={sending || previews.length >= MAX_CHAT_PHOTOS}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#007AFF] transition hover:bg-[#007AFF]/10 disabled:opacity-40 dark:text-[#7ab8ff] dark:hover:bg-[#007AFF]/15"
            title="Anexar fotos"
            aria-label="Anexar fotos da galeria"
          >
            <ImagePlus className="h-5 w-5" strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={sending || previews.length >= MAX_CHAT_PHOTOS}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#007AFF] transition hover:bg-[#007AFF]/10 disabled:opacity-40 dark:text-[#7ab8ff] dark:hover:bg-[#007AFF]/15 sm:hidden"
            title="Tirar foto"
            aria-label="Tirar foto com a câmera"
          >
            <Camera className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
          }}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items?.length) return;
            const files: File[] = [];
            for (const item of Array.from(items)) {
              if (item.kind === 'file' && item.type.startsWith('image/')) {
                const f = item.getAsFile();
                if (f) files.push(f);
              }
            }
            if (files.length) {
              e.preventDefault();
              addFiles(files);
            }
          }}
          placeholder={previews.length ? 'Legenda (opcional)' : 'Mensagem'}
          rows={1}
          className={`${inputClassName} max-h-[140px] min-h-[44px] min-w-0 flex-1 resize-none overflow-y-auto whitespace-pre-wrap break-words py-2.5 text-[15px] leading-snug [overflow-wrap:anywhere]`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSend}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#007AFF] text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:opacity-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Enviar mensagem"
        >
          {sending ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" strokeWidth={2.2} />}
        </button>
      </div>

      {previews.length > 0 ? (
        <div className="flex items-center justify-between gap-2 px-3 pb-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>
            {previews.length} foto{previews.length === 1 ? '' : 's'} · salva
            {previews.length === 1 ? '' : 's'} em Arquivos ao enviar
          </span>
          <button
            type="button"
            onClick={clearPreviews}
            disabled={sending}
            className="font-semibold text-zinc-600 underline-offset-2 hover:underline disabled:opacity-50 dark:text-zinc-300"
          >
            Limpar
          </button>
        </div>
      ) : null}
    </div>
  );
}
