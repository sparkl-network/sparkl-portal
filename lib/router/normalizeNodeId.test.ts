import { describe, expect, it } from "vitest";

import { normalizeNodeId } from "./normalizeNodeId";

describe("normalizeNodeId", () => {
  it("lowercases 0x + 64 hex", () => {
    const id =
      "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(normalizeNodeId(id)).toBe(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });

  it("pads short hex to 32 bytes", () => {
    expect(normalizeNodeId("0x01")).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    );
  });

  it("returns null for invalid input", () => {
    expect(normalizeNodeId("not-hex")).toBeNull();
    expect(normalizeNodeId("")).toBeNull();
  });
});
