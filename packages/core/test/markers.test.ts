import { describe, expect, it } from "vitest";
import { captureMarker, insertCaptureMarkers } from "../src/markers.js";

const words = [
  { word: "so", startMs: 0 },
  { word: "the", startMs: 300 },
  { word: "pricing", startMs: 500 },
  { word: "table", startMs: 900 },
  { word: "is", startMs: 1200 },
  { word: "buried", startMs: 1400 },
];

describe("insertCaptureMarkers", () => {
  it("puts the marker in front of the first word at or after tCapture", () => {
    expect(insertCaptureMarkers(words, [{ tCapture: 1000 }])).toBe(
      "so the pricing table [CAPTURE 1] is buried",
    );
  });

  it("puts a marker whose tCapture equals a word start before that word", () => {
    expect(insertCaptureMarkers(words, [{ tCapture: 900 }])).toBe(
      "so the pricing [CAPTURE 1] table is buried",
    );
  });

  it("numbers captures by their array position", () => {
    const captures = [{ tCapture: 400 }, { tCapture: 1300 }];
    expect(insertCaptureMarkers(words, captures)).toBe(
      "so the [CAPTURE 1] pricing table is [CAPTURE 2] buried",
    );
  });

  it("keeps two captures at the same position in order", () => {
    const captures = [{ tCapture: 1000 }, { tCapture: 1100 }];
    expect(insertCaptureMarkers(words, captures)).toBe(
      "so the pricing table [CAPTURE 1] [CAPTURE 2] is buried",
    );
  });

  it("appends captures that fall after the last word", () => {
    expect(insertCaptureMarkers(words, [{ tCapture: 99_000 }])).toBe(
      "so the pricing table is buried [CAPTURE 1]",
    );
  });

  it("prepends captures that fall before the first word", () => {
    const late = words.map((w) => ({ ...w, startMs: w.startMs + 5000 }));
    expect(insertCaptureMarkers(late, [{ tCapture: 10 }])).toBe(
      "[CAPTURE 1] so the pricing table is buried",
    );
  });

  it("returns only markers when there are no words", () => {
    expect(insertCaptureMarkers([], [{ tCapture: 1 }, { tCapture: 2 }])).toBe(
      "[CAPTURE 1] [CAPTURE 2]",
    );
  });

  it("returns the plain transcript when there are no captures", () => {
    expect(insertCaptureMarkers(words, [])).toBe(
      "so the pricing table is buried",
    );
  });

  it("sorts words by start time and trims whitespace around them", () => {
    const shuffled = [
      { word: " table", startMs: 900 },
      { word: "so ", startMs: 0 },
      { word: "pricing", startMs: 500 },
      { word: "the", startMs: 300 },
    ];
    expect(insertCaptureMarkers(shuffled, [])).toBe("so the pricing table");
  });

  it("formats a marker as the prompt expects", () => {
    expect(captureMarker(7)).toBe("[CAPTURE 7]");
  });
});
