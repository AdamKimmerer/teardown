import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

// The browser's Supabase client, used for sign-in and nothing else: all data goes through the
// API (build plan §Stack). PKCE flow; the callback page exchanges the code explicitly
// (detectSessionInUrl off) so there is one obvious place where sign-in completes.
export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseAnonKey,
  {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
