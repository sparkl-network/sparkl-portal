/** Truncate an Ethereum address for compact list UI; returns input unchanged if too short. */
export function shortAddress(addr: string, head = 6, tail = 4): string {
  const a = addr.trim();
  if (!a.startsWith("0x") || a.length < head + tail + 2) return a;
  return `${a.slice(0, head)}…${a.slice(-tail)}`;
}
