/**
 * Human-readable labels for common JSON-RPC calldata (dev logging for /api/rpc).
 */

import { parseTransaction } from "viem";

const METHOD_SELECTORS: Record<string, string> = {
  "0x01ffc9a7": "supportsInterface",
  "0x95d89b41": "symbol()",
  "0x313ce567": "decimals()",
  "0x06fdde03": "name()",
  "0x18160ddd": "totalSupply()",
  "0x70a08231": "balanceOf(address)",
  "0xdd62ed3e": "allowance(address,address)",
  "0xa9059cbb": "transfer(address,uint256)",
  "0x23b872dd": "transferFrom(address,address,uint256)",
  "0xd0e30db0": "deposit()",
  "0x2e1a7d4d": "withdraw(uint256)",
  "0x6cddf290": "depositDot()",
  "0x100ee50f": "withdrawDot(uint256)",
  "0x4e50829d": "openSession(bytes32,uint8,bytes32,uint256,string)",
  "0x80d698dc": "getDotBalances(address)",
};

/** Well-known interface ids passed to supportsInterface(bytes4). */
const INTERFACE_IDS: Record<string, string> = {
  "0x01ffc9a7": "IERC165",
  "0x80ac58cd": "IERC721",
  "0xd9b67a26": "IERC1155",
  "0x5b5e139f": "IERC721Metadata",
  "0x7965db0b": "IERC721Enumerable (legacy)",
};

function shortAddr(a: string): string {
  const s = a.toLowerCase();
  if (!s.startsWith("0x") || s.length < 12) return a;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function describeSupportsInterface(data: string): string {
  const payload = data.startsWith("0x") ? data.slice(2) : data;
  const word = payload.slice(8, 8 + 64);
  if (word.length < 8) return "supportsInterface(?)";
  const id = ("0x" + word.slice(0, 8)).toLowerCase();
  const name = INTERFACE_IDS[id];
  return name ? `supportsInterface(${name})` : `supportsInterface(${id})`;
}

export function describeCalldata(data: string | undefined): string {
  if (data == null || data === "0x") return "(no calldata)";
  const hex = data.startsWith("0x") ? data : `0x${data}`;
  if (hex.length < 10) return "(short data)";
  const sel = hex.slice(0, 10).toLowerCase();
  if (sel === "0x01ffc9a7") return describeSupportsInterface(hex);
  const known = METHOD_SELECTORS[sel];
  if (known) return known;
  return `unknown(${sel})`;
}

function formatEthCallSummary(params: unknown): string {
  if (!Array.isArray(params) || params.length < 1) {
    return "eth_call (bad params)";
  }
  const tx = params[0];
  if (!tx || typeof tx !== "object") {
    return "eth_call";
  }
  const t = tx as Record<string, unknown>;
  const data = typeof t.data === "string" ? t.data : undefined;
  const to = typeof t.to === "string" ? t.to : undefined;
  const label = describeCalldata(data);
  const toPart = to ? ` →${shortAddr(to)}` : " →(no to)";
  return `${label}${toPart}`;
}

function summarizeTxLikeMethod(
  method: string,
  params: unknown,
): string {
  if (!Array.isArray(params) || params.length < 1) {
    return `${method} (bad params)`;
  }
  const tx = params[0];
  if (!tx || typeof tx !== "object") {
    return method;
  }
  const t = tx as Record<string, unknown>;
  const data = typeof t.data === "string" ? t.data : "";
  const to = typeof t.to === "string" ? t.to : undefined;
  const label = data && data !== "0x" ? describeCalldata(data) : "(empty data)";
  const toPart = to ? ` →${shortAddr(to)}` : "";
  return `${method} ${label}${toPart}`;
}

function formatSendRawTransactionSummary(params: unknown): string {
  if (
    !Array.isArray(params) ||
    params.length < 1 ||
    typeof params[0] !== "string"
  ) {
    return "eth_sendRawTransaction (bad params)";
  }
  const raw = params[0];
  try {
    const tx = parseTransaction(raw as `0x${string}`);
    const data =
      typeof tx.data === "string" && tx.data.length > 0 ? tx.data : "0x";
    const label = describeCalldata(data);
    const toPart = tx.to ? ` →${shortAddr(tx.to)}` : "";
    const valueWei = tx.value;
    const valueHint =
      valueWei !== undefined && valueWei > 0n ? ` valueWei=${valueWei}` : "";
    return `eth_sendRawTransaction ${label}${toPart}${valueHint}`;
  } catch {
    return `eth_sendRawTransaction (parse failed, ${raw.length} hexchars)`;
  }
}

function formatSingleRpcSummary(entry: unknown): string {
  if (!entry || typeof entry !== "object" || !("method" in entry)) {
    return "?";
  }
  const method = (entry as { method: unknown }).method;
  if (typeof method !== "string") {
    return "?";
  }
  const params = (entry as { params?: unknown }).params;

  if (method === "eth_call") {
    return `eth_call ${formatEthCallSummary(params)}`;
  }
  if (method === "eth_sendRawTransaction") {
    return formatSendRawTransactionSummary(params);
  }
  if (
    method === "eth_sendTransaction" ||
    method === "eth_estimateGas" ||
    method === "eth_signTransaction"
  ) {
    return summarizeTxLikeMethod(method, params);
  }
  return method;
}

/** One-line summary for JSON-RPC request body (single object or batch). */
export function formatJsonRpcSummary(body: string): string {
  try {
    const j: unknown = JSON.parse(body);
    if (Array.isArray(j)) {
      const parts = j.map(formatSingleRpcSummary);
      return `batch[${j.length}]: ${parts.join("; ")}`;
    }
    return formatSingleRpcSummary(j);
  } catch {
    return "(invalid json)";
  }
}
