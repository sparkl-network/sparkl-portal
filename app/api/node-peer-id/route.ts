import { NextRequest, NextResponse } from "next/server";

import { normalizeNodeBaseUrl } from "@/lib/nodeBaseUrl";

export const runtime = "nodejs";

/**
 * Server-side fetch of `peer_id` from a provider node's `/details` (avoids browser CORS).
 * `baseUrl` must match on-chain metadata (http(s) origin).
 */
export async function GET(req: NextRequest) {
  const baseRaw = req.nextUrl.searchParams.get("baseUrl")?.trim() ?? "";
  const origin = normalizeNodeBaseUrl(baseRaw);
  if (!origin) {
    return NextResponse.json(
      { peerId: null, error: "baseUrl must be http(s)://host[:port]" },
      { status: 400 },
    );
  }

  const detailsUrl = `${origin.replace(/\/+$/, "")}/details`;

  try {
    const r = await fetch(detailsUrl, {
      headers: { Accept: "application/json, */*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      return NextResponse.json({ peerId: null, httpStatus: r.status });
    }
    const j: unknown = await r.json();
    if (!j || typeof j !== "object") {
      return NextResponse.json({ peerId: null });
    }
    const o = j as Record<string, unknown>;
    const peerId =
      typeof o.peer_id === "string"
        ? o.peer_id.trim()
        : typeof o.peerId === "string"
          ? o.peerId.trim()
          : null;
    return NextResponse.json({ peerId });
  } catch {
    return NextResponse.json({ peerId: null });
  }
}
