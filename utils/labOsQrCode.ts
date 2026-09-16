/** Payload do QR de OS do Laboratório (pistola USB / Web Bluetooth). */

export const LAB_OS_QR_PREFIX = 'RDA-OS:';

/**
 * Algumas pistolas USB (HID wedge) assumem teclado US enquanto o SO usa outro layout.
 * Ex.: hífen vira `;` e dois-pontos vira `>`:
 *   RDA-OS:abed…  →  RDA;OS>abed…;…
 */
function normalizeLabOsScanText(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .replace(/;/g, '-')
    .replace(/>/g, ':');
}

/** Monta o texto embutido no QR (único e estável por OS). */
export function buildLabOsQrPayload(serviceOrderId: string): string {
  const id = String(serviceOrderId ?? '').trim();
  if (!id) throw new Error('ID da OS ausente');
  return `${LAB_OS_QR_PREFIX}${id}`;
}

/** Extrai o id da OS a partir do texto lido pela pistola/câmera. */
export function parseLabOsQrPayload(raw: string): string | null {
  const s = normalizeLabOsScanText(raw);
  if (!s) return null;
  const upper = s.toUpperCase();
  if (upper.startsWith(LAB_OS_QR_PREFIX.toUpperCase())) {
    const id = s.slice(LAB_OS_QR_PREFIX.length);
    return id || null;
  }
  // Aceita variante sem hífen: RDAOS:uuid
  if (upper.startsWith('RDAOS:')) {
    const id = s.slice(6);
    return id || null;
  }
  return null;
}

export function isLabOsQrPayload(raw: string): boolean {
  return parseLabOsQrPayload(raw) != null;
}
