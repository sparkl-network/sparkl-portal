"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";

import { SessionDetailView } from "@/components/sessions/SessionDetailView";
import { parseSessionIdParam } from "@/lib/session/parseSessionId";

export default function SessionDetailPage() {
  const params = useParams();
  const raw =
    typeof params.sessionId === "string"
      ? params.sessionId
      : Array.isArray(params.sessionId)
        ? params.sessionId[0]
        : "";

  const sessionId = useMemo(() => parseSessionIdParam(raw ?? ""), [raw]);

  return (
    <SessionDetailView sessionId={sessionId} backHref="/session" backLabel="My sessions" />
  );
}
