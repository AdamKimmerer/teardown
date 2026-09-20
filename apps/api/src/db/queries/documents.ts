import { sql } from "../client.js";

// The session's document id, or null before generate has run.
export async function findDocumentIdForSession(
  sessionId: string,
): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    select id
    from documents
    where session_id = ${sessionId}
  `;
  return rows[0]?.id ?? null;
}
