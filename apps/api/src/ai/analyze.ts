import type { ResponseInputContent } from "openai/resources/responses/responses";
import { VISION_MAX_OUTPUT_TOKENS, VISION_MODEL } from "./models.js";
import type { ModelImage } from "./modelImages.js";
import { modelText } from "./modelText.js";
import { openai } from "./openai.js";
import {
  analyzeInstructions,
  analyzeUserText,
  type CaptureForPrompt,
} from "./prompts/analyze.v1.js";

export type AnalyzeResult = {
  markdown: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

// One call to the vision model: capture list and marked transcript as text, then each image
// introduced by its capture number, at high detail. Returns the document's Markdown.
export async function analyzeSession(
  markedTranscript: string,
  captures: CaptureForPrompt[],
  images: ModelImage[],
): Promise<AnalyzeResult> {
  const content: ResponseInputContent[] = [
    { type: "input_text", text: analyzeUserText(markedTranscript, captures) },
  ];
  captures.forEach((capture, i) => {
    content.push({ type: "input_text", text: `Capture ${capture.n}:` });
    content.push({
      type: "input_image",
      image_url: images[i]!.dataUrl,
      detail: "high",
    });
  });

  const response = await openai.responses.create({
    model: VISION_MODEL,
    instructions: analyzeInstructions,
    input: [{ role: "user", content }],
    max_output_tokens: VISION_MAX_OUTPUT_TOKENS,
  });

  return {
    markdown: modelText(response),
    model: response.model,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}
