import React from 'react';
import { Check, FileText, Image as ImageIcon, Paperclip } from 'lucide-react';
import { StorageThumbImg } from '../ui/StorageThumbImg';

export type PatioOriginAttachmentItem = {
  path: string;
  name: string;
  url: string;
};

function attachmentDisplayName(fileName: string): string {
  const base = fileName.split('/').pop() || fileName;
  const cleaned = base.replace(/^\d+_/, '').replace(/^\d+_/, '');
  const withoutExt = cleaned.replace(/\.(jpe?g|png|gif|webp|pdf|heic|heif|bmp|docx?|xlsx?|txt)$/i, '');
  return (withoutExt || cleaned).trim() || cleaned || base;
}

function isImageAttachment(item: PatioOriginAttachmentItem): boolean {
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp)(\?|#|$)/i.test(item.name) ||
    /\.(jpe?g|png|gif|webp|heic|heif|bmp)(\?|#|$)/i.test(item.url);
}

export type PatioOriginAttachmentsPickerProps = {
  attachments: PatioOriginAttachmentItem[];
  selectedPaths: string[];
  onChange: (paths: string[]) => void;
  disabled?: boolean;
  emptyLabel?: string;
};

export const PatioOriginAttachmentsPicker: React.FC<PatioOriginAttachmentsPickerProps> = ({
  attachments,
  selectedPaths,
  onChange,
  disabled = false,
  emptyLabel = 'Nenhum anexo nesta OS do pátio.',
}) => {
  const selected = new Set(selectedPaths);

  const toggle = (path: string) => {
    if (disabled) return;
    if (selected.has(path)) {
      onChange(selectedPaths.filter((p) => p !== path));
      return;
    }
    onChange([...selectedPaths, path]);
  };

  if (attachments.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300/90 bg-zinc-50/90 px-3 py-3 text-[13px] text-zinc-500 dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-zinc-400">
        {emptyLabel}
      </p>
    );
  }

  const images = attachments.filter(isImageAttachment);
  const docs = attachments.filter((item) => !isImageAttachment(item));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {selectedPaths.length} de {attachments.length} selecionado{attachments.length === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled || selectedPaths.length === attachments.length}
            onClick={() => onChange(attachments.map((a) => a.path))}
            className="text-[12px] font-semibold text-[#007AFF] disabled:opacity-40 dark:text-[#7ab8ff]"
          >
            Selecionar todos
          </button>
          <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
            ·
          </span>
          <button
            type="button"
            disabled={disabled || selectedPaths.length === 0}
            onClick={() => onChange([])}
            className="text-[12px] font-semibold text-zinc-500 disabled:opacity-40 dark:text-zinc-400"
          >
            Limpar
          </button>
        </div>
      </div>

      {images.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((item) => {
            const checked = selected.has(item.path);
            return (
              <button
                key={item.path}
                type="button"
                disabled={disabled}
                onClick={() => toggle(item.path)}
                aria-pressed={checked}
                title={attachmentDisplayName(item.name)}
                className={`relative overflow-hidden rounded-xl border text-left transition active:scale-[0.99] disabled:opacity-55 ${
                  checked
                    ? 'border-[#007AFF] ring-2 ring-[#007AFF]/25 dark:border-[#7ab8ff] dark:ring-[#7ab8ff]/25'
                    : 'border-zinc-200/90 hover:border-zinc-300 dark:border-white/[0.1] dark:hover:border-white/[0.18]'
                }`}
              >
                <StorageThumbImg
                  src={item.url}
                  alt={attachmentDisplayName(item.name)}
                  className="aspect-square h-full w-full object-cover"
                  thumbMaxWidth={240}
                  thumbMaxHeight={240}
                />
                <span
                  className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm ${
                    checked
                      ? 'border-[#007AFF] bg-[#007AFF] text-white'
                      : 'border-white/80 bg-black/35 text-white/90'
                  }`}
                  aria-hidden
                >
                  {checked ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <ImageIcon className="h-3.5 w-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {docs.length > 0 ? (
        <ul className="space-y-1.5">
          {docs.map((item) => {
            const checked = selected.has(item.path);
            return (
              <li key={item.path}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(item.path)}
                  aria-pressed={checked}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.99] disabled:opacity-55 ${
                    checked
                      ? 'border-[#007AFF]/50 bg-[#007AFF]/10 dark:border-[#007AFF]/40 dark:bg-[#007AFF]/16'
                      : 'border-zinc-200/90 bg-white hover:border-zinc-300 dark:border-white/[0.1] dark:bg-zinc-950/60 dark:hover:border-white/[0.18]'
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      checked
                        ? 'bg-[#007AFF] text-white'
                        : 'bg-zinc-100 text-zinc-500 dark:bg-white/[0.08] dark:text-zinc-300'
                    }`}
                  >
                    {checked ? <Check className="h-4 w-4" strokeWidth={2.75} /> : <FileText className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
                    {attachmentDisplayName(item.name)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};

export const PatioOriginAttachmentsSection: React.FC<{
  title?: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ title = 'Anexos da OS do pátio', hint, children }) => (
  <div className="space-y-2">
    <div className="flex items-start gap-2">
      <Paperclip className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" strokeWidth={2.25} aria-hidden />
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {title}
        </p>
        {hint ? (
          <p className="mt-0.5 text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">{hint}</p>
        ) : null}
      </div>
    </div>
    {children}
  </div>
);
