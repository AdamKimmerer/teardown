import { describe, expect, it } from "vitest";
import {
  checkRefineContract,
  imagePlaceholders,
  normalizeGeneratedPlaceholders,
} from "../src/outputContract.js";

const previous = `# Pricing teardown

The pricing table is buried under an accordion that most visitors will never open.

[IMAGE_1]

Enterprise has no public price, only a contact-sales button, and a much longer feature list.

[IMAGE_2]

Checkout asks for a credit card before the trial starts, which adds friction.

[IMAGE_3]
`;

describe("imagePlaceholders", () => {
  it("lists placeholder numbers in order, duplicates included", () => {
    expect(imagePlaceholders("a [IMAGE_2] b [IMAGE_10] c [IMAGE_2]")).toEqual([
      2, 10, 2,
    ]);
  });
});

describe("checkRefineContract", () => {
  it("accepts a light edit that keeps every image once", () => {
    const next = previous.replace(
      "adds friction",
      "adds real friction for new users",
    );
    expect(checkRefineContract(previous, next)).toEqual({ ok: true });
  });

  it("rejects a dropped image", () => {
    const result = checkRefineContract(
      previous,
      previous.replace("[IMAGE_2]", ""),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reasons).toContain(
      "[IMAGE_2] appears 0 times, expected once",
    );
  });

  it("rejects a duplicated image", () => {
    const result = checkRefineContract(previous, previous + "\n[IMAGE_1]\n");
    expect(!result.ok && result.reasons.join()).toContain(
      "[IMAGE_1] appears 2 times",
    );
  });

  it("rejects an invented image", () => {
    const result = checkRefineContract(previous, previous + "\n[IMAGE_9]\n");
    expect(!result.ok && result.reasons.join()).toContain(
      "[IMAGE_9] is not in the previous version",
    );
  });

  it("rejects a version shorter than half the previous one", () => {
    const next = "# Pricing\n\nShort. [IMAGE_1] [IMAGE_2] [IMAGE_3]";
    const result = checkRefineContract(previous, next);
    expect(!result.ok && result.reasons.join()).toContain("length fell");
  });

  it("rejects a version more than twice as long", () => {
    const withoutImages = previous.replace(/\[IMAGE_\d\]/g, "");
    const result = checkRefineContract(
      previous,
      previous + withoutImages + withoutImages,
    );
    expect(!result.ok && result.reasons.join()).toContain("length grew");
  });

  it("rejects a rewrite that keeps too little of the wording", () => {
    const next = `# Zzz qqq

Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor.

[IMAGE_1]

Ut enim minim veniam quis nostrud exercitation ullamco laboris nisi aliquip.

[IMAGE_2]

Duis aute irure dolor reprehenderit voluptate velit esse cillum dolore fugiat.

[IMAGE_3]
`;
    const result = checkRefineContract(previous, next);
    expect(!result.ok && result.reasons.join()).toContain(
      "of the previous wording remains",
    );
  });
});

describe("checkRefineContract: HTML", () => {
  it("rejects an edit that writes HTML elements", () => {
    const next = previous + "\n<h2>Comparison</h2>\n<p>Not possible.</p>\n";
    const result = checkRefineContract(previous, next);
    expect(!result.ok && result.reasons.join()).toContain(
      "contains HTML (<h2>)",
    );
  });

  it("allows angle brackets that are not HTML elements", () => {
    const next = previous.replace(
      "adds friction",
      "adds friction (<2% of users notice)",
    );
    expect(checkRefineContract(previous, next)).toEqual({ ok: true });
  });
});

describe("normalizeGeneratedPlaceholders", () => {
  it("leaves a valid document alone", () => {
    const result = normalizeGeneratedPlaceholders(previous, 3);
    expect(result.markdown).toBe(previous.trimEnd());
    expect(result.removed).toEqual([]);
    expect(result.appended).toEqual([]);
  });

  it("removes references to captures that do not exist and repeats", () => {
    const result = normalizeGeneratedPlaceholders(
      "a [IMAGE_1] b [IMAGE_7] c [IMAGE_1] d [IMAGE_0]",
      1,
    );
    expect(imagePlaceholders(result.markdown)).toEqual([1]);
    expect(result.removed).toEqual([7, 1, 0]);
  });

  it("appends captures the model did not place, in order", () => {
    const result = normalizeGeneratedPlaceholders("# T\n\nText [IMAGE_2]", 4);
    expect(result.appended).toEqual([1, 3, 4]);
    expect(result.markdown).toContain("## Other captures");
    expect(imagePlaceholders(result.markdown)).toEqual([2, 1, 3, 4]);
  });
});
