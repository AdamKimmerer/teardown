import { z } from "zod";
import { RegionSchema, ViewportSchema } from "@teardown/core/schemas/capture";

// Every message that crosses a runtime boundary in the extension, as one discriminated union.
// Every sendMessage and every listener goes through parseMessage, so an unknown or malformed
// message is dropped instead of half-handled. Which runtime handles which type is in the
// comments; runtime messages are broadcast to every extension page, so each listener ignores
// the types that are not for it.

export const MessageSchema = z.discriminatedUnion("type", [
  // Panel (and permission page) → service worker
  z.object({ type: z.literal("GET_STATE") }),
  z.object({ type: z.literal("SIGN_IN") }),
  z.object({ type: z.literal("SIGN_OUT") }),
  z.object({
    type: z.literal("START_SESSION"),
    deviceId: z.string().optional(),
  }),
  z.object({ type: z.literal("STOP_SESSION") }),
  z.object({ type: z.literal("RESUME_SESSION") }),
  z.object({ type: z.literal("CAPTURE_FROM_PANEL") }),
  z.object({ type: z.literal("DELETE_CAPTURE"), captureId: z.uuid() }),
  z.object({ type: z.literal("GET_SUMMARY") }),
  z.object({ type: z.literal("GENERATE") }),
  z.object({ type: z.literal("DISMISS_SESSION") }),
  z.object({ type: z.literal("MIC_GRANTED") }),

  // Content script → service worker: the capture record minus what the worker adds.
  z.object({
    type: z.literal("CAPTURE_REQUEST"),
    region: RegionSchema,
    viewport: ViewportSchema,
    tPickStart: z.number().int().nonnegative(),
    tCapture: z.number().int().nonnegative(),
    url: z.string(),
    pageTitle: z.string(),
  }),

  // Offscreen document → service worker
  z.object({
    type: z.literal("CHUNK_STORED"),
    offsetMs: z.number().int(),
    durationMs: z.number().int(),
  }),
  z.object({ type: z.literal("CHUNK_SKIPPED"), offsetMs: z.number().int() }),
  z.object({ type: z.literal("RECORDER_ERROR"), message: z.string() }),

  // Service worker → offscreen document
  z.object({
    type: z.literal("RECORDER_START"),
    sessionId: z.uuid(),
    deviceId: z.string().optional(),
    startedAt: z.number(),
    pausedMs: z.number(),
  }),
  z.object({ type: z.literal("RECORDER_STOP") }),

  // Service worker → panel (broadcast)
  z.object({ type: z.literal("STATE_CHANGED") }),
  z.object({ type: z.literal("CAPTURE_STORED"), captureId: z.uuid() }),
  z.object({ type: z.literal("CAPTURE_DELETED"), captureId: z.uuid() }),
  z.object({
    type: z.literal("NUDGE"),
    kind: z.enum(["forgot-to-stop", "silence"]),
  }),
  z.object({ type: z.literal("PROBLEM"), message: z.string() }),

  // Offscreen document → panel (broadcast)
  z.object({ type: z.literal("LEVEL"), rms: z.number() }),
  z.object({ type: z.literal("DEAD_MIC"), silent: z.boolean() }),

  // Service worker → content script (tabs.sendMessage)
  z.object({ type: z.literal("SESSION_STATE"), recording: z.boolean() }),
  z.object({ type: z.literal("TRIGGER_CAPTURE") }),
]);

export type Message = z.infer<typeof MessageSchema>;
export type MessageOf<T extends Message["type"]> = Extract<
  Message,
  { type: T }
>;

// null for anything that is not one of ours (other extensions cannot message us, but a stale
// build of our own pages can).
export function parseMessage(raw: unknown): Message | null {
  const result = MessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}

// Sends to the service worker and every extension page; resolves with whatever the one
// listener that answers returns. Errors from "no receiver" are swallowed: a LEVEL message with
// the panel closed is normal.
export async function sendMessage(message: Message): Promise<unknown> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    return undefined;
  }
}

// Sends to the content script in one tab; false if the tab has no content script.
export async function sendToTab(
  tabId: number,
  message: Message,
): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch {
    return false;
  }
}
