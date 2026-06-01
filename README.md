# Sparkl Portal

Web UI for the Sparkl Network, including the Hub EVM 
- **node operator** (`/node`)
- **operator directory** (`/operator`)
- **user** (`/user`)

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
| **`/node/[nodeId]`** | Node detail + operator controls (payout, metadata, active) |
| **`/node/[nodeId]/sessions`** | Dev view: `SessionOpened` logs + `getSession` for this node id |
| **`/operator`** | Directory of operators derived from **`NodeRegistered`** logs; stats via **`operatorNodes`** + **`getProvider`** |
| **`/operator/[operator]`** | Operator detail: all nodes, TEE flags, metadata (**region** via **`/api/operator-metadata`** when URI is HTTP(S)) |
| **`/user`** | User hub + escrow fund/withdraw panel |
| **`/sessions`** | Consumer **My sessions**: list wallet sessions, close (`settleFull`), migrate (settle → `openSession` → activate), show API key again (open sessions only) |

The legacy **`/p`** tree was removed; bookmarks should use **`/node`** and **`/operator`**.

## Coinbase Design System (CDS)

The portal shell (`AppToolbar`) and user funding UI use **[Coinbase CDS Web](https://cds.coinbase.com/getting-started/installation/)**: **`@coinbase/cds-web`**, **`@coinbase/cds-icons`**, and **`framer-motion@^10`**. The App Router root layout imports the CDS icon font stylesheet plus **`globalStyles`** and **`defaultFontStyles`** before local globals.

**React peers:** `@coinbase/cds-web` may declare React 18 peers while this app tracks React 19. Yarn can emit peer warnings; after upgrades, smoke-test navigation, RainbowKit connect, and CDS components.

## Funding semantics (`/user`)

User deposits call **`SettlementEscrow.depositDot()`** as a **payable** native transfer; the UI labels balances using **internal 18‑decimal** units (`formatUnits(..., 18)`). **`NEXT_PUBLIC_NATIVE_DECIMALS_*`**, **`NEXT_PUBLIC_NATIVE_SYMBOL_*`**, and **`NEXT_PUBLIC_NATIVE_NAME_*`** (per profile in **`.env.example`**) define **`hubConfig.nativeCurrency`**, which feeds **`wallet_addEthereumChain`** and **`internalToNative(..., decimals)`** in **`lib/evm/escrow.ts`**. Those values **must match** **`SettlementEscrow.nativeDotDecimals`** on the deployed contract. **`depositDot`** uses **`hubConfig.nativeCurrency.decimals`** to compute `msg.value` so a stale MetaMask network entry (wrong decimals) cannot silently send the wrong wei amount; fix the wallet metadata so the approval dialog matches.

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
| **`lib/operatorWatchlist.ts`** | Local portfolio extras keyed by chain + owner (browser) |
| **`lib/evm/registry.ts`** | **`ProviderRegistry`**: reads/writes; **`getAllRegisteredNodes`** / **`getRegisteredOperatorAddresses`** / **`getOperatorDirectoryEntries`** / **`getOperatorNodeDetailRows`** / **`getOperatorNodes`**; dev list via **`NEXT_PUBLIC_DEV_OPERATOR_NODE_ADDRESSES`** |
| **`lib/evm/escrow.ts`** | **`SettlementEscrow`**: balances, deposits, **`openSession(bytes32,…)`**, sessions, **`getSessionIdsForNode`** / **`getSessionIdsForUser`** (log scan), settle helpers |
| **`lib/evm/sessionSettle.ts`** | **`suggestSettleSplit`**, **`assertSettleFullValid`** (pre-flight for **`settleFull`**) |
| **`lib/router/activate.ts`** | Activate message + router URL helpers |
| **`lib/router/activateClient.ts`** | Wallet-signed activate via **`/api/router-activate`** |
| **`lib/evm/dotUnits.ts`** | Native ↔ internal DOT (18) using a configurable native decimal count |

### API routes (Next.js)

| Route | Role |
|-------|------|
| **`/api/rpc`** | Optional same-origin JSON-RPC proxy to the hub node |
| **`/api/operator-node-probe`** | Dev helper: HTTP probe against an inference node |
| **`/api/operator-metadata`** | Server-side fetch of provider metadata JSON (**`region`** / **`geo.region`**) to avoid browser CORS |
| **`/api/router-activate`** | Proxies **`POST /sessions/{id}/activate`** to **`SPARKL_ROUTER_URL`** (rate-limited) |

### Session recovery (lost vs compromised API keys)

See **[docs/SESSION_RECOVERY.md](docs/SESSION_RECOVERY.md)**. Summary:

- **Lost key:** **`/sessions`** → “Show API key again” on an **open** session (wallet-signed activate). Same session id; deterministic nodes may return the same **`sk_`**.
- **Compromised key:** **Migrate** — **`settleFull`** old session, **`openSession`** new id, activate → new API key. Do **not** re-activate the old session.
- **Close:** **`settleFull`** remits lock to provider credit + your internal DOT balance; session becomes settled on-chain.

Env: **`NEXT_PUBLIC_SPARKL_ROUTER_URL`** (UI) and **`SPARKL_ROUTER_URL`** (server proxy). Optional Anvil manual path: open session → close → open new → activate (documented in **`docs/SESSION_RECOVERY.md`**).
