import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
} from "viem";

import {
  RATE_TOO_STALE_SELECTOR,
  formatRateTooStaleHelp,
} from "@/lib/evm/rateOracle";
import { getActiveChainEnv } from "@/lib/chains";

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

function isRpcFetchFailure(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("fetch failed") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed")
  );
}

function enrichRpcFetchFailureMessage(message: string): string {
  return `${message}\n\nThis is a wallet JSON-RPC connection failure, not an on-chain revert. For local Anvil:\n1. MetaMask must use the **chain RPC** from NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB (e.g. http://192.168.10.199:8545), **not** the portal /api/rpc URL.\n2. The portal proxy is for app reads only; wallets broadcast directly to the node.\n3. Run Anvil with --host 0.0.0.0 if browsers on your LAN need :8545; keep RPC_PROXY_TARGET=http://127.0.0.1:8545 on the dev machine running Next.\n4. Use **Dev deposit/withdraw (Anvil)** on /user if the extension still cannot reach :8545.\n5. After restarting Anvil, redeploy and update NEXT_PUBLIC_* contract addresses.`;
}

function deepestErrorDetails(error: unknown): string | undefined {
  if (!(error instanceof BaseError)) {
    return error instanceof Error ? error.message : undefined;
  }
  let details = error.details;
  let cur: unknown = error.cause;
  while (cur) {
    if (cur instanceof BaseError) {
      if (cur.details) details = cur.details;
      cur = cur.cause;
      continue;
    }
    if (cur instanceof Error) {
      details = cur.message;
      break;
    }
    break;
  }
  return details;
}

function enrichInternalRpcMessage(message: string, details?: string): string {
  const lower = `${message} ${details ?? ""}`.toLowerCase();
  if (!lower.includes("internal error was received") && !lower.includes("-32603")) {
    return message;
  }
  const lines = [
    message,
    details && !message.includes(details) ? `Details: ${details}` : null,
  ].filter(Boolean) as string[];

  if (lower.includes("internal accounts cannot include data")) {
    lines.push(
      "MetaMask blocked this send: it treats the escrow address as one of your own accounts, but depositDot requires contract calldata. Remove that address from MetaMask if you imported it, redeploy to a fresh escrow, or try another wallet (Rabby, etc.).",
    );
  } else if (lower.includes("insufficient funds")) {
    lines.push(
      "Your wallet needs enough native ETH for the deposit amount plus gas (escrow balance does not pay gas).",
    );
  } else if (lower.includes("intrinsic gas too low")) {
    lines.push(
      "Gas limit was too low. Retry without editing fees in MetaMask, or raise the gas limit in the wallet UI.",
    );
  } else if (lower.includes("address not found")) {
    lines.push(
      "The wallet could not resolve the contract address on its RPC. Confirm SettlementEscrow in the open-session dialog matches contracts/deployments/local.json, then set SubWallet/MetaMask to the chain RPC from NEXT_PUBLIC_RPC_URL_* (e.g. http://127.0.0.1:8545), not localhost:3000 or /api/rpc.",
    );
  } else {
    lines.push(
      "MetaMask returned a generic internal JSON-RPC error (often Failed to fetch). Point MetaMask at the **chain node** RPC (NEXT_PUBLIC_RPC_URL_* / :8545), not the portal origin or /api/rpc. Fix wallet RPC in the toolbar registers the chain URL from .env.",
    );
  }
  return lines.join("\n\n");
}

function enrichInvalidParamsMessage(message: string, details?: string): string {
  const lower = `${message} ${details ?? ""}`.toLowerCase();
  if (
    !lower.includes("invalid parameters") &&
    !lower.includes("invalidparams") &&
    !lower.includes("-32602")
  ) {
    return message;
  }
  const lines = [
    message,
    details && !message.includes(details) ? `Details: ${details}` : null,
  ].filter(Boolean) as string[];

  if (
    lower.includes("https url") &&
    lower.includes("rpcurls")
  ) {
    lines.push(
      "MetaMask only allows http:// RPC in wallet_addEthereumChain for localhost / 127.0.0.1. For http://192.168.x.x:8545, add the network manually in MetaMask → Settings → Networks.",
    );
  } else if (lower.includes("blockexplorerurl")) {
    lines.push(
      "MetaMask rejected empty blockExplorerUrls. Delete network 31337 and re-add with your chain RPC (e.g. http://127.0.0.1:8545).",
    );
  } else if (lower.includes("external transactions to internal accounts")) {
    lines.push(
      "MetaMask will not send contract calldata to an address it treats as your own account. Remove that address from MetaMask if imported, or redeploy escrow.",
    );
  } else {
    lines.push(
      "MetaMask rejected the transaction shape. Confirm the network RPC is the chain node (:8545), not the portal /api/rpc.",
    );
  }
  return lines.join("\n\n");
}

function enrichOperatorRegistryMessage(message: string, details?: string): string {
  if (isRpcFetchFailure(message)) {
    return enrichRpcFetchFailureMessage(message);
  }
  if (
    message.toLowerCase().includes("invalid parameters") ||
    (details ?? "").toLowerCase().includes("-32602")
  ) {
    return enrichInvalidParamsMessage(message, details);
  }
  if (
    message.toLowerCase().includes("internal error was received") ||
    (details ?? "").toLowerCase().includes("-32603")
  ) {
    return enrichInternalRpcMessage(message, details);
  }
  if (
    message.toLowerCase().includes("timed out") ||
    message.toLowerCase().includes("timeout") ||
    (details ?? "").toLowerCase().includes("timeout")
  ) {
    return `${message}\n\nThe transaction was submitted but no receipt arrived in time. On local Anvil this usually means the wallet (SubWallet, MetaMask, etc.) is on a different RPC than the portal, or has a stale nonce.\n\n1. In SubWallet, open the EVM network for chain 31337 and set RPC to http://127.0.0.1:8545 (same as NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB), not the portal /api/rpc URL.\n2. Clear stuck pending transactions in the wallet, or reset Anvil: ./scripts/deploy-local-sync-env.sh --reset-chain --start-anvil\n3. Restart yarn dev after redeploy, use toolbar **Fix wallet RPC**, then register again.`;
  }
  if (message.includes("NodeAlreadyRegistered")) {
    return `${message}\n\nThis node id is already on the registry. Open the node page to manage it, or register a different peer id.`;
  }
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
  if (message.includes("session not open")) {
    return `${message}\n\nThe router could not find an open escrow session with this id. Confirm openSession succeeded, you are activating the correct session id, and sparkl-router [chain] escrow_contract matches the portal SettlementEscrow address.`;
  }
  if (
    message.includes("invalid signature") ||
    message.includes("signature must recover to session user")
  ) {
    return `${message}\n\nActivate must be signed by the same wallet that called openSession. Switch to that account in your wallet and retry.`;
  }
  if (
    message.includes("RateTooStale") ||
    message.includes(RATE_TOO_STALE_SELECTOR)
  ) {
    return `${message}\n\n${formatRateTooStaleHelp(getActiveChainEnv())}`;
  }
  if (message.includes("InvalidPrice") && message.includes("openSession")) {
    return `${message}\n\nModelPriceOracle has no default price and this model is not listed. Seed default pricing on deploy or list the model via sparkl-oracle-model-price.`;
  }
  if (
    (message.includes('"openSession" reverted') ||
      message.includes("openSession")) &&
    message.includes(RATE_TOO_STALE_SELECTOR)
  ) {
    return `openSession reverted: RateSetter rate is stale (${RATE_TOO_STALE_SELECTOR}).\n\n${formatRateTooStaleHelp(getActiveChainEnv())}`;
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
      return enrichOperatorRegistryMessage(
        collectContractRevertLines(reverted),
      );
    }
    const base = error.shortMessage || error.message;
    return enrichOperatorRegistryMessage(base, deepestErrorDetails(error));
  }
  if (error instanceof Error) {
    return enrichOperatorRegistryMessage(
      error.message,
      deepestErrorDetails(error),
    );
  }
  return "Transaction failed";
}
