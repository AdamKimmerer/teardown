import sharp from "sharp";
import { cropRectInPixels } from "@teardown/core/crop";
import type { Capture } from "@teardown/core/schemas/capture";

// Cuts a region capture's crop out of its original PNG: the CSS-pixel rect × dpr (spine §8.4),
// clamped to the image, re-encoded as PNG. The original is never modified (spine §10.1).
export async function cropCapture(
  capture: Capture,
  original: Buffer,
): Promise<Buffer> {
  const rect = capture.region.rect;
  if (rect === undefined)
    throw new Error(`capture ${capture.id} has no region rect`);
  const { width, height } = await sharp(original).metadata();
  if (!width || !height)
    throw new Error(`capture ${capture.id}: original has no dimensions`);
  const px = cropRectInPixels(
    rect,
    capture.viewport.dpr,
    capture.region.padding,
    { w: width, h: height },
  );
  return sharp(original)
    .extract({ left: px.x, top: px.y, width: px.w, height: px.h })
    .png()
    .toBuffer();
}
