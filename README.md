# Sparkl Portal

Web UI for the Sparkl Network, including the Hub EVM 
- **node operator** (`/node`)
- **provider directory** (`/provider`)
- **consumer** (`/c`)

On-chain contracts and Foundry tooling live in the sibling repo [sparkl-solo](https://github.com/sparkl-network/sparkl-solo).

**Coding agents:** see **[AGENTS.md](./AGENTS.md)** for ecosystem layout, local Anvil workflow, tests, and contribution.

Registry **`nodeId`** values are **`bytes32`** on chain (e.g. Substrate **PeerId** hash). The UI accepts full 32-byte hex or string, see **`lib/nodeId.ts`**.

## Prerequisites

- Node.js **20.19+** or **22.13+** (recommended; Yarn may warn on older minors).
- Yarn **1.x**.
- Foundry **`forge`** on `PATH` if you run ABI sync.

## Setup and local development

**[docs/DEVELOPER.md](docs/DEVELOPER.md)** — `yarn install`, `.env.local`, Anvil/MetaMask/RPC notes, **`yarn dev`**, and **redeploying `DeployLocal` after every Anvil restart** (update portal env + ABIs).

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

This runs **`scripts/sync-abis.sh`**, which uses **`SPARKL_SOLO`** (default: sibling **`../sparkl-solo`** under **`sparkl-network/`**) and **`forge build`** / **`forge inspect … abi --json`**.

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
