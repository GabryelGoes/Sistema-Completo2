/** Detecção de vídeo/imagem para upload da TV (mime ou extensão — celulares costumam omitir o type). */

const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".webm",
  ".m4v",
  ".avi",
  ".mkv",
  ".3gp",
  ".mpeg",
  ".mpg",
]);

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);

export const TV_VIDEO_ACCEPT = "video/*,.mp4,.mov,.m4v,.webm,.avi,.mkv,.3gp";

export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function isTvVideoFile(file: Pick<File, "type" | "name">): boolean {
  const type = String(file.type || "").toLowerCase();
  if (type.startsWith("video/")) return true;
  return VIDEO_EXTENSIONS.has(fileExtension(file.name));
}

export function isTvImageFile(file: Pick<File, "type" | "name">): boolean {
  const type = String(file.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  return IMAGE_EXTENSIONS.has(fileExtension(file.name));
}

const VIDEO_MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".3gp": "video/3gpp",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
};

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

export type TvUploadMediaKind = "video" | "image";

export function resolveTvUploadMime(
  mimetype: string,
  originalname: string
): { mime: string; kind: TvUploadMediaKind | null } {
  const mt = String(mimetype || "").toLowerCase().trim();
  if (mt.startsWith("image/")) return { mime: mt, kind: "image" };
  if (mt.startsWith("video/")) return { mime: mt, kind: "video" };
  const ext = fileExtension(originalname);
  if (VIDEO_MIME_BY_EXT[ext]) return { mime: VIDEO_MIME_BY_EXT[ext], kind: "video" };
  if (IMAGE_MIME_BY_EXT[ext]) return { mime: IMAGE_MIME_BY_EXT[ext], kind: "image" };
  return { mime: mt || "application/octet-stream", kind: null };
}
