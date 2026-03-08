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

