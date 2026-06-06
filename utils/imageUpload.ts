/**
 * Comprime imagem no cliente para evitar 413 (Payload Too Large) no Vercel.
 * Limite típico do corpo da requisição em serverless é 4,5 MB.
 */

/** Corpo máx. ~4,5 MB no Vercel; multipart deixa margem para boundary. */
const DEFAULT_MAX_BYTES = 3 * 1024 * 1024; // 3 MB — alvo seguro antes do upload
const MAX_DIMENSION = 1920;
const JPEG_QUALITY_START = 0.88;
const JPEG_QUALITY_MIN = 0.5;

function isImageType(blob: Blob): boolean {
  if (blob.type.startsWith("image/")) return true;
  // Tablets/Android às vezes enviam screenshot com type vazio ou genérico; inferir pela extensão.
  if (blob instanceof File && blob.name) {
    return /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i.test(blob.name);
  }
  return false;
}

/**
 * Redimensiona e comprime um Blob/File de imagem para ficar sob maxSizeBytes.
 * Se não for imagem ou já estiver pequeno, devolve o mesmo blob.
 */
export function compressImageForUpload(
  blob: Blob,
  maxSizeBytes: number = DEFAULT_MAX_BYTES
): Promise<Blob> {
  if (!isImageType(blob) || blob.size <= maxSizeBytes) {
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

/** Baixa imagem pública (Storage) para processamento no cliente. */
export async function fetchImageBlob(url: string): Promise<Blob> {
  const response = await fetch(url.split("?")[0], { mode: "cors", cache: "no-store" });
  if (!response.ok) {
    throw new Error("Não foi possível carregar a imagem.");
  }
  return response.blob();
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
    const outputQuality = outputMime === "image/png" ? undefined : 0.92;

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
