import type { z } from "zod";
import {
  CaptureResponseSchema,
  ChunkResponseSchema,
  ErrorResponseSchema,
  PresignResponseSchema,
  SessionResponseSchema,
  SessionSummaryResponseSchema,
  type CreateSessionRequest,
  type PresignCaptureRequest,
  type PresignChunkRequest,
  type RegisterChunkRequest,
  type ResumeSessionRequest,
  type StopSessionRequest,
  type UpsertCaptureRequest,
} from "@teardown/core/api-contract";
import { getAccessToken } from "./auth.js";
import { buildConfig } from "./buildConfig.js";

// The typed API client: one function per endpoint the extension uses, each parsing its response
// against the contract in core so a drift between API and extension fails loudly here.

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  responseSchema: z.ZodType<T> | null,
): Promise<T> {
  const token = await getAccessToken();
  if (token === null)
    throw new ApiError(401, "unauthenticated", "Not signed in");

  const res = await fetch(`${buildConfig.apiUrl}/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    const parsed = ErrorResponseSchema.safeParse(
      await res.json().catch(() => null),
    );
    const code = parsed.success ? parsed.data.error.code : "http_error";
    const message = parsed.success
      ? parsed.data.error.message
      : `${method} ${path} failed (${res.status})`;
    throw new ApiError(res.status, code, message);
  }
  if (responseSchema === null) return undefined as T;
  return responseSchema.parse(await res.json());
}

export const api = {
  createSession: (body: CreateSessionRequest) =>
    request("POST", "/sessions", body, SessionResponseSchema),
  stopSession: (id: string, body: StopSessionRequest) =>
    request("POST", `/sessions/${id}/stop`, body, SessionResponseSchema),
  resumeSession: (id: string, body: ResumeSessionRequest) =>
    request("POST", `/sessions/${id}/resume`, body, SessionResponseSchema),
  sessionSummary: (id: string) =>
    request(
      "GET",
      `/sessions/${id}/summary`,
      undefined,
      SessionSummaryResponseSchema,
    ),
  deleteSession: (id: string) =>
    request("DELETE", `/sessions/${id}`, undefined, null),
  generate: (id: string) =>
    request(
      "POST",
      `/sessions/${id}/generate`,
      undefined,
      SessionResponseSchema,
    ),

  presignCapture: (sessionId: string, body: PresignCaptureRequest) =>
    request(
      "POST",
      `/sessions/${sessionId}/captures/presign`,
      body,
      PresignResponseSchema,
    ),
  upsertCapture: (sessionId: string, body: UpsertCaptureRequest) =>
    request(
      "POST",
      `/sessions/${sessionId}/captures`,
      body,
      CaptureResponseSchema,
    ),
  deleteCapture: (sessionId: string, captureId: string) =>
    request(
      "DELETE",
      `/sessions/${sessionId}/captures/${captureId}`,
      undefined,
      null,
    ),

  presignChunk: (sessionId: string, body: PresignChunkRequest) =>
    request(
      "POST",
      `/sessions/${sessionId}/chunks/presign`,
      body,
      PresignResponseSchema,
    ),
  registerChunk: (sessionId: string, body: RegisterChunkRequest) =>
    request("POST", `/sessions/${sessionId}/chunks`, body, ChunkResponseSchema),
};

// A raw PUT of bytes to a presigned URL. Not authenticated: the URL carries its own token.
export async function putToSignedUrl(
  uploadUrl: string,
  blob: Blob,
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}
