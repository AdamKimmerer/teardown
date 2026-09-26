-- 0002: a chunk's words live on the chunk. Words are written one chunk at a time and read one
-- session at a time; nothing queries a single word. A row per word forced a lock/delete/insert
-- transaction, an ordinal column, and an unindexed chunk_id foreign key. One jsonb array per
-- chunk removes all three: saving a chunk's transcript becomes a single-row update.

-- 1. The words, each { "word": string, "startMs": int, "endMs": int }, already rebased onto the
--    session clock and stored in spoken order (array order replaces ordinal). The check states
--    the rule; in practice Postgres computes word_count (below) before checking constraints, so
--    a non-array is rejected with "cannot get array length of a non-array".
alter table audio_chunks
  add column words jsonb not null default '[]'::jsonb;

alter table audio_chunks
  add constraint audio_chunks_words_is_array check (jsonb_typeof(words) = 'array');

-- 2. The count, computed by Postgres from the array so it can never drift from the words.
alter table audio_chunks
  add column word_count integer generated always as (jsonb_array_length(words)) stored;

-- 3. Backfill from transcript_words, one array per chunk in ordinal order, so sessions recorded
--    before this migration keep their transcripts.
update audio_chunks a
set words = w.words
from (
  select
    chunk_id,
    jsonb_agg(
      jsonb_build_object('word', word, 'startMs', start_ms, 'endMs', end_ms)
      order by ordinal
    ) as words
  from transcript_words
  group by chunk_id
) w
where w.chunk_id = a.id;

-- 4. The old table, with its index (it had RLS enabled and no policies).
drop table transcript_words;
