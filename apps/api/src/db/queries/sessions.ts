import type { TransactionSql } from "postgres";
import type { Session, SessionStatus } from "@teardown/core/schemas/session";
import type { SessionListItem } from "@teardown/core/api-contract";
import { sql } from "../client.js";

type SessionRow = {
  id: string;
  user_id: string;
  status: SessionStatus;
  started_at: Date;
  paused_ms: number;
  stopped_at: Date | null;
  title: string | null;
  failed_step: string | null;
  created_at: Date;
};

const columns = sql`
  id, user_id, status, started_at, paused_ms, stopped_at, title, failed_step, created_at
`;

function sessionFromRow(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    pausedMs: row.paused_ms,
    stoppedAt: row.stopped_at?.toISOString() ?? null,
    title: row.title,
    failedStep: row.failed_step,
    createdAt: row.created_at.toISOString(),
  };
}

// Starts a session at the clock epoch the client will use for every timestamp.
export async function createSession(
  userId: string,
  startedAt: string,
): Promise<Session> {
  const rows = await sql<SessionRow[]>`
    insert into sessions (user_id, started_at)
    values (${userId}, ${startedAt})
    returning ${columns}
  `;
  return sessionFromRow(rows[0]!);
}

// A user's session, or null: a session belonging to someone else looks exactly like a missing one.
export async function findOwnedSession(
  userId: string,
  sessionId: string,
): Promise<Session | null> {
  const rows = await sql<SessionRow[]>`
    select ${columns}
    from sessions
    where id = ${sessionId}
      and user_id = ${userId}
  `;
  return rows[0] ? sessionFromRow(rows[0]) : null;
}

// A session by id alone; for workers, which have no caller to check against.
export async function findSession(sessionId: string): Promise<Session | null> {
  const rows = await sql<SessionRow[]>`
    select ${columns}
    from sessions
    where id = ${sessionId}
  `;
  return rows[0] ? sessionFromRow(rows[0]) : null;
}

// The library list: newest first, with a capture count per session.
export async function listSessionsForUser(
  userId: string,
): Promise<SessionListItem[]> {
  const rows = await sql<(SessionRow & { capture_count: number })[]>`
    select ${columns},
      (select count(*)::int from captures where captures.session_id = sessions.id) as capture_count
    from sessions
    where user_id = ${userId}
    order by created_at desc
  `;
  return rows.map((row) => ({
    ...sessionFromRow(row),
    captureCount: row.capture_count,
  }));
}

// Recording → review, recording the final clock state the client reports.
export async function stopSession(
  sessionId: string,
  stoppedAt: string,
  pausedMs: number,
): Promise<Session> {
  const rows = await sql<SessionRow[]>`
    update sessions
    set status = 'review',
        stopped_at = ${stoppedAt},
        paused_ms = ${pausedMs}
    where id = ${sessionId}
    returning ${columns}
  `;
  return sessionFromRow(rows[0]!);
}

// Review → recording ("keep going"). The stop time is cleared; pausedMs now covers the gap.
export async function resumeSession(
  sessionId: string,
  pausedMs: number,
): Promise<Session> {
  const rows = await sql<SessionRow[]>`
    update sessions
    set status = 'recording',
        stopped_at = null,
        paused_ms = ${pausedMs}
    where id = ${sessionId}
    returning ${columns}
  `;
  return sessionFromRow(rows[0]!);
}

// Moves a session along the state machine; failedStep is set only on 'failed'.
export async function updateSessionStatus(
  sessionId: string,
  status: SessionStatus,
  failedStep: string | null = null,
): Promise<void> {
  await sql`
    update sessions
    set status = ${status},
        failed_step = ${failedStep}
    where id = ${sessionId}
  `;
}

// The row and, by cascade, its captures, chunks, words, document, versions and export jobs.
// Storage objects must already be gone (routes/sessions.ts deletes them first).
export async function deleteSession(sessionId: string): Promise<void> {
  await sql`
    delete from sessions
    where id = ${sessionId}
  `;
}

// Generation finished: the session is ready and takes the document's title (if it has one).
export async function markSessionReady(
  tx: TransactionSql,
  sessionId: string,
  title: string | null,
): Promise<void> {
  await tx`
    update sessions
    set status = 'ready',
        failed_step = null,
        title = coalesce(${title}, title)
    where id = ${sessionId}
  `;
}

// A refined document may have a new title; keep the session's in step (library list).
export async function setSessionTitle(
  tx: TransactionSql,
  sessionId: string,
  title: string | null,
): Promise<void> {
  await tx`
    update sessions
    set title = coalesce(${title}, title)
    where id = ${sessionId}
  `;
}
