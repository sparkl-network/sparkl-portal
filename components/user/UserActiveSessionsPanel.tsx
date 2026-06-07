"use client";

import NextLink from "next/link";
import { useMemo } from "react";
import { formatUnits } from "viem";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isEscrowSessionOpen } from "@/lib/evm/escrow";
import {
  modelPageHref,
  nodePageHref,
  sessionDetailHref,
  sessionTitle,
  shortHex,
} from "@/lib/session/display";
import { useUserSessionQueries } from "@/lib/session/useUserSessionQueries";

export function UserActiveSessionsPanel() {
  const { chainReady, escrowUnset, configError, sessions, error, isFetching, modelNameById } =
    useUserSessionQueries();

  const activeSessions = useMemo(
    () => sessions.filter(({ s }) => isEscrowSessionOpen(s)),
    [sessions],
  );

  const showLoading = chainReady && !escrowUnset && isFetching;
  const showEmpty = chainReady && !escrowUnset && !isFetching && !error && activeSessions.length === 0;
  const errMsg = error instanceof Error ? error.message : "Could not load sessions";

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium">Active sessions</CardTitle>
        <NextLink
          href="/user/session"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline shrink-0"
        >
          View all
        </NextLink>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {!chainReady && (
          <p className="text-sm text-muted-foreground">Connect your wallet to see open sessions.</p>
        )}

        {chainReady && escrowUnset && !configError && (
          <p className="text-sm text-muted-foreground">Escrow is not configured on this network.</p>
        )}

        {chainReady && !escrowUnset && error && (
          <p className="text-sm text-destructive">{errMsg}</p>
        )}

        {showLoading && <Skeleton className="h-24 w-full" />}

        {showEmpty && (
          <p className="text-sm text-muted-foreground">
            No open sessions. Open one from a{" "}
            <NextLink href="/node" className="underline underline-offset-2">
              node
            </NextLink>{" "}
            page.
          </p>
        )}

        {activeSessions.length > 0 && (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="font-mono">ID</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Node</TableHead>
                  <TableHead className="text-right font-mono">Locked</TableHead>
                  <TableHead className="text-right font-mono">Usage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeSessions.map(({ sessionId, s }) => {
                  const href = sessionDetailHref("/user/session", sessionId);
                  const modelLabel =
                    modelNameById.get(s.modelId.toLowerCase()) ?? shortHex(s.modelId);
                  const nodeHref = nodePageHref(s.nodeId);
                  const modelHref = modelPageHref(s.modelId);

                  return (
                    <TableRow key={sessionId.toString()}>
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
                      <TableCell className="font-mono text-xs max-w-[140px] truncate">
                        <NextLink href={modelHref} className="hover:underline">
                          {modelLabel}
                        </NextLink>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[180px] truncate">
                        <NextLink href={nodeHref} className="hover:underline">
                          {shortHex(s.nodeId)}
                        </NextLink>
                      </TableCell>
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
        )}
      </CardContent>
    </Card>
  );
}
