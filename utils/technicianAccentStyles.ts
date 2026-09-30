/** Cores de accent do perfil do técnico → classes Tailwind chapadas (botão preenchido). */
const TECHNICIAN_ACCENT_FLAT: Record<string, string> = {
  blue: 'bg-blue-600 text-white',
  emerald: 'bg-emerald-600 text-white',
  violet: 'bg-violet-600 text-white',
  amber: 'bg-amber-500 text-white',
  rose: 'bg-rose-600 text-white',
  cyan: 'bg-cyan-600 text-white',
  orange: 'bg-orange-500 text-white',
  zinc: 'bg-zinc-600 text-white',
};

/** Estilo de chip/botão com cor preenchida (sem borda/outline). */
export function technicianAccentFlatClass(accent: string | null | undefined): string {
  const c = (accent || 'zinc').toLowerCase();
  return TECHNICIAN_ACCENT_FLAT[c] ?? TECHNICIAN_ACCENT_FLAT.zinc;
}

/** Estilo usado em avatares/botões com borda da mesma cor. */
export function technicianAccentBorderedClass(accent: string | null | undefined): string {
  const c = (accent || 'zinc').toLowerCase();
  const map: Record<string, string> = {
    blue: 'bg-blue-600 text-white border-blue-600',
    emerald: 'bg-emerald-600 text-white border-emerald-600',
    violet: 'bg-violet-600 text-white border-violet-600',
    amber: 'bg-amber-500 text-white border-amber-500',
    rose: 'bg-rose-600 text-white border-rose-600',
    cyan: 'bg-cyan-600 text-white border-cyan-600',
    orange: 'bg-orange-500 text-white border-orange-500',
    zinc: 'bg-zinc-600 text-white border-zinc-600',
  };
  return map[c] ?? map.zinc;
}
