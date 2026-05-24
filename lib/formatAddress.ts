/** Truncate an Ethereum address for compact list UI; returns input unchanged if too short. */
export function shortAddress(addr: string, head = 6, tail = 4): string {
  const a = addr.trim();
  if (!a.startsWith("0x") || a.length < head + tail + 2) return a;
  return `${a.slice(0, head)}…${a.slice(-tail)}`;
}

/** Truncate a `bytes32` hex string (0x + 64 hex) for list UI. */
export function shortNodeId(hex: string, head = 8, tail = 6): string {
  const a = hex.trim().toLowerCase();
  if (!a.startsWith("0x") || a.length < head + tail + 2) return hex;
  return `${a.slice(0, head)}…${a.slice(-tail)}`;
}
