/**
 * SEC-03.29 — caminho e tipo dos anexos da OS.
 * O objeto fica em `{oficina}/{os}/...`. `..` e barra invertida não atravessam a pasta.
 * O tipo anunciado pelo cliente só vale quando está na lista e combina com a extensão.
 */

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/bmp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

export function contentTypeForServiceOrderFileName(fileName: string): string | null {
  const name = fileName.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (/\.jpe?g$/.test(name)) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".heic") || name.endsWith(".heif")) return "image/heic";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (name.endsWith(".doc")) return "application/msword";
  if (name.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (name.endsWith(".xls")) return "application/vnd.ms-excel";
  if (name.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (name.endsWith(".txt")) return "text/plain";
  return null;
}

/** Tipo aceito para gravar. Fora da lista, o upload não começa. */
export function acceptedServiceOrderPhotoContentType(fileName: string, rawType?: unknown): string | null {
  const fromName = contentTypeForServiceOrderFileName(fileName);
  const type = String(rawType ?? "").trim().toLowerCase();
  if (fromName) return fromName;
  if (type && type !== "application/octet-stream" && ALLOWED_CONTENT_TYPES.has(type)) return type;
  return null;
}

export function isSafeServiceOrderPhotoPath(
  workshopId: string,
  serviceOrderId: string,
  objectPath: string
): boolean {
  const workshop = workshopId.trim();
  const order = serviceOrderId.trim();
  const path = objectPath.trim();
  if (!workshop || !order || !path) return false;
  if (path.includes("..") || path.includes("\\") || path.includes("\0")) return false;
  const prefix = `${workshop}/${order}/`;
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  if (!rest || rest.startsWith("/") || rest.endsWith("/") || rest.includes("//")) return false;
  return true;
}
