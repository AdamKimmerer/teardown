import { z } from "zod";

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_API_URL: z.url(),
});

const env = EnvSchema.parse(import.meta.env);

// The web app's settings, read once from apps/web/.env at build time. Nothing else reads
// import.meta.env; import this instead.
export const config = {
  supabaseUrl: env.VITE_SUPABASE_URL,
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY,
  apiUrl: env.VITE_API_URL.replace(/\/$/, ""),
};
