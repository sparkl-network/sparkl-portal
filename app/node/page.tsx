"use client";

import { useMemo, useState } from "react";

import NextLink from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAddress } from "viem";

import { NodeDirectoryTable } from "@/components/nodes/NodeDirectoryTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ZERO_ADDRESS } from "@/lib/chains";
import {
  getRegisteredNodesWithOperators,
} from "@/lib/evm/registry";
import { shortAddress } from "@/lib/formatAddress";
import {
  enrichRegisteredNodesWithPeerId,
  type RegisteredNodeListRow,
} from "@/lib/nodeListRow";
import { useHubChainConfig } from "@/lib/useHubChainConfig";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";

type NodeFilter = "all" | "active" | "waiting" | "mine";

function StatBlock({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col items-start gap-0 min-w-[120px]">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span className="text-xl tabular-nums font-mono">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

function DonutStat({ label, pct, sublabel }: { label: string; pct: number; sublabel: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-[14px] h-[14px] rounded-full flex-shrink-0 flex items-center justify-center"
        style={{
          background: `conic-gradient(from 0deg, #16a34a 0%, #16a34a ${p}%, #e5e7eb ${p}%, #e5e7eb 100%)`,
        }}
      >
        <div className="w-[9px] h-[9px] rounded-full bg-background" />
      </div>
      <div className="flex flex-col items-start gap-0">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm tabular-nums font-mono">{p.toFixed(0)}%</span>
        <span className="text-xs text-muted-foreground">{sublabel}</span>
      </div>
    </div>
  );
}

function rowMatchesSearch(r: RegisteredNodeListRow, q: string): boolean {
  if (!q.trim()) return true;
  const raw = q.trim();
  const s = raw.toLowerCase();
  const op = getAddress(r.operator).toLowerCase();
  const peer = r.nodeIdString ?? "";
  return (
    (peer.length > 0 && peer.includes(raw)) ||
    op.includes(s) ||
    r.info.payout.toLowerCase().includes(s) ||
    shortAddress(op).toLowerCase().includes(s)
  );
}

export default function AllNodesPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  void walletClient;
  const { hubConfig, configError } = useHubChainConfig();

  const publicClient = usePublicClient({
    chainId: hubConfig?.chainId,
  });

  const registryUnset = Boolean(
    !hubConfig ||
      !hubConfig.operatorRegistryAddress ||
      hubConfig.operatorRegistryAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase(),
  );

  const walletOnHub = Boolean(
    isConnected && hubConfig && chainId === hubConfig.chainId,
  );

  const registerCtaReady = Boolean(
    walletOnHub && hubConfig && address && !registryUnset && !configError,
  );

  const listReady = Boolean(
    hubConfig && publicClient && !registryUnset && !configError,
  );

  const [filter, setFilter] = useState<NodeFilter>("all");
  const [search, setSearch] = useState("");

  const {
    data: rows = [],
    error: listError,
    isFetching: listLoading,
  } = useQuery({
    queryKey: [
      "allRegistryNodes",
      hubConfig?.chainId,
      hubConfig?.operatorRegistryAddress,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig) {
        throw new Error("Missing RPC client or hub config");
      }
      return enrichRegisteredNodesWithPeerId(
        await getRegisteredNodesWithOperators(
          publicClient,
          hubConfig.operatorRegistryAddress,
        ),
      );
    },
    enabled: listReady,
  });

  const stats = useMemo(() => {
    const total = rows.length;
    let registered = 0;
    let active = 0;
    let waiting = 0;
    const operators = new Set<string>();
    let feeSum = 0;
    for (const r of rows) {
      const isReg = r.info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
      operators.add(getAddress(r.operator).toLowerCase());
      if (isReg) {
        registered += 1;
        feeSum += r.info.feeBps;
        if (r.info.active) active += 1;
      } else {
        waiting += 1;
      }
    }
    const avgFeeBps = registered > 0 ? feeSum / registered : 0;
    const activeOfRegPct = registered > 0 ? (active / registered) * 100 : 0;
    const registeredPct = total > 0 ? (registered / total) * 100 : 0;
    return {
      total, registered, active, waiting, operatorCount: operators.size,
      avgFeeBps, activeOfRegPct, registeredPct,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const addrLower = address?.toLowerCase();
    return rows.filter((r) => {
      if (!rowMatchesSearch(r, search)) return false;
      const isReg = r.info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
      const op = getAddress(r.operator).toLowerCase();
      if (filter === "active") return isReg && r.info.active;
      if (filter === "waiting") return !isReg;
      if (filter === "mine") {
        if (!addrLower) return false;
        return op === addrLower;
      }
      return true;
    });
  }, [rows, filter, search, address]);

  const listErrMsg = listError instanceof Error ? listError.message : "Could not load nodes";

  const filterButtons: { id: NodeFilter; label: string }[] = [
    { id: "all", label: "All nodes" },
    { id: "active", label: "Active" },
    { id: "waiting", label: "Waiting" },
    { id: "mine", label: "My nodes" },
  ];

  return (
    <div className="px-3 py-3 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Nodes</h1>
          <p className="text-sm text-muted-foreground mt-1">Hub registry directory</p>
        </div>
        {registerCtaReady && (
          <NextLink href="/node/register" className="no-underline">
            <Button variant="default" size="compact">
              Register node
            </Button>
          </NextLink>
        )}
      </div>

      {/* Error banners */}
      {configError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Configuration error</AlertTitle>
          <AlertDescription>{configError}</AlertDescription>
        </Alert>
      )}

      {hubConfig && registryUnset && !configError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Operator registry address missing</AlertTitle>
          <AlertDescription>
            Set a deployed ProviderRegistry in your env (see .env.example), then restart the dev server.
          </AlertDescription>
        </Alert>
      )}

      {isConnected && hubConfig && chainId !== hubConfig.chainId && (
        <Alert variant="warning" className="mb-4">
          <AlertTitle>Wrong network</AlertTitle>
          <AlertDescription>
            Switch to chain {hubConfig.chainId} ({hubConfig.chainName}) to register or manage nodes with your wallet. You can still browse this list using the hub RPC.
          </AlertDescription>
        </Alert>
      )}

      {listReady && listError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Registry read failed</AlertTitle>
          <AlertDescription>{listErrMsg}</AlertDescription>
        </Alert>
      )}

      {/* Stats */}
      {listReady && !listError && !listLoading && rows.length > 0 && (
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-3 mb-4">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex gap-8 flex-wrap">
              <StatBlock label="Active / registered" value={`${stats.active} / ${stats.registered}`} sub={`${stats.total} in registry`} />
              <StatBlock label="Waiting" value={`${stats.waiting}`} sub="No payout set" />
              <StatBlock label="Operators" value={`${stats.operatorCount}`} sub="Unique addresses" />
              <StatBlock label="Avg fee" value={`${(stats.avgFeeBps / 100).toFixed(2)}%`} sub="Registered nodes" />
            </div>
            <div className="flex gap-8 flex-wrap">
              <DonutStat label="Active (of registered)" pct={stats.activeOfRegPct} sublabel={`${stats.active} active`} />
              <DonutStat label="With payout" pct={stats.registeredPct} sublabel={`${stats.registered} registered`} />
            </div>
          </div>
        </div>
      )}

      {/* Filters & Search */}
      {listReady && !listError && !listLoading && rows.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {filterButtons.map(({ id, label }) => {
                const selected = filter === id;
                const disabled = id === "mine" && !address;
                return (
                  <Badge
                    key={id}
                    variant={selected ? "default" : "secondary"}
                    className={`cursor-pointer ${disabled ? "opacity-50 pointer-events-none" : "hover:bg-accent/80 cursor-pointer"}`}
                    onClick={!disabled ? () => setFilter(id) : undefined}
                  >
                    <span>{label}</span>
                  </Badge>
                );
              })}
            </div>
            <div className="flex gap-4 items-center flex-wrap text-xs text-muted-foreground">
              <div className="flex gap-1 items-center">
                <div className="w-[5px] h-[5px] rounded-full bg-green-600" />
                Active
              </div>
              <div className="flex gap-1 items-center">
                <div className="w-[5px] h-[5px] rounded-full bg-red-600" />
                Inactive
              </div>
              <div className="flex gap-1 items-center">
                <div className="w-[5px] h-[5px] rounded-full bg-gray-400" />
                Waiting
              </div>
              <span>→ Open node</span>
            </div>
          </div>
          <Input
            placeholder="Filter by peer id (node id string), operator, or payout"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Loading / Empty */}
      {listReady && listLoading ? (
        <p className="text-sm text-muted-foreground">Loading nodes…</p>
      ) : null}

      {listReady && !listLoading && !listError && rows.length === 0 ? (
        <Alert variant="informational" className="mb-4">
          <AlertTitle>No nodes in the registry</AlertTitle>
          <div className="flex flex-col gap-2 items-start">
            <p className="text-sm text-muted-foreground">Register a node to have it appear here.</p>
            {registerCtaReady && (
              <NextLink href="/node/register" className="no-underline">
                <Button variant="default">Register node</Button>
              </NextLink>
            )}
          </div>
        </Alert>
      ) : null}

      {/* Table */}
      {listReady && !listLoading && !listError && rows.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground mb-2">Showing {filteredRows.length} of {rows.length} nodes</p>
          {filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No nodes match this filter or search.</p>
          ) : (
            <NodeDirectoryTable rows={filteredRows} showOperatorColumn peerIdOnlyDisplay />
          )}
        </>
      )}

      {!listReady && !configError && registryUnset ? (
        <Skeleton className="h-[200px] w-full" />
      ) : null}
    </div>
  );
}
