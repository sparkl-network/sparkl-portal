"use client";

import { useMemo, useState } from "react";

import { Banner } from "@coinbase/cds-web/banner";
import { TextInput } from "@coinbase/cds-web/controls";
import { Icon } from "@coinbase/cds-web/icons";
import { Box, HStack, VStack } from "@coinbase/cds-web/layout";
import { Link, Text } from "@coinbase/cds-web/typography";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useParams } from "next/navigation";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { usePublicClient } from "wagmi";

import { NodeDirectoryTable } from "@/components/nodes/NodeDirectoryTable";
import { ZERO_ADDRESS } from "@/lib/chains";
import { getOperatorNodes, getProvider, type RegisteredNodeWithOperator } from "@/lib/evm/registry";
import { shortAddress } from "@/lib/formatAddress";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

function rowMatchesSearch(r: RegisteredNodeWithOperator, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  return (
    r.nodeId.toLowerCase().includes(s) ||
    r.info.payout.toLowerCase().includes(s)
  );
}

export default function OperatorNodesPage() {
  const params = useParams();
  const raw =
    typeof params.operator === "string"
      ? params.operator
      : Array.isArray(params.operator)
        ? params.operator[0]
        : "";

  const operatorAddr = useMemo((): Address | null => {
    const s = raw.trim();
    if (!s || !isAddress(s)) return null;
    try {
      return getAddress(s);
    } catch {
      return null;
    }
  }, [raw]);

  const { hubConfig, configError } = useHubChainConfig();

  const publicClient = usePublicClient({
    chainId: hubConfig?.chainId,
  });

  const registryUnset = Boolean(
    !hubConfig ||
      !hubConfig.providerRegistryAddress ||
      hubConfig.providerRegistryAddress.toLowerCase() ===
        ZERO_ADDRESS.toLowerCase(),
  );

  const listReady = Boolean(
    operatorAddr &&
      hubConfig &&
      publicClient &&
      !registryUnset &&
      !configError,
  );

  const [search, setSearch] = useState("");

  const {
    data: rows = [],
    error: listError,
    isFetching: listLoading,
  } = useQuery({
    queryKey: [
      "operatorNodesPage",
      hubConfig?.chainId,
      hubConfig?.providerRegistryAddress,
      operatorAddr,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !operatorAddr) {
        throw new Error("Missing RPC client, hub config, or operator");
      }
      const registry = hubConfig.providerRegistryAddress;
      const nodeIds: Hex[] = await getOperatorNodes(
        publicClient,
        registry,
        operatorAddr,
      );
      const infos = await Promise.all(
        nodeIds.map((nodeId) => getProvider(publicClient, registry, nodeId)),
      );
      return nodeIds.map(
        (nodeId, i): RegisteredNodeWithOperator => ({
          nodeId,
          info: infos[i],
          operator: operatorAddr,
        }),
      );
    },
    enabled: listReady,
  });

  const stats = useMemo(() => {
    let registered = 0;
    let active = 0;
    let waiting = 0;
    for (const r of rows) {
      const isReg =
        r.info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
      if (isReg) {
        registered += 1;
        if (r.info.active) active += 1;
      } else {
        waiting += 1;
      }
    }
    return { registered, active, waiting, total: rows.length };
  }, [rows]);

  const filteredRows = useMemo(
    () => rows.filter((r) => rowMatchesSearch(r, search)),
    [rows, search],
  );

  const listErrMsg =
    listError instanceof Error ? listError.message : "Could not load nodes";

  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={3} alignItems="stretch" width="100%">
        <Link as={NextLink} href="/node" font="body" underline={false}>
          ← All nodes
        </Link>

        <VStack gap={1} alignItems="flex-start">
          <Text font="title2">Operator nodes</Text>
          <Text font="body" color="fgMuted">
            Nodes where this address is the on-chain operator. Same table layout as
            the global directory—with search and status legend.
          </Text>
        </VStack>

        {!operatorAddr ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Invalid operator address"
          >
            <Text font="body">
              Use a checksummed or lowercase 0x address in the URL, for example{" "}
              <Text as="span" font="body" mono>
                /operator/0x…/node
              </Text>
              .
            </Text>
          </Banner>
        ) : (
          <Text font="caption" mono tabularNumbers color="fgMuted">
            {operatorAddr}
          </Text>
        )}

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
            title="Provider registry address missing"
          >
            <Text font="body">
              Set a deployed ProviderRegistry in your env (see .env.example),
              then restart the dev server.
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
            title="No nodes for this operator"
          >
            <Text font="body" color="fgMuted">
              This address has no entries in{" "}
              <Text as="span" font="body" mono>
                operatorNodes
              </Text>{" "}
              on the registry.
            </Text>
          </Banner>
        ) : null}

        {listReady && !listLoading && !listError && rows.length > 0 ? (
          <Box
            bordered
            borderColor="bgLineHeavy"
            padding={3}
            style={{ borderRadius: 12, backgroundColor: "var(--cds-color-backgroundAlternate)" }}
          >
            <HStack gap={4} style={{ flexWrap: "wrap" }}>
              <VStack gap={0} alignItems="flex-start">
                <Text font="caption" color="fgMuted">
                  Active / registered
                </Text>
                <Text font="headline" mono tabularNumbers>
                  {stats.active} / {stats.registered}
                </Text>
              </VStack>
              <VStack gap={0} alignItems="flex-start">
                <Text font="caption" color="fgMuted">
                  Waiting
                </Text>
                <Text font="headline" mono tabularNumbers>
                  {stats.waiting}
                </Text>
              </VStack>
              <VStack gap={0} alignItems="flex-start">
                <Text font="caption" color="fgMuted">
                  Total
                </Text>
                <Text font="headline" mono tabularNumbers>
                  {stats.total}
                </Text>
              </VStack>
            </HStack>
          </Box>
        ) : null}

        {listReady && !listLoading && !listError && rows.length > 0 ? (
          <VStack gap={2} alignItems="stretch">
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
            <TextInput
              placeholder={`Filter by node id or payout · ${shortAddress(operatorAddr ?? "0x")}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%" }}
            />
          </VStack>
        ) : null}

        {listReady && !listLoading && !listError && rows.length > 0 ? (
          <>
            <Text font="caption" color="fgMuted">
              Showing {filteredRows.length} of {rows.length} nodes
            </Text>
            {filteredRows.length === 0 ? (
              <Text font="body" color="fgMuted">
                No nodes match this search.
              </Text>
            ) : (
              <NodeDirectoryTable rows={filteredRows} showOperatorColumn={false} />
            )}
          </>
        ) : null}
      </VStack>
    </Box>
  );
}
