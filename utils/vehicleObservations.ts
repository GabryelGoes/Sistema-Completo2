export type VehicleObservationItem = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
};

type StoredPayload = {
  v: 1;
  items: VehicleObservationItem[];
};

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `obs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Aceita JSON da lista ou texto legado (vira 1 item). */
export function parseVehicleObservations(raw: string | null | undefined): VehicleObservationItem[] {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<StoredPayload>;
      if (parsed?.v === 1 && Array.isArray(parsed.items)) {
        return parsed.items
          .filter((item) => item && typeof item.text === 'string' && item.text.trim())
          .map((item, i) => ({
            id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `legacy-${i}`,
            text: item.text.trim(),
            createdAt:
              typeof item.createdAt === 'string' && item.createdAt
                ? item.createdAt
                : new Date().toISOString(),
            updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
          }));
      }
    } catch {
      /* legado */
    }
  }

  // Texto legado: uma observação por bloco separado por linhas em branco; senão um único item.
  const blocks = trimmed
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length > 1) {
    return blocks.map((text, i) => ({
      id: `legacy-${i}`,
      text,
      createdAt: new Date().toISOString(),
    }));
  }

  return [
    {
      id: 'legacy-0',
      text: trimmed,
      createdAt: new Date().toISOString(),
    },
  ];
}

export function serializeVehicleObservations(items: VehicleObservationItem[]): string | null {
  const cleaned = items
    .map((item) => ({
      ...item,
      text: item.text.trim(),
    }))
    .filter((item) => item.text);
  if (cleaned.length === 0) return null;
  const payload: StoredPayload = { v: 1, items: cleaned };
  return JSON.stringify(payload);
}

export function createVehicleObservation(text: string): VehicleObservationItem {
  const now = new Date().toISOString();
  return {
    id: newId(),
    text: text.trim(),
    createdAt: now,
  };
}

export function formatObservationWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
