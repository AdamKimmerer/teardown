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
  refinePrompt: z.string().nullable(),
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
