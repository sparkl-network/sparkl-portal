import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
} from "viem";

function collectContractRevertLines(err: ContractFunctionRevertedError): string {
  const lines: string[] = [];
  const main = err.shortMessage || err.message;
  if (main) lines.push(main);
  if (err.reason && (!main || !main.includes(err.reason))) {
    lines.push(`Reason: ${err.reason}`);
  }
  const decoded = err.data as { errorName?: string } | undefined;
  if (decoded?.errorName) {
    lines.push(`Solidity error: ${decoded.errorName}`);
  }
  if (err.raw && err.raw !== "0x") {
    lines.push(`Revert data: ${err.raw}`);
  }
  if (err.metaMessages?.length) {
    lines.push(...err.metaMessages.filter(Boolean));
  }
  return lines.join("\n");
}

function enrichProviderRegistryMessage(message: string): string {
  if (message.includes("NotNodeOperator")) {
    return `${message}\n\nOnly the on-chain operator wallet can chill/update this node. Confirm the address shown under “Operator” on this page matches the account selected in your wallet.`;
  }
  if (message.includes("NodeNotRegistered")) {
    return `${message}\n\nThe registry did not find this node in the operator’s list — try refreshing the page or confirm the RPC matches your wallet chain.`;
  }
  if (message.includes("OpenSessionsRemain")) {
    return `${message}\n\nMark defunct is blocked until escrow open sessions for this node id reach zero. Chill first so no new sessions start, settle existing ledger rows, then try again once the dashboard shows zero open sessions.`;
  }
  if (message.includes("EscrowNotConfigured")) {
    return `${message}\n\nRegistry owner must call setSettlementEscrow on-chain so defunct transitions can verify session counts against the escrow contract address in your portal env (NEXT_PUBLIC_SETTLEMENT_ESCROW_*).`;
  }
  if (message.includes("InvalidLifecycle")) {
    return `${message}\n\nFollow the rundown order: Chill while Active → settle sessions → Mark defunct while Chilled. Owners may purge cleared defunct ids off-chain/on-chain separately.`;
  }
  if (
    (message.includes('"chillNode" reverted') ||
      message.includes('"markDefunct" reverted')) &&
    !message.includes("NotNodeOperator") &&
    !message.includes("NodeNotRegistered") &&
    !message.includes("Solidity error:") &&
    !message.includes("Revert data:")
  ) {
    return `${message}\n\nCommon causes: the selected wallet is not the on-chain operator, the wallet chain ID does not match this hub, or the RPC did not return a decoded revert reason.`;
  }
  return message;
}

/**
 * Human-friendly message for failed txs (wallet reject, ABI decode reverts, generic RPC errors).
 */
export function formatTxError(error: unknown): string {
  if (error instanceof UserRejectedRequestError) {
    return "Transaction was rejected or cancelled in your wallet.";
  }
  if (error instanceof BaseError) {
    const reverted = error.walk(
      (err) => err instanceof ContractFunctionRevertedError,
    );
    if (reverted instanceof ContractFunctionRevertedError) {
      return enrichProviderRegistryMessage(
        collectContractRevertLines(reverted),
      );
    }
    const base = error.shortMessage || error.message;
    return enrichProviderRegistryMessage(base);
  }
  if (error instanceof Error) {
    return enrichProviderRegistryMessage(error.message);
  }
  return "Transaction failed";
}
