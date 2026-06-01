"use client";

import { useMemo } from "react";
import { type Hex } from "viem";

import { parseNodeIdRouteSegment, type ParsedNodeRoute } from "@/lib/nodeId";

export type ResolvedNodeRoute = {
  parsed: ParsedNodeRoute;
  /** On-chain `bytes32` node id from URL segment (libp2p hash or raw hex). */
  nodeId: Hex | null;
  /** Path segment for links: libp2p peer id or bytes32 hex. */
  pathSegmentForLinks: string;
};

/**
 * Parse `/node/[segment]` into an on-chain node id and display segment.
 * Expects libp2p `12D3Koo…` or `0x` + 64 hex (legacy dev addresses still parse).
 */
export function useResolvedNodeRoute(rawSegment: string): ResolvedNodeRoute {
  const parsed = useMemo(
    () => parseNodeIdRouteSegment(rawSegment),
    [rawSegment],
  );

  const nodeId = parsed.nodeId;

  const pathSegmentForLinks = useMemo(() => {
    if (!nodeId) return "";
    if (parsed.kind === "peer_id" && parsed.peerIdDisplay) {
      return parsed.peerIdDisplay;
    }
    return nodeId;
  }, [nodeId, parsed.kind, parsed.peerIdDisplay]);

  return {
    parsed,
    nodeId,
    pathSegmentForLinks,
  };
}
