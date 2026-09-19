import { z } from "zod";

// Export destinations (spine §13). Each is a server-side adapter from the same canonical document.
export const ConnectorSchema = z.enum([
  "html",
  "html_folder",
  "obsidian",
  "notion",
]);

export type Connector = z.infer<typeof ConnectorSchema>;

export const ExportJobStatusSchema = z.enum([
  "queued",
  "running",
  "done",
  "failed",
]);

export type ExportJobStatus = z.infer<typeof ExportJobStatusSchema>;

// One export run. resultPath is a storage key for downloads; externalUrl is where a push landed (Notion).
export const ExportJobSchema = z.object({
  id: z.uuid(),
  documentId: z.uuid(),
  connector: ConnectorSchema,
  status: ExportJobStatusSchema,
  resultPath: z.string().nullable(),
  externalUrl: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
});

export type ExportJob = z.infer<typeof ExportJobSchema>;
