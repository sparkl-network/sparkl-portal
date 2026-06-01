import { NextResponse } from "next/server";

export const runtime = "nodejs";

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 30;
const hits = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

function rateLimit(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now >= entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX_PER_WINDOW) return false;
  entry.count += 1;
  return true;
}

export async function POST(req: Request) {
  if (!rateLimit(clientKey(req))) {
    return NextResponse.json(
      { error: "Too many activate requests. Try again shortly." },
      { status: 429 },
    );
  }

  const routerUrl = process.env.SPARKL_ROUTER_URL?.trim();
  if (!routerUrl) {
    return NextResponse.json(
      { error: "SPARKL_ROUTER_URL is not configured on the portal server." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId =
    typeof body === "object" &&
    body !== null &&
    "sessionId" in body &&
    typeof (body as { sessionId: unknown }).sessionId === "string"
      ? (body as { sessionId: string }).sessionId.trim()
      : "";

  const signature =
    typeof body === "object" &&
    body !== null &&
    "signature" in body &&
    typeof (body as { signature: unknown }).signature === "string"
      ? (body as { signature: string }).signature.trim()
      : "";

  const blockNumber =
    typeof body === "object" &&
    body !== null &&
    "blockNumber" in body &&
    (typeof (body as { blockNumber: unknown }).blockNumber === "string" ||
      typeof (body as { blockNumber: unknown }).blockNumber === "number")
      ? String((body as { blockNumber: string | number }).blockNumber)
      : "";

  const message =
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof (body as { message: unknown }).message === "string"
      ? (body as { message: string }).message
      : undefined;

  if (!sessionId || !signature || !blockNumber) {
    return NextResponse.json(
      { error: "sessionId, signature, and blockNumber are required" },
      { status: 400 },
    );
  }

  const base = routerUrl.replace(/\/+$/, "");
  const upstream = `${base}/sessions/${encodeURIComponent(sessionId)}/activate`;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        signature,
        blockNumber,
        ...(message ? { message } : {}),
      }),
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

  return NextResponse.json(parsed, { status: upstreamRes.status });
}
