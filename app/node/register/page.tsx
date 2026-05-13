"use client";

import { Banner } from "@coinbase/cds-web/banner";
import { Button } from "@coinbase/cds-web/buttons";
import { Checkbox, TextInput } from "@coinbase/cds-web/controls";
import { Box, VStack } from "@coinbase/cds-web/layout";
import { Link, Text } from "@coinbase/cds-web/typography";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, startTransition, useState } from "react";
import { type Address, type Hex, getAddress, isAddress } from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";

import { ZERO_ADDRESS } from "@/lib/chains";
import { getProvider, registerNode } from "@/lib/evm/registry";
import { classifyNodeIdInput, nodeDetailHrefFromRegistration, type NodeIdInputKind } from "@/lib/nodeId";
import { normalizeNodeBaseUrl } from "@/lib/nodeBaseUrl";
import { registerDebug } from "@/lib/registerDebug";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

const supportsTeeEffective = false;

type RegisterFormFields = {
  payoutInput: string;
  supportsBestEffort: boolean;
  supportsTEE: boolean;
  nodeBaseUrl: string;
};

type ProbePart = {
  ok: boolean;
  httpStatus: number;
  body: unknown;
  error?: string;
};

type ProbeApiOk = {
  status: ProbePart;
  details: ProbePart;
  models: ProbePart;
};

function formatProbeBody(body: unknown): string {
  if (body === null || body === undefined) return "—";
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

function RegisterFormBody({
  nodeIdentityInput,
  onNodeIdentityChange,
  nodeIdInputKind,
  resolvedNodeId,
  defaultPayoutAddress,
  fieldsDisabled,
  submitRegisterDisabled,
  successHash,
  txBusy,
  onSubmitFields,
}: {
  nodeIdentityInput: string;
  onNodeIdentityChange: (value: string) => void;
  nodeIdInputKind: NodeIdInputKind;
  resolvedNodeId: Hex | null;
  defaultPayoutAddress: string;
  fieldsDisabled: boolean;
  submitRegisterDisabled: boolean;
  successHash: string | null;
  txBusy: boolean;
  onSubmitFields: (fields: RegisterFormFields) => void;
}) {
  /** Empty initial state avoids SSR vs client mismatch when the wallet restores on load. */
  const [payoutInput, setPayoutInput] = useState("");
  const [supportsBestEffort, setSupportsBestEffort] = useState(true);
  const [supportsTEE, setSupportsTEE] = useState(false);
  const [nodeBaseUrl, setNodeBaseUrl] = useState("http://127.0.0.1:8787");
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeApiOk | null>(null);
  const [probeHttpError, setProbeHttpError] = useState<string | null>(null);

  useEffect(() => {
    startTransition(() => {
      setPayoutInput(defaultPayoutAddress);
    });
  }, [defaultPayoutAddress]);

  const probeBlocked = Boolean(successHash);

  async function runNodeProbe() {
    const base = nodeBaseUrl.trim();
    if (!base) return;
    setProbeHttpError(null);
    setProbeResult(null);
    setProbeLoading(true);
    try {
      const r = await fetch("/api/provider-node-probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: base }),
      });
      const data: unknown = await r.json();
      if (!r.ok && data && typeof data === "object" && "error" in data) {
        const err = (data as { error?: unknown }).error;
        setProbeHttpError(
          typeof err === "string" ? err : `Probe failed (${r.status})`,
        );
        return;
      }
      if (!r.ok) {
        setProbeHttpError(`Probe failed (${r.status})`);
        return;
      }
      setProbeResult(data as ProbeApiOk);
    } catch (e) {
      setProbeHttpError(
        e instanceof Error ? e.message : "Probe request failed",
      );
    } finally {
      setProbeLoading(false);
    }
  }

  return (
    <VStack gap={2}>
      <TextInput
        label="Peer ID"
        placeholder="12D3KooW… (from logs or GET …/details → peer_id)"
        value={nodeIdentityInput}
        onChange={(e) => onNodeIdentityChange(e.target.value)}
        disabled={fieldsDisabled}
      />
      <Text font="caption" color="fgMuted">
        Use the libp2p peer id printed when your node starts, or the{" "}
        <Text as="span" font="caption" mono>
          peer_id
        </Text>{" "}
        field from{" "}
        <Text as="span" font="caption" mono>
          GET …/details
        </Text>{" "}
        on your provider base URL (below). It is converted to the on-chain{" "}
        <Text as="span" font="caption" mono>
          bytes32
        </Text>{" "}
        shown below. Advanced: paste a full 32-byte hex key or an Ethereum
        address (right-padded), for tests or non-libp2p setups.
      </Text>

      {resolvedNodeId ? (
        <Box
          width="100%"
          padding={2}
          bordered
          borderColor="bgLineHeavy"
          style={{ borderRadius: 8 }}
        >
          <Text font="caption" color="fgMuted">
            On-chain registry key (bytes32)
          </Text>
          <Text font="caption" mono tabularNumbers style={{ wordBreak: "break-all" }}>
            {resolvedNodeId}
          </Text>
          {nodeIdInputKind === "peer_id" ? (
            <Text font="caption" color="fgMuted">
              = keccak256 over the decoded peer id multihash (same binary encoding
              as libp2p’s peer id bytes).
            </Text>
          ) : null}
          {nodeIdInputKind === "address" ? (
            <Text font="caption" color="fgMuted">
              = your EVM address padded to 32 bytes (legacy dev / Foundry style).
            </Text>
          ) : null}
          {nodeIdInputKind === "hex32" ? (
            <Text font="caption" color="fgMuted">
              = raw bytes32 from your paste.
            </Text>
          ) : null}
        </Box>
      ) : nodeIdentityInput.trim() ? (
        <Text font="caption" style={{ color: "#b91c1c" }}>
          Not recognized as a peer id (
          <Text as="span" font="caption" mono>
            12D3…
          </Text>{" "}
          base58), 0x + 64 hex, or an Ethereum address — check for typos or
          spaces.
        </Text>
      ) : null}

      <TextInput
        label="Payout address"
        placeholder="0x…"
        value={payoutInput}
        onChange={(e) => setPayoutInput(e.target.value)}
        disabled={fieldsDisabled}
      />

      <Checkbox
        checked={supportsBestEffort}
        onChange={(e) => setSupportsBestEffort(e.target.checked)}
        value="best-effort"
        disabled={fieldsDisabled}
      >
        Supports Best Effort
      </Checkbox>

      <VStack gap={1} alignItems="flex-start">
        <Checkbox
          checked={supportsTEE}
          onChange={(e) => setSupportsTEE(e.target.checked)}
          value="tee"
          disabled={fieldsDisabled || !supportsTeeEffective}
        >
          Supports TEE
        </Checkbox>
        <Text font="caption" color="fgMuted">
          {supportsTeeEffective
            ? "TEE tier can be advertised when your deployment verifies attestations."
            : "TEE is disabled in this build; the transaction sends supportsTEE = false."}
        </Text>
      </VStack>

      <Text font="label2" color="fgMuted">
        Node base URL
      </Text>
      <Text font="caption" color="fgMuted">
        HTTP(S) origin only — stored on-chain and must serve{" "}
        <Text as="span" font="caption" mono>
          /status
        </Text>
        ,{" "}
        <Text as="span" font="caption" mono>
          /details
        </Text>
        , and{" "}
        <Text as="span" font="caption" mono>
          /v1/models
        </Text>
        .
      </Text>
      <TextInput
        label="Provider base URL"
        placeholder="http://127.0.0.1:8787"
        value={nodeBaseUrl}
        onChange={(e) => setNodeBaseUrl(e.target.value)}
        disabled={probeBlocked}
      />

      <Text font="label2" color="fgMuted">
        Test inference node (Sparkl)
      </Text>
      <Text font="caption" color="fgMuted">
        Calls{" "}
        <Text as="span" font="caption" mono>
          GET /status
        </Text>
        ,{" "}
        <Text as="span" font="caption" mono>
          /details
        </Text>
        , and{" "}
        <Text as="span" font="caption" mono>
          /v1/models
        </Text>{" "}
        on your node via this app (server-side GETs from the portal host).
      </Text>
      <Button
        variant="secondary"
        disabled={probeBlocked || probeLoading || !nodeBaseUrl.trim()}
        loading={probeLoading}
        onClick={() => void runNodeProbe()}
      >
        Test node
      </Button>

      {probeHttpError ? (
        <Banner
          variant="error"
          startIcon="warning"
          showDismiss={false}
          title="Probe error"
        >
          <Text font="body">{probeHttpError}</Text>
        </Banner>
      ) : null}

      {probeResult ? (
        <VStack gap={2} alignItems="flex-start" width="100%">
          <Text font="label2">Probe results</Text>
          <VStack gap={1} alignItems="flex-start" width="100%">
            <Text font="label2" color="fgMuted">
              Node status (/status)
            </Text>
            <Text font="caption" color="fgMuted">
              HTTP {probeResult.status.httpStatus}{" "}
              {probeResult.status.ok ? "OK" : "non-OK"}
              {probeResult.status.error
                ? ` — ${probeResult.status.error}`
                : ""}
            </Text>
            <Box
              width="100%"
              padding={2}
              bordered
              borderRadius={400}
              style={{ overflow: "auto", maxHeight: 220 }}
            >
              <Text font="caption" mono tabularNumbers style={{ whiteSpace: "pre-wrap" }}>
                {formatProbeBody(probeResult.status.body)}
              </Text>
            </Box>
          </VStack>
          <VStack gap={1} alignItems="flex-start" width="100%">
            <Text font="label2" color="fgMuted">
              Details (/details)
            </Text>
            <Text font="caption" color="fgMuted">
              HTTP {probeResult.details.httpStatus}{" "}
              {probeResult.details.ok ? "OK" : "non-OK"}
              {probeResult.details.error
                ? ` — ${probeResult.details.error}`
                : ""}
            </Text>
            <Box
              width="100%"
              padding={2}
              bordered
              borderRadius={400}
              style={{ overflow: "auto", maxHeight: 220 }}
            >
              <Text font="caption" mono tabularNumbers style={{ whiteSpace: "pre-wrap" }}>
                {formatProbeBody(probeResult.details.body)}
              </Text>
            </Box>
          </VStack>
          <VStack gap={1} alignItems="flex-start" width="100%">
            <Text font="label2" color="fgMuted">
              Models (/v1/models)
            </Text>
            <Text font="caption" color="fgMuted">
              HTTP {probeResult.models.httpStatus}{" "}
              {probeResult.models.ok ? "OK" : "non-OK"}
              {probeResult.models.error
                ? ` — ${probeResult.models.error}`
                : ""}
            </Text>
            <Box
              width="100%"
              padding={2}
              bordered
              borderRadius={400}
              style={{ overflow: "auto", maxHeight: 320 }}
            >
              <Text font="caption" mono tabularNumbers style={{ whiteSpace: "pre-wrap" }}>
                {formatProbeBody(probeResult.models.body)}
              </Text>
            </Box>
          </VStack>
        </VStack>
      ) : null}

      <Button
        type="button"
        variant="primary"
        disabled={submitRegisterDisabled || Boolean(successHash)}
        loading={txBusy}
        onClick={() => {
          registerDebug("Register on-chain clicked", {
            submitRegisterDisabled,
            successHash,
            fieldsDisabled,
            peerIdFieldLength: nodeIdentityInput.trim().length,
            hasResolvedNodeId: Boolean(resolvedNodeId),
            payoutFieldLength: payoutInput.trim().length,
            nodeBaseUrlLength: nodeBaseUrl.trim().length,
            supportsBestEffort,
            supportsTEEEffective: supportsTeeEffective && supportsTEE,
          });
          onSubmitFields({
            payoutInput,
            supportsBestEffort,
            supportsTEE: supportsTeeEffective && supportsTEE,
            nodeBaseUrl,
          });
        }}
      >
        Register on-chain
      </Button>
    </VStack>
  );
}

export default function ProviderRegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { hubConfig, configError } = useHubChainConfig();
  const publicClient = usePublicClient({
    chainId: hubConfig?.chainId,
  });
  const { data: walletClient, error: walletClientError } = useWalletClient({
    chainId: hubConfig?.chainId,
  });

  const [txBusy, setTxBusy] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [successHash, setSuccessHash] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [nodeIdentityInput, setNodeIdentityInput] = useState("");

  const { kind: nodeIdInputKind, nodeId: resolvedNodeId } = useMemo(
    () => classifyNodeIdInput(nodeIdentityInput),
    [nodeIdentityInput],
  );

  const resolvedNodePageHref = useMemo(() => {
    if (!resolvedNodeId) return "/node";
    return nodeDetailHrefFromRegistration({
      kind: nodeIdInputKind,
      nodeIdHex: resolvedNodeId,
      rawIdentityInput: nodeIdentityInput,
    });
  }, [resolvedNodeId, nodeIdInputKind, nodeIdentityInput]);

  const chainReady = Boolean(
    isConnected &&
      hubConfig &&
      chainId === hubConfig.chainId &&
      address,
  );

  const registryUnset = useMemo(() => {
    if (!hubConfig?.providerRegistryAddress) return true;
    return (
      hubConfig.providerRegistryAddress.toLowerCase() ===
      ZERO_ADDRESS.toLowerCase()
    );
  }, [hubConfig]);

  const {
    data: registered,
    isFetching: registrationLoading,
  } = useQuery({
    queryKey: [
      "providerRegistered",
      hubConfig?.chainId,
      hubConfig?.providerRegistryAddress,
      resolvedNodeId,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !resolvedNodeId) return false;
      const info = await getProvider(
        publicClient,
        hubConfig.providerRegistryAddress,
        resolvedNodeId,
      );
      return info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
    },
    enabled: Boolean(
      chainReady &&
        hubConfig &&
        resolvedNodeId &&
        publicClient &&
        !registryUnset &&
        !configError,
    ),
  });

  function parsePayout(raw: string): Address | null {
    const s = raw.trim();
    if (!s) return null;
    if (!isAddress(s)) return null;
    try {
      return getAddress(s);
    } catch {
      return null;
    }
  }

  const submitRegistration = useCallback(
    async (fields: RegisterFormFields) => {
      setValidationError(null);
      setTxError(null);
      const nodeId = resolvedNodeId;
      registerDebug("submitRegistration: start", {
        resolvedNodeId,
        chainReady,
        isConnected,
        chainId,
        hubChainId: hubConfig?.chainId,
        hasWalletClient: Boolean(walletClient),
        walletClientError: walletClientError
          ? walletClientError.message
          : undefined,
        hasPublicClient: Boolean(publicClient),
        registryUnset,
        registered,
        registrationLoading,
        registryAddress: hubConfig?.providerRegistryAddress,
      });
      if (!nodeId) {
        registerDebug("submitRegistration: abort — invalid node id");
        setValidationError(
          "Enter a valid peer id (12D3Koo… from your node), 0x + 64 hex bytes32, or an Ethereum address.",
        );
        return;
      }
      const payout = parsePayout(fields.payoutInput);
      if (!payout) {
        registerDebug("submitRegistration: abort — invalid payout", {
          payoutTrimLength: fields.payoutInput.trim().length,
        });
        setValidationError(
          "Enter a valid payout address (0x + 40 hex chars).",
        );
        return;
      }
      if (!fields.supportsBestEffort && !fields.supportsTEE) {
        registerDebug("submitRegistration: abort — no tier enabled");
        setValidationError(
          "Enable at least one security tier (Best Effort and/or TEE).",
        );
        return;
      }
      const nodeBaseNormalized = normalizeNodeBaseUrl(fields.nodeBaseUrl);
      if (!nodeBaseNormalized) {
        registerDebug("submitRegistration: abort — invalid base URL", {
          nodeBaseRaw: fields.nodeBaseUrl.slice(0, 80),
        });
        setValidationError(
          "Enter a valid node base URL (http:// or https:// host, optionally with port). It is stored on-chain and must expose /status, /details, and /v1/models.",
        );
        return;
      }
      if (
        !walletClient ||
        !hubConfig ||
        !chainReady ||
        registryUnset ||
        !publicClient
      ) {
        const missing: string[] = [];
        if (!walletClient) missing.push("walletClient");
        if (!hubConfig) missing.push("hubConfig");
        if (!chainReady) missing.push("chainReady (connect + correct network)");
        if (registryUnset) missing.push("registry address");
        if (!publicClient) missing.push("publicClient (RPC)");
        registerDebug("submitRegistration: abort — env not ready", {
          missing,
          walletClientError: walletClientError?.message,
        });
        setValidationError(
          missing.includes("walletClient")
            ? `Wallet is not ready to sign${walletClientError ? ` (${walletClientError.message})` : ""}. Try reconnecting, or set NEXT_PUBLIC_DEBUG_REGISTER=1 and check the console for [sparkl:register].`
            : `Cannot register yet: missing ${missing.join(", ")}. Check banners above or enable NEXT_PUBLIC_DEBUG_REGISTER=1 for console details.`,
        );
        return;
      }

      if (registered) {
        registerDebug("submitRegistration: abort — already registered");
        setValidationError(
          "This node ID is already registered. Change the peer id above or open the node page to manage it.",
        );
        return;
      }

      registerDebug("submitRegistration: calling registerNode", {
        nodeId,
        payout,
        metadataURI: nodeBaseNormalized,
      });
      setTxBusy(true);
      setSuccessHash(null);
      try {
        const hash = await registerNode(
          walletClient,
          hubConfig.providerRegistryAddress,
          {
            nodeId,
            payout,
            supportsBestEffort: fields.supportsBestEffort,
            supportsTEE: fields.supportsTEE,
            metadataURI: nodeBaseNormalized,
          },
        );
        await waitForTransactionReceipt(publicClient, { hash });
        setSuccessHash(hash);
        registerDebug("submitRegistration: confirmed", { hash });
        await queryClient.invalidateQueries({
          queryKey: ["providerRegistered"],
        });
        await queryClient.invalidateQueries({
          queryKey: ["allRegistryNodes"],
        });
        await queryClient.invalidateQueries({
          queryKey: ["operatorNodesPage"],
        });
        await queryClient.invalidateQueries({
          queryKey: ["nodeDetail"],
        });
        router.push(
          nodeDetailHrefFromRegistration({
            kind: nodeIdInputKind,
            nodeIdHex: nodeId,
            rawIdentityInput: nodeIdentityInput,
          }),
        );
      } catch (e) {
        registerDebug("submitRegistration: registerNode failed", {
          error: e instanceof Error ? e.message : String(e),
        });
        setTxError(
          e instanceof Error ? e.message : "Registration transaction failed",
        );
      } finally {
        setTxBusy(false);
      }
    },
    [
      chainReady,
      hubConfig,
      publicClient,
      queryClient,
      registered,
      registryUnset,
      resolvedNodeId,
      nodeIdInputKind,
      nodeIdentityInput,
      walletClient,
      walletClientError,
      router,
      isConnected,
      chainId,
      registrationLoading,
    ],
  );

  const walletRegistryGate =
    !chainReady ||
    registryUnset ||
    txBusy ||
    !walletClient ||
    !hubConfig;

  const fieldsDisabled = walletRegistryGate || Boolean(registered);
  const submitRegisterDisabled =
    walletRegistryGate || Boolean(registered) || Boolean(successHash);

  const defaultPayout = address ?? "";

  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={3}>
        <Link as={NextLink} href="/node" font="body" underline={false}>
          ← Nodes
        </Link>

        <Text font="title2">Register node</Text>
        <Text font="body" color="fgMuted">
          Register in{" "}
          <Text as="span" font="body" mono>
            ProviderRegistry
          </Text>{" "}
          using the peer id string from your node logs or the{" "}
          <Text as="span" font="body" mono>
            peer_id
          </Text>{" "}
          field in{" "}
          <Text as="span" font="body" mono>
            GET …/details
          </Text>
          . Your connected wallet becomes the operator. The portal derives the
          on-chain{" "}
          <Text as="span" font="body" mono>
            bytes32
          </Text>{" "}
          automatically. After registration, use the node page to update payout,
          base URL, and listing status.
        </Text>

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
              Deploy ProviderRegistry and set{" "}
              <Text as="span" font="body" mono>
                NEXT_PUBLIC_PROVIDER_REGISTRY_ADDRESS_*
              </Text>{" "}
              in <Text as="span" font="body" mono>.env</Text>.
            </Text>
          </Banner>
        ) : null}

        {!isConnected ? (
          <Banner
            variant="informational"
            startIcon="wallet"
            showDismiss={false}
            title="Wallet disconnected"
          >
            <Text font="body">Connect a wallet from the toolbar to register.</Text>
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
              Switch to chain {hubConfig.chainId} ({hubConfig.chainName}).
            </Text>
          </Banner>
        ) : null}

        {chainReady &&
        !registryUnset &&
        !configError &&
        registered &&
        !registrationLoading ? (
          <Banner
            variant="informational"
            startIcon="wallet"
            showDismiss={false}
            title="This node is already registered"
          >
            <Text font="body">
              This node ID is already on-chain. Use{" "}
              <Link
                as={NextLink}
                href={resolvedNodePageHref}
                font="body"
                underline
              >
                Node page
              </Link>{" "}
              to manage this ID when your wallet is the operator, or enter a
              different peer id above.
            </Text>
          </Banner>
        ) : null}

        {successHash ? (
          <Banner
            variant="informational"
            startIcon="checkmark"
            showDismiss={false}
            title="Registration confirmed"
          >
            <VStack gap={1} alignItems="flex-start">
              <Text font="body">
                Transaction hash{" "}
                <Text as="span" font="body" mono tabularNumbers>
                  {successHash}
                </Text>
                . Redirecting to the node page…
              </Text>
            </VStack>
          </Banner>
        ) : null}

        {validationError ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Check the form"
          >
            <Text font="body">{validationError}</Text>
          </Banner>
        ) : null}

        {txError ? (
          <Banner
            variant="error"
            startIcon="warning"
            showDismiss={false}
            title="Transaction error"
          >
            <Text font="body">{txError}</Text>
          </Banner>
        ) : null}

        <RegisterFormBody
          nodeIdentityInput={nodeIdentityInput}
          onNodeIdentityChange={setNodeIdentityInput}
          nodeIdInputKind={nodeIdInputKind}
          resolvedNodeId={resolvedNodeId}
          defaultPayoutAddress={defaultPayout}
          fieldsDisabled={fieldsDisabled}
          submitRegisterDisabled={submitRegisterDisabled}
          successHash={successHash}
          txBusy={txBusy}
          onSubmitFields={(fields) => void submitRegistration(fields)}
        />
      </VStack>
    </Box>
  );
}
