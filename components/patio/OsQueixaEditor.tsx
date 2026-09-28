import React, { useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';

type OsQueixaEditorProps = {
  initialText: string;
  saving: boolean;
  inputClassName: string;
  onCancel: () => void;
  onSave: (text: string) => void | Promise<void>;
};

/**
 * Editor da queixa com estado local — não re-renderiza o PatioView a cada tecla.
 */
export function OsQueixaEditor({
  initialText,
  saving,
  inputClassName,
  onCancel,
  onSave,
}: OsQueixaEditorProps) {
  const [text, setText] = useState(initialText);

  return (
    <div className="animate-in fade-in duration-200 flex flex-col gap-3 bg-zinc-50/90 px-3 py-3 pl-3 dark:bg-white/[0.02] sm:px-4 sm:py-4 sm:pl-4">
      <textarea
        data-queixa-textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={`${inputClassName} relative z-[2] min-h-[180px] resize-none cursor-text text-[15px] leading-relaxed !caret-[#007AFF] dark:text-white dark:!caret-[#93c5fd]`}
        placeholder="Queixa"
      />
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-zinc-500 transition-colors hover:bg-black/5 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void onSave(text)}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-lg bg-[#007AFF] px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-sm shadow-blue-500/20 transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-45"
        >
          {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Salvar
        </button>
      </div>
    </div>
  );
}
