/**
 * SEC-03.30 — tipo da foto de unidade ABS.
 * A rota só guarda imagem de câmera ou arquivo. SVG e HTML não entram,
 * mesmo quando o cliente anuncia image/*.
 */

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/bmp",
]);

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/bmp": "bmp",
};

function typeFromName(fileName: string): string | null {
  const name = fileName.toLowerCase();
  if (name.endsWith(".svg") || name.endsWith(".html") || name.endsWith(".htm") || name.endsWith(".xml")) {
    return null;
  }
  if (name.endsWith(".png")) return "image/png";
  if (/\.jpe?g$/.test(name)) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  if (name.endsWith(".bmp")) return "image/bmp";
  return null;
}

/** Tipo aceito para gravar a foto da unidade. Fora da lista, o upload não começa. */
export function acceptedAbsModulePhotoContentType(fileName: string, rawType?: unknown): string | null {
  const announced = String(rawType ?? "").split(";")[0].trim().toLowerCase();
  if (
    announced === "image/svg+xml" ||
    announced === "text/html" ||
    announced === "application/xhtml+xml" ||
    announced.includes("javascript")
  ) {
    return null;
  }
  const fromName = typeFromName(fileName);
  if (fromName && (!announced || announced === fromName || announced === "application/octet-stream" || announced === "image/*")) {
    return fromName;
  }
  if (fromName && announced && announced !== fromName) return null;
  if (ALLOWED.has(announced)) return announced;
  return null;
}

export function absModulePhotoExtension(contentType: string): string {
  return EXTENSION[contentType] || "jpg";
}
