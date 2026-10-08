/**
 * Endereço físico da peça no laboratório — um só ativo por vez:
 * Oficina (flag) | Laboratório (vaga 1–24) | Fila do laboratório.
 */

import {
  normalizeBenchSlot,
  normalizeOficinaShelf,
} from '../constants/labBench';

export type LabLocationKind = 'oficina' | 'deposito' | 'fila' | 'none';

export type LabLocationState = {
  kind: LabLocationKind;
  /** Flag genérica quando kind === 'oficina' (sem letra). */
  oficinaShelf: string | null;
  /** 1–24 quando kind === 'deposito' (vaga no laboratório). */
  benchSlot: number | null;
  queued: boolean;
};

export function resolveLabLocation(input: {
  oficina_shelf?: string | null;
  oficinaShelf?: string | null;
  bench_slot?: number | null;
  benchSlot?: number | null;
  bench_queued_at?: string | null;
  benchQueuedAt?: string | null;
}): LabLocationState {
  const letter = normalizeOficinaShelf(input.oficina_shelf ?? input.oficinaShelf);
  const slot = normalizeBenchSlot(input.bench_slot ?? input.benchSlot);
  const queued = Boolean(input.bench_queued_at ?? input.benchQueuedAt);

  // Um endereço ativo: prioriza oficina se ambos existirem (dados antigos).
  if (letter) {
    return { kind: 'oficina', oficinaShelf: letter, benchSlot: null, queued: false };
  }
  if (slot != null) {
    return { kind: 'deposito', oficinaShelf: null, benchSlot: slot, queued: false };
  }
  if (queued) {
    return { kind: 'fila', oficinaShelf: null, benchSlot: null, queued: true };
  }
  return { kind: 'none', oficinaShelf: null, benchSlot: null, queued: false };
}

export function formatLabLocationShort(loc: LabLocationState): string {
  if (loc.kind === 'oficina') return 'Oficina';
  if (loc.kind === 'deposito' && loc.benchSlot != null) return `Laboratório · ${loc.benchSlot}`;
  if (loc.kind === 'fila') return 'Fila laboratório';
  return 'Sem local';
}

/**
 * Banner da etiqueta: só o número da vaga (laboratório).
 * Oficina / sem local → traço (sem letra).
 */
export function formatLabLocationLabelBanner(loc: LabLocationState): {
  tag: string;
  value: string;
} {
  if (loc.kind === 'deposito' && loc.benchSlot != null) {
    return { tag: '', value: String(loc.benchSlot).padStart(2, '0') };
  }
  if (loc.kind === 'fila') {
    return { tag: '', value: 'FILA' };
  }
  return { tag: '', value: '—' };
}
