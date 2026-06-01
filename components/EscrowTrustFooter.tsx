"use client";

import { Button } from "@coinbase/cds-web/buttons";
import { Box } from "@coinbase/cds-web/layout";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@coinbase/cds-web/overlays";
import { Text } from "@coinbase/cds-web/typography";
import { useState } from "react";

import { ZERO_ADDRESS, type HubChainConfig } from "@/lib/chains";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

function ChainInfoModal({
  visible,
  onRequestClose,
  hubConfig,
  escrowUnset,
}: {
  visible: boolean;
  onRequestClose: () => void;
  hubConfig: HubChainConfig;
  escrowUnset: boolean;
}) {
  const { chainName, chainId, nativeCurrency } = hubConfig;

  return (
    <Modal
      visible={visible}
      onRequestClose={onRequestClose}
      accessibilityLabel="Chain info"
    >
      <ModalHeader title="Chain Info" />
      <ModalBody paddingX={3} paddingY={2}>
        <Text font="body" color="fgMuted">
          {chainName} · chain id {chainId} · native {nativeCurrency.symbol} (
          {nativeCurrency.decimals} decimals in app config — match wallet network
          + SettlementEscrow)
          {escrowUnset
            ? " · set NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_* to enable depositDot"
            : null}
        </Text>
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

export function EscrowTrustFooter() {
  const { hubConfig, configError } = useHubChainConfig();
  const [chainInfoOpen, setChainInfoOpen] = useState(false);

  if (configError) {
    return (
      <footer className="escrow-trust-footer">
        <Box paddingX={3} paddingY={2}>
          <Text font="body" color="fgMuted">
            SettlementEscrow (depositDot)
          </Text>
          <Text font="body" color="fgMuted">
            {configError}
          </Text>
        </Box>
      </footer>
    );
  }

  if (!hubConfig) return null;

  const { settlementEscrowAddress } = hubConfig;
  const escrowUnset = settlementEscrowAddress === ZERO_ADDRESS;

  return (
    <>
      <ChainInfoModal
        visible={chainInfoOpen}
        onRequestClose={() => setChainInfoOpen(false)}
        hubConfig={hubConfig}
        escrowUnset={escrowUnset}
      />
      <footer className="escrow-trust-footer">
        <Box paddingX={3} paddingY={2}>
          <Text font="body" color="fgMuted">
            Native deposits go to SettlementEscrow — verify this contract before
            sending funds
          </Text>
          <Text
            font="body"
            mono
            tabularNumbers
            style={{ wordBreak: "break-all", marginTop: 4 }}
          >
            {escrowUnset ? "Not configured (zero address)" : settlementEscrowAddress}
          </Text>
          <Button
            variant="secondary"
            compact
            style={{ marginTop: 4 }}
            onClick={() => setChainInfoOpen(true)}
          >
            Chain Info
          </Button>
        </Box>
      </footer>
    </>
  );
}
