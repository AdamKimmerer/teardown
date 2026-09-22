// Values baked in by build.mjs from apps/extension/.env. Declared here so TypeScript knows them;
// esbuild replaces each identifier with a string literal.
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;
declare const __API_URL__: string;
declare const __WEB_APP_URL__: string;

export const buildConfig = {
  supabaseUrl: __SUPABASE_URL__,
  supabaseAnonKey: __SUPABASE_ANON_KEY__,
  apiUrl: __API_URL__,
  webAppUrl: __WEB_APP_URL__,
};
