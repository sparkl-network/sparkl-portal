<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

**This repo:** Sparkl Portal product notes (routes, registry, env) are in [README.md](./README.md) and below.
<!-- END:nextjs-agent-rules -->

# sparkl-portal — agent guide

**Repository:** [github.com/sparkl-network/sparkl-portal](https://github.com/sparkl-network/sparkl-portal)

Next.js **Hub EVM portal** for node operators, operator directory, and consumers. Reads/writes **`ProviderRegistry`** and **`SettlementEscrow`** via wagmi/viem. Merges **sparkl-router** tunnel status and catalog via same-origin API proxies (`/api/router-status/*`, `/api/router-catalog/*`). Does not embed the Rust node — runtime tunnel is sparkl-solo → router.

## Ecosystem position

| Repo | Relationship |
|------|----------------|
| **sparkl-solo** | Source of truth for Solidity (`contracts/`), deploy scripts, and node HTTP API (`/identity`, `/status`, `/v1/models`) |
| **sparkl-oracle-rates** | Independent service; portal does not run it. Escrow USDC↔DOT paths depend on on-chain rates from `RateSetter` |
| **sparkl-oracle-model-price** | Independent service; portal reads `ModelPriceOracle` for `/model` reference pricing |
| **Workspace** | Clone as sibling `../sparkl-solo` — see [../AGENTS.md](../AGENTS.md) |

```text
Browser → sparkl-portal (Next.js)
            └─ JSON-RPC → Hub EVM (Anvil / Paseo / production)
sparkl-solo/contracts ──abis:sync──► sparkl-portal/lib/abi/
```

## Prerequisites

- **Node.js** 20.19+ or 22.13+ (Yarn 1.x)
- **Yarn** (`yarn install`, `yarn dev`)
- **Foundry `forge`** on `PATH` for `yarn abis:sync`
- Sibling **`sparkl-solo`** checkout (default `../sparkl-solo` under `sparkl-network/`, overridable via `SPARKL_SOLO`)
- For local EVM: **Anvil** on the RPC URL you configure (often `http://127.0.0.1:8545`, chain id `31337`)

## Quick start

```bash
yarn install
cp .env.example .env.local
# Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID and contract addresses (see below)
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

Detailed setup (wallets, RPC proxy, Anvil redeploy): **[docs/DEVELOPER.md](./docs/DEVELOPER.md)**.

## Run with sparkl-solo (local)

1. From **`sparkl-solo`**: `./scripts/launch-local.sh` (or start Anvil + `forge script script/DeployLocal.s.sol:DeployLocal --broadcast`).
2. Copy **`providerRegistry`**, **`settlementEscrow`**, and **`modelPriceOracle`** from `sparkl-solo/contracts/deployments/local.json` into `.env.local`:
   - `NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS_ASSHUB_DEV_STUB`
   - `NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_ASSHUB_DEV_STUB`
   - `NEXT_PUBLIC_MODEL_PRICE_ORACLE_ADDRESS_ASSHUB_DEV_STUB`
3. If Solidity changed: `yarn abis:sync`
4. Restart `yarn dev` after any `NEXT_PUBLIC_*` change.

**Every Anvil restart** wipes chain state — redeploy and refresh env (full checklist in DEVELOPER.md).

### Chain profiles

`NEXT_PUBLIC_CHAIN_ENV` in `.env.example`: `assethub-dev-stub` (local Anvil), `paseo`, `polkadot`. Each profile has matching `NEXT_PUBLIC_RPC_URL_*`, `NEXT_PUBLIC_CHAIN_ID_*`, and contract address vars.

### RPC / MetaMask pitfalls

If writes fail with **Failed to fetch**, enable same-origin proxy (`NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY=1`, `RPC_PROXY_TARGET`) — see DEVELOPER.md. LAN dev requires Anvil `--host 0.0.0.0` and RPC URLs using the dev machine IP, not `127.0.0.1` on a remote browser.

## App routes (product surface)

| Path | Purpose |
|------|---------|
| `/` | Home |
| `/node`, `/node/register`, `/node/[nodeId]` | Operator nodes |
| `/node/[nodeId]/session`, `/node/[nodeId]/session/[sessionId]` | Dev: escrow session index + detail |
| `/operator`, `/operator/[operator]` | Operator directory |
| `/model` | Network reference model pricing (`ModelPriceOracle`) + router catalog capacity |
| `/user/session`, `/user/session/[sessionId]` | Consumer sessions (primary) + detail |
| `/session`, `/session/[sessionId]` | Consumer sessions (short alias) + detail |
| `/user` | User hub + escrow fund/withdraw (`depositDot()` / `withdrawDot()`) |

Registry **`nodeId`** is **`bytes32`** (from libp2p peer id or pasted hex). **Commercial registration:** portal **`/node/register`** (optional `metadataURI` with `peer_id` / `node_id` only — no moniker on-chain). **Moniker:** sparkl-solo **`[node].moniker`** → router WSS auth → portal **`GET /status/nodes`**.

SDK modules: `lib/chains.ts`, `lib/evm/registry.ts`, `lib/evm/escrow.ts`, `lib/evm/modelOracle.ts`, `lib/nodeId.ts`, `lib/router/*` — see [README.md](./README.md). Router env: `NEXT_PUBLIC_SPARKL_ROUTER_URL`, `SPARKL_ROUTER_URL`, `SPARKL_ROUTER_ADMIN_TOKEN`.

## Tests and quality

```bash
yarn test          # vitest (e.g. lib/nodeBaseUrl.test.ts)
yarn lint          # eslint
yarn build         # production build check
```

There is no Playwright e2e suite in-repo; manual smoke: connect wallet on `31337`, register node against a running solo instance, fund escrow on `/user`.

## ABI sync (required when contracts change)

```bash
yarn abis:sync
```

Runs `scripts/sync-abis.sh` with `SPARKL_SOLO` defaulting to `../../sparkl-solo` from `scripts/` (sibling under `sparkl-network/`).

## UI stack notes for agents

- **Coinbase CDS** (`@coinbase/cds-web`) — use CDS skills if generating UI (`npx skills add https://github.com/coinbase/cds --skill cds-code --skill cds-docs`).
- **Next.js 16** — this repo may differ from older Next training data; read `node_modules/next/dist/docs/` for deprecations (see nextjs-agent-rules block above).
- **React 19** with CDS peer warnings possible — smoke-test after dependency bumps.

Funding semantics: `/user` uses **`SettlementEscrow.depositDot()`**; `NEXT_PUBLIC_NATIVE_*` must match **`nativeDotDecimals`** on the deployed escrow — see README § Funding semantics.

## Contributing

1. Branch from `main` on `sparkl-network/sparkl-portal`.
2. For contract-facing changes, coordinate with **sparkl-solo** (ABI sync, address docs).
3. Before PR: `yarn test`, `yarn lint`, and manual path for your change (wallet + Anvil or Paseo).
4. Document env var changes in `.env.example` and **docs/DEVELOPER.md** when operators must act.

**Never commit:** `.env.local`, private keys, WalletConnect secrets in git.

## Related documentation

- **[README.md](./README.md)** — routes, CDS, ABIs, SDK table
- **[docs/DEVELOPER.md](./docs/DEVELOPER.md)** — Anvil, MetaMask, redeploy workflow, node registration
- **[sparkl-solo/AGENTS.md](https://github.com/sparkl-network/sparkl-solo/blob/main/AGENTS.md)** — node + contracts
- **[sparkl-solo/contracts/README.md](https://github.com/sparkl-network/sparkl-solo/blob/main/contracts/README.md)** — deploy output and portal env examples
