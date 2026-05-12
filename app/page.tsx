"use client";

import { Box, HStack, VStack } from "@coinbase/cds-web/layout";
import { Link, Text } from "@coinbase/cds-web/typography";
import NextLink from "next/link";

export default function Home() {
  return (
    <Box paddingX={3} paddingY={3}>
      <VStack gap={2}>
        <Text font="title2">Sparkl Portal</Text>
        <Text font="body" color="fgMuted">
          Hub EVM portal — connect your wallet from the toolbar.
        </Text>
        <HStack gap={3}>
          <Link as={NextLink} href="/p" font="body" underline={false}>
            Provider (/p)
          </Link>
          <Link as={NextLink} href="/c" font="body" underline={false}>
            Consumer (/c)
          </Link>
        </HStack>
      </VStack>
    </Box>
  );
}
