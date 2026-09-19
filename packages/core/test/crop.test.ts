import { describe, expect, it } from "vitest";
import { cropRectInPixels } from "../src/crop.js";

const bounds = { w: 2880, h: 1800 }; // a 1440×900 viewport at dpr 2

describe("cropRectInPixels", () => {
  it("scales a CSS rect by dpr", () => {
    expect(
      cropRectInPixels({ x: 100, y: 50, w: 200, h: 100 }, 2, 0, bounds),
    ).toEqual({
      x: 200,
      y: 100,
      w: 400,
      h: 200,
    });
  });

  it("adds padding in CSS pixels before scaling", () => {
    expect(
      cropRectInPixels({ x: 100, y: 50, w: 200, h: 100 }, 2, 10, bounds),
    ).toEqual({
      x: 180,
      y: 80,
      w: 440,
      h: 240,
    });
  });

  it("rounds outward so fractional edges keep every chosen pixel", () => {
    expect(
      cropRectInPixels({ x: 10.4, y: 10.6, w: 20.2, h: 20.2 }, 1, 0, bounds),
    ).toEqual({
      x: 10,
      y: 10,
      w: 21,
      h: 21,
    });
  });

  it("clamps to the image bounds", () => {
    expect(
      cropRectInPixels({ x: -5, y: -5, w: 1450, h: 910 }, 2, 0, bounds),
    ).toEqual({
      x: 0,
      y: 0,
      w: 2880,
      h: 1800,
    });
  });

  it("throws when the rect is entirely outside the image", () => {
    expect(() =>
      cropRectInPixels({ x: 5000, y: 5000, w: 10, h: 10 }, 2, 0, bounds),
    ).toThrow("outside the image");
  });
});
