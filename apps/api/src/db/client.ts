import postgres from "postgres";
import { config } from "../config.js";

// The process's one connection pool. prepare: false because Supabase's transaction-mode pooler
// does not support prepared statements; harmless on a direct connection.
export const sql = postgres(config.DATABASE_URL, {
  prepare: false,
  max: 10,
});
