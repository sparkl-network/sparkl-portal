"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";

import { ZERO_ADDRESS, type HubChainConfig } from "@/lib/chains";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

function ChainInfoModal({
  open,
  onOpenChange,
  hubConfig,
  escrowUnset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hubConfig: HubChainConfig;
  escrowUnset: boolean;
}) {
  const { chainName, chainId, nativeCurrency } = hubConfig;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chain Info</DialogTitle>
        </DialogHeader>
        <DialogDescription className="text-muted-foreground">
          {chainName} · chain id {chainId} · native {nativeCurrency.symbol} (
          {nativeCurrency.decimals} decimals in app config — match wallet network
          + SettlementEscrow)
          {escrowUnset
            ? " · set NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_* to enable depositDot"
            : null}
        </DialogDescription>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EscrowTrustFooter() {
  const { hubConfig, configError } = useHubChainConfig();
  const [chainInfoOpen, setChainInfoOpen] = useState(false);

  if (configError) {
    return (
      <footer className="escrow-trust-footer">
        <div className="px-3 py-2">
          <p className="text-sm text-muted-foreground">
            SettlementEscrow (depositDot)
          </p>
          <p className="text-sm text-muted-foreground">{configError}</p>
        </div>
      </footer>
    );
  }

  if (!hubConfig) return null;

  const { settlementEscrowAddress } = hubConfig;
  const escrowUnset = settlementEscrowAddress === ZERO_ADDRESS;

  return (
    <>
      <ChainInfoModal
        open={chainInfoOpen}
        onOpenChange={(open) => setChainInfoOpen(open)}
        hubConfig={hubConfig}
        escrowUnset={escrowUnset}
      />
      <footer className="escrow-trust-footer">
        <div className="px-3 py-2">
          <p className="text-sm text-muted-foreground">
            Native deposits go to SettlementEscrow — verify this contract before
            sending funds
          </p>
          <p
            className="text-sm tabular-nums font-mono break-all"
            style={{ marginTop: 4 }}
          >
            {escrowUnset ? "Not configured (zero address)" : settlementEscrowAddress}
          </p>
          <Button
            variant="secondary"
            size="compact"
            style={{ marginTop: 4 }}
            onClick={() => setChainInfoOpen(true)}
          >
            Chain Info
          </Button>
        </div>
      </footer>
    </>
  );
}
