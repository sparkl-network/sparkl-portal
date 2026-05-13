import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TIMEOUT_MS = 15_000;

type ProbePart = {
  ok: boolean;
  httpStatus: number;
  body: unknown;
  error?: string;
};

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
  const details = await fetchProbe("/details");
  const models = await fetchProbe("/v1/models");

  return NextResponse.json({ status, details, models });
}
