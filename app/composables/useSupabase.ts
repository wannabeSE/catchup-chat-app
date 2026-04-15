import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useRuntimeConfig } from "nuxt/app";

/**
 * Single Supabase client per Nuxt app instance. Creating `createClient()` in
 * every caller caused multiple GoTrueClient instances and storage-key warnings.
 */
export const useSupabase = () => {
  const config = useRuntimeConfig();

  const supabase = useState<SupabaseClient>("supabase-js-client", () =>
    createClient(
      config.public.SUPABASE_PROJECT_URL as string,
      config.public.SUPABASE_ANON_KEY as string,
    ),
  );

  return { supabase: supabase.value };
};
