import { getSupabaseBrowser } from "../services/supabaseBrowser";

const DEFAULT_VEHICLE_PHOTOS_BUCKET = "vehicle-photos";

function bucketName(): string {
  const v = (import.meta.env.VITE_SUPABASE_VEHICLE_PHOTOS_BUCKET as string | undefined)?.trim();
  return v || DEFAULT_VEHICLE_PHOTOS_BUCKET;
}

/**
 * URL pública de um objeto no bucket de fotos/anexos da OS (mesmo usado pela API).
 * Funciona com `VITE_SUPABASE_URL` mesmo sem cliente JS (fallback por string).
 */
export function getVehiclePhotoPublicUrl(pathInBucket: string | null | undefined): string | null {
  const path = (pathInBucket ?? "").trim();
  if (!path) return null;
  const bucket = bucketName();
  const sb = getSupabaseBrowser();
  if (sb) {
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()?.replace(/\/$/, "");
  if (!base) return null;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${bucket}/${encodedPath}`;
}
