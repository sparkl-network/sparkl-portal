"use client";

import { Box } from "@coinbase/cds-web/layout";
import { Text } from "@coinbase/cds-web/typography";

import { ZERO_ADDRESS } from "@/lib/chains";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

export function EscrowTrustFooter() {
  const { hubConfig, configError } = useHubChainConfig();

  if (configError) {
    return (
      <footer className="escrow-trust-footer">
        <Box paddingX={3} paddingY={2}>
          <Text font="label2" color="fgMuted">
            SettlementEscrow (depositDot)
          </Text>
          <Text font="caption" color="fgMuted">
            {configError}
          </Text>
        </Box>
      </footer>
    );
  }

  if (!hubConfig) return null;

  const { settlementEscrowAddress, chainId, chainName } = hubConfig;
  const unset = settlementEscrowAddress === ZERO_ADDRESS;

  return (
    <footer className="escrow-trust-footer">
      <Box paddingX={3} paddingY={2}>
        <Text font="label2" color="fgMuted">
          Native deposits go to SettlementEscrow — verify this contract before
          sending funds
        </Text>
        <Text
          font="caption"
          mono
          tabularNumbers
          style={{ wordBreak: "break-all", marginTop: 4 }}
        >
          {unset ? "Not configured (zero address)" : settlementEscrowAddress}
        </Text>
        <Text font="caption" color="fgMuted" style={{ marginTop: 2 }}>
          {chainName} · chain id {chainId} · native {hubConfig.nativeCurrency.symbol}{" "}
          ({hubConfig.nativeCurrency.decimals} decimals in app config — match wallet
          network + SettlementEscrow)
          {unset
            ? " · set NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_* to enable depositDot"
            : null}
        </Text>
      </Box>
    </footer>
  );
}
