import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TIMEOUT_MS = 15_000;

type ProbePart = {
  ok: boolean;
  httpStatus: number;
  body: unknown;
  error?: string;
};

function parseExtraHosts(): string[] {
  const raw = process.env.PROVIDER_NODE_PROBE_HOSTS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedProbeHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "[::1]"
  ) {
    return true;
  }
  return parseExtraHosts().includes(h);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const baseUrlRaw =
    typeof body === "object" &&
    body !== null &&
    "baseUrl" in body &&
    typeof (body as { baseUrl: unknown }).baseUrl === "string"
      ? (body as { baseUrl: string }).baseUrl.trim()
      : "";

  if (!baseUrlRaw) {
    return NextResponse.json(
      { error: "baseUrl is required (e.g. http://127.0.0.1:8787)" },
      { status: 400 },
    );
  }

  let origin: URL;
  try {
    const normalized = baseUrlRaw.replace(/\/+$/, "");
    origin = new URL(normalized.includes("://") ? normalized : `http://${normalized}`);
  } catch {
    return NextResponse.json(
      { error: "Invalid baseUrl — use http(s)://host:port" },
      { status: 400 },
    );
  }

  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    return NextResponse.json(
      { error: "Only http and https URLs are allowed" },
      { status: 400 },
    );
  }

  if (!isAllowedProbeHost(origin.hostname)) {
    return NextResponse.json(
      {
        error:
          "Host not allowed for probe. Use localhost or 127.0.0.1, or add hostnames via PROVIDER_NODE_PROBE_HOSTS (comma-separated).",
      },
      { status: 403 },
    );
  }

  const base = origin.origin;

  async function fetchProbe(path: string): Promise<ProbePart> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(`${base}${path}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      const text = await r.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        /* keep raw text */
      }
      return { ok: r.ok, httpStatus: r.status, body: parsed };
    } catch (e) {
      return {
        ok: false,
        httpStatus: 0,
        body: null,
        error: e instanceof Error ? e.message : "Request failed",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const status = await fetchProbe("/status");
  const models = await fetchProbe("/v1/models");

  return NextResponse.json({ status, models });
}
