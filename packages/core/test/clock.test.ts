import { describe, expect, it } from "vitest";
import { sessionElapsedMs } from "../src/clock.js";

describe("sessionElapsedMs", () => {
  it("is wall-clock time since start minus paused time", () => {
    expect(sessionElapsedMs(1_000, 0, 6_000)).toBe(5_000);
    expect(sessionElapsedMs(1_000, 2_000, 6_000)).toBe(3_000);
  });

  it("never goes negative when clocks are skewed", () => {
    expect(sessionElapsedMs(6_000, 0, 1_000)).toBe(0);
    expect(sessionElapsedMs(1_000, 10_000, 6_000)).toBe(0);
  });

  it("defaults now to the current time", () => {
    const startedAt = Date.now() - 100;
    expect(sessionElapsedMs(startedAt, 0)).toBeGreaterThanOrEqual(100);
  });
});
