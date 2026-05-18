import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    "[Supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados. " +
      "Verifique seu arquivo .env."
  );
}

export const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

export const VEHICLE_PHOTOS_BUCKET =
  process.env.SUPABASE_VEHICLE_PHOTOS_BUCKET || "vehicle-photos";

/** Bucket Storage para imagens/vídeos da TV do pátio (público leitura). */
export const TV_PATIO_BUCKET = process.env.SUPABASE_TV_PATIO_BUCKET || "tv-patio";

/** Bucket Storage para anexos do Boletim de Erros (público leitura). */
export const ERROR_BULLETINS_BUCKET =
  process.env.SUPABASE_ERROR_BULLETINS_BUCKET || "error-bulletins";

export const QUALITY_INCIDENTS_BUCKET =
  process.env.SUPABASE_QUALITY_INCIDENTS_BUCKET || "quality-incidents";

