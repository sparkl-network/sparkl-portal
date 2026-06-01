import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side JSON fetch for the operator directory (avoids browser CORS).
 * For a registry node, pass `registryMetadataUriToFetchUrl(metadataURI)` (bare origins → `…/details` for legacy directory fields).
 * JSON may include `region` or `geo.region`.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (
    !url ||
    (!url.startsWith("http://") && !url.startsWith("https://"))
  ) {
    return NextResponse.json(
      { region: null, error: "url must be http(s)" },
      { status: 400 },
    );
  }

  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json, */*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      return NextResponse.json({ region: null, httpStatus: r.status });
    }
    const j: unknown = await r.json();
    if (!j || typeof j !== "object") {
      return NextResponse.json({ region: null });
    }
    const o = j as Record<string, unknown>;
    const region =
      typeof o.region === "string"
        ? o.region
        : o.geo && typeof o.geo === "object" && o.geo !== null
          ? typeof (o.geo as Record<string, unknown>).region === "string"
            ? ((o.geo as Record<string, unknown>).region as string)
            : null
          : null;
    return NextResponse.json({ region });
  } catch {
    return NextResponse.json({ region: null });
  }
}
