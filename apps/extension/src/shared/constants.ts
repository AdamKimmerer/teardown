// Every tunable number in the extension, in one place.

// Audio chunking (spine §9.1): each chunk is a standalone recording so it has its own header.
export const CHUNK_MS = 20_000;
export const CHUNK_OVERLAP_MS = 1_000;

// VAD gate (spine §6.3): a chunk whose loudest 100 ms sample is below this is never uploaded.
export const VAD_PEAK_RMS_THRESHOLD = 0.01;

// Dead mic (spine §7): this long with effectively zero signal is the one alarming warning.
export const DEAD_MIC_RMS = 0.0005;
export const DEAD_MIC_MS = 10_000;

// Nudges (spine §7).
export const FORGOT_TO_STOP_MINUTES = 25;
export const SILENCE_NUDGE_AFTER_SKIPPED_CHUNKS = 9; // ~3 minutes of gated chunks

// captureVisibleTab is limited to about two calls per second (spike B).
export const CAPTURE_MIN_SPACING_MS = 500;
export const CAPTURE_COALESCE_MS = 300;
export const CAPTURE_QUOTA_ERROR = "MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND";

// Uploads: retries with backoff for a flaky connection; the local buffer keeps the bytes.
export const UPLOAD_MAX_ATTEMPTS = 5;
export const UPLOAD_BACKOFF_MS = 2_000;

// Stop-screen quality read (spine §7): what the word count means for the document.
export const WORDS_FOR_FULL_TEARDOWN = 1_500;
export const WORDS_FOR_SOLID_DOCUMENT = 500;
