"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";

import { SessionDetailView } from "@/components/sessions/SessionDetailView";
import { parseSessionIdParam } from "@/lib/session/parseSessionId";
import { useResolvedNodeRoute } from "@/lib/useResolvedNodeRoute";

export default function NodeSessionDetailPage() {
  const params = useParams();
  const rawNode =
    typeof params.nodeId === "string"
      ? params.nodeId
      : Array.isArray(params.nodeId)
        ? params.nodeId[0]
        : "";
  const rawSession =
    typeof params.sessionId === "string"
      ? params.sessionId
      : Array.isArray(params.sessionId)
        ? params.sessionId[0]
        : "";

  const { nodeId: nodeIdFromRoute, pathSegmentForLinks } = useResolvedNodeRoute(rawNode);
  const sessionId = useMemo(() => parseSessionIdParam(rawSession ?? ""), [rawSession]);

  const backHref =
    nodeIdFromRoute && pathSegmentForLinks
      ? `/node/${encodeURIComponent(pathSegmentForLinks)}/session`
      : "/node";

  return (
    <SessionDetailView
      sessionId={sessionId}
      backHref={backHref}
      backLabel="Node sessions"
      expectedNodeId={nodeIdFromRoute}
    />
  );
}
