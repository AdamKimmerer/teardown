import { z } from "zod";
import { VISION_MAX_OUTPUT_TOKENS, VISION_MODEL } from "./models.js";
import { openai } from "./openai.js";
import {
  refineInstructions,
  refineOutputSchema,
  refineUserText,
} from "./prompts/refine.v3.js";

// What the model must return (refine.v3's JSON shape), parsed rather than trusted.
const RefineOutputSchema = z.object({
  outcome: z.enum(["edited", "declined", "needs_web_search"]),
  note: z.string(),
  markdown: z.string(),
  searchQuery: z.string(),
});

export type RefineResult = z.infer<typeof RefineOutputSchema> & {
  model: string;
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
};

// Asks the model to apply an edit request to one version: it edits, declines with a reason, or
// (unless a search was approved) says it needs a web search. Text only: the document and the
// narration, no images. With allowWebSearch the web_search tool is available (verified with
// gpt-6-luna alongside structured output, 2026-09-26; the model writes its sources as Markdown
// links because structured output returns no citation annotations). The caller checks the
// output contract before saving anything.
export async function refineDocument(
  markdown: string,
  markedTranscript: string,
  request: string,
  allowWebSearch: boolean,
): Promise<RefineResult> {
  const response = await openai.responses.create({
    model: VISION_MODEL,
    instructions: refineInstructions(allowWebSearch),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: refineUserText(markdown, markedTranscript, request),
          },
        ],
      },
    ],
    tools: allowWebSearch ? [{ type: "web_search" }] : [],
    text: {
      format: {
        type: "json_schema",
        name: "refine_result",
        schema: refineOutputSchema,
        strict: true,
      },
    },
    max_output_tokens: VISION_MAX_OUTPUT_TOKENS,
  });
  if (response.status === "incomplete") {
    throw new Error(
      `model response incomplete: ${response.incomplete_details?.reason ?? "unknown"}`,
    );
  }
  const output = RefineOutputSchema.parse(JSON.parse(response.output_text));
  return {
    ...output,
    markdown: output.markdown.trim(),
    model: response.model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    webSearches: response.output.filter(
      (item) => item.type === "web_search_call",
    ).length,
  };
}
