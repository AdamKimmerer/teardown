import type { TranscriptWord } from "@teardown/core/schemas/transcript";
import { sql } from "../client.js";

export type NewTranscriptWord = Omit<TranscriptWord, "id">;

// Bulk insert of one chunk's words, already rebased to the session clock by the caller.
export async function insertTranscriptWords(
  words: NewTranscriptWord[],
): Promise<void> {
  if (words.length === 0) return;
  const rows = words.map((w) => ({
    session_id: w.sessionId,
    chunk_id: w.chunkId,
    word: w.word,
    start_ms: w.startMs,
    end_ms: w.endMs,
    ordinal: w.ordinal,
  }));
  await sql`
    insert into transcript_words ${sql(rows, "session_id", "chunk_id", "word", "start_ms", "end_ms", "ordinal")}
  `;
}

// A retried transcription must not double the words, so the job clears the chunk's rows first.
export async function deleteTranscriptWordsForChunk(
  chunkId: string,
): Promise<void> {
  await sql`
    delete from transcript_words
    where chunk_id = ${chunkId}
  `;
}

// The whole transcript in spoken order (start time, then position within the chunk).
export async function listTranscriptWordsForSession(
  sessionId: string,
): Promise<TranscriptWord[]> {
  const rows = await sql<
    {
      id: string;
      session_id: string;
      chunk_id: string;
      word: string;
      start_ms: number;
      end_ms: number;
      ordinal: number;
    }[]
  >`
    select id, session_id, chunk_id, word, start_ms, end_ms, ordinal
    from transcript_words
    where session_id = ${sessionId}
    order by start_ms, ordinal
  `;
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    chunkId: row.chunk_id,
    word: row.word,
    startMs: row.start_ms,
    endMs: row.end_ms,
    ordinal: row.ordinal,
  }));
}

export async function countTranscriptWordsForSession(
  sessionId: string,
): Promise<number> {
  const rows = await sql<{ count: number }[]>`
    select count(*)::int as count
    from transcript_words
    where session_id = ${sessionId}
  `;
  return rows[0]?.count ?? 0;
}
