import { sql } from "../client.js";

export type UsageKind = "transcribe" | "generate" | "refine";

export type NewUsageEvent = {
  userId: string;
  sessionId: string | null;
  kind: UsageKind;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  imageCount?: number;
  imagePixels?: { w: number; h: number }[];
  costUsdEstimate: number;
};

// One row per OpenAI call: what was sent and what it is estimated to cost (spine §6.5).
export async function insertUsageEvent(event: NewUsageEvent): Promise<void> {
  await sql`
    insert into usage_events (
      user_id, session_id, kind, model, input_tokens, output_tokens, audio_seconds,
      image_count, image_pixels, cost_usd_estimate
    )
    values (
      ${event.userId}, ${event.sessionId}, ${event.kind}, ${event.model},
      ${event.inputTokens ?? null}, ${event.outputTokens ?? null}, ${event.audioSeconds ?? null},
      ${event.imageCount ?? null}, ${event.imagePixels ? sql.json(event.imagePixels) : null},
      ${event.costUsdEstimate}
    )
  `;
}
