import React from 'react';

export type IosSwitchProps = {
  checked: boolean;
  onChange: () => void;
  id: string;
  ariaLabel: string;
  disabled?: boolean;
};

/** Interruptor estilo iOS (UISwitch). */
export function IosSwitch({ checked, onChange, id, ariaLabel, disabled = false }: IosSwitchProps) {
  return (
    <label
      htmlFor={id}
      className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer sr-only"
        aria-checked={checked}
        aria-label={ariaLabel}
      />
      <span
        className="absolute inset-0 rounded-full bg-[#E9E9EA] transition-colors duration-200 ease-out dark:bg-zinc-600 peer-checked:bg-[#34C759] peer-focus-visible:ring-2 peer-focus-visible:ring-[#34C759]/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white dark:peer-focus-visible:ring-offset-zinc-900"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.12),0_1.5px_1px_rgba(0,0,0,0.08)] transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-transform peer-checked:translate-x-[20px]"
        aria-hidden
      />
    </label>
  );
}
