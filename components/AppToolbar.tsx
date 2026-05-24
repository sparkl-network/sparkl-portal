"use client";

import { Button } from "@coinbase/cds-web/buttons";
import { Banner } from "@coinbase/cds-web/banner";
import { HStack, VStack } from "@coinbase/cds-web/layout";
import { NavigationBar } from "@coinbase/cds-web/navigation";
import { Link, Text } from "@coinbase/cds-web/typography";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import NextLink from "next/link";
import { useMemo, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

import { ToolbarConnectAccount } from "@/components/ToolbarConnectAccount";
import { type ChainEnv } from "@/lib/chains";
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

  const wrongChain = useMemo(() => {
    if (!isConnected || !hubConfig) return false;
    return chainId !== hubConfig.chainId;
  }, [chainId, hubConfig, isConnected]);

  const hubSummary = hubConfig
    ? `${chainEnvTitle(hubConfig.chainEnv)} · chain ${hubConfig.chainId}`
    : configError ?? "Configure NEXT_PUBLIC_* env vars";

  const visibleSwitchError = wrongChain ? switchError : null;

  return (
    <VStack width="100%">
      <NavigationBar
        accessibilityLabel="Application toolbar"
        start={
          <Text font="title4">
            <Link as={NextLink} href="/" underline={false}>
              Sparkl Portal
            </Link>
          </Text>
        }
        end={
          <HStack gap={2}>
            <Text font="caption" color="fgMuted">
              {hubSummary}
            </Text>
            {isConnected && wrongChain && hubConfig ? (
              <Button
                accessibilityLabel="Switch wallet to configured Hub chain"
                variant="negative"
                compact
                loading={isSwitchPending}
                disabled={isSwitchPending}
                onClick={() => {
                  setSwitchError(null);
                  switchChainAsync?.({ chainId: hubConfig.chainId }).catch(
                    (err: unknown) => {
                      setSwitchError(
                        err instanceof Error
                          ? err.message
                          : "Could not switch network",
                      );
                    },
                  );
                }}
              >
                Switch network
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
          </HStack>
        }
      >
        <HStack gap={3}>
          <Link as={NextLink} href="/node" font="body" underline={false}>
            Nodes
          </Link>
          <Link
            as={NextLink}
            href="/provider"
            font="body"
            underline={false}
            title="Operator accounts directory"
          >
            Providers
          </Link>
          <Link as={NextLink} href="/c" font="body" underline={false}>
            Consumer
          </Link>
          <Link as={NextLink} href="/c/fund" font="body" underline={false}>
            Fund
          </Link>
        </HStack>
      </NavigationBar>
      {isConnected && wrongChain && hubConfig ? (
        <Banner
          variant="warning"
          startIcon="warning"
          showDismiss={false}
          bordered
          title="Wrong network"
        >
          <VStack gap={1}>
            <Text font="body">
              Switch to chain {hubConfig.chainId} ({hubConfig.chainName}) to use
              this portal.
            </Text>
            {hubConfig.chainEnv === "assethub-dev-stub" ? (
              <>
                <Text font="caption" color="fgMuted">
                  {`This app requests chain ${hubConfig.chainId} via RPC ${hubConfig.rpcUrl}. ERR_CONNECTION_REFUSED in DevTools means nothing answered at that URL—start Foundry Anvil there (run anvil, or anvil --host 0.0.0.0 if another device loads this UI). Restart yarn dev after changing NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB.`}
                </Text>
                <Text font="caption" color="fgMuted">
                  Rainbow Wallet extension errors involving chrome.runtime.sendMessage
                  come from the extension—try MetaMask or another injected wallet if the
                  RPC works but switching still fails.
                </Text>
              </>
            ) : null}
            {visibleSwitchError ? (
              <Text font="caption" color="fgMuted">
                {visibleSwitchError}
              </Text>
            ) : null}
          </VStack>
        </Banner>
      ) : null}
    </VStack>
  );
}
