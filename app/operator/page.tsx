"use client";

import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";

import { OperatorDirectoryTable } from "@/components/operators/OperatorDirectoryTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ZERO_ADDRESS, chainRpcUrl } from "@/lib/chains";
import {
  countNodeRegisteredLogs,
  getOperatorDirectoryEntries,
  getOperatorNodes,
} from "@/lib/evm/registry";
import { shortAddress } from "@/lib/formatAddress";
import { useHubChainConfig } from "@/lib/useHubChainConfig";
import {
  useAccount,
  useChainId,
  usePublicClient,
} from "wagmi";

export default function OperatorDirectoryPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { hubConfig, configError } = useHubChainConfig();

  const chainMatches = Boolean(hubConfig && chainId === hubConfig.chainId);
  const registryUnset = Boolean(
    !hubConfig ||
      !hubConfig.operatorRegistryAddress ||
      hubConfig.operatorRegistryAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase(),
  );

  const { data: logStats } = useQuery({
    queryKey: [
      "operatorLogStats",
      hubConfig?.chainId,
      hubConfig?.operatorRegistryAddress,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig) {
        throw new Error("Missing RPC client or hub config");
      }
      const count = await countNodeRegisteredLogs(
        publicClient,
        hubConfig.operatorRegistryAddress,
      );
      const fromBlock =
        process.env.NEXT_PUBLIC_OPERATOR_REGISTRY_FROM_BLOCK ??
        process.env.NEXT_PUBLIC_PROVIDER_REGISTRY_FROM_BLOCK ??
        "0";
      return { count, fromBlock };
    },
    enabled: Boolean(
      isConnected && hubConfig && publicClient && chainMatches && !registryUnset && !configError,
    ),
  });

  const { data: myNodeIds = [] } = useQuery({
    queryKey: [
      "myOperatorNodes",
      hubConfig?.chainId,
      hubConfig?.operatorRegistryAddress,
      address,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !address) {
        throw new Error("Missing client, config, or wallet");
      }
      return getOperatorNodes(
        publicClient,
        hubConfig.operatorRegistryAddress,
        address,
      );
    },
    enabled: Boolean(
      isConnected && hubConfig && publicClient && chainMatches && !registryUnset && !configError && address,
    ),
  });

  const { data: rows = [], error, isFetching } = useQuery({
    queryKey: [
      "operatorDirectory",
      hubConfig?.chainId,
      hubConfig?.operatorRegistryAddress,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig) {
        throw new Error("Missing RPC client or hub config");
      }
      return getOperatorDirectoryEntries(
        publicClient,
        hubConfig.operatorRegistryAddress,
      );
    },
    enabled: Boolean(
      isConnected && hubConfig && publicClient && chainMatches && !registryUnset && !configError,
    ),
  });

  const errMsg = error instanceof Error ? error.message : "Could not load operator accounts";

  return (
    <div className="px-3 py-3 w-full space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-1">Operators</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Wallets that have registered at least one node. Operators are derived from{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">NodeRegistered</code>{" "}
          logs; each account's nodes use on-chain{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">operatorNodes</code>.
        </p>
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
          <AlertTitle>Registry missing</AlertTitle>
          <AlertDescription>
            Set OperatorRegistry in <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">.env.local</code> and restart.
          </AlertDescription>
        </Alert>
      )}

      {!isConnected && (
        <Alert variant="informational" className="mb-4">
          <AlertTitle>Wallet disconnected</AlertTitle>
          <AlertDescription>Connect on the hub chain to load the directory.</AlertDescription>
        </Alert>
      )}

      {isConnected && hubConfig && !chainMatches && (
        <Alert variant="warning" className="mb-4">
          <AlertTitle>Wrong network</AlertTitle>
          <AlertDescription>Switch to chain {hubConfig.chainId} ({hubConfig.chainName}).</AlertDescription>
        </Alert>
      )}

      {isConnected && chainMatches && !registryUnset && error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Load failed</AlertTitle>
          <AlertDescription>{errMsg}</AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {isConnected && chainMatches && !registryUnset && isFetching ? (
        <Skeleton className="h-[200px] w-full" />
      ) : null}

      {/* Table */}
      {rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{rows.length} operator{rows.length === 1 ? "" : "s"}</p>
          <OperatorDirectoryTable rows={rows} />
        </div>
      )}

      {/* Empty state */}
      {isConnected && chainMatches && !registryUnset && !isFetching && !error && rows.length === 0 && (
        <Alert variant="informational" className="mb-4">
          <AlertTitle>No operators yet</AlertTitle>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground leading-relaxed">
              The directory lists wallets that emitted{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">NodeRegistered</code>{" "}
              on{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{hubConfig ? chainRpcUrl(hubConfig) : "the chain RPC"}</code>.
              A deployed registry with no registrations looks like this — it is not a load error.
            </p>
            {logStats !== undefined && (
              <p className="text-xs text-muted-foreground">
                Found {logStats.count.toString()} registration event{logStats.count === 1n ? "" : "s"} from block {logStats.fromBlock}.
              </p>
            )}
            <p className="text-sm text-muted-foreground leading-relaxed">
              Register a node at{" "}
              <NextLink href="/node/register" className="font-medium underline-offset-4 hover:underline">
                /node/register
              </NextLink>{" "}
              using the same chain and registry address as in{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">.env.local</code>, then refresh this page.
            </p>
          </div>
        </Alert>
      )}

      {/* Warning: wallet has on-chain nodes but no logs */}
      {isConnected && chainMatches && !registryUnset && !isFetching && !error && rows.length === 0 && myNodeIds.length > 0 && address ? (
        <Alert variant="warning" className="mb-4">
          <AlertTitle>Your wallet has on-chain nodes</AlertTitle>
          <AlertDescription>
            {shortAddress(address)} has {myNodeIds.length} node{myNodeIds.length === 1 ? "" : "s"} via{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">operatorNodes</code>, but no matching registration logs were found (check registry address / FROM_BLOCK / RPC).
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Links */}
      <div className="flex gap-2 flex-wrap pt-4 border-t">
        <Badge variant="secondary" className="cursor-pointer hover:bg-accent/80">
          <NextLink href="/node" className="text-sm">Your nodes</NextLink>
        </Badge>
      </div>

      {!isConnected && !configError && registryUnset ? (
        <Skeleton className="h-[200px] w-full" />
      ) : null}
    </div>
  );
}
