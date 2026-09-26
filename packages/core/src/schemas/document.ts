import { z } from "zod";

export const DocumentVersionSourceSchema = z.enum(["generate", "refine"]);

export type DocumentVersionSource = z.infer<typeof DocumentVersionSourceSchema>;

// One immutable version of a document's markdown. Rows are append-only; refine failures write nothing.
export const DocumentVersionSchema = z.object({
  id: z.uuid(),
  documentId: z.uuid(),
  versionNo: z.number().int().positive(),
  // Markdown with [IMAGE_N] placeholders where captures go.
  markdown: z.string(),
  source: DocumentVersionSourceSchema,
  // The version this one was refined from; null for the generated version 1. Versions form a
  // tree because a refine can start from any earlier version.
  parentVersionId: z.uuid().nullable(),
  refinePrompt: z.string().nullable(),
  // The model's one-line note on what this refine changed; null for version 1.
  note: z.string().nullable(),
  model: z.string(),
  createdAt: z.iso.datetime(),
});

export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;

// One document per session; currentVersionId points at the version shown by default.
export const DocumentSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  currentVersionId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});

export type Document = z.infer<typeof DocumentSchema>;
