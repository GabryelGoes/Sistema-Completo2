/**
 * Endereço físico da peça no laboratório — um só ativo por vez:
 * Oficina (letra A–X) | Depósito (vaga 1–24) | Fila do depósito.
 */

import {
  normalizeBenchSlot,
  normalizeOficinaShelf,
} from '../constants/labBench';

export type LabLocationKind = 'oficina' | 'deposito' | 'fila' | 'none';

export type LabLocationState = {
  kind: LabLocationKind;
  /** Letras A–X quando kind === 'oficina' */
  oficinaShelf: string | null;
  /** 1–24 quando kind === 'deposito' */
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
  if (loc.kind === 'oficina' && loc.oficinaShelf) return `Oficina · ${loc.oficinaShelf}`;
  if (loc.kind === 'deposito' && loc.benchSlot != null) return `Depósito · ${loc.benchSlot}`;
  if (loc.kind === 'fila') return 'Fila depósito';
  return 'Sem local';
}

export function formatLabLocationLabelBanner(loc: LabLocationState): {
  tag: string;
  value: string;
} {
  if (loc.kind === 'oficina' && loc.oficinaShelf) {
    return { tag: 'OFICINA', value: loc.oficinaShelf };
  }
  if (loc.kind === 'deposito' && loc.benchSlot != null) {
    return { tag: 'DEP', value: String(loc.benchSlot) };
  }
  if (loc.kind === 'fila') {
    return { tag: 'DEP', value: 'FILA' };
  }
  return { tag: 'LOCAL', value: '—' };
}
