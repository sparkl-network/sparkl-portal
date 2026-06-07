/**
 * Optional on-chain `metadataURI` JSON for `ProviderRegistry.registerNode`.
 * Moniker is not stored on-chain — it comes from sparkl-solo (`[node].moniker`) via the router tunnel.
 */

/** Registration JSON without moniker (peer id + node id only). */
export function buildRegistrationMetadataUri(opts: {
  peerId: string;
  nodeId: string;
}): string {
  const peerId = opts.peerId.trim();
  const nodeId = opts.nodeId.trim();
  if (!peerId && !nodeId) return "";
  return JSON.stringify({
    version: 1,
    ...(peerId ? { peer_id: peerId } : {}),
    ...(nodeId ? { node_id: nodeId } : {}),
  });
}
