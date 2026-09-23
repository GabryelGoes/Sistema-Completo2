/** Payload do QR de OS do Laboratório (pistola USB / Web Bluetooth). */

export const LAB_OS_QR_PREFIX = 'RDA-OS:';

const UUID_RE =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/**
 * Algumas pistolas USB (HID wedge) assumem teclado US enquanto o SO usa outro layout.
 * Ex.: hífen vira `;` e dois-pontos vira `>`:
 *   RDA-OS:abed…  →  RDA;OS>abed…;…
 * Também há leitores que trocam `-` por `/`.
 */
function normalizeLabOsScanText(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .replace(/;/g, '-')
    .replace(/\//g, '-')
    .replace(/>/g, ':')
    .replace(/：/g, ':'); // fullwidth colon
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

  // Prefixo deformado pelo layout do teclado + UUID padrão.
  const flexible = s.match(
    new RegExp(`RDA[-_.]?OS[:\\-_.>](${UUID_RE})`, 'i')
  );
  if (flexible?.[1]) return flexible[1];

  // Último recurso: UUID colado após "RDAOS" / "RDA-OS" sem separador claro.
  const glued = s.match(new RegExp(`RDA[-_]?OS(${UUID_RE})`, 'i'));
  if (glued?.[1]) return glued[1];

  return null;
}

export function isLabOsQrPayload(raw: string): boolean {
  return parseLabOsQrPayload(raw) != null;
}
