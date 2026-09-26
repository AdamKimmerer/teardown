import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TranscriptWordSchema } from "../src/schemas/transcript.js";

// audio_chunks.words is jsonb, which guarantees nothing about its elements, so every read is
// parsed through this schema.
const StoredWords = z.array(TranscriptWordSchema);

describe("TranscriptWordSchema", () => {
  it("parses the stored shape", () => {
    const stored = [
      { word: "pricing", startMs: 1200, endMs: 1650 },
      { word: "table", startMs: 1700, endMs: 1900 },
    ];
    expect(StoredWords.parse(stored)).toEqual(stored);
  });

  it("parses an empty chunk", () => {
    expect(StoredWords.parse([])).toEqual([]);
  });

  it("rejects negative or fractional times and missing fields", () => {
    expect(
      StoredWords.safeParse([{ word: "a", startMs: -1, endMs: 5 }]).success,
    ).toBe(false);
    expect(
      StoredWords.safeParse([{ word: "a", startMs: 1.5, endMs: 5 }]).success,
    ).toBe(false);
    expect(StoredWords.safeParse([{ word: "a", startMs: 1 }]).success).toBe(
      false,
    );
  });
});
