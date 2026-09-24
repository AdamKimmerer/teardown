import { supabaseAdmin } from "../supabaseAdmin.js";

// Supabase Storage through the service-role client. It bypasses bucket policies, which is why
// every path it touches is built by objectKeys.ts from the caller's own user id.
export const storage = supabaseAdmin.storage;

export const BUCKETS = {
  originals: "originals",
  crops: "crops",
  audio: "audio",
  exports: "exports",
} as const;

export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];
