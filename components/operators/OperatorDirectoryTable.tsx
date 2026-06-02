"use client";

import { useRouter } from "next/navigation";
import { getAddress, type Address } from "viem";

import type { OperatorDirectoryEntry } from "@/lib/types";

function hueFromHex(hex: string): number {
  let h = 0;
  const clean = hex.replace(/^0x/i, "");
  for (let i = 0; i < clean.length; i += 1) {
    h = (h * 31 + clean.charCodeAt(i)) % 360;
  }
  return h;
}

function OperatorIdenticon({ address }: { address: Address }) {
  const h = hueFromHex(address);
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

function OperatorStatusDot({
  nodeCount,
  activeRegisteredNodeCount,
}: {
  nodeCount: number;
  activeRegisteredNodeCount: number;
}) {
  const color =
    nodeCount === 0
      ? "#9ca3af"
      : activeRegisteredNodeCount > 0
        ? "#16a34a"
        : "#dc2626";
  const title =
    nodeCount === 0
      ? "No nodes"
      : activeRegisteredNodeCount > 0
        ? "Has active listed nodes"
        : "No active listed nodes";
  return (
    <div
      className="flex-shrink-0 w-[6px] h-[6px] rounded-full"
      style={{ backgroundColor: color }}
      title={title}
    />
  );
}

export type OperatorDirectoryTableProps = {
  rows: OperatorDirectoryEntry[];
};

/**
 * Polkadot-style directory table — same shell as {@link NodeDirectoryTable}
 * (bordered, compact, sticky header, row → operator detail).
 */
export function OperatorDirectoryTable({ rows }: OperatorDirectoryTableProps) {
  const router = useRouter();

  return (
    <div className="relative w-full overflow-auto rounded-lg border">
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b sticky top-0 bg-background">
          <tr>
            <th
              className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
              style={{ width: "34%" }}
            >
              Operator
            </th>
            <th
              className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
              style={{ width: "14%" }}
            >
              Status
            </th>
            <th
              className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
              style={{ width: "12%" }}
            >
              Nodes
            </th>
            <th
              className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
              style={{ width: "14%" }}
            >
              Active
            </th>
            <th
              className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
              style={{ width: "14%" }}
            >
              TEE
            </th>
            <th
              className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"
              style={{ width: "12%" }}
            >
              Open
            </th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {rows.map((row) => {
            const op = getAddress(row.operator);
            const statusTitle =
              row.nodeCount === 0
                ? "Waiting"
                : row.activeRegisteredNodeCount > 0
                  ? "Active"
                  : "Inactive";

            return (
              <tr
                key={op}
                onClick={() => router.push(`/operator/${op}`)}
                className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted cursor-pointer"
              >
                <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                  <div className="flex items-center gap-2">
                    <OperatorIdenticon address={op} />
                    <OperatorStatusDot
                      nodeCount={row.nodeCount}
                      activeRegisteredNodeCount={row.activeRegisteredNodeCount}
                    />
                    <span className="text-sm tabular-nums font-mono break-all">
                      {op}
                    </span>
                  </div>
                </td>
                <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                  <span className="text-sm">{statusTitle}</span>
                </td>
                <td className="p-4 text-right align-middle [&:has([role=checkbox])]:pr-0">
                  <span className="text-sm tabular-nums font-mono">
                    {row.nodeCount}
                  </span>
                </td>
                <td className="p-4 text-right align-middle [&:has([role=checkbox])]:pr-0">
                  <span className="text-sm tabular-nums font-mono">
                    {row.activeRegisteredNodeCount}
                  </span>
                </td>
                <td className="p-4 text-right align-middle [&:has([role=checkbox])]:pr-0">
                  <span className="text-sm tabular-nums font-mono">
                    {row.teeCapableNodeCount}
                  </span>
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
