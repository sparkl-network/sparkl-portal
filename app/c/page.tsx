"use client";

import { Box, VStack } from "@coinbase/cds-web/layout";
import { Link, Text } from "@coinbase/cds-web/typography";
import NextLink from "next/link";

export default function ConsumerHome() {
  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={2}>
        <Link as={NextLink} href="/" font="body" underline={false}>
          ← Home
        </Link>
        <Text font="title2">Consumer</Text>
        <Text font="body" color="fgMuted">
          Escrow helpers live in lib/evm/escrow.ts; registry reads in
          lib/evm/registry.ts.
        </Text>
        <Link as={NextLink} href="/c/fund" font="body" underline={false}>
          Fund escrow balance →
        </Link>
      </VStack>
    </Box>
  );
}
