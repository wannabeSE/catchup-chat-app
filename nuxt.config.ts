// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  css: ["./app/assets/css/main.css"],
  vite: {
    plugins: [tailwindcss()],
  },
  runtimeConfig: {
    public: {
      SUPABASE_PROJECT_URL: process.env.SUPABASE_PROJECT_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    }
  }
});
