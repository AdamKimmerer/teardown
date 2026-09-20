import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

// The service-role Storage client. It bypasses RLS and bucket policies, which is why every
// path it touches is built by objectKeys.ts from the caller's own user id.
export const storage = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
).storage;

export const BUCKETS = {
  originals: "originals",
  crops: "crops",
  audio: "audio",
  exports: "exports",
} as const;

export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];
