# Sparkl Portal

Standalone Next.js app for Hub EVM **node operator** (`/node`), **provider directory** (`/provider`), and **consumer** (`/c`) flows. On-chain contracts and Foundry tooling live in the sibling repo **`sparkl-solo`** (default path `~/sparkl-solo`).

Registry **`nodeId`** values are **`bytes32`** on chain (e.g. Substrate **PeerId** hash). The UI accepts full 32-byte hex or a 20-byte EVM address (padded to `bytes32` for local dev); see **`lib/nodeId.ts`**.

## Prerequisites

- Node.js **20.19+** or **22.13+** (recommended; Yarn may warn on older minors).
- Yarn **1.x**.
- Foundry **`forge`** on `PATH` if you run ABI sync.

## Setup

```bash
yarn install
cp .env.example .env.local
```

Edit `.env.local`: set **`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`** ([WalletConnect Cloud](https://cloud.walletconnect.com/)), **`NEXT_PUBLIC_CHAIN_ENV`**, and the **`NEXT_PUBLIC_*`** RPC / contract addresses for that profile (see comments in `.env.example`). Local Anvil defaults assume **`31337`** and **`http://127.0.0.1:8545`** when RPC / chain id are omitted for **`assethub-dev-stub`**.

Restart **`yarn dev`** after changing any **`NEXT_PUBLIC_*`** variable so Next.js rebuilds the client bundle with the new values.

### Developer wallets & RPC (`assethub-dev-stub`)

The portal cannot choose accounts inside MetaMask, Coinbase Wallet, etc.—configure those wallets yourself:

1. **Run Anvil** (or compatible node) on the machine that listens on **`8545`** (or your chosen port). Anvil does not advertise a “token ticker” or decimals to your wallet—MetaMask uses the network entry from **Switch network** (from **`NEXT_PUBLIC_NATIVE_*`** in the app) or whatever you added manually.
2. **RPC URL must match where the browser runs.** Reads (`wagmi` / viem) use **`NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB`**. Sends use whatever RPC the wallet uses for **chain ID `31337`**. If you open the site as **`http://192.168.x.x:3000`** from **another device**, **`http://127.0.0.1:8545` resolves on that device**, not your dev PC—set both the wallet’s custom network RPC and **`NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB`** to **`http://<your-dev-machine-LAN-IP>:8545`** (and allow it through the firewall). Run **`anvil --host 0.0.0.0`** if peers off-machine must reach it.
3. **Funded dev accounts:** import Foundry’s default Anvil mnemonic (**`test test test test test test test test test test test junk`**) or a dev private key Anvil prints at startup. **Never use these keys outside local development.**

Use **Switch network** in the toolbar until the wallet is on **`31337`** with that RPC; then connect—the active address should be an Anvil-funded account.

If **viem** reports **`Failed to fetch`** or **`withdrawDot` reverted with reason: Failed to fetch**, that is a **browser JSON-RPC HTTP failure**, not an on-chain revert. Enable the **same-origin proxy** (`NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY=1` and `RPC_PROXY_TARGET` in **`.env.example`**) so simulations and **`waitForTransactionReceipt`** use **`/api/rpc`**. The proxy adds **Private Network Access** CORS headers so **MetaMask’s extension** can `fetch` a LAN dev URL; without that, the tab may work while **`eth_sendTransaction`** still fails. Optionally set MetaMask’s network RPC to **`http://<dev-host>:3000/api/rpc`** if the extension cannot reach **`…:8545`**. With **`NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY`**, **`hubChainFromConfig`** advertises **`…/api/rpc`** as the default RPC so **Switch network** updates MetaMask to the proxy—**remove** any old **31337** entry that still points only at raw **`:8545`** if submits keep failing with **Failed to fetch**. **Dev tip:** if Next **`[rpc-proxy]`** logs show **`eth_call`** but never **`eth_sendRawTransaction`** after you confirm in MetaMask, the extension is still broadcasting to a **saved** RPC (often **`:8545`**) rather than **`…/api/rpc`**—edit or delete that network entry so the saved RPC matches your portal (**`http(s)://<host>:3000/api/rpc`**).

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

## App routes

| Path | Purpose |
|------|---------|
| **`/`** | Home links |
| **`/node`** | Your nodes as operator (`operatorNodes` + `getProvider` per id) |
| **`/node/register`** | Register a new `bytes32` node id; redirects to **`/node/[nodeId]`** |
| **`/node/[nodeId]`** | Node detail + operator controls (payout, metadata, pricing, active) |
| **`/node/[nodeId]/sessions`** | Dev view: `SessionOpened` logs + `getSession` for this node id |
| **`/provider`** | Directory of operators derived from **`NodeRegistered`** logs; stats via **`operatorNodes`** + **`getProvider`** |
| **`/provider/[operator]`** | Operator detail: all nodes, pricing, TEE flags, metadata (**region** via **`/api/provider-metadata`** when URI is HTTP(S)) |
| **`/c`**, **`/c/fund`** | Consumer hub + escrow funding |

The legacy **`/p`** tree was removed; bookmarks should use **`/node`** and **`/provider`**.

## Coinbase Design System (CDS)

The portal shell (`AppToolbar`) and consumer funding UI use **[Coinbase CDS Web](https://cds.coinbase.com/getting-started/installation/)**: **`@coinbase/cds-web`**, **`@coinbase/cds-icons`**, and **`framer-motion@^10`**. The App Router root layout imports the CDS icon font stylesheet plus **`globalStyles`** and **`defaultFontStyles`** before local globals.

**React peers:** `@coinbase/cds-web` may declare React 18 peers while this app tracks React 19. Yarn can emit peer warnings; after upgrades, smoke-test navigation, RainbowKit connect, and CDS components.

## Funding semantics (`/c/fund`)

Consumer deposits call **`SettlementEscrow.depositDot()`** as a **payable** native transfer; the UI labels balances using **internal 18‑decimal** units (`formatUnits(..., 18)`). **`NEXT_PUBLIC_NATIVE_DECIMALS_*`**, **`NEXT_PUBLIC_NATIVE_SYMBOL_*`**, and **`NEXT_PUBLIC_NATIVE_NAME_*`** (per profile in **`.env.example`**) define **`hubConfig.nativeCurrency`**, which feeds **`wallet_addEthereumChain`** and **`internalToNative(..., decimals)`** in **`lib/evm/escrow.ts`**. Those values **must match** **`SettlementEscrow.nativeDotDecimals`** on the deployed contract. **`depositDot`** uses **`hubConfig.nativeCurrency.decimals`** to compute `msg.value` so a stale MetaMask network entry (wrong decimals) cannot silently send the wrong wei amount; fix the wallet metadata so the approval dialog matches.

## Contract ABIs

JSON ABIs live under **`lib/abi/`**. After changing Solidity in `sparkl-solo/contracts`, regenerate:

```bash
yarn abis:sync
```

This runs **`scripts/sync-abis.sh`**, which uses **`SPARKL_SOLO`** (default **`$HOME/sparkl-solo`**) and **`forge build`** / **`forge inspect … abi --json`**.

## SDK layout

| Module | Role |
|--------|------|
| **`lib/chains.ts`** | Resolves active Hub env → RPC, chain id, native currency (env), registry / escrow addresses |
| **`lib/wagmi.ts`** | RainbowKit + wagmi config |
| **`lib/nodeId.ts`** | Parse `bytes32` / padded-address node id input; default id from operator wallet |
| **`lib/providerWatchlist.ts`** | Local portfolio extras keyed by chain + owner (browser) |
| **`lib/evm/registry.ts`** | **`ProviderRegistry`**: reads/writes; **`getAllProviders`** / **`getRegisteredOperatorAddresses`** / **`getOperatorDirectoryEntries`** / **`getOperatorNodeDetailRows`** / **`getOperatorNodes`**; dev list via **`NEXT_PUBLIC_DEV_PROVIDER_ADDRESSES`** |
| **`lib/evm/escrow.ts`** | **`SettlementEscrow`**: balances, deposits, **`openSession(bytes32,…)`**, sessions, **`getSessionIdsForNode`** (log scan), settle helpers |
| **`lib/evm/dotUnits.ts`** | Native ↔ internal DOT (18) using a configurable native decimal count |

### API routes (Next.js)

| Route | Role |
|-------|------|
| **`/api/rpc`** | Optional same-origin JSON-RPC proxy to the hub node |
| **`/api/provider-node-probe`** | Dev helper: HTTP probe against an inference node |
| **`/api/provider-metadata`** | Server-side fetch of provider metadata JSON (**`region`** / **`geo.region`**) to avoid browser CORS |
