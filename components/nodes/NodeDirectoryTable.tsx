"use client";

import type { MouseEvent } from "react";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { getAddress, type Hex } from "viem";

import { ZERO_ADDRESS } from "@/lib/chains";
import type { RegisteredNodeWithOperator } from "@/lib/evm/registry";
import { shortAddress, shortNodeId } from "@/lib/formatAddress";
import { nodeListDetailHref } from "@/lib/nodeListRow";
import { NodeLifecycle } from "@/lib/types";

function hueFromHex(hex: string): number {
  let h = 0;
  const clean = hex.replace(/^0x/i, "");
  for (let i = 0; i < clean.length; i += 1) {
    h = (h * 31 + clean.charCodeAt(i)) % 360;
  }
  return h;
}

function NodeIdenticon({ nodeId }: { nodeId: Hex }) {
  const h = hueFromHex(nodeId);
  const h2 = (h + 47) % 360;
  return (
    <div
      className="flex-shrink-0 w-[10px] h-[10px] rounded-lg"
      style={{
        background: `linear-gradient(135deg, hsl(${h}, 62%, 42%), hsl(${h2}, 58%, 32%))`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
      }}
    />
  );
}

function StatusDot({
  registered,
  active,
  lifecycle,
}: {
  registered: boolean;
  active: boolean;
  lifecycle: NodeLifecycle | null;
}) {
  let color = "#9ca3af";
  let title = "Waiting";
  if (registered && lifecycle !== null) {
    if (lifecycle === NodeLifecycle.Defunct) {
      color = "#64748b";
      title = "Defunct";
    } else if (lifecycle === NodeLifecycle.Chilled) {
      color = "#d97706";
      title = "Chilled";
    } else {
      color = active ? "#16a34a" : "#dc2626";
      title = active ? "Active" : "Inactive";
    }
  }
  return (
    <div
      className="flex-shrink-0 w-[6px] h-[6px] rounded-full"
      style={{ backgroundColor: color }}
      title={title}
    />
  );
}

export type NodeDirectoryTableRow = RegisteredNodeWithOperator & {
  nodeIdString?: string | null;
};

export type NodeDirectoryTableProps = {
  rows: NodeDirectoryTableRow[];
  /** When true, show "—" if peer id is unknown instead of shortened hex. */
  peerIdOnlyDisplay?: boolean;
  /** When true, show operator column with link to `/operator/.../node`. */
  showOperatorColumn?: boolean;
};

export function NodeDirectoryTable({
  rows,
  peerIdOnlyDisplay = false,
  showOperatorColumn = true,
}: NodeDirectoryTableProps) {
  const router = useRouter();

  const opCol = showOperatorColumn;

  return (
    <div className="relative w-full overflow-auto rounded-lg border">
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b sticky top-0 bg-background">
          <tr>
            <th
              className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
              style={{ width: opCol ? "26%" : "32%" }}
            >
              Node
            </th>
            {opCol ? (
              <th
                className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
                style={{ width: "18%" }}
              >
                Operator
              </th>
            ) : null}
            <th
              className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
              style={{ width: opCol ? "12%" : "14%" }}
            >
              Status
            </th>
            <th
              className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
              style={{ width: opCol ? "10%" : "12%" }}
            >
              Fee
            </th>
            <th
              className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
              style={{ width: opCol ? "14%" : "18%" }}
            >
              Payout
            </th>
            <th
              className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
              style={{ width: opCol ? "12%" : "14%" }}
            >
              TEE / BE
            </th>
            <th
              className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
              style={{ width: opCol ? "8%" : "10%" }}
            >
              Open
            </th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {rows.map((row) => {
            const { nodeId, info, operator } = row;
            const nodeIdString = row.nodeIdString ?? null;
            const displayNodeLabel =
              nodeIdString ??
              (peerIdOnlyDisplay ? "—" : shortNodeId(nodeId));
            const rowHref = nodeListDetailHref(row);
            const registered =
              info.payout.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
            const op = getAddress(operator);
            const feeLabel = registered
              ? `${(info.feeBps / 100).toFixed(2)}%`
              : "—";
            const payoutLabel = registered
              ? shortAddress(info.payout)
              : "—";
            const statusTitle = !registered
              ? "Waiting"
              : info.lifecycle === NodeLifecycle.Defunct
                ? "Defunct"
                : info.lifecycle === NodeLifecycle.Chilled
                  ? "Chilled"
                  : info.active
                    ? "Active"
                    : "Inactive";
            const capsLabel = `${info.supportsTEE ? "TEE" : "—"} · ${
              info.supportsBestEffort ? "BE" : "—"
            }`;

            return (
              <tr
                key={nodeId}
                onClick={() => router.push(rowHref)}
                className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted cursor-pointer"
              >
                <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                  <div className="flex items-center gap-2">
                    <NodeIdenticon nodeId={nodeId} />
                    <StatusDot
                      registered={registered}
                      active={info.active}
                      lifecycle={registered ? info.lifecycle : null}
                    />
                    <span className="text-sm tabular-nums font-mono break-all">
                      {displayNodeLabel}
                    </span>
                  </div>
                </td>
                {showOperatorColumn ? (
                  <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                    <NextLink
                      href={`/operator/${op}/node`}
                      className="text-sm tabular-nums font-mono underline underline-offset-4 hover:text-accent transition-colors"
                      onClick={(e: MouseEvent) => e.stopPropagation()}
                    >
                      {shortAddress(op)}
                    </NextLink>
                  </td>
                ) : null}
                <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                  <span className="text-sm">{statusTitle}</span>
                </td>
                <td className="p-4 text-right align-middle [&:has([role=checkbox])]:pr-0">
                  <span className="text-sm tabular-nums font-mono">{feeLabel}</span>
                </td>
                <td className="p-4 text-right align-middle [&:has([role=checkbox])]:pr-0">
                  <span className="text-sm tabular-nums font-mono">{payoutLabel}</span>
                </td>
                <td className="p-4 text-right align-middle [&:has([role=checkbox])]:pr-0">
                  <span className="text-xs tabular-nums font-mono text-muted-foreground">{capsLabel}</span>
                </td>
                <td className="p-4 text-right align-middle [&:has([role=checkbox])]:pr-0">
                  <span className="text-xs text-muted-foreground">→</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
