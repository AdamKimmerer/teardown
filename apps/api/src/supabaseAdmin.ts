import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

// The service-role Supabase client: Storage and the Auth admin API. It bypasses RLS and bucket
// policies, so everything that uses it scopes its work to the caller's own user id.
export const supabaseAdmin = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
