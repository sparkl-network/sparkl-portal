"use client";

import { useMemo, useState } from "react";

import { Banner } from "@coinbase/cds-web/banner";
import { Button } from "@coinbase/cds-web/buttons";
import { Chip } from "@coinbase/cds-web/chips";
import { TextInput } from "@coinbase/cds-web/controls";
import { Icon } from "@coinbase/cds-web/icons";
import { Box, HStack, VStack } from "@coinbase/cds-web/layout";
import { Text } from "@coinbase/cds-web/typography";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { getAddress } from "viem";

import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";

import { NodeDirectoryTable } from "@/components/nodes/NodeDirectoryTable";
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

type NodeFilter = "all" | "active" | "waiting" | "mine";

function StatBlock({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <VStack gap={0} alignItems="flex-start" style={{ minWidth: 120 }}>
      <Text font="caption" color="fgMuted" style={{ textTransform: "uppercase" }}>
        {label}
      </Text>
      <Text font="headline" mono tabularNumbers>
        {value}
      </Text>
      {sub ? (
        <Text font="caption" color="fgMuted">
          {sub}
        </Text>
      ) : null}
    </VStack>
  );
}

function DonutStat({
  label,
  pct,
  sublabel,
}: {
  label: string;
  pct: number;
  sublabel: string;
}) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <HStack gap={2} alignItems="center">
      <Box
        width={14}
        height={14}
        style={{
          borderRadius: 9999,
          background: `conic-gradient(from 0deg, #16a34a 0%, #16a34a ${p}%, #e5e7eb ${p}%, #e5e7eb 100%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Box
          width={9}
          height={9}
          style={{
            borderRadius: 9999,
            backgroundColor: "#ffffff",
          }}
        />
      </Box>
      <VStack gap={0} alignItems="flex-start">
        <Text font="caption" color="fgMuted">
          {label}
        </Text>
        <Text font="body" mono tabularNumbers>
          {p.toFixed(0)}%
        </Text>
        <Text font="caption" color="fgMuted">
          {sublabel}
        </Text>
      </VStack>
    </HStack>
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
      hubConfig.operatorRegistryAddress.toLowerCase() ===
        ZERO_ADDRESS.toLowerCase(),
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
      const isReg =
        r.info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
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
      total,
      registered,
      active,
      waiting,
      operatorCount: operators.size,
      avgFeeBps,
      activeOfRegPct,
      registeredPct,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const addrLower = address?.toLowerCase();
    return rows.filter((r) => {
      if (!rowMatchesSearch(r, search)) return false;
      const isReg =
        r.info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
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

  const listErrMsg =
    listError instanceof Error ? listError.message : "Could not load nodes";

  const filterButtons: { id: NodeFilter; label: string }[] = [
    { id: "all", label: "All nodes" },
    { id: "active", label: "Active" },
    { id: "waiting", label: "Waiting" },
    { id: "mine", label: "My nodes" },
  ];

  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={3} alignItems="stretch" width="100%">

        <HStack
          alignItems="flex-start"
          justifyContent="space-between"
          gap={2}
          style={{ flexWrap: "wrap", width: "100%" }}
        >
          <VStack gap={1} alignItems="flex-start">
            <Text font="title2">Nodes</Text>
            <Text font="body" color="fgMuted">
              Hub registry directory
            </Text>
          </VStack>
          {registerCtaReady ? (
            <NextLink href="/node/register" style={{ textDecoration: "none" }}>
              <Button
                variant="primary"
                compact
                startIcon="add"
                accessibilityLabel="Register a new node"
              >
                Register node
              </Button>
            </NextLink>
          ) : null}
        </HStack>

        {configError ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Configuration error"
          >
            <Text font="body">{configError}</Text>
          </Banner>
        ) : null}

        {hubConfig && registryUnset && !configError ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Operator registry address missing"
          >
            <Text font="body">
              Set a deployed ProviderRegistry in your env (see .env.example),
              then restart the dev server.
            </Text>
          </Banner>
        ) : null}

        {isConnected && hubConfig && chainId !== hubConfig.chainId ? (
          <Banner
            variant="warning"
            startIcon="warning"
            showDismiss={false}
            title="Wrong network"
          >
            <Text font="body">
              Switch to chain {hubConfig.chainId} ({hubConfig.chainName}) to
              register or manage nodes with your wallet. You can still browse
              this list using the hub RPC.
            </Text>
          </Banner>
        ) : null}

        {listReady && listError ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Registry read failed"
          >
            <Text font="body">{listErrMsg}</Text>
          </Banner>
        ) : null}

        {listReady && !listError && !listLoading && rows.length > 0 ? (
          <Box
            bordered
            borderColor="bgLineHeavy"
            padding={3}
            style={{ borderRadius: 12, backgroundColor: "var(--cds-color-backgroundAlternate)" }}
          >
            <HStack
              alignItems="flex-start"
              justifyContent="space-between"
              gap={3}
              style={{ flexWrap: "wrap", width: "100%" }}
            >
              <HStack gap={4} style={{ flexWrap: "wrap" }}>
                <StatBlock
                  label="Active / registered"
                  value={`${stats.active} / ${stats.registered}`}
                  sub={`${stats.total} in registry`}
                />
                <StatBlock
                  label="Waiting"
                  value={`${stats.waiting}`}
                  sub="No payout set"
                />
                <StatBlock
                  label="Operators"
                  value={`${stats.operatorCount}`}
                  sub="Unique addresses"
                />
                <StatBlock
                  label="Avg fee"
                  value={`${(stats.avgFeeBps / 100).toFixed(2)}%`}
                  sub="Registered nodes"
                />
              </HStack>
              <HStack gap={4} style={{ flexWrap: "wrap" }}>
                <DonutStat
                  label="Active (of registered)"
                  pct={stats.activeOfRegPct}
                  sublabel={`${stats.active} active`}
                />
                <DonutStat
                  label="With payout"
                  pct={stats.registeredPct}
                  sublabel={`${stats.registered} registered`}
                />
              </HStack>
            </HStack>
          </Box>
        ) : null}

        {listReady && !listError && !listLoading && rows.length > 0 ? (
          <VStack gap={2} alignItems="stretch">
            <HStack
              alignItems="center"
              justifyContent="space-between"
              gap={2}
              style={{ flexWrap: "wrap", width: "100%" }}
            >
              <HStack gap={1} alignItems="center" style={{ flexWrap: "wrap" }}>
                {filterButtons.map(({ id, label }) => {
                  const selected = filter === id;
                  const disabled = id === "mine" && !address;
                  return (
                    <Chip
                      key={id}
                      accessibilityLabel={label}
                      compact
                      invertColorScheme={selected}
                      disabled={disabled}
                      onClick={disabled ? undefined : () => setFilter(id)}
                    >
                      <Text font="label2">{label}</Text>
                    </Chip>
                  );
                })}
              </HStack>
              <HStack gap={3} alignItems="center" style={{ flexWrap: "wrap" }}>
                <HStack gap={1} alignItems="center">
                  <Box
                    width={5}
                    height={5}
                    style={{ borderRadius: 9999, backgroundColor: "#16a34a" }}
                  />
                  <Text font="caption" color="fgMuted">
                    Active
                  </Text>
                </HStack>
                <HStack gap={1} alignItems="center">
                  <Box
                    width={5}
                    height={5}
                    style={{ borderRadius: 9999, backgroundColor: "#dc2626" }}
                  />
                  <Text font="caption" color="fgMuted">
                    Inactive
                  </Text>
                </HStack>
                <HStack gap={1} alignItems="center">
                  <Box
                    width={5}
                    height={5}
                    style={{ borderRadius: 9999, backgroundColor: "#9ca3af" }}
                  />
                  <Text font="caption" color="fgMuted">
                    Waiting
                  </Text>
                </HStack>
                <HStack gap={1} alignItems="center">
                  <Icon name="caretRight" size="s" />
                  <Text font="caption" color="fgMuted">
                    Open node
                  </Text>
                </HStack>
              </HStack>
            </HStack>

            <TextInput
              placeholder="Filter by peer id (node id string), operator, or payout"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%" }}
            />
          </VStack>
        ) : null}

        {listReady && listLoading ? (
          <Text font="body" color="fgMuted">
            Loading nodes…
          </Text>
        ) : null}

        {listReady && !listLoading && !listError && rows.length === 0 ? (
          <Banner
            variant="informational"
            startIcon="wallet"
            showDismiss={false}
            title="No nodes in the registry"
          >
            <VStack gap={2} alignItems="flex-start">
              <Text font="body" color="fgMuted">
                Register a node to have it appear here.
              </Text>
              {registerCtaReady ? (
                <NextLink
                  href="/node/register"
                  style={{ textDecoration: "none" }}
                >
                  <Button variant="primary">Register node</Button>
                </NextLink>
              ) : null}
            </VStack>
          </Banner>
        ) : null}

        {listReady && !listLoading && !listError && rows.length > 0 ? (
          <>
            <Text font="caption" color="fgMuted">
              Showing {filteredRows.length} of {rows.length} nodes
            </Text>
            {filteredRows.length === 0 ? (
              <Text font="body" color="fgMuted">
                No nodes match this filter or search.
              </Text>
            ) : (
              <NodeDirectoryTable
                rows={filteredRows}
                showOperatorColumn
                peerIdOnlyDisplay
              />
            )}
          </>
        ) : null}
      </VStack>
    </Box>
  );
}
