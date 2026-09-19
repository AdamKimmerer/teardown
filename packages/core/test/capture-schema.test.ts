import { describe, expect, it } from "vitest";
import { RegionSchema } from "../src/schemas/capture.js";

describe("RegionSchema", () => {
  it("accepts viewport mode without a rect", () => {
    const region = RegionSchema.parse({ mode: "viewport" });
    expect(region.selectors).toEqual([]);
    expect(region.padding).toBe(0);
  });

  it("rejects freehand and element modes without a rect", () => {
    expect(RegionSchema.safeParse({ mode: "freehand" }).success).toBe(false);
    expect(
      RegionSchema.safeParse({ mode: "element", selectors: ["#x"] }).success,
    ).toBe(false);
  });

  it("accepts an element region with selectors and padding", () => {
    const region = RegionSchema.parse({
      mode: "element",
      rect: { x: 1, y: 2, w: 3, h: 4 },
      selectors: ['[data-testid="pricing"]', "#pricing"],
      padding: 8,
    });
    expect(region.selectors).toHaveLength(2);
  });
});
