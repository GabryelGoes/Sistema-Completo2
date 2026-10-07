/** Modo da pistola no Laboratório — persiste no dispositivo. */

export type LabScanMode = 'consultar' | 'saida' | 'retorno';

export const LAB_SCAN_MODE_OPTIONS: Array<{
  id: LabScanMode;
  label: string;
  hint: string;
}> = [
  {
    id: 'consultar',
    label: 'Consultar',
    hint: 'Abre o modal rápido da OS',
  },
  {
    id: 'saida',
    label: 'Saída → Depósito',
    hint: 'Oficina → Depósito (técnico levando)',
  },
  {
    id: 'retorno',
    label: 'Retorno → Oficina',
    hint: 'Depósito → Oficina (técnico trazendo)',
  },
];

const STORAGE_KEY = 'rda.labScanMode.v1';

export function loadLabScanMode(): LabScanMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'saida' || raw === 'retorno' || raw === 'consultar') return raw;
  } catch {
    /* ignore */
  }
  return 'consultar';
}

export function saveLabScanMode(mode: LabScanMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
