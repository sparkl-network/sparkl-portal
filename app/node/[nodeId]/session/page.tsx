"use client";

import { useParams } from "next/navigation";

import { NodeSessionListPage } from "@/components/sessions/NodeSessionListPage";
import { useResolvedNodeRoute } from "@/lib/useResolvedNodeRoute";

export default function NodeSessionIndexPage() {
  const params = useParams();
  const raw =
    typeof params.nodeId === "string"
      ? params.nodeId
      : Array.isArray(params.nodeId)
        ? params.nodeId[0]
        : "";
  const { nodeId: nodeIdFromRoute, pathSegmentForLinks } = useResolvedNodeRoute(raw);

  const backHref =
    nodeIdFromRoute && pathSegmentForLinks
      ? `/node/${encodeURIComponent(pathSegmentForLinks)}`
      : "/node";

  return (
    <NodeSessionListPage
      nodeIdFromRoute={nodeIdFromRoute}
      pathSegmentForLinks={pathSegmentForLinks}
      backHref={backHref}
    />
  );
}
