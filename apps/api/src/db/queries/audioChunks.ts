import type {
  AudioChunk,
  AudioChunkStatus,
} from "@teardown/core/schemas/transcript";
import { sql } from "../client.js";

type ChunkRow = {
  id: string;
  session_id: string;
  offset_ms: number;
  duration_ms: number;
  storage_path: string;
  status: AudioChunkStatus;
  created_at: Date;
};

const columns = sql`
  id, session_id, offset_ms, duration_ms, storage_path, status, created_at
`;

function chunkFromRow(row: ChunkRow): AudioChunk {
  return {
    id: row.id,
    sessionId: row.session_id,
    offsetMs: row.offset_ms,
    durationMs: row.duration_ms,
    storagePath: row.storage_path,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

// Registers an uploaded chunk. A re-registration of the same offset (a retried request) reuses
// the row and resets it to 'uploaded' so the transcription runs again on the new bytes.
export async function upsertChunk(
  sessionId: string,
  offsetMs: number,
  durationMs: number,
  storagePath: string,
): Promise<AudioChunk> {
  const rows = await sql<ChunkRow[]>`
    insert into audio_chunks (session_id, offset_ms, duration_ms, storage_path)
    values (${sessionId}, ${offsetMs}, ${durationMs}, ${storagePath})
    on conflict (session_id, offset_ms) do update set
      duration_ms = excluded.duration_ms,
      storage_path = excluded.storage_path,
      status = 'uploaded'
    returning ${columns}
  `;
  return chunkFromRow(rows[0]!);
}

export async function findChunk(chunkId: string): Promise<AudioChunk | null> {
  const rows = await sql<ChunkRow[]>`
    select ${columns}
    from audio_chunks
    where id = ${chunkId}
  `;
  return rows[0] ? chunkFromRow(rows[0]) : null;
}

export async function updateChunkStatus(
  chunkId: string,
  status: AudioChunkStatus,
): Promise<void> {
  await sql`
    update audio_chunks
    set status = ${status}
    where id = ${chunkId}
  `;
}

// Where the audio before this chunk ends on the session clock, or 0 if this is the first chunk.
// Chunks overlap by about a second; words that start before this point belong to the earlier
// chunk (the transcription job drops them).
export async function previousChunkEndMs(
  sessionId: string,
  offsetMs: number,
): Promise<number> {
  const rows = await sql<{ end_ms: number | null }[]>`
    select max(offset_ms + duration_ms)::int as end_ms
    from audio_chunks
    where session_id = ${sessionId}
      and offset_ms < ${offsetMs}
  `;
  return rows[0]?.end_ms ?? 0;
}

// Every chunk of a session, in recording order.
export async function listChunksForSession(
  sessionId: string,
): Promise<AudioChunk[]> {
  const rows = await sql<ChunkRow[]>`
    select ${columns}
    from audio_chunks
    where session_id = ${sessionId}
    order by offset_ms
  `;
  return rows.map(chunkFromRow);
}
