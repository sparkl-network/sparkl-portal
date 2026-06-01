"use client";

import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@coinbase/cds-web/overlays";
import { Button } from "@coinbase/cds-web/buttons";
import { TextInput } from "@coinbase/cds-web/controls";
import { VStack } from "@coinbase/cds-web/layout";
import { Text } from "@coinbase/cds-web/typography";
import { useState } from "react";

type Props = {
  visible: boolean;
  onClose: () => void;
  apiKey: string;
  sessionId: string;
  title?: string;
  description?: string;
};

export function ApiKeyRevealModal({
  visible,
  onClose,
  apiKey,
  sessionId,
  title = "API key",
  description = "Copy this key now. It is not stored in the portal and cannot be shown again unless you run “Show API key again” on an open session.",
}: Props) {
  const [copied, setCopied] = useState(false);

  return (
    <Modal visible={visible} onClose={onClose} accessibilityLabel={title}>
      <ModalHeader title={title} />
      <ModalBody paddingX={3} paddingY={2}>
        <VStack gap={2}>
          <Text font="body">{description}</Text>
          <Text font="caption" color="fgMuted">
            Session {sessionId}
          </Text>
          <TextInput value={apiKey} readOnly />
          <Text font="caption" color="fgMuted">
            Use as OpenAI SDK apiKey with base URL set to your Sparkl router URL.
          </Text>
        </VStack>
      </ModalBody>
      <ModalFooter
        primaryAction={
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(apiKey);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy key"}
          </Button>
        }
        secondaryAction={
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        }
      />
    </Modal>
  );
}
