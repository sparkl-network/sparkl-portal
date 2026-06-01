import { BaseError } from "viem";

/** MetaMask / wallet JSON-RPC transport failure (not a contract revert). */
export function isWalletRpcTransportError(error: unknown): boolean {
  const parts: string[] = [];
  if (error instanceof BaseError) {
    parts.push(error.shortMessage, error.message, error.details ?? "");
    let cur: unknown = error.cause;
    while (cur) {
      if (cur instanceof BaseError) {
        parts.push(cur.shortMessage, cur.message, cur.details ?? "");
        cur = cur.cause;
        continue;
      }
      if (cur instanceof Error) {
        parts.push(cur.message);
      }
      break;
    }
  } else if (error instanceof Error) {
    parts.push(error.message);
  } else {
    parts.push(String(error));
  }
  const lower = parts.join(" ").toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("fetch failed") ||
    lower.includes("networkerror") ||
    lower.includes("internal error was received") ||
    lower.includes("-32603")
  );
}
