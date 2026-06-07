# Portal developer guide

Local development setup for **sparkl-portal** against **Hub EVM** dev chains (including Anvil `31337`). On-chain contracts and Foundry tooling live in the sibling repo **[sparkl-solo](https://github.com/sparkl-network/sparkl-solo)** (`contracts/`).

**Wallets and keys:** [../../docs/Wallets-and-Keys.md](../../docs/Wallets-and-Keys.md) — operator EOA, payout, libp2p `peer_id`, and what signs each on-chain action.

---

## Initial setup

```bash
yarn install
cp .env.example .env.local
```

Edit `.env.local`: set **`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`** ([WalletConnect Cloud](https://cloud.walletconnect.com/)), **`NEXT_PUBLIC_CHAIN_ENV`**, and the **`NEXT_PUBLIC_*`** RPC / contract addresses for that profile (see comments in `.env.example`). Local Anvil defaults assume **`31337`** and **`http://127.0.0.1:8545`** when RPC / chain id are omitted for **`assethub-dev-stub`**.

Restart **`yarn dev`** after changing any **`NEXT_PUBLIC_*`** variable so Next.js rebuilds the client bundle with the new values.

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Coinbase Design System Cursor/IDE skills

These give Cursor deep, first‑party knowledge of the Coinbase Design System and its docs.
From your project root, run:

```bash
# Install Coinbase CDS code + docs skills for Cursor / other agents
npx skills add https://github.com/coinbase/cds --skill cds-code --skill cds-docs
```
### Where to put your SKILL.md

Cursor looks for skills in .cursor/skills/<skill-name>/SKILL.md in your project (or ~/.cursor/skills globally)

## Developer wallets and RPC (`assethub-dev-stub`)

The portal cannot choose accounts inside MetaMask, Coinbase Wallet, etc.—configure those wallets yourself:

1. **Run Anvil** (or compatible node) on the machine that listens on **`8545`** (or your chosen port). Anvil does not advertise a “token ticker” or decimals to your wallet—MetaMask uses the network entry from **Switch network** (from **`NEXT_PUBLIC_NATIVE_*`** in the app) or whatever you added manually.
2. **RPC URL must match where the browser runs.** Reads (`wagmi` / viem) use **`NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB`**. Sends use whatever RPC the wallet uses for **chain ID `31337`**. If you open the site as **`http://192.168.x.x:3000`** from **another device**, **`http://127.0.0.1:8545` resolves on that device**, not your dev PC—set both the wallet’s custom network RPC and **`NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB`** to **`http://<your-dev-machine-LAN-IP>:8545`** (and allow it through the firewall). Run **`anvil --host 0.0.0.0`** if peers off-machine must reach it.
3. **Funded dev accounts:** import Foundry’s default Anvil mnemonic (**`test test test test test test test test test test test junk`**) or a dev private key Anvil prints at startup. **Never use these keys outside local development.**

Use **Switch network** in the toolbar until the wallet is on **`31337`** with that RPC; then connect—the active address should be an Anvil-funded account.

### Shared testnet (`https://rpc-testnet.sparkl.network`)

Pre-Paseo testing uses chain id **`31337`** on **`https://rpc-testnet.sparkl.network`**. Contract addresses are **not** the same as a fresh **`deployments/local.json`** from `launch-local.sh` (deploy order differs). Use **`sparkl-solo/contracts/deployments/testnet.json`** or read from **`SparklNetworkConfig`**:

```bash
cast call 0x59e885FB2E6E0381e09206af00b2436bA1CB0DD6 "modelPriceOracle()(address)" --rpc-url https://rpc-testnet.sparkl.network
```

In **`.env.local`**:

```bash
NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB=https://rpc-testnet.sparkl.network
NEXT_PUBLIC_CHAIN_ID_ASSHUB_DEV_STUB=31337
NEXT_PUBLIC_CHAIN_NAME_ASSHUB_DEV_STUB=Sparkl testnet
NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY=0
# …registry / escrow / modelPriceOracle from contracts/deployments/testnet.json
```

MetaMask and the portal both use **`https://rpc-testnet.sparkl.network`** (chain RPC). Do not point the wallet at the portal **`/api/rpc`** URL. **Fix wallet RPC** registers the HTTPS chain URL from env. The portal skips the same-origin proxy automatically for public HTTPS RPC (CORS is open on the node).

Import a funded test key/mnemonic provided for that environment (not production keys).

**Two RPC URLs (local dev only — do not mix them):**

| Consumer | URL | Purpose |
|----------|-----|---------|
| Portal (`wagmi` `publicClient`) | `http(s)://<portal-host>/api/rpc` when `NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY=1` | Reads, simulate, receipts via Next → `RPC_PROXY_TARGET` |
| MetaMask / wallets | `NEXT_PUBLIC_RPC_URL_ASSHUB_DEV_STUB` (e.g. `http://<LAN-IP>:8545`) | Sign and broadcast — **must hit the chain node**, not the portal |

Enable the proxy (`NEXT_PUBLIC_RPC_USE_SAME_ORIGIN_PROXY=1`, `RPC_PROXY_TARGET=http://127.0.0.1:8545` on the machine running Next) so the **browser tab** can read chain state without CORS to raw `:8545`. Wallets still talk to **`:8545`** directly; you will **not** see `eth_sendTransaction` in Next `[rpc-proxy]` logs after a MetaMask confirm — that is expected.

If **viem** or MetaMask reports **`Failed to fetch`**, check firewall, **`anvil --host 0.0.0.0`**, and that MetaMask’s network RPC is **`…:8545`**, not the portal origin or **`/api/rpc`**. Use **Dev deposit/withdraw (Anvil)** on `/user` only as a local bypass when the extension cannot reach the node. **Fix wallet RPC** registers the chain URL from `.env`, not `/api/rpc`.

---

## Anvil restart: redeploy contracts and refresh the portal

**Restarting Anvil wipes chain state.** Contract addresses, registry entries, and escrow balances from the previous run are gone. The portal will keep old **`NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS_*`** and **`NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_*`** values until you update them—reads and writes may target wrong addresses or empty code.

After every Anvil restart (or whenever you start a fresh Anvil):

1. **Start Anvil** (same host/port as in `.env.local`), for example:

   ```bash
   anvil --host 0.0.0.0
   ```

2. **Redeploy the local stack** with Foundry from **`sparkl-solo/contracts/`**. This matches the **“Local chain: Anvil + deploy script”** flow in [`sparkl-solo/contracts/README.md`](https://github.com/sparkl-network/sparkl-solo/blob/main/contracts/README.md#local-chain-anvil--deploy-script):

   ```bash
   cd ../sparkl-solo/contracts   # sibling under sparkl-network/ (or set SPARKL_SOLO)

   forge script script/DeployLocal.s.sol:DeployLocal \
     --rpc-url http://127.0.0.1:8545 \
     --broadcast
   ```

   Match **`--rpc-url`** to your Anvil URL. Override **`PRIVATE_KEY`** only if you are not using Anvil’s default deployer. The script logs **`MockOracle`**, **`MockERC20` (USDC)**, **`ProviderRegistry`**, and **`SettlementEscrow`** addresses. You can also read **`broadcast/DeployLocal.s.sol/31337/run-latest.json`** under `contracts/` for the latest broadcast.

3. **Update `sparkl-portal/.env.local`** with the new **`NEXT_PUBLIC_OPERATOR_REGISTRY_ADDRESS_*`** and **`NEXT_PUBLIC_SETTLEMENT_ESCROW_ADDRESS_*`** for your chain profile (and any other **`NEXT_PUBLIC_*`** addresses your profile uses—see the contracts README **sparkl-portal `.env`** examples).

4. **If Solidity changed**, refresh ABIs: from **`sparkl-portal`**, run **`yarn abis:sync`** (or copy Forge outputs into **`lib/abi/`** as documented in the main [README](../README.md#contract-abis) and **`contracts/README.md`** § ABI sync).

5. **Restart `yarn dev`** so Next.js reloads **`NEXT_PUBLIC_*`** and rebuilds the client bundle.

---

## Node registration (operator portal)

**Register node** (`/node/register`) binds the operator wallet to a **`nodeId`** on Hub EVM. The operator enters a libp2p **peer id** (`12D3…`) or raw **`bytes32`** hex; the portal derives the canonical on-chain id via **`nodeIdFromLibp2pPeerIdString`** (keccak256 of the libp2p multihash bytes).

**Registration metadata:** `registerNode` may store optional JSON **`metadataURI`** (`peer_id`, `node_id` only). **Moniker is not on-chain** — it is set in sparkl-solo **`[node].moniker`** and exposed via the router tunnel (`GET /status/nodes`). The node directory searches monikers from router status. Legacy rows may use bare HTTP origins or older JSON shapes — see **`parseMetadataUri`** in `lib/nodeBaseUrl.ts`.

**Runtime (separate from commercial registration):** sparkl-solo opens a **WSS subscription** to the router (`[router]` in node TOML) and may submit on-chain heartbeats / usage when configured. Commercial registration is portal-only; the portal does not probe or dial the node.

### Router integration (status + catalog)

The portal merges router data into **Nodes**, **Models**, and **Sessions**:

| Portal proxy | Upstream | Auth |
|--------------|----------|------|
| `GET /api/router-status/nodes` | `GET /status/nodes` | `SPARKL_ROUTER_ADMIN_TOKEN` |
| `GET /api/router-status/nodes/[nodeId]` | `GET /status/nodes/{node_id}` | same (bytes32 hex, optional `0x`) |
| `GET /api/router-catalog/providers` | `GET /v1/catalog/providers` | none |
| `GET /api/router-catalog/features` | `GET /v1/catalog/features` | none |
| `POST /api/router-telemetry/subscribe` | mints WS URL for `GET /status/subscribe` | server uses `SPARKL_ROUTER_ADMIN_TOKEN` |

Live model load (`active_requests/concurrency`, queue depth) uses **WebSocket telemetry** (`useRouterTelemetry`) with HTTP catalog poll as fallback.

**`.env.local`:**

```bash
NEXT_PUBLIC_SPARKL_ROUTER_URL=http://127.0.0.1:3001
SPARKL_ROUTER_URL=http://127.0.0.1:3001
SPARKL_ROUTER_ADMIN_TOKEN=<same as sparkl-router config [portal].admin_token>
```

- **Listing** (registry lifecycle: Active / Inactive / Chilled) is on-chain.
- **Tunnel** (online / degraded / offline) is from router status.
- **Models** capacity (`2/4` load, queue depth, features) is from catalog providers plus live `model_capacity` WS events.

Restart `yarn dev` after changing server env vars.

---

## Related docs

- **[README.md](../README.md)** — prerequisites, routes, CDS, funding semantics, **`yarn abis:sync`**.
- **`sparkl-solo/contracts/README.md`** — one-time **`forge install`**, **`forge build` / `forge test`**, full Anvil deploy output, Paseo, oracle notes.
