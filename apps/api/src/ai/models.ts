// The OpenAI models Teardown uses, as single constants (build plan §Architecture).

// whisper-1 is the only OpenAI transcription model that returns word-level timestamps, which the
// marker alignment needs (spine §9.2). Verified 2026-09-19 against the speech-to-text guide:
// "Use whisper-1 when you need word or segment timestamps."
export const TRANSCRIBE_MODEL = "whisper-1";

// USD per minute of audio for TRANSCRIBE_MODEL (pricing page, 2026-09-19). Only for the
// cost_usd_estimate column; the bill is whatever OpenAI charges.
export const TRANSCRIBE_USD_PER_MINUTE = 0.006;
