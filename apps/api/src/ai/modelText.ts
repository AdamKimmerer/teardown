import type { Response } from "openai/resources/responses/responses";

// The Markdown a model returned. Fails on a cut-off response rather than saving half a document,
// and strips a code fence if the model wrapped its answer in one despite being asked not to.
export function modelText(response: Response): string {
  if (response.status === "incomplete") {
    throw new Error(
      `model response incomplete: ${response.incomplete_details?.reason ?? "unknown"}`,
    );
  }
  const text = response.output_text.trim();
  const fenced = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
  const markdown = (fenced?.[1] ?? text).trim();
  if (markdown.length === 0)
    throw new Error("model returned an empty document");
  return markdown;
}
