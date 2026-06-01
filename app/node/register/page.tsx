"use client";

import { Banner } from "@coinbase/cds-web/banner";
import { Button, IconButton } from "@coinbase/cds-web/buttons";
import { Checkbox, TextInput } from "@coinbase/cds-web/controls";
import { Box, HStack, VStack } from "@coinbase/cds-web/layout";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@coinbase/cds-web/overlays";
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
import { formatTxError } from "@/lib/evm/formatTxError";
import { getProvider, registerNode } from "@/lib/evm/registry";
import { canonicalNodeIdFromIdentityBody } from "@/lib/identityProbe";
import {
  parseRegistryCapabilities,
  type RegistryCapabilities,
} from "@/lib/registryCapabilities";
import {
  classifyNodeIdInput,
  identityInputFromProbe,
  nodeDetailHrefFromRegistration,
  type NodeIdInputKind,
} from "@/lib/nodeId";
import { normalizeNodeBaseUrl } from "@/lib/nodeBaseUrl";
import { registerDebug } from "@/lib/registerDebug";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

/** TEE tier on-chain advertisement is planned; registration sends supportsTEE = false. */
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
  models: ProbePart;
  identity: ProbePart;
};

type RegisterProbeGate = {
  canonicalNodeId: Hex | null;
  identityPeerId: string | null;
};

function getRegisterDisabledReasons(params: {
  configError: string | null;
  hubConfig: ReturnType<typeof useHubChainConfig>["hubConfig"];
  isConnected: boolean;
  address: string | undefined;
  chainId: number;
  registryUnset: boolean;
  walletClient: ReturnType<typeof useWalletClient>["data"];
  walletClientError: Error | null;
  txBusy: boolean;
  registered: boolean | undefined;
  successHash: string | null;
  canonicalNodeId: Hex | null;
  registrationIdAligned: boolean;
  tiersFromProbe: boolean;
  tierBestEffort: boolean;
  tierTee: boolean;
}): string[] {
  const reasons: string[] = [];

  if (params.configError) {
    reasons.push(params.configError);
  }
  if (!params.hubConfig) {
    reasons.push("Hub chain configuration is not loaded.");
  }
  if (!params.isConnected || !params.address) {
    reasons.push("Connect a wallet from the toolbar.");
  } else if (
    params.hubConfig &&
    params.chainId !== params.hubConfig.chainId
  ) {
    reasons.push(
      `Switch to ${params.hubConfig.chainName} (chain ${params.hubConfig.chainId}).`,
    );
  }
  if (params.registryUnset) {
    reasons.push(
      "Set OperatorRegistry address in portal env (NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS_*).",
    );
  }
  if (
    params.isConnected &&
    params.hubConfig &&
    params.chainId === params.hubConfig.chainId &&
    !params.walletClient
  ) {
    reasons.push(
      params.walletClientError
        ? `Wallet is not ready to sign (${params.walletClientError.message}).`
        : "Wallet is not ready to sign. Try reconnecting.",
    );
  }
  if (params.txBusy) {
    reasons.push("Registration transaction in progress.");
  }
  if (params.registered) {
    reasons.push("This node ID is already registered on-chain.");
  }
  if (params.successHash) {
    reasons.push("Registration already completed for this session.");
  }
  if (!params.canonicalNodeId) {
    reasons.push(
      "Run Probe successfully (GET /identity must return a valid libp2p peer_id).",
    );
  } else if (!params.registrationIdAligned) {
    reasons.push(
      "Peer ID or pasted hex must match the last successful Probe (/identity).",
    );
  }
  if (params.canonicalNodeId && !params.tiersFromProbe) {
    reasons.push("Run Probe to load security tiers from the node.");
  } else if (
    params.canonicalNodeId &&
    params.tiersFromProbe &&
    !params.tierBestEffort &&
    !params.tierTee
  ) {
    reasons.push(
      "Enable at least one security tier (Best Effort and/or TEE) from Probe.",
    );
  }

  return reasons;
}

function RegisterHelpModal({
  visible,
  onRequestClose,
}: {
  visible: boolean;
  onRequestClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      onRequestClose={onRequestClose}
      accessibilityLabel="How to register a node"
    >
      <ModalHeader title="How to register a node" />
      <ModalBody paddingX={3} paddingY={2}>
        <VStack gap={2} alignItems="flex-start">
          <Text font="body" color="fgMuted">
            Register your node on the hub chain in four steps:
          </Text>
          <Text font="body" color="fgMuted">
            (1) Connect your wallet on the correct network.
          </Text>
          <Text font="body" color="fgMuted">
            (2) Enter your node&apos;s HTTP base URL and run{" "}
            <Text as="span" font="body">
              Probe
            </Text>{" "}
            so the portal can read{" "}
            <Text as="span" font="body" mono>
              /status
            </Text>
            ,{" "}
            <Text as="span" font="body" mono>
              /v1/models
            </Text>
            , and{" "}
            <Text as="span" font="body" mono>
              /identity
            </Text>
            .
          </Text>
          <Text font="body" color="fgMuted">
            (3) Confirm payout and tier settings.
          </Text>
          <Text font="body" color="fgMuted">
            (4) Sign{" "}
            <Text as="span" font="body">
              Register
            </Text>{" "}
            to write your node into{" "}
            <Text as="span" font="body" mono>
              OperatorRegistry
            </Text>
            .
          </Text>
          <Text font="body" color="fgMuted">
            Registration uses the canonical{" "}
            <Text as="span" font="body" mono>
              node_id
            </Text>{" "}
            from{" "}
            <Text as="span" font="body" mono>
              /identity
            </Text>{" "}
            (bytes32 = keccak256 of the node&apos;s ed25519 public key). After
            confirmation, use the node page to change payout, metadata, and
            listing status.
          </Text>
        </VStack>
      </ModalBody>
      <ModalFooter
        primaryAction={
          <Button variant="secondary" onClick={onRequestClose}>
            Close
          </Button>
        }
      />
    </Modal>
  );
}

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
  canonicalNodeIdFromProbe,
  defaultPayoutAddress,
  payoutInputKey,
  fieldsDisabled,
  submitRegisterDisabled,
  registerDisabledReasons,
  successHash,
  txBusy,
  onSubmitFields,
  onProbeGateChange,
  onApplyIdentityFromProbe,
  onTierFlagsChange,
}: {
  nodeIdentityInput: string;
  onNodeIdentityChange: (value: string) => void;
  nodeIdInputKind: NodeIdInputKind;
  resolvedNodeId: Hex | null;
  canonicalNodeIdFromProbe: Hex | null;
  defaultPayoutAddress: string;
  fieldsDisabled: boolean;
  submitRegisterDisabled: boolean;
  registerDisabledReasons: string[];
  successHash: string | null;
  txBusy: boolean;
  onSubmitFields: (fields: RegisterFormFields) => void;
  onProbeGateChange: (gate: RegisterProbeGate) => void;
  onApplyIdentityFromProbe: (peerId: string) => void;
  onTierFlagsChange: (flags: {
    supportsBestEffort: boolean;
    supportsTEE: boolean;
    tiersFromProbe: boolean;
  }) => void;
  payoutInputKey: string;
}) {
  /** Empty initial state avoids SSR vs client mismatch when the wallet restores on load. */
  const [payoutInput, setPayoutInput] = useState("");
  const [probeTiers, setProbeTiers] = useState<RegistryCapabilities | null>(
    null,
  );
  const [nodeBaseUrl, setNodeBaseUrl] = useState("http://127.0.0.1:8787");
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeApiOk | null>(null);
  const [probeHttpError, setProbeHttpError] = useState<string | null>(null);

  useEffect(() => {
    startTransition(() => {
      setPayoutInput(defaultPayoutAddress);
    });
  }, [defaultPayoutAddress]);

  useEffect(() => {
    if (!probeTiers) {
      onTierFlagsChange({
        supportsBestEffort: false,
        supportsTEE: false,
        tiersFromProbe: false,
      });
      return;
    }
    onTierFlagsChange({
      supportsBestEffort: probeTiers.supportsBestEffort,
      supportsTEE: supportsTeeEffective && probeTiers.supportsTEE,
      tiersFromProbe: true,
    });
  }, [probeTiers, onTierFlagsChange]);

  const probeBlocked = Boolean(successHash);

  async function runNodeProbe() {
    const base = nodeBaseUrl.trim();
    if (!base) return;
    setProbeHttpError(null);
    setProbeResult(null);
    onProbeGateChange({ canonicalNodeId: null, identityPeerId: null });
    setProbeTiers(null);
    setProbeLoading(true);
    try {
      const r = await fetch("/api/operator-node-probe", {
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
      const ok = data as ProbeApiOk;
      setProbeResult(ok);
      const idPart = ok.identity;
      const parsed =
        idPart.ok ? canonicalNodeIdFromIdentityBody(idPart.body) : null;
      const canonical = parsed?.nodeId ?? null;
      const peer = parsed?.peerId ?? null;
      onProbeGateChange({ canonicalNodeId: canonical, identityPeerId: peer });
      if (canonical) {
        onApplyIdentityFromProbe(
          identityInputFromProbe({
            canonicalNodeId: canonical,
            identityPeerId: peer,
          }),
        );
      }
      if (idPart.ok) {
        setProbeTiers(parseRegistryCapabilities(idPart.body));
      }
    } catch (e) {
      setProbeHttpError(
        e instanceof Error ? e.message : "Probe request failed",
      );
    } finally {
      setProbeLoading(false);
    }
  }

  const peerIdReadOnly = Boolean(canonicalNodeIdFromProbe);

  return (
    <VStack gap={2}>
      <TextInput
        key={payoutInputKey}
        label="Payout address (wallet)"
        placeholder="0x…"
        value={payoutInput}
        onChange={(e) => setPayoutInput(e.target.value)}
        disabled={fieldsDisabled}
      />
      <Text font="caption" color="fgMuted">
        Prefilled from the connected wallet (operator payout).
      </Text>

      <TextInput
        label="Node base URL"
        placeholder="http://127.0.0.1:8787"
        value={nodeBaseUrl}
        onChange={(e) => {
          setNodeBaseUrl(e.target.value);
          onProbeGateChange({ canonicalNodeId: null, identityPeerId: null });
          onNodeIdentityChange("");
          setProbeTiers(null);
          setProbeResult(null);
          setProbeHttpError(null);
        }}
        disabled={probeBlocked}
      />


      <Text font="caption" color="fgMuted">
        HTTP origin stored on-chain as versioned JSON (with{" "}
        <Text as="span" font="caption" mono>
          baseUrl
        </Text>
        ) in this flow. Your process must serve{" "}
        <Text as="span" font="caption" mono>
          /status
        </Text>
        ,{" "}
        <Text as="span" font="caption" mono>
          /identity
        </Text>
        , and{" "}
        <Text as="span" font="caption" mono>
          /v1/models
        </Text>
        .
      </Text>

      <Text font="label2" color="fgMuted">
        Probe node
      </Text>
      <Text font="caption" color="fgMuted">
        Calls{" "}
        <Text as="span" font="caption" mono>
          GET /status
        </Text>
        ,{" "}
        <Text as="span" font="caption" mono>
          /v1/models
        </Text>
        , and{" "}
        <Text as="span" font="caption" mono>
          /identity
        </Text>{" "}
        on your node via this app (server-side GETs from the portal host). A
        successful{" "}
        <Text as="span" font="caption" mono>
          /identity
        </Text>{" "}
        is required before registering.
      </Text>
      <Button
        variant="secondary"
        disabled={probeBlocked || probeLoading || !nodeBaseUrl.trim()}
        loading={probeLoading}
        onClick={() => void runNodeProbe()}
      >
        Probe
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
              <Text
                font="body"
                mono
                tabularNumbers
                style={{ whiteSpace: "pre-wrap", textTransform: "none" }}
              >
                {formatProbeBody(probeResult.status.body)}
              </Text>
            </Box>
          </VStack>
          <VStack gap={1} alignItems="flex-start" width="100%">
            <Text font="label2" color="fgMuted">
              Identity (/identity)
            </Text>
            <VStack gap={1} alignItems="flex-start">
              <Checkbox
                checked={probeTiers?.supportsBestEffort ?? false}
                onChange={() => {}}
                value="best-effort"
                disabled={fieldsDisabled || !probeTiers}
              >
                Supports Best Effort
              </Checkbox>
              <Text font="caption" color="fgMuted">
                {probeTiers
                  ? "From Probe (`registry_capabilities` on GET /identity)."
                  : "Run Probe to load from `registry_capabilities`."}
              </Text>
            </VStack>

            <VStack gap={1} alignItems="flex-start">
              <Checkbox
                checked={probeTiers?.supportsTEE ?? false}
                onChange={() => {}}
                value="tee"
                disabled={fieldsDisabled || !probeTiers}
              >
                Supports TEE
              </Checkbox>
              <Text font="caption" color="fgMuted">
                {probeTiers
                  ? supportsTeeEffective
                    ? "From Probe. On-chain TEE sessions still require attestation (`setTEEProof`)."
                    : "From Probe. Registration sends supportsTEE = false while TEE tier is planned."
                  : "Run Probe to load from `registry_capabilities`."}
              </Text>
            </VStack>


            <Text font="caption" color="fgMuted">
              HTTP {probeResult.identity.httpStatus}{" "}
              {probeResult.identity.ok ? "OK" : "non-OK"}
              {probeResult.identity.error
                ? ` — ${probeResult.identity.error}`
                : ""}
            </Text>
            <Box
              width="100%"
              padding={2}
              bordered
              borderRadius={400}
              style={{ overflow: "auto", maxHeight: 220 }}
            >
              <Text
                font="body"
                mono
                tabularNumbers
                style={{ whiteSpace: "pre-wrap", textTransform: "none" }}
              >
                {formatProbeBody(probeResult.identity.body)}
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
              <Text
                font="body"
                mono
                tabularNumbers
                style={{ whiteSpace: "pre-wrap", textTransform: "none" }}
              >
                {formatProbeBody(probeResult.models.body)}
              </Text>
            </Box>
          </VStack>
        </VStack>
      ) : null}

      <Text font="label2" color="fgMuted">
        Node identity
      </Text>
      <TextInput
        label="Peer ID"
        placeholder="Run Probe to load from GET /identity"
        value={nodeIdentityInput}
        readOnly={peerIdReadOnly}
        disabled={fieldsDisabled || !canonicalNodeIdFromProbe}
      />
      {/* <Text font="caption" color="fgMuted">
        Filled from your last successful Probe. Edit only if you need to paste{" "}
        <Text as="span" font="caption" mono>
          node_id
        </Text>{" "}
        hex for software/mock keys.
      </Text> */}

      {/* {canonicalNodeIdFromProbe ? (
        <Box
          width="100%"
          padding={2}
          bordered
          borderColor="bgLineHeavy"
          style={{ borderRadius: 8 }}
        >
          <Text font="caption" color="fgMuted">
            On-chain id from successful probe (GET /identity → node_id)
          </Text>
          <Text
            font="body"
            mono
            tabularNumbers
            style={{ wordBreak: "break-all", textTransform: "none" }}
          >
            {canonicalNodeIdFromProbe}
          </Text>
        </Box>
      ) : null} */}

      {/* {resolvedNodeId ? (
        <Box
          width="100%"
          padding={2}
          bordered
          borderColor="bgLineHeavy"
          style={{ borderRadius: 8 }}
        >
          <Text font="caption" color="fgMuted">
            Resolved from your input (preview)
          </Text>
          <Text
            font="body"
            mono
            tabularNumbers
            style={{ wordBreak: "break-all", textTransform: "none" }}
          >
            {resolvedNodeId}
          </Text>
          {nodeIdInputKind === "peer_id" ? (
            <Text font="caption" color="fgMuted">
              Libp2p strings are hashed here as keccak over the multihash bytes
              (legacy preview only). Registration uses{" "}
              <Text as="span" font="caption" mono>
                /identity.node_id
              </Text>{" "}
              after a successful probe.
            </Text>
          ) : null}
          {nodeIdInputKind === "address" ? (
            <Text font="caption" color="fgMuted">
              = your EVM address padded to 32 bytes (legacy dev / Foundry style).
            </Text>
          ) : null}
          {nodeIdInputKind === "hex32" ? (
            <Text font="caption" color="fgMuted">
              = raw bytes32 from your paste (must match{" "}
              <Text as="span" font="caption" mono>
                /identity
              </Text>{" "}
              after probing).
            </Text>
          ) : null}
        </Box>
      ) : nodeIdentityInput.trim() ? (
        <Text font="caption" style={{ color: "#b91c1c" }}>
          Not recognized as a libp2p peer id (
          <Text as="span" font="caption" mono>
            12D3…
          </Text>
          ), 0x + 64 hex, or an Ethereum address.
          {nodeIdentityInput.trim().startsWith("mock-") ||
          nodeIdentityInput.trim().startsWith("tpm-") ? (
            <>
              {" "}
              Software keys return{" "}
              <Text as="span" font="caption" mono>
                mock-…
              </Text>{" "}
              /{" "}
              <Text as="span" font="caption" mono>
                tpm-…
              </Text>{" "}
              in GET /identity — paste the{" "}
              <Text as="span" font="caption" mono>
                node_id
              </Text>{" "}
              hex above, or run Probe again to auto-fill.
            </>
          ) : (
            <> Check for typos or spaces.</>
          )}
        </Text>
      ) : null} */}

      {submitRegisterDisabled && registerDisabledReasons.length > 0 ? (
        <Box
          width="100%"
          padding={2}
          bordered
          borderColor="bgLineHeavy"
          style={{ borderRadius: 8 }}
        >
          <Text font="label2" color="fgMuted">
            Register is disabled until:
          </Text>
          <VStack gap={0.5} alignItems="flex-start" paddingTop={1}>
            {registerDisabledReasons.map((reason, index) => (
              <Text key={`${index}-${reason}`} font="caption" color="fgMuted">
                • {reason}
              </Text>
            ))}
          </VStack>
        </Box>
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
            supportsBestEffort: probeTiers?.supportsBestEffort,
            supportsTEEEffective: supportsTeeEffective && probeTiers?.supportsTEE,
          });
          onSubmitFields({
            payoutInput,
            supportsBestEffort: probeTiers?.supportsBestEffort ?? false,
            supportsTEE: supportsTeeEffective && (probeTiers?.supportsTEE ?? false),
            nodeBaseUrl,
          });
        }}
      >
        Register
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
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tierFlags, setTierFlags] = useState({
    supportsBestEffort: false,
    supportsTEE: false,
    tiersFromProbe: false,
  });
  const [nodeIdentityInput, setNodeIdentityInput] = useState("");
  const [probeGate, setProbeGate] = useState<RegisterProbeGate>({
    canonicalNodeId: null,
    identityPeerId: null,
  });

  const { kind: nodeIdInputKind, nodeId: resolvedNodeId } = useMemo(
    () => classifyNodeIdInput(nodeIdentityInput),
    [nodeIdentityInput],
  );

  const registrationLookupId =
    probeGate.canonicalNodeId ??
    (nodeIdInputKind !== "peer_id" ? resolvedNodeId : null);

  const registrationIdAligned = useMemo(() => {
    const c = probeGate.canonicalNodeId;
    if (!c) return false;
    const hexMatch =
      Boolean(resolvedNodeId) &&
      resolvedNodeId!.toLowerCase() === c.toLowerCase();
    const peerMatch =
      probeGate.identityPeerId !== null &&
      nodeIdentityInput.trim() === probeGate.identityPeerId;
    return hexMatch || peerMatch;
  }, [
    probeGate.canonicalNodeId,
    probeGate.identityPeerId,
    resolvedNodeId,
    nodeIdentityInput,
  ]);

  const handleProbeGateChange = useCallback((gate: RegisterProbeGate) => {
    setProbeGate(gate);
  }, []);

  const handleApplyIdentityFromProbe = useCallback((peerId: string) => {
    setNodeIdentityInput(peerId);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const effectiveIsConnected = mounted && isConnected;

  const handleTierFlagsChange = useCallback(
    (flags: {
      supportsBestEffort: boolean;
      supportsTEE: boolean;
      tiersFromProbe: boolean;
    }) => {
      setTierFlags(flags);
    },
    [],
  );

  const tiersEnabled =
    tierFlags.tiersFromProbe &&
    (tierFlags.supportsBestEffort || tierFlags.supportsTEE);

  const resolvedNodePageHref = useMemo(() => {
    const nodeHex = probeGate.canonicalNodeId ?? resolvedNodeId;
    if (!nodeHex) return "/node";
    return nodeDetailHrefFromRegistration({
      kind: nodeIdInputKind,
      nodeIdHex: nodeHex,
      rawIdentityInput: nodeIdentityInput,
    });
  }, [
    probeGate.canonicalNodeId,
    resolvedNodeId,
    nodeIdInputKind,
    nodeIdentityInput,
  ]);

  const chainReady = Boolean(
    effectiveIsConnected &&
      hubConfig &&
      chainId === hubConfig.chainId &&
      address,
  );

  const registryUnset = useMemo(() => {
    if (!hubConfig?.operatorRegistryAddress) return true;
    return (
      hubConfig.operatorRegistryAddress.toLowerCase() ===
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
      hubConfig?.operatorRegistryAddress,
      registrationLookupId,
    ],
    queryFn: async () => {
      if (!publicClient || !hubConfig || !registrationLookupId) return false;
      const info = await getProvider(
        publicClient,
        hubConfig.operatorRegistryAddress,
        registrationLookupId,
      );
      return info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
    },
    enabled: Boolean(
      chainReady &&
        hubConfig &&
        registrationLookupId &&
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
      const nodeId = probeGate.canonicalNodeId;
      registerDebug("submitRegistration: start", {
        resolvedNodeId,
        canonicalNodeId: probeGate.canonicalNodeId,
        registrationIdAligned,
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
        registryAddress: hubConfig?.operatorRegistryAddress,
      });
      if (!nodeId) {
        registerDebug("submitRegistration: abort — no canonical id from probe");
        setValidationError(
          'Run Probe first. Registration needs a successful GET /identity with a valid libp2p peer_id (on-chain bytes32 = keccak256(libp2p multihash)).',
        );
        return;
      }
      if (!registrationIdAligned) {
        registerDebug("submitRegistration: abort — identity mismatch");
        setValidationError(
          "Peer id or bytes32 field must match your node’s GET /identity (same peer_id string or 0x node_id). Run Probe again or paste the values from /identity.",
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
          "Enter a valid node base URL (http:// or https:// host, optionally with port). Your node's HTTP origin must expose /status, /identity, and /v1/models.",
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

      const metadataURI = JSON.stringify({
        version: 1,
        baseUrl: nodeBaseNormalized,
        ...(probeGate.identityPeerId
          ? { peer_id: probeGate.identityPeerId }
          : {}),
      });

      registerDebug("submitRegistration: calling registerNode", {
        nodeId,
        payout,
        metadataURI,
      });
      setTxBusy(true);
      setSuccessHash(null);
      try {
        const hash = await registerNode(
          walletClient,
          hubConfig.operatorRegistryAddress,
          {
            nodeId,
            payout,
            supportsBestEffort: fields.supportsBestEffort,
            supportsTEE: fields.supportsTEE,
            metadataURI,
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
        setTxError(formatTxError(e));
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
      probeGate,
      registrationIdAligned,
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
    walletRegistryGate ||
    Boolean(registered) ||
    Boolean(successHash) ||
    !registrationIdAligned ||
    !tiersEnabled;

  const registerDisabledReasons = useMemo(() => {
    if (!submitRegisterDisabled) return [];
    return getRegisterDisabledReasons({
      configError,
      hubConfig,
      isConnected,
      address,
      chainId,
      registryUnset,
      walletClient,
      walletClientError: walletClientError ?? null,
      txBusy,
      registered,
      successHash,
      canonicalNodeId: probeGate.canonicalNodeId,
      registrationIdAligned,
      tiersFromProbe: tierFlags.tiersFromProbe,
      tierBestEffort: tierFlags.supportsBestEffort,
      tierTee: tierFlags.supportsTEE,
    });
  }, [
    submitRegisterDisabled,
    configError,
    hubConfig,
    isConnected,
    address,
    chainId,
    registryUnset,
    walletClient,
    walletClientError,
    txBusy,
    registered,
    successHash,
    probeGate.canonicalNodeId,
    registrationIdAligned,
    tierFlags.tiersFromProbe,
    tierFlags.supportsBestEffort,
    tierFlags.supportsTEE,
  ]);

  const defaultPayout =
    effectiveIsConnected && address ? address : "";
  const payoutInputKey =
    effectiveIsConnected && address ? address : "disconnected";

  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={3}>
        <Link as={NextLink} href="/node" font="body" underline={false}>
          ← Nodes
        </Link>

        <HStack gap={1} alignItems="center">
          <Text font="title2">Register node</Text>
          <IconButton
            name="questionMark"
            variant="secondary"
            compact
            accessibilityLabel="How to register a node"
            onClick={() => setHelpModalOpen(true)}
          />
        </HStack>

        <RegisterHelpModal
          visible={helpModalOpen}
          onRequestClose={() => setHelpModalOpen(false)}
        />

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
              Deploy OperatorRegistry and set{" "}
              <Text as="span" font="body" mono>
                NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS_*
              </Text>{" "}
              in <Text as="span" font="body" mono>.env.local</Text>.
            </Text>
          </Banner>
        ) : null}

        {mounted && !isConnected ? (
          <Banner
            variant="informational"
            startIcon="wallet"
            showDismiss={false}
            title="Wallet disconnected"
          >
            <Text font="body">Connect a wallet from the toolbar to register.</Text>
          </Banner>
        ) : null}

        {effectiveIsConnected && hubConfig && chainId !== hubConfig.chainId ? (
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
        probeGate.canonicalNodeId &&
        !registrationIdAligned &&
        !registered &&
        !registrationLoading &&
        !successHash ? (
          <Banner
            variant="warning"
            startIcon="warning"
            showDismiss={false}
            title="Identity must match your node"
          >
            <Text font="body">
              Your peer id or pasted hex does not match the last successful{" "}
              <Text as="span" font="body" mono>
                GET /identity
              </Text>{" "}
              probe. Run Probe again, use the{" "}
              <Text as="span" font="body" mono>
                peer_id
              </Text>{" "}
              from the response, or paste the{" "}
              <Text as="span" font="body" mono>
                node_id
              </Text>{" "}
              hex exactly — do not register a mismatched id.
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
          canonicalNodeIdFromProbe={probeGate.canonicalNodeId}
          defaultPayoutAddress={defaultPayout}
          payoutInputKey={payoutInputKey}
          fieldsDisabled={fieldsDisabled}
          submitRegisterDisabled={submitRegisterDisabled}
          registerDisabledReasons={registerDisabledReasons}
          successHash={successHash}
          txBusy={txBusy}
          onSubmitFields={(fields) => void submitRegistration(fields)}
          onProbeGateChange={handleProbeGateChange}
          onApplyIdentityFromProbe={handleApplyIdentityFromProbe}
          onTierFlagsChange={handleTierFlagsChange}
        />
      </VStack>
    </Box>
  );
}
