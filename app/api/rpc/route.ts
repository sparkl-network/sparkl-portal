import { NextResponse } from "next/server";

import { formatJsonRpcSummary } from "./ethCallLabels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rpcProxyDebugEnabled(req: Request): boolean {
  if (process.env.RPC_PROXY_DEBUG?.trim() === "0") return false;
  if (
    process.env.RPC_PROXY_DEBUG === "1" ||
    process.env.RPC_PROXY_DEBUG?.toLowerCase() === "true"
  ) {
    return true;
  }
  try {
    const u = new URL(req.url);
    if (u.searchParams.get("debug") === "1") return true;
  } catch {
    /* ignore */
  }
  return process.env.NODE_ENV === "development";
}

/** Log parsed JSON-RPC bodies (truncated). Set RPC_PROXY_DEBUG_PAYLOAD=0 for summary-only lines. */
function rpcProxyPayloadLogEnabled(): boolean {
  return process.env.RPC_PROXY_DEBUG_PAYLOAD?.trim() !== "0";
}

const PAYLOAD_STR_MAX = 220;
const PAYLOAD_0X_PREFIX = 160;

function shortenLogString(s: string): string {
  if (s.length <= PAYLOAD_STR_MAX) return s;
  if (s.startsWith("0x") && s.length > PAYLOAD_0X_PREFIX) {
    return `${s.slice(0, PAYLOAD_0X_PREFIX)}…(0x ${s.length} hexchars)`;
  }
  return `${s.slice(0, PAYLOAD_STR_MAX)}…(+${s.length - PAYLOAD_STR_MAX} chars)`;
}

function deepTruncateForLog(v: unknown, depth: number): unknown {
  if (depth > 14) return "…";
  if (v === null || v === undefined || typeof v === "boolean") return v;
  if (typeof v === "number") return v;
  if (typeof v === "string") return shortenLogString(v);
  if (Array.isArray(v)) {
    const cap = 24;
    if (v.length > cap) {
      return [
        ...v.slice(0, cap).map((x) => deepTruncateForLog(x, depth + 1)),
        `…(+${v.length - cap} array items)`,
      ];
    }
    return v.map((x) => deepTruncateForLog(x, depth + 1));
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(o)) {
      out[key] = deepTruncateForLog(o[key], depth + 1);
    }
    return out;
  }
  return String(v);
}

function logRpcPayload(label: "req" | "resp", raw: string): void {
  try {
    const parsed: unknown = JSON.parse(raw);
    const trimmed = deepTruncateForLog(parsed, 0);
    console.log(`[rpc-proxy] ${label}`, JSON.stringify(trimmed));
  } catch {
    const max = 900;
    console.log(
      `[rpc-proxy] ${label} (non-json or parse error)`,
      raw.length > max ? `${raw.slice(0, max)}…(${raw.length} chars)` : raw,
    );
  }
}

function safeRpcTargetLabel(target: string): string {
  try {
    const u = new URL(target);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "(invalid RPC_PROXY_TARGET)";
  }
}

/**
 * Dev-only JSON-RPC proxy: browser calls same-origin `/api/rpc`, Node forwards to Anvil.
 * Avoids browser "Failed to fetch" to raw `http://192.168.x.x:8545`.
 *
 * MetaMask’s extension uses cross-origin `fetch` to this URL; Chrome **Private Network Access**
 * requires **`Access-Control-Allow-Private-Network: true`** on OPTIONS/POST or preflight fails
 * (wallet shows **Failed to fetch** even when the page’s own requests work).
 *
 * Set `NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY=1` and `RPC_PROXY_TARGET=http://127.0.0.1:8545`.
 * Do not expose publicly without restricting access.
 */

const corsPrivateNetworkHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Private-Network": "true",
} as const;
export async function POST(req: Request) {
  const debug = rpcProxyDebugEnabled(req);
  const t0 = performance.now();
  const target = process.env.RPC_PROXY_TARGET?.trim();
  if (!target) {
    if (debug) {
      console.warn(
        "[rpc-proxy] POST rejected: RPC_PROXY_TARGET missing",
        `${(performance.now() - t0).toFixed(0)}ms`,
      );
    }
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message:
            "RPC_PROXY_TARGET is not set (server env). See .env.example for same-origin RPC proxy.",
        },
      },
      { status: 501, headers: { ...corsPrivateNetworkHeaders } },
    );
  }

  let body: string;
  try {
    body = await req.text();
  } catch (readErr) {
    if (debug) {
      console.warn(
        "[rpc-proxy] failed to read body",
        readErr instanceof Error ? readErr.message : readErr,
      );
    }
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Invalid JSON-RPC body" },
      },
      { status: 400, headers: { ...corsPrivateNetworkHeaders } },
    );
  }

  const methodSummary = formatJsonRpcSummary(body);
  const bodyBytes = Buffer.byteLength(body, "utf8");

  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
      cache: "no-store",
    });
    const text = await upstream.text();
    const ms = performance.now() - t0;
    if (debug) {
      const preview =
        text.length > 280 ? `${text.slice(0, 280)}…(${text.length} chars)` : text;
      console.log(
        "[rpc-proxy]",
        methodSummary,
        `→ ${upstream.status}`,
        `${ms.toFixed(0)}ms`,
        `body=${bodyBytes}B`,
        `upstream=${safeRpcTargetLabel(target)}`,
        upstream.ok ? "" : `resp=${preview}`,
      );
      if (rpcProxyPayloadLogEnabled()) {
        logRpcPayload("req", body);
        logRpcPayload("resp", text);
      }
    }
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        ...corsPrivateNetworkHeaders,
      },
    });
  } catch (e) {
    const ms = performance.now() - t0;
    const msg =
      e instanceof Error ? e.message : "RPC proxy upstream fetch failed";
    if (debug) {
      console.error(
        "[rpc-proxy]",
        methodSummary,
        "upstream fetch error",
        `${ms.toFixed(0)}ms`,
        `body=${bodyBytes}B`,
        `upstream=${safeRpcTargetLabel(target)}`,
        msg,
      );
      if (rpcProxyPayloadLogEnabled()) {
        logRpcPayload("req", body);
      }
    }
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: msg },
      },
      { status: 502, headers: { ...corsPrivateNetworkHeaders } },
    );
  }
}

export async function OPTIONS(req: Request) {
  if (rpcProxyDebugEnabled(req)) {
    console.log("[rpc-proxy] OPTIONS preflight");
  }
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Requested-With, Access-Control-Request-Private-Network",
      "Access-Control-Allow-Private-Network": "true",
    },
  });
}
