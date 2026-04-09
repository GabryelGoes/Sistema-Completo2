/**
 * Estilo por linha na leitura do orçamento: itens aprovados em destaque;
 * reprovados e pendentes mais apagados (saturation + opacity) para o técnico focar no que foi aprovado.
 */
export function budgetReadRowClass(approved: boolean | undefined, surface: 'paper' | 'ios'): string {
  const base =
    'rounded-lg px-2 py-1.5 -mx-0.5 motion-safe:transition-[opacity,filter,background-color,box-shadow] duration-200';
  if (approved === true) {
    if (surface === 'paper') {
      return `${base} opacity-100 bg-emerald-900/[0.11] shadow-[inset_0_0_0_1px_rgba(6,78,59,0.22)]`;
    }
    return `${base} opacity-100 bg-emerald-500/[0.11] dark:bg-emerald-400/[0.12] ring-1 ring-emerald-600/22 dark:ring-emerald-400/18`;
  }
  if (surface === 'paper') {
    return `${base} opacity-[0.36] saturate-[0.5]`;
  }
  return `${base} opacity-[0.34] saturate-[0.55]`;
}
