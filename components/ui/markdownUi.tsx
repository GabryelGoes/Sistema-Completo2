import React from "react";
import type { Components } from "react-markdown";

/**
 * Markdown único para o app (modo claro + escuro), alinhado à tipografia da UI.
 * Não usar cores “só escuro” (ex.: text-white em strong) para não quebrar o tema claro.
 */
export const markdownComponentsApp: Components = {
  p: ({ children }) => (
    <p className="mb-2 last:mb-0 break-words text-zinc-950 dark:text-zinc-100">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-zinc-950 dark:text-white">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-zinc-700 dark:text-zinc-400">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-2 ml-2 list-inside list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 ml-2 list-inside list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-zinc-950 dark:text-zinc-200">{children}</li>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-amber-700 underline decoration-amber-700/40 underline-offset-2 hover:text-amber-800 dark:text-brand-yellow dark:decoration-brand-yellow/40 dark:hover:text-brand-yellow"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-4 border-zinc-300 py-1 pl-4 italic text-zinc-700 dark:border-zinc-600 dark:text-zinc-400">
      {children}
    </blockquote>
  ),
};
