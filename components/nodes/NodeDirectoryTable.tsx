"use client";

import type { MouseEvent } from "react";

import { Box, HStack, VStack } from "@coinbase/cds-web/layout";
import { Link, Text } from "@coinbase/cds-web/typography";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@coinbase/cds-web/tables";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { getAddress, type Hex } from "viem";

import { ZERO_ADDRESS } from "@/lib/chains";
import type { RegisteredNodeWithOperator } from "@/lib/evm/registry";
import { shortAddress, shortNodeId } from "@/lib/formatAddress";
import { nodeListDetailHref } from "@/lib/nodeListRow";

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

function StatusDot({
  registered,
  active,
}: {
  registered: boolean;
  active: boolean;
}) {
  const color = !registered ? "#9ca3af" : active ? "#16a34a" : "#dc2626";
  return (
    <Box
      title={!registered ? "Waiting" : active ? "Active" : "Inactive"}
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
    <Table
      bordered
      compact
      tableLayout="fixed"
      maxHeight="min(70vh, 720px)"
      style={{ width: "100%" }}
    >
      <TableHeader sticky>
        <TableRow>
          <TableCell
            as="th"
            scope="col"
            title="Node"
            width={opCol ? "26%" : "32%"}
            dangerouslySetHtmlWidth={opCol ? "26%" : "32%"}
          />
          {opCol ? (
            <TableCell
              as="th"
              scope="col"
              title="Operator"
              width="18%"
              dangerouslySetHtmlWidth="18%"
            />
          ) : null}
          <TableCell
            as="th"
            scope="col"
            title="Status"
            width={opCol ? "12%" : "14%"}
            dangerouslySetHtmlWidth={opCol ? "12%" : "14%"}
          />
          <TableCell
            as="th"
            scope="col"
            title="Fee"
            justifyContent="flex-end"
            width={opCol ? "10%" : "12%"}
            dangerouslySetHtmlWidth={opCol ? "10%" : "12%"}
          />
          <TableCell
            as="th"
            scope="col"
            title="Payout"
            justifyContent="flex-end"
            width={opCol ? "14%" : "18%"}
            dangerouslySetHtmlWidth={opCol ? "14%" : "18%"}
          />
          <TableCell
            as="th"
            scope="col"
            title="TEE / BE"
            justifyContent="flex-end"
            width={opCol ? "12%" : "14%"}
            dangerouslySetHtmlWidth={opCol ? "12%" : "14%"}
          />
          <TableCell
            as="th"
            scope="col"
            title="Open"
            justifyContent="flex-end"
            width={opCol ? "8%" : "10%"}
            dangerouslySetHtmlWidth={opCol ? "8%" : "10%"}
          />
        </TableRow>
      </TableHeader>
      <TableBody>
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
            : info.active
              ? "Active"
              : "Inactive";
          const capsLabel = `${info.supportsTEE ? "TEE" : "—"} · ${
            info.supportsBestEffort ? "BE" : "—"
          }`;

          return (
            <TableRow
              key={nodeId}
              onClick={() => router.push(rowHref)}
              style={{ cursor: "pointer" }}
            >
              <TableCell>
                <HStack gap={2} alignItems="center">
                  <NodeIdenticon nodeId={nodeId} />
                  <StatusDot registered={registered} active={info.active} />
                  <VStack gap={0} alignItems="flex-start">
                    <Text
                      font="body"
                      mono
                      tabularNumbers
                      style={{ wordBreak: "break-all" }}
                    >
                      {displayNodeLabel}
                    </Text>
                  </VStack>
                </HStack>
              </TableCell>
              {showOperatorColumn ? (
                <TableCell>
                  <Link
                    as={NextLink}
                    href={`/operator/${op}/node`}
                    font="body"
                    mono
                    tabularNumbers
                    underline
                    onClick={(e: MouseEvent) => e.stopPropagation()}
                  >
                    {shortAddress(op)}
                  </Link>
                </TableCell>
              ) : null}
              <TableCell>
                <Text font="body">{statusTitle}</Text>
              </TableCell>
              <TableCell justifyContent="flex-end">
                <Text font="body" mono tabularNumbers>
                  {feeLabel}
                </Text>
              </TableCell>
              <TableCell justifyContent="flex-end">
                <Text font="body" mono tabularNumbers>
                  {payoutLabel}
                </Text>
              </TableCell>
              <TableCell justifyContent="flex-end">
                <Text font="caption" color="fgMuted" mono tabularNumbers>
                  {capsLabel}
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
