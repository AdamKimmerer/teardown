import type { Rect } from "./schemas/capture.js";

// A rectangle in whole physical pixels on the original PNG.
export type PixelRect = { x: number; y: number; w: number; h: number };

// Converts a CSS-pixel region into the pixel rect to cut from the original (spine §8.4: the capture
// is physical pixels, the rect is CSS pixels, so crop = rect × dpr). Padding is added in CSS pixels
// first because getBoundingClientRect is the border box and shadows and outlines fall outside it.
// The result is rounded outward so no chosen pixel is lost, then clamped to the image bounds.
export function cropRectInPixels(
  rect: Rect,
  dpr: number,
  padding: number,
  bounds: { w: number; h: number },
): PixelRect {
  const left = Math.max(0, Math.floor((rect.x - padding) * dpr));
  const top = Math.max(0, Math.floor((rect.y - padding) * dpr));
  const right = Math.min(
    bounds.w,
    Math.ceil((rect.x + rect.w + padding) * dpr),
  );
  const bottom = Math.min(
    bounds.h,
    Math.ceil((rect.y + rect.h + padding) * dpr),
  );

  if (right <= left || bottom <= top) {
    throw new Error("crop rect lies outside the image");
  }

  return { x: left, y: top, w: right - left, h: bottom - top };
}
