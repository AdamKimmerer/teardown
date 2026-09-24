import { describe, expect, it } from "vitest";
import { documentTitle } from "../src/documentTitle.js";

describe("documentTitle", () => {
  it("reads the first level-one heading", () => {
    expect(
      documentTitle("intro\n# Acme pricing teardown\n\n## Summary\n# Later"),
    ).toBe("Acme pricing teardown");
  });

  it("ignores closing hashes and level-two headings", () => {
    expect(documentTitle("## Not this\n#   Acme  ##")).toBe("Acme");
  });

  it("is null without a level-one heading", () => {
    expect(documentTitle("## Summary\ntext")).toBeNull();
  });
});
