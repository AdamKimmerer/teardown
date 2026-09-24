import type { TranscriptWord } from "@teardown/core/schemas/transcript";
import { sql } from "../client.js";

export type NewTranscriptWord = Omit<TranscriptWord, "id">;

// Replaces a chunk's words and marks it transcribed, in one transaction. The chunk row is locked
// first, so if two runs transcribe the same chunk (the queued job and the generate job's
// catch-up) they take turns and the second replaces the first instead of doubling the words.
export async function replaceChunkWords(
  chunkId: string,
  words: NewTranscriptWord[],
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      select id
      from audio_chunks
      where id = ${chunkId}
      for update
    `;
    await tx`
      delete from transcript_words
      where chunk_id = ${chunkId}
    `;
    if (words.length > 0) {
      const rows = words.map((w) => ({
        session_id: w.sessionId,
        chunk_id: w.chunkId,
        word: w.word,
        start_ms: w.startMs,
        end_ms: w.endMs,
        ordinal: w.ordinal,
      }));
      await tx`
        insert into transcript_words ${tx(rows, "session_id", "chunk_id", "word", "start_ms", "end_ms", "ordinal")}
      `;
    }
    await tx`
      update audio_chunks
      set status = 'transcribed'
      where id = ${chunkId}
    `;
  });
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
