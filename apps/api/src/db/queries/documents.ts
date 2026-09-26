import type { TransactionSql } from "postgres";
import type {
  Document,
  DocumentVersion,
  DocumentVersionSource,
} from "@teardown/core/schemas/document";
import type { DocumentVersionSummary } from "@teardown/core/api-contract";
import { sql } from "../client.js";

type DocumentRow = {
  id: string;
  session_id: string;
  current_version_id: string | null;
  created_at: Date;
};

type VersionRow = {
  id: string;
  document_id: string;
  version_no: number;
  markdown: string;
  source: DocumentVersionSource;
  parent_version_id: string | null;
  refine_prompt: string | null;
  note: string | null;
  model: string;
  created_at: Date;
};

const versionColumns = sql`
  id, document_id, version_no, markdown, source, parent_version_id, refine_prompt, note, model,
  created_at
`;

function documentFromRow(row: DocumentRow): Document {
  return {
    id: row.id,
    sessionId: row.session_id,
    currentVersionId: row.current_version_id,
    createdAt: row.created_at.toISOString(),
  };
}

function versionFromRow(row: VersionRow): DocumentVersion {
  return {
    id: row.id,
    documentId: row.document_id,
    versionNo: row.version_no,
    markdown: row.markdown,
    source: row.source,
    parentVersionId: row.parent_version_id,
    refinePrompt: row.refine_prompt,
    note: row.note,
    model: row.model,
    createdAt: row.created_at.toISOString(),
  };
}

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

// A user's document, or null: someone else's document looks exactly like a missing one.
export async function findOwnedDocument(
  userId: string,
  documentId: string,
): Promise<Document | null> {
  const rows = await sql<DocumentRow[]>`
    select d.id, d.session_id, d.current_version_id, d.created_at
    from documents d
    join sessions s on s.id = d.session_id
    where d.id = ${documentId}
      and s.user_id = ${userId}
  `;
  return rows[0] ? documentFromRow(rows[0]) : null;
}

// Every version, oldest first, without the Markdown (the Revisions panel's history).
export async function listVersionSummaries(
  documentId: string,
): Promise<DocumentVersionSummary[]> {
  const rows = await sql<
    Omit<VersionRow, "document_id" | "markdown" | "model">[]
  >`
    select id, version_no, source, parent_version_id, refine_prompt, note, created_at
    from document_versions
    where document_id = ${documentId}
    order by version_no
  `;
  return rows.map((row) => ({
    id: row.id,
    versionNo: row.version_no,
    source: row.source,
    parentVersionId: row.parent_version_id,
    refinePrompt: row.refine_prompt,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function findVersionById(
  versionId: string,
): Promise<DocumentVersion | null> {
  const rows = await sql<VersionRow[]>`
    select ${versionColumns}
    from document_versions
    where id = ${versionId}
  `;
  return rows[0] ? versionFromRow(rows[0]) : null;
}

// A version of this document by id, or null (an id from another document is not found).
export async function findVersionInDocument(
  documentId: string,
  versionId: string,
): Promise<DocumentVersion | null> {
  const rows = await sql<VersionRow[]>`
    select ${versionColumns}
    from document_versions
    where id = ${versionId}
      and document_id = ${documentId}
  `;
  return rows[0] ? versionFromRow(rows[0]) : null;
}

export async function findVersionByNumber(
  documentId: string,
  versionNo: number,
): Promise<DocumentVersion | null> {
  const rows = await sql<VersionRow[]>`
    select ${versionColumns}
    from document_versions
    where document_id = ${documentId}
      and version_no = ${versionNo}
  `;
  return rows[0] ? versionFromRow(rows[0]) : null;
}

// The session's document row, created on first generate. Returns its id.
export async function upsertDocument(
  tx: TransactionSql,
  sessionId: string,
): Promise<string> {
  const rows = await tx<{ id: string }[]>`
    insert into documents (session_id)
    values (${sessionId})
    on conflict (session_id) do update set session_id = excluded.session_id
    returning id
  `;
  return rows[0]!.id;
}

// Holds the document row for the rest of the transaction, so two saves cannot both take the
// same next version number.
export async function lockDocument(
  tx: TransactionSql,
  documentId: string,
): Promise<void> {
  await tx`
    select id
    from documents
    where id = ${documentId}
    for update
  `;
}

// Appends the next version. Versions are never updated or deleted (spine §12.1).
export async function insertVersion(
  tx: TransactionSql,
  version: {
    documentId: string;
    markdown: string;
    source: DocumentVersionSource;
    parentVersionId: string | null;
    refinePrompt: string | null;
    note: string | null;
    model: string;
  },
): Promise<DocumentVersion> {
  const rows = await tx<VersionRow[]>`
    insert into document_versions (
      document_id, version_no, markdown, source, parent_version_id, refine_prompt, note, model
    )
    values (
      ${version.documentId},
      (select coalesce(max(version_no), 0) + 1 from document_versions where document_id = ${version.documentId}),
      ${version.markdown},
      ${version.source},
      ${version.parentVersionId},
      ${version.refinePrompt},
      ${version.note},
      ${version.model}
    )
    returning ${versionColumns}
  `;
  return versionFromRow(rows[0]!);
}

export async function setCurrentVersion(
  db: TransactionSql | typeof sql,
  documentId: string,
  versionId: string,
): Promise<void> {
  await db`
    update documents
    set current_version_id = ${versionId}
    where id = ${documentId}
  `;
}
