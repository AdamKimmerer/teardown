import { z } from "zod";

export const RegionModeSchema = z.enum(["viewport", "freehand", "element"]);

export type RegionMode = z.infer<typeof RegionModeSchema>;

// A rectangle in CSS pixels, relative to the viewport.
export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative(),
});

export type Rect = z.infer<typeof RectSchema>;

// The viewport at capture time. dpr is read in the content script so page zoom is included.
export const ViewportSchema = z.object({
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  dpr: z.number().positive(),
});

export type Viewport = z.infer<typeof ViewportSchema>;

// What the human chose to frame (spine §10.1). rect is absent only in viewport mode.
export const RegionSchema = z
  .object({
    mode: RegionModeSchema,
    rect: RectSchema.optional(),
    // Element mode: selectors in preference order (data-testid → id → tag+role).
    selectors: z.array(z.string()).default([]),
    // Freehand mode: best-guess element whose bounds matched the rect. Metadata only; never acted on.
    primaryElement: z.string().optional(),
    padding: z.number().int().nonnegative().default(0),
  })
  .refine((region) => region.mode === "viewport" || region.rect !== undefined, {
    message: "freehand and element regions must have a rect",
    path: ["rect"],
  });

export type Region = z.infer<typeof RegionSchema>;

// One capture: the untouched original plus the decision the human made. Crops are derived (spine §10.1).
export const CaptureSchema = z.object({
  // Client-generated so uploads and retries are idempotent.
  id: z.uuid(),
  sessionId: z.uuid(),
  // Session-clock milliseconds: when the picker opened / drag began, and when the shot fired.
  tPickStart: z.number().int().nonnegative(),
  tCapture: z.number().int().nonnegative(),
  url: z.string().min(1),
  pageTitle: z.string(),
  viewport: ViewportSchema,
  region: RegionSchema,
  // Storage object keys, never URLs. cropPath is a cache: null until generate derives it.
  originalPath: z.string().nullable(),
  cropPath: z.string().nullable(),
  elementTextHash: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type Capture = z.infer<typeof CaptureSchema>;
