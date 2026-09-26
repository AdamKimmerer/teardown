// The OpenAI models Teardown uses, as single constants (build plan §Stack, §AI).

// whisper-1 is the only OpenAI transcription model that returns word-level timestamps, which the
// marker alignment needs (spine §9.2). Verified 2026-09-19 against the speech-to-text guide:
// "Use whisper-1 when you need word or segment timestamps."
export const TRANSCRIBE_MODEL = "whisper-1";

// USD per minute of audio for TRANSCRIBE_MODEL (pricing page, 2026-09-19). Only for the
// cost_usd_estimate column; the bill is whatever OpenAI charges.
export const TRANSCRIBE_USD_PER_MINUTE = 0.006;

// The cheapest OpenAI model that accepts images (models page, 2026-09-24), per the build plan.
// gpt-6-sol is the next tier up at roughly 20× the price; changing this line is the whole switch.
export const VISION_MODEL = "gpt-6-luna";

// USD per million tokens for VISION_MODEL (models page, 2026-09-24), for cost_usd_estimate.
export const VISION_USD_PER_MILLION_INPUT = 0.1;
export const VISION_USD_PER_MILLION_OUTPUT = 0.5;

// Upper bound on the document's length; reasoning tokens count against it too.
export const VISION_MAX_OUTPUT_TOKENS = 32_000;

// Images are sent at detail "high", where the model reads at most this many 32×32-pixel patches
// per image and never enlarges smaller ones (images guide, 2026-09-24). modelImages.ts shrinks
// images to fit this budget itself, so usage_events records exactly the pixels that were billed.
export const IMAGE_PATCH_SIZE = 32;
export const IMAGE_PATCH_BUDGET = 2_500;

// The web_search tool, used only by a refine the user approved: $10 per 1,000 calls, with the
// retrieved content billed as input tokens (pricing page, 2026-09-26).
export const WEB_SEARCH_USD_PER_CALL = 0.01;

// Estimated USD for one vision-model call, from its token counts and web searches.
export function visionCostUsd(
  inputTokens: number,
  outputTokens: number,
  webSearches = 0,
): number {
  const tokens =
    (inputTokens * VISION_USD_PER_MILLION_INPUT +
      outputTokens * VISION_USD_PER_MILLION_OUTPUT) /
    1_000_000;
  return tokens + webSearches * WEB_SEARCH_USD_PER_CALL;
}
