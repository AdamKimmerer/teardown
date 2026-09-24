import { VISION_MAX_OUTPUT_TOKENS, VISION_MODEL } from "./models.js";
import { modelText } from "./modelText.js";
import { openai } from "./openai.js";
import { refineInstructions, refineUserText } from "./prompts/refine.v1.js";

export type RefineResult = {
  markdown: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

// Applies an edit request to a document. Text only in v1 (the document and the narration, no
// images), which keeps refinement fast and close to free (decisions.md). The caller checks the
// output contract before saving anything.
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
    max_output_tokens: VISION_MAX_OUTPUT_TOKENS,
  });
  return {
    markdown: modelText(response),
    model: response.model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}
