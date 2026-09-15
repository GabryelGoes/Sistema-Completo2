/** Payload do QR de OS do Laboratório (pistola USB / Web Bluetooth). */

export const LAB_OS_QR_PREFIX = 'RDA-OS:';

/** Monta o texto embutido no QR (único e estável por OS). */
export function buildLabOsQrPayload(serviceOrderId: string): string {
  const id = String(serviceOrderId ?? '').trim();
  if (!id) throw new Error('ID da OS ausente');
  return `${LAB_OS_QR_PREFIX}${id}`;
}

/** Extrai o id da OS a partir do texto lido pela pistola/câmera. */
export function parseLabOsQrPayload(raw: string): string | null {
  const s = String(raw ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
  if (!s) return null;
  const upper = s.toUpperCase();
  if (upper.startsWith(LAB_OS_QR_PREFIX.toUpperCase())) {
    const id = s.slice(LAB_OS_QR_PREFIX.length).trim();
    return id || null;
  }
  // Aceita variante sem hífen: RDAOS:uuid
  if (upper.startsWith('RDAOS:')) {
    const id = s.slice(6).trim();
    return id || null;
  }
  return null;
}

export function isLabOsQrPayload(raw: string): boolean {
  return parseLabOsQrPayload(raw) != null;
}
