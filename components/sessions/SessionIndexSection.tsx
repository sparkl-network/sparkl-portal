"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { formatUnits } from "viem";

import { RouterTunnelBadge } from "@/components/router/RouterTunnelBadge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isEscrowSessionOpen } from "@/lib/evm/escrow";
import { isTunnelHealthy } from "@/lib/router/merge";
import { lookupRouterStatus } from "@/lib/router/useRouterData";
import type { NodeStatus } from "@/lib/router/types";
import {
  sessionStatusLabel,
  sessionStatusVariant,
  modelPageHref,
  nodePageHref,
  sessionTitle,
  shortHex,
  tierLabel,
} from "@/lib/session/display";
import type { SessionListViewMode } from "@/lib/session/useSessionListViewMode";
import type { EscrowSession } from "@/lib/types";

export type SessionRow = { sessionId: bigint; s: EscrowSession };

type SessionIndexSectionProps = {
  rows: SessionRow[];
  modelNameById: Map<string, string>;
  detailHref: (sessionId: bigint) => string;
  variant: "wallet" | "node";
  viewMode: SessionListViewMode;
  routerConfigured?: boolean;
  routerStatusUnavailable?: boolean;
  statusByNodeId?: Map<string, NodeStatus>;
};

function modelLabelFor(row: SessionRow, modelNameById: Map<string, string>): string {
  return modelNameById.get(row.s.modelId.toLowerCase()) ?? shortHex(row.s.modelId);
}

function SessionSummaryCard({
  row,
  href,
  modelLabel,
  variant,
  routerConfigured,
  routerStatusUnavailable,
  nodeRouterStatus,
}: {
  row: SessionRow;
  href: string;
  modelLabel: string;
  variant: "wallet" | "node";
  routerConfigured?: boolean;
  routerStatusUnavailable?: boolean;
  nodeRouterStatus?: NodeStatus;
}) {
  const router = useRouter();
  const { sessionId, s } = row;
  const open = isEscrowSessionOpen(s);
  const nodeHref = nodePageHref(s.nodeId);
  const modelHref = modelPageHref(s.modelId);
  const tunnelUnhealthy =
    variant === "wallet" &&
    routerConfigured &&
    !routerStatusUnavailable &&
    open &&
    nodeRouterStatus &&
    !isTunnelHealthy(nodeRouterStatus.status);

  function openDetail() {
    router.push(href);
  }

  return (
    <Card
      role="link"
      tabIndex={0}
      className="transition-colors hover:border-primary/40 h-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail();
        }
      }}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base truncate">{sessionTitle(s, sessionId)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {s.name.trim() && (
          <p className="text-xs text-muted-foreground font-mono tabular-nums -mt-1">
            id {sessionId.toString()}
          </p>
        )}
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Badge variant={sessionStatusVariant(s)}>{sessionStatusLabel(s)}</Badge>
          <span>{tierLabel(s.tier)}</span>
          <span className="font-mono">
            Model{" "}
            <NextLink
              href={modelHref}
              className="underline underline-offset-2 hover:text-foreground/80"
              onClick={(e) => e.stopPropagation()}
            >
              {modelLabel}
            </NextLink>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-mono">
          <span>
            Node{" "}
            <NextLink
              href={nodeHref}
              className="underline underline-offset-2 hover:text-foreground/80"
              onClick={(e) => e.stopPropagation()}
            >
              {shortHex(s.nodeId)}
            </NextLink>
          </span>
          {variant === "wallet" && routerConfigured && !routerStatusUnavailable && (
            <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <RouterTunnelBadge
                status={nodeRouterStatus?.status ?? "offline"}
                detail={nodeRouterStatus}
                compact
              />
            </span>
          )}
          {variant === "node" && (
            <span className="truncate">user {shortHex(s.user)}</span>
          )}
        </div>

        {tunnelUnhealthy && (
          <Alert variant="warning" className="py-2" onClick={(e) => e.stopPropagation()}>
            <AlertDescription className="text-xs">
              Node tunnel is not healthy ({nodeRouterStatus?.status}) — chat may fail.
            </AlertDescription>
          </Alert>
        )}

        <p className="text-xs text-muted-foreground font-mono tabular-nums">
          Locked {formatUnits(s.lockedInternal, 18)} · Usage {formatUnits(s.usageRecorded, 18)}
        </p>
      </CardContent>
    </Card>
  );
}

export function SessionIndexSection({
  rows,
  modelNameById,
  detailHref,
  variant,
  viewMode,
  routerConfigured,
  routerStatusUnavailable,
  statusByNodeId,
}: SessionIndexSectionProps) {
  if (rows.length === 0) return null;

  if (viewMode === "card") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.map((row) => {
          const nodeRouterStatus =
            variant === "wallet" && statusByNodeId
              ? lookupRouterStatus(statusByNodeId, row.s.nodeId)
              : undefined;
          return (
            <SessionSummaryCard
              key={row.sessionId.toString()}
              row={row}
              href={detailHref(row.sessionId)}
              modelLabel={modelLabelFor(row, modelNameById)}
              variant={variant}
              routerConfigured={routerConfigured}
              routerStatusUnavailable={routerStatusUnavailable}
              nodeRouterStatus={nodeRouterStatus}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="font-mono">ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Node</TableHead>
            {variant === "node" ? <TableHead>User</TableHead> : null}
            <TableHead className="text-right font-mono">Locked</TableHead>
            <TableHead className="text-right font-mono">Usage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const { sessionId, s } = row;
            const href = detailHref(sessionId);
            const modelLabel = modelLabelFor(row, modelNameById);

            return (
              <TableRow key={sessionId.toString()} className="cursor-pointer">
                <TableCell className="max-w-[200px]">
                  <NextLink href={href} className="font-medium hover:underline truncate block">
                    {sessionTitle(s, sessionId)}
                  </NextLink>
                </TableCell>
                <TableCell className="font-mono text-xs tabular-nums">
                  <NextLink href={href} className="hover:underline">
                    {sessionId.toString()}
                  </NextLink>
                </TableCell>
                <TableCell>
                  <NextLink href={href} className="inline-block">
                    <Badge variant={sessionStatusVariant(s)}>{sessionStatusLabel(s)}</Badge>
                  </NextLink>
                </TableCell>
                <TableCell className="font-mono text-xs max-w-[140px] truncate">
                  <NextLink
                    href={modelPageHref(s.modelId)}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {modelLabel}
                  </NextLink>
                </TableCell>
                <TableCell className="font-mono text-xs max-w-[180px] truncate">
                  <NextLink
                    href={nodePageHref(s.nodeId)}
                    className="hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {shortHex(s.nodeId)}
                  </NextLink>
                </TableCell>
                {variant === "node" ? (
                  <TableCell className="font-mono text-xs max-w-[180px] truncate">
                    <NextLink href={href} className="hover:underline">
                      {shortHex(s.user)}
                    </NextLink>
                  </TableCell>
                ) : null}
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  <NextLink href={href} className="hover:underline block">
                    {formatUnits(s.lockedInternal, 18)}
                  </NextLink>
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  <NextLink href={href} className="hover:underline block">
                    {formatUnits(s.usageRecorded, 18)}
                  </NextLink>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
