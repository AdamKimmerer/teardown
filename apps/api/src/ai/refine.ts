import { z } from "zod";
import { VISION_MAX_OUTPUT_TOKENS, VISION_MODEL } from "./models.js";
import { openai } from "./openai.js";
import {
  refineInstructions,
  refineOutputSchema,
  refineUserText,
} from "./prompts/refine.v2.js";

// What the model must return (refine.v2's JSON shape), parsed rather than trusted.
const RefineOutputSchema = z.object({
  outcome: z.enum(["edited", "declined"]),
  note: z.string(),
  markdown: z.string(),
});

export type RefineResult = z.infer<typeof RefineOutputSchema> & {
  model: string;
  inputTokens: number;
  outputTokens: number;
};

// Asks the model to apply an edit request, or to decline it with a reason. Text only in v1 (the
// document and the narration, no images), which keeps refinement fast and close to free. The
// caller checks the output contract before saving anything.
export async function refineDocument(
  currentMarkdown: string,
  markedTranscript: string,
  request: string,
): Promise<RefineResult> {
  const response = await openai.responses.create({
    model: VISION_MODEL,
    instructions: refineInstructions,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: refineUserText(currentMarkdown, markedTranscript, request),
          },
        ],
      },
    ],
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
  };
}
