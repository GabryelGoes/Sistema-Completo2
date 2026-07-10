import { storageThumbnailUrl } from "./storageThumbnailUrl";

/**
 * Comprime imagem no cliente para evitar 413 (Payload Too Large) no Vercel.
 * Limite típico do corpo da requisição em serverless é 4,5 MB.
 */

/** Corpo máx. ~4,5 MB no Vercel; multipart deixa margem para boundary. */
const DEFAULT_MAX_BYTES = 3 * 1024 * 1024; // 3 MB — alvo seguro antes do upload
const MAX_DIMENSION = 1920;
const JPEG_QUALITY_START = 0.88;
const JPEG_QUALITY_MIN = 0.5;

export function isAttachmentImageFile(blob: Blob, fileName = ""): boolean {
  if (blob.type.startsWith("image/")) return true;
  const name = fileName || (blob instanceof File ? blob.name : "");
  return /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i.test(name);
}

export function isAttachmentDocumentFile(blob: Blob, fileName = ""): boolean {
  if (isAttachmentImageFile(blob, fileName)) return false;
  const name = (fileName || (blob instanceof File ? blob.name : "")).toLowerCase();
  const type = (blob.type || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return true;
  if (
    type.startsWith("application/") ||
    type.startsWith("text/") ||
    /\.(pdf|docx?|xlsx?|txt|zip|rar|7z|csv|pptx?)$/i.test(name)
  ) {
    return true;
  }
  return !isAttachmentImageFile(blob, fileName) && (type === "" || type === "application/octet-stream");
}

/** Garante extensão coerente quando o SO não informa mime (comum em PDF no Android). */
export function normalizeAttachmentFileName(blob: Blob, fileName: string): string {
  let name = (fileName || (blob instanceof File ? blob.name : "") || "arquivo").trim();
  const type = (blob.type || "").toLowerCase();
  if (type === "application/pdf" && !/\.pdf$/i.test(name)) {
    name = `${name.replace(/\.+$/, "")}.pdf`;
  }
  return name || "arquivo";
}

function isImageType(blob: Blob, fileName = ""): boolean {
  if (blob.type.startsWith("image/")) return true;
  const name = fileName || (blob instanceof File ? blob.name : "");
  return /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i.test(name);
}

/** iPhone / iPad (inclui PWA no Safari). */
export function isIosUploadDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function inferAttachmentMimeFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (/\.jpe?g$/.test(n)) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".heic")) return "image/heic";
  if (n.endsWith(".heif")) return "image/heif";
  return "";
}

/**
 * Safari no iOS envia arquivos vazios quando o corpo vem de `new File([blob], …)` ou
 * quando a foto ainda está no iCloud. Lê o binário em memória antes do upload.
 */
export async function materializeBlobForUpload(blob: Blob, fileName = ""): Promise<Blob> {
  if (blob.size === 0) {
    throw new Error(
      "Arquivo vazio. No iPhone, aguarde a foto baixar do iCloud e tente novamente."
    );
  }
  const fromPicker = blob instanceof File;
  const shouldMaterialize = isIosUploadDevice() || !fromPicker;
  if (!shouldMaterialize) return blob;
  try {
    const buffer = await blob.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new Error(
        "Não foi possível ler o arquivo no iPhone. Escolha outra foto ou aguarde o download do iCloud."
      );
    }
    const type =
      blob.type || inferAttachmentMimeFromName(fileName) || "application/octet-stream";
    return new Blob([buffer], { type });
  } catch (e) {
    if (e instanceof Error && /iPhone|iCloud|vazio/i.test(e.message)) throw e;
    return blob;
  }
}

export type ServiceOrderUploadPayload = {
  blob: Blob;
  name: string;
  contentType: string;
};

/** Comprime (se imagem), normaliza nome e prepara Blob seguro para upload — sem `new File()` no Safari. */
export async function prepareServiceOrderUploadPayload(
  file: Blob,
  fileName: string,
  maxSizeBytes: number = DEFAULT_MAX_BYTES
): Promise<ServiceOrderUploadPayload> {
  const normalizedName = normalizeAttachmentFileName(file, fileName);
  const skipCompress = file.type === "image/jpeg" && file.size <= maxSizeBytes;
  let blob = skipCompress
    ? file
    : await compressImageForUpload(file, maxSizeBytes, normalizedName);
  const name =
    blob === file
      ? normalizedName
      : normalizedName.replace(/\.\w+$/i, ".jpg") || "photo.jpg";
  blob = await materializeBlobForUpload(blob, name);
  const contentType =
    blob.type || inferAttachmentMimeFromName(name) || "application/octet-stream";
  return { blob, name, contentType };
}

/**
 * Redimensiona e comprime um Blob/File de imagem para ficar sob maxSizeBytes.
 * Se não for imagem ou já estiver pequeno, devolve o mesmo blob.
 */
export function compressImageForUpload(
  blob: Blob,
  maxSizeBytes: number = DEFAULT_MAX_BYTES,
  fileName = ""
): Promise<Blob> {
  if (!isImageType(blob, fileName) || blob.size <= maxSizeBytes) {
    return Promise.resolve(blob);
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      let width = w;
      let height = h;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(blob);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      let quality = JPEG_QUALITY_START;

      const tryExport = (): void => {
        canvas.toBlob(
          (result) => {
            if (!result) {
              resolve(blob);
              return;
            }
            if (result.size <= maxSizeBytes || quality <= JPEG_QUALITY_MIN) {
              resolve(result);
              return;
            }
            quality -= 0.12;
            if (quality < JPEG_QUALITY_MIN) {
              resolve(result);
              return;
            }
            tryExport();
          },
          "image/jpeg",
          quality
        );
      };

      tryExport();
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };

    img.src = url;
  });
}

/** Baixa imagem para processamento no cliente (preserva cache-bust em URLs do Storage). */
export async function fetchImageBlob(url: string): Promise<Blob> {
  let fetchUrl = url;
  if (!url.startsWith("blob:") && !url.startsWith("data:")) {
    const qIndex = url.indexOf("?");
    fetchUrl =
      qIndex === -1
        ? `${url}?v=${Date.now()}`
        : url;
  }
  const response = await fetch(fetchUrl, { mode: "cors", cache: "no-store" });
  if (!response.ok) {
    throw new Error("Não foi possível carregar a imagem.");
  }
  return response.blob();
}

/** Versão mais leve para rotação (evita baixar o arquivo original inteiro). */
export async function fetchImageBlobForRotate(publicUrl: string): Promise<Blob> {
  if (publicUrl.startsWith("blob:") || publicUrl.startsWith("data:")) {
    return fetchImageBlob(publicUrl);
  }
  const optimized = storageThumbnailUrl(publicUrl, {
    maxWidth: 2048,
    maxHeight: 2048,
    quality: 88,
    format: "origin",
    resize: "contain",
  });
  try {
    return await fetchImageBlob(optimized);
  } catch {
    return fetchImageBlob(publicUrl);
  }
}

/** Gira um <img> já decodificado na tela (sem novo download). Só seguro com blob/data ou CORS. */
export function rotateImageElement(
  img: HTMLImageElement,
  direction: "cw" | "ccw",
  fileName?: string
): Promise<Blob> {
  const outputMime = outputMimeForImage(new Blob([], { type: img.type || "" }), fileName);
  const outputQuality = outputMime === "image/png" ? undefined : 0.85;

  return new Promise((resolve, reject) => {
    const clockwise = direction === "cw";
    const sourceW = img.naturalWidth;
    const sourceH = img.naturalHeight;
    if (!sourceW || !sourceH) {
      reject(new Error("Imagem ainda não carregou para rotação."));
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = sourceH;
    canvas.height = sourceW;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Não foi possível processar a imagem para rotação."));
      return;
    }
    if (clockwise) {
      ctx.translate(sourceH, 0);
      ctx.rotate(Math.PI / 2);
    } else {
      ctx.translate(0, sourceW);
      ctx.rotate(-Math.PI / 2);
    }
    ctx.drawImage(img, 0, 0, sourceW, sourceH);
    try {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error("Não foi possível processar a imagem para rotação."));
        },
        outputMime,
        outputQuality
      );
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Não foi possível exportar a imagem girada."));
    }
  });
}

/**
 * Gira imagem usando o <img> da tela quando seguro (blob/CORS); senão baixa via fetch.
 * Evita "Tainted canvases may not be exported" em URLs cross-origin sem CORS.
 */
export async function resolveRotatedImageBlob(
  direction: "cw" | "ccw",
  options: {
    url: string;
    name?: string;
    sourceImage?: HTMLImageElement | null;
  }
): Promise<Blob> {
  const { url, name, sourceImage } = options;
  const img = sourceImage;
  const imgReady = !!(img?.naturalWidth && img.naturalHeight);
  // Só blob/data são same-origin; URLs do Storage no <img> contaminam o canvas.
  const canUseElement =
    imgReady &&
    (img!.src.startsWith("blob:") || img!.src.startsWith("data:"));

  if (canUseElement) {
    try {
      return await rotateImageElement(img!, direction, name);
    } catch {
      // canvas tainted ou falha de export — fallback abaixo
    }
  }

  const fetchUrl =
    imgReady && img!.src.startsWith("blob:") ? img!.src : url;
  return rotateImageBlob(await fetchImageBlobForRotate(fetchUrl), direction, name);
}

function outputMimeForImage(blob: Blob, fileName?: string): string {
  if (blob.type.startsWith("image/")) return blob.type;
  const ext = (fileName || "").toLowerCase();
  if (ext.endsWith(".png")) return "image/png";
  if (ext.endsWith(".webp")) return "image/webp";
  if (ext.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

/** Gira imagem 90° no sentido horário ou anti-horário, preservando o formato quando possível. */
export function rotateImageBlob(
  blob: Blob,
  direction: "cw" | "ccw",
  fileName?: string
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    const outputMime = outputMimeForImage(blob, fileName);
    const outputQuality = outputMime === "image/png" ? undefined : 0.85;

    img.onload = () => {
      URL.revokeObjectURL(url);
      const clockwise = direction === "cw";
      const sourceW = img.naturalWidth;
      const sourceH = img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = sourceH;
      canvas.height = sourceW;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(blob);
        return;
      }
      if (clockwise) {
        ctx.translate(sourceH, 0);
        ctx.rotate(Math.PI / 2);
      } else {
        ctx.translate(0, sourceW);
        ctx.rotate(-Math.PI / 2);
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else resolve(blob);
        },
        outputMime,
        outputQuality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível processar a imagem para rotação."));
    };

    img.src = url;
  });
}
