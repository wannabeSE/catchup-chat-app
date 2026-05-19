import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useRuntimeConfig } from "nuxt/app";

/**
 * Single Supabase client per Nuxt app instance. Creating `createClient()` in
 * every caller caused multiple GoTrueClient instances and storage-key warnings.
 */
export const useSupabase = () => {
  const config = useRuntimeConfig();
  const url = String(config.public.SUPABASE_PROJECT_URL ?? "").trim();
  const anonKey = String(config.public.SUPABASE_ANON_KEY ?? "").trim();

  if (import.meta.dev && (!url || !anonKey)) {
    console.error(
      "[supabase] SUPABASE_PROJECT_URL and SUPABASE_ANON_KEY must be set (e.g. in .env). Realtime and REST will fail until they are defined.",
    );
  }

  const supabase = useState<SupabaseClient>("supabase-js-client", () =>
    createClient(url, anonKey),
  );

  return { supabase: supabase.value };
};
