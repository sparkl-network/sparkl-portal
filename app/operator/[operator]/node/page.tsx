"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { usePortalPublicClient } from "@/lib/usePortalPublicClient";

import { NodeDirectoryTable } from "@/components/nodes/NodeDirectoryTable";
import { ZERO_ADDRESS } from "@/lib/chains";
import { getOperatorNodes, getNode, type RegisteredNodeWithOperator } from "@/lib/evm/registry";
import { shortAddress } from "@/lib/formatAddress";
import {
  enrichRegisteredNodesWithPeerId,
  mergeRouterMoniker,
  type RegisteredNodeListRow,
} from "@/lib/nodeListRow";
import { useRouterNodesStatus } from "@/lib/router/useRouterData";
import { routerBaseUrl } from "@/lib/router/activate";
import { useHubChainConfig } from "@/lib/useHubChainConfig";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

function rowMatchesSearch(r: RegisteredNodeListRow, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  const moniker = (r.moniker ?? "").toLowerCase();
  const peer = (r.nodeIdString ?? "").toLowerCase();
  return (
    r.nodeId.toLowerCase().includes(s) ||
    moniker.includes(s) ||
    peer.includes(s) ||
    r.info.payout.toLowerCase().includes(s)
  );
}

export default function OperatorNodesPage() {
  const params = useParams();
  const raw = typeof params.operator === "string" ? params.operator : Array.isArray(params.operator) ? params.operator[0] : "";

  const operatorAddr = useMemo((): Address | null => {
    const s = raw.trim();
    if (!s || !isAddress(s)) return null;
    try { return getAddress(s); } catch { return null; }
  }, [raw]);

  const { hubConfig, configError } = useHubChainConfig();
  const publicClient = usePortalPublicClient();

  const registryUnset = Boolean(!hubConfig || !hubConfig.operatorRegistryAddress || hubConfig.operatorRegistryAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase());

  const listReady = Boolean(operatorAddr && hubConfig && publicClient && !registryUnset && !configError);
  const [search, setSearch] = useState("");
  const routerConfigured = Boolean(routerBaseUrl());
  const { statusByNodeId } = useRouterNodesStatus();

  const { data: rows = [], error: listError, isFetching: listLoading } = useQuery({
    queryKey: ["operatorNodesPage", hubConfig?.chainId, hubConfig?.operatorRegistryAddress, operatorAddr],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !operatorAddr) throw new Error("Missing RPC client, hub config, or operator");
      const registry = hubConfig.operatorRegistryAddress;
      const nodeIds: Hex[] = await getOperatorNodes(publicClient, registry, operatorAddr);
      const infos = await Promise.all(nodeIds.map((nodeId) => getNode(publicClient, registry, nodeId)));
      const base = nodeIds.map((nodeId, i): RegisteredNodeWithOperator => ({
        nodeId,
        info: infos[i],
        operator: operatorAddr,
      }));
      return enrichRegisteredNodesWithPeerId(base);
    },
    enabled: listReady,
  });

  const stats = useMemo(() => {
    let registered = 0, active = 0, waiting = 0;
    for (const r of rows) {
      const isReg = r.info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
      if (isReg) { registered += 1; if (r.info.active) active += 1; } else { waiting += 1; }
    }
    return { registered, active, waiting, total: rows.length };
  }, [rows]);

  const rowsWithMoniker = useMemo(
    () => (routerConfigured ? mergeRouterMoniker(rows, statusByNodeId) : rows),
    [rows, statusByNodeId, routerConfigured],
  );

  const filteredRows = useMemo(
    () => rowsWithMoniker.filter((r) => rowMatchesSearch(r, search)),
    [rowsWithMoniker, search],
  );
  const listErrMsg = listError instanceof Error ? listError.message : "Could not load nodes";

  return (
    <div className="px-3 py-3 w-full space-y-4">
      {/* Back link */}
      <NextLink href="/node" className="text-sm text-muted-foreground hover:underline inline-block">← All nodes</NextLink>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Operator nodes</h1>
        <p className="text-sm text-muted-foreground">Nodes where this address is the on-chain operator. Same table layout as the global directory—with search and status legend.</p>
      </div>

      {/* Invalid operator */}
      {!operatorAddr && (
        <Alert variant="destructive"><AlertTitle>Invalid operator address</AlertTitle><AlertDescription>Use a checksummed or lowercase 0x address in the URL, for example /operator/0x…/node.</AlertDescription></Alert>
      )}

      {operatorAddr && <code className="break-all text-xs font-mono text-muted-foreground">{operatorAddr}</code>}

      {/* Config errors */}
      {configError && <Alert variant="destructive"><AlertTitle>Configuration error</AlertTitle><AlertDescription>{configError}</AlertDescription></Alert>}
      {hubConfig && registryUnset && !configError && (<Alert variant="destructive"><AlertTitle>Operator registry address missing</AlertTitle><AlertDescription>Set a deployed ProviderRegistry in your env (see .env.example), then restart the dev server.</AlertDescription></Alert>)}

      {/* List error */}
      {listReady && listError && (<Alert variant="destructive"><AlertTitle>Registry read failed</AlertTitle><AlertDescription>{listErrMsg}</AlertDescription></Alert>)}

      {/* Loading */}
      {listReady && listLoading && <Skeleton className="h-[300px] w-full" />}

      {/* Empty state */}
      {listReady && !listLoading && !listError && rows.length === 0 && (
        <Alert variant="default" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"><AlertTitle>No nodes for this operator</AlertTitle><AlertDescription>This address has no entries in <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">operatorNodes</code> on the registry.</AlertDescription></Alert>
      )}

      {/* Stats */}
      {listReady && !listLoading && !listError && rows.length > 0 && (
        <Card className="border-blue-200 dark:border-blue-800 bg-accent/30">
          <CardContent className="pt-4"><div className="flex gap-4 flex-wrap">
            <div><span className="text-xs text-muted-foreground">Active / registered</span><br /><code className="font-mono">{stats.active} / {stats.registered}</code></div>
            <div><span className="text-xs text-muted-foreground">Waiting</span><br /><code className="font-mono">{stats.waiting}</code></div>
            <div><span className="text-xs text-muted-foreground">Total</span><br /><code className="font-mono">{stats.total}</code></div>
          </div></CardContent>
        </Card>
      )}

      {/* Legend & search */}
      {listReady && !listLoading && !listError && rows.length > 0 && (<>
        <div className="space-y-2">
          <div className="flex gap-3 flex-wrap items-center text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-[5px] w-[5px] rounded-full bg-green-500" />Active</span>
            <span className="flex items-center gap-1"><span className="h-[5px] w-[5px] rounded-full bg-red-500" />Inactive</span>
            <span className="flex items-center gap-1"><span className="h-[5px] w-[5px] rounded-full bg-gray-400" />Waiting</span>
            <span className="flex items-center gap-1">→ Open node</span>
          </div>
          <Input placeholder={`Filter by moniker, node id, or payout · ${shortAddress(operatorAddr ?? "0x")}`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {/* Results count */}
        <p className="text-xs text-muted-foreground">Showing {filteredRows.length} of {rowsWithMoniker.length} nodes</p>

        {/* Table or empty */}
        {filteredRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No nodes match this search.</p>
        ) : (
          <NodeDirectoryTable
            rows={filteredRows}
            showOperatorColumn={false}
            routerConfigured={routerConfigured}
            statusByNodeId={statusByNodeId}
          />
        )}
      </>)}

      {!listReady && registryUnset && !configError && <Skeleton className="h-[300px] w-full" />}
    </div>
  );
}
