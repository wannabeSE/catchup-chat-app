import { createClient } from "@supabase/supabase-js";
import { useRuntimeConfig } from "nuxt/app";
export const useSupabase = () => {
  const config = useRuntimeConfig();

  const supabase = createClient(
    config.public.SUPABASE_PROJECT_URL,
    config.public.SUPABASE_ANON_KEY
  );

  return { supabase };
};
