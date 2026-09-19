import { z } from "zod";
import { AudioChunkSchema } from "./schemas/transcript.js";
import { CaptureSchema } from "./schemas/capture.js";
import { ConnectorSchema, ExportJobSchema } from "./schemas/export.js";
import { CreditLedgerEntrySchema, PackIdSchema } from "./schemas/credits.js";
import { DocumentSchema, DocumentVersionSchema } from "./schemas/document.js";
import { SessionSchema } from "./schemas/session.js";

// Request and response bodies for every /v1 endpoint, in the order the build plan lists them.
// The API parses requests with these and the clients parse responses with them, so the three
// can never drift apart silently.

// Every error the API returns has this shape.
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// A presigned upload target. The client PUTs the bytes to uploadUrl, then registers `path`.
export const PresignResponseSchema = z.object({
  uploadUrl: z.url(),
  token: z.string(),
  path: z.string(),
});
export type PresignResponse = z.infer<typeof PresignResponseSchema>;

// POST /sessions — the client sends its clock epoch so the row matches what every runtime uses.
export const CreateSessionRequestSchema = z.object({
  startedAt: z.iso.datetime(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const SessionResponseSchema = z.object({
  session: SessionSchema,
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

// GET /sessions
export const SessionListItemSchema = SessionSchema.extend({
  captureCount: z.number().int().nonnegative(),
});
export type SessionListItem = z.infer<typeof SessionListItemSchema>;

export const ListSessionsResponseSchema = z.object({
  sessions: z.array(SessionListItemSchema),
});
export type ListSessionsResponse = z.infer<typeof ListSessionsResponseSchema>;

// GET /sessions/:id
export const SessionDetailResponseSchema = z.object({
  session: SessionSchema,
  captures: z.array(CaptureSchema),
  documentId: z.uuid().nullable(),
});
export type SessionDetailResponse = z.infer<typeof SessionDetailResponseSchema>;

// GET /sessions/:id/summary — the Stop screen's quality read.
export const SessionSummaryResponseSchema = z.object({
  captureCount: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
});
export type SessionSummaryResponse = z.infer<
  typeof SessionSummaryResponseSchema
>;

// POST /sessions/:id/captures/presign
export const PresignCaptureRequestSchema = z.object({
  captureId: z.uuid(),
});
export type PresignCaptureRequest = z.infer<typeof PresignCaptureRequestSchema>;

// POST /sessions/:id/captures — the client sends everything but what the server owns.
export const UpsertCaptureRequestSchema = CaptureSchema.omit({
  sessionId: true,
  cropPath: true,
  createdAt: true,
});
export type UpsertCaptureRequest = z.infer<typeof UpsertCaptureRequestSchema>;

export const CaptureResponseSchema = z.object({
  capture: CaptureSchema,
});
export type CaptureResponse = z.infer<typeof CaptureResponseSchema>;

// POST /sessions/:id/chunks/presign
export const PresignChunkRequestSchema = z.object({
  offsetMs: z.number().int().nonnegative(),
});
export type PresignChunkRequest = z.infer<typeof PresignChunkRequestSchema>;

// POST /sessions/:id/chunks
export const RegisterChunkRequestSchema = z.object({
  offsetMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  path: z.string(),
});
export type RegisterChunkRequest = z.infer<typeof RegisterChunkRequestSchema>;

export const ChunkResponseSchema = z.object({
  chunk: AudioChunkSchema,
});
export type ChunkResponse = z.infer<typeof ChunkResponseSchema>;

// POST /sessions/:id/stop
export const StopSessionRequestSchema = z.object({
  stoppedAt: z.iso.datetime(),
  pausedMs: z.number().int().nonnegative(),
});
export type StopSessionRequest = z.infer<typeof StopSessionRequestSchema>;

// GET /documents/:id
export const DocumentVersionSummarySchema = DocumentVersionSchema.pick({
  id: true,
  versionNo: true,
  source: true,
  createdAt: true,
});
export type DocumentVersionSummary = z.infer<
  typeof DocumentVersionSummarySchema
>;

// Short-lived signed URL for the image behind [IMAGE_N].
export const DocumentImageSchema = z.object({
  n: z.number().int().positive(),
  captureId: z.uuid(),
  url: z.url(),
});
export type DocumentImage = z.infer<typeof DocumentImageSchema>;

export const DocumentResponseSchema = z.object({
  document: DocumentSchema,
  currentVersion: DocumentVersionSchema,
  versions: z.array(DocumentVersionSummarySchema),
  images: z.array(DocumentImageSchema),
});
export type DocumentResponse = z.infer<typeof DocumentResponseSchema>;

// GET /documents/:id/versions/:n and POST /documents/:id/refine
export const DocumentVersionResponseSchema = z.object({
  version: DocumentVersionSchema,
});
export type DocumentVersionResponse = z.infer<
  typeof DocumentVersionResponseSchema
>;

export const RefineRequestSchema = z.object({
  prompt: z.string().min(1).max(4000),
});
export type RefineRequest = z.infer<typeof RefineRequestSchema>;

// POST /exports
export const CreateExportRequestSchema = z.object({
  documentId: z.uuid(),
  connector: ConnectorSchema,
  notionParentId: z.string().optional(),
});
export type CreateExportRequest = z.infer<typeof CreateExportRequestSchema>;

export const ExportJobResponseSchema = z.object({
  job: ExportJobSchema,
});
export type ExportJobResponse = z.infer<typeof ExportJobResponseSchema>;

// GET /exports?document=:id
export const ListExportsResponseSchema = z.object({
  jobs: z.array(ExportJobSchema),
});
export type ListExportsResponse = z.infer<typeof ListExportsResponseSchema>;

// GET /me
export const ConnectedConnectorSchema = z.object({
  connector: z.enum(["notion"]),
  workspaceName: z.string().nullable(),
});
export type ConnectedConnector = z.infer<typeof ConnectedConnectorSchema>;

export const MeResponseSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  creditBalance: z.number().int(),
  connectors: z.array(ConnectedConnectorSchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

// POST /billing/checkout
export const CheckoutRequestSchema = z.object({
  pack: PackIdSchema,
});
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

export const CheckoutResponseSchema = z.object({
  url: z.url(),
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

// GET /billing/history
export const BillingHistoryResponseSchema = z.object({
  entries: z.array(CreditLedgerEntrySchema),
});
export type BillingHistoryResponse = z.infer<
  typeof BillingHistoryResponseSchema
>;
