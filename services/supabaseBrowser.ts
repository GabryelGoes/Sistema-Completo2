import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase no browser (anon key) para **Realtime** direto no cliente,
 * sem passar por rotas longas na Vercel (SSE).
 * Exige `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no build.
 */
let cached: SupabaseClient | null | undefined;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}
