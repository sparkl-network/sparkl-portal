/**
 * Logs for the node registration flow. Enable with either:
 * - `NEXT_PUBLIC_DEBUG_REGISTER=1` (any build), or
 * - `NODE_ENV=development` (dev server only).
 *
 * Filter DevTools console by `[sparkl:register]`.
 */
export function registerDebug(
  label: string,
  detail?: Record<string, unknown>,
): void {
  const enabled =
    process.env.NEXT_PUBLIC_DEBUG_REGISTER === "1" ||
    process.env.NODE_ENV === "development";
  if (!enabled) return;
  if (detail !== undefined) {
    console.debug(`[sparkl:register] ${label}`, detail);
  } else {
    console.debug(`[sparkl:register] ${label}`);
  }
}
