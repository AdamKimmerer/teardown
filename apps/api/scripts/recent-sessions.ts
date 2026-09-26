// Prints the most recent sessions with what the server holds for each: captures, audio chunks
// by status, words, and the transcribed audio length. For checking an extension session by hand.
//
//   pnpm --filter @teardown/api recent-sessions
import { sql } from "../src/db/client.js";

const rows = await sql`
  select s.id, s.status, s.started_at, s.stopped_at,
    (select count(*)::int from captures c where c.session_id = s.id) as captures,
    (select count(*)::int from audio_chunks a where a.session_id = s.id) as chunks,
    (select count(*)::int from audio_chunks a where a.session_id = s.id and a.status = 'transcribed') as transcribed,
    (select count(*)::int from audio_chunks a where a.session_id = s.id and a.status = 'failed') as failed,
    (select coalesce(sum(a.word_count), 0)::int from audio_chunks a where a.session_id = s.id) as words,
    (select round(sum(audio_seconds)::numeric, 1) from usage_events u where u.session_id = s.id) as audio_s
  from sessions s
  order by s.created_at desc
  limit 5
`;
console.table(rows);
await sql.end();
