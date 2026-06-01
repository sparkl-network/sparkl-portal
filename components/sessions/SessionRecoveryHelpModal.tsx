"use client";

import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@coinbase/cds-web/overlays";
import { Button } from "@coinbase/cds-web/buttons";
import { VStack } from "@coinbase/cds-web/layout";
import { Text } from "@coinbase/cds-web/typography";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function SessionRecoveryHelpModal({ visible, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      onClose={onClose}
      accessibilityLabel="Session recovery help"
    >
      <ModalHeader title="Lost vs compromised API keys" />
      <ModalBody paddingX={3} paddingY={2}>
        <VStack gap={2}>
          <Text font="label2">Lost key (same session)</Text>
          <Text font="body" color="fgMuted">
            If you only misplaced your API key and do not suspect theft, use
            “Show API key again” on an open session. The router re-issues the
            same credential when the session is still open on-chain.
          </Text>
          <Text font="label2">Compromised key</Text>
          <Text font="body" color="fgMuted">
            If someone else may have your key, do not re-activate the old
            session. Close or migrate: settle the old session on-chain, open a
            new session (new session id), then activate to receive a new API key.
            Until the old session is settled, the attacker can still call the
            router with the old key.
          </Text>
          <Text font="label2">Close session</Text>
          <Text font="body" color="fgMuted">
            One transaction: remits the remaining lock to provider escrow credit
            and your internal DOT balance. The session is marked settled; API
            keys for that session stop working.
          </Text>
          <Text font="label2">Migrate session</Text>
          <Text font="body" color="fgMuted">
            Two wallet transactions plus activate: settle the old session, open
            a new deposit on the same or another node, then activate the new
            session for a fresh key.
          </Text>
        </VStack>
      </ModalBody>
      <ModalFooter
        primaryAction={
          <Button onClick={onClose}>Got it</Button>
        }
      />
    </Modal>
  );
}
