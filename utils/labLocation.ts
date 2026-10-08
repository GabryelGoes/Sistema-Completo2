/**
 * Localização da peça no laboratório:
 * - `oficina_shelf`: flag Oficina (`*`) vs Laboratório (null)
 * - `bench_slot`: compartimento 1–24 (mesmo número na oficina e no laboratório)
 * - Fila: sem vaga, aguardando compartimento livre
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
  /** Compartimento 1–24 (oficina e laboratório usam a mesma numeração). */
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

  // Oficina (flag) tem prioridade de “onde está”; o número do compartimento permanece.
  if (letter) {
    return { kind: 'oficina', oficinaShelf: letter, benchSlot: slot, queued: false };
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
  if (loc.kind === 'oficina') {
    return loc.benchSlot != null ? `Oficina · ${loc.benchSlot}` : 'Oficina';
  }
  if (loc.kind === 'deposito' && loc.benchSlot != null) return `Laboratório · ${loc.benchSlot}`;
  if (loc.kind === 'fila') return 'Fila laboratório';
  return 'Sem local';
}

/**
 * Banner da etiqueta: número do compartimento (1–24), oficina ou laboratório.
 */
export function formatLabLocationLabelBanner(loc: LabLocationState): {
  tag: string;
  value: string;
} {
  if (loc.benchSlot != null && (loc.kind === 'deposito' || loc.kind === 'oficina')) {
    return { tag: '', value: String(loc.benchSlot).padStart(2, '0') };
  }
  if (loc.kind === 'fila') {
    return { tag: '', value: 'FILA' };
  }
  return { tag: '', value: '—' };
}
