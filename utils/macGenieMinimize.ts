/**
 * Compat layer — preferir `GenieNotificationDismiss` para novas integrações.
 * Mantém a API antiga usada pelo stack de banners / central.
 */

import {
  GenieNotificationDismissMany,
  genieOriginFromElement,
  genieOriginFromSelector,
  type GenieOrigin,
} from './GenieNotificationDismiss';

export type MacGenieMinimizeOptions = {
  sources: HTMLElement[];
  target: HTMLElement;
  durationMs?: number;
  staggerMs?: number;
  stripCount?: number;
  leaveSourcesHidden?: boolean;
  /** Destino alternativo (tem prioridade sobre `target` se resolvido). */
  genieOrigin?: GenieOrigin;
};

export async function playMacGenieMinimize(opts: MacGenieMinimizeOptions): Promise<void> {
  const origin =
    opts.genieOrigin ??
    genieOriginFromElement(opts.target) ??
    genieOriginFromSelector('[data-desktop-notif-bell]');

  await GenieNotificationDismissMany({
    sources: opts.sources,
    genieOrigin: origin,
    durationMs: opts.durationMs ?? 520,
    staggerMs: opts.staggerMs ?? 48,
    stripCount: opts.stripCount ?? 40,
    leaveSourcesHidden: opts.leaveSourcesHidden,
  });
}

/** Localiza o item Orçamentos na sidebar do modo PC. */
export function findDesktopOrcamentosNavTarget(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const badge = document.querySelector<HTMLElement>('[data-desktop-nav-badge="orcamentos"]');
  if (badge) return badge;
  const item = document.querySelector<HTMLElement>('[data-desktop-nav-id="orcamentos"]');
  if (!item) return null;
  const icon = item.querySelector<HTMLElement>('.desktop-shell-nav-icon');
  return icon ?? item;
}

/** Sino da central de notificações no cabeçalho (modo PC). */
export function findDesktopNotificationsBellTarget(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const bell = document.querySelector<HTMLElement>('[data-desktop-notif-bell]');
  if (!bell) return null;
  const badge = bell.querySelector<HTMLElement>('[data-desktop-notif-badge]');
  return badge ?? bell;
}
