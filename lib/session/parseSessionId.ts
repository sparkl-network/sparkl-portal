export function parseSessionIdParam(raw: string): bigint | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const id = BigInt(trimmed);
    if (id < 0n) return null;
    return id;
  } catch {
    return null;
  }
}
