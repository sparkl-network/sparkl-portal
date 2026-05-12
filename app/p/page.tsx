"use client";

import { Box, VStack } from "@coinbase/cds-web/layout";
import { Link, Text } from "@coinbase/cds-web/typography";
import NextLink from "next/link";

export default function ProviderHome() {
  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={2}>
        <Link as={NextLink} href="/" font="body" underline={false}>
          ← Home
        </Link>
        <Text font="title2">Provider</Text>
        <Text font="body" color="fgMuted">
          Use lib/evm/registry.ts and lib/evm/escrow.ts from client components
          with wagmi&apos;s public and wallet clients.
        </Text>
      </VStack>
    </Box>
  );
}
