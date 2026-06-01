import { describe, expect, it } from "vitest";

import {
  identityInputFromProbe,
  nodeIdFromLibp2pPeerIdString,
  parseNodeIdInput,
  parseNodeIdRouteSegment,
} from "./nodeId";

/** Example libp2p ed25519 peer id (valid base58 multihash form). */
const SAMPLE_LIBP2P_PEER =
  "12D3KooWHpPFJKQcVRJj2fdgp9ZZcd4sSPWFgX5SrkTH4wNSwosX";

describe("identityInputFromProbe", () => {
  const canonical =
    "0xace9c4b0bca8bbb95391aae412174933ba56a1784faad1acba1ff5b76ef4f34a" as const;

  it("uses libp2p peer id when parseable", () => {
    const hashed = nodeIdFromLibp2pPeerIdString(SAMPLE_LIBP2P_PEER);
    expect(hashed).not.toBeNull();
    expect(
      identityInputFromProbe({
        canonicalNodeId: hashed!,
        identityPeerId: SAMPLE_LIBP2P_PEER,
      }),
    ).toBe(SAMPLE_LIBP2P_PEER);
    expect(parseNodeIdInput(SAMPLE_LIBP2P_PEER)).not.toBeNull();
  });

  it("rejects legacy mock- software peer_id strings", () => {
    expect(parseNodeIdInput("mock-52bf9790e8d962a5")).toBeNull();
    expect(
      identityInputFromProbe({
        canonicalNodeId: canonical,
        identityPeerId: "mock-52bf9790e8d962a5",
      }),
    ).toBe(canonical);
  });
});

describe("parseNodeIdRouteSegment", () => {
  it("parses libp2p peer id path segments", () => {
    const route = parseNodeIdRouteSegment(SAMPLE_LIBP2P_PEER);
    expect(route.kind).toBe("peer_id");
    expect(route.nodeId).not.toBeNull();
    expect(route.peerIdDisplay).toBe(SAMPLE_LIBP2P_PEER);
  });

  it("treats mock- segments as invalid", () => {
    const route = parseNodeIdRouteSegment("mock-52bf9790e8d962a5");
    expect(route.kind).toBe("invalid");
    expect(route.nodeId).toBeNull();
  });

  it("parses bytes32 path segments", () => {
    const canonical =
      "0xace9c4b0bca8bbb95391aae412174933ba56a1784faad1acba1ff5b76ef4f34a";
    const route = parseNodeIdRouteSegment(canonical);
    expect(route.kind).toBe("hex32");
    expect(route.nodeId?.toLowerCase()).toBe(canonical.toLowerCase());
  });
});
