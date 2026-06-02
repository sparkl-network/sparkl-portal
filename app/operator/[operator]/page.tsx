"use client";

import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { getAddress, isAddress, zeroHash } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";

import { ZERO_ADDRESS } from "@/lib/chains";
import { shortNodeId } from "@/lib/formatAddress";
import { getOperatorNodeDetailRows } from "@/lib/evm/registry";
import { registryMetadataUriToFetchUrl } from "@/lib/nodeBaseUrl";
import { useHubChainConfig } from "@/lib/useHubChainConfig";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

function teeProofSubmitted(hash: `0x${string}`): boolean {
  return hash.toLowerCase() !== zeroHash.toLowerCase();
}

export default function OperatorDetailPage() {
  const params = useParams();
  const raw = typeof params.operator === "string" ? params.operator : Array.isArray(params.operator) ? params.operator[0] : "";

  const operatorAddress = useMemo(() => {
    const s = raw.trim();
    if (!s || !isAddress(s)) return null;
    try { return getAddress(s); } catch { return null; }
  }, [raw]);

  const { isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { hubConfig, configError } = useHubChainConfig();

  const chainMatches = Boolean(hubConfig && chainId === hubConfig.chainId);
  const registryUnset = Boolean(!hubConfig || !hubConfig.operatorRegistryAddress || hubConfig.operatorRegistryAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase());

  const { data, error, isFetching } = useQuery({
    queryKey: ["operatorDetail", hubConfig?.chainId, hubConfig?.operatorRegistryAddress, operatorAddress],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !operatorAddress) throw new Error("Missing client, config, or operator");
      const rows = await getOperatorNodeDetailRows(publicClient, hubConfig.operatorRegistryAddress, operatorAddress);
      const regionByNodeId = new Map<string, string | null>();
      await Promise.all(rows.map(async ({ nodeId, info }) => {
        const uri = info.metadataURI?.trim() ?? "";
        const fetchUrl = registryMetadataUriToFetchUrl(uri);
        if (!fetchUrl) { regionByNodeId.set(nodeId.toLowerCase(), null); return; }
        try {
          const r = await fetch(`/api/operator-metadata?url=${encodeURIComponent(fetchUrl)}`);
          const j: unknown = await r.json();
          const region = j && typeof j === "object" && "region" in j ? typeof (j as { region?: unknown }).region === "string" ? ((j as { region: string }).region) : null : null;
          regionByNodeId.set(nodeId.toLowerCase(), region);
        } catch { regionByNodeId.set(nodeId.toLowerCase(), null); }
      }));
      return { rows, regionByNodeId };
    },
    enabled: Boolean(isConnected && operatorAddress && hubConfig && publicClient && chainMatches && !registryUnset && !configError),
  });

  const errMsg = error instanceof Error ? error.message : "Could not load this operator account";
  const rows = data?.rows ?? [];
  const regionByNodeId = data?.regionByNodeId;

  return (
    <div className="px-3 py-3 w-full space-y-4">
      {/* Back link */}
      <NextLink href="/operator" className="text-sm text-muted-foreground hover:underline inline-block">← Operators</NextLink>

      {/* Invalid operator */}
      {!operatorAddress && (
        <Alert variant="destructive"><AlertTitle>Invalid operator</AlertTitle><AlertDescription>This URL must include a valid operator (wallet) address.</AlertDescription></Alert>
      )}

      {/* Operator display */}
      {operatorAddress && (
        <div className="space-y-1">
          <Label className="text-sm font-medium text-muted-foreground">Operator account</Label>
          <code className="break-all text-lg">{operatorAddress}</code>
        </div>
      )}

      {/* Config errors */}
      {configError && <Alert variant="destructive"><AlertTitle>Configuration error</AlertTitle><AlertDescription>{configError}</AlertDescription></Alert>}
      {hubConfig && registryUnset && !configError && (<Alert variant="destructive"><AlertTitle>Registry missing</AlertTitle><AlertDescription>Set ProviderRegistry contract in env and restart.</AlertDescription></Alert>)}
      {!isConnected && (<Alert variant="default" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"><AlertTitle>Wallet disconnected</AlertTitle><AlertDescription>Connect on the hub chain to load this operator account.</AlertDescription></Alert>)}
      {isConnected && hubConfig && !chainMatches && (<Alert variant="warning"><AlertTitle>Wrong network</AlertTitle><AlertDescription>Switch to chain {hubConfig.chainId} ({hubConfig.chainName}).</AlertDescription></Alert>)}
      {operatorAddress && isConnected && chainMatches && !registryUnset && error && (<Alert variant="destructive"><AlertTitle>Load failed</AlertTitle><AlertDescription>{errMsg}</AlertDescription></Alert>)}

      {/* Loading */}
      {operatorAddress && isConnected && chainMatches && !registryUnset && isFetching && <Skeleton className="h-[200px] w-full" />}

      {/* Reputation & Slashes cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Reputation</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Off-chain indexing not wired yet. Planned signals: uptime, error rate, settlement timeliness vs peers.</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Slashes</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">No slashing module in current WIP contracts. Future: on-chain penalties or curated admin flags.</p></CardContent></Card>
      </div>

      {/* View all nodes link */}
      {operatorAddress && <Badge variant="secondary" className="cursor-pointer hover:bg-accent/80"><NextLink href={`/operator/${operatorAddress}/node`} className="text-sm">View all nodes (table) →</NextLink></Badge>}

      {/* Node list */}
      {rows.length > 0 && (<>
        <Label className="text-sm font-medium text-muted-foreground">Nodes</Label>
        <div className="space-y-2">
          {rows.map(({ nodeId, info }) => {
            const registered = info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
            const region = regionByNodeId?.get(nodeId.toLowerCase()) ?? null;
            return (
              <Card key={nodeId}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="space-y-0 min-w-0">
                      <Badge variant="secondary" className="cursor-pointer hover:bg-accent/80"><NextLink href={`/node/${nodeId}`} className="text-sm">{shortNodeId(nodeId)}</NextLink></Badge>
                      <code className="break-all text-xs font-mono text-muted-foreground block mt-1">{nodeId}</code>
                    </div>
                    <span className="text-sm flex-shrink-0">{registered ? (info.active ? "Active" : "Inactive") : "Unregistered"}</span>
                  </div>
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    <p>TEE advertised: {info.supportsTEE ? "yes" : "no"} · proof: {teeProofSubmitted(info.teeReportHash) ? "set" : "none"}</p>
                    <p>Region (/details): {region ?? "—"}</p>
                    {info.metadataURI && <code className="break-all">{info.metadataURI}</code>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </>)}

      {/* Empty state */}
      {operatorAddress && isConnected && chainMatches && !registryUnset && !isFetching && !error && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No nodes for this operator account (<code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">operatorNodes</code> empty).</p>
      )}

      {!isConnected && !configError && registryUnset && <Skeleton className="h-[200px] w-full" />}
    </div>
  );
}
