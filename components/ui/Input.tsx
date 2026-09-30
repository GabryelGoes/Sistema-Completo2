import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: React.ReactNode;
  inputClassName?: string;
  /** Exibe asterisco vermelho e `aria-required` quando definido. */
  required?: boolean;
}

/** Altura padrão do controle (input / botão de ação na mesma linha). */
export const FIELD_CONTROL_HEIGHT_CLASS = 'h-12';

export const Input: React.FC<InputProps> = ({ label, icon, className, inputClassName, required, ...props }) => {
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className ?? ''}`}>
      <label className="ml-1 block h-4 truncate text-xs font-medium uppercase leading-4 tracking-wider text-zinc-950 dark:text-zinc-300">
        {label}
        {required ? <span className="ml-0.5 text-red-500" aria-hidden> *</span> : null}
      </label>
      <div className="relative min-w-0 group">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#007AFF]/85 transition-colors duration-300 [&_svg]:shrink-0 group-focus-within:text-[#007AFF] dark:text-[#7ab8ff]/90 dark:group-focus-within:text-[#7ab8ff]">
          {icon}
        </div>
        <input
          {...props}
          aria-required={required || undefined}
          className={`box-border h-12 w-full rounded-xl border border-zinc-200 bg-zinc-100 py-0 pl-10 pr-4 text-sm leading-normal text-zinc-950 placeholder-zinc-500 transition-all duration-300 hover:border-zinc-400 focus:border-brand-yellow/50 focus:outline-none focus:ring-1 focus:ring-brand-yellow/50 dark:border-brand-border dark:bg-brand-surfaceHighlight dark:text-white dark:placeholder-zinc-600 dark:hover:border-zinc-600 ${inputClassName ?? ''}`}
        />
      </div>
    </div>
  );
};

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  textareaClassName?: string;
  required?: boolean;
}

export const TextArea: React.FC<TextAreaProps> = ({ label, className, textareaClassName, required, ...props }) => {
  return (
    <div className={`flex min-w-0 flex-col gap-2 ${className ?? ''}`}>
      {label ? (
        <label className="ml-1 block h-4 truncate text-xs font-medium uppercase leading-4 tracking-wider text-zinc-950 dark:text-zinc-300">
          {label}
          {required ? <span className="ml-0.5 text-red-500" aria-hidden> *</span> : null}
        </label>
      ) : null}
      <textarea
        {...props}
        aria-required={required || undefined}
        className={`box-border min-h-[120px] w-full resize-none rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm text-zinc-950 placeholder-zinc-500 transition-all duration-300 hover:border-zinc-400 focus:border-brand-yellow/50 focus:outline-none focus:ring-1 focus:ring-brand-yellow/50 dark:border-brand-border dark:bg-brand-surfaceHighlight dark:text-white dark:placeholder-zinc-600 dark:hover:border-zinc-600 ${textareaClassName ?? ''}`}
      />
    </div>
  );
};
