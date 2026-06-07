import { describe, expect, it } from "vitest";

import { MAX_SESSION_NAME_CHARS, normalizeSessionName } from "./escrow";

describe("normalizeSessionName", () => {
  it("allows empty after trim", () => {
    expect(normalizeSessionName("   ")).toBe("");
  });

  it("trims and returns non-empty", () => {
    expect(normalizeSessionName("  my session  ")).toBe("my session");
  });

  it("rejects more than max characters", () => {
    const long = "a".repeat(MAX_SESSION_NAME_CHARS + 1);
    expect(() => normalizeSessionName(long)).toThrow(/128/);
  });
});
