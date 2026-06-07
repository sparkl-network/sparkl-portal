const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 120;
const hits = new Map<string, { count: number; resetAt: number }>();

export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimit(key: string): boolean {
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

export type RouterUpstreamConfig = {
  routerUrl: string;
  adminToken?: string;
};

export function getRouterUpstreamConfig(requireAdmin: boolean): RouterUpstreamConfig | null {
  const routerUrl = process.env.SPARKL_ROUTER_URL?.trim();
  if (!routerUrl) return null;
  const adminToken = process.env.SPARKL_ROUTER_ADMIN_TOKEN?.trim();
  if (requireAdmin && !adminToken) return null;
  return { routerUrl: routerUrl.replace(/\/+$/, ""), adminToken };
}

export async function fetchRouterUpstream(
  upstream: string,
  init: RequestInit & { adminToken?: string },
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.adminToken) {
    headers.set("Authorization", `Bearer ${init.adminToken}`);
  }
  return fetch(upstream, { ...init, headers });
}
