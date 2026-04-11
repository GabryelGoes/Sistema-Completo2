/**
 * Converte URL pública do Storage Supabase (`.../object/public/...`) em URL do endpoint
 * de transformação (`.../render/image/public/...`) para servir miniaturas mais leves.
 * Se o projeto não tiver Image Transformation habilitado, o `<img onError>` deve voltar à URL original.
 */
export function storageThumbnailUrl(
  publicUrl: string,
  options?: { maxWidth?: number; quality?: number }
): string {
  if (!publicUrl || publicUrl.startsWith("blob:")) return publicUrl;
  const maxW = options?.maxWidth ?? 420;
  const q = options?.quality ?? 78;
  const marker = "/storage/v1/object/public/";
  const i = publicUrl.indexOf(marker);
  if (i === -1) return publicUrl;
  const [baseNoQuery] = publicUrl.split("?");
  const originEnd = baseNoQuery.indexOf(marker);
  const origin = baseNoQuery.slice(0, originEnd);
  const rest = baseNoQuery.slice(originEnd + marker.length);
  if (!rest) return publicUrl;
  return `${origin}/storage/v1/render/image/public/${rest}?width=${maxW}&quality=${q}`;
}
