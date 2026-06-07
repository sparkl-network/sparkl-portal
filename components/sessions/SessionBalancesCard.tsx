"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address, PublicClient } from "viem";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  loadSessionPricingFallback,
  readTeePriceMultiplierBps,
} from "@/lib/evm/escrow";
import {
  formatMoneyLine,
  remainingInLock,
  sessionPricing,
  tokenCostAtOpenRates,
  type SessionPricingRates,
} from "@/lib/session/pricing";
import type { EscrowSession } from "@/lib/types";

type SessionBalancesCardProps = {
  session: EscrowSession;
  publicClient: PublicClient;
  escrowAddress: Address;
  modelOracleAddress: Address;
  dotSymbol?: string;
};

type BalanceRow = {
  label: string;
  dotInternal: bigint;
  tokens?: string;
  secondary?: string;
};

export function SessionBalancesCard({
  session,
  publicClient,
  escrowAddress,
  modelOracleAddress,
  dotSymbol = "DOT",
}: SessionBalancesCardProps) {
  const { data: pricing, isFetching } = useQuery({
    queryKey: [
      "sessionPricing",
      escrowAddress,
      modelOracleAddress,
      session.modelId,
      session.inputPricePer1kAtOpen.toString(),
      session.usdcPerDotAtOpen.toString(),
    ],
    queryFn: async (): Promise<SessionPricingRates> => {
      const snap = sessionPricing(session);
      if (snap) return snap;
      return loadSessionPricingFallback(
        publicClient,
        escrowAddress,
        modelOracleAddress,
        session,
      );
    },
    enabled: Boolean(publicClient && escrowAddress && modelOracleAddress),
  });

  const { data: teeBps = 15_000n } = useQuery({
    queryKey: ["teePriceMultiplierBps", escrowAddress],
    queryFn: () => readTeePriceMultiplierBps(publicClient, escrowAddress),
    enabled: Boolean(publicClient && escrowAddress),
  });

  if (isFetching || !pricing) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">Balances</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-muted-foreground">Loading rates…</CardContent>
      </Card>
    );
  }

  const tokenAtOpen = tokenCostAtOpenRates(
    session.inputTokensRecorded,
    session.outputTokensRecorded,
    pricing,
    session.tier,
    teeBps,
  );
  const usageTokens =
    session.inputTokensRecorded > 0n || session.outputTokensRecorded > 0n
      ? `${session.inputTokensRecorded.toString()} in / ${session.outputTokensRecorded.toString()} out`
      : undefined;
  const usageSecondary =
    session.outputTokensRecorded > 0n || session.inputTokensRecorded > 0n
      ? `at open rates ≈ ${formatMoneyLine(tokenAtOpen, pricing.usdcPerDot, { dotSymbol }).dot}`
      : undefined;

  const rows: BalanceRow[] = [
    { label: "Locked", dotInternal: session.lockedInternal },
    {
      label: "Usage",
      dotInternal: session.usageRecorded,
      tokens: usageTokens,
      secondary: usageSecondary,
    },
    { label: "Paid provider", dotInternal: session.paidToProviderInternal },
    { label: "Remaining in lock", dotInternal: remainingInLock(session) },
  ];

  return (
    <Card className="sm:col-span-2">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">Balances</CardTitle>
        <div className="flex flex-wrap gap-1 justify-end">
          {pricing.legacy && (
            <Badge variant="outline" className="text-[10px]">
              Live rates (legacy session)
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px]">
            USD @ {pricing.legacy ? "live" : "open"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono tabular-nums">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-1 pr-3 font-medium"> </th>
                <th className="py-1 pr-3 font-medium">DOT (on-chain)</th>
                <th className="py-1 pr-3 font-medium">Tokens</th>
                <th className="py-1 font-medium">USD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const line = formatMoneyLine(row.dotInternal, pricing.usdcPerDot, {
                  dotSymbol,
                  tokens: row.tokens,
                });
                return (
                  <tr key={row.label} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-3 text-foreground font-sans font-medium">{row.label}</td>
                    <td className="py-2 pr-3">{line.dot}</td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {row.tokens ?? "—"}
                      {row.secondary ? (
                        <span className="block text-[11px] mt-0.5">{row.secondary}</span>
                      ) : null}
                    </td>
                    <td className="py-2">{line.usd}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3 font-sans">
          Usage DOT is on-chain <code className="text-xs">usageRecorded</code>. USD uses{" "}
          {pricing.legacy ? "current" : "snapshotted"} FX from{" "}
          <code className="text-xs">getUsdcPerDot</code>.
        </p>
      </CardContent>
    </Card>
  );
}
