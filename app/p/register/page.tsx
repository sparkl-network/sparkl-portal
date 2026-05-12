"use client";

import { Banner } from "@coinbase/cds-web/banner";
import { Button } from "@coinbase/cds-web/buttons";
import { Checkbox, TextInput } from "@coinbase/cds-web/controls";
import { Box, HStack, VStack } from "@coinbase/cds-web/layout";
import { Link, Text } from "@coinbase/cds-web/typography";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, startTransition, useState } from "react";
import { type Address, getAddress, isAddress } from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWalletClient,
} from "wagmi";

import { ZERO_ADDRESS } from "@/lib/chains";
import { getProvider, registerNode } from "@/lib/evm/registry";
import {
  addProviderToWatchlist,
} from "@/lib/providerWatchlist";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

const supportsTeeEffective = false;

type RegisterFormFields = {
  payoutInput: string;
  supportsBestEffort: boolean;
  metadataUri: string;
};

type ProbePart = {
  ok: boolean;
  httpStatus: number;
  body: unknown;
  error?: string;
};

type ProbeApiOk = {
  status: ProbePart;
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
  defaultPayoutAddress,
  fieldsDisabled,
  submitRegisterDisabled,
  successHash,
  txBusy,
  onSubmitFields,
}: {
  nodeIdentityInput: string;
  onNodeIdentityChange: (value: string) => void;
  defaultPayoutAddress: string;
  fieldsDisabled: boolean;
  submitRegisterDisabled: boolean;
  successHash: string | null;
  txBusy: boolean;
  onSubmitFields: (fields: RegisterFormFields) => void;
}) {
  const [payoutInput, setPayoutInput] = useState(defaultPayoutAddress);
  const [supportsBestEffort, setSupportsBestEffort] = useState(true);
  const [metadataUri, setMetadataUri] = useState("");
  const [nodeBaseUrl, setNodeBaseUrl] = useState("http://127.0.0.1:8787");
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeApiOk | null>(null);
  const [probeHttpError, setProbeHttpError] = useState<string | null>(null);

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
        label="Node address (identity)"
        placeholder="0x…"
        value={nodeIdentityInput}
        onChange={(e) => onNodeIdentityChange(e.target.value)}
        disabled={fieldsDisabled}
      />
      <Text font="caption" color="fgMuted">
        On-chain key for this node (often the same as your operator wallet). Use a
        different address to register another node while staying connected with the
        same operator account.
      </Text>

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
        <Checkbox checked={false} disabled value="tee" onChange={() => {}}>
          Supports TEE
        </Checkbox>
        <Text font="caption" color="fgMuted">
          TEE registration is disabled in early development builds.
        </Text>
      </VStack>

      <TextInput
        label="Metadata URI"
        placeholder="https://…/metadata.json or ipfs://…"
        value={metadataUri}
        onChange={(e) => setMetadataUri(e.target.value)}
        disabled={fieldsDisabled}
      />
      <Text font="caption" color="fgMuted">
        Public URI for provider metadata (JSON), e.g. a static HTTPS URL to a
        JSON document or an{" "}
        <Text as="span" font="caption" mono>
          ipfs://…
        </Text>{" "}
        link. Can be empty for local testing if your deployment allows it.
      </Text>

      <Text font="label2" color="fgMuted">
        Test inference node (Sparkl)
      </Text>
      <Text font="caption" color="fgMuted">
        Calls{" "}
        <Text as="span" font="caption" mono>
          GET /status
        </Text>{" "}
        and{" "}
        <Text as="span" font="caption" mono>
          GET /v1/models
        </Text>{" "}
        on your node via this app (localhost hosts only unless{" "}
        <Text as="span" font="caption" mono>
          PROVIDER_NODE_PROBE_HOSTS
        </Text>{" "}
        is set).
      </Text>
      <TextInput
        label="Node base URL"
        placeholder="http://127.0.0.1:8787"
        value={nodeBaseUrl}
        onChange={(e) => setNodeBaseUrl(e.target.value)}
        disabled={probeBlocked}
      />
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
        variant="primary"
        disabled={submitRegisterDisabled || Boolean(successHash)}
        loading={txBusy}
        onClick={() =>
          onSubmitFields({
            payoutInput,
            supportsBestEffort,
            metadataUri,
          })
        }
      >
        Register on-chain
      </Button>
    </VStack>
  );
}

function PortfolioTrackSection({
  owner,
  hubChainId,
  chainReady,
  registryUnset,
}: {
  owner: Address;
  hubChainId: number;
  chainReady: boolean;
  registryUnset: boolean;
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (!chainReady || registryUnset) return null;

  function add() {
    setMsg(null);
    const s = input.trim();
    if (!s || !isAddress(s)) {
      setMsg("Enter a valid operator address (0x + 40 hex).");
      return;
    }
    let op: Address;
    try {
      op = getAddress(s);
    } catch {
      setMsg("Invalid address checksum or format.");
      return;
    }
    const r = addProviderToWatchlist(owner, hubChainId, op);
    if (!r.ok) {
      setMsg(r.reason);
      return;
    }
    setInput("");
    void queryClient.invalidateQueries({ queryKey: ["providersLinked"] });
  }

  return (
    <VStack gap={2} alignItems="flex-start">
      <Text font="label2" color="fgMuted">
        Portfolio: more nodes for this wallet
      </Text>
      <Text font="caption" color="fgMuted">
        On-chain, each node has its own identity address; your connected wallet is
        the operator for nodes you register. You can use different node addresses
        with the same operator and payout. To track others without registering, add
        them below.
      </Text>
      <HStack gap={2} style={{ flexWrap: "wrap", width: "100%" }} alignItems="flex-end">
        <Box style={{ flex: "1 1 220px", minWidth: 0 }}>
          <TextInput
            label="Operator address to track"
            placeholder="0x…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </Box>
        <Button variant="secondary" compact onClick={() => add()}>
          Add to portfolio
        </Button>
      </HStack>
      {msg ? (
        <Text font="caption" color="fgMuted">
          {msg}
        </Text>
      ) : null}
    </VStack>
  );
}

export default function ProviderRegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { hubConfig, configError } = useHubChainConfig();

  const [txBusy, setTxBusy] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [successHash, setSuccessHash] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [nodeIdentityInput, setNodeIdentityInput] = useState("");

  useEffect(() => {
    if (address) {
      startTransition(() => {
        setNodeIdentityInput(address);
      });
    }
  }, [address]);

  const resolvedNodeId = useMemo((): Address | null => {
    const s = nodeIdentityInput.trim();
    if (!s || !isAddress(s)) return null;
    try {
      return getAddress(s);
    } catch {
      return null;
    }
  }, [nodeIdentityInput]);

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

  useEffect(() => {
    if (!successHash) return;
    const id = setTimeout(() => {
      router.push("/p");
    }, 2500);
    return () => clearTimeout(id);
  }, [successHash, router]);

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
      if (!nodeId) {
        setValidationError(
          "Enter a valid node address (0x + 40 hex chars).",
        );
        return;
      }
      const payout = parsePayout(fields.payoutInput);
      if (!payout) {
        setValidationError(
          "Enter a valid payout address (0x + 40 hex chars).",
        );
        return;
      }
      if (!fields.supportsBestEffort && !supportsTeeEffective) {
        setValidationError(
          "Enable at least one security tier (Best Effort, or TEE when available).",
        );
        return;
      }
      if (
        !walletClient ||
        !hubConfig ||
        !chainReady ||
        registryUnset ||
        !publicClient
      )
        return;

      if (registered) {
        setValidationError(
          "This node address is already registered. Change the node identity above, open Settings for that node, or track another operator in your portfolio.",
        );
        return;
      }

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
            supportsTEE: supportsTeeEffective,
            metadataURI: fields.metadataUri.trim(),
          },
        );
        await waitForTransactionReceipt(publicClient, { hash });
        setSuccessHash(hash);
        await queryClient.invalidateQueries({
          queryKey: ["providerDashboard"],
        });
        await queryClient.invalidateQueries({
          queryKey: ["providerRegistered"],
        });
        await queryClient.invalidateQueries({
          queryKey: ["providersLinked"],
        });
      } catch (e) {
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
      walletClient,
    ],
  );

  const walletRegistryGate =
    !chainReady ||
    registryUnset ||
    txBusy ||
    !walletClient ||
    !hubConfig ||
    registrationLoading;

  const fieldsDisabled = walletRegistryGate || Boolean(registered);
  const submitRegisterDisabled =
    walletRegistryGate || Boolean(registered) || Boolean(successHash);

  const formKey = address ?? "disconnected";
  const defaultPayout = address ?? "";

  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={3}>
        <Link as={NextLink} href="/p" font="body" underline={false}>
          ← Provider
        </Link>

        <Text font="title2">Register node</Text>
        <Text font="body" color="fgMuted">
          Register a node in ProviderRegistry: the node address is its on-chain
          identity; your connected wallet becomes the operator. Pricing can be set
          afterward from the node dashboard.
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
              This node address is already on-chain. Use{" "}
              <Link as={NextLink} href="/p/settings" font="body" underline>
                Settings
              </Link>{" "}
              to update payout or status when your wallet is the operator, or enter
              a different node address above to register another node with the same
              operator key. You can still track others from the portfolio section
              below.
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
                . Redirecting to the provider dashboard…
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
          key={formKey}
          nodeIdentityInput={nodeIdentityInput}
          onNodeIdentityChange={setNodeIdentityInput}
          defaultPayoutAddress={defaultPayout}
          fieldsDisabled={fieldsDisabled}
          submitRegisterDisabled={submitRegisterDisabled}
          successHash={successHash}
          txBusy={txBusy}
          onSubmitFields={(fields) => void submitRegistration(fields)}
        />

        {address && hubConfig && !configError ? (
          <PortfolioTrackSection
            owner={address}
            hubChainId={hubConfig.chainId}
            chainReady={chainReady}
            registryUnset={registryUnset}
          />
        ) : null}
      </VStack>
    </Box>
  );
}
