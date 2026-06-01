import { NextRequest, NextResponse } from "next/server";

import { canonicalNodeIdFromIdentityBody } from "@/lib/identityProbe";
import { metadataUriToBaseUrl } from "@/lib/nodeBaseUrl";

export const runtime = "nodejs";

/**
 * Server-side fetch of `peer_id` from a node's **`GET /identity`**
 * (avoids browser CORS). `baseUrl` must match the HTTP origin used for probes.
 */
export async function GET(req: NextRequest) {
  const baseRaw = req.nextUrl.searchParams.get("baseUrl")?.trim() ?? "";
  const origin = metadataUriToBaseUrl(baseRaw);
  if (!origin) {
    return NextResponse.json(
      { peerId: null, error: "baseUrl must be http(s)://host[:port] or JSON metadata with baseUrl" },
      { status: 400 },
    );
  }

  const identityUrl = `${origin.replace(/\/+$/, "")}/identity`;

  try {
    const r = await fetch(identityUrl, {
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
    const canonical = canonicalNodeIdFromIdentityBody(j);
    return NextResponse.json({
      peerId: canonical?.peerId ?? peerId,
      nodeId: canonical?.nodeId ?? null,
    });
  } catch {
    return NextResponse.json({ peerId: null });
  }
}
