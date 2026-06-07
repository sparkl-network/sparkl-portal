"use client";

import { Badge } from "@/components/ui/badge";
import type { NodeStatus, RouterTunnelStatus } from "@/lib/router/types";

function statusLabel(status: RouterTunnelStatus | "unknown"): string {
  switch (status) {
    case "online":
      return "Online";
    case "degraded":
      return "Degraded";
    case "offline":
      return "Offline";
    default:
      return "Unknown";
  }
}

function statusVariant(
  status: RouterTunnelStatus | "unknown",
): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "online":
      return "default";
    case "degraded":
      return "secondary";
    case "offline":
      return "outline";
    default:
      return "outline";
  }
}

function dotColor(status: RouterTunnelStatus | "unknown"): string {
  switch (status) {
    case "online":
      return "#16a34a";
    case "degraded":
      return "#d97706";
    case "offline":
      return "#9ca3af";
    default:
      return "#cbd5e1";
  }
}

function formatTooltip(detail: NodeStatus | undefined): string | undefined {
  if (!detail) return undefined;
  const parts: string[] = [`Tunnel: ${detail.status}`];
  if (detail.last_pong_at) parts.push(`Last pong: ${detail.last_pong_at}`);
  if (detail.in_flight_requests > 0) {
    parts.push(`In flight: ${detail.in_flight_requests}`);
  }
  if (detail.model_count > 0) parts.push(`Models cached: ${detail.model_count}`);
  if (detail.uptime_secs != null) parts.push(`Uptime: ${detail.uptime_secs}s`);
  return parts.join(" · ");
}

export type RouterTunnelBadgeProps = {
  status?: RouterTunnelStatus | "unknown";
  detail?: NodeStatus;
  /** When true, show compact dot + label (table). */
  compact?: boolean;
  className?: string;
};

export function RouterTunnelBadge({
  status = "unknown",
  detail,
  compact = false,
  className,
}: RouterTunnelBadgeProps) {
  const resolved = detail?.status ?? status;
  const title = formatTooltip(detail) ?? statusLabel(resolved);

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 ${className ?? ""}`}
        title={title}
      >
        <span
          className="flex-shrink-0 w-[6px] h-[6px] rounded-full"
          style={{ backgroundColor: dotColor(resolved) }}
        />
        <span className="text-sm">{statusLabel(resolved)}</span>
      </span>
    );
  }

  return (
    <Badge variant={statusVariant(resolved)} className={className} title={title}>
      <span
        className="inline-block w-[6px] h-[6px] rounded-full mr-1.5"
        style={{ backgroundColor: dotColor(resolved) }}
      />
      {statusLabel(resolved)}
    </Badge>
  );
}

export function RouterUnavailableHint() {
  return (
    <span className="text-xs text-muted-foreground" title="Router status not configured">
      —
    </span>
  );
}
