/**
 * Classes de overlay que no modo PC (data-desktop-shell) não cobrem sidebar nem topbar.
 * Ver `styles/desktop-onmotor-shell.css` (.desktop-shell-viewport-overlay).
 */

/** Overlay de página/modal em tela cheia dentro da área de conteúdo do shell. */
export function desktopShellViewportOverlayClass(isDesktopShell: boolean, zClass = 'z-[100]'): string {
  return isDesktopShell
    ? `desktop-shell-viewport-overlay fixed ${zClass}`
    : `fixed inset-0 ${zClass}`;
}

/** Overlay filho (cadastro, visualização) — ancora no painel pai no PC. */
export function desktopShellNestedOverlayClass(isDesktopShell: boolean, zClass = 'z-[115]'): string {
  return isDesktopShell ? `absolute inset-0 ${zClass}` : `fixed inset-0 ${zClass}`;
}

/**
 * Overlay filho portaled em `document.body` (ex.: edição no estoque).
 * No PC usa a mesma âncora do shell que o modal pai; no mobile cobre a tela.
 */
export function desktopShellPortaledChildOverlayClass(isDesktopShell: boolean, zClass = 'z-[135]'): string {
  return isDesktopShell
    ? desktopShellViewportOverlayClass(true, zClass)
    : `fixed inset-0 ${zClass}`;
}
