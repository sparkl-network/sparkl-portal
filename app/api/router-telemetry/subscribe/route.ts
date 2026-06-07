import { createHmac } from "node:crypto";

import { NextResponse } from "next/server";

import {
  clientKey,
  getRouterUpstreamConfig,
  rateLimit,
} from "@/lib/router/serverProxy";

export const runtime = "nodejs";

const SUBSCRIBE_TTL_SECS = 300;
const SUBSCRIBE_MIN_INTERVAL_MS = 2_000;
const subscribeCooldown = new Map<string, number>();

function routerWsBase(httpUrl: string): string {
  const u = new URL(httpUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.origin;
}

function allowSubscribeRequest(req: Request): boolean {
  const key = clientKey(req);
  const now = Date.now();
  const last = subscribeCooldown.get(key) ?? 0;
  if (now - last < SUBSCRIBE_MIN_INTERVAL_MS) return false;
  subscribeCooldown.set(key, now);
  return rateLimit(`telemetry:${key}`);
}

export async function POST(req: Request) {
  if (!allowSubscribeRequest(req)) {
    return NextResponse.json(
      { error: "Too many telemetry subscribe requests. Try again shortly." },
      { status: 429 },
    );
  }

  const cfg = getRouterUpstreamConfig(true);
  if (!cfg?.adminToken) {
    return NextResponse.json(
      {
        error:
          "SPARKL_ROUTER_URL and SPARKL_ROUTER_ADMIN_TOKEN must be set on the portal server.",
      },
      { status: 503 },
    );
  }

  const exp = Math.floor(Date.now() / 1000) + SUBSCRIBE_TTL_SECS;
  const token = createHmac("sha256", cfg.adminToken)
    .update(String(exp))
    .digest("hex");

  const wsUrl = `${routerWsBase(cfg.routerUrl)}/status/subscribe?token=${token}`;

  return NextResponse.json({ wsUrl, exp });
}
