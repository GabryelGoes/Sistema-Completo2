import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_FLAG = 'rda_chunk_reload_once';

function isModuleLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Loading chunk [\d]+ failed|Loading CSS chunk [\d]+ failed/i.test(
    msg
  );
}

/** Um reload após falha de chunk (deploy novo / cache PWA / Safari). */
export function reloadOnceOnModuleLoadError(err?: unknown): boolean {
  if (err != null && !isModuleLoadError(err)) return false;
  try {
    if (sessionStorage.getItem(RELOAD_FLAG) === '1') return false;
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    /* ignore */
  }
  window.location.reload();
  return true;
}

export function clearModuleLoadReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* ignore */
  }
}

/**
 * `React.lazy` com uma nova tentativa e, se ainda falhar, reload único da página
 * (mitiga "Importing a module script failed" após deploy).
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      clearModuleLoadReloadFlag();
      return mod;
    } catch (first) {
      // Pequena pausa + 2ª tentativa (rede / SW atualizando).
      await new Promise((r) => setTimeout(r, 400));
      try {
        const mod = await factory();
        clearModuleLoadReloadFlag();
        return mod;
      } catch (second) {
        if (reloadOnceOnModuleLoadError(second) || reloadOnceOnModuleLoadError(first)) {
          // Mantém a Promise pendente enquanto a página recarrega.
          return new Promise(() => undefined);
        }
        throw second;
      }
    }
  });
}

export { isModuleLoadError };
