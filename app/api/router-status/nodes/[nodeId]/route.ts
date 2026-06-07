import { NextResponse } from "next/server";

import {
  clientKey,
  fetchRouterUpstream,
  getRouterUpstreamConfig,
  rateLimit,
} from "@/lib/router/serverProxy";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ nodeId: string }> };

export async function GET(req: Request, context: RouteContext) {
  if (!rateLimit(`status:${clientKey(req)}`)) {
    return NextResponse.json(
      { error: "Too many status requests. Try again shortly." },
      { status: 429 },
    );
  }

  const cfg = getRouterUpstreamConfig(true);
  if (!cfg) {
    return NextResponse.json(
      {
        error:
          "SPARKL_ROUTER_URL and SPARKL_ROUTER_ADMIN_TOKEN must be set on the portal server.",
      },
      { status: 503 },
    );
  }

  const { nodeId } = await context.params;
  const segment = nodeId.trim();
  if (!segment) {
    return NextResponse.json({ error: "nodeId is required" }, { status: 400 });
  }

  const upstream = `${cfg.routerUrl}/status/nodes/${encodeURIComponent(segment)}`;
  let upstreamRes: Response;
  try {
    upstreamRes = await fetchRouterUpstream(upstream, {
      method: "GET",
      adminToken: cfg.adminToken,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Router request failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const text = await upstreamRes.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    /* keep raw */
  }

  if (!upstreamRes.ok && typeof parsed === "string") {
    return new NextResponse(parsed, { status: upstreamRes.status });
  }

  return NextResponse.json(parsed, { status: upstreamRes.status });
}
