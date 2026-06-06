export type StorageThumbOptions = {
  maxWidth?: number;
  /** Com `resize=cover`, limita também a altura decodificada (miniaturas quadradas menores). */
  maxHeight?: number;
  resize?: "cover" | "contain" | "fill";
  /** 20–100; valores menores = arquivo menor (padrão mais agressivo para miniaturas). */
  quality?: number;
  /** WebP costuma ser bem menor que JPEG; use `origin` para manter formato original. */
  format?: "webp" | "origin";
};

/**
 * Converte URL pública do Storage Supabase (`.../object/public/...`) em URL do endpoint
 * de transformação (`.../render/image/public/...`) para servir miniaturas mais leves.
 * Se o projeto não tiver Image Transformation habilitado, o `<img onError>` deve voltar à URL original.
 */
export function storageThumbnailUrl(publicUrl: string, options?: StorageThumbOptions): string {
  if (!publicUrl || publicUrl.startsWith("blob:")) return publicUrl;
  const maxW = options?.maxWidth ?? 200;
  const maxH = options?.maxHeight;
  const q = options?.quality ?? 52;
  const format = options?.format ?? "webp";
  const marker = "/storage/v1/object/public/";
  const i = publicUrl.indexOf(marker);
  if (i === -1) return publicUrl;
  const qIndex = publicUrl.indexOf("?");
  const baseNoQuery = qIndex === -1 ? publicUrl : publicUrl.slice(0, qIndex);
  const cacheQuery = qIndex === -1 ? "" : publicUrl.slice(qIndex + 1);
  const cacheBust = cacheQuery.match(/(?:^|&)(v=[^&]+)/)?.[1];
  const originEnd = baseNoQuery.indexOf(marker);
  const origin = baseNoQuery.slice(0, originEnd);
  const rest = baseNoQuery.slice(originEnd + marker.length);
  if (!rest) return publicUrl;
  const fmt = format === "origin" ? "origin" : "webp";
  let query = `width=${maxW}&quality=${q}&format=${fmt}`;
  if (maxH != null && Number.isFinite(maxH)) {
    const h = Math.round(maxH);
    const resize = options?.resize ?? "cover";
    query += `&height=${h}&resize=${resize}`;
  }
  let url = `${origin}/storage/v1/render/image/public/${rest}?${query}`;
  if (cacheBust) url += `&${cacheBust}`;
  return url;
}

/** URL otimizada para visualização em tela cheia (lightbox) — menor que o original. */
export function storageDisplayUrl(publicUrl: string, maxWidth = 1400): string {
  return storageThumbnailUrl(publicUrl, {
    maxWidth,
    quality: 80,
    format: "webp",
    resize: "contain",
  });
}

export function bustStoragePublicUrl(publicUrl: string): string {
  const base = publicUrl.split("?")[0] ?? publicUrl;
  return `${base}?v=${Date.now()}`;
}
