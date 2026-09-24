import sharp from "sharp";
import { IMAGE_PATCH_BUDGET, IMAGE_PATCH_SIZE } from "./models.js";

export type ModelImage = { dataUrl: string; width: number; height: number };

// Shrinks an image to fit the model's high-detail patch budget (never enlarging it) and encodes
// it as a PNG data URL. Doing the resize here, not leaving it to OpenAI, means the dimensions we
// record are the dimensions that were billed (spine §6.5).
export async function toModelImage(image: Buffer): Promise<ModelImage> {
  const { width, height } = await sharp(image).metadata();
  if (!width || !height) throw new Error("image has no dimensions");
  const size = fitPatchBudget(width, height);
  const png = await sharp(image)
    .resize(size.width, size.height, { fit: "fill" })
    .png()
    .toBuffer();
  return {
    dataUrl: `data:image/png;base64,${png.toString("base64")}`,
    ...size,
  };
}

// The largest size with the same aspect ratio whose 32-px patch count fits the budget.
function fitPatchBudget(
  width: number,
  height: number,
): { width: number; height: number } {
  const patches = (w: number, h: number) =>
    Math.ceil(w / IMAGE_PATCH_SIZE) * Math.ceil(h / IMAGE_PATCH_SIZE);
  if (patches(width, height) <= IMAGE_PATCH_BUDGET) return { width, height };
  let scale = Math.sqrt(
    (IMAGE_PATCH_BUDGET * IMAGE_PATCH_SIZE * IMAGE_PATCH_SIZE) /
      (width * height),
  );
  while (
    patches(Math.floor(width * scale), Math.floor(height * scale)) >
    IMAGE_PATCH_BUDGET
  )
    scale *= 0.99;
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}
