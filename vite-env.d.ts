/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** Mesmo valor que `WORKSHOP_ID` no servidor — filtros Realtime (lembretes / hub orçamentos). */
  readonly VITE_WORKSHOP_ID?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_TV_PATIO_BUCKET?: string;
  /** Opcional: bucket de fotos/anexos da OS (padrão no servidor: vehicle-photos). */
  readonly VITE_SUPABASE_VEHICLE_PHOTOS_BUCKET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
