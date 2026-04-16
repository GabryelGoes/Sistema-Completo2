import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: React.ReactNode;
  /** Exibe asterisco vermelho e `aria-required` quando definido. */
  required?: boolean;
}

export const Input: React.FC<InputProps> = ({ label, icon, className, required, ...props }) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-xs font-medium text-zinc-950 dark:text-zinc-300 uppercase tracking-wider ml-1">
        {label}
        {required ? <span className="text-red-500 ml-0.5" aria-hidden> *</span> : null}
      </label>
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-brand-yellow/80 transition-colors duration-300 [&_svg]:shrink-0 group-focus-within:text-brand-yellow">
          {icon}
        </div>
        <input
          {...props}
          aria-required={required || undefined}
          className="w-full bg-zinc-100 dark:bg-brand-surfaceHighlight border border-zinc-200 dark:border-brand-border text-zinc-950 dark:text-white text-sm rounded-xl py-3 pl-10 pr-4 placeholder-zinc-500 dark:placeholder-zinc-600 focus:outline-none focus:border-brand-yellow/50 focus:ring-1 focus:ring-brand-yellow/50 transition-all duration-300 hover:border-zinc-400 dark:hover:border-zinc-600"
        />
      </div>
    </div>
  );
};

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  required?: boolean;
}

export const TextArea: React.FC<TextAreaProps> = ({ label, className, required, ...props }) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label ? (
        <label className="block text-xs font-medium text-zinc-950 dark:text-zinc-300 uppercase tracking-wider ml-1">
          {label}
          {required ? <span className="text-red-500 ml-0.5" aria-hidden> *</span> : null}
        </label>
      ) : null}
      <textarea
        {...props}
        aria-required={required || undefined}
        className="w-full bg-zinc-100 dark:bg-brand-surfaceHighlight border border-zinc-200 dark:border-brand-border text-zinc-950 dark:text-white text-sm rounded-xl py-3 px-4 placeholder-zinc-500 dark:placeholder-zinc-600 focus:outline-none focus:border-brand-yellow/50 focus:ring-1 focus:ring-brand-yellow/50 transition-all duration-300 hover:border-zinc-400 dark:hover:border-zinc-600 min-h-[120px] resize-none"
      />
    </div>
  );
};