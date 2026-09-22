// Prints the latest usage_events rows: "what did this session cost" (build plan, Phase 9 asks
// the same question of a query; this is the quick version for checking Phase 2 and 4 by hand).
//
//   pnpm --filter @teardown/api usage-events
import { sql } from "../src/db/client.js";

const rows = await sql`
  select kind, model, audio_seconds, input_tokens, output_tokens, image_count,
         cost_usd_estimate, session_id, created_at
  from usage_events
  order by created_at desc
  limit 10
`;
console.table(rows);
await sql.end();
