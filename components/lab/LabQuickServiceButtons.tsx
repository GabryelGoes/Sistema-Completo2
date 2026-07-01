import React from 'react';
import { Loader2 } from 'lucide-react';
import {
  LAB_QUICK_SERVICE_COLOR_CLASSES,
  type LabQuickService,
} from '../../utils/labQuickServices';

export type LabQuickServiceButtonsProps = {
  services: LabQuickService[];
  onSelect: (preset: LabQuickService) => void;
  disabled?: boolean;
  loadingId?: string | null;
  /** Filtra presets exibidos (ex.: apenas ABS na avaliação técnica). */
  filter?: (preset: LabQuickService) => boolean;
  hint?: string;
};

export const LabQuickServiceButtons: React.FC<LabQuickServiceButtonsProps> = ({
  services,
  onSelect,
  disabled = false,
  loadingId = null,
  filter,
  hint,
}) => {
  const visible = filter ? services.filter(filter) : services;
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {hint ? (
        <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">{hint}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {visible.map((preset) => {
          const color = LAB_QUICK_SERVICE_COLOR_CLASSES[preset.color];
          const isLoading = loadingId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect(preset)}
              disabled={disabled || (loadingId != null && !isLoading)}
              className={`rounded-xl border-2 px-3.5 py-2.5 text-[13px] font-semibold shadow-md transition active:scale-[0.98] disabled:opacity-55 ${color.btn} ${color.btnHover}`}
            >
              {isLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
