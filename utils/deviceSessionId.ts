/** ID estável do aparelho neste navegador (localStorage). */

const DEVICE_ID_STORAGE_KEY = 'rei_do_abs_device_id';

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Retorna o device id persistido ou cria um novo. */
export function getOrCreateDeviceId(): string {
  if (typeof localStorage === 'undefined') return randomId();
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.trim()) return existing.trim();
    const id = randomId();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

export function getStoredDeviceId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}
