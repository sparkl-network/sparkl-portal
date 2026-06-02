"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import type { WalletClient, PublicClient, Address } from "viem";
import { useAccount, useBalance, useChainId, usePublicClient, useReadContract, useWalletClient } from "wagmi";

import { settlementEscrowAbi } from "@/lib/abi";
import { ZERO_ADDRESS, chainRpcUrl, isLocalDevChainRpc, portalPublicRpcUrl } from "@/lib/chains";
import { internalToNative } from "@/lib/evm/dotUnits";
import { depositDot, withdrawDot } from "@/lib/evm/escrow";
import { formatTxError } from "@/lib/evm/formatTxError";
import { isWalletRpcTransportError } from "@/lib/evm/isWalletRpcTransportError";
import { probeInjectedWalletRpc } from "@/lib/evm/probeWalletRpc";
import { useHubChainConfig } from "@/lib/useHubChainConfig";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const FUND_TABS = [
  { id: "fund" as const, label: "Fund" },
  { id: "withdraw" as const, label: "Withdraw" },
];

function parseDotAmount(raw: string): bigint | null {
  const s = raw.trim();
  if (!s) return null;
  try { return parseUnits(s, 18); } catch { return null; }
}

function escrowWeiToWithdrawField(wei: bigint): string {
  let s = formatUnits(wei, 18);
  if (!s.includes(".")) return s;
  s = s.replace(/\.?0+$/, "");
  return s || "0";
}

export function UserFundPanel() {
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { hubConfig } = useHubChainConfig();

  const [activeTab, setActiveTab] = useState<(typeof FUND_TABS)[number]>(FUND_TABS[0]);
  const [depositAmt, setDepositAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  /** Set by Max so withdraw uses exact on-chain wei (no parseUnits round-trip). */
  const [withdrawWeiExact, setWithdrawWeiExact] = useState<bigint | null>(null);
  const [txBusy, setTxBusy] = useState(false);
  const [devAnvilBusy, setDevAnvilBusy] = useState(false);
  const [walletRpcProbe, setWalletRpcProbe] = useState<string | null>(null);
  const [walletRpcProbeOk, setWalletRpcProbeOk] = useState<boolean | null>(null);
  const [walletRpcProbing, setWalletRpcProbing] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [txNotice, setTxNotice] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const isDevStub = hubConfig?.chainEnv === "assethub-dev-stub";
  const localAnvilBackend = hubConfig ? isLocalDevChainRpc(hubConfig.rpcUrl) : false;

  const chainReady = Boolean(isConnected && hubConfig && chainId === hubConfig.chainId && address);
  const escrowUnset = useMemo(() => { if (!hubConfig?.settlementEscrowAddress) return true; return hubConfig.settlementEscrowAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase(); }, [hubConfig]);

  const { data: nativeBalance } = useBalance({ address, query: { enabled: Boolean(chainReady && address) } });

  const { data: balanceRaw, refetch: refetchBalance, isFetching: balanceLoading } = useReadContract({
    address: hubConfig?.settlementEscrowAddress,
    abi: settlementEscrowAbi,
    functionName: "getDotBalances",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(chainReady && hubConfig && address && !escrowUnset) },
  });

  const balanceDisplay = useMemo(() => { if (!chainReady || balanceRaw === undefined || balanceRaw === null || typeof balanceRaw !== "bigint") return "—"; return formatUnits(balanceRaw, 18); }, [balanceRaw, chainReady]);

  const depositParsed = useMemo(() => parseDotAmount(depositAmt), [depositAmt]);
  const withdrawParsed = useMemo(() => parseDotAmount(withdrawAmt), [withdrawAmt]);

  const formsDisabled = !chainReady || escrowUnset || txBusy || balanceLoading || !walletClient || !hubConfig;
  const isFundTab = activeTab.id === "fund";

  async function probeWalletRpc() {
    if (!hubConfig || !chainReady || escrowUnset) return;
    setWalletRpcProbing(true);
    setWalletRpcProbe(null);
    setWalletRpcProbeOk(null);
    try {
      const result = await probeInjectedWalletRpc(hubConfig.chainId, { escrowAddress: hubConfig.settlementEscrowAddress, expectedChainRpcUrl: chainRpcUrl(hubConfig) });
      if (result.ok) {
        setWalletRpcProbeOk(true);
        setWalletRpcProbe(`Wallet chain RPC OK (chain ${result.chainId}, escrow bytecode present). Sends go to ${chainRpcUrl(hubConfig)} only.`);
      } else {
        setWalletRpcProbeOk(false);
        setWalletRpcProbe(result.message);
      }
    } finally { setWalletRpcProbing(false); }
  }

  useEffect(() => {
    if (!chainReady || !hubConfig || escrowUnset) { setWalletRpcProbe(null); setWalletRpcProbeOk(null); return; }
    void probeWalletRpc();
  }, [chainReady, hubConfig?.chainId, hubConfig?.settlementEscrowAddress, hubConfig?.rpcUrl, escrowUnset]);

  async function postDevAnvilEscrow(action: "deposit" | "withdraw", amountInternal: bigint): Promise<Address> {
    if (!address || !publicClient) throw new Error("Wallet not connected");
    const res = await fetch("/api/dev/anvil-escrow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, address, amountInternal: amountInternal.toString() }) });
    const json = (await res.json()) as { hash?: Address; error?: string };
    if (!res.ok || !json.hash) throw new Error(json.error ?? `Dev ${action} failed (${res.status})`);
    const hash = json.hash;
    await waitForTransactionReceipt(publicClient, { hash });
    return hash;
  }

  async function finishEscrowTx(action: "deposit" | "withdraw", hash: Address, notice?: string) {
    setLastTxHash(hash);
    setTxError(null);
    setTxNotice(notice ?? null);
    await refetchBalance();
    await queryClient.invalidateQueries({ queryKey: ["balance"] });
    if (action === "deposit") setDepositAmt("");
    else { setWithdrawAmt(""); setWithdrawWeiExact(null); }
  }

  async function tryAnvilEscrowFallback(action: "deposit" | "withdraw", amountInternal: bigint, walletErr: unknown): Promise<boolean> {
    if (!isDevStub || !localAnvilBackend) return false;
    try {
      const hash = await postDevAnvilEscrow(action, amountInternal);
      await finishEscrowTx(action, hash, "MetaMask could not reach its RPC; completed via local Anvil (dev bypass).");
      return true;
    } catch (devErr) {
      setTxError(`${formatTxError(devErr)}\n\nWallet error:\n${formatTxError(walletErr)}`);
      return true;
    }
  }

  async function handleDevAnvilEscrow(action: "deposit" | "withdraw") {
    if (!hubConfig || !chainReady || !address || escrowUnset || !publicClient) return;
    const amount = action === "deposit" ? depositParsed : (withdrawWeiExact ?? withdrawParsed);
    if (amount === null || amount <= BigInt(0)) return;

    setDevAnvilBusy(true);
    setLastTxHash(null);
    setTxNotice(null);
    setTxError(null);
    try { const hash = await postDevAnvilEscrow(action, amount); await finishEscrowTx(action, hash); } catch (e) { setTxError(formatTxError(e)); } finally { setDevAnvilBusy(false); }
  }

  async function handleDeposit() {
    if (!walletClient || !hubConfig || !chainReady || escrowUnset || !publicClient || depositParsed === null || depositParsed <= BigInt(0)) return;
    setTxBusy(true);
    setLastTxHash(null);
    setTxNotice(null);
    setTxError(null);
    try {
      if (isDevStub) {
        const probe = await probeInjectedWalletRpc(hubConfig.chainId, { escrowAddress: hubConfig.settlementEscrowAddress, expectedChainRpcUrl: chainRpcUrl(hubConfig) });
        if (!probe.ok) { setTxError(`${probe.message}\n\nDeposit blocked until MetaMask uses the chain RPC from .env.`); if (localAnvilBackend) { const ok = await tryAnvilEscrowFallback("deposit", depositParsed, new Error(probe.message)); if (ok) return; } return; }
      }
      const valueWei = internalToNative(depositParsed, hubConfig.nativeCurrency.decimals);
      if (nativeBalance && nativeBalance.value < valueWei) { setTxError(`Wallet balance is too low for a ${depositAmt.trim()} DOT deposit. You need at least ${formatUnits(valueWei, hubConfig.nativeCurrency.decimals)} ${hubConfig.nativeCurrency.symbol} in the wallet (plus gas).`); return; }
      const hash = await depositDot(walletClient, publicClient, hubConfig.settlementEscrowAddress, depositParsed, hubConfig.nativeCurrency.decimals);
      await finishEscrowTx("deposit", hash);
    } catch (e) { if (isWalletRpcTransportError(e)) { const ok = await tryAnvilEscrowFallback("deposit", depositParsed, e); if (ok) return; } setTxError(formatTxError(e)); } finally { setTxBusy(false); }
  }

  async function handleWithdraw() {
    if (!walletClient || !hubConfig || !chainReady || escrowUnset || !publicClient || withdrawParsed === null || withdrawParsed <= BigInt(0)) return;
    setTxBusy(true);
    setLastTxHash(null);
    setTxNotice(null);
    setTxError(null);
    try {
      let amountInternal = withdrawWeiExact ?? withdrawParsed;
      if (balanceRaw !== undefined && balanceRaw !== null && typeof balanceRaw === "bigint" && amountInternal > balanceRaw) amountInternal = balanceRaw;

      if (isDevStub) { const probe = await probeInjectedWalletRpc(hubConfig.chainId, { escrowAddress: hubConfig.settlementEscrowAddress, expectedChainRpcUrl: chainRpcUrl(hubConfig) }); if (!probe.ok) { setTxError(`${probe.message}\n\nWithdraw blocked until MetaMask uses the chain RPC from .env.`); if (localAnvilBackend) { const ok = await tryAnvilEscrowFallback("withdraw", amountInternal, new Error(probe.message)); if (ok) return; } return; } }
      const hash = await withdrawDot(walletClient, publicClient, hubConfig.settlementEscrowAddress, amountInternal);
      await finishEscrowTx("withdraw", hash);
    } catch (e) { if (isWalletRpcTransportError(e)) { let amountInternal = withdrawWeiExact ?? withdrawParsed; if (balanceRaw !== undefined && balanceRaw !== null && typeof balanceRaw === "bigint" && amountInternal > balanceRaw) amountInternal = balanceRaw; const ok = await tryAnvilEscrowFallback("withdraw", amountInternal, e); if (ok) return; } setTxError(formatTxError(e)); } finally { setTxBusy(false); }
  }

  return (
    <Card className="w-full lg:w-80 xl:w-96 flex-shrink-0 h-fit sticky top-[calc(var(--header-height)+1rem)]">
      <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Escrow balance</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {/* Balance display */}
        <div><code className="font-mono">{balanceLoading ? "&hellip;" : balanceDisplay}</code><span className="text-sm text-muted-foreground ml-1">DOT</span></div>

        {/* Tabs */}
        <Tabs value={activeTab.id} onValueChange={(v) => { const tab = FUND_TABS.find(t => t.id === v); if (tab) setActiveTab(tab); }}>
          <TabsList className="w-full"><TabsTrigger value="fund" className="flex-1">Fund</TabsTrigger><TabsTrigger value="withdraw" className="flex-1">Withdraw</TabsTrigger></TabsList>
        </Tabs>

        <p className="text-xs text-muted-foreground">{isFundTab ? "Deposit whole DOT via payable depositDot." : "Withdraw internal balance to native DOT."}</p>

        {/* Deposit input */}
        {isFundTab && (
          <div className="space-y-1">
            <Label htmlFor="depositAmt">Amount</Label>
            <div className="relative"><Input id="depositAmt" placeholder="0.0" value={depositAmt} onChange={(e) => setDepositAmt(e.target.value)} disabled={formsDisabled} className="pr-12" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">DOT</span></div>
          </div>
        )}

        {/* Withdraw input */}
        {!isFundTab && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="withdrawAmt">Amount</Label>
              <Button variant="secondary" size="compact" disabled={!chainReady || escrowUnset || txBusy || devAnvilBusy || balanceRaw === undefined || balanceRaw === null || typeof balanceRaw !== "bigint" || balanceRaw <= BigInt(0)} onClick={() => { if (balanceRaw !== undefined && balanceRaw !== null && typeof balanceRaw === "bigint" && balanceRaw > 0n) { setWithdrawWeiExact(balanceRaw); setWithdrawAmt(escrowWeiToWithdrawField(balanceRaw)); } }}>Max</Button>
            </div>
            <div className="relative"><Input id="withdrawAmt" placeholder="0.0" value={withdrawAmt} onChange={(e) => { setWithdrawWeiExact(null); setWithdrawAmt(e.target.value); }} disabled={formsDisabled} className="pr-12" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">DOT</span></div>
          </div>
        )}

        {/* Submit button */}
        <Button variant="default" className="w-full" disabled={formsDisabled || devAnvilBusy || txBusy || (isFundTab ? depositParsed === null || depositParsed <= BigInt(0) : withdrawParsed === null || withdrawParsed <= BigInt(0))} onClick={() => void (isFundTab ? handleDeposit() : handleWithdraw())}>
          {txBusy ? "Processing..." : isFundTab ? "Deposit DOT" : "Withdraw DOT"}
        </Button>

        {/* RPC probe */}
        {chainReady && !escrowUnset && hubConfig && (<>
          {walletRpcProbeOk === false && (<Alert variant="destructive"><AlertDescription className="whitespace-pre-wrap">{walletRpcProbe}</AlertDescription></Alert>)}
          <Button variant="outline" className="w-full" onClick={() => void probeWalletRpc()}>{walletRpcProbing ? "Testing..." : "Test MetaMask chain RPC"}</Button>
          {walletRpcProbe && walletRpcProbeOk !== false && (<p className="text-xs text-muted-foreground whitespace-pre-wrap">{walletRpcProbe}</p>)}
        </>)}

        {/* Dev Anvil */}
        {isDevStub && localAnvilBackend && chainReady && !escrowUnset && (<>
          <Button variant="outline" className="w-full" onClick={() => void handleDevAnvilEscrow(isFundTab ? "deposit" : "withdraw")}>{devAnvilBusy ? (isFundTab ? "Depositing..." : "Withdrawing...") : (isFundTab ? "Dev deposit (Anvil, no MetaMask RPC)" : "Dev withdraw (Anvil, no MetaMask RPC)")}</Button>
          <p className="text-xs text-muted-foreground">Dev deposit impersonates your connected address on local Anvil via the server RPC_PROXY_TARGET. Use when MetaMask shows Failed to fetch and the Next terminal never logs eth_sendTransaction.</p>
        </>)}

        {/* Last tx */}
        {lastTxHash && (<div><span className="text-xs text-muted-foreground">Last transaction</span><br /><code className="break-all text-xs">{lastTxHash}</code></div>)}

        {/* Tx notice */}
        {txNotice && (<Alert variant="default" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"><AlertTitle>Notice</AlertTitle><AlertDescription>{txNotice}</AlertDescription></Alert>)}

        {/* MetaMask RPC hint */}
        {hubConfig?.chainEnv === "assethub-dev-stub" && chainReady && !escrowUnset && (
          <p className="text-xs text-muted-foreground">MetaMask must use chain RPC <code>{chainRpcUrl(hubConfig)}</code>. Portal reads use <code>{typeof window !== "undefined" ? portalPublicRpcUrl(hubConfig, window.location.origin) : "&hellip;/api/rpc"}</code> (not for wallet sends). Toolbar &rarr; Fix wallet RPC registers <code>{chainRpcUrl(hubConfig)}</code>. Ignore proxy logs where <code>symbol()</code>/<code>balanceOf</code> revert on the escrow.</p>
        )}

        {/* Tx error */}
        {txError && (<Alert variant="destructive"><AlertTitle>Transaction error</AlertTitle><AlertDescription className="whitespace-pre-wrap">{txError}</AlertDescription></Alert>)}
      </CardContent>
    </Card>
  );
}
