"use client";

import { Box, HStack } from "@coinbase/cds-web/layout";
import { Text } from "@coinbase/cds-web/typography";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@coinbase/cds-web/tables";
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
    <Box
      flexShrink={0}
      width={10}
      height={10}
      style={{
        borderRadius: 8,
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
    <Box
      title={title}
      width={6}
      height={6}
      style={{
        borderRadius: 9999,
        backgroundColor: color,
        flexShrink: 0,
      }}
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
    <Table
      bordered
      compact
      tableLayout="fixed"
      maxHeight="min(70vh, 720px)"
      style={{ width: "100%" }}
    >
      <TableHeader sticky>
        <TableRow>
          <TableCell as="th" scope="col" title="Operator" width="34%" />
          <TableCell as="th" scope="col" title="Status" width="14%" />
          <TableCell
            as="th"
            scope="col"
            title="Nodes"
            justifyContent="flex-end"
            width="12%"
          />
          <TableCell
            as="th"
            scope="col"
            title="Active"
            justifyContent="flex-end"
            width="14%"
          />
          <TableCell
            as="th"
            scope="col"
            title="TEE"
            justifyContent="flex-end"
            width="14%"
          />
          <TableCell
            as="th"
            scope="col"
            title="Open"
            justifyContent="flex-end"
            width="12%"
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const op = getAddress(row.operator);
          const statusTitle =
            row.nodeCount === 0
              ? "Waiting"
              : row.activeRegisteredNodeCount > 0
                ? "Active"
                : "Inactive";

          return (
            <TableRow
              key={op}
              onClick={() => router.push(`/operator/${op}`)}
              style={{ cursor: "pointer" }}
            >
              <TableCell>
                <HStack gap={2} alignItems="center">
                  <OperatorIdenticon address={op} />
                  <OperatorStatusDot
                    nodeCount={row.nodeCount}
                    activeRegisteredNodeCount={row.activeRegisteredNodeCount}
                  />
                  <Text
                    font="body"
                    mono
                    tabularNumbers
                    style={{ wordBreak: "break-all" }}
                  >
                    {op}
                  </Text>
                </HStack>
              </TableCell>
              <TableCell>
                <Text font="body">{statusTitle}</Text>
              </TableCell>
              <TableCell justifyContent="flex-end">
                <Text font="body" mono tabularNumbers>
                  {row.nodeCount}
                </Text>
              </TableCell>
              <TableCell justifyContent="flex-end">
                <Text font="body" mono tabularNumbers>
                  {row.activeRegisteredNodeCount}
                </Text>
              </TableCell>
              <TableCell justifyContent="flex-end">
                <Text font="body" mono tabularNumbers>
                  {row.teeCapableNodeCount}
                </Text>
              </TableCell>
              <TableCell justifyContent="flex-end">
                <Text font="label2" color="fgMuted">
                  →
                </Text>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
