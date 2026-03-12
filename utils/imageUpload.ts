/**
 * Comprime imagem no cliente para evitar 413 (Payload Too Large) no Vercel.
 * Limite típico do corpo da requisição em serverless é 4,5 MB.
 */

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_DIMENSION = 1920;
const JPEG_QUALITY_START = 0.88;
const JPEG_QUALITY_MIN = 0.5;

function isImageType(blob: Blob): boolean {
  return blob.type.startsWith("image/");
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
