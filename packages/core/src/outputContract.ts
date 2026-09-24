// The document's image placeholders and the checks the API runs on model output, with no model
// in the loop (spine §12.1). Pure functions so they can be tested and, later, reused by clients.

// Where capture n's image goes in a document's markdown.
export function imagePlaceholder(n: number): string {
  return `[IMAGE_${n}]`;
}

// Every placeholder number in the order it appears, duplicates included.
export function imagePlaceholders(markdown: string): number[] {
  return Array.from(markdown.matchAll(/\[IMAGE_(\d+)\]/g), (match) =>
    Number(match[1]),
  );
}

// A refine must keep every image exactly once, stay within this length band of the previous
// version, and keep at least this share of its distinct words.
export const REFINE_MIN_LENGTH_RATIO = 0.5;
export const REFINE_MAX_LENGTH_RATIO = 2;
export const REFINE_MIN_WORD_OVERLAP = 0.4;

export type ContractResult = { ok: true } | { ok: false; reasons: string[] };

// Checks a refined version against the one it replaces. A failure means the edit is thrown away
// and the previous version stays current.
export function checkRefineContract(
  previous: string,
  next: string,
): ContractResult {
  const reasons = [
    ...placeholderProblems(previous, next),
    ...lengthProblems(previous, next),
    ...overlapProblems(previous, next),
  ];
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

function placeholderProblems(previous: string, next: string): string[] {
  const expected = new Set(imagePlaceholders(previous));
  const found = imagePlaceholders(next);
  const problems: string[] = [];
  for (const n of expected) {
    const count = found.filter((m) => m === n).length;
    if (count !== 1)
      problems.push(
        `${imagePlaceholder(n)} appears ${count} times, expected once`,
      );
  }
  for (const n of new Set(found)) {
    if (!expected.has(n))
      problems.push(`${imagePlaceholder(n)} is not in the previous version`);
  }
  return problems;
}

function lengthProblems(previous: string, next: string): string[] {
  const ratio = next.length / Math.max(1, previous.length);
  if (ratio < REFINE_MIN_LENGTH_RATIO)
    return [`length fell to ${ratio.toFixed(2)}× the previous version`];
  if (ratio > REFINE_MAX_LENGTH_RATIO)
    return [`length grew to ${ratio.toFixed(2)}× the previous version`];
  return [];
}

function overlapProblems(previous: string, next: string): string[] {
  const before = distinctWords(previous);
  if (before.size === 0) return [];
  const after = distinctWords(next);
  let kept = 0;
  for (const word of before) if (after.has(word)) kept += 1;
  const overlap = kept / before.size;
  return overlap < REFINE_MIN_WORD_OVERLAP
    ? [`only ${Math.round(overlap * 100)}% of the previous wording remains`]
    : [];
}

// Lower-cased words of three or more letters or digits, placeholders excluded.
function distinctWords(markdown: string): Set<string> {
  const text = markdown.replace(/\[IMAGE_\d+\]/g, " ").toLowerCase();
  return new Set(text.match(/[\p{L}\p{N}]{3,}/gu) ?? []);
}

export type NormalizedPlaceholders = {
  markdown: string;
  removed: number[];
  appended: number[];
};

// Makes a freshly generated document's placeholders valid instead of failing a paid generation
// over formatting: references to captures that do not exist and repeats of one already placed
// are removed, and any capture the model did not place is added under "Other captures", so no
// capture is ever lost.
export function normalizeGeneratedPlaceholders(
  markdown: string,
  captureCount: number,
): NormalizedPlaceholders {
  const placed = new Set<number>();
  const removed: number[] = [];
  const cleaned = markdown.replace(
    /\[IMAGE_(\d+)\]/g,
    (placeholder, digits: string) => {
      const n = Number(digits);
      if (n < 1 || n > captureCount || placed.has(n)) {
        removed.push(n);
        return "";
      }
      placed.add(n);
      return placeholder;
    },
  );

  const appended: number[] = [];
  for (let n = 1; n <= captureCount; n++) if (!placed.has(n)) appended.push(n);
  const extra =
    appended.length === 0
      ? ""
      : `\n\n## Other captures\n\n${appended.map(imagePlaceholder).join("\n\n")}\n`;

  return { markdown: cleaned.trimEnd() + extra, removed, appended };
}
