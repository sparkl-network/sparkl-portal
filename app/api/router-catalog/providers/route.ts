import { NextResponse } from "next/server";

import {
  clientKey,
  fetchRouterUpstream,
  getRouterUpstreamConfig,
  rateLimit,
} from "@/lib/router/serverProxy";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!rateLimit(`catalog:${clientKey(req)}`)) {
    return NextResponse.json(
      { error: "Too many catalog requests. Try again shortly." },
      { status: 429 },
    );
  }

  const cfg = getRouterUpstreamConfig(false);
  if (!cfg) {
    return NextResponse.json(
      { error: "SPARKL_ROUTER_URL is not configured on the portal server." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  const upstream = `${cfg.routerUrl}/v1/catalog/providers${qs ? `?${qs}` : ""}`;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetchRouterUpstream(upstream, { method: "GET" });
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

  return NextResponse.json(parsed, { status: upstreamRes.status });
}
