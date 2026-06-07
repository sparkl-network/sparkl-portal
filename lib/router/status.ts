import type { NodeStatus, NodesListResponse } from "@/lib/router/types";

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    /* keep raw */
  }
  if (!res.ok) {
    const err =
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof (parsed as { error: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : typeof parsed === "string"
          ? parsed
          : `Router status request failed (${res.status})`;
    throw new Error(err);
  }
  return parsed as T;
}

export async function fetchRouterNodesStatus(): Promise<NodesListResponse> {
  const res = await fetch("/api/router-status/nodes", { cache: "no-store" });
  return parseJson<NodesListResponse>(res);
}

export async function fetchRouterNodeStatus(nodeId: string): Promise<NodeStatus> {
  const segment = encodeURIComponent(nodeId);
  const res = await fetch(`/api/router-status/nodes/${segment}`, { cache: "no-store" });
  return parseJson<NodeStatus>(res);
}
