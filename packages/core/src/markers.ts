// The only fields marker insertion needs; callers pass full TranscriptWord and Capture records.
export type MarkerWord = { word: string; startMs: number };
export type MarkerCapture = { tCapture: number };

// Builds the transcript the model reads: every word, with "[CAPTURE n]" inserted at the word
// position of each capture (spine §9.2). Captures are numbered by array position, so the caller
// must pass them in the same order it numbers the images (sorted by tCapture). A marker goes in
// front of the first word that started at or after tCapture; captures after the last word go at
// the end.
export function insertCaptureMarkers(
  words: MarkerWord[],
  captures: MarkerCapture[],
): string {
  const sortedWords = [...words].sort((a, b) => a.startMs - b.startMs);
  const markersAt = markerPositions(sortedWords, captures);
  const parts: string[] = [];

  for (let i = 0; i <= sortedWords.length; i++) {
    for (const n of markersAt.get(i) ?? []) {
      parts.push(captureMarker(n));
    }
    const word = sortedWords[i];
    if (word !== undefined) {
      parts.push(word.word.trim());
    }
  }

  return parts.filter((part) => part.length > 0).join(" ");
}

// The marker text for capture n, as the prompt refers to it.
export function captureMarker(n: number): string {
  return `[CAPTURE ${n}]`;
}

// Maps each word index to the capture numbers whose marker goes right before that word.
// Index words.length means "after the last word".
function markerPositions(
  sortedWords: MarkerWord[],
  captures: MarkerCapture[],
): Map<number, number[]> {
  const positions = new Map<number, number[]>();
  captures.forEach((capture, index) => {
    const n = index + 1;
    const at = firstWordAtOrAfter(sortedWords, capture.tCapture);
    positions.set(at, [...(positions.get(at) ?? []), n]);
  });
  return positions;
}

// Index of the first word whose startMs >= t, or words.length if there is none.
function firstWordAtOrAfter(sortedWords: MarkerWord[], t: number): number {
  const index = sortedWords.findIndex((word) => word.startMs >= t);
  return index === -1 ? sortedWords.length : index;
}
