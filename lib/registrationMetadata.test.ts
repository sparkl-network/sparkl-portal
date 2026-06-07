import { describe, expect, it } from "vitest";

import { buildRegistrationMetadataUri } from "./registrationMetadata";

describe("registrationMetadata", () => {
  it("buildRegistrationMetadataUri omits moniker", () => {
    const uri = buildRegistrationMetadataUri({
      peerId: "12D3KooWTest",
      nodeId: "0xabc",
    });
    const o = JSON.parse(uri);
    expect(o.peer_id).toBe("12D3KooWTest");
    expect(o.node_id).toBe("0xabc");
    expect(o.moniker).toBeUndefined();
  });

  it("returns empty string when peer and node id absent", () => {
    expect(buildRegistrationMetadataUri({ peerId: "", nodeId: "" })).toBe("");
  });
});
