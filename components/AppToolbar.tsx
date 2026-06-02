"use client";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import NextLink from "next/link";
import { useMemo, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

import { ToolbarConnectAccount } from "@/components/ToolbarConnectAccount";
import { type ChainEnv } from "@/lib/chains";
import { ensureDevWalletNetwork } from "@/lib/evm/ensureDevWalletNetwork";
import { useHubChainConfig } from "@/lib/useHubChainConfig";

function chainEnvTitle(env: ChainEnv): string {
  switch (env) {
    case "assethub-dev-stub":
      return "Asset Hub dev stub";
    case "paseo":
      return "Asset Hub · Paseo";
    case "polkadot":
      return "Asset Hub · Polkadot";
    default:
      return env;
  }
}

export function AppToolbar() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitchPending } = useSwitchChain();
  const { hubConfig, configError } = useHubChainConfig();
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [rpcFixBusy, setRpcFixBusy] = useState(false);
  const [rpcFixError, setRpcFixError] = useState<string | null>(null);
  const [rpcFixNotice, setRpcFixNotice] = useState<string | null>(null);

  const wrongChain = useMemo(() => {
    if (!isConnected || !hubConfig) return false;
    return chainId !== hubConfig.chainId;
  }, [chainId, hubConfig, isConnected]);

  const hubSummary = hubConfig
    ? `${chainEnvTitle(hubConfig.chainEnv)} · chain ${hubConfig.chainId}`
    : configError ?? "Configure NEXT_PUBLIC_* env vars";

  const visibleSwitchError = wrongChain ? switchError : null;

  return (
    <div className="w-full">
      <nav className="flex flex-col gap-0 py-3 px-4 md:px-6">
        {/* Top row: logo + nav links */}
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold">
            <NextLink href="/" className="hover:underline underline-offset-4">
              Sparkl Portal
            </NextLink>
          </span>

          {/* Nav links — hidden on mobile */}
          <div className="hidden md:flex items-center gap-6 text-sm">
            <NextLink href="/node" className="text-muted-foreground hover:text-foreground transition-colors">
              Nodes
            </NextLink>
            <NextLink
              href="/operator"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Operator accounts directory"
            >
              Operators
            </NextLink>
            <NextLink href="/model" className="text-muted-foreground hover:text-foreground transition-colors">
              Models
            </NextLink>
            <NextLink href="/user" className="text-muted-foreground hover:text-foreground transition-colors">
              User
            </NextLink>
            <NextLink href="/sessions" className="text-muted-foreground hover:text-foreground transition-colors">
              Sessions
            </NextLink>
          </div>

          {/* Right side: chain info + wallet */}
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-muted-foreground">{hubSummary}</span>
            {isConnected && hubConfig?.chainEnv === "assethub-dev-stub" ? (
               <Button
                 variant="secondary"
                 size="compact"
                 disabled={rpcFixBusy}
                 onClick={() => {
                   setRpcFixError(null);
                   setRpcFixNotice(null);
                   setRpcFixBusy(true);
                  void ensureDevWalletNetwork(hubConfig)
                    .then((notice) => {
                      setRpcFixNotice(notice ?? null);
                    })
                    .catch((err: unknown) => {
                      setRpcFixError(
                        err instanceof Error ? err.message : "Could not set wallet RPC",
                      );
                    })
                    .finally(() => setRpcFixBusy(false));
                }}
              >
                {rpcFixBusy ? "Applying..." : (typeof window !== "undefined" && /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(window.location.hostname) ? "LAN chain RPC help" : "Fix wallet RPC (chain node)")}
              </Button>
            ) : null}
            {isConnected && wrongChain && hubConfig ? (
              <Button
                variant="destructive"
                size="compact"
                disabled={isSwitchPending}
                onClick={() => {
                  setSwitchError(null);
                  switchChainAsync?.({ chainId: hubConfig.chainId }).catch(
                    (err: unknown) => {
                      setSwitchError(
                        err instanceof Error ? err.message : "Could not switch network",
                      );
                    },
                  );
                }}
              >
                {isSwitchPending ? "Switching..." : "Switch network"}
              </Button>
            ) : null}
            <ConnectButton.Custom>
              {({ account, mounted, openAccountModal, openConnectModal }) => (
                <ToolbarConnectAccount
                  account={account}
                  mounted={mounted}
                  openAccountModal={openAccountModal}
                  openConnectModal={openConnectModal}
                />
              )}
            </ConnectButton.Custom>
          </div>
        </div>

        {/* Mobile nav links */}
        <div className="flex md:hidden items-center gap-4 mt-2 pb-1 text-sm">
          <NextLink href="/node" className="text-muted-foreground hover:text-foreground transition-colors">
            Nodes
          </NextLink>
          <NextLink href="/operator" className="text-muted-foreground hover:text-foreground transition-colors">
            Operators
          </NextLink>
          <NextLink href="/model" className="text-muted-foreground hover:text-foreground transition-colors">
            Models
          </NextLink>
          <NextLink href="/user" className="text-muted-foreground hover:text-foreground transition-colors">
            User
          </NextLink>
          <NextLink href="/sessions" className="text-muted-foreground hover:text-foreground transition-colors">
            Sessions
          </NextLink>
        </div>

        {/* Wrong network warning banner */}
        {isConnected && wrongChain && hubConfig ? (
          <Alert variant="warning" className="mt-3">
            <AlertTitle>Wrong network</AlertTitle>
            <AlertDescription>
              Switch to chain {hubConfig.chainId} ({hubConfig.chainName}) to use this portal.
              {hubConfig.chainEnv === "assethub-dev-stub" ? (
                <>
                  {"\n"}This app requests chain {hubConfig.chainId} via RPC {hubConfig.rpcUrl}. ERR_CONNECTION_REFUSED in DevTools means nothing answered at that URL—start Foundry Anvil there (run anvil, or anvil --host 0.0.0.0 if another device loads this UI). Restart yarn dev after changing NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB.
                  {"\n"}Rainbow Wallet extension errors involving chrome.runtime.sendMessage come from the extension—try MetaMask or another injected wallet if the RPC works but switching still fails.
                </>
              ) : null}
              {visibleSwitchError ? (
                <span className="text-xs text-muted-foreground mt-1 block">{visibleSwitchError}</span>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {/* RPC fix result banner */}
        {isConnected &&
        hubConfig?.chainEnv === "assethub-dev-stub" &&
        (rpcFixNotice || rpcFixError) ? (
          <Alert
            variant={rpcFixError ? "destructive" : "informational"}
            className="mt-3"
          >
            <AlertTitle>Wallet RPC</AlertTitle>
            <AlertDescription style={{ whiteSpace: "pre-wrap" }}>
              {rpcFixError ?? rpcFixNotice}
            </AlertDescription>
          </Alert>
        ) : null}
      </nav>
    </div>
  );
}
