import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, icon, className, ...props }) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider ml-1">
        {label}
      </label>
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 dark:text-zinc-400 group-focus-within:text-brand-yellow transition-colors duration-300">
          {icon}
        </div>
        <input
          {...props}
          className="w-full bg-zinc-100 dark:bg-brand-surfaceHighlight border border-zinc-200 dark:border-brand-border text-zinc-900 dark:text-white text-sm rounded-xl py-3 pl-10 pr-4 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-brand-yellow/50 focus:ring-1 focus:ring-brand-yellow/50 transition-all duration-300 hover:border-zinc-400 dark:hover:border-zinc-600"
        />
      </div>
    </div>
  );
};

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export const TextArea: React.FC<TextAreaProps> = ({ label, className, ...props }) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-300 uppercase tracking-wider ml-1">
        {label}
      </label>
      <textarea
        {...props}
        className="w-full bg-zinc-100 dark:bg-brand-surfaceHighlight border border-zinc-200 dark:border-brand-border text-zinc-900 dark:text-white text-sm rounded-xl py-3 px-4 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-brand-yellow/50 focus:ring-1 focus:ring-brand-yellow/50 transition-all duration-300 hover:border-zinc-400 dark:hover:border-zinc-600 min-h-[120px] resize-none"
      />
    </div>
  );
};